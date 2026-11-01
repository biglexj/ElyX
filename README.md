# ElyX

![Version](https://img.shields.io/badge/ElyX_Spec-v1_%26_v2-00D4AA?style=flat-square&labelColor=090A0D)
![Wavelet](https://img.shields.io/badge/Wavelet-CDF_5%2F3_Lifting-00D4AA?style=flat-square&labelColor=090A0D)
![ColorSpace](https://img.shields.io/badge/Color-YCoCg--R_Integer-00D4AA?style=flat-square&labelColor=090A0D)
![License](https://img.shields.io/badge/License-MIT-00D4AA?style=flat-square&labelColor=090A0D)
![Python](https://img.shields.io/badge/Python-3.9%2B-00D4AA?style=flat-square&labelColor=090A0D)

**ElyX** is an experimental, standalone image codec built upon the
**Cohen-Daubechies-Feauveau (CDF) 5/3 Discrete Wavelet Transform** via integer
lifting schemes, reversible integer color decorrelation **YCoCg-R**, non-linear
**MED (Median Edge Detector)** prediction, and psycho-visual **Double Dead-Zone**
quantization.

Unlike block-based DCT codecs (JPEG, WebP), ElyX decomposes the image signal
into multi-resolution sub-bands without introducing blocking artifacts. It supports
everything from **100% mathematically lossless reconstruction (`step=1`)** to
high-density lossy compression for 8K photography.

> **Status:** Research prototype (v0.1). Not production-ready.
> No HDR, alpha, animation, EXIF/ICC, or >8-bit depth support.

---

## Operación con Mise (Estándar Ecosistema)

ElyX implementa la interfaz universal de tareas mediante Mise:

| Tarea | Propósito |
|---|---|
| `mise dev` | Ejecutar pruebas unitarias o CLI en desarrollo. |
| `mise build` | Compilar y verificar sintaxis de código Python sin generar paquetes. |
| `mise release` | Generar paquetes distribuibles locales (`wheel` y `sdist` en `dist/`) sin publicar. |
| `mise publish` | Publicar release en GitHub (`--plan` y `--check` sin escritura). |

Opciones de inspección y comprobación:
- `--plan`: Muestra el comando y las operaciones planificadas sin ejecutar procesos ni modificar el sistema (`mise dev --plan`, `mise release --plan`, `mise publish --plan`).
- `--check`: (para `publish`) Verifica el estado del repositorio, tags y la presencia e integridad de los artefactos en `dist/` sin publicar nada (`mise publish --check`).

---

## Quick Start

### Install

```bash
pip install numpy pillow
# or, once published to PyPI:
pip install elyx
```

### Encode

```bash
# Lossless (bit-exact round-trip, step=1)
python -m elyx encode photo.png photo_lossless.elx --step 1

# Lossy perceptual (8K photography, step=8)
python -m elyx encode photo.jpg photo_lossy.elx --step 8 --tile 512
```

### Decode

```bash
python -m elyx decode photo_lossy.elx reconstructed.png
```

### Python API

```python
from elyx import encode, decode

# Encode
header = encode("photo.png", "photo.elx", step=8)

# Decode
image, header = decode("photo.elx")
image.save("reconstructed.png")
```

---

## Repository Layout

```
ElyX/
├── src/elyx/
│   ├── __init__.py         Public API (encode / decode)
│   ├── codec.py            Encoder + decoder v1 (CLI entry point)
│   └── decoder_v2.py       Decoder v2 with Double Dead-Zone + MED prediction
├── tests/
│   └── test_codec.py       Round-trip and rejection tests (13 checks)
├── docs/
│   ├── SCIENTIFIC.md       Mathematical architecture (DWT, YCoCg-R, quantization)
│   ├── USER_GUIDE.md       CLI reference and usage guide
│   ├── PRISMA_INTEGRATION.md  Integration guide for the Prisma image viewer
│   └── AFFINITY_BRIDGE.md  Affinity Photo bridge (ElyX → TIFF)
├── tools/
│   ├── benchmark_8k.py     Reproducible 8K rate/distortion benchmark
│   └── affinity_bridge/    Windows launcher for Affinity Photo integration
├── examples/
│   └── studio/
│       ├── index.tsx            Entry point
│       ├── App.tsx              Root component
│       ├── types.ts             Shared TypeScript interfaces
│       ├── lib/                 Pure functions (codec math, no React)
│       ├── hooks/               React hooks (pipeline, viewport)
│       ├── components/          UI components (Header, Viewport, Sidebar…)
│       └── README.md
├── results/                Archived benchmark data (8K Peyto Lake)
├── AUTHORS
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE                 MIT
├── pyproject.toml
└── README.md
```

---

## Experimental Results (8K — 8192 × 5464 px)

| Configuration | Disk Size | bpp | vs RAW | PSNR (dB) | SSIM (Y) | Lossless |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| Raw RGB8 memory | 128.06 MiB | 24.00 | 0.0% | ∞ | 1.000000 | Reference |
| **ElyX step=1** | **42.92 MiB** | **8.04** | **−66.5%** | **∞** | **1.000000** | **True (SHA-256)** |
| **ElyX step=8** | **8.87 MiB** | **1.66** | **−93.1%** | **40.95 dB** | **0.971193** | Lossy |

> PSNR measured against the decoded source JPEG, not the original camera RAW.
> See [`results/INFORME.md`](results/INFORME.md) for full benchmark methodology
> and comparison against WebP, AVIF, and JPEG XL.

---

## Binary Format (`.elx` v1)

```
Offset   Size      Type        Description
──────────────────────────────────────────────────────────────────────────
0x00     8 bytes   uint8[8]    MAGIC: 45 4C 59 58 0D 0A 1A 0A  ("ELYX\r\n\x1a\n")
0x08     4 bytes   uint32 LE   header_len: length of JSON header
0x0C     N bytes   UTF-8       JSON header: version, dimensions, mode, wavelet,
                               step, tile, levels, color space, SHA-256 (lossless)
──────────────────────────────────────────────────────────────────────────
Per-tile payload blocks (row-major order):
+0x00    4 bytes   uint32 LE   payload_size: compressed DEFLATE stream length
+0x04    4 bytes   uint32 LE   raw_crc32: IEEE CRC-32 of decompressed buffer
+0x08    M bytes   uint8[]     DEFLATE stream [plane_LO | plane_HI]
```

---

## Documentation

| Document | Description |
|:---|:---|
| [`docs/SCIENTIFIC.md`](docs/SCIENTIFIC.md) | Mathematical architecture: YCoCg-R, CDF 5/3 DWT, Double Dead-Zone quantization, MED prediction, ZigZag mapping |
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) | CLI reference, installation, usage examples |
| [`docs/PRISMA_INTEGRATION.md`](docs/PRISMA_INTEGRATION.md) | Integration guide for the Prisma image viewer (Python + JS) |
| [`docs/AFFINITY_BRIDGE.md`](docs/AFFINITY_BRIDGE.md) | Affinity Photo bridge — ElyX → TIFF conversion |
| [`CHANGELOG.md`](CHANGELOG.md) | Version history |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Contribution guidelines |

---

## Photo Credit (Test Asset)

> **Balon Greyjoy** — Canon EOS R5, Peyto Lake (Alberta, Canada), 2025.
> [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:20250905_Canon_R5_Peyto_Lake-6145.jpg) ·
> [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
>
> Changes: wavelet encoding / decoding and quantization applied.
> All reconstructed images retain 8192 × 5464 px.
> Fidelity measured against the decoded JPEG, not the original RAW.

---

## License

[MIT](LICENSE) © 2026 biglexj
