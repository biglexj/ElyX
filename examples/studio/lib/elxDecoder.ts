// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import { ELYX_MAGIC } from './constants';
import { yCoCgRToRgb } from './colorSpace';
import { crc32Bytes, decompressDeflateBytes } from './compress';
import { transformPlaneV1Inverse, unpackAndInverseWavelet2D } from './wavelet2d';

/** Cabecera JSON de un contenedor `.elx`. */
export interface ElxHeader {
  version?: number;
  width: number;
  height: number;
  tile?: number;
  levels?: number;
  step?: number;
  chroma_ratio?: number;
  orig_width?: number;
  orig_height?: number;
  [key: string]: unknown;
}

/** Resultado crudo de decodificar un `.elx` (sin depender del DOM). */
export interface DecodedElxBuffer {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  header: ElxHeader;
  version: number;
  step: number;
  chromaRatio: number;
}

/** Resultado de `decodeElxFile`, listo para pintarse en el lienzo. */
export interface DecodedElx extends DecodedElxBuffer {
  canvas: HTMLCanvasElement;
}

/** Lee la cabecera JSON y comprueba la firma del contenedor. */
function readHeader(bytes: Uint8Array): { header: ElxHeader; offset: number } {
  if (bytes.length < ELYX_MAGIC.length + 4) {
    throw new Error('Archivo ELYX truncado');
  }
  for (let i = 0; i < ELYX_MAGIC.length; i++) {
    if (bytes[i] !== ELYX_MAGIC[i]) throw new Error('Firma ELYX inválida');
  }

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLen = dv.getUint32(ELYX_MAGIC.length, true);
  const headerStart = ELYX_MAGIC.length + 4;
  if (headerLen < 2 || headerStart + headerLen > bytes.length) {
    throw new Error('Longitud de cabecera fuera de rango');
  }

  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(headerStart, headerStart + headerLen)));
  return { header, offset: headerStart + headerLen };
}

/** Desempaqueta los planos lo/hi con ZigZag de 16 bits con signo. */
function unpackZigzagPlanes(raw: Uint8Array, totalCoeffs: number): Int32Array {
  const flat = new Int32Array(totalCoeffs);
  for (let i = 0; i < totalCoeffs; i++) {
    const lo = raw[i];
    const hi = raw[totalCoeffs + i];
    const zz = lo | (hi << 8);
    flat[i] = (zz >>> 1) ^ -(zz & 1);
  }
  return flat;
}

/** Decodifica un contenedor v2 (sub-bandas + predictor MED) de un solo bloque. */
async function decodeV2(bytes: Uint8Array, header: ElxHeader, offset: number): Promise<DecodedElxBuffer> {
  const w = header.width;
  const h = header.height;
  const levels = header.levels ?? 3;
  const step = header.step ?? 1;
  const chromaRatio = header.chroma_ratio ?? 2.0;

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (offset + 8 > bytes.length) throw new Error('Archivo ELYX truncado');

  const payloadLen = dv.getUint32(offset, true);
  const crc = dv.getUint32(offset + 4, true);
  const payloadStart = offset + 8;
  if (payloadStart + payloadLen > bytes.length) throw new Error('Bloque ELYX truncado');

  const raw = await decompressDeflateBytes(bytes.subarray(payloadStart, payloadStart + payloadLen));

  const totalCoeffs = w * h * 3;
  if (raw.length !== totalCoeffs * 2) {
    throw new Error(`Tamaño de payload inválido: esperado ${totalCoeffs * 2}, recibido ${raw.length}`);
  }
  if (crc32Bytes(raw) !== crc) throw new Error('CRC32 del payload no coincide');

  const flat = unpackZigzagPlanes(raw, totalCoeffs);
  const decY = unpackAndInverseWavelet2D(flat, 0, w, h, levels, step, false, chromaRatio);
  const decCo = unpackAndInverseWavelet2D(flat, decY.nextOffset, w, h, levels, step, true, chromaRatio);
  const decCg = unpackAndInverseWavelet2D(flat, decCo.nextOffset, w, h, levels, step, true, chromaRatio);

  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const [r, g, b] = yCoCgRToRgb(decY.plane[p], decCo.plane[p], decCg.plane[p]);
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
  }

  return { rgba, width: w, height: h, header, version: 2, step, chromaRatio };
}

