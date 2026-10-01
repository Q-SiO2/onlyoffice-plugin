/** Moroccan mobile numbers only. Formatting separators are harmless; letters are rejected. */
export function normalizePhone(input: string): string {
  if (typeof input !== 'string' || input.length > 40 || /[^\d+\s().-]/.test(input)) throw new Error('Numéro non valide.');
  let n = input.replace(/[\s().-]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (/^0[67]\d{8}$/.test(n)) n = '+212' + n.slice(1);
  if (!/^\+212[67]\d{8}$/.test(n)) throw new Error('Numéro mobile marocain non valide.');
  return n;
}
