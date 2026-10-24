// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import { CRC32_TABLE } from './constants';

export function crc32Bytes(uint8Arr: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < uint8Arr.length; i++) {
    crc = CRC32_TABLE[(crc ^ uint8Arr[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Comprime con DEFLATE (formato zlib).
 *
 * La escritura al stream no se espera antes de cerrar: si el lector falla
 * primero, la promesa de `write()` quedaría rechazada sin manejar y rompería
 * el proceso. Por eso se encadena en una promesa aparte que siempre tiene un
 * manejador, y se aborta el stream si la lectura falla.
 */
export async function compressDeflateBytes(uint8Array: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return uint8Array;

  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  const response = new Response(cs.readable);

  const pump = (async () => {
    await writer.write(uint8Array);
    await writer.close();
  })();
  pump.catch(() => { /* el error real se propaga desde la lectura */ });

  try {
    const buf = await response.arrayBuffer();
    await pump;
    return new Uint8Array(buf);
  } catch (err) {
    await writer.abort(err).catch(() => { /* el stream ya está roto */ });
    throw err;
  }
}

/**
 * Descomprime con DEFLATE (formato zlib). Lanza si el flujo está corrupto.
 * Mismo cuidado con promesas rechazadas sin manejar que en la compresión.
 */
export async function decompressDeflateBytes(uint8Array: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') return uint8Array;

  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  const response = new Response(ds.readable);

  const pump = (async () => {
    await writer.write(uint8Array);
    await writer.close();
  })();
  pump.catch(() => { /* el error real se propaga desde la lectura */ });

  try {
    const buf = await response.arrayBuffer();
    await pump;
    return new Uint8Array(buf);
  } catch (err) {
    await writer.abort(err).catch(() => { /* el stream ya está roto */ });
    throw err;
  }
}
