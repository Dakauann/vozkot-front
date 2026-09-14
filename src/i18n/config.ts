/**
 * The four locales, in the order a switcher shows them.
 *
 * Portuguese leads and is the default: the box office sells ingressos in
 * Brazil, and the operator using this every day reads pt-BR. The other three
 * exist because the product is sold beyond it, not as an afterthought, every
 * catalog is complete, and a missing key is a bug, not a silent fallback.
 */
export const locales = ["pt", "en", "de", "es"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "pt";

export const localeNames: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  de: "Deutsch",
  es: "Español",
};

/**
 * The two-letter tag shown in the collapsed switcher. Letters, not flags: a
 * flag names a country and these name languages, and the two stop agreeing the
 * moment a Portuguese speaker outside Brazil opens the app.
 */
export const localeLabels: Record<Locale, string> = {
  pt: "PT",
  en: "EN",
  de: "DE",
  es: "ES",
};

/**
 * The BCP-47 tag used for Intl formatting. It is not the routing locale:
 * currency and dates need the region, and "pt" alone would format a Brazilian
 * price with European separators.
 */
export const localeFormats: Record<Locale, string> = {
  pt: "pt-BR",
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
