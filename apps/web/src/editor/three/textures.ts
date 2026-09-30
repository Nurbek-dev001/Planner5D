import * as THREE from 'three';
import type { Material as SpMaterial } from '@spaceplan/shared';

/**
 * Procedural textures for the MVP material library (no texture assets needed yet).
 * When a material gets a real `textureUrl` it can be loaded instead.
 */
const cache = new Map<string, THREE.CanvasTexture | null>();

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export function textureFor(mat: SpMaterial): THREE.CanvasTexture | null {
  if (mat.pattern === 'none') return null;
  if (cache.has(mat.id)) return cache.get(mat.id)!;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (!c) return null;
  const r = rand(mat.id.length * 7919 + 17);
  const base = mat.baseColor;
  c.fillStyle = base;
  c.fillRect(0, 0, size, size);

  switch (mat.pattern) {
    case 'planks': {
      const rows = 4;
      const h = size / rows;
      for (let i = 0; i < rows; i++) {
        const offset = (i % 2) * (size / 2) + r() * 40;
        for (let x = -size; x < size * 2; x += size) {
          c.fillStyle = shade(base, 0.9 + r() * 0.2);
          c.fillRect(x + offset, i * h, size, h);
        }
        c.strokeStyle = shade(base, 0.7);
        c.lineWidth = 2;
        c.strokeRect(-2, i * h, size + 4, h);
        c.beginPath();
        c.moveTo(offset % size, i * h);
        c.lineTo(offset % size, (i + 1) * h);
        c.stroke();
        // grain
        c.strokeStyle = shade(base, 0.85);
        c.lineWidth = 1;
        for (let g = 0; g < 6; g++) {
          const y = i * h + r() * h;
          c.beginPath();
          c.moveTo(0, y);
          c.bezierCurveTo(size / 3, y + r() * 6 - 3, (2 * size) / 3, y + r() * 6 - 3, size, y);
          c.stroke();
        }
      }
      break;
    }
    case 'parquet': {
      const n = 4;
      const s = size / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const horizontal = (i + j) % 2 === 0;
          for (let k = 0; k < 4; k++) {
            c.fillStyle = shade(base, 0.85 + r() * 0.25);
            if (horizontal) c.fillRect(i * s, j * s + (k * s) / 4, s, s / 4);
            else c.fillRect(i * s + (k * s) / 4, j * s, s / 4, s);
          }
          c.strokeStyle = shade(base, 0.65);
          c.strokeRect(i * s, j * s, s, s);
        }
      break;
    }
    case 'tiles': {
      const n = 2;
      const s = size / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          c.fillStyle = shade(base, 0.96 + r() * 0.06);
          c.fillRect(i * s, j * s, s, s);
        }
      c.strokeStyle = shade(base, 0.72);
      c.lineWidth = 4;
      for (let i = 0; i <= n; i++) {
        c.beginPath();
        c.moveTo(i * s, 0);
        c.lineTo(i * s, size);
        c.moveTo(0, i * s);
        c.lineTo(size, i * s);
        c.stroke();
      }
      break;
    }
    case 'brick': {
      const rows = 8;
      const h = size / rows;
      c.fillStyle = shade(base, 1.5);
      c.fillRect(0, 0, size, size);
      for (let i = 0; i < rows; i++) {
        const off = (i % 2) * (size / 8);
        for (let x = -size / 4; x < size; x += size / 4) {
          c.fillStyle = shade(base, 0.85 + r() * 0.3);
          c.fillRect(x + off + 2, i * h + 2, size / 4 - 4, h - 4);
        }
      }
      break;
    }
    case 'marble': {
      for (let v = 0; v < 14; v++) {
        c.strokeStyle = `rgba(120,120,125,${0.08 + r() * 0.15})`;
        c.lineWidth = 0.5 + r() * 2;
        c.beginPath();
        let x = r() * size;
        let y = 0;
        c.moveTo(x, y);
        while (y < size) {
          x += (r() - 0.5) * 40;
          y += 10 + r() * 20;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      break;
    }
    case 'concrete':
    case 'plaster':
    case 'carpet':
    case 'fabric':
    case 'leather': {
      const dots = mat.pattern === 'carpet' || mat.pattern === 'fabric' ? 9000 : 4000;
      for (let i = 0; i < dots; i++) {
        c.fillStyle = shade(base, 0.85 + r() * 0.3);
        const d = mat.pattern === 'plaster' ? 3 + r() * 6 : 1 + r() * 2;
        c.fillRect(r() * size, r() * size, d, d);
      }
      if (mat.pattern === 'fabric') {
        c.strokeStyle = shade(base, 0.9);
        for (let i = 0; i < size; i += 4) {
          c.beginPath();
          c.moveTo(i, 0);
          c.lineTo(i, size);
          c.stroke();
        }
      }
      break;
    }
    case 'wallpaper': {
      for (let x = 0; x < size; x += 32) {
        c.fillStyle = shade(base, 0.92);
        c.fillRect(x, 0, 12, size);
      }
      break;
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(mat.id, tex);
  return tex;
}
