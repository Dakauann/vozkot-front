import { localeFormats, type Locale } from "@/i18n/config";

/**
 * Formatting, in the viewer's language and the box office's currency.
 *
 * Those are two different things and the split is deliberate: a German operator
 * of a Brazilian venue reads "24.000,00 R$": German separators, Brazilian
 * money. Deriving the currency from the locale would quietly relabel every
 * price as euros.
 */

const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function numberFormatter(key: string, locale: Locale, options: Intl.NumberFormatOptions) {
  const cacheKey = `${locale}:${key}`;
  let formatter = numberFormatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(localeFormats[locale], options);
    numberFormatters.set(cacheKey, formatter);
  }
  return formatter;
}

function dateFormatter(key: string, locale: Locale, options: Intl.DateTimeFormatOptions) {
  const cacheKey = `${locale}:${key}`;
  let formatter = dateFormatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(localeFormats[locale], options);
    dateFormatters.set(cacheKey, formatter);
  }
  return formatter;
}

/** Cents in, money out. The API never sends a float and neither does this. */
export function formatMoney(cents: number, locale: Locale, currency = "BRL"): string {
  return numberFormatter(`money:${currency}`, locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function formatNumber(value: number, locale: Locale): string {
  return numberFormatter("plain", locale, {}).format(value);
}

/**
 * What a date renders as when there is no date.
 *
 * A dash rather than an empty string: a blank cell in a table of dates reads as
 * a rendering bug, and a dash reads as "this record has none", which is what it
 * means.
 */
export const NO_DATE = ", ";

/**
 * Formats an instant, or returns a dash.
 *
 * Intl.DateTimeFormat THROWS a RangeError on an invalid date, and these
 * functions are called from server components, so one record with a missing
 * timestamp does not render as a blank line, it takes down the entire page with
 * a 500. A field that is absent because an API dropped it, or null because the
 * column is nullable, is a data problem worth seeing; it is not worth an outage.
 *
 * This is deliberately not a silent catch-all. It converts an unrenderable
 * value into a visible gap, which is the one behaviour that both keeps the page
 * up and still shows somebody that something is missing.
 */
export function formatDateTime(iso: string | null | undefined, locale: Locale): string {
  const date = toDate(iso);
  if (!date) return NO_DATE;
  return dateFormatter("dateTime", locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(iso: string | null | undefined, locale: Locale): string {
  const date = toDate(iso);
  if (!date) return NO_DATE;
  return dateFormatter("date", locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * The long form an event page uses: "sábado, 15 de novembro de 2026, 22:00".
 *
 * Here rather than in the page so it gets the same invalid-value guard as
 * everything else. A public event page is the last place that should be able to
 * 500 on one bad timestamp.
 */
export function formatLongDateTime(iso: string | null | undefined, locale: Locale): string {
  const date = toDate(iso);
  if (!date) return NO_DATE;
  return dateFormatter("longDateTime", locale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** The compact form a catalogue card uses: "sáb., 15 nov., 22:00". */
export function formatCardDateTime(iso: string | null | undefined, locale: Locale): string {
  const date = toDate(iso);
  if (!date) return NO_DATE;
  return dateFormatter("cardDateTime", locale, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** A Date that Intl can actually format, or null. */
function toDate(iso: string | null | undefined): Date | null {
  if (iso === null || iso === undefined || iso === "") return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatFileSize(bytes: number, locale: Locale): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) {
    return `${numberFormatter("size", locale, { maximumFractionDigits: 1 }).format(megabytes)} MB`;
  }
  return `${numberFormatter("sizeKb", locale, { maximumFractionDigits: 0 }).format(bytes / 1024)} KB`;
}

/**
 * An ISO instant as a datetime-local field wants it: the operator's own wall
 * clock, with no zone suffix. Feeding the raw ISO string to the input shifts
 * every event by the UTC offset, which in Brazil means a show at 22:00 renders
 * as 01:00 the next day.
 */
export function toDateTimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** The inverse: a wall-clock value back to the instant the API stores. */
export function fromDateTimeLocalValue(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * A price typed into a form, back to the cents the API stores.
 *
 * Both separators are accepted in either role, because four locales share this
 * one field: "240,00", "240.00", "1.240,50" and "1,240.50" are all the same
 * price. The rule is positional rather than locale-driven, the LAST separator
 * is the decimal point when one or two digits follow it, and grouping
 * otherwise. Reading the separator from the active locale instead would turn a
 * pt-BR operator typing "240.00" into twenty-four thousand reais, which is the
 * bug this replaced.
 */
export function parseMoneyToCents(value: string): number {
  const cleaned = value.trim().replace(/[^\d.,-]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return Number.NaN;

  const negative = cleaned.startsWith("-");
  const body = negative ? cleaned.slice(1) : cleaned;
  const lastSeparator = Math.max(body.lastIndexOf(","), body.lastIndexOf("."));
  const digits = body.replace(/[.,]/g, "");
  if (!digits) return Number.NaN;

  const decimals = lastSeparator === -1 ? "" : body.slice(lastSeparator + 1);
  const isDecimalPoint = decimals.length >= 1 && decimals.length <= 2 && /^\d+$/.test(decimals);

  const whole = isDecimalPoint ? digits.slice(0, digits.length - decimals.length) : digits;
  const fraction = isDecimalPoint ? decimals.padEnd(2, "0") : "00";
  const cents = Number.parseInt(whole || "0", 10) * 100 + Number.parseInt(fraction, 10);
  return Number.isFinite(cents) ? (negative ? -cents : cents) : Number.NaN;
}

/**
 * Cents to the value a price field holds while being edited, written with the
 * operator's own decimal separator: a Brazilian sees 240,00 and a US operator
 * 240.00. Grouping is deliberately off; separators inside an input are noise
 * to edit around.
 */
export function centsToMoneyInput(cents: number, locale: Locale): string {
  return numberFormatter("moneyInput", locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(cents / 100);
}
