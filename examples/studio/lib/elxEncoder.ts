// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import { ELYX_MAGIC } from './constants';
import { rgbToYCoCgR } from './colorSpace';
import { transformPlaneV1 } from './wavelet2d';
import { compressDeflateBytes, crc32Bytes } from './compress';

/** Fuente de píxeles RGB8 (estructuralmente compatible con `ImageData`). */
export interface PixelSource {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Lado de la tesela cuadrada del contenedor v1. */
export const ELX_TILE = 512;

/** Niveles de descomposición DWT del contenedor v1. */
export const ELX_LEVELS = 3;

/** Cabecera JSON del contenedor v2 (sub-bandas + predictor MED). */
export interface V2HeaderInput {
  width: number;
  height: number;
  origWidth: number;
  origHeight: number;
  levels: number;
  step: number;
  chromaRatio: number;
}

/**
 * SHA-256 de los píxeles RGB (sin alfa), idéntico a `_pixel_hash()` de
 * `src/elyx/codec.py`. Permite que el decodificador Python verifique el archivo.
 * Devuelve `null` si el contexto no expone Web Crypto (HTTP sin TLS).
 */
async function pixelSha256(data: Uint8ClampedArray, width: number, height: number): Promise<string | null> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle) return null;

  const rgb = new Uint8Array(width * height * 3);
  let out = 0;
  for (let p = 0; p < width * height; p++) {
    rgb[out++] = data[p * 4];
    rgb[out++] = data[p * 4 + 1];
    rgb[out++] = data[p * 4 + 2];
  }

  const digest = await subtle.digest('SHA-256', rgb);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Serializa un contenedor `.elx` v1 (teselas Prisma) desde una imagen RGB8.
 *
 * Formato (idéntico a `src/elyx/codec.py`):
 * `MAGIC | uint32 headerLen | header JSON | [uint32 payloadLen | uint32 crc32 | payload] * tiles`
 */
export async function buildPrismaV1ElxBytes(src: PixelSource, step: number): Promise<Uint8Array> {
  const w = src.width;
  const h = src.height;
  const data = src.data;
  const tile = ELX_TILE;
  const levels = ELX_LEVELS;
  const unit = 1 << levels;

  const headerObj: Record<string, unknown> = {
    version: 1,
    width: w,
    height: h,
    mode: 'RGB8',
    tile,
    levels,
    step,
    color: 'YCoCg-R',
    wavelet: 'CDF53',
    entropy: 'zigzag16-byteplanes-deflate',
  };

  const sha = await pixelSha256(data, w, h);
  if (sha) headerObj.pixel_sha256 = sha;

  const headerBytes = new TextEncoder().encode(JSON.stringify(headerObj));
  const tileChunks: { crc: number; compressed: Uint8Array }[] = [];
  let totalPayloadBytes = 0;

  for (let ty = 0; ty < h; ty += tile) {
    for (let tx = 0; tx < w; tx += tile) {
      const hh = Math.min(tile, h - ty);
      const ww = Math.min(tile, w - tx);
      const ph = hh + ((-hh % unit) + unit) % unit;
      const pw = ww + ((-ww % unit) + unit) % unit;
      const planeLen = ph * pw;

      const chPlanes = [
        new Int32Array(planeLen),
        new Int32Array(planeLen),
        new Int32Array(planeLen),
      ];

      // Relleno por borde (mode='edge'), igual que `np.pad(..., mode='edge')`.
      for (let y = 0; y < ph; y++) {
        const sy = Math.min(hh - 1, y);
        for (let x = 0; x < pw; x++) {
          const sx = Math.min(ww - 1, x);
          const idx = ((ty + sy) * w + (tx + sx)) * 4;
          const [yv, cov, cgv] = rgbToYCoCgR(data[idx], data[idx + 1], data[idx + 2]);
          const p = y * pw + x;
          chPlanes[0][p] = yv;
          chPlanes[1][p] = cov;
          chPlanes[2][p] = cgv;
        }
      }

      for (let c = 0; c < 3; c++) {
        transformPlaneV1(chPlanes[c], pw, ph, levels, step);
      }

      // Rango int16 del formato: fuera de él el archivo sería ilegible.
      for (let c = 0; c < 3; c++) {
        const plane = chPlanes[c];
        for (let i = 0; i < planeLen; i++) {
          const v = plane[i];
          if (v < -32768 || v > 32767) {
            throw new Error('Coeficiente fuera del rango int16 del formato');
          }
        }
      }

      // ZigZag de 16 bits con signo -> planos de bytes lo/hi (canal mayor).
      const totalSamples = planeLen * 3;
      const rawTileBytes = new Uint8Array(totalSamples * 2);
      let pos = 0;
      for (let c = 0; c < 3; c++) {
        const plane = chPlanes[c];
        for (let i = 0; i < planeLen; i++) {
          const v = plane[i];
          const zz = ((v << 1) ^ (v >> 31)) & 0xffff;
          rawTileBytes[pos] = zz & 0xff;
          rawTileBytes[totalSamples + pos] = (zz >> 8) & 0xff;
          pos++;
        }
      }

      const crc = crc32Bytes(rawTileBytes);
      const compressed = await compressDeflateBytes(rawTileBytes);
      tileChunks.push({ crc, compressed });
      totalPayloadBytes += 8 + compressed.byteLength;
    }
  }

  const out = new Uint8Array(ELYX_MAGIC.length + 4 + headerBytes.byteLength + totalPayloadBytes);
  const dv = new DataView(out.buffer);
  let offset = 0;
  out.set(ELYX_MAGIC, offset);
  offset += ELYX_MAGIC.length;
  dv.setUint32(offset, headerBytes.byteLength, true);
  offset += 4;
  out.set(headerBytes, offset);
  offset += headerBytes.byteLength;

  for (const chunk of tileChunks) {
    dv.setUint32(offset, chunk.compressed.byteLength, true);
    offset += 4;
    dv.setUint32(offset, chunk.crc, true);
    offset += 4;
    out.set(chunk.compressed, offset);
    offset += chunk.compressed.byteLength;
  }

  return out;
}

/**
 * Serializa un contenedor `.elx` v2 (sub-bandas + predictor MED) de un solo
 * bloque comprimido.
 *
 * Formato: `MAGIC | uint32 headerLen | header JSON | uint32 payloadLen | uint32 crc32 | payload`
 */
export function buildV2ElxBytes(input: V2HeaderInput, payload: Uint8Array, crc: number): Uint8Array {
  const headerObj = {
    version: 2,
    width: input.width,
    height: input.height,
    orig_width: input.origWidth,
    orig_height: input.origHeight,
    mode: 'RGB8',
    levels: input.levels,
    step: input.step,
    chroma_ratio: input.chromaRatio,
    color: 'YCoCg-R',
    wavelet: 'CDF53-2D-MED-deadzone',
    entropy: 'zigzag16-byteplanes-deflate',
  };

  const headerBytes = new TextEncoder().encode(JSON.stringify(headerObj));
  const out = new Uint8Array(ELYX_MAGIC.length + 4 + headerBytes.byteLength + 8 + payload.byteLength);
  const dv = new DataView(out.buffer);
  let offset = 0;

  out.set(ELYX_MAGIC, offset);
  offset += ELYX_MAGIC.length;
  dv.setUint32(offset, headerBytes.byteLength, true);
  offset += 4;
  out.set(headerBytes, offset);
  offset += headerBytes.byteLength;
  dv.setUint32(offset, payload.byteLength, true);
  offset += 4;
  dv.setUint32(offset, crc, true);
  offset += 4;
  out.set(payload, offset);

  return out;
}
