/**
 * Single source of truth for Forma's support/contact channels — used by the
 * landing footer (public) and the in-app support FAB (coach/admin). Keep the
 * WhatsApp number in wa.me international form (Egypt = 20 + the local number
 * without its leading 0).
 */
export const SUPPORT_WHATSAPP = '201553320453'; // displays as 0155 332 0453
export const SUPPORT_EMAIL = 'useformafitness@gmail.com';

/** wa.me chat link, optionally pre-filled with a message. */
export function whatsappUrl(message?: string): string {
  const base = `https://wa.me/${SUPPORT_WHATSAPP}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** mailto: link, optionally with a subject. */
export function emailUrl(subject?: string): string {
  return subject ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}` : `mailto:${SUPPORT_EMAIL}`;
}
