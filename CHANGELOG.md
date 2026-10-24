# Changelog

All notable changes to ElyX are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Changed
- **ElyX Studio split into modules (`examples/studio/`)** — the single 1,773-line
  `elyx_studio.tsx` became `index.tsx` (public entry) + `App.tsx` (root state) +
  `types.ts`, with pure maths in `lib/`, React state in `hooks/`, and UI in
  `components/`. The monolithic file was removed.
- **`.elx` v1 header carries `pixel_sha256`** — lets the Python decoder verify the
  reconstructed pixels. Omitted when the page has no Web Crypto.
- **The studio reads both container versions** — `decodeElxFile` handles v1 (tiled) and
  v2 (single block) and verifies the CRC32 of every payload before decoding.
- **DEFLATE helpers no longer leak unhandled promise rejections** — a corrupted payload
  used to abort the page with an unhandled rejection instead of a catchable error.

### Fixed
- **The inverse colour transform now clips at the end** — `yCoCgRToRgb` clamped the
  blue channel before deriving red from it, so the red channel came out 1–13 units off
  in 0.5 % of the pixels against the Python decoder. `decoder_v2.py` clips at the end.
- **Sub-band quantisation now rounds to the nearest even value** — `decoder_v2.py` uses
  `np.rint`, which rounds `.5` to the nearest even, while `Math.round` rounds it up.
  With `step=10` the level-0 luma step lands exactly on `18.5`, so the two
  implementations picked a different quantisation step (18 vs 19) and a v2 file encoded
  by the studio decoded differently in Python. `getSubbandStep` and `dequantizeCentroid`
  now match numpy.

### Notes
- The v1 writer keeps the row-first 2-D lifting of `src/elyx/codec.py`
  (`_lift(_lift(a, 1), 0)`), so its output stays readable by `elyx decode`; verified
  byte-for-byte against a port of the numpy semantics.
- The v2 path (sub-bands + MED predictor) is unchanged bit for bit.
- The Python export panel still emits the placeholder script; wiring it to
  `tools/affinity_bridge/elyx_native.py` is still pending.

---

## [0.1.0] — 2026-10-17

### Added
- **Binary container spec v1** — ELYX magic bytes, JSON header, per-tile DEFLATE
  payload with CRC32 integrity and SHA-256 pixel fingerprint (lossless mode).
- **Codec (`src/elyx/codec.py`)** — pure Python encoder/decoder using reversible
  YCoCg-R color decorrelation, 3-level integer CDF 5/3 DWT, signed 16-bit ZigZag
  mapping, byte-plane separation, zlib DEFLATE entropy stage.
- **Decoder v2 (`src/elyx/decoder_v2.py`)** — adds Double Dead-Zone quantization,
  centroid reconstruction, per-subband step sizing and MED (JPEG-LS) prediction on
  the LL₃ base band. Retains full backward compatibility with v1 files.
- **CLI** — `encode` and `decode` sub-commands via `argparse`; exclusive file
  creation (no silent overwrites).
- **Test suite (`tests/test_codec.py`)** — 13 round-trip and rejection tests covering
  odd sizes, 1-pixel images, multiple tiles, step=1/8, lossless pixel identity, and
  five classes of invalid file.
- **Benchmark tool (`tools/benchmark_8k.py`)** — reproducible rate/distortion
  comparison at 8K (8192 × 5464 px) against WebP, AVIF, and JPEG XL.
- **Affinity bridge (`tools/affinity_bridge/`)** — Windows launcher for converting
  `.elx` → TIFF for inspection in Affinity Photo.
- **ElyX Studio (`examples/studio/elyx_studio.tsx`)** — React/TSX visual comparison
  tool: real-time side-by-side ElyX vs WebP render, quality sliders, codec metrics,
  and Python code export.
- **Experimental results (`results/`)** — full reproducible 8K benchmark data, CSV,
  JSON metrics, and 100 % crop inspection images.

### Notes
- Prototype only. No HDR, alpha, animation, EXIF/ICC, or sub-8-bit support.
- Lossless mode preserves decoded JPEG pixels, not the original JPEG bytes/metadata.
- Tile-independent encoding may produce seams in lossy mode; evaluation pending.
