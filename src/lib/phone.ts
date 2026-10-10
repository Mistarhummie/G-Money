/** Normalises Kenyan mobile numbers to E.164 (+2547XXXXXXXX or +2541XXXXXXXX). Returns null if invalid. */
export function normaliseKenyanPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, "");
  let local: string | null = null;
  if (/^\+254[17]\d{8}$/.test(digits)) local = digits.slice(4);
  else if (/^254[17]\d{8}$/.test(digits)) local = digits.slice(3);
  else if (/^0[17]\d{8}$/.test(digits)) local = digits.slice(1);
  else if (/^[17]\d{8}$/.test(digits)) local = digits;
  return local ? `+254${local}` : null;
}
