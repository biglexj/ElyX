// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj

/** Integer CDF 5/3 forward lifting step (1-D, in-place on signal). */
export function cdf53Forward1D(signal: Int32Array, length: number): void {
  if (length < 2) return;
  const half = length >> 1;
  const temp = new Int32Array(length);

  for (let i = 0; i < half; i++) {
    temp[i] = signal[2 * i];
    temp[half + i] = signal[2 * i + 1];
  }
  for (let i = 0; i < half; i++) {
    const evenLeft = temp[i];
    const evenRight = i + 1 < half ? temp[i + 1] : temp[i];
    temp[half + i] -= (evenLeft + evenRight) >> 1;
  }
  for (let i = 0; i < half; i++) {
    const dLeft = i > 0 ? temp[half + i - 1] : temp[half + i];
    const dCurr = temp[half + i];
    temp[i] += (dLeft + dCurr + 2) >> 2;
  }
  for (let i = 0; i < length; i++) signal[i] = temp[i];
}

/** Integer CDF 5/3 inverse lifting step (1-D, in-place on signal). */
export function cdf53Inverse1D(signal: Int32Array, length: number): void {
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
