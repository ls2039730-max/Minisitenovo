/**
 * Safely parses any currency string (including Brazilian "59,90", "R$ 59,90",
 * standard "59.90", integers, or numbers) into a valid floating number or null.
 */
export function parsePrice(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const str = String(val).trim();
  if (!str) return null;

  // Handles comma decimal (e.g. 59,90 or 1.250,50 or R$ 49,99)
  if (str.includes(',')) {
    const cleaned = str
      .replace(/[^\d.,-]/g, '')
      .replace(/\./g, '') // remove thousands separator dots
      .replace(',', '.'); // convert comma to decimal dot
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }

  // Standard dot decimal or integers
  const cleaned = str.replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Formats a number to Brazilian Real string (e.g. "59,90")
 */
export function formatPriceBRL(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '';
  return val.toFixed(2).replace('.', ',');
}
