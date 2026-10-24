// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
export const clamp8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

export const ELYX_MAGIC = new Uint8Array([0x45, 0x4c, 0x59, 0x58, 0x0d, 0x0a, 0x1a, 0x0a]);

export const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();
