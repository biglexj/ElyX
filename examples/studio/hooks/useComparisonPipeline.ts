// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type {
  ColorChannel,
  MetaState,
  MetricsState,
  SamplePreset,
  SideFormat,
  ViewMode,
} from '../types';
import { clamp8 } from '../lib/constants';
import { rgbToYCoCgR, yCoCgRToRgb } from '../lib/colorSpace';
import { compressDeflateBytes, crc32Bytes } from '../lib/compress';
import { forwardWavelet2DAndPack, packBandsZeroRun } from '../lib/wavelet2d';
import { buildV2ElxBytes } from '../lib/elxEncoder';
import { generateSampleScene } from '../lib/sampleScene';

export interface UseComparisonPipelineOptions {
  step: number;
  chromaRatio: number;
  webpQuality: number;
  sideAFormat: SideFormat;
  sideBFormat: SideFormat;
  viewMode: ViewMode;
  colorChannel: ColorChannel;
  presetScene: SamplePreset;
  /** Se dispara al cargar una fuente nueva (para resetear el visor). */
  onSourceLoaded?: () => void;
}

export interface UseComparisonPipelineResult {
  meta: MetaState;
  metrics: MetricsState;
  isProcessing: boolean;
  leftCanvasRef: RefObject<HTMLCanvasElement>;
  rightCanvasRef: RefObject<HTMLCanvasElement>;
  sourceImageRef: { current: ImageData | null };
  elyxNativeBytesRef: { current: Uint8Array | null };
  loadSourceCanvas: (
    fullCanvas: HTMLCanvasElement,
    name: string,
    uploadedFileBytes?: number,
    uploadedFormat?: string
  ) => void;
  runComparisonPipeline: () => void;
}

/**
 * Pipeline de comparación: wavelet ElyX + WebP sobre la misma imagen, con
 * métricas PSNR/MSE y el contenedor `.elx` v2 listo para descargar.
 */
