// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import { cdf53Forward1D, cdf53Inverse1D } from './wavelet';
import { getSubbandStep, quantizeDeadZone, dequantizeCentroid } from './quantization';

export interface WaveletPackResult {
  llDiff: Int32Array;
  subbands: Int32Array[];
  zeroCount: number;
  detailCount: number;
}

export interface WaveletUnpackResult {
  plane: Int32Array;
  nextOffset: number;
}

export function packBandsZeroRun(bandsList: Int32Array[]): Uint8Array {
  let totalLen = 0;
  for (const b of bandsList) totalLen += b.length;

  const outLo = new Uint8Array(totalLen);
  const outHi = new Uint8Array(totalLen);
  let pos = 0;

  for (const band of bandsList) {
    for (let i = 0; i < band.length; i++) {
      const v = band[i];
      const zz = ((v << 1) ^ (v >> 31)) & 0xffff;
      outLo[pos] = zz & 0xff;
      outHi[pos] = (zz >> 8) & 0xff;
      pos++;
    }
  }

  const combined = new Uint8Array(totalLen * 2);
  combined.set(outLo, 0);
  combined.set(outHi, totalLen);
  return combined;
}

export function forwardWavelet2DAndPack(
  plane: Int32Array, w: number, h: number, levels: number,
  baseStep: number, isChroma: boolean, chromaRatio: number,
  granBefore: Int32Array | null, granAfter: Int32Array | null
): WaveletPackResult {
  const rowBuf = new Int32Array(w);
  const colBuf = new Int32Array(h);
  const subbands: Int32Array[] = [];
  let zeroCount = 0;
  let detailCount = 0;

  for (let lev = 0; lev < levels; lev++) {
    const hh = h >> lev;
    const ww = w >> lev;
    const hy = hh >> 1;
    const hx = ww >> 1;

    for (let y = 0; y < hh; y++) {
      const rowOff = y * w;
      for (let x = 0; x < ww; x++) rowBuf[x] = plane[rowOff + x];
      cdf53Forward1D(rowBuf, ww);
      for (let x = 0; x < ww; x++) plane[rowOff + x] = rowBuf[x];
    }
    for (let x = 0; x < ww; x++) {
      for (let y = 0; y < hh; y++) colBuf[y] = plane[y * w + x];
      cdf53Forward1D(colBuf, hh);
      for (let y = 0; y < hh; y++) plane[y * w + x] = colBuf[y];
    }

    const qHL = getSubbandStep(baseStep, lev, isChroma, chromaRatio, false);
    const qHH = getSubbandStep(baseStep, lev, isChroma, chromaRatio, true);
    const hlBand = new Int32Array(hy * hx);
    const lhBand = new Int32Array(hy * hx);
    const hhBand = new Int32Array(hy * hx);
    let ptr = 0;

    for (let y = 0; y < hy; y++) {
      const topOff = y * w;
      const botOff = (y + hy) * w;
      for (let x = 0; x < hx; x++) {
        const vHL = plane[topOff + (x + hx)];
        const vLH = plane[botOff + x];
        const vHH = plane[botOff + (x + hx)];

        const y0 = y * 2, x0 = x * 2, p0 = y0 * w + x0;
        if (!isChroma && lev === 0 && granBefore && granAfter) {
          const magBefore = Math.max(Math.abs(vHL), Math.abs(vLH), Math.abs(vHH));
          granBefore[p0] = magBefore;
          if (x0 + 1 < w) granBefore[p0 + 1] = magBefore;
          if (y0 + 1 < h) {
            granBefore[p0 + w] = magBefore;
            if (x0 + 1 < w) granBefore[p0 + w + 1] = magBefore;
          }
        }

        let qvHL = vHL, qvLH = vLH, qvHH = vHH;
        if (baseStep > 1) {
          qvHL = quantizeDeadZone(vHL, qHL);
          qvLH = quantizeDeadZone(vLH, qHL);
          qvHH = quantizeDeadZone(vHH, qHH);
        }

        detailCount += 3;
        if (qvHL === 0) zeroCount++;
        if (qvLH === 0) zeroCount++;
        if (qvHH === 0) zeroCount++;

        hlBand[ptr] = qvHL;
        lhBand[ptr] = qvLH;
        hhBand[ptr] = qvHH;
        ptr++;

        const recHL = baseStep > 1 ? dequantizeCentroid(qvHL, qHL) : vHL;
        const recLH = baseStep > 1 ? dequantizeCentroid(qvLH, qHL) : vLH;
        const recHH = baseStep > 1 ? dequantizeCentroid(qvHH, qHH) : vHH;

        plane[topOff + (x + hx)] = recHL;
        plane[botOff + x] = recLH;
        plane[botOff + (x + hx)] = recHH;

        if (!isChroma && lev === 0 && granAfter) {
          const magAfter = Math.max(Math.abs(qvHL * qHL), Math.abs(qvLH * qHL), Math.abs(qvHH * qHH));
          granAfter[p0] = magAfter;
          if (x0 + 1 < w) granAfter[p0 + 1] = magAfter;
          if (y0 + 1 < h) {
            granAfter[p0 + w] = magAfter;
            if (x0 + 1 < w) granAfter[p0 + w + 1] = magAfter;
          }
        }
      }
    }
    subbands.push(hlBand, lhBand, hhBand);
  }

  const fh = h >> levels;
  const fw = w >> levels;
  const llRaw = new Int32Array(fh * fw);
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < fw; x++)
      llRaw[y * fw + x] = plane[y * w + x];

  const llDiff = new Int32Array(fh * fw);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const curr = llRaw[y * fw + x];
      let pred = 0;
      if (x > 0 && y > 0) {
        const left = llRaw[y * fw + (x - 1)];
        const top = llRaw[(y - 1) * fw + x];
        const topLeft = llRaw[(y - 1) * fw + (x - 1)];
        const minLT = Math.min(left, top);
        const maxLT = Math.max(left, top);
        pred = topLeft >= maxLT ? minLT : topLeft <= minLT ? maxLT : left + top - topLeft;
      } else if (x > 0) {
        pred = llRaw[y * fw + (x - 1)];
      } else if (y > 0) {
        pred = llRaw[(y - 1) * fw + x];
      }
      llDiff[y * fw + x] = curr - pred;
    }
  }

  // Inverse wavelet to restore plane for next level
  for (let lev = levels - 1; lev >= 0; lev--) {
    const hh = h >> lev;
    const ww = w >> lev;
    for (let x = 0; x < ww; x++) {
      for (let y = 0; y < hh; y++) colBuf[y] = plane[y * w + x];
      cdf53Inverse1D(colBuf, hh);
      for (let y = 0; y < hh; y++) plane[y * w + x] = colBuf[y];
    }
    for (let y = 0; y < hh; y++) {
      const rowOff = y * w;
      for (let x = 0; x < ww; x++) rowBuf[x] = plane[rowOff + x];
      cdf53Inverse1D(rowBuf, ww);
      for (let x = 0; x < ww; x++) plane[rowOff + x] = rowBuf[x];
    }
  }

  return { llDiff, subbands, zeroCount, detailCount };
}

