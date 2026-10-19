/**
 * Remove caracteres não numéricos (evita path traversal / injeção em URLs de terceiros).
 * Retorna `null` se o comprimento não for típico de GTIN/EAN (8–14 dígitos).
 */
export function sanitizeBarcodeDigits(raw: string): string | null {
  const digits = String(raw ?? '')
    .trim()
    .replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}
