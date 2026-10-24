# SPDX-License-Identifier: MIT
# Copyright (c) 2026 biglexj
"""ElyX v2 decoder — backward-compatible with v1 files.

Contains:
1. Python (NumPy) implementation for native backends / scripts.
2. JavaScript / TypeScript snippet (TypedArrays) for frontend use in
   Electron, Tauri, or web workers (see ``JS_DECODER_SNIPPET``).

Usage (Python)
--------------
import zlib, json, struct
from elyx.decoder_v2 import decode_elyx_v2_buffer_to_rgb

with open("photo.elx", "rb") as f:
    f.read(8)                                      # skip magic
    header = json.loads(f.read(struct.unpack("<I", f.read(4))[0]))
    size, _ = struct.unpack("<II", f.read(8))
    raw = zlib.decompress(f.read(size))

rgb_array = decode_elyx_v2_buffer_to_rgb(raw, header)
# → numpy uint8 array, shape (height, width, 3)
"""

import numpy as np

# =====================================================================
# 1. VERSIÓN PYTHON (Para el motor Python / NumPy de Prisma)
# =====================================================================

def get_subband_step_v2(base_step: int, level: int, is_chroma: bool, chroma_ratio: float, is_hh: bool) -> int:
    """Calcula el paso de cuantización exacto por nivel y sub-banda en ElyX v2."""
    if base_step <= 1:
        return 1
    level_multipliers = (1.85, 1.15, 0.75)
    mult = level_multipliers[level] if level < len(level_multipliers) else 1.0
    q = base_step * mult
    if is_chroma:
        q *= chroma_ratio
    if is_hh:
        q *= 1.65
    return max(1, int(round(q)))


def dequantize_centroid_v2(qv: np.ndarray, q: int) -> np.ndarray:
    """Reconstrucción al centroide con compensación de Double Dead-Zone (1.35x) de ElyX v2."""
    if q <= 1:
        return qv
    threshold = int(np.floor(q * 1.35))
    sign = np.sign(qv)
    abs_q = np.abs(qv)
    rec = np.where(abs_q == 0, 0, sign * np.rint(threshold + (abs_q - 0.65) * q).astype(np.int32))
    return rec


def cdf53_inverse_1d_inplace(signal: np.ndarray, length: int):
    """Wavelet inversa CDF 5/3 1D idéntica bit a bit al codificador v2."""
    if length < 2:
        return
    half = length >> 1
    temp = signal[:length].copy()

    # 1. Deshacer actualización (Update step)
    for i in range(half):
        d_left = temp[half + i - 1] if i > 0 else temp[half + i]
        d_curr = temp[half + i]
        temp[i] -= (int(d_left) + int(d_curr) + 2) >> 2

    # 2. Deshacer predicción (Predict step)
    for i in range(half):
        even_left = temp[i]
        even_right = temp[i + 1] if (i + 1) < half else temp[i]
        temp[half + i] += (int(even_left) + int(even_right)) >> 1

    # 3. Intercalar pares e impares
    signal[0:length:2] = temp[:half]
    signal[1:length:2] = temp[half:length]


