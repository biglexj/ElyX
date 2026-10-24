# ELYX: comparación reproducible a resolución original

Resultados: `D:\Imágenes\ELYX_resultados_20261017_174854`

Fotografía de Balon Greyjoy, Canon EOS R5, procesada con Adobe Photoshop Lightroom Classic 14.4 según EXIF. JPEG, no RAW. Original descargado de [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:20250905_Canon_R5_Peyto_Lake-6145.jpg), [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Las variantes son obras transformadas bajo esa licencia; cambios: recodificación y, en ELYX experimental, filtrado.

**8192 × 5464 = 44,761,088 píxeles.** Original: 21,876,842 bytes (20.863382 MiB). SHA-1 verificado contra API de Commons. El archivo ya existente y la descarga nueva tienen idéntico SHA-256: `f9f4688c4b89c23f912d1cd3d22289486bfb5d591f4c54280b4a9efdadb4d630`. Se conservaron los dos.

## Qué se probó

- JPEG original como referencia decodificada RGB de 8 bits; su PSNR es infinito por definición y su SSIM es 1, no demuestra ausencia de pérdidas respecto al sensor.
- WebP libwebp 1.6.0, método 4. Q100 sigue siendo WebP con pérdida: no se activó lossless.
- AVIF libavif 1.4.2, velocidad 6, máximo 2 hilos, submuestreo 4:2:0. La versión de libavif no identifica por sí sola el codificador AV1 interno.
- JPEG XL mediante ImageMagick con libjxl 0.12.0, esfuerzo 5, 2 hilos, límites de memoria/mapa de ImageMagick 512 MiB/1 GiB. Conversión con pérdida, no reconstrucción reversible del JPEG original.
- ELYX experimental: operaciones de píxeles extraídas del TSX local, CDF 5/3 de imagen completa, Stein con rama guiada por verde, estabilización cromática secuencial, tau=5, cflScale=2 y alphaTau=2. Se mantuvieron las operaciones y redondeos JavaScript; se omitieron mapas visuales y estimadores de tamaño. Se verificó identidad tau=0, cflScale=1 en un recorte de control. La foto es opaca: esta prueba no valida transparencia.
- El prefiltro se codificó con la misma biblioteca y método WebP que el control. El contenedor conserva RIFF/WEBP y añade JSON ELYX, con los bytes de ese chunk incluidos. No hay flujo de coeficientes ni decodificador ELYX independiente. El empaquetado usa los mismos campos TSX; no se exige identidad binaria con Canvas, cuyo backend/configuración no se controló.

Prefiltro de imagen completa: 10.410 s. PSNR del prefiltro solo: 43.57401 dB; SSIM Y: 0.9853219. La reducción de ruido modifica píxeles; no se presupone que todo coeficiente eliminado sea ruido invisible.

## Mediciones

Todos los candidatos se decodificaron y se comprobó exactamente 8192 × 5464. PSNR sobre todos los canales RGB, rango 255, frente al JPEG decodificado. SSIM sobre luminancia gamma BT.601 Y′=0,299R+0,587G+0,114B, ventanas uniformes 7×7, covarianza muestral, K1=0,01/K2=0,03, sin reducción de resolución: se promedian todas las ventanas válidas, excluyendo 3 píxeles externos por lado. Los bloques de cálculo llevan halo y no introducen costuras. No es MS-SSIM ni SSIM RGB. Se validó la implementación por franjas contra el cálculo directo de todas las ventanas en una imagen de control que cruza los límites de franja: diferencia inferior a 1e-12; también se verificó identidad. Evidencia en `datos/validacion_metricas.json`. No se aplicó transformación ICC adicional; la referencia es la decodificación local.

Los tiempos son mediciones de pared de una ejecución, con otras aplicaciones abiertas: orientativos, no una prueba estadística de rendimiento. Encode excluye las métricas; ELYX añade por separado el prefiltro reutilizable. Para JXL, Encode incluye además el proceso externo y la lectura/decodificación del JPEG de entrada, mientras Pillow recibe RGB ya decodificado. Decode incluye apertura, decodificación y conversión RGB; JXL incluye además el proceso externo y un PPM temporal. Sus tiempos no son comparables directamente con las llamadas internas de Pillow. El tiempo del prefiltro incluye escritura RGBA, pero excluye lectura inicial y paso RGBA a RGB. JPEG original no tiene tiempo de codificación medido.

Decodificación del JPEG original, tres lecturas con caché del sistema: [0.312360500000068, 0.2840777999954298, 0.28279699999984587]; mediana 0.284 s. Los candidatos excluyen EXIF/ICC del original; el tamaño del JPEG incluye sus metadatos. La comparación de la decodificación JPEG de Pillow y la usada por ImageMagick arrojó diferencia RGB máxima de 0 niveles; MSE 0.000000000.

| Variante | Q | Bytes | MiB | PSNR RGB dB | SSIM Y | Encode s | Prefiltro s | Decode s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| original_jpeg |  | 21876842 | 20.8634 | — | 1.000000 | — | 0.000 | — |
| webp | 72 | 1889510 | 1.8020 | 37.907 | 0.960786 | 5.635 | 0.000 | 0.701 |
| webp | 78 | 2197654 | 2.0958 | 38.577 | 0.965350 | 5.042 | 0.000 | 0.655 |
| webp | 86 | 3696440 | 3.5252 | 40.396 | 0.975341 | 19.669 | 0.000 | 0.682 |
| webp | 95 | 8577516 | 8.1802 | 43.858 | 0.986787 | 23.717 | 0.000 | 1.043 |
| webp | 100 | 13110794 | 12.5034 | 45.803 | 0.992614 | 27.658 | 0.000 | 0.882 |
| elyx_webp | 72 | 1748996 | 1.6680 | 37.409 | 0.955983 | 6.550 | 10.410 | 0.927 |
| elyx_webp | 78 | 2044586 | 1.9499 | 38.009 | 0.960216 | 5.459 | 10.410 | 0.708 |
| elyx_webp | 86 | 3378976 | 3.2224 | 39.405 | 0.969008 | 19.441 | 10.410 | 0.680 |
| elyx_webp | 95 | 7247692 | 6.9119 | 41.360 | 0.977038 | 22.118 | 10.410 | 0.831 |
| elyx_webp | 100 | 11046570 | 10.5348 | 42.128 | 0.980237 | 24.448 | 10.410 | 0.772 |
| avif | 50 | 1436413 | 1.3699 | 38.251 | 0.964315 | 5.941 | 0.000 | 0.481 |
| avif | 65 | 2359254 | 2.2500 | 39.993 | 0.974366 | 6.012 | 0.000 | 0.488 |
| avif | 80 | 4343778 | 4.1425 | 42.046 | 0.982909 | 7.144 | 0.000 | 0.477 |
| jxl | 70 | 1908898 | 1.8205 | 38.953 | 0.968233 | 9.770 | 0.000 | 2.010 |
| jxl | 85 | 3441356 | 3.2819 | 41.182 | 0.980569 | 6.988 | 0.000 | 1.817 |
| jxl | 95 | 8653028 | 8.2522 | 45.246 | 0.992709 | 11.763 | 0.000 | 2.389 |
| elyx_webp | 91 | 4949474 | 4.7202 | 40.597 | 0.975161 | 24.512 | 10.410 | 1.359 |
| elyx_webp | 90 | 4480684 | 4.2731 | 40.249 | 0.973157 | 21.289 | 10.410 | 0.805 |
| avif | 68 | 2846747 | 2.7149 | 40.622 | 0.977212 | 6.828 | 0.000 | 0.504 |
| avif | 67 | 2710574 | 2.5850 | 40.454 | 0.976469 | 6.779 | 0.000 | 0.550 |
| jxl | 80 | 2670276 | 2.5466 | 40.200 | 0.976083 | 7.683 | 0.000 | 2.470 |
| jxl | 81 | 2798781 | 2.6691 | 40.368 | 0.976892 | 6.678 | 0.000 | 1.866 |
| elyx_webp | 77.85 | 2044246 | 1.9495 | 38.003 | 0.960235 | 5.077 | 10.410 | 0.620 |

## Puntos de fidelidad cercana

Se buscaron puntos realmente codificados próximos al PSNR de WebP Q86 (40.3963 dB). No se equipararon los números Q entre códecs. La proximidad numérica no garantiza identidad perceptual; se informa también SSIM y la tolerancia usada para una coincidencia conjunta: ±0,25 dB y ±0,003 SSIM.

| Variante | Q | MiB | PSNR | ΔPSNR | SSIM Y | ΔSSIM | Ahorro vs WebP Q86 | Coincide con ambas tolerancias |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| webp | 86 | 3.5252 | 40.3963 | +0.0000 | 0.975341 | +0.000000 | 0.00% | sí |
| elyx_webp | 90 | 4.2731 | 40.2486 | -0.1476 | 0.973157 | -0.002184 | -21.22% | sí |
| avif | 67 | 2.5850 | 40.4545 | +0.0582 | 0.976469 | +0.001128 | 26.67% | sí |
| jxl | 81 | 2.6691 | 40.3681 | -0.0281 | 0.976892 | +0.001550 | 24.28% | sí |

## Conclusiones de esta fotografía

- elyx_webp Q90: 4.2731 MiB, diferencia de -0.1476 dB y -0.002184 SSIM respecto a WebP Q86; aumento de tamaño de 21.22%. Codificación total medida: 31.700 s, frente a 19.669 s de WebP. Cumple las dos tolerancias conjuntas adoptadas.
- avif Q67: 2.5850 MiB, diferencia de +0.0582 dB y +0.001128 SSIM respecto a WebP Q86; ahorro de tamaño de 26.67%. Codificación total medida: 6.779 s, frente a 19.669 s de WebP. Cumple las dos tolerancias conjuntas adoptadas.
- jxl Q81: 2.6691 MiB, diferencia de -0.0281 dB y +0.001550 SSIM respecto a WebP Q86; ahorro de tamaño de 24.28%. Codificación total medida: 6.678 s, frente a 19.669 s de WebP. Cumple las dos tolerancias conjuntas adoptadas.

La configuración predeterminada del comparador produce ELYX/WebP Q77,85 de 1.9495 MiB, PSNR 38.0026 dB y SSIM 0.960235. Compararla directamente con WebP Q86 mezcla el prefiltro con una bajada del parámetro de calidad. No demuestra una ventaja de un códec nativo.

El prefiltro actual modifica textura y crominancia y cuesta tiempo adicional. Su utilidad debe juzgarse según fidelidad objetivo y preferencia visual. No hay un códec ELYX independiente que permita medir una ventaja frente a AVIF/JXL; los archivos ELYX medidos aquí siguen siendo WebP.

## Hallazgos del código previo

1. `elyx_affinity_bridge.py` reduce ancho y alto a 1/4: su WebP base sería 2048×1366, con 1/16 de los píxeles. Añade un residual de luminancia incompleto sin implementar decode, sin conservar la banda baja necesaria ni reconstruir RGB completo. No cumple la prueba sin reducir resolución y quedó excluido.
2. `elyx_benchmark_8k.py` es una adaptación por teselas y no reproduce la rama guiada por verde ni la estabilización cromática del TSX. Su tiempo mezcla codificación y métrica. Se archivó como evidencia, pero no se usó como implementación de esta prueba.
3. El TSX usa WebP Q86 para el control y Q77,85 para ELYX con parámetros predeterminados. Se midió también Q77,85 exacto, además de controles a Q iguales para aislar el filtrado.
4. En el TSX, `webpPsnr` procede de una fórmula según Q; `elyxPsnr` evalúa los píxeles del prefiltro antes de recodificar a WebP. No son medidas equivalentes de los archivos finales. Los valores de este informe se calcularon después de decodificar cada candidato.
5. `calculateRansBits` estima entropía: no escribe rANS. El desglose base/residual/alpha/CfL usa porcentajes estimados del tamaño final; no describe secciones binarias implementadas. `simulate8K` extrapola tamaños: se excluyó por completo.
6. La estabilización cambia R y B manteniendo G: eso no garantiza conservar exactamente la luminancia ponderada, aunque el comentario del código lo afirme. Las funciones Oklab están definidas, pero este recorrido de píxeles trabaja sobre RGB y guía de luminancia entera.

## Reproducir y revisar

Código original y hashes en `codigo/` y `datos/entorno.json`. Ejecución principal archivada: `codigo/benchmark_ejecutado.py`; pasos complementarios: `codigo/finalizar.py`. Se requiere Python con Pillow/NumPy, Node y ImageMagick con JXL. La configuración de rutas está en el código. Cada ejecución principal crea una carpeta nueva y una descarga nueva; no cambia los scripts personales.

```powershell
& 'C:\Users\biglexj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' 'D:\Imágenes\ELYX_resultados_20261017_174854\codigo\benchmark_ejecutado.py'
& 'C:\Users\biglexj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' 'D:\Imágenes\ELYX_resultados_20261017_174854\codigo\finalizar.py' 'RUTA_DE_LA_NUEVA_CARPETA_DE_RESULTADOS'
```

CSV y JSON incluyen tamaños exactos, tiempos separados, métricas y SHA-256. Variantes en `variantes/`; recortes 1:1 de 512×512 en `inspeccion/`, nunca usados para reducir la imagen del benchmark. Los temporales propios RGBA/PPM se retiraron al terminar; el prefiltro completo queda como PNG sin pérdida adicional.

Una sola fotografía no permite proclamar superioridad general. PSNR/SSIM miden fidelidad a este JPEG procesado, no calidad respecto al RAW ni preferencia humana. Hace falta un corpus de fotos con texturas, ruido, degradados y escenas distintas, seguido de revisión visual ciega para validar una decisión de producto.
