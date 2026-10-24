# Guía de Uso y CLI de ElyX (`elyx_native.py`)

Esta guía detalla cómo instalar, ejecutar y probar el códec nativo ElyX desde la línea de comandos en Python.

---

## 1. Requisitos del Sistema
* Python 3.9 o superior.
* Librerías requeridas: `numpy`, `Pillow`.

Instalación rápida:
```bash
pip install numpy pillow
```

---

## 2. Comandos Principales de la CLI

### A. Codificar una imagen (Modo Lossless o Lossy)
Para codificar una imagen PNG o JPG a un contenedor nativo `.elx`:

```bash
# Modo Lossless puro (bit a bit exacto, step=1)
python elyx_native.py encode entrada.png salida_lossless.elx --step 1 --tile 512

# Modo Lossy Perceptual para fotografía 8K (step=8)
python elyx_native.py encode Peyto_8K.jpg Peyto_s8.elx --step 8 --tile 512
```

### B. Decodificar un archivo `.elx` a PNG
Para decodificar y verificar la integridad matemática mediante CRC32 y SHA-256:

```bash
python elyx_native.py decode Peyto_s8.elx reconstruida.png
```

---

## 3. ¿Por qué deberías probar ElyX?
1. **Independencia de formato:** No dependes de contenedores estándar comerciales; ElyX gestiona su propia arquitectura Wavelet biortogonal entera.
2. **Control absoluto del compromiso Calidad / Peso:** Con el parámetro `--step` puedes elegir desde compresión sin pérdida absoluta (`step=1`) hasta ultra-alta compresión para transporte en red (`step=16` o superior) manteniendo PSNR superior a 40 dB.
3. **Cero artefactos de bloques:** A diferencia de JPEG o WebP que generan cuadrículas de $8 \times 8$ píxeles en fondos difusos o degradados, la transformada Wavelet CDF 5/3 preserva transiciones suaves y naturales.