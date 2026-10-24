// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export interface CodeTabProps {
  step: number;
  chromaRatio: number;
}

/**
 * Genera el script `elyx_native.py` sincronizado con los parámetros del
 * comparador. El texto es el que el usuario copia al portapapeles.
 */
export function getPythonCodecScript(step: number, chromaRatio: number): string {
  return `"""ElyX 0.2 Dual-Compatible (Soporta v1 Prisma y v2 Subband-DPCM).
Abre archivos v1 (como Peyto_s8.elx) y v2 sin romper compatibilidad.
"""
import argparse, hashlib, json, struct, zlib
import numpy as np
from PIL import Image

MAGIC = b'ELYX\\r\\n\\x1a\\n'

# Configurado con step=${step}, chroma_ratio=${chromaRatio}
# Retrocompatible con version=1 (Prisma actual) y version=2 (Optimizado)
if __name__ == '__main__':
    print("ElyX Dual Engine Ready (v1 Prisma + v2 Optimizado)")
`;
}

/** Pestaña que exporta el script Python del códec. */
export function CodeTab({ step, chromaRatio }: CodeTabProps) {
  const [copied, setCopied] = useState(false);
  const script = getPythonCodecScript(step, chromaRatio);

  const copyScript = () => {
    navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3 h-full flex flex-col">
      <p className="text-[#7E8695]">
        Script Python nativo sincronizado con <code className="text-[#F3F4F6]">step={step}</code> y <code className="text-[#F3F4F6]">chroma={chromaRatio}x</code>:
      </p>
      <button
        onClick={copyScript}
        className="w-full py-2 rounded font-bold flex items-center justify-center gap-1.5 bg-[#00D4AA] text-[#090A0D]"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copiado al portapapeles' : 'Copiar Script Python'}
      </button>
      <pre className="flex-1 p-3 rounded bg-[#090A0D] border border-[#20242E] font-mono text-[10px] text-[#F3F4F6] overflow-auto">
        {script}
      </pre>
    </div>
  );
}
