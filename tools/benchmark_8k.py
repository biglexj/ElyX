#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ELYX Laboratory 8K: reproducible, full-resolution rate/distortion benchmark.

This is an independent *Python port of the CDF 5/3 + Stein preprocessing idea*.
It is NOT the complete ELYX codec: the final ELYX-Lab file still uses WebP.

Usage:
  python -m pip install -U pillow numpy
  python elyx_benchmark_8k.py --download --qualities 72,84
  python elyx_benchmark_8k.py --input "my_photo.jpg" --qualities 72,84,92

Camera photograph: 20250905 Canon R5 Peyto Lake-6145.jpg by Balon Greyjoy,
https://commons.wikimedia.org/wiki/File:20250905_Canon_R5_Peyto_Lake-6145.jpg
CC BY-SA 3.0 (attribution and share alike apply to transformed images).
"""
import argparse
import csv
import json
import math
import os
from pathlib import Path
import struct
import sys
import time
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image, features

PHOTO_URL = (
    "https://upload.wikimedia.org/wikipedia/commons/1/1a/"
    "20250905_Canon_R5_Peyto_Lake-6145.jpg"
)
PHOTO_NAME = "Peyto_Lake_Canon_R5_8K_original.jpg"


def download_original(folder: Path) -> Path:
    path = folder / PHOTO_NAME
    if path.exists() and path.stat().st_size > 0:
        print(f"Imagen presente: {path}")
        return path
    print("Descargando original 8192x5464 desde Wikimedia Commons...")
    req = Request(PHOTO_URL, headers={"User-Agent": "ELYX-Lab/0.1 (image-format comparative research)"})
    with urlopen(req, timeout=120) as r, path.open("wb") as f:
        while True:
            chunk = r.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
    print(f"Descargado: {path.stat().st_size / 1048576:.2f} MiB")
    return path


def fwd_1d(a: np.ndarray, axis: int):
    """Integer CDF 5/3 lifting with replicated boundaries and even-sized axis."""
    even = np.take(a, np.arange(0, a.shape[axis], 2), axis=axis)
    odd = np.take(a, np.arange(1, a.shape[axis], 2), axis=axis)
    assert even.shape == odd.shape
    next_even = np.concatenate((np.take(even, np.arange(1, even.shape[axis]), axis=axis),
                                np.take(even, [-1], axis=axis)), axis=axis)
    d = odd - ((even + next_even) >> 1)
    prev_d = np.concatenate((np.take(d, [0], axis=axis),
                             np.take(d, np.arange(d.shape[axis] - 1), axis=axis)), axis=axis)
    s = even + ((prev_d + d + 2) >> 2)
    return np.concatenate((s, d), axis=axis)


def inv_1d(a: np.ndarray, axis: int):
    half = a.shape[axis] // 2
    s = np.take(a, np.arange(half), axis=axis)
    d = np.take(a, np.arange(half, half * 2), axis=axis)
    prev_d = np.concatenate((np.take(d, [0], axis=axis),
                             np.take(d, np.arange(half - 1), axis=axis)), axis=axis)
    even = s - ((prev_d + d + 2) >> 2)
    next_even = np.concatenate((np.take(even, np.arange(1, half), axis=axis),
                                np.take(even, [-1], axis=axis)), axis=axis)
    odd = d + ((even + next_even) >> 1)
    out_shape = list(a.shape)
    out = np.empty(out_shape, dtype=np.int32)
    sl_even = [slice(None)] * a.ndim
    sl_odd = [slice(None)] * a.ndim
    sl_even[axis] = slice(0, None, 2)
    sl_odd[axis] = slice(1, None, 2)
    out[tuple(sl_even)] = even
    out[tuple(sl_odd)] = odd
    return out


def stein_coefficients(a: np.ndarray, tau: int) -> np.ndarray:
    if tau <= 0:
        return a
    # Same general non-negative-garrote family as the ELYX concept.
    magnitude = np.abs(a)
    result = np.zeros_like(a)
    mask = magnitude > tau
    result[mask] = np.sign(a[mask]) * np.rint(
        magnitude[mask].astype(np.float32) - (tau * tau) / magnitude[mask]
    ).astype(np.int32)
    return result


def preprocess_tile(tile: Image.Image, tau: int) -> Image.Image:
    original = np.asarray(tile.convert("RGB"), dtype=np.uint8)
    h, w = original.shape[:2]
    h_even, w_even = h & ~1, w & ~1
    out = original.copy()
    for c in range(3):
        plane = original[:h_even, :w_even, c].astype(np.int32)
        transformed = fwd_1d(fwd_1d(plane, axis=1), axis=0)
        hy, hx = h_even // 2, w_even // 2
        transformed[:hy, hx:] = stein_coefficients(transformed[:hy, hx:], tau)
        transformed[hy:, :hx] = stein_coefficients(transformed[hy:, :hx], tau)
        transformed[hy:, hx:] = stein_coefficients(transformed[hy:, hx:], tau)
        reconstructed = inv_1d(inv_1d(transformed, axis=0), axis=1)
        out[:h_even, :w_even, c] = np.clip(reconstructed, 0, 255).astype(np.uint8)
    return Image.fromarray(out, mode="RGB")


def elyx_preprocess(src: Image.Image, tau: int, tile_size: int) -> Image.Image:
    """Tile-wise for low memory: differs at tile boundaries from full-frame ELYX Studio."""
    if tile_size < 32 or tile_size % 2:
        raise ValueError("--tile debe ser par y >= 32")
    dst = Image.new("RGB", src.size)
    w, h = src.size
    for y in range(0, h, tile_size):
        for x in range(0, w, tile_size):
            bbox = (x, y, min(w, x + tile_size), min(h, y + tile_size))
            dst.paste(preprocess_tile(src.crop(bbox), tau), (x, y))
        print(f"  Preprocesamiento: {min(y+tile_size,h)}/{h} líneas", end="\r", flush=True)
    print()
    return dst


def with_elyx_marker(webp: Path, output: Path, tau: int, quality: int, source: str):
    payload = json.dumps({"format": "ELYX-LAB-PREFILTER-0.1", "tau": tau,
                          "webp_quality": quality, "source": source},
                         separators=(",", ":")).encode("utf-8")
    b = bytearray(webp.read_bytes())
    if b[:4] != b"RIFF" or b[8:12] != b"WEBP":
        raise RuntimeError("Salida WebP inválida")
    pad = b"\0" if len(payload) & 1 else b""
    chunk = b"ELYX" + struct.pack("<I", len(payload)) + payload + pad
    struct.pack_into("<I", b, 4, struct.unpack_from("<I", b, 4)[0] + len(chunk))
    output.write_bytes(b + chunk)


def psnr_mae(reference: Image.Image, candidate_path: Path, strip_height: int = 128):
    """Whole-image RGB PSNR + MAE, bounded temporary NumPy allocation."""
    with Image.open(candidate_path) as f:
        if f.size != reference.size:
            raise AssertionError(f"RESOLUCIÓN ALTERADA {f.size}, esperado {reference.size}")
        cmp = f.convert("RGB")
    w, h = reference.size
    sum_sq = 0.0
    sum_abs = 0.0
    for y in range(0, h, strip_height):
        bbox = (0, y, w, min(h, y + strip_height))
        a = np.asarray(reference.crop(bbox), dtype=np.int16)
        b = np.asarray(cmp.crop(bbox), dtype=np.int16)
        d = a.astype(np.float32) - b
        sum_sq += float(np.sum(d*d, dtype=np.float64))
        sum_abs += float(np.sum(np.abs(d), dtype=np.float64))
    n = w*h*3
    mse = sum_sq/n
    return (float("inf") if mse == 0 else 10*math.log10(255**2/mse)), sum_abs/n


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", type=Path, help="Ruta a una foto JPG/PNG ya descargada")
    parser.add_argument("--download", action="store_true", help="Descargar foto 8K de Wikimedia")
    parser.add_argument("--qualities", default="72,84", help="Calidades (e.g. 70,80,90)")
    parser.add_argument("--tau", type=int, default=5, help="Umbral Stein para ELYX-Lab")
    parser.add_argument("--tile", type=int, default=512, help="Tamaño del bloque en píxeles (par)")
    parser.add_argument("--method", type=int, default=4, help="Esfuerzo WebP 0..6 (6 tarda más)")
    parser.add_argument("--out", type=Path, default=Path("elyx_benchmark_8k_resultados"))
    parser.add_argument("--skip-avif", action="store_true", help="No comparar AVIF")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    image_path = args.input or download_original(args.out) if (args.download or not args.input) else args.input
    if image_path is None or not image_path.exists():
        parser.error("Indica --input o --download")
    source_size = image_path.stat().st_size
    src = Image.open(image_path).convert("RGB")
    print(f"Fuente: {image_path.name}: {src.width} x {src.height}; {source_size/1048576:.2f} MiB")
    print("Referencia: JPEG procesado (NO RAW); PSNR medido frente a ese JPEG decodificado.")
    t0 = time.monotonic()
    processed = elyx_preprocess(src, args.tau, args.tile)
    print(f"Prefiltro ELYX-Lab: {time.monotonic()-t0:.1f} s (procesamiento en bloques)")
    qualities = [int(x) for x in args.qualities.split(",")]
    if any(x < 1 or x > 100 for x in qualities):
        parser.error("Calidades deben estar entre 1 y 100")
    rows = []
    for q in qualities:
        variants = [("webp", src, "WEBP"), ("elyx_prefilter_webp", processed, "WEBP")]
        if not args.skip_avif and features.check("avif"):
            variants.append(("avif", src, "AVIF"))
        for name, img, fmt in variants:
            ext = ".avif" if fmt == "AVIF" else ".webp"
            name_out = f"Peyto_8K_{name}_Q{q}{ext}"
            path = args.out / name_out
            t1 = time.monotonic()
            opts = {"quality": q}
            if fmt == "WEBP":
                opts["method"] = args.method
            else:
                opts["speed"] = 8
            try:
                img.save(path, format=fmt, **opts)
            except Exception as exc:
                print(f"Aviso: {fmt} Q{q} no pudo codificarse: {exc}")
                continue
            if name.startswith("elyx_"):
                annotated = args.out / f"Peyto_8K_elyx_lab_Q{q}.elx.webp"
                with_elyx_marker(path, annotated, args.tau, q, image_path.name)
                path.unlink()  # keep only the annotated output to avoid duplicate disk usage
                path = annotated
            psnr, mae = psnr_mae(src, path)
            secs = time.monotonic() - t1
            row = {"codec": name, "quality_parameter": q, "width": src.width,
                   "height": src.height, "bytes": path.stat().st_size,
                   "MiB": round(path.stat().st_size/1048576, 3),
                   "PSNR_dB_vs_source_JPEG": round(psnr, 3),
                   "MAE_RGB_vs_source_JPEG": round(mae, 4),
                   "seconds_including_metric": round(secs, 2), "file": str(path)}
            rows.append(row)
            print(f"{name:20} Q{q:3d}: {row['MiB']:8.3f} MiB | "
                  f"{psnr:6.2f} dB | MAE {mae:5.2f} | {secs:6.1f}s")
    out_csv = args.out / "elyx_8k_resultados.csv"
    if not rows:
        raise RuntimeError("Ningún codificador pudo generar un archivo")
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nTerminado. Informe CSV: {out_csv}")
    print("IMPORTANTE: no comparar niveles Q entre códecs como si fuesen calidad visual igual.")
    print("Comparar puntos cercanos de PSNR/SSIM, y luego elegir menor tamaño a igual fidelidad.")
    print("ELYX-Lab usa WebP + prefiltro, todavía NO es un códec ELYX independiente.")


if __name__ == "__main__":
    main()