def unpack_and_inverse_wavelet_2d_v2(
    flat: np.ndarray,
    offset: int,
    w: int,
    h: int,
    levels: int,
    base_step: int,
    is_chroma: bool,
    chroma_ratio: float
):
    """
    Desempaca un canal (Y, Co o Cg) en formato ElyX v2:
    1) Reconstruye la banda base LL usando el predictor MED (Median Edge Detector).
    2) Descuantiza y coloca las sub-bandas HL, LH, HH de cada nivel.
    3) Ejecuta la transformada inversa CDF 5/3 2D desde el nivel más profundo al 0.
    """
    plane = np.zeros((h, w), dtype=np.int32)
    fh = h >> levels
    fw = w >> levels
    pos = offset

    # 1. Reconstrucción de la sub-banda LL con predictor MED (JPEG-LS)
    ll_rec = np.zeros((fh, fw), dtype=np.int32)
    for y in range(fh):
        for x in range(fw):
            diff = int(flat[pos])
            pos += 1
            pred = 0
            if x > 0 and y > 0:
                left = int(ll_rec[y, x - 1])
                top = int(ll_rec[y - 1, x])
                top_left = int(ll_rec[y - 1, x - 1])
                min_lt = min(left, top)
                max_lt = max(left, top)
                if top_left >= max_lt:
                    pred = min_lt
                elif top_left <= min_lt:
                    pred = max_lt
                else:
                    pred = left + top - top_left
            elif x > 0:
                pred = int(ll_rec[y, x - 1])
            elif y > 0:
                pred = int(ll_rec[y - 1, x])

            val = diff + pred
            ll_rec[y, x] = val
            plane[y, x] = val

    # 2. Desempacar y descuantizar las sub-bandas [HL, LH, HH] por cada nivel
    for lev in range(levels):
        hh = h >> lev
        ww = w >> lev
        hy = hh >> 1
        hx = ww >> 1
        b_len = hy * hx

        q_hl = get_subband_step_v2(base_step, lev, is_chroma, chroma_ratio, False)
        q_hh = get_subband_step_v2(base_step, lev, is_chroma, chroma_ratio, True)

        # Sub-banda HL (arriba-derecha)
        hl_q = flat[pos:pos + b_len].reshape((hy, hx))
        pos += b_len
        plane[:hy, hx:ww] = dequantize_centroid_v2(hl_q, q_hl) if base_step > 1 else hl_q

        # Sub-banda LH (abajo-izquierda)
        lh_q = flat[pos:pos + b_len].reshape((hy, hx))
        pos += b_len
        plane[hy:hh, :hx] = dequantize_centroid_v2(lh_q, q_hl) if base_step > 1 else lh_q

        # Sub-banda HH (abajo-derecha)
        hh_q = flat[pos:pos + b_len].reshape((hy, hx))
        pos += b_len
        plane[hy:hh, hx:ww] = dequantize_centroid_v2(hh_q, q_hh) if base_step > 1 else hh_q

    # 3. Transformada Wavelet Inversa CDF 5/3 2D (primero columnas, luego filas)
    col_buf = np.zeros(h, dtype=np.int32)
    row_buf = np.zeros(w, dtype=np.int32)
    for lev in range(levels - 1, -1, -1):
        hh = h >> lev
        ww = w >> lev
        # Columnas
        for x in range(ww):
            col_buf[:hh] = plane[:hh, x]
            cdf53_inverse_1d_inplace(col_buf, hh)
            plane[:hh, x] = col_buf[:hh]
        # Filas
        for y in range(hh):
            row_buf[:ww] = plane[y, :ww]
            cdf53_inverse_1d_inplace(row_buf, ww)
            plane[y, :ww] = row_buf[:ww]

    return plane, pos


def decode_elyx_v2_buffer_to_rgb(raw_decompressed_bytes: bytes, header: dict) -> np.ndarray:
    """
    FUNCIÓN PRINCIPAL QUE PIDE EL AGENTE:
    Toma el buffer descomprimido (`raw_decompressed_bytes`) y el `header` JSON de ElyX v2,
    y devuelve un array NumPy uint8 de forma `(height, width, 3)` con los píxeles RGB.
    """
    w = int(header["width"])
    h = int(header["height"])
    levels = int(header.get("levels", 3))
    step = int(header.get("step", 1))
    chroma_ratio = float(header.get("chroma_ratio", 2.0))

    total_coeffs = w * h * 3
    expected_bytes = total_coeffs * 2
    if len(raw_decompressed_bytes) != expected_bytes:
        raise ValueError(f"Tamaño de buffer inválido: esperado {expected_bytes}, recibido {len(raw_decompressed_bytes)}")

    # 1. Reconstruir enteros con signo de 16 bits desde los planos de bytes (lo / hi) + ZigZag
    lo = np.frombuffer(raw_decompressed_bytes, dtype=np.uint8, count=total_coeffs).astype(np.uint16)
    hi = np.frombuffer(raw_decompressed_bytes, dtype=np.uint8, offset=total_coeffs, count=total_coeffs).astype(np.uint16)
    zz = (lo | (hi << 8)).astype(np.int32)
    flat = (zz >> 1) ^ -(zz & 1)

    # 2. Desempacar e invertir Wavelet 2D para cada canal (Y, Co, Cg)
    y_plane, next_off = unpack_and_inverse_wavelet_2d_v2(flat, 0, w, h, levels, step, False, chroma_ratio)
    co_plane, next_off = unpack_and_inverse_wavelet_2d_v2(flat, next_off, w, h, levels, step, True, chroma_ratio)
    cg_plane, _ = unpack_and_inverse_wavelet_2d_v2(flat, next_off, w, h, levels, step, True, chroma_ratio)

    # 3. Conversión inversa de color YCoCg-R -> RGB8
    t = y_plane - (cg_plane >> 1)
    g = cg_plane + t
    b = t - (co_plane >> 1)
    r = co_plane + b

    rgb = np.stack([r, g, b], axis=2)
    return np.clip(rgb, 0, 255).astype(np.uint8)


