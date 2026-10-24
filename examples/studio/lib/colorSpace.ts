// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import { clamp8 } from './constants';

export function rgbToYCoCgR(r: number, g: number, b: number): [number, number, number] {
  const co = r - b;
  const t = b + (co >> 1);
  const cg = g - t;
  const y = t + (cg >> 1);
  return [y, co, cg];
}

export function yCoCgRToRgb(y: number, co: number, cg: number): [number, number, number] {
  const t = y - (cg >> 1);
  const g = cg + t;
  const b = t - (co >> 1);
  const r = co + b;
  // El recorte va al final: `r` depende del valor sin recortar de `b`.
  // Recortar `b` antes cambiaría `r` en los casos fuera de rango, que es
  // justo donde el decodificador de Python (`_color(..., True)`) difiere.
  return [clamp8(r), clamp8(g), clamp8(b)];
}