/** Decodifica un contenedor v1 (teselas de 512 px, igual que `codec.py`). */
async function decodeV1(bytes: Uint8Array, header: ElxHeader, offset: number): Promise<DecodedElxBuffer> {
  const w = header.width;
  const h = header.height;
  const tile = header.tile ?? 512;
  const levels = header.levels ?? 3;
  const step = header.step ?? 1;
  const unit = 1 << levels;

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rgba = new Uint8ClampedArray(w * h * 4);
  let pos = offset;

  for (let ty = 0; ty < h; ty += tile) {
    for (let tx = 0; tx < w; tx += tile) {
      if (pos + 8 > bytes.length) throw new Error('Archivo ELYX truncado');

      const payloadLen = dv.getUint32(pos, true);
      const crc = dv.getUint32(pos + 4, true);
      pos += 8;
      if (payloadLen < 1 || pos + payloadLen > bytes.length) {
        throw new Error('Longitud de tesela inválida');
      }

      const raw = await decompressDeflateBytes(bytes.subarray(pos, pos + payloadLen));
      pos += payloadLen;

      const hh = Math.min(tile, h - ty);
      const ww = Math.min(tile, w - tx);
      const ph = hh + ((-hh % unit) + unit) % unit;
      const pw = ww + ((-ww % unit) + unit) % unit;
      const totalCoeffs = ph * pw * 3;

      if (raw.length !== totalCoeffs * 2) {
        throw new Error(`Tamaño de tesela inválido: esperado ${totalCoeffs * 2}, recibido ${raw.length}`);
      }
      if (crc32Bytes(raw) !== crc) throw new Error('CRC32 de la tesela no coincide');

      const flat = unpackZigzagPlanes(raw, totalCoeffs);
      const planes = [
        new Int32Array(ph * pw),
        new Int32Array(ph * pw),
        new Int32Array(ph * pw),
      ];
      for (let c = 0; c < 3; c++) {
        const plane = planes[c];
        for (let i = 0; i < ph * pw; i++) plane[i] = flat[c * ph * pw + i];
        transformPlaneV1Inverse(plane, pw, ph, levels, step);
      }

      for (let y = 0; y < hh; y++) {
        for (let x = 0; x < ww; x++) {
          const p = y * pw + x;
          const [r, g, b] = yCoCgRToRgb(planes[0][p], planes[1][p], planes[2][p]);
          const idx = ((ty + y) * w + (tx + x)) * 4;
          rgba[idx] = r;
          rgba[idx + 1] = g;
          rgba[idx + 2] = b;
          rgba[idx + 3] = 255;
        }
      }
    }
  }

  return { rgba, width: w, height: h, header, version: 1, step, chromaRatio: header.chroma_ratio ?? 2.0 };
}

/**
 * Decodifica un `.elx` a píxeles RGBA, sin depender del DOM.
 * Despacha por `header.version`: v1 es teselado, v2 es un bloque único.
 */
export async function decodeElxBuffer(bytes: Uint8Array): Promise<DecodedElxBuffer> {
  const { header, offset } = readHeader(bytes);
  const version = header.version ?? 1;

  if (version === 1) return decodeV1(bytes, header, offset);
  if (version === 2) return decodeV2(bytes, header, offset);
  throw new Error(`Versión ELYX no soportada: ${version}`);
}

/**
 * Decodifica un `.elx` y lo devuelve como `HTMLCanvasElement` listo para
 * pintarse en el lienzo del comparador.
 */
export async function decodeElxFile(bytes: Uint8Array): Promise<DecodedElx> {
  const decoded = await decodeElxBuffer(bytes);

  const canvas = document.createElement('canvas');
  canvas.width = decoded.width;
  canvas.height = decoded.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo obtener el contexto 2D del lienzo');

  const imageData = ctx.createImageData(decoded.width, decoded.height);
  imageData.data.set(decoded.rgba);
  ctx.putImageData(imageData, 0, 0);

  return { ...decoded, canvas };
}
