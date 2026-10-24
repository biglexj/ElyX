// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import { useCallback, useRef, useState } from 'react';
import type { MouseEvent, RefObject, WheelEvent } from 'react';

export interface ViewportTransform {
  zoom: number;
  pan: { x: number; y: number };
}

export interface UseViewportResult {
  zoom: number;
  pan: { x: number; y: number };
  isPanning: boolean;
  splitPos: number;
  isDraggingSplit: boolean;
  viewportRef: RefObject<HTMLDivElement>;
  setSplitPos: (value: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Botón "Reset": centra la imagen y devuelve la cortina al 50 %. */
  resetView: () => void;
  /** Al cargar una fuente nueva: vuelve al zoom 1:1 sin tocar la cortina. */
  resetTransform: () => void;
  startPanning: (event: MouseEvent<HTMLDivElement>) => void;
  startSplitDrag: (event: MouseEvent<HTMLDivElement>) => void;
  handleMouseMove: (event: MouseEvent<HTMLDivElement>) => void;
  handleMouseUp: () => void;
  handleWheel: (event: WheelEvent<HTMLDivElement>) => void;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 20;
const MIN_SPLIT = 2;
const MAX_SPLIT = 98;

/**
 * Estado del lienzo: zoom, desplazamiento, cortina divisoria y arrastre.
 * No toca React más allá del estado que devuelve.
 */
export function useViewport(): UseViewportResult {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [splitPos, setSplitPos] = useState(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);

  const updateSplitFromClientX = useCallback((clientX: number) => {
    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const pos = ((clientX - rect.left) / rect.width) * 100;
    setSplitPos(Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, pos)));
  }, []);

  const startPanning = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: event.clientX - pan.x, y: event.clientY - pan.y });
  }, [pan.x, pan.y]);

  const startSplitDrag = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    setIsDraggingSplit(true);
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (isDraggingSplit) {
      updateSplitFromClientX(event.clientX);
      return;
    }
    if (isPanning) {
      setPan({
        x: event.clientX - panStart.x,
        y: event.clientY - panStart.y,
      });
    }
  }, [isDraggingSplit, isPanning, panStart, updateSplitFromClientX]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDraggingSplit(false);
  }, []);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 0.87;
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number((z * factor).toFixed(2)))));
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, Number((z + 0.25).toFixed(2))));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))));
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSplitPos(50);
  }, []);

  const resetTransform = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  return {
    zoom,
    pan,
    isPanning,
    splitPos,
    isDraggingSplit,
    viewportRef,
    setSplitPos,
    zoomIn,
    zoomOut,
    resetView,
    resetTransform,
    startPanning,
    startSplitDrag,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
  };
}
