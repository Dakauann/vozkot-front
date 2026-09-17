import { MAX_QUANTITY, type IntentLine } from "@/lib/checkout/intent";
import type { Seat } from "@/lib/seating/api";
import type { TicketTier } from "@/lib/events/types";

export interface MixedCart {
  seats: Seat[];
  quantities: Record<string, number>;
}

export type CartAction =
  | { type: "seats"; seats: Seat[] }
  | { type: "quantity"; tier: TicketTier; delta: number };

export function mixedCartReducer(cart: MixedCart, action: CartAction): MixedCart {
  const counted = Object.values(cart.quantities).reduce((sum, quantity) => sum + quantity, 0);
  if (action.type === "seats") {
    // An automatic seat search may finish after quantities changed. Reject a
    // now-oversized result instead of silently dropping part of the selection.
    if (action.seats.length + counted > MAX_QUANTITY) return cart;
    return { ...cart, seats: action.seats };
  }
  const { tier, delta } = action;
  const current = cart.quantities[tier.id] ?? 0;
  const ceiling = tier.status === "on_sale"
    ? Math.max(0, Math.min(tier.available, MAX_QUANTITY - cart.seats.length - counted + current))
    : 0;
  const quantity = Math.max(0, Math.min(current + delta, ceiling));
  return { ...cart, quantities: { ...cart.quantities, [tier.id]: quantity } };
}

export function mixedCartLines(cart: MixedCart): IntentLine[] {
  const byTier = new Map<string, string[]>();
  for (const seat of cart.seats) {
    const ids = byTier.get(seat.ticketId) ?? [];
    ids.push(seat.id);
    byTier.set(seat.ticketId, ids);
  }
  return [
    ...[...byTier].map(([ticketId, seatIds]) => ({ ticketId, quantity: seatIds.length, seatIds })),
    ...Object.entries(cart.quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([ticketId, quantity]) => ({ ticketId, quantity })),
  ];
}
