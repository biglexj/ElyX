# SPDX-License-Identifier: MIT
# Copyright (c) 2026 biglexj
"""ElyX 0.1 — experimental RGB8 wavelet codec.

Pipeline: reversible YCoCg-R color decorrelation → 3-level integer CDF 5/3
DWT → optional scalar detail quantization → signed 16-bit ZigZag mapping →
byte-plane separation (lo/hi) → zlib DEFLATE entropy stage.

No WebP / AV1 / JXL encapsulation.  Not production-ready.

Public API
----------
encode(input_path, output_path, step=1, tile=512, levels=3) -> dict
decode(input_path) -> (PIL.Image.Image, dict)
"""

import argparse
import hashlib
import json
import struct
import zlib
from pathlib import Path

import numpy as np
from PIL import Image

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAGIC = b'ELYX\r\n\x1a\n'
MAX_PIXELS = 60_000_000


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _pixel_hash(img: Image.Image) -> str:
    """SHA-256 of all RGB pixel bytes, streamed in 128-row strips."""
    h = hashlib.sha256()
    for y in range(0, img.height, 128):
        h.update(img.crop((0, y, img.width, min(y + 128, img.height))).tobytes())
    return h.hexdigest()


def _lift(a: np.ndarray, axis: int, inverse: bool = False) -> np.ndarray:
    """1-D integer CDF 5/3 lifting step along *axis* (forward or inverse)."""
    n = a.shape[axis] // 2
    if not inverse:
        e = np.take(a, np.arange(0, n * 2, 2), axis=axis)
        d = np.take(a, np.arange(1, n * 2, 2), axis=axis)
        nxt = np.concatenate(
            [np.take(e, np.arange(1, n), axis=axis), np.take(e, [-1], axis=axis)],
            axis=axis,
        )
        d = d - ((e + nxt) >> 1)
        prev = np.concatenate(
            [np.take(d, [0], axis=axis), np.take(d, np.arange(n - 1), axis=axis)],
            axis=axis,
        )
        return np.concatenate([e + ((prev + d + 2) >> 2), d], axis=axis)

    s = np.take(a, np.arange(n), axis=axis)
    d = np.take(a, np.arange(n, n * 2), axis=axis)
    prev = np.concatenate(
        [np.take(d, [0], axis=axis), np.take(d, np.arange(n - 1), axis=axis)],
        axis=axis,
    )
    e = s - ((prev + d + 2) >> 2)
    nxt = np.concatenate(
        [np.take(e, np.arange(1, n), axis=axis), np.take(e, [-1], axis=axis)],
        axis=axis,
    )
    odd = d + ((e + nxt) >> 1)
    out = np.empty_like(a)
    sl: list = [slice(None)] * a.ndim
    sl[axis] = slice(0, None, 2)
    out[tuple(sl)] = e
    sl[axis] = slice(1, None, 2)
    out[tuple(sl)] = odd
    return out


