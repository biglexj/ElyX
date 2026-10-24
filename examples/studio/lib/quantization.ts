// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj

/**
 * Redondeo "half to even", idéntico a `np.rint` de numpy.
 *
 * `Math.round` de JavaScript redondea .5 hacia arriba; numpy redondea al par
 * más cercano. `decoder_v2.py` usa `np.rint`, así que un coeficiente que cae
 * justo en .5 se cuantiza con un paso distinto en cada implementación. Esa
 * diferencia no es cosmética: el paso cambia, y con él la dead zone y la
 * reconstruction de toda la sub-banda.
 */
export function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function getSubbandStep(
  baseStep: number, level: number, isChroma: boolean,
  chromaRatio: number, isHH: boolean
): number {
  if (baseStep <= 1) return 1;
  const levelMultipliers = [1.85, 1.15, 0.75];
  let q = baseStep * (levelMultipliers[level] ?? 1.0);
  if (isChroma) q *= chromaRatio;
  if (isHH) q *= 1.65;
  return Math.max(1, roundHalfToEven(q));
}

export function quantizeDeadZone(val: number, q: number): number {
  if (q <= 1) return val;
  const absV = Math.abs(val);
  const threshold = Math.floor(q * 1.35);
  if (absV < threshold) return 0;
  const sign = val < 0 ? -1 : 1;
  return sign * (1 + Math.trunc((absV - threshold) / q));
}

export function dequantizeCentroid(qv: number, q: number): number {
  if (q <= 1 || qv === 0) return qv;
  const sign = qv < 0 ? -1 : 1;
  const absQ = Math.abs(qv);
  const threshold = Math.floor(q * 1.35);
  return sign * roundHalfToEven(threshold + (absQ - 0.65) * q);
}
