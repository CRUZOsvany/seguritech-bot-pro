/** Redondeo a centavos — mismo criterio que roundMoney del backend. */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export function formatMoney(n: number): string {
  return MXN.format(n);
}

/**
 * Lee un monto tecleado por el cajero: "500", "500.5", "500,50", "$1,200.00".
 * Devuelve null si no es un número válido ≥ 0.
 */
export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[$\s]/g, '');
  if (cleaned === '') return null;
  // "1,200.50" → coma de miles; "500,50" → coma decimal.
  const normalized = /,\d{1,2}$/.test(cleaned) && !cleaned.includes('.')
    ? cleaned.replace(',', '.')
    : cleaned.replace(/,/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  return roundMoney(Number(normalized));
}
