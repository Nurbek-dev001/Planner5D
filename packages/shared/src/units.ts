import type { Units } from './types';

/** Centimetres per one display unit */
const CM_PER_UNIT: Record<Units, number> = {
  mm: 0.1,
  cm: 1,
  m: 100,
  in: 2.54,
  ft: 30.48,
};

export const UNIT_LABELS: Record<Units, string> = {
  mm: 'мм',
  cm: 'см',
  m: 'м',
  in: 'in',
  ft: 'ft',
};

const DECIMALS: Record<Units, number> = { mm: 0, cm: 0, m: 2, in: 1, ft: 2 };

export function cmToUnit(cm: number, units: Units): number {
  return cm / CM_PER_UNIT[units];
}

export function unitToCm(value: number, units: Units): number {
  return value * CM_PER_UNIT[units];
}

export function roundForUnit(value: number, units: Units): number {
  const f = 10 ** DECIMALS[units];
  return Math.round(value * f) / f;
}

/** "4.50 m", "450 cm", "14.76 ft" */
export function formatLength(cm: number, units: Units): string {
  return `${cmToUnit(cm, units).toFixed(DECIMALS[units])} ${UNIT_LABELS[units]}`;
}

/** Area is always shown in m² (or ft² for imperial units) */
export function formatArea(cm2: number, units: Units): string {
  if (units === 'in' || units === 'ft') {
    return `${(cm2 / (30.48 * 30.48)).toFixed(1)} ft²`;
  }
  return `${(cm2 / 10000).toFixed(2)} м²`;
}

export function formatPrice(kzt: number): string {
  const rounded = Math.round(kzt);
  return `${rounded.toLocaleString('ru-RU').replace(/,/g, ' ')} ₸`;
}