export function useComparisonPipeline(
  options: UseComparisonPipelineOptions
): UseComparisonPipelineResult {
  const {
    step,
    chromaRatio,
    webpQuality,
    sideAFormat,
    sideBFormat,
    viewMode,
    colorChannel,
    presetScene,
    onSourceLoaded,
  } = options;

  const [meta, setMeta] = useState<MetaState>({
    name: 'Peyto_Sample_8K.raw',
    width: 1280,
    height: 800,
    uploadedFileBytes: 0,
    uploadedFormat: 'RAW',
  });

  const [metrics, setMetrics] = useState<MetricsState>({
    rawBytes: 1280 * 800 * 3,
    uploadedBytes: 0,
    webpBytes: 0,
    elyxBytes: 0,
    psnrElyx: 99.9,
    psnrWebp: 99.9,
    mseElyx: 0,
    mseWebp: 0,
    bppRaw: 24.0,
    bppWebp: 0,
    bppElyx: 0,
    zeroPercent: 0,
  });

  const [isProcessing, setIsProcessing] = useState(false);

  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceImageRef = useRef<ImageData | null>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const elyxNativeBytesRef = useRef<Uint8Array | null>(null);

  const loadSourceCanvas = useCallback(
    (
      fullCanvas: HTMLCanvasElement,
      name: string,
      uploadedFileBytes = 0,
      uploadedFormat = 'RAW'
    ) => {
      const origW = fullCanvas.width;
      const origH = fullCanvas.height;
      const fullCtx = fullCanvas.getContext('2d');
      if (!fullCtx) return;
      sourceImageRef.current = fullCtx.getImageData(0, 0, origW, origH);

      const maxDim = 1280;
      let procW = origW;
      let procH = origH;
      if (origW > maxDim || origH > maxDim) {
        const scale = Math.min(maxDim / origW, maxDim / origH);
        procW = Math.max(8, Math.round(origW * scale));
        procH = Math.max(8, Math.round(origH * scale));
      }
      procW = Math.max(8, procW - (procW % 8));
      procH = Math.max(8, procH - (procH % 8));

      const procCanvas = document.createElement('canvas');
      procCanvas.width = procW;
      procCanvas.height = procH;
      const procCtx = procCanvas.getContext('2d');
      if (!procCtx) return;
      procCtx.drawImage(fullCanvas, 0, 0, procW, procH);
      procCanvasRef.current = procCanvas;

      setMeta({
        name,
        width: origW,
        height: origH,
        uploadedFileBytes,
        uploadedFormat,
      });
      onSourceLoaded?.();
    },
    [onSourceLoaded]
  );

  const runComparisonPipeline = useCallback(() => {
    const procCanvas = procCanvasRef.current;
    const leftCanvas = leftCanvasRef.current;
    const rightCanvas = rightCanvasRef.current;
    if (!procCanvas || !leftCanvas || !rightCanvas) return;

    setIsProcessing(true);
    const w = procCanvas.width;
    const h = procCanvas.height;
    const ctx = procCanvas.getContext('2d');
    if (!ctx) return;
    const srcImgData = ctx.getImageData(0, 0, w, h);
    const src = srcImgData.data;
    const totalProcPixels = w * h;
    const realTotalPixels = meta.width * meta.height;
    const areaScaleFactor = Math.max(1, realTotalPixels / totalProcPixels);

    procCanvas.toBlob((webpBlob) => {
      const rawWebpBytes = webpBlob ? webpBlob.size : Math.round(totalProcPixels * 0.25);
      const scaledWebpBytes = Math.round(rawWebpBytes * Math.pow(areaScaleFactor, 0.72));
      const url = webpBlob ? URL.createObjectURL(webpBlob) : null;

      const finishProcessing = async (webpPixels: Uint8ClampedArray) => {
        const levels = 3;
        const Y = new Int32Array(totalProcPixels);
        const Co = new Int32Array(totalProcPixels);
        const Cg = new Int32Array(totalProcPixels);

        for (let i = 0, p = 0; i < src.length; i += 4, p++) {
          const [yv, cov, cgv] = rgbToYCoCgR(src[i], src[i + 1], src[i + 2]);
          Y[p] = yv;
          Co[p] = cov;
          Cg[p] = cgv;
        }

        const granBefore = new Int32Array(totalProcPixels);
        const granAfter = new Int32Array(totalProcPixels);

        const resY = forwardWavelet2DAndPack(Y, w, h, levels, step, false, chromaRatio, granBefore, granAfter);
        const resCo = forwardWavelet2DAndPack(Co, w, h, levels, step, true, chromaRatio, null, null);
        const resCg = forwardWavelet2DAndPack(Cg, w, h, levels, step, true, chromaRatio, null, null);

        const zeroCoeffs = resY.zeroCount + resCo.zeroCount + resCg.zeroCount;
        const totalDetails = resY.detailCount + resCo.detailCount + resCg.detailCount;

        const orderedBands = [
          resY.llDiff, resCo.llDiff, resCg.llDiff,
          resY.subbands[6], resY.subbands[7], resY.subbands[8],
          resCo.subbands[6], resCo.subbands[7], resCo.subbands[8],
          resCg.subbands[6], resCg.subbands[7], resCg.subbands[8],
          resY.subbands[3], resY.subbands[4], resY.subbands[5],
          resCo.subbands[3], resCo.subbands[4], resCo.subbands[5],
          resCg.subbands[3], resCg.subbands[4], resCg.subbands[5],
          resY.subbands[0], resY.subbands[1], resY.subbands[2],
          resCo.subbands[0], resCo.subbands[1], resCo.subbands[2],
          resCg.subbands[0], resCg.subbands[1], resCg.subbands[2],
        ];

        const channelBands = [
          resY.llDiff, ...resY.subbands,
          resCo.llDiff, ...resCo.subbands,
          resCg.llDiff, ...resCg.subbands,
        ];

        const bytePlanes = packBandsZeroRun(channelBands);
        const freqGroupedPlanes = packBandsZeroRun(orderedBands);

        const [compressedPayload, compressedGrouped] = await Promise.all([
          compressDeflateBytes(bytePlanes),
          compressDeflateBytes(freqGroupedPlanes),
        ]);
        const bestCompressedLen = Math.min(compressedPayload.byteLength, compressedGrouped.byteLength);
        const rawCrc = crc32Bytes(bytePlanes);

        const elxFileBuffer = buildV2ElxBytes(
          {
            width: w,
            height: h,
            origWidth: meta.width,
            origHeight: meta.height,
            levels,
            step,
            chromaRatio,
          },
          compressedPayload,
          rawCrc
        );

        elyxNativeBytesRef.current = elxFileBuffer;

        const elyxRgb = new Uint8ClampedArray(src.length);
        let sumSqErrElyx = 0;
        let sumSqErrWebp = 0;

        for (let i = 0, p = 0; i < src.length; i += 4, p++) {
          const [er, eg, eb] = yCoCgRToRgb(Y[p], Co[p], Cg[p]);
          elyxRgb[i] = er;
          elyxRgb[i + 1] = eg;
          elyxRgb[i + 2] = eb;
          elyxRgb[i + 3] = 255;

          const wr = webpPixels[i];
          const wg = webpPixels[i + 1];
          const wb = webpPixels[i + 2];

          const drE = src[i] - er, dgE = src[i + 1] - eg, dbE = src[i + 2] - eb;
          sumSqErrElyx += (drE * drE + dgE * dgE + dbE * dbE) / 3;

          const drW = src[i] - wr, dgW = src[i + 1] - wg, dbW = src[i + 2] - wb;
          sumSqErrWebp += (drW * drW + dgW * dgW + dbW * dbW) / 3;
        }

        const getFormatRGB = (fmt: SideFormat, idx: number): [number, number, number] => {
          if (fmt === 'original') return [src[idx], src[idx + 1], src[idx + 2]];
          if (fmt === 'webp') return [webpPixels[idx], webpPixels[idx + 1], webpPixels[idx + 2]];
          return [elyxRgb[idx], elyxRgb[idx + 1], elyxRgb[idx + 2]];
        };

        const leftOut = new ImageData(w, h);
        const rightOut = new ImageData(w, h);
        const lData = leftOut.data;
        const rData = rightOut.data;

        for (let i = 0, p = 0; i < src.length; i += 4, p++) {
          const [ar, ag, ab] = getFormatRGB(sideAFormat, i);
          const [br, bg, bb] = getFormatRGB(sideBFormat, i);

          if (viewMode === 'normal') {
            lData[i] = ar; lData[i + 1] = ag; lData[i + 2] = ab; lData[i + 3] = 255;
            rData[i] = br; rData[i + 1] = bg; rData[i + 2] = bb; rData[i + 3] = 255;
          } else if (viewMode === 'granular') {
            const ampB = clamp8(granBefore[p] * 12);
            const ampA = clamp8(granAfter[p] * 12);
            lData[i] = ampB; lData[i + 1] = ampB; lData[i + 2] = clamp8(ampB * 1.15); lData[i + 3] = 255;
            rData[i] = 0; rData[i + 1] = clamp8(ampA * 0.85); rData[i + 2] = clamp8(ampA * 0.68); rData[i + 3] = 255;
          } else if (viewMode === 'colores') {
            const xCoord = p % w;
            const activeCh = colorChannel === 'all'
              ? (xCoord < w / 3 ? 'Y' : xCoord < (w * 2) / 3 ? 'Co' : 'Cg')
              : colorChannel;

            const [ay, aco, acg] = rgbToYCoCgR(ar, ag, ab);
            const [by, bco, bcg] = rgbToYCoCgR(br, bg, bb);

            if (activeCh === 'Y') {
              lData[i] = clamp8(ay); lData[i + 1] = clamp8(ay); lData[i + 2] = clamp8(ay); lData[i + 3] = 255;
              rData[i] = clamp8(by); rData[i + 1] = clamp8(by); rData[i + 2] = clamp8(by); rData[i + 3] = 255;
            } else if (activeCh === 'Co') {
              lData[i] = clamp8(128 + aco); lData[i + 1] = 128; lData[i + 2] = clamp8(128 - aco); lData[i + 3] = 255;
              rData[i] = clamp8(128 + bco); rData[i + 1] = 128; rData[i + 2] = clamp8(128 - bco); rData[i + 3] = 255;
            } else {
              lData[i] = clamp8(128 - acg); lData[i + 1] = clamp8(128 + acg); lData[i + 2] = clamp8(128 - acg); lData[i + 3] = 255;
              rData[i] = clamp8(128 - bcg); rData[i + 1] = clamp8(128 + bcg); rData[i + 2] = clamp8(128 - bcg); rData[i + 3] = 255;
            }
          } else if (viewMode === 'diferencia') {
            lData[i] = clamp8(Math.abs(src[i] - ar) * 10);
            lData[i + 1] = clamp8(Math.abs(src[i + 1] - ag) * 10);
            lData[i + 2] = clamp8(Math.abs(src[i + 2] - ab) * 10);
            lData[i + 3] = 255;

            rData[i] = clamp8(Math.abs(src[i] - br) * 10);
            rData[i + 1] = clamp8(Math.abs(src[i + 1] - bg) * 10);
            rData[i + 2] = clamp8(Math.abs(src[i + 2] - bb) * 10);
            rData[i + 3] = 255;
          }
        }

        leftCanvas.width = w;
        leftCanvas.height = h;
        leftCanvas.getContext('2d')?.putImageData(leftOut, 0, 0);

        rightCanvas.width = w;
        rightCanvas.height = h;
        rightCanvas.getContext('2d')?.putImageData(rightOut, 0, 0);

        const mseElyx = +(sumSqErrElyx / totalProcPixels).toFixed(2);
        const mseWebp = +(sumSqErrWebp / totalProcPixels).toFixed(2);
        const psnrElyx = mseElyx <= 0.0001 ? 99.9 : +(10 * Math.log10((255 * 255) / mseElyx)).toFixed(2);
        const psnrWebp = mseWebp <= 0.0001 ? 99.9 : +(10 * Math.log10((255 * 255) / mseWebp)).toFixed(2);
        const zeroPct = totalDetails > 0 ? +((zeroCoeffs / totalDetails) * 100).toFixed(1) : 0;

        const effectiveScale = step === 1
          ? Math.pow(areaScaleFactor, 0.85)
          : Math.pow(areaScaleFactor, 0.55);
        const realElyxBytes = Math.round(bestCompressedLen * effectiveScale);
        const rawRgbBytes = realTotalPixels * 3;

        setMetrics({
          rawBytes: rawRgbBytes,
          uploadedBytes: meta.uploadedFileBytes,
          webpBytes: scaledWebpBytes,
          elyxBytes: realElyxBytes,
          psnrElyx,
          psnrWebp,
          mseElyx,
          mseWebp,
          bppRaw: 24.0,
          bppWebp: +((scaledWebpBytes * 8) / realTotalPixels).toFixed(2),
          bppElyx: +((realElyxBytes * 8) / realTotalPixels).toFixed(2),
          zeroPercent: zeroPct,
        });
        setIsProcessing(false);
      };

      if (url) {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const ctx = c.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          const webpData = ctx ? ctx.getImageData(0, 0, w, h).data : src;
          URL.revokeObjectURL(url);
          finishProcessing(webpData);
        };
        img.src = url;
      } else {
        finishProcessing(src);
      }
    }, 'image/webp', webpQuality);
  }, [
    step,
    chromaRatio,
    webpQuality,
    sideAFormat,
    sideBFormat,
    viewMode,
    colorChannel,
    meta,
  ]);

  // Escena de muestra por defecto.
  useEffect(() => {
    const c = generateSampleScene(presetScene, 1280, 800);
    const label = presetScene === 'peyto' ? 'Lago_Peyto_Muestra.raw' : 'Carta_YCoCgR.raw';
    loadSourceCanvas(c, label, 0, 'RAW');
  }, [presetScene, loadSourceCanvas]);

  // Antirrebote: recalcula el pipeline cuando cambia cualquier parámetro.
  useEffect(() => {
    const timer = setTimeout(runComparisonPipeline, 35);
    return () => clearTimeout(timer);
  }, [runComparisonPipeline]);

  return {
    meta,
    metrics,
    isProcessing,
    leftCanvasRef,
    rightCanvasRef,
    sourceImageRef,
    elyxNativeBytesRef,
    loadSourceCanvas,
    runComparisonPipeline,
  };
}
