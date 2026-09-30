const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function uid(prefix = ''): string {
  let s = '';
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}_${s}` : s;
}
