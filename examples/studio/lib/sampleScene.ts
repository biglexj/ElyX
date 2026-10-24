// SPDX-License-Identifier: MIT
// Copyright (c) 2026 biglexj
import { clamp8 } from './constants';
import type { SamplePreset } from '../types';

/**
 * Genera una imagen de prueba procedural en un canvas.
 *
 * - `peyto`: paisaje con cielo, sol, montañas, lago y pinos, con grano de
 *   sensor ±3 y una leyenda de 1 px.
 * - `color`: carta de color YCoCg-R con degradado espectral y discos
 *   alternos, para comprobar la separación de canales.
 */
export function generateSampleScene(
  preset: SamplePreset = 'peyto',
  width = 1280,
  height = 800
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo obtener el contexto 2D del lienzo');

  if (preset === 'peyto') {
    const sky = ctx.createLinearGradient(0, 0, 0, height * 0.52);
    sky.addColorStop(0, '#1e5799');
    sky.addColorStop(0.55, '#5596d6');
    sky.addColorStop(1, '#cbe3f8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height * 0.52);

    const sun = ctx.createRadialGradient(width * 0.78, height * 0.18, 10, width * 0.78, height * 0.18, 180);
    sun.addColorStop(0, 'rgba(255, 252, 235, 0.95)');
    sun.addColorStop(0.4, 'rgba(255, 240, 200, 0.35)');
    sun.addColorStop(1, 'rgba(255, 240, 200, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height * 0.52);

    ctx.fillStyle = '#4a607a';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.52);
    const peaksBack = [
      [0, 0.36], [0.12, 0.22], [0.23, 0.33], [0.37, 0.16],
      [0.50, 0.29], [0.64, 0.14], [0.79, 0.27], [0.91, 0.19], [1.0, 0.31],
    ];
    peaksBack.forEach(([px, py]) => ctx.lineTo(width * px, height * py));
    ctx.lineTo(width, height * 0.52);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#eef5fc';
    ctx.beginPath();
    peaksBack.forEach(([px, py], idx) => {
      const x = width * px;
      const y = height * py;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    for (let i = peaksBack.length - 1; i >= 0; i--) {
      const [px, py] = peaksBack[i];
      ctx.lineTo(width * px, height * (py + (i % 2 === 1 ? 0.065 : 0.02)));
    }
    ctx.closePath();
    ctx.fill();

    const rockGrad = ctx.createLinearGradient(0, height * 0.25, 0, height * 0.58);
    rockGrad.addColorStop(0, '#36485e');
    rockGrad.addColorStop(1, '#1e2c3a');
    ctx.fillStyle = rockGrad;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.56);
    ctx.lineTo(width * 0.08, height * 0.31);
    ctx.lineTo(width * 0.28, height * 0.44);
    ctx.lineTo(width * 0.55, height * 0.26);
    ctx.lineTo(width * 0.76, height * 0.43);
    ctx.lineTo(width, height * 0.28);
    ctx.lineTo(width, height * 0.56);
    ctx.closePath();
    ctx.fill();

    const lake = ctx.createLinearGradient(0, height * 0.50, width, height);
    lake.addColorStop(0, '#00b8a9');
    lake.addColorStop(0.45, '#00d4aa');
    lake.addColorStop(0.8, '#05828e');
    lake.addColorStop(1, '#074f66');
    ctx.fillStyle = lake;
    ctx.fillRect(0, height * 0.50, width, height * 0.50);

    ctx.strokeStyle = 'rgba(220, 255, 250, 0.22)';
    ctx.lineWidth = 1;
    for (let y = Math.floor(height * 0.52); y < height; y += 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= width; x += 32) {
        const wave = Math.sin(x * 0.03 + y * 0.15) * 1.5;
        ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }

    const drawPineBank = (
      startX: number, endX: number, baseY: number, count: number,
      darkColor: string, lightColor: string
    ) => {
      for (let i = 0; i < count; i++) {
        const t = i / count;
        const tx = startX + (endX - startX) * t;
        const ty = baseY + Math.sin(t * 9) * 18 + (i % 5) * 4;
        const th = 26 + (i % 7) * 5;
        ctx.fillStyle = i % 2 === 0 ? darkColor : lightColor;
        ctx.beginPath();
        ctx.moveTo(tx, ty - th);
        ctx.lineTo(tx - 9, ty);
        ctx.lineTo(tx + 9, ty);
        ctx.closePath();
        ctx.fill();
      }
    };
    drawPineBank(0, width * 0.46, height * 0.54, 85, '#133326', '#1e4d38');
    drawPineBank(width * 0.58, width, height * 0.56, 75, '#0f291e', '#1a4231');

    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;
    let seed = 1337;
    for (let i = 0; i < d.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) | 0;
      const grain = ((seed >> 24) & 7) - 3;
      d[i] = clamp8(d[i] + grain);
      d[i + 1] = clamp8(d[i + 1] + grain);
      d[i + 2] = clamp8(d[i + 2] + grain);
    }
    ctx.putImageData(imgData, 0, 0);

    ctx.fillStyle = 'rgba(9, 10, 13, 0.78)';
    ctx.fillRect(28, 28, 430, 92);
    ctx.strokeStyle = '#00D4AA';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(28, 28, 430, 92);

    ctx.fillStyle = '#F3F4F6';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('LAGO PEYTO // MUESTRA 8K RAW', 46, 62);
    ctx.fillStyle = '#00D4AA';
    ctx.font = '13px monospace';
    ctx.fillText('Cielo + Agua Turquesa + Pinos (Grano ±3) + Texto 1px', 46, 88);
    ctx.fillStyle = '#7E8695';
    ctx.fillText('Arrastra la cortina central (||) o haz Zoom con la rueda', 46, 108);
  } else {
    for (let y = 0; y < height; y++) {
      const grad = ctx.createLinearGradient(0, y, width, y);
      grad.addColorStop(0, '#ff3b30');
      grad.addColorStop(0.2, '#ff9500');
      grad.addColorStop(0.4, '#ffcc00');
      grad.addColorStop(0.6, '#00d4aa');
      grad.addColorStop(0.8, '#007aff');
      grad.addColorStop(1, '#af52de');
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, width, 1);
    }
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#090A0D' : '#F3F4F6';
      ctx.beginPath();
      ctx.arc(width * (0.15 + i * 0.14), height * 0.5, 75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(9, 10, 13, 0.82)';
    ctx.fillRect(28, 28, 420, 76);
    ctx.fillStyle = '#F3F4F6';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('CARTA DE COLOR YCoCg-R', 44, 60);
    ctx.fillStyle = '#00D4AA';
    ctx.font = '13px monospace';
    ctx.fillText('Prueba de separación Luma (Y) vs Croma (Co/Cg)', 44, 84);
  }

  return canvas;
}
