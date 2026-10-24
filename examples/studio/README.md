# ElyX Studio

Visual comparison tool for the ElyX codec — real-time side-by-side rendering of
ElyX vs WebP with quality sliders, codec metrics, and Python code export.

## Module Map

```
studio/
├── index.tsx                    Entry point — re-exports App
├── App.tsx                      Root component: state + layout
├── types.ts                     Shared TypeScript interfaces and unions
│
├── lib/                         Pure functions (no React)
│   ├── constants.ts             ELYX_MAGIC, CRC32_TABLE, clamp8
│   ├── colorSpace.ts            rgbToYCoCgR ↔ yCoCgRToRgb
│   ├── wavelet.ts               cdf53Forward1D / cdf53Inverse1D (1-D lifting)
│   ├── quantization.ts          getSubbandStep, quantizeDeadZone, dequantizeCentroid
│   ├── wavelet2d.ts             2-D forward/inverse (v2 + variante v1) + packBandsZeroRun
│   ├── compress.ts              compressDeflateBytes, decompressDeflateBytes, crc32Bytes
│   ├── elxEncoder.ts            buildPrismaV1ElxBytes, buildV2ElxBytes
│   ├── elxDecoder.ts            decodeElxFile / decodeElxBuffer → canvas / RGBA
│   ├── sampleScene.ts           generateSampleScene (procedural test images)
│   └── format.ts                formatSize, formatLabelShort, getSplitLabels
│
├── hooks/                       React hooks
│   ├── useComparisonPipeline.ts wavelet pipeline + metrics (PSNR/MSE) + .elx v2
│   └── useViewport.ts           zoom, pan, split-curtain, drag state
│
├── components/                  UI components
│   ├── Header.tsx               Top toolbar (presets, view modes, download)
│   ├── Viewport.tsx             Canvas area + split curtain + labels
│   ├── Sidebar.tsx              Collapsible right panel (tabs)
│   ├── InspectorTab.tsx         Format selector, metrics table, sliders
│   └── CodeTab.tsx              Python script export panel
└── README.md
```

`lib/` never imports React: everything there is a pure function that can be
unit-tested in isolation (see `lib/elxDecoder.ts` for the split between
`decodeElxBuffer`, which is DOM-free, and `decodeElxFile`, which paints into a
canvas).

## Usage

```tsx
import ElyxStudio from './examples/studio';
// or
import ElyxStudio from './examples/studio/App';
```

## Development

No build step needed for Vite/Next.js projects — just import the `.tsx` files.
Requires React ≥ 18 and `lucide-react`.

```bash
npm install lucide-react
```

## Container compatibility

The studio writes and reads two `.elx` flavours:

| Version | Layout | Written by | Read by |
| --- | --- | --- | --- |
| `v1` ("Prisma") | 512 px tiles, in-place 2-D coefficients | `buildPrismaV1ElxBytes` | `decodeElxFile`, `elyx decode` (Python) |
| `v2` ("Nuevo") | Single block, banded coefficients + MED predictor | `buildV2ElxBytes` | `decodeElxFile`, `decoder_v2.py` (Python) |

The v1 writer reproduces `src/elyx/codec.py` exactly. The 2-D lifting runs
**rows first, then columns** — in numpy terms `_lift(_lift(a, 1), 0)`, where
axis 1 selects the horizontal signal of each row and axis 0 the vertical one.
That order is not interchangeable: integer lifting does not commute, so the
opposite order (columns first) yields different coefficients and files written
that way cannot be read back by `elyx decode`.

The v1 header carries `pixel_sha256` whenever the page exposes Web Crypto, so
the Python decoder can verify the reconstructed pixels. Without Web Crypto the
key is omitted and the file is still valid for `step > 1`.

`decodeElxFile` verifies the CRC32 of every payload before decoding, and
rejects a container whose magic bytes do not match.

### Rounding rules that are part of the format

Three details look like style but change the decoded pixels, so the TypeScript
follows numpy exactly:

| Rule | numpy (`decoder_v2.py`) | TypeScript |
| --- | --- | --- |
| Sub-band step | `int(round(q))` → nearest **even** | `roundHalfToEven` |
| Centroid reconstruction | `np.rint(...)` → nearest **even** | `roundHalfToEven` |
| Inverse colour | clip at the end | clip at the end |

`step=10` makes the level-0 luma step land exactly on `18.5`: rounding it up
gives 19 and rounding to even gives 18, and the two decoders then disagree
about the whole dead zone of that sub-band.

The inverse colour transform must clip **at the end** — `r` is derived from the
unclipped `b`, so clipping `b` first shifts `r` by up to 13 units.

## Verification

The codec layer was checked against the real Python implementation, not
against a re-implementation:

- The v1 tiles are **byte-identical** to `src/elyx/codec.py` for a multi-tile
  image, and the pixels decoded by TypeScript match the ones decoded by
  Python byte for byte.
- The v2 pixels match `src/elyx/decoder_v2.py` byte for byte across four
  parameter sets, including `step=10` (the exact `.5` case above).
- v1 and v2 round-trips at `step=1` are **bit-exact** against the source pixels.
- A corrupted payload raises instead of decoding garbage.