/**
 * Transformada 2D CDF 5/3 **compatible con `src/elyx/codec.py` (v1)**.
 *
 * `codec.py` aplica `_lift(_lift(a, 1), 0)`. En un array de forma (h, w) el
 * eje 1 es el índice de columna, así que `np.take(a, ..., axis=1)` extrae la
 * señal **horizontal** de cada fila: el primer lifting es por filas y el
 * segundo por columnas.
 *
 * Ese orden importa porque el redondeo entero del lifting no conmuta: el
 * orden inverso produce coeficientes distintos y el archivo resultante no lo
 * puede leer `elyx decode` ni el puente de Affinity.
 *
 * Opera sobre un plano de `ph × pw` con stride `pw`, en el sitio.
 */
export function transformPlaneV1(
  plane: Int32Array, pw: number, ph: number, levels: number, step: number
): void {
  const rowBuf = new Int32Array(pw);
  const colBuf = new Int32Array(ph);

  for (let lev = 0; lev < levels; lev++) {
    const curH = ph >> lev;
    const curW = pw >> lev;
    const hy = curH >> 1;
    const hx = curW >> 1;

    // 1) Filas (señal horizontal, eje 1 en numpy).
    for (let y = 0; y < curH; y++) {
      const off = y * pw;
      for (let x = 0; x < curW; x++) rowBuf[x] = plane[off + x];
      cdf53Forward1D(rowBuf, curW);
      for (let x = 0; x < curW; x++) plane[off + x] = rowBuf[x];
    }

    // 2) Columnas (señal vertical, eje 0 en numpy).
    for (let x = 0; x < curW; x++) {
      for (let y = 0; y < curH; y++) colBuf[y] = plane[y * pw + x];
      cdf53Forward1D(colBuf, curH);
      for (let y = 0; y < curH; y++) plane[y * pw + x] = colBuf[y];
    }

    // 3) Cuantización de las sub-bandas de detalle (HL, LH, HH). La banda LL
    //    queda intacta, igual que en `codec.py`.
    if (step > 1) {
      const halfStep = step >> 1;
      for (let y = 0; y < curH; y++) {
        const off = y * pw;
        for (let x = 0; x < curW; x++) {
          if (y < hy && x < hx) continue;
          const v = plane[off + x];
          const sign = v < 0 ? -1 : v > 0 ? 1 : 0;
          plane[off + x] = sign * Math.trunc((Math.abs(v) + halfStep) / step);
        }
      }
    }
  }
}

/**
 * Transformada inversa 2D CDF 5/3 del contenedor v1.
 *
 * Simétrica a `transformPlaneV1`: deshace la cuantización (`× step`, no
 * centróide) y luego el lifting en orden inverso — columnas (eje 0) y después
 * filas (eje 1) — tal como hace `_lift(_lift(a, 0, True), 1, True)`.
 */
