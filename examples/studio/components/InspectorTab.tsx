// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import type { MetaState, MetricsState, SideFormat } from '../types';
import { formatSize } from '../lib/format';

export interface InspectorTabProps {
  sideAFormat: SideFormat;
  onSideAFormatChange: (format: SideFormat) => void;
  sideBFormat: SideFormat;
  onSideBFormatChange: (format: SideFormat) => void;
  meta: MetaState;
  metrics: MetricsState;
  isProcessing: boolean;
  step: number;
  onStepChange: (step: number) => void;
  chromaRatio: number;
  onChromaRatioChange: (ratio: number) => void;
  webpQuality: number;
  onWebpQualityChange: (quality: number) => void;
}

const FORMATS: { id: SideFormat; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'webp', label: 'WebP' },
  { id: 'elyx', label: 'ELYX 0.2' },
];

/** Selectores de formato, tabla de métricas y deslizadores de compresión. */
export function InspectorTab({
  sideAFormat,
  onSideAFormatChange,
  sideBFormat,
  onSideBFormatChange,
  meta,
  metrics,
  isProcessing,
  step,
  onStepChange,
  chromaRatio,
  onChromaRatioChange,
  webpQuality,
  onWebpQualityChange,
}: InspectorTabProps) {
  const elyxBetterQuality = metrics.psnrElyx >= metrics.psnrWebp;
  const elyxSmallerSize = metrics.elyxBytes <= metrics.webpBytes;
  const sizeDiffPct = metrics.webpBytes > 0
    ? (((metrics.webpBytes - metrics.elyxBytes) / metrics.webpBytes) * 100).toFixed(1)
    : '0.0';

  return (
    <>
      <div className="p-3 rounded bg-[#090A0D] border border-[#20242E] space-y-3">
        <div className="text-[11px] font-mono font-bold uppercase text-[#7E8695]">
          1. Elige qué formatos comparar en el lienzo
        </div>

        <div className="space-y-1">
          <span className="text-[11px] text-[#7E8695] font-mono">◄ LADO A (Izquierda de la cortina):</span>
          <div className="grid grid-cols-3 gap-1">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => onSideAFormatChange(f.id)}
                className={`py-1.5 px-2 rounded font-bold border text-center transition-colors ${
                  sideAFormat === f.id
                    ? 'bg-[#12141A] border-[#00D4AA] text-[#00D4AA]'
                    : 'bg-[#090A0D] border-[#20242E] text-[#7E8695] hover:text-[#F3F4F6]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] text-[#7E8695] font-mono">LADO B (Derecha de la cortina) ►:</span>
          <div className="grid grid-cols-3 gap-1">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => onSideBFormatChange(f.id)}
                className={`py-1.5 px-2 rounded font-bold border text-center transition-colors ${
                  sideBFormat === f.id
                    ? 'bg-[#00D4AA] border-[#00D4AA] text-[#090A0D]'
                    : 'bg-[#090A0D] border-[#20242E] text-[#7E8695] hover:text-[#F3F4F6]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-3 rounded bg-[#090A0D] border border-[#20242E] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono font-bold uppercase text-[#7E8695]">
            2. Los 3 Formatos ({meta.width}×{meta.height})
          </span>
          {isProcessing && (
            <span className="text-[10px] font-mono text-[#00D4AA]">Calculando...</span>
          )}
        </div>

        <table className="w-full text-left font-mono text-[11px] border-collapse">
          <thead>
            <tr className="border-b border-[#20242E] text-[#7E8695]">
              <th className="py-1">Formato</th>
              <th className="py-1 text-right">Peso</th>
              <th className="py-1 text-right">Calidad (PSNR)</th>
              <th className="py-1 text-right">Error MSE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#20242E]">
            <tr>
              <td className="py-1.5 font-bold text-[#F3F4F6]">
                Original
                <div className="text-[9px] text-[#7E8695] font-normal">
                  {meta.uploadedFileBytes
                    ? `Archivo ${meta.uploadedFormat}: ${formatSize(meta.uploadedFileBytes)}`
                    : 'Memoria RGB8 sin comprimir'}
                </div>
              </td>
              <td className="py-1.5 text-right text-[#F3F4F6]">
                {meta.uploadedFileBytes ? formatSize(meta.uploadedFileBytes) : formatSize(metrics.rawBytes)}
                <div className="text-[9px] text-[#7E8695]">RAM: {formatSize(metrics.rawBytes)}</div>
              </td>
              <td className="py-1.5 text-right text-[#F3F4F6]">∞ dB (100%)</td>
              <td className="py-1.5 text-right text-[#7E8695]">0.00</td>
            </tr>

            <tr>
              <td className="py-1.5 font-bold text-[#F3F4F6]">
                WebP ({Math.round(webpQuality * 100)}%)
                <div className="text-[9px] text-[#7E8695] font-normal">{metrics.bppWebp} bits/píxel</div>
              </td>
              <td className="py-1.5 text-right text-[#F3F4F6] font-bold">{formatSize(metrics.webpBytes)}</td>
              <td className="py-1.5 text-right text-[#F3F4F6]">{metrics.psnrWebp} dB</td>
              <td className="py-1.5 text-right text-[#7E8695]">{metrics.mseWebp}</td>
            </tr>

            <tr>
              <td className="py-1.5 font-bold text-[#00D4AA]">
                ELYX 0.2 (s={step})
                <div className="text-[9px] text-[#7E8695] font-normal">
                  {metrics.bppElyx} bits/píxel · {metrics.zeroPercent}% ceros
                </div>
              </td>
              <td className="py-1.5 text-right text-[#00D4AA] font-bold">
                {formatSize(metrics.elyxBytes)}
                <div className="text-[9px] text-[#00D4AA]/80">
                  {meta.uploadedFileBytes
                    ? `${(((meta.uploadedFileBytes - metrics.elyxBytes) / meta.uploadedFileBytes) * 100).toFixed(1)}% vs ${meta.uploadedFormat}`
                    : `-${(((metrics.rawBytes - metrics.elyxBytes) / metrics.rawBytes) * 100).toFixed(1)}% vs RAM`}
                </div>
              </td>
              <td className="py-1.5 text-right text-[#00D4AA] font-bold">
                {metrics.psnrElyx >= 90 ? '∞ dB' : `${metrics.psnrElyx} dB`}
              </td>
              <td className="py-1.5 text-right text-[#00D4AA]">{metrics.mseElyx}</td>
            </tr>
          </tbody>
        </table>

        <div className="p-2 rounded bg-[#12141A] border border-[#20242E] text-[11px] space-y-1">
          <div className="font-bold text-[#F3F4F6]">¿Cómo leer estas cuentas?</div>
          <div className="text-[#7E8695]">
            • <strong className="text-[#F3F4F6]">Calidad (PSNR / MSE):</strong> Más dB y menos MSE = más fiel al Original. Ahora mismo gana{' '}
            <strong className="text-[#00D4AA]">
              {elyxBetterQuality
                ? `ELYX (+${(metrics.psnrElyx - metrics.psnrWebp).toFixed(2)} dB)`
                : `WebP (+${(metrics.psnrWebp - metrics.psnrElyx).toFixed(2)} dB)`}
            </strong>.
          </div>
          <div className="text-[#7E8695]">
            • <strong className="text-[#F3F4F6]">Peso (MiB / KB):</strong> ELYX pesa{' '}
            <strong className="text-[#00D4AA]">
              {elyxSmallerSize ? `${sizeDiffPct}% menos que WebP` : `${Math.abs(Number(sizeDiffPct))}% más que WebP`}
            </strong>.
          </div>
        </div>
      </div>

      <div className="space-y-3 p-3 rounded bg-[#090A0D] border border-[#20242E]">
        <div className="text-[11px] font-mono font-bold uppercase text-[#7E8695]">
          3. Ajustar Compresión de ELYX vs WebP
        </div>

        <div className="space-y-1">
          <div className="flex justify-between">
            <label className="font-bold text-[#F3F4F6]">Paso ELYX (step)</label>
            <span className="font-mono text-[#00D4AA] font-bold">
              {step === 1 ? '1 (Lossless Exacto)' : `step = ${step}`}
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="24"
            step="1"
            value={step}
            onChange={(e) => onStepChange(Number(e.target.value))}
            className="w-full accent-[#00D4AA] cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[#7E8695]">
            <span>step=1 (Lossless)</span>
            <span>Ceros: {metrics.zeroPercent}%</span>
            <span>step=24 (Compacto)</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between">
            <label className="font-bold text-[#F3F4F6]">Compresión Croma ELYX (Co/Cg)</label>
            <span className="font-mono text-[#00D4AA] font-bold">{chromaRatio.toFixed(1)}×</span>
          </div>
          <input
            type="range"
            min="1"
            max="4"
            step="0.5"
            value={chromaRatio}
            onChange={(e) => onChromaRatioChange(Number(e.target.value))}
            className="w-full accent-[#00D4AA] cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between">
            <label className="font-bold text-[#F3F4F6]">Calidad WebP</label>
            <span className="font-mono text-[#F3F4F6]">{Math.round(webpQuality * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="0.98"
            step="0.04"
            value={webpQuality}
            onChange={(e) => onWebpQualityChange(Number(e.target.value))}
            className="w-full accent-[#00D4AA] cursor-pointer"
          />
        </div>
      </div>
    </>
  );
}
