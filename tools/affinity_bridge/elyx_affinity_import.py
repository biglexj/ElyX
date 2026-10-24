"""ElyX 0.1 -> lossless TIFF -> new Affinity document via its local scripting MCP.
No existing document is edited or saved. No existing output is overwritten.
"""
import argparse,datetime,hashlib,json,shutil,subprocess,sys,time
from pathlib import Path
from PIL import Image
import elyx_native

HERE=Path(__file__).resolve().parent
NODE=Path('C:/Users/biglexj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')

def import_elyx(source,output_root,open_document=False):
 source=Path(source).resolve()
 if source.suffix.lower()!='.elx':raise ValueError('Selecciona un archivo .elx de ElyX nativo 0.1')
 output_root=Path(output_root);output_root.mkdir(exist_ok=True,parents=True)
 folder=output_root/('ElyX_Affinity_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f'));folder.mkdir(exist_ok=False)
 print('Decodificando ElyX...',flush=True);t=time.perf_counter();image,header=elyx_native.decode(source);decode_s=time.perf_counter()-t
 target=folder/(source.stem+'.tiff')
 with target.open('xb') as f:image.save(f,format='TIFF',compression='tiff_deflate')
 reconstructed_hash=elyx_native.pixel_hash(image)
 with Image.open(target) as check:
  assert check.mode=='RGB' and check.size==image.size and elyx_native.pixel_hash(check)==reconstructed_hash
 record=dict(source=str(source),tiff=str(target),dimensions=list(image.size),pixel_sha256=reconstructed_hash,TIFF_identical_to_ELX_decode=True,decode_s=decode_s,header=header,affinity_opened=False)
 image.close()
 script="const { Document } = require('/document.js');\nconst path="+json.dumps(str(target))+";\nconst doc=Document.load(path);\nconsole.log(JSON.stringify({session:String(doc.sessionUuid),title:doc.title,width:doc.widthPixels,height:doc.heightPixels,path:doc.path}));\n"
 (folder/'Abrir_TIFF_en_Affinity.js').write_text(script,encoding='utf-8')
 args=folder/'abrir-argumentos.json';args.write_text(json.dumps(dict(script=script)),encoding='utf-8')
 (folder/'verificacion.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
 if open_document:
  print('Abriendo un documento nuevo en Affinity...',flush=True)
  result=subprocess.run([str(NODE),str(HERE/'affinity-mcp.cjs'),'execute_script',str(args)],cwd=folder,capture_output=True,text=True,encoding='utf-8',timeout=45)
  (folder/'respuesta-affinity.json').write_text(result.stdout+'\n'+result.stderr,encoding='utf-8')
  if result.returncode:raise RuntimeError('Se creó el TIFF, pero no se pudo conectar con Affinity. Revisa respuesta-affinity.json o abre el TIFF manualmente.')
  response=json.loads(result.stdout)
  if response.get('isError'):raise RuntimeError('Affinity rechazó la apertura; el TIFF queda disponible. '+str(response)[:1000])
  text=''.join(c.get('text','') for c in response.get('content',[]))
  states=[]
  for line in text.splitlines():
   try:
    state=json.loads(line)
    if isinstance(state,dict) and 'session' in state and 'width' in state:states.append(state)
   except json.JSONDecodeError:pass
  if not states:
   record['affinity_error']=text.strip()
   (folder/'verificacion.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
   if 'PERMISSION_DENIED' in text or 'NOT_ALLOWED' in text:
    raise RuntimeError('Affinity ha denegado el acceso de scripts al TIFF. Autoriza la carpeta en sus ajustes o abre el TIFF manualmente. El .elx y el TIFF permanecen intactos.')
   raise RuntimeError('Affinity no confirmó la apertura: '+text[:1000])
  state=states[-1]
  if [state['width'],state['height']]!=record['dimensions']:raise RuntimeError('Dimensiones inesperadas en Affinity')
  record['affinity_opened']=True;record['affinity_document']=state
 (folder/'verificacion.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(record,ensure_ascii=False,indent=2),flush=True)
 return folder,record

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('input',nargs='?');p.add_argument('--output-root',type=Path,default=Path('D:/Imágenes/ELYX_nativo_20261017_181309/Affinity'));p.add_argument('--convert-only',action='store_true');p.add_argument('--open-in-affinity',action='store_true',help='Opcional: requiere permisos de archivos en Affinity y MCP activo');a=p.parse_args()
 if not a.input:
  import tkinter as tk
  from tkinter import filedialog
  root=tk.Tk();root.withdraw();a.input=filedialog.askopenfilename(title='Abrir ElyX en Affinity',filetypes=[('ElyX','*.elx')]);root.destroy()
 if a.input:import_elyx(a.input,a.output_root,a.open_in_affinity and not a.convert_only)
