// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import { useCallback, useState } from 'react';
import { Header } from './components/Header';
import { Viewport } from './components/Viewport';
import { Sidebar } from './components/Sidebar';
import { InspectorTab } from './components/InspectorTab';
import { CodeTab } from './components/CodeTab';
import { useViewport } from './hooks/useViewport';
import { useComparisonPipeline } from './hooks/useComparisonPipeline';
import { buildPrismaV1ElxBytes } from './lib/elxEncoder';
import { decodeElxFile } from './lib/elxDecoder';
import { getSplitLabels } from './lib/format';
import type {
  ColorChannel,
  ExportVersion,
  SamplePreset,
  SideFormat,
  StudioTab,
  ViewMode,
} from './types';

/** Componente raíz del ElyX Studio: dueño del estado y del layout. */
export default function App() {
  const [step, setStep] = useState(8);
  const [chromaRatio, setChromaRatio] = useState(2.0);
  const [webpQuality, setWebpQuality] = useState(0.82);
  const [exportVersion, setExportVersion] = useState<ExportVersion>('v1');
  const [sideAFormat, setSideAFormat] = useState<SideFormat>('webp');
  const [sideBFormat, setSideBFormat] = useState<SideFormat>('elyx');
  const [viewMode, setViewMode] = useState<ViewMode>('normal');
  const [colorChannel, setColorChannel] = useState<ColorChannel>('all');
  const [presetScene, setPresetScene] = useState<SamplePreset>('peyto');
  const [activeTab, setActiveTab] = useState<StudioTab>('inspector');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const viewport = useViewport();

  const {
    meta,
    metrics,
    isProcessing,
    leftCanvasRef,
    rightCanvasRef,
    sourceImageRef,
    elyxNativeBytesRef,
    loadSourceCanvas,
  } = useComparisonPipeline({
    step,
    chromaRatio,
    webpQuality,
    sideAFormat,
    sideBFormat,
    viewMode,
    colorChannel,
    presetScene,
    onSourceLoaded: viewport.resetTransform,
  });

  const handleFileDrop = useCallback(
    async (file: File) => {
      if (!file) return;
      const ext = file.name.split('.').pop()?.toUpperCase() || 'IMG';

      if (ext === 'ELX' || file.name.toLowerCase().endsWith('.elx')) {
        try {
          const arrayBuf = await file.arrayBuffer();
          const decoded = await decodeElxFile(new Uint8Array(arrayBuf));
          setStep(decoded.step);
          setChromaRatio(decoded.chromaRatio);
          loadSourceCanvas(decoded.canvas, file.name, file.size, 'ELX Nativo');
          return;
        } catch (err) {
          console.error('Error al decodificar .elx:', err);
        }
      }

      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') return;
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d')?.drawImage(img, 0, 0);
          loadSourceCanvas(c, file.name, file.size, ext);
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    },
    [loadSourceCanvas]
  );

  const downloadElyx = useCallback(async () => {
    if (!sourceImageRef.current) return;
    let bytesToSave = elyxNativeBytesRef.current;
    if (exportVersion === 'v1') {
      bytesToSave = await buildPrismaV1ElxBytes(sourceImageRef.current, step);
    }
    if (!bytesToSave) return;

    const blob = new Blob([bytesToSave], { type: 'application/x-elyx' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanName = meta.name.replace(/\.[^/.]+$/, '');
    a.download = `${cleanName}_s${step}_${exportVersion}.elx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportVersion, meta.name, sourceImageRef, elyxNativeBytesRef, step]);

  const splitLabels = getSplitLabels(
    viewMode,
    sideAFormat,
    sideBFormat,
    colorChannel,
    metrics,
    meta,
    webpQuality,
    step
  );

  return (
    <div
      className="w-screen h-screen overflow-hidden flex flex-col select-none bg-[#090A0D] text-[#F3F4F6] font-sans"
      onMouseMove={viewport.handleMouseMove}
      onMouseUp={viewport.handleMouseUp}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFile(false);
        if (e.dataTransfer.files?.[0]) handleFileDrop(e.dataTransfer.files[0]);
      }}
    >
      <Header
        meta={meta}
        presetScene={presetScene}
        onPresetChange={setPresetScene}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        zoom={viewport.zoom}
        onZoomIn={viewport.zoomIn}
        onZoomOut={viewport.zoomOut}
        onResetView={viewport.resetView}
        onFileSelect={handleFileDrop}
        exportVersion={exportVersion}
        onExportVersionChange={setExportVersion}
        onDownload={downloadElyx}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
      />

      <div className="flex-1 flex w-full overflow-hidden relative">
        <Viewport
          viewportRef={viewport.viewportRef}
          leftCanvasRef={leftCanvasRef}
          rightCanvasRef={rightCanvasRef}
          zoom={viewport.zoom}
          pan={viewport.pan}
          isPanning={viewport.isPanning}
          splitPos={viewport.splitPos}
          isDraggingFile={isDraggingFile}
          viewMode={viewMode}
          colorChannel={colorChannel}
          sideAFormat={sideAFormat}
          sideBFormat={sideBFormat}
          splitLabels={splitLabels}
          onSplitChange={viewport.setSplitPos}
          onStartPanning={viewport.startPanning}
          onStartSplitDrag={viewport.startSplitDrag}
          onWheel={viewport.handleWheel}
          onColorChannelChange={setColorChannel}
        />

        {sidebarOpen && (
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab}>
            {activeTab === 'inspector' ? (
              <InspectorTab
                sideAFormat={sideAFormat}
                onSideAFormatChange={setSideAFormat}
                sideBFormat={sideBFormat}
                onSideBFormatChange={setSideBFormat}
                meta={meta}
                metrics={metrics}
                isProcessing={isProcessing}
                step={step}
                onStepChange={setStep}
                chromaRatio={chromaRatio}
                onChromaRatioChange={setChromaRatio}
                webpQuality={webpQuality}
                onWebpQualityChange={setWebpQuality}
              />
            ) : (
              <CodeTab step={step} chromaRatio={chromaRatio} />
            )}
          </Sidebar>
        )}
      </div>
    </div>
  );
}
