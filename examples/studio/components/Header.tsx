// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import {
  Upload, Download, ZoomIn, ZoomOut, RotateCcw,
  Eye, Sparkles, Layers, Activity, ChevronRight, ChevronLeft,
} from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { ExportVersion, MetaState, SamplePreset, ViewMode } from '../types';

export interface HeaderProps {
  meta: MetaState;
  presetScene: SamplePreset;
  onPresetChange: (preset: SamplePreset) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onFileSelect: (file: File) => void;
  exportVersion: ExportVersion;
  onExportVersionChange: (version: ExportVersion) => void;
  onDownload: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const VIEW_MODES: { id: ViewMode; label: string; icon: typeof Eye }[] = [
  { id: 'normal', label: '1. Vista Normal (A/B)', icon: Eye },
  { id: 'granular', label: '2. Vista Granular', icon: Sparkles },
  { id: 'colores', label: '3. Vista Colores (YCoCg)', icon: Layers },
  { id: 'diferencia', label: '4. Error ×10', icon: Activity },
];

/** Barra superior: presets, modos de vista, zoom, subida y descarga. */
export function Header({
  meta,
  presetScene,
  onPresetChange,
  viewMode,
  onViewModeChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetView,
  onFileSelect,
  exportVersion,
  onExportVersionChange,
  onDownload,
  sidebarOpen,
  onToggleSidebar,
}: HeaderProps) {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFileSelect(file);
  };

  return (
    <header className="w-full h-13 px-4 flex items-center justify-between shrink-0 bg-[#12141A] border-b border-[#20242E] z-40 gap-2">
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00D4AA]" />
          <span className="font-bold tracking-wider text-sm font-mono">ELYX 0.2</span>
        </div>

        <select
          value={presetScene}
          onChange={(e) => onPresetChange(e.target.value as SamplePreset)}
          className="px-2.5 py-1 rounded text-xs bg-[#090A0D] border border-[#20242E] text-[#F3F4F6] focus:border-[#00D4AA] outline-none cursor-pointer"
          title="Cambiar imagen de muestra"
        >
          <option value="peyto">Muestra: Lago Peyto</option>
          <option value="color">Muestra: Carta YCoCg-R</option>
        </select>

        <span className="hidden xl:inline-block text-[11px] font-mono px-2 py-0.5 rounded bg-[#090A0D] border border-[#20242E] text-[#00D4AA]">
          {meta.width}×{meta.height}px ({((meta.width * meta.height) / 1e6).toFixed(2)} MP)
        </span>
      </div>

      <div className="flex items-center bg-[#090A0D] p-1 rounded border border-[#20242E]">
        {VIEW_MODES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onViewModeChange(id)}
            className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition-colors ${
              viewMode === id
                ? 'bg-[#00D4AA] text-[#090A0D]'
                : 'text-[#7E8695] hover:text-[#F3F4F6]'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onZoomOut}
          className="p-1.5 rounded bg-[#090A0D] border border-[#20242E] text-[#F3F4F6] hover:border-[#00D4AA]"
          title="Alejar"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={onZoomIn}
          className="p-1.5 rounded bg-[#090A0D] border border-[#20242E] text-[#F3F4F6] hover:border-[#00D4AA]"
          title="Acercar"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onResetView}
          className="px-2 py-1 rounded text-xs flex items-center gap-1 bg-[#090A0D] border border-[#20242E] text-[#7E8695] hover:text-[#F3F4F6]"
          title="Centrar imagen y cortina al 50%"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>

        <label className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer flex items-center gap-1.5 bg-[#090A0D] border border-[#20242E] hover:border-[#00D4AA] text-[#F3F4F6]">
          <Upload className="w-3.5 h-3.5 text-[#00D4AA]" />
          Subir Foto / .elx
          <input
            type="file"
            accept="image/*,.elx"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>

        <select
          value={exportVersion}
          onChange={(e) => onExportVersionChange(e.target.value as ExportVersion)}
          className="px-2 py-1.5 rounded text-xs font-mono bg-[#090A0D] border border-[#20242E] text-[#00D4AA] outline-none cursor-pointer"
          title="Elegir versión del contenedor .elx al descargar"
        >
          <option value="v1">.elx v1 (Prisma)</option>
          <option value="v2">.elx v2 (Nuevo)</option>
        </select>

        <button
          onClick={onDownload}
          className="px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 bg-[#00D4AA] text-[#090A0D] hover:brightness-110"
          title="Descargar contenedor binario .elx nativo"
        >
          <Download className="w-3.5 h-3.5" />
          Descargar .elx ({exportVersion})
        </button>

        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded bg-[#090A0D] border border-[#20242E] text-[#7E8695] hover:text-[#F3F4F6] hover:border-[#00D4AA]"
          title={sidebarOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
        >
          {sidebarOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
