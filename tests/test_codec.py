import ast,io,json,sys,time,shutil,zlib
from pathlib import Path
import numpy as np
from PIL import Image
import elyx_native as elyx

out=Path('D:/Imágenes')/('ElyX_nativo_'+time.strftime('%Y%m%d_%H%M%S'));out.mkdir(exist_ok=False)
for name in ['codigo','pruebas','variantes']:(out/name).mkdir()
for name in ['elyx_native.py','probar_nativo.py']:shutil.copy2(Path(__file__).parent/name,out/'codigo'/name)
print('RESULTADOS',out,flush=True)
rng=np.random.default_rng(17012026);checks=[]
for w,h,tile in [(1,1,32),(17,13,32),(65,71,32),(1024,20,512)]:
 a=rng.integers(0,256,(h,w,3),dtype=np.uint8);p=out/'pruebas'/f'rgb_{w}_{h}.png';Image.fromarray(a).save(p)
 for step in [1,8]:
  enc=out/'pruebas'/f'rgb_{w}_{h}_s{step}.elx';elyx.encode(p,enc,step,tile);decoded,header=elyx.decode(enc)
  assert decoded.size==(w,h)
  if step==1:assert decoded.tobytes()==a.tobytes()
  checks.append(dict(size=[w,h],step=step,exact=decoded.tobytes()==a.tobytes(),passed=True))
p=out/'pruebas'/'rgb_65_71_s1.elx';b=p.read_bytes()
for name,data in [('truncado',b[:-5]),('firma',b'X'+b[1:]),('datos_sobrantes',b+b'x'),('payload',b[:-1]+bytes([b[-1]^128])),('cabecera_excesiva',elyx.MAGIC+b'\xff'*4)]:
 path=out/'pruebas'/f'{name}.elx';path.write_bytes(data)
 try:elyx.decode(path)
 except (ValueError,zlib.error,KeyError):checks.append(dict(rejected=name,passed=True))
 else:raise AssertionError(f'No rechazó {name}')
(out/'pruebas'/'validacion.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
print('PRUEBAS OK',len(checks),flush=True)

photo=Path('D:/Imágenes/Peyto_Lake_original_verificado_20261017_174855.jpg');src=Image.open(photo).convert('RGB');W,H=src.size
previous=Path('D:/Imágenes/ELYX_resultados_20261017_174854/codigo/benchmark_ejecutado.py')
tree=ast.parse(previous.read_text(encoding='utf-8'));import math
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['box7','metrics']],type_ignores=[]),'<previous-metrics>','exec'))
rows=[]
for step in [1,8]:
 p=out/'variantes'/f'Peyto_s{step}.elx';t=time.perf_counter();header=elyx.encode(photo,p,step);enc_s=time.perf_counter()-t
 t=time.perf_counter();decoded,meta=elyx.decode(p);dec_s=time.perf_counter()-t
 exact=elyx.pixel_hash(decoded)==elyx.pixel_hash(src)
 m=dict(psnr_rgb_db=None,ssim_y=1.,mse_rgb=0.) if exact else metrics(decoded)
 png=out/'variantes'/f'Peyto_s{step}_decodificada.png';decoded.save(png,compress_level=3);decoded.close()
 row=dict(step=step,width=W,height=H,bytes=p.stat().st_size,MiB=p.stat().st_size/1048576,encode_s=enc_s,decode_s=dec_s,exact_pixels=exact,**m,file=str(p),decoded_png=str(png))
 rows.append(row);(out/'resultados.json').write_text(json.dumps(rows,indent=2),encoding='utf-8');print(json.dumps(row),flush=True)
 assert step!=1 or exact

