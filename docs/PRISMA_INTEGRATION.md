# Guía de Integración con Prisma (`PRISMA_INTEGRATION.md`)

Prisma es tu aplicación principal. Esta guía explica cómo incorporar el soporte de decodificación de archivos `.elx` (`v1` y `v2`) directamente en tu visor de imágenes.

---

## 1. ¿Por qué integrar ElyX en Prisma?
* **Apertura instantánea de archivos nativos de ultra-alta resolución:** Permite visualizar fotos de más de 45 MP sin consumir gigabytes de RAM.
* **Soporte Dual retrocompatible:** Tu motor en Prisma podrá abrir tanto los archivos `.elx` antiguos (`version: 1`) como los nuevos optimizados con sub-bandas y predictor MED (`version: 2`).

---

## 2. Código de Integración para el Motor de Prisma

Inspecciona el campo `version` en el JSON de cabecera del archivo `.elx`:

```python
import json, struct, zlib
import numpy as np
from elyx_v2_decoder_prisma import decode_elyx_v2_buffer_to_rgb

def abrir_archivo_elx_en_prisma(ruta_archivo):
    with open(ruta_archivo, 'rb') as f:
        magic = f.read(8)
        if magic != b'ELYX\r\n\x1a\n':
            raise ValueError("No es un archivo ElyX válido")
        
        header_len = struct.unpack('<I', f.read(4))[0]
        header = json.loads(f.read(header_len).decode('utf-8'))
        
        # Leer payload
        size, crc = struct.unpack('<II', f.read(8))
        payload = f.read(size)
        raw = zlib.decompress(payload)
        
        version = header.get("version", 1)
        if version == 1:
            print("Abriendo con motor ElyX v1 (Teselas Prisma)...")
            # Tu lógica existente para v1
        elif version == 2:
            print("Abriendo con motor ElyX v2 (Subband + MED)...")
            rgb_array = decode_elyx_v2_buffer_to_rgb(raw, header)
            return rgb_array
```

Si Prisma opera en JavaScript/Frontend (Electron / Tauri), puedes usar la función equivalente `decodeElyxV2BufferToRGBA(rawPlanes, header)` provista en el repositorio.