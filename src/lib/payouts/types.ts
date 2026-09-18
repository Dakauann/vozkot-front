/** What an organiser is owed, and when each part of it becomes theirs. */

/**
 * The kinds of movement a balance can have.
 *
 * Mirrors the server's `domain/ledger`. A kind the client does not know is
 * rendered by its own name rather than dropped, so a new one added on the
 * server shows up as an unstyled row instead of a line of money going missing
 * from a statement.
 */
export type LedgerKind =
  | "sale"
  | "reserve"
  | "refund"
  | "chargeback"
  | "gateway_fee"
  | "payout"
  | "adjustment";

export interface Balance {
  /**
   * Payable now.
   *
   * CAN BE NEGATIVE, and the screen must not clamp it: a refund is counted the
   * moment it happens while the sale it reverses is not yet due, so a negative
   * available balance means refunds have outrun settlements. Hiding that behind
   * a zero would show an organiser a balance they do not have.
   */
  availableCents: number;
  /** Sales that have not reached their settlement date. */
  pendingCents: number;
  /** The slice withheld past settlement, against the long tail of Pix reversals. */
  reservedCents: number;
  /** The whole claim, due or not. */
  totalCents: number;
  currency: string;
}

export interface LedgerEntry {
  id: string;
  eventId: string;
  orderId: string;
  kind: LedgerKind;
  /** Signed. Negative on a refund, chargeback, fee or payout. */
  amountCents: number;
  /** When this amount becomes payable. */
  availableAt: string;
  createdAt: string;
  note?: string;
}

export interface LedgerPage {
  data: LedgerEntry[];
  total: number;
}
