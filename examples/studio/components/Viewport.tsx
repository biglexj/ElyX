// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import { Upload, SplitSquareHorizontal } from 'lucide-react';
import type { MouseEvent, RefObject, WheelEvent } from 'react';
import type { ColorChannel, SideFormat, ViewMode } from '../types';

export interface ViewportProps {
  viewportRef: RefObject<HTMLDivElement>;
  leftCanvasRef: RefObject<HTMLCanvasElement>;
  rightCanvasRef: RefObject<HTMLCanvasElement>;
  zoom: number;
  pan: { x: number; y: number };
  isPanning: boolean;
  splitPos: number;
  isDraggingFile: boolean;
  viewMode: ViewMode;
  colorChannel: ColorChannel;
  sideAFormat: SideFormat;
  sideBFormat: SideFormat;
  splitLabels: { left: string; right: string };
  onSplitChange: (value: number) => void;
  onStartPanning: (event: MouseEvent<HTMLDivElement>) => void;
  onStartSplitDrag: (event: MouseEvent<HTMLDivElement>) => void;
  onWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onColorChannelChange: (channel: ColorChannel) => void;
}

const CHANNELS: { id: ColorChannel; label: string }[] = [
  { id: 'all', label: 'Dividido (Y | Co | Cg)' },
  { id: 'Y', label: 'Canal Y (Luma)' },
  { id: 'Co', label: 'Canal Co (Naranja/Azul)' },
  { id: 'Cg', label: 'Canal Cg (Verde/Magenta)' },
];

const TRANSFORM_STYLE = (zoom: number, pan: { x: number; y: number }, isPanning: boolean) => ({
  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
  transformOrigin: 'center center',
  transition: isPanning ? 'none' : 'transform 0.06s ease-out',
});

/** Área de canvas con la cortina divisoria entre lado A y lado B. */
export function Viewport({
  viewportRef,
  leftCanvasRef,
  rightCanvasRef,
  zoom,
  pan,
  isPanning,
  splitPos,
  isDraggingFile,
  viewMode,
  colorChannel,
  sideAFormat,
  sideBFormat,
  splitLabels,
  onSplitChange,
  onStartPanning,
  onStartSplitDrag,
  onWheel,
  onColorChannelChange,
}: ViewportProps) {
  return (
    <div
      ref={viewportRef}
      onWheel={onWheel}
      onMouseDown={onStartPanning}
      className="flex-1 relative overflow-hidden bg-[#090A0D]"
      style={{
        cursor: isPanning ? 'grabbing' : 'grab',
        backgroundImage: 'radial-gradient(#20242E 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      {isDraggingFile && (
        <div className="absolute inset-4 z-50 rounded-lg bg-[#090A0D]/90 border-2 border-dashed border-[#00D4AA] flex flex-col items-center justify-center pointer-events-none">
          <Upload className="w-10 h-10 text-[#00D4AA] mb-2" />
          <p className="text-sm font-bold text-[#F3F4F6]">
            Suelta tu imagen aquí (soporta alta resolución 4K / 8K)
          </p>
        </div>
      )}

      {viewMode === 'colores' && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 p-1 rounded bg-[#12141A] border border-[#20242E] shadow-xl"
        >
          {CHANNELS.map((ch) => (
            <button
              key={ch.id}
              onClick={() => onColorChannelChange(ch.id)}
              className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-colors ${
                colorChannel === ch.id
                  ? 'bg-[#00D4AA] text-[#090A0D]'
                  : 'text-[#7E8695] hover:text-[#F3F4F6]'
              }`}
            >
              {ch.label}
            </button>
          ))}
        </div>
      )}

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          style={TRANSFORM_STYLE(zoom, pan, isPanning)}
          className="shadow-2xl"
        >
          <canvas
            ref={rightCanvasRef}
            className="block max-w-[82vw] max-h-[78vh] w-auto h-auto"
            style={{ imageRendering: zoom >= 3 ? 'pixelated' : 'auto' }}
          />
        </div>
      </div>

      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
      >
        <div
          style={TRANSFORM_STYLE(zoom, pan, isPanning)}
          className="shadow-2xl"
        >
          <canvas
            ref={leftCanvasRef}
            className="block max-w-[82vw] max-h-[78vh] w-auto h-auto"
            style={{ imageRendering: zoom >= 3 ? 'pixelated' : 'auto' }}
          />
        </div>
      </div>

      <div
        style={{ left: `${splitPos}%` }}
        className="absolute top-0 bottom-0 w-0.5 bg-[#00D4AA] z-30 pointer-events-none"
      >
        <div className="absolute top-4 -translate-x-1/2 flex items-center gap-1 pointer-events-none whitespace-nowrap">
          <span className="px-2.5 py-1 rounded-l bg-[#12141A] border border-[#20242E] text-[11px] font-mono font-bold text-[#F3F4F6]">
            ◄ LADO A: {sideAFormat.toUpperCase()}
          </span>
          <span className="px-2.5 py-1 rounded-r bg-[#00D4AA] text-[11px] font-mono font-bold text-[#090A0D]">
            LADO B: {sideBFormat.toUpperCase()} ►
          </span>
        </div>

        <div
          onMouseDown={onStartSplitDrag}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-14 rounded-lg bg-[#12141A] border-2 border-[#00D4AA] text-[#00D4AA] flex flex-col items-center justify-center cursor-ew-resize shadow-2xl pointer-events-auto hover:scale-105 transition-transform"
          title="Arrastra a izquierda o derecha para comparar Lado A vs Lado B"
        >
          <SplitSquareHorizontal className="w-4 h-4" />
          <span className="text-[9px] font-mono font-bold mt-0.5">{Math.round(splitPos)}%</span>
        </div>
      </div>

      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute bottom-3 left-3 right-3 z-30 flex flex-wrap items-center justify-between gap-3 px-4 py-2 rounded bg-[#12141A]/95 border border-[#20242E]"
      >
        <div className="text-xs font-mono text-[#F3F4F6]">
          {splitLabels.left}
        </div>

        <div className="flex items-center gap-2 min-w-[220px]">
          <span className="text-[11px] font-mono text-[#7E8695]">Lado A</span>
          <input
            type="range"
            min="2"
            max="98"
            value={splitPos}
            onChange={(e) => onSplitChange(Number(e.target.value))}
            className="w-36 accent-[#00D4AA] cursor-pointer"
          />
          <span className="text-[11px] font-mono text-[#00D4AA] font-bold">Lado B</span>
        </div>

        <div className="text-xs font-mono text-[#00D4AA] font-bold">
          {splitLabels.right}
        </div>
      </div>
    </div>
  );
}