export function transformPlaneV1Inverse(
  plane: Int32Array, pw: number, ph: number, levels: number, step: number
): void {
  const rowBuf = new Int32Array(pw);
  const colBuf = new Int32Array(ph);

  for (let lev = levels - 1; lev >= 0; lev--) {
    const curH = ph >> lev;
    const curW = pw >> lev;
    const hy = curH >> 1;
    const hx = curW >> 1;

    // 1) Descuantización de las sub-bandas de detalle.
    if (step > 1) {
      for (let y = 0; y < curH; y++) {
        const off = y * pw;
        for (let x = 0; x < curW; x++) {
          if (y < hy && x < hx) continue;
          plane[off + x] *= step;
        }
      }
    }

    // 2) Columnas (eje 0) primero.
    for (let x = 0; x < curW; x++) {
      for (let y = 0; y < curH; y++) colBuf[y] = plane[y * pw + x];
      cdf53Inverse1D(colBuf, curH);
      for (let y = 0; y < curH; y++) plane[y * pw + x] = colBuf[y];
    }

    // 3) Filas (eje 1) después.
    for (let y = 0; y < curH; y++) {
      const off = y * pw;
      for (let x = 0; x < curW; x++) rowBuf[x] = plane[off + x];
      cdf53Inverse1D(rowBuf, curW);
      for (let x = 0; x < curW; x++) plane[off + x] = rowBuf[x];
    }
  }
}

export function unpackAndInverseWavelet2D(
  flat: Int32Array, offset: number,
  w: number, h: number, levels: number,
  baseStep: number, isChroma: boolean, chromaRatio: number
): WaveletUnpackResult {
  const plane = new Int32Array(w * h);
  const fh = h >> levels;
  const fw = w >> levels;
  let pos = offset;

  const llRec = new Int32Array(fh * fw);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const diff = flat[pos++];
      let pred = 0;
      if (x > 0 && y > 0) {
        const left = llRec[y * fw + (x - 1)];
        const top = llRec[(y - 1) * fw + x];
        const topLeft = llRec[(y - 1) * fw + (x - 1)];
        const minLT = Math.min(left, top);
        const maxLT = Math.max(left, top);
        pred = topLeft >= maxLT ? minLT : topLeft <= minLT ? maxLT : left + top - topLeft;
      } else if (x > 0) {
        pred = llRec[y * fw + (x - 1)];
      } else if (y > 0) {
        pred = llRec[(y - 1) * fw + x];
      }
      const val = diff + pred;
      llRec[y * fw + x] = val;
      plane[y * w + x] = val;
    }
  }

  for (let lev = 0; lev < levels; lev++) {
    const hh = h >> lev;
    const ww = w >> lev;
    const hy = hh >> 1;
    const hx = ww >> 1;
    const bLen = hy * hx;
    const qHL = getSubbandStep(baseStep, lev, isChroma, chromaRatio, false);
    const qHH = getSubbandStep(baseStep, lev, isChroma, chromaRatio, true);

    for (let y = 0; y < hy; y++) {
      const topOff = y * w;
      for (let x = 0; x < hx; x++) {
        const qv = flat[pos + y * hx + x];
        plane[topOff + (x + hx)] = baseStep > 1 ? dequantizeCentroid(qv, qHL) : qv;
      }
    }
    pos += bLen;
    for (let y = 0; y < hy; y++) {
      const botOff = (y + hy) * w;
      for (let x = 0; x < hx; x++) {
        const qv = flat[pos + y * hx + x];
        plane[botOff + x] = baseStep > 1 ? dequantizeCentroid(qv, qHL) : qv;
      }
    }
    pos += bLen;
    for (let y = 0; y < hy; y++) {
      const botOff = (y + hy) * w;
      for (let x = 0; x < hx; x++) {
        const qv = flat[pos + y * hx + x];
        plane[botOff + (x + hx)] = baseStep > 1 ? dequantizeCentroid(qv, qHH) : qv;
      }
    }
    pos += bLen;
  }

  const rowBuf = new Int32Array(w);
  const colBuf = new Int32Array(h);
  for (let lev = levels - 1; lev >= 0; lev--) {
    const hh = h >> lev;
    const ww = w >> lev;
    for (let x = 0; x < ww; x++) {
      for (let y = 0; y < hh; y++) colBuf[y] = plane[y * w + x];
      cdf53Inverse1D(colBuf, hh);
      for (let y = 0; y < hh; y++) plane[y * w + x] = colBuf[y];
    }
    for (let y = 0; y < hh; y++) {
      const rowOff = y * w;
      for (let x = 0; x < ww; x++) rowBuf[x] = plane[rowOff + x];
      cdf53Inverse1D(rowBuf, ww);
      for (let x = 0; x < ww; x++) plane[rowOff + x] = rowBuf[x];
    }
  }

  return { plane, nextOffset: pos };
}