text=['# ElyX 0.1','',f'Proyecto y pruebas: `{out}`','',
'Prototipo de formato/códec RGB de 8 bits con datos transformados propios. No encapsula WebP, AVIF, JPEG ni JPEG XL. No es un algoritmo de compresión inventado desde cero: combina herramientas conocidas con una especificación y un recorrido de reconstrucción propios. La etapa de entropía utiliza DEFLATE mediante zlib, no un rANS nuevo.','',
'Codificador y decodificador: `codigo/elyx_native.py`. Dependencias: Python, NumPy y Pillow. Pillow abre la entrada y genera el PNG de inspección; no codifica la carga útil ELYX. Las pruebas importan solamente las dos funciones de métrica del benchmark anterior, sin ejecutarlo.','',
'## Formato binario','',
'- Firma de 8 bytes: `45 4C 59 58 0D 0A 1A 0A`.',
'- Longitud de cabecera JSON uint32 little endian, seguida de UTF-8. Campos: versión, dimensiones, RGB8, tesela, niveles, paso, herramientas, SHA-256 de los píxeles RGB de entrada.',
'- Teselas en orden de filas, tamaño predeterminado 512. Se replican bordes hasta múltiplo de 8 y se recortan al reconstruir: no se cambia la resolución.',
'- Transformación reversible YCoCg-R; wavelet entera CDF 5/3 de tres niveles. Paso 1 sin pérdida; pasos mayores cuantizan uniformemente las bandas de detalle y dejan LL intacta.',
'- Coeficientes con signo de 16 bits, zigzag a uint16, planos de bytes bajo/alto en orden canal/fila/columna, comprimidos con zlib nivel 6.',
'- Cada tesela lleva longitud de carga uint32 y CRC32 de los planos de bytes descomprimidos. El decodificador limita cabeceras, dimensiones y expansión; rechaza truncados, CRC incorrecto y datos sobrantes. SHA-256 de píxeles verificado en modo sin pérdida.',
'','## Validación','',f'{len(checks)} comprobaciones aprobadas: tamaños impares, imagen de un píxel, varias teselas, pasos 1 y 8, identidad de píxeles en paso 1 y rechazo de cinco clases de archivo inválido. No es una auditoría de seguridad ni un fuzzing exhaustivo.','',
'Foto: Balon Greyjoy, Canon EOS R5, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:20250905_Canon_R5_Peyto_Lake-6145.jpg), [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Cambios: transformada/codificación y cuantización en paso 8. Todas las imágenes conservan 8192×5464. La fidelidad se mide contra el JPEG procesado decodificado, no contra el RAW.','',
'| Paso | MiB | PSNR RGB | SSIM Y | Encode s | Decode s | Píxeles idénticos |','|---|---:|---:|---:|---:|---:|---|']
for r in rows:text.append(f"| {r['step']} | {r['MiB']:.4f} | {'infinito' if r['psnr_rgb_db'] is None else format(r['psnr_rgb_db'],'.4f')} | {r['ssim_y']:.6f} | {r['encode_s']:.3f} | {r['decode_s']:.3f} | {'sí' if r['exact_pixels'] else 'no'} |")
text+=['','Los tiempos incluyen apertura de la entrada y comprobaciones de integridad; excluyen escritura del PNG y cálculo de PSNR/SSIM. SSIM Y usa las mismas ventanas 7×7 y franjas validadas en el experimento anterior. Son medidas de una ejecución.','',
'El objetivo alcanzado es tener un archivo ELYX real con reconstrucción implementada. Estas dos muestras no prueban superioridad frente a AVIF/JXL/WebP, ni constituyen una curva de calidad equivalente. Las teselas independientes pueden producir costuras en modo con pérdida: requieren evaluación. No hay soporte para transparencia, HDR, profundidad mayor a 8 bits, animación, metadatos EXIF/ICC ni apertura directa en Prisma u otros visores. El PNG decodificado permite inspección con los visores existentes.','',
'## Ejecutar','',
'```powershell',f"& '{sys.executable}' '{out/'codigo'/'elyx_native.py'}' encode 'entrada.png' 'salida.elx' --step 1",f"& '{sys.executable}' '{out/'codigo'/'elyx_native.py'}' decode 'salida.elx' 'reconstruida.png'",'```','',
'Las salidas se crean en modo exclusivo: si el destino existe, la operación falla. No se sobrescriben archivos existentes. Un error durante escritura puede dejar una salida parcial nueva; el prototipo no tiene escritura atómica. Cada ejecución de `probar_nativo.py` crea una carpeta nueva.']
(out/'README.md').write_text('\n'.join(text)+'\n',encoding='utf-8')
deliver=Path.cwd()/'outputs';deliver.mkdir(exist_ok=True);shutil.copy2(out/'README.md',deliver/'ElyX_nativo_informe.md');shutil.copy2(out/'codigo'/'elyx_native.py',deliver/'elyx_native_0_1.py')
print('COMPLETE',out,flush=True)
