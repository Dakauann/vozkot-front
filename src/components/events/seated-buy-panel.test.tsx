import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/i18n/messages/en.json";
import type { TicketTier } from "@/lib/events/types";
import type { Marker, Seat } from "@/lib/seating/api";
import { readIntent } from "@/lib/checkout/intent";
import { SeatedBuyPanel } from "./seated-buy-panel";
import { mixedCartReducer } from "./mixed-cart";

const { push, requireAuth, fetchSeatMap } = vi.hoisted(() => ({
  push: vi.fn(), requireAuth: vi.fn(), fetchSeatMap: vi.fn(),
}));
vi.mock("@/i18n/routing", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/contexts/auth-dialog-context", () => ({ useAuthDialog: () => ({ requireAuth }) }));
vi.mock("@/lib/seating/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/seating/api")>(), fetchSeatMap,
}));
vi.mock("react-zoom-pan-pinch", () => ({
  TransformWrapper: ({ children }: { children: (controls: object) => React.ReactNode }) =>
    children({ zoomIn: vi.fn(), zoomOut: vi.fn(), resetTransform: vi.fn() }),
  TransformComponent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const chair: Seat = {
  id: "seat-1", ticketId: "chairs", section: "Cadeiras", row: "A", seat: "1",
  kind: "standard", status: "available", rowOrder: 0, seatOrder: 0, x: 0, y: 100,
};
const tier = (id: string, title: string, priceCents: number, available = 20): TicketTier => ({
  id, title, priceCents, available, eventId: "event", description: "Individual admission",
  feeCents: priceCents / 10, currency: "BRL", quantity: available, sold: 0, status: "on_sale",
});
const tiers = [tier("chairs", "Cadeiras", 18000), tier("floor", "Pista", 12000), tier("box", "Camarote", 60000)];
// 180x116 clears the threshold the picker uses to draw controls in place. The
// map sits at its natural scale here, because one chair cannot imply a pitch.
const area = (id: string, name: string, ticketId: string | undefined,
  kind: Marker["kind"] = "booth", width = 180, height = 116): Marker =>
  ({ id, name, ticketId, kind, capacity: 10, x: 0, y: 0, width, height });
// Both sides carry the SAME tier title, which is what the area name has to fix.
const sides = [tier("chairs", "Cadeiras", 18000), tier("left", "Camarote", 60000, 10),
  tier("right", "Camarote", 60000, 2)];
const boxes = [area("sec-left", "Camarote esquerdo", "left"), area("sec-right", "Camarote direito", "right")];
function mount(items = tiers) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>
    <SeatedBuyPanel eventId="event" eventSlug="festival" tiers={items} locale="en" holdMinutes={30} />
  </NextIntlClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue(true);
  fetchSeatMap.mockResolvedValue({ seats: [chair], markers: [], complete: true, version: 1 });
});
afterEach(cleanup);

describe("mixed-event ticket purchase", () => {
  it("keeps numbered tickets out of quantity controls and starts with zero tickets", async () => {
    mount();
    expect(screen.getByRole("button", { name: "Select a ticket" })).toBeDisabled();
    expect(screen.getByText("0 tickets")).toBeInTheDocument();
    await screen.findByRole("button", { name: "Add one Pista ticket" });
    expect(screen.queryByRole("button", { name: "Add one Cadeiras ticket" })).not.toBeInTheDocument();
  });

  it("sends Pista, Camarote and the exact chair together, with the correct fees", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Add one Pista ticket" }));
    fireEvent.click(screen.getByRole("button", { name: "Add one Camarote ticket" }));
    fireEvent.click(screen.getByRole("button", { name: /Row A, seat 1,/ }));
    // 120 + 600 + 180, plus 10% fees.
    expect(screen.getByText(/Total:.*990/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buy 3 tickets" }));
    await waitFor(() => expect(push).toHaveBeenCalledOnce());
    expect(readIntent(new URLSearchParams(push.mock.calls[0][0].split("?")[1]))).toEqual({
      eventSlug: "festival",
      lines: [
        { ticketId: "chairs", quantity: 1, seatIds: ["seat-1"] },
        { ticketId: "floor", quantity: 1 },
        { ticketId: "box", quantity: 1 },
      ],
    });
  });

  it("allows admission-only checkout and preserves selection when sign-in is cancelled", async () => {
    requireAuth.mockResolvedValueOnce(false);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Add one Pista ticket" }));
    fireEvent.click(screen.getByRole("button", { name: "Buy 1 ticket" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Buy 1 ticket" })).toBeEnabled());
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Buy 1 ticket" }));
    await waitFor(() => expect(push).toHaveBeenCalledOnce());
    expect(readIntent(new URLSearchParams(push.mock.calls[0][0].split("?")[1]))?.lines)
      .toEqual([{ ticketId: "floor", quantity: 1 }]);
  });

  it("enforces the basket cap across seats and quantities and releases room on removal", async () => {
    mount();
    const add = await screen.findByRole("button", { name: "Add one Pista ticket" });
    fireEvent.click(screen.getByRole("button", { name: /Row A, seat 1,/ }));
    for (let i = 0; i < 9; i++) fireEvent.click(add);
    expect(add).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add one Camarote ticket" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove one Pista ticket" }));
    expect(add).toBeEnabled();
  });

  it("respects stock and hides controls for tickets not on sale", async () => {
    mount([tiers[0], tier("floor", "Pista", 12000, 1), { ...tiers[2], status: "cancelled" }]);
    const add = await screen.findByRole("button", { name: "Add one Pista ticket" });
    fireEvent.click(add);
    expect(add).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add one Camarote ticket" })).not.toBeInTheDocument();
  });

  it("does not offer seated tiers as quantity tickets when the map fails", async () => {
    fetchSeatMap.mockResolvedValue(null);
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: /Add one/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select a ticket" })).toBeDisabled();
  });

  it("rejects a late best-seat result that no longer fits the shared basket", () => {
    const cart = { seats: [], quantities: { floor: 10 } };
    expect(mixedCartReducer(cart, { type: "seats", seats: [chair] })).toBe(cart);
  });
});

describe("choosing between two boxes on the map", () => {
  const mapWith = (markers: Marker[]) =>
    fetchSeatMap.mockResolvedValue({ seats: [chair], markers, complete: true, version: 1 });

  it("sends the side the buyer pressed, and leaves the other side untouched", async () => {
    mapWith(boxes);
    mount(sides);
    fireEvent.click(await screen.findByRole("button", { name: "Add admission to Camarote direito" }));
    // 600 plus the 10% fee, for the right-hand box alone.
    expect(screen.getByText(/Total:.*660/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buy 1 ticket" }));
    await waitFor(() => expect(push).toHaveBeenCalledOnce());
    expect(readIntent(new URLSearchParams(push.mock.calls[0][0].split("?")[1]))?.lines)
      .toEqual([{ ticketId: "right", quantity: 1 }]);
  });

  it("names each ticket after its area, so a shared tier title cannot hide the side", async () => {
    mapWith(boxes);
    mount(sides);
    fireEvent.click(await screen.findByRole("button", { name: "Add admission to Camarote esquerdo" }));
    expect(screen.getByText("1 × Camarote esquerdo")).toBeInTheDocument();
    expect(screen.queryByText("1 × Camarote")).not.toBeInTheDocument();
  });

  it("counts each side against its own stock", async () => {
    mapWith(boxes);
    mount(sides);
    const right = await screen.findByRole("button", { name: "Add admission to Camarote direito" });
    fireEvent.click(right);
    fireEvent.click(right);
    expect(right).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add admission to Camarote esquerdo" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove admission from Camarote direito" }));
    expect(right).toBeEnabled();
  });

  it("offers zoom rather than controls too small to hit on a cramped area", async () => {
    mapWith([area("sec-right", "Camarote direito", "right", "booth", 120, 80)]);
    mount(sides);
    expect(await screen.findByRole("button", { name: "Zoom into Camarote direito to choose tickets" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add admission to Camarote direito" })).not.toBeInTheDocument();
  });

  it("keeps scenery and unconfigured areas out of the purchase flow", async () => {
    mapWith([area("sec-stage", "Palco", undefined, "stage", 400, 120),
      area("sec-loose", "Camarote direito", undefined)]);
    mount(sides);
    await screen.findByRole("button", { name: /Row A, seat 1,/ });
    expect(screen.queryByRole("button", { name: /Palco/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Camarote direito/ })).not.toBeInTheDocument();
  });
});
