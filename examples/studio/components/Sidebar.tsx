// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import { Sliders, Code } from 'lucide-react';
import type { ReactNode } from 'react';
import type { StudioTab } from '../types';

export interface SidebarProps {
  activeTab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
  children: ReactNode;
}

/** Panel lateral colapsable con las pestañas de inspector y código. */
export function Sidebar({ activeTab, onTabChange, children }: SidebarProps) {
  return (
    <aside className="w-96 h-full flex flex-col shrink-0 bg-[#12141A] border-l border-[#20242E] z-30">
      <div className="flex border-b border-[#20242E]">
        <button
          onClick={() => onTabChange('inspector')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 ${
            activeTab === 'inspector'
              ? 'text-[#00D4AA] border-b-2 border-[#00D4AA]'
              : 'text-[#7E8695] hover:text-[#F3F4F6]'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" /> Comparador A/B y Cuentas
        </button>
        <button
          onClick={() => onTabChange('code')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 ${
            activeTab === 'code'
              ? 'text-[#00D4AA] border-b-2 border-[#00D4AA]'
              : 'text-[#7E8695] hover:text-[#F3F4F6]'
          }`}
        >
          <Code className="w-3.5 h-3.5" /> elyx_native.py
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {children}
      </div>
    </aside>
  );
}
