/**
 * The organiser's audience report.
 *
 * Keys are stable identifiers, never translated strings: `female`, `SP`,
 * `24_28`, `unknown`. The wording belongs to the message catalogues, which is
 * what lets one payload render in four locales, and `unknown` is a real row
 * rather than an omission so the percentages on screen add up to a hundred.
 */

/** One row of a breakdown. */
export interface ReportSlice {
  key: string;
  /** Present where the key is an id: a tier. Absent where the key is the label. */
  label?: string;
  /**
   * `orders` is how many purchases, `tickets` how many admissions. One order
   * for eight tickets is one buyer and eight seats; a table showing only one of
   * them is wrong for half the decisions made from it.
   */
  orders: number;
  tickets: number;
  /**
   * The organiser's earnings for this slice: the face value they priced.
   *
   * The only money the API sends. The platform's service fee and the gross the
   * buyer paid are not part of this report. See the money note in the Go
   * package `domain/report`. Do not add them here expecting the server to fill
   * them in; it does not select them.
   */
  netCents: number;
}

/** One day of the sales curve. `day` is YYYY-MM-DD, the day the money landed. */
export interface ReportDay {
  day: string;
  orders: number;
  tickets: number;
  /** The organiser's earnings for the day. */
  netCents: number;
}

export interface ReportTotals {
  orders: number;
  tickets: number;
  /** DISTINCT accounts: how many PEOPLE, not how many purchases. */
  buyers: number;
  /** What the organiser earned: the sum of the face values they priced. */
  netCents: number;
  refundedOrders: number;
  /** What went back, also at face value. */
  refundedCents: number;
  /**
   * The ticket médio, asked the two ways an organiser means it: what one buyer
   * spends in a go, and what one admission is worth. They differ whenever
   * anybody buys for a group, and only the second is evidence for repricing.
   *
   * Sent by the server rather than divided here, so the API, the CSV and every
   * screen round the same way.
   */
  averageOrderCents: number;
  averageTicketCents: number;
}

export interface EventReport {
  eventId: string;
  totals: ReportTotals;
  byGender: ReportSlice[];
  byAge: ReportSlice[];
  byUf: ReportSlice[];
  byCity: ReportSlice[];
  byTier: ReportSlice[];
  byDay: ReportDay[];
}

/**
 * One person who bought, as the organiser may see them.
 *
 * The document is masked and there is no date of birth or phone: an organiser
 * needs to match somebody to the ID they present at the door, not to be that
 * person at a bank.
 */
export interface Attendee {
  orderId: string;
  purchasedAt: string;
  status: string;
  name: string;
  email: string;
  documentMask?: string;
  gender?: string;
  /** Age AT PURCHASE, absent when not informed. */
  ageYears?: number;
  city?: string;
  uf?: string;
  ticketId: string;
  ticketTitle: string;
  quantity: number;
  unitPriceCents: number;
  /** The organiser's earnings from this line: face value times quantity. */
  netCents: number;
  checkedIn: boolean;
}

export interface AttendeePage {
  data: Attendee[];
  total: number;
  limit: number;
  offset: number;
}

/** The gender values the API stores, in the order a form offers them. */
export const GENDERS = ["female", "male", "non_binary", "other", "undisclosed"] as const;
export type Gender = (typeof GENDERS)[number];

/** Brazil's 27 federal units, alphabetically, the order a select offers them. */
export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
] as const;
export type UF = (typeof UFS)[number];

/**
 * The age bands, in the order a table renders them, with the unknown bucket
 * last. Mirrors domain/report.AgeBrackets on the server.
 */
export const AGE_BRACKETS = [
  "up_to_18", "19_23", "24_28", "29_33", "34_38",
  "39_43", "44_48", "49_53", "54_58", "59_plus", "unknown",
] as const;
export type AgeBracket = (typeof AGE_BRACKETS)[number];