def _transform(a: np.ndarray, levels: int, step: int, inverse: bool = False) -> np.ndarray:
    """Multi-level 2-D CDF 5/3 DWT with optional scalar detail quantization."""
    h, w = a.shape[:2]
    order = reversed(range(levels)) if inverse else range(levels)
    for lev in order:
        hh, ww = h >> lev, w >> lev
        hy, hx = hh // 2, ww // 2
        if inverse:
            if step > 1:
                a[:hy, hx:ww] *= step
                a[hy:hh, :ww] *= step
            a[:hh, :ww] = _lift(_lift(a[:hh, :ww], 0, True), 1, True)
        else:
            a[:hh, :ww] = _lift(_lift(a[:hh, :ww], 1), 0)
            if step > 1:
                for band in (a[:hy, hx:ww], a[hy:hh, :ww]):
                    band[:] = np.sign(band) * ((np.abs(band) + step // 2) // step)
    return a


def _color(a: np.ndarray, inverse: bool = False) -> np.ndarray:
    """Reversible YCoCg-R color decorrelation (forward or inverse)."""
    if inverse:
        y, co, cg = a[:, :, 0], a[:, :, 1], a[:, :, 2]
        t = y - (cg >> 1)
        g = cg + t
        b = t - (co >> 1)
        r = co + b
        return np.stack([r, g, b], axis=2)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    co = r - b
    t = b + (co >> 1)
    cg = g - t
    y = t + (cg >> 1)
    return np.stack([y, co, cg], axis=2)


def _read_exact(f, n: int) -> bytes:
    """Read exactly *n* bytes or raise ValueError."""
    b = f.read(n)
    if len(b) != n:
        raise ValueError('Archivo ELYX truncado')
    return b


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def encode(
    input_path: str | Path,
    output_path: str | Path,
    step: int = 1,
    tile: int = 512,
    levels: int = 3,
) -> dict:
    """Encode an RGB PNG/JPEG image to a native `.elx` container.

    Parameters
    ----------
    input_path:
        Source image (must be RGB 8-bit).
    output_path:
        Destination path for the `.elx` file.  The file must not exist
        (exclusive creation — no silent overwrites).
    step:
        Quantization step size.  ``step=1`` → lossless (bit-exact).
        ``step=8`` → high-compression perceptual mode.  Range: 1–64.
    tile:
        Tile size in pixels (square).  Range: 32–1024, multiple of
        ``2**levels``.
    levels:
        DWT decomposition levels.  Range: 1–4.

    Returns
    -------
    dict
        JSON header written into the file (contains pixel SHA-256 for
        lossless verification).
    """
    if not 1 <= step <= 64 or levels not in range(1, 5):
        raise ValueError('Parámetros inválidos: step ∈ [1,64], levels ∈ {1,2,3,4}')
    if not 32 <= tile <= 1024 or tile % (1 << levels):
        raise ValueError('Parámetros inválidos: tile ∈ [32,1024], múltiplo de 2^levels')

    with Image.open(input_path) as original:
        if original.mode != 'RGB':
            raise ValueError(
                'ElyX 0.1 soporta solo RGB de 8 bits; '
                'convierte la imagen antes (p.ej. img.convert("RGB"))'
            )
        img = original.copy()

    if img.width * img.height > MAX_PIXELS:
        raise ValueError(f'Límite de {MAX_PIXELS // 1_000_000} MP del prototipo')

    header = dict(
        version=1,
        width=img.width,
        height=img.height,
        mode='RGB8',
        tile=tile,
        levels=levels,
        step=step,
        color='YCoCg-R',
        wavelet='CDF53',
        entropy='zigzag16-byteplanes-deflate',
        pixel_sha256=_pixel_hash(img),
    )
    raw_header = json.dumps(header, separators=(',', ':'), sort_keys=True).encode('utf-8')

    with open(output_path, 'xb') as f:
        f.write(MAGIC + struct.pack('<I', len(raw_header)) + raw_header)
        for y in range(0, img.height, tile):
            for x in range(0, img.width, tile):
                a = np.asarray(
                    img.crop((x, y, min(x + tile, img.width), min(y + tile, img.height))),
                    dtype=np.int32,
                )
                hh, ww = a.shape[:2]
                unit = 1 << levels
                a = np.pad(a, ((0, (-hh) % unit), (0, (-ww) % unit), (0, 0)), mode='edge')
                a = _transform(_color(a), levels, step)
                if a.min() < -32768 or a.max() > 32767:
                    raise ValueError('Coeficiente fuera del rango int16 del formato')
                zz = ((a << 1) ^ (a >> 31)).astype(np.uint16).transpose(2, 0, 1).ravel()
                raw = (zz & 255).astype(np.uint8).tobytes() + (zz >> 8).astype(np.uint8).tobytes()
                payload = zlib.compress(raw, 6)
                f.write(struct.pack('<II', len(payload), zlib.crc32(raw)))
                f.write(payload)

    img.close()
    return header


def decode(input_path: str | Path) -> tuple[Image.Image, dict]:
    """Decode a `.elx` file and return the reconstructed RGB image.

    Parameters
    ----------
    input_path:
        Path to a valid `.elx` container (version 1).

    Returns
    -------
    (PIL.Image.Image, dict)
        Reconstructed RGB image and the parsed JSON header.
        In lossless mode (``step=1``) the SHA-256 of the output pixels
        is verified against the value stored in the header.
    """
    with open(input_path, 'rb') as f:
        if _read_exact(f, 8) != MAGIC:
            raise ValueError('Firma ELYX inválida')
        hn = struct.unpack('<I', _read_exact(f, 4))[0]
        if not 2 <= hn <= 65536:
            raise ValueError('Longitud de cabecera fuera de rango')
        h = json.loads(_read_exact(f, hn))
        w, ht, tile, levels, step = (h[k] for k in ['width', 'height', 'tile', 'levels', 'step'])
        if any(type(v) is not int for v in [w, ht, tile, levels, step]):
            raise ValueError('Tipos inválidos en cabecera')
        if (
            h.get('version') != 1
            or h.get('mode') != 'RGB8'
            or h.get('color') != 'YCoCg-R'
            or h.get('wavelet') != 'CDF53'
            or h.get('entropy') != 'zigzag16-byteplanes-deflate'
        ):
            raise ValueError('Versión o herramientas no compatibles')
        if (
            min(w, ht) < 1
            or w * ht > MAX_PIXELS
            or not 1 <= step <= 64
            or levels not in range(1, 5)
            or not 32 <= tile <= 1024
            or tile % (1 << levels)
        ):
            raise ValueError('Dimensiones o parámetros inválidos')

        dst = Image.new('RGB', (w, ht))
        unit = 1 << levels
        for y in range(0, ht, tile):
            for x in range(0, w, tile):
                hh, ww = min(tile, ht - y), min(tile, w - x)
                ph, pw = hh + (-hh) % unit, ww + (-ww) % unit
                n = ph * pw * 3
                expected = n * 2
                size, crc = struct.unpack('<II', _read_exact(f, 8))
                if not 1 <= size <= expected + 65536:
                    raise ValueError('Tamaño de bloque excesivo')
                payload = _read_exact(f, size)
                dec = zlib.decompressobj()
                raw = dec.decompress(payload, expected + 1)
                if (
                    len(raw) != expected
                    or not dec.eof
                    or dec.unused_data
                    or dec.unconsumed_tail
                    or zlib.crc32(raw) != crc
                ):
                    raise ValueError('Bloque corrupto o longitud inválida')
                lo = np.frombuffer(raw, dtype=np.uint8, count=n).astype(np.uint16)
                hi = np.frombuffer(raw, dtype=np.uint8, offset=n).astype(np.uint16)
                zz = (lo | (hi << 8)).astype(np.int32)
                a = ((zz >> 1) ^ -(zz & 1)).reshape(3, ph, pw).transpose(1, 2, 0).copy()
                a = _color(_transform(a, levels, step, True), True)
                if step == 1 and (a.min() < 0 or a.max() > 255):
                    raise ValueError('RGB lossless fuera de rango')
                dst.paste(
                    Image.fromarray(np.clip(a[:hh, :ww], 0, 255).astype(np.uint8)),
                    (x, y),
                )
        if f.read(1):
            raise ValueError('Datos sobrantes al final del archivo')

    if step == 1 and _pixel_hash(dst) != h.get('pixel_sha256'):
        raise ValueError('SHA-256 de píxeles reconstruidos no coincide con la cabecera')
    return dst, h


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _cli_main() -> None:
    """Command-line interface entry point (registered as `elyx` by pyproject.toml)."""
    parser = argparse.ArgumentParser(
        prog='elyx',
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest='action', required=True)

    enc = sub.add_parser('encode', help='Encode an image to .elx')
    enc.add_argument('input', help='Source image (PNG / JPEG, RGB 8-bit)')
    enc.add_argument('output', help='Output .elx path (must not exist)')
    enc.add_argument('--step', type=int, default=1,
                     help='Quantization step: 1=lossless, 8=perceptual (default: 1)')
    enc.add_argument('--tile', type=int, default=512,
                     help='Tile size in pixels (default: 512)')

    dec = sub.add_parser('decode', help='Decode a .elx file to PNG')
    dec.add_argument('input', help='Source .elx file')
    dec.add_argument('output', help='Output PNG path (must not exist)')

    args = parser.parse_args()

    if args.action == 'encode':
        header = encode(args.input, args.output, step=args.step, tile=args.tile)
        print(json.dumps(header, indent=2, ensure_ascii=False))
    else:
        image, header = decode(args.input)
        with open(args.output, 'xb') as f:
            image.save(f, format='PNG')
        print(json.dumps(header, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    _cli_main()
