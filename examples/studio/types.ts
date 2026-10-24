// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj

/** Modo de comparación visible en el lienzo. */
export type ViewMode = 'normal' | 'granular' | 'colores' | 'diferencia';

/** Formato que se puede asignar a cada lado de la cortina divisoria. */
export type SideFormat = 'original' | 'webp' | 'elyx';

/** Canal de color aislado en la vista "colores" (YCoCg-R). */
export type ColorChannel = 'all' | 'Y' | 'Co' | 'Cg';

/** Versión del contenedor `.elx` que se descarga. */
export type ExportVersion = 'v1' | 'v2';

/** Pestaña activa del panel lateral. */
export type StudioTab = 'inspector' | 'code';

/** Escena de muestra procedural generada por `lib/sampleScene.ts`. */
export type SamplePreset = 'peyto' | 'color';

export interface MetaState {
  name: string;
  width: number;
  height: number;
  uploadedFileBytes: number;
  uploadedFormat: string;
}

export interface MetricsState {
  rawBytes: number;
  uploadedBytes: number;
  webpBytes: number;
  elyxBytes: number;
  psnrElyx: number;
  psnrWebp: number;
  mseElyx: number;
  mseWebp: number;
  bppRaw: number;
  bppWebp: number;
  bppElyx: number;
  zeroPercent: number;
}
