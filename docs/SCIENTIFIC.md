# ElyX (`.elx`) — Native Wavelet Image Codec & Visual Comparison Studio

![Version](https://img.shields.io/badge/ElyX_Spec-v1_%26_v2-00D4AA?style=flat-square&labelColor=090A0D)
![Wavelet](https://img.shields.io/badge/Wavelet-CDF_5%2F3_Lifting-00D4AA?style=flat-square&labelColor=090A0D)
![ColorSpace](https://img.shields.io/badge/Color-YCoCg--R_Integer-00D4AA?style=flat-square&labelColor=090A0D)
![License](https://img.shields.io/badge/License-MIT-00D4AA?style=flat-square&labelColor=090A0D)

**ElyX** is an experimental, standalone image codec built upon the **Cohen-Daubechies-Feauveau (CDF) 5/3 Discrete Wavelet Transform (DWT)** via integer lifting schemes, reversible integer color decorrelation **YCoCg-R**, non-linear **MED (Median Edge Detector)** prediction, and psycho-visual **Double Dead-Zone** quantization.

Unlike traditional block-based DCT codecs ($8 \times 8$ pixel grids such as JPEG or WebP), **ElyX** decomposes the image signal into multi-resolution sub-bands without introducing blocking artifacts. It supports everything from **100% mathematically lossless reconstruction (`step = 1`)** to high-density lossy compression designed for 8K photography and digital illustrations.

---

## Table of Contents

1. [Scientific and Mathematical Architecture](#1-scientific-and-mathematical-architecture)
   - [1.1 Reversible Color Space Decorrelation (YCoCg-R)](#11-reversible-color-space-decorrelation-ycocg-r)
   - [1.2 CDF 5/3 2D Lifting Discrete Wavelet Transform](#12-cdf-53-2d-lifting-discrete-wavelet-transform)
   - [1.3 Double Dead-Zone Psycho-Visual Quantization & Centroid Reconstruction](#13-double-dead-zone-psycho-visual-quantization--centroid-reconstruction)
   - [1.4 Non-Linear MED Prediction (JPEG-LS) on Base Sub-band $LL_3$](#14-non-linear-med-prediction-jpeg-ls-on-base-sub-band-ll_3)
   - [1.5 16-bit ZigZag Mapping & Byte Plane Separation (`lo` / `hi`)](#15-16-bit-zigzag-mapping--byte-plane-separation-lo--hi)
2. [Binary Container Specification (`.elx`)](#2-binary-container-specification-elx)
3. [Experimental Results in 8K ($8192 \times 5464$ — $44.76\text{ MP}$)](#3-experimental-results-in-8k-8192-times-5464--4476-text-mp)
4. [Ecosystem Documentation Index](#4-ecosystem-documentation-index)

---

## 1. Scientific and Mathematical Architecture

ElyX's encoding pipeline operates entirely within deterministic 32-bit integer arithmetic (`int32`), eliminating floating-point drift across hardware architectures and programming languages (Python NumPy vs JavaScript TypedArrays).

### 1.1 Reversible Color Space Decorrelation (YCoCg-R)

RGB channels exhibit high statistical correlation. Conventional $YCbCr$ transformations require floating-point multiplications that introduce rounding errors, breaking strict losslessness. **ElyX** implements **YCoCg-R** (*Reversible Luma / Chrominance Orange / Chrominance Green*) via bit-shift lifting:

**Forward Transform ($\text{RGB} \rightarrow \text{YCoCg-R}$):**
$$Co = R - B$$
$$t = B + \lfloor Co / 2 \rfloor = B + (Co \gg 1)$$
$$Cg = G - t$$
$$Y = t + \lfloor Cg / 2 \rfloor = t + (Cg \gg 1)$$

**Inverse Transform ($\text{YCoCg-R} \rightarrow \text{RGB}$):**
$$t = Y - (Cg \gg 1)$$
$$G = Cg + t$$
$$B = t - (Co \gg 1)$$
$$R = Co + B$$

* **Reversibility:** Every integer triplet $(R, G, B)$ is perfectly recovered bit-for-bit without rounding loss.
* **Alpha Purging (`RGBA8`):** Fully transparent pixels ($\alpha = 0$) neutralize their chromatic vectors $(Y, Co, Cg) \leftarrow (0, 0, 0)$ prior to wavelet decomposition, preventing entropy waste in invisible areas.

---

### 1.2 CDF 5/3 2D Lifting Discrete Wavelet Transform

Each plane ($Y, Co, Cg$) undergoes an $L = 3$ pyramid decomposition using the bi-orthogonal **CDF 5/3** filter bank (the integer kernel used in medical imaging and JPEG 2000).

Given a 1D discrete signal $x[n]$ of even length $N$, split into even samples $s_0[i] = x[2i]$ and odd samples $d_0[i] = x[2i+1]$:

1. **Predict Step (High-Pass Detail $d[i]$):**
   $$d[i] = d_0[i] - \left\lfloor \frac{s_0[i] + s_0[i+1]}{2} \right\rfloor$$
2. **Update Step (Low-Pass Approximation $s[i]$):**
   $$s[i] = s_0[i] + \left\lfloor \frac{d[i-1] + d[i] + 2}{4} \right\rfloor$$

Applying this separable operator across rows and columns partitions the signal into:
* **$LL_\ell$:** Low-frequency approximation (recursively subdivided up to $LL_3$, occupying $\approx 1.56\%$ of total area).
* **$HL_\ell, LH_\ell, HH_\ell$:** High-frequency horizontal, vertical, and diagonal detail sub-bands.

---

### 1.3 Double Dead-Zone Psycho-Visual Quantization & Centroid Reconstruction

When `step > 1`, ElyX applies a sub-band specific quantization step $q(\ell, c, b)$:
$$q(\ell, c, b) = \max\left(1, \text{round}\left(\text{step} \times M_\ell \times K_c \times H_b\right)\right)$$

#### Double Dead-Zone Quantizer ($1.35\times$):
To suppress high-frequency sensor noise in smooth regions, the dead-zone threshold $\tau = \lfloor 1.35 \cdot q \rfloor$ is enforced:
$$Q(v, q) = \begin{cases} 0 & \text{si } |v| < \tau \\ \text{sgn}(v) \cdot \left(1 + \left\lfloor \frac{|v| - \tau}{q} \right\rfloor\right) & \text{si } |v| \ge \tau \end{cases}$$

#### Centroid Reconstruction:
$$\hat{v}(q_v, q) = \begin{cases} 0 & \text{si } q_v = 0 \\ \text{sgn}(q_v) \cdot \text{round}\left(\tau + (|q_v| - 0.65) \cdot q\right) & \text{si } q_v \neq 0 \end{cases}$$

---

### 1.4 Non-Linear MED Prediction (JPEG-LS) on Base Sub-band $LL_3$

To compress the continuous base band $LL_3$ losslessly, ElyX applies the **MED (*Median Edge Detector*)** predictor using neighbors $A = I(y, x-1)$, $B = I(y-1, x)$, and $C = I(y-1, x-1)$:
$$\hat{I}(y, x) = \begin{cases} \min(A, B) & \text{si } C \ge \max(A, B) \\ \max(A, B) & \text{si } C \le \min(A, B) \\ A + B - C & \text{en otro caso} \end{cases}$$

---

### 1.5 16-bit ZigZag Mapping & Byte Plane Separation (`lo` / `hi`)

Signed residuals are mapped to unsigned 16-bit integers via bi-jective ZigZag:
$$Z(v) = (v \ll 1) \oplus (v \gg 31) \pmod{2^{16}}$$
The resulting vector is split into `plano_LO` ($N$ bytes) and `plano_HI` ($N$ bytes), allowing DEFLATE to achieve $> 100:1$ compression ratios on high-order zero bytes.

---

## 2. Binary Container Specification (`.elx`)

```
Offset   Size      Type       Description
────────────────────────────────────────────────────────────────────────────────
0x00     8 bytes   uint8[8]   MAGIC: 45 4C 59 58 0D 0A 1A 0A ("ELYX\r\n\x1a\n")
0x08     4 bytes   uint32 LE  header_len: Length of JSON header
0x0C     N bytes   UTF-8      JSON Header metadata
────────────────────────────────────────────────────────────────────────────────
Payload Blocks:
+0x00    4 bytes   uint32 LE  payload_size: Compressed DEFLATE stream length
+0x04    4 bytes   uint32 LE  raw_crc32: IEEE CRC32 of decompressed buffer
+0x08    M bytes   uint8[]    DEFLATE stream [plano_LO | plano_HI]
```

---

## 3. Experimental Results in 8K ($8192 \times 5464$ — $44.76\text{ MP}$)

| Configuration | Resolution | Disk Size | Bits per Pixel ($\text{bpp}$) | Compression vs RAW | PSNR (dB) | SSIM (Y) | Bit-exactness |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Raw RGB8 Memory** | $8192 \times 5464$ | $128.06\text{ MiB}$ | $24.00\text{ bpp}$ | $0.0\%$ | $\infty$ | $1.000000$ | Reference |
| **ElyX Lossless (`step=1`)** | $8192 \times 5464$ | **$42.92\text{ MiB}$** | **$8.04\text{ bpp}$** | **$-66.5\%$** | **$\infty$** | **$1.000000$** | **`True` (SHA-256 match)** |
| **ElyX Perceptual (`step=8`)** | $8192 \times 5464$ | **$8.87\text{ MiB}$** | **$1.66\text{ bpp}$** | **$-93.1\%$** | **$40.95\text{ dB}$** | **$0.971193$** | Lossy controlled |

---

## 4. Ecosystem Documentation Index

* **[Guía de Uso y CLI](USER_GUIDE.md)**
* **[Guía de Integración con Prisma](PRISMA_INTEGRATION.md)**
* **[Licencia MIT](../LICENSE)**
* **[Changelog](../CHANGELOG.md)**