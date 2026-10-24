# ElyX → Affinity

El archivo `.elx` nativo requiere el decodificador ElyX. La extensión por sí sola no permite a Affinity analizar los datos.

## Uso con apertura manual

1. Extrae el paquete en una carpeta nueva.
2. Haz doble clic en `Abrir_ElyX_en_Affinity.cmd` y selecciona un `.elx`. También puedes arrastrarlo sobre el lanzador.
3. Se creará una carpeta nueva dentro de `D:\Imágenes\ELYX_nativo_20261017_181309\Affinity`, con un TIFF y su verificación.
4. En Affinity, utiliza Archivo → Abrir y selecciona ese TIFF. Para volver a la carpeta desde el explorador puedes pegar la ruta que indica el conversor.

El TIFF mantiene todos los píxeles reconstruidos y las dimensiones. Su compresión DEFLATE no añade pérdida. Si el `.elx` ya estaba cuantizado, la conversión no recupera el detalle que perdió antes.

Por preferencia de Biglex, el lanzador convierte y deja la apertura en manos del usuario. No modifica documentos abiertos ni cambia permisos. No sobrescribe archivos existentes. Un fallo puede dejar una salida parcial nueva.

## Resultado comprobado

Se decodificó la foto de Peyto de 8192×5464 desde `Peyto_s8.elx`, se guardó como TIFF y se volvió a leer. Dimensiones y SHA-256 de píxeles RGB coinciden exactamente con la salida del decodificador ElyX:

`cb26f86554bac47568eb6e49d3b1f16c85c7f75a543ad581fe25873426dc660f`

La apertura mediante el SDK de Affinity 3.3.1.4940 respondió `PERMISSION_DENIED`. No se confirmó apertura ni visualización dentro de Affinity. El TIFF queda disponible para apertura manual. El error inicial del usuario al abrir `.elx` y el rechazo de permisos del SDK son problemas distintos.

## Qué incluye el paquete

- `elyx_native.py`: codificador y decodificador ElyX 0.1.
- `elyx_affinity_import.py`: conversión y comprobación de TIFF; selector de archivo cuando no se recibe una ruta.
- `Abrir_ElyX_en_Affinity.cmd`: lanzador para esta máquina Windows.
- `Abrir_TIFF_de_ElyX.js`: script opcional para seleccionar y abrir el TIFF dentro de Affinity. No decodifica `.elx`; sigue sujeto a permisos de la aplicación. No se instaló en su biblioteca ni se probó el selector interactivo.
- `affinity-mcp.cjs`: cliente local opcional; solo se utiliza con `--open-in-affinity`. Requiere MCP y acceso a archivos habilitados por el usuario.

Se utiliza el Python con Pillow/NumPy ya disponible en esta máquina. Para otro equipo hay que adaptar la ruta de Python del lanzador. El Node solo es necesario para la opción de apertura automática. No se añadió ningún servicio persistente.

## Regresar a ElyX

Desde Affinity se puede exportar una imagen RGB de 8 bits a PNG o TIFF y codificarla mediante `elyx_native.py encode entrada.png salida.elx --step 1`. Es una imagen aplanada: ElyX 0.1 no conserva capas, transparencia, perfiles ICC ni metadatos de Affinity. Conserva el proyecto editable de Affinity por separado.

## Ingeniería propuesta para la siguiente versión

1. Congelar ElyX 0.1 y entregar al visor el decodificador, la especificación y archivos de prueba. La integración debe comprobar firma, versión y herramientas; registrar `.elx` no basta. Un backend gráfico no sustituye la decodificación del archivo.
2. Medir el coste por banda y canal. Comparar la codificación actual de planos de bytes con representación de ceros y magnitudes, predicción local y codificación de entropía por contextos. Rice, rANS o codificación aritmética son candidatos que hay que medir; cambiar solo zlib por otro compresor general es un control, no una garantía de competitividad.
3. Probar cuantización separada por canal y banda, asignación adaptativa de bits y, posteriormente, una ruta de transformada por bloques para fotografía. Mantener una ruta reversible para pérdida cero y gráficos. Evitar suavizados que cambien color o textura antes de medir el archivo final.
4. Comparar cada cambio con un corpus y puntos de PSNR/SSIM cercanos, inspección visual, tiempo de codificación/decodificación y memoria. Aislar cada cambio; las mejoras de entropía deben producir exactamente los mismos píxeles reconstruidos que su control.

Son propuestas de diseño; no se implementaron ni se atribuyen ganancias nuevas. Una implementación optimizada en Rust/C++ puede ayudar a velocidad y consumo, pero no demuestra por sí sola mejor compresión.

Como referencia de ingeniería, JPEG XL combina herramientas como modelado de contexto y cuantización adaptativa: [white paper del comité JPEG](https://ds.jpeg.org/whitepapers/jpeg-xl-whitepaper.pdf). No se pretende implementar todo JPEG XL ni se promete superarlo.

Foto: Balon Greyjoy, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:20250905_Canon_R5_Peyto_Lake-6145.jpg), [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Variante transformada: decodificación de ElyX con pérdida y conversión a TIFF sin pérdida adicional.

## Segunda comprobación de permisos y variante sin pérdida

Después de que Biglex indicara que había autorizado Imágenes, la lectura directa y la carga del TIFF mediante MCP continuaron devolviendo `PERMISSION_DENIED`. El selector de Affinity devolvió `Peyto_s1.elx`; al pasar ese archivo nativo a Document.load también hubo rechazo. Ese intento no prueba una apertura del TIFF.

Se convirtió entonces la variante seleccionada sin pérdida a TIFF. Dimensiones 8192×5464 y hash RGB idénticos a la reconstrucción ElyX: `bd2c3d658a3cc923624e7b8eab629c0bb79a5e11e04cb0bda8be5aa06e87f867`. La apertura efectiva y la visualización dentro de Affinity siguen pendientes de prueba manual.

El modo manual predeterminado del conversor también se probó con una imagen de control: convirtió y verificó el TIFF sin intentar abrir Affinity.