# =====================================================================
# 2. VERSIÓN JAVASCRIPT / TYPESCRIPT (Si Prisma decodifica en JS/WebWorker)
# =====================================================================

JS_DECODER_SNIPPET = """
// Pega estas funciones en el decodificador JS/TS de Prisma para soportar ElyX v2:

function clamp8(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function yCoCgRToRgb(y, co, cg) {
  const t = y - (cg >> 1);
  const g = clamp8(cg + t);
  const b = clamp8(t - (co >> 1));
  const r = clamp8(co + b);
  return [r, g, b];
}

function cdf53Inverse1D(signal, length) {
  if (length < 2) return;
  const half = length >> 1;
  const temp = new Int32Array(length);
  for (let i = 0; i < length; i++) temp[i] = signal[i];

  for (let i = 0; i < half; i++) {
    const dLeft = i > 0 ? temp[half + i - 1] : temp[half + i];
    const dCurr = temp[half + i];
    temp[i] -= (dLeft + dCurr + 2) >> 2;
  }

  for (let i = 0; i < half; i++) {
    const evenLeft = temp[i];
    const evenRight = i + 1 < half ? temp[i + 1] : temp[i];
    temp[half + i] += (evenLeft + evenRight) >> 1;
  }

  for (let i = 0; i < half; i++) {
    signal[2 * i] = temp[i];
    signal[2 * i + 1] = temp[half + i];
  }
}

function getSubbandStep(baseStep, level, isChroma, chromaRatio, isHH) {
  if (baseStep <= 1) return 1;
  const levelMultipliers = [1.85, 1.15, 0.75];
  let q = baseStep * (levelMultipliers[level] || 1.0);
  if (isChroma) q *= chromaRatio;
  if (isHH) q *= 1.65;
  return Math.max(1, Math.round(q));
}

function dequantizeCentroid(qv, q) {
  if (q <= 1 || qv === 0) return qv;
  const sign = qv < 0 ? -1 : 1;
  const absQ = Math.abs(qv);
  const threshold = Math.floor(q * 1.35);
  return sign * Math.round(threshold + (absQ - 0.65) * q);
}

function unpackAndInverseWavelet2D(flat, offset, w, h, levels, baseStep, isChroma, chromaRatio) {
  const plane = new Int32Array(w * h);
  const fh = h >> levels;
  const fw = w >> levels;
  let pos = offset;

  // 1. Reconstruir banda base LL con predictor MED
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

  // 2. Desempacar y descuantizar sub-bandas HL, LH, HH por nivel
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

  // 3. Wavelet Inversa CDF 5/3 2D
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

/**
 * FUNCIÓN PRINCIPAL JS: Recibe el Uint8Array descomprimido (rawPlanes) y el objeto header JSON,
 * y devuelve un Uint8ClampedArray RGBA listo para ImageData(rgba, header.width, header.height).
 */
export function decodeElyxV2BufferToRGBA(rawPlanes, header) {
  const w = header.width;
  const h = header.height;
  const lv = header.levels || 3;
  const st = header.step || 1;
  const cr = header.chroma_ratio || 2.0;

  const totalCoeffs = w * h * 3;
  const flat = new Int32Array(totalCoeffs);
  for (let i = 0; i < totalCoeffs; i++) {
    const lo = rawPlanes[i];
    const hi = rawPlanes[totalCoeffs + i];
    const zz = lo | (hi << 8);
    flat[i] = (zz >>> 1) ^ -(zz & 1);
  }

  const decY = unpackAndInverseWavelet2D(flat, 0, w, h, lv, st, false, cr);
  const decCo = unpackAndInverseWavelet2D(flat, decY.nextOffset, w, h, lv, st, true, cr);
  const decCg = unpackAndInverseWavelet2D(flat, decCo.nextOffset, w, h, lv, st, true, cr);

  const rgbaOut = new Uint8ClampedArray(w * h * 4);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const [r, g, b] = yCoCgRToRgb(decY.plane[p], decCo.plane[p], decCg.plane[p]);
    rgbaOut[i] = r;
    rgbaOut[i + 1] = g;
    rgbaOut[i + 2] = b;
    rgbaOut[i + 3] = 255;
  }
  return rgbaOut;
}
"""