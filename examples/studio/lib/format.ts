// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import type { ColorChannel, MetaState, MetricsState, SideFormat, ViewMode } from '../types';

/** Formatea un tamaño en bytes como KB o MiB. */
export function formatSize(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MiB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Etiqueta corta de un lado de la cortina (formato + peso + calidad). */
export function formatLabelShort(
  fmt: SideFormat,
  meta: MetaState,
  metrics: MetricsState,
  webpQuality: number,
  step: number
): string {
  if (fmt === 'original') {
    return meta.uploadedFileBytes
      ? `ORIGINAL ${meta.uploadedFormat} (${formatSize(meta.uploadedFileBytes)} archivo / ${formatSize(metrics.rawBytes)} RAM)`
      : `ORIGINAL RAW (${formatSize(metrics.rawBytes)} · ∞ dB)`;
  }
  if (fmt === 'webp') {
    return `WEBP ${Math.round(webpQuality * 100)}% (${formatSize(metrics.webpBytes)} · ${metrics.psnrWebp} dB · ${metrics.bppWebp} bpp)`;
  }
  return `ELYX 0.2 s=${step} (${formatSize(metrics.elyxBytes)} · ${metrics.psnrElyx >= 90 ? '∞ dB' : metrics.psnrElyx + ' dB'} · ${metrics.bppElyx} bpp)`;
}

/** Rótulos de la barra inferior del lienzo según el modo de vista. */
export function getSplitLabels(
  viewMode: ViewMode,
  sideAFormat: SideFormat,
  sideBFormat: SideFormat,
  colorChannel: ColorChannel,
  metrics: MetricsState,
  meta: MetaState,
  webpQuality: number,
  step: number
): { left: string; right: string } {
  if (viewMode === 'normal') {
    return {
      left: `LADO A: ${formatLabelShort(sideAFormat, meta, metrics, webpQuality, step)}`,
      right: `LADO B: ${formatLabelShort(sideBFormat, meta, metrics, webpQuality, step)}`,
    };
  }
  if (viewMode === 'granular') {
    return {
      left: 'LADO A: DETALLE WAVELET BRUTO (Con grano de sensor)',
      right: `LADO B: ZONA MUERTA ELYX (${metrics.zeroPercent}% ceros exactos en negro)`,
    };
  }
  if (viewMode === 'colores') {
    const channels = colorChannel === 'all' ? 'Y | Co | Cg' : colorChannel;
    return {
      left: `LADO A (${sideAFormat.toUpperCase()}): YCoCg-R (${channels})`,
      right: `LADO B (${sideBFormat.toUpperCase()}): YCoCg-R (${channels})`,
    };
  }
  return {
    left: `LADO A: ERROR ×10 DE ${sideAFormat.toUpperCase()} VS ORIGINAL`,
    right: `LADO B: ERROR ×10 DE ${sideBFormat.toUpperCase()} VS ORIGINAL`,
  };
}
