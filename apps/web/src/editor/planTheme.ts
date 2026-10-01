/**
 * Visual styles of the 2D plan. Both are technical-drawing styles that share the same
 * rendering (hatched wall sections, architectural dimension lines, line-art furniture)
 * and differ only in palette: a dark blueprint and a light CAD sheet.
 */
export type PlanStyle = 'blueprint' | 'drafting';

export const MONO_FONT = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export interface PlanTheme {
  bg: string;
  gridMinor: string;
  gridMajor: string;
  gridAxis: string;
  wallFill: string;
  wallHatch: string;
  wallStroke: string;
  selFill: string;
  accent: string;
  /** Alpha of the floor-material tint inside rooms */
  roomAlpha: number;
  text: string;
  textMuted: string;
  dim: string;
  dimText: string;
  symbol: SymbolStyle;
  glass: string;
  snapEndpoint: string;
  snapWall: string;
  door: string;
  window: string;
}

/** How furniture plan symbols are painted */
export interface SymbolStyle {
  stroke: string;
  /** Fill for an item colour; `amount` 1 = strongest, 0 = background */
  fill: (hex: string, amount: number) => string;
  /** Inner parts that read as "empty" (sink bowl, bathtub) */
  hollow: string;
  /** Screens and other dark solids */
  solid: string;
  light: string;
  glass: string;
  plant: string;
}

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

/** Mix a hex colour with white: amount=1 → original colour, 0 → white */
export function tint(hex: string, amount: number): string {
  const [r, g, b] = rgb(hex);
  const m = (v: number) => Math.round(255 - (255 - v) * amount);
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

/** Translucent version of a hex colour */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Classic light symbol palette (catalog thumbnails, light sheet) */
export const LIGHT_SYMBOLS: SymbolStyle = {
  stroke: '#334155',
  fill: (hex, amount) => tint(hex, amount * 0.6),
  hollow: '#ffffff',
  solid: '#1f2937',
  light: '#fef3c7',
  glass: '#dbeafe',
  plant: '#4f7d4a',
};

const BLUEPRINT_BG = '#0b1626';

export const PLAN_THEMES: Record<PlanStyle, PlanTheme> = {
  blueprint: {
    bg: BLUEPRINT_BG,
    gridMinor: 'rgba(96, 165, 250, 0.07)',
    gridMajor: 'rgba(96, 165, 250, 0.17)',
    gridAxis: 'rgba(56, 189, 248, 0.35)',
    wallFill: '#12253f',
    wallHatch: 'rgba(147, 197, 253, 0.45)',
    wallStroke: '#dbeafe',
    selFill: 'rgba(34, 211, 238, 0.28)',
    accent: '#22d3ee',
    roomAlpha: 0.13,
    text: '#e2ecfb',
    textMuted: '#7d9cc6',
    dim: '#6f93c2',
    dimText: '#bcd2f0',
    symbol: {
      stroke: '#a5c3ea',
      fill: (hex, amount) => alpha(hex, 0.08 + amount * 0.22),
      hollow: BLUEPRINT_BG,
      solid: '#a5c3ea',
      light: 'rgba(253, 224, 71, 0.25)',
      glass: 'rgba(125, 211, 252, 0.25)',
      plant: '#4ade80',
    },
    glass: 'rgba(125, 211, 252, 0.55)',
    snapEndpoint: '#fbbf24',
    snapWall: '#34d399',
    door: '#fbbf24',
    window: '#38bdf8',
  },
  drafting: {
    bg: '#ffffff',
    gridMinor: '#f1f4f8',
    gridMajor: '#e1e6ee',
    gridAxis: '#c7d2e2',
    wallFill: '#ffffff',
    wallHatch: '#475569',
    wallStroke: '#0f172a',
    selFill: 'rgba(37, 99, 235, 0.18)',
    accent: '#2563eb',
    roomAlpha: 0.22,
    text: '#0f172a',
    textMuted: '#64748b',
    dim: '#475569',
    dimText: '#1e293b',
    symbol: { ...LIGHT_SYMBOLS, fill: (hex, amount) => tint(hex, 0.08 + amount * 0.35) },
    glass: '#7dd3fc',
    snapEndpoint: '#f59e0b',
    snapWall: '#10b981',
    door: '#f59e0b',
    window: '#0ea5e9',
  },
};

/** CSS variables for the floating HUD panels (see `hud` utilities in index.css) */
export const HUD_VARS: Record<PlanStyle, Record<string, string>> = {
  blueprint: {
    '--hud-bg': 'rgba(10, 21, 38, 0.86)',
    '--hud-fg': '#b9cdea',
    '--hud-border': 'rgba(56, 189, 248, 0.22)',
    '--hud-hover': 'rgba(148, 197, 253, 0.1)',
    '--hud-accent': '#22d3ee',
    '--hud-accent-bg': 'rgba(34, 211, 238, 0.14)',
    '--hud-accent-border': 'rgba(34, 211, 238, 0.45)',
  },
  drafting: {
    '--hud-bg': 'rgba(255, 255, 255, 0.92)',
    '--hud-fg': '#334155',
    '--hud-border': '#cbd5e1',
    '--hud-hover': '#f1f5f9',
    '--hud-accent': '#1d4ed8',
    '--hud-accent-bg': '#eff6ff',
    '--hud-accent-border': '#93c5fd',
  },
};
