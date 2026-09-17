import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/i18n/messages/en.json";
import type { Ticket } from "@/lib/tickets/types";
import type { LayoutDetail, LayoutSection } from "@/lib/seating/api";
import { EventSeatingPanel } from "./event-seating-panel";

const api = vi.hoisted(() => ({
  listVenues: vi.fn(), listLayouts: vi.fn(), fetchLayout: vi.fn(),
  fetchAvailability: vi.fn(), bindSeating: vi.fn(), bindAreaTickets: vi.fn(),
}));
const { error } = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/seating/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/seating/api")>(), ...api,
}));
vi.mock("sonner", () => ({ toast: { error, success: vi.fn() } }));
const { updateTicket } = vi.hoisted(() => ({ updateTicket: vi.fn() }));
vi.mock("@/lib/tickets/api", () => ({ updateTicket }));
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
// The preview draws the room; this suite is about the join between the room and
// the money, and the canvas has nothing to say about it.
// The tone helpers come from this module too, so the real ones stay.
vi.mock("@/components/seating/room-preview", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/seating/room-preview")>(),
  RoomPreview: () => <div />,
}));
vi.mock("@/components/seating/area-ticket-bindings", () => ({ AreaTicketBindings: () => <div /> }));

const section = (id: string, name: string, kind: LayoutSection["kind"], capacity: number): LayoutSection =>
  ({ id, name, kind, capacity, offsetX: 0, offsetY: 0, width: 180, height: 116, category: "", displayOrder: 0 });
const seat = (row: string, number: number, category: string) => ({
  id: `${category}-${row}${number}`, sectionId: "sec-chairs", row, seat: String(number),
  category, kind: "standard", rowOrder: 0, seatOrder: number, x: number * 10, y: 0,
});
// A plan shaped like the one that exposed this: a stage, a standing floor, two
// boxes named alike, and the only chairs sitting in a single band.
const detail = {
  layout: { id: "lay-1", name: "Festa", status: "draft", venueId: "ven-1", version: 1 },
  sections: [
    section("sec-stage", "Palco", "stage", 0),
    section("sec-floor", "Pista", "standing", 600),
    section("sec-left", "Camarote esquerdo", "booth", 10),
    section("sec-right", "Camarote direito", "booth", 10),
    section("sec-chairs", "Cadeiras", "seated", 96),
  ],
  seats: [seat("A", 1, "Cadeiras"), seat("A", 2, "Cadeiras")],
  bands: ["Cadeiras"],
} as unknown as LayoutDetail;

const tier = (id: string, title: string, quantity: number): Ticket => ({
  id, title, quantity, eventId: "evt-1", description: "", priceCents: 20000,
  currency: "BRL", sold: 0, reserved: 0, status: "draft",
} as unknown as Ticket);
const tiers = [tier("tkt-chairs", "Cadeiras", 96), tier("tkt-left", "Camarote Esquerdo", 10),
  tier("tkt-right", "Camarote Direito", 10), tier("tkt-big", "Pista", 600)];

function mount(items = tiers) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>
    <EventSeatingPanel eventId="evt-1" tiers={items} salesMode="seated"
      eventName="Festa" venueName="Rua principal" />
  </NextIntlClientProvider>);
}
/** The row of the "Tickets by area" list for one area, by its visible label. */
const areaRow = (name: string) => screen.getByLabelText(name) as HTMLSelectElement;

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchAvailability.mockResolvedValue([]);
  api.listVenues.mockResolvedValue({ data: { data: [{ id: "ven-1", name: "Casa" }] } });
  api.listLayouts.mockResolvedValue({ data: { data: [{ id: "lay-1", name: "Festa", status: "draft" }] } });
  api.fetchLayout.mockResolvedValue(detail);
  api.bindSeating.mockResolvedValue({ data: { eventId: "evt-1", seatCount: 96 } });
  api.bindAreaTickets.mockResolvedValue({ data: undefined });
  updateTicket.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

describe("pricing the parts of a room that have no numbered chairs", () => {
  it("offers a ticket for the standing floor and for each box, which bands never did", async () => {
    mount();
    await screen.findByLabelText("Pista");
    // The chairs are a price band; the other three are not, and used to vanish.
    expect(areaRow("Camarote esquerdo")).toBeInTheDocument();
    expect(areaRow("Camarote direito")).toBeInTheDocument();
    expect(screen.queryByLabelText("Palco")).not.toBeInTheDocument();
  });

  it("links each box to its own ticket, so two boxes named alike stay apart", async () => {
    mount();
    fireEvent.change(await screen.findByLabelText("Camarote esquerdo"), { target: { value: "tkt-left" } });
    fireEvent.change(areaRow("Camarote direito"), { target: { value: "tkt-right" } });
    fireEvent.click(screen.getByRole("button", { name: "Put the seats on sale" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Put the seats on sale" }));
    await waitFor(() => expect(api.bindAreaTickets).toHaveBeenCalledOnce());
    expect(api.bindSeating).toHaveBeenCalledWith("evt-1",
      { layoutId: "lay-1", ticketByCategory: { Cadeiras: "tkt-chairs" } });
    expect(api.bindAreaTickets).toHaveBeenCalledWith("evt-1",
      { "sec-left": "tkt-left", "sec-right": "tkt-right" });
  });

  it("keeps two places from sharing one lote, because an order could not tell them apart", async () => {
    mount();
    const left = await screen.findByLabelText("Camarote esquerdo");
    const option = (select: HTMLElement, name: RegExp) =>
      within(select).getByRole("option", { name }) as HTMLOptionElement;
    expect(option(left, /^Camarote Direito/)).toBeEnabled();
    fireEvent.change(areaRow("Camarote direito"), { target: { value: "tkt-right" } });
    expect(option(areaRow("Camarote esquerdo"), /^Camarote Direito/)).toBeDisabled();
  });

  it("lets an oversized lote be chosen, says what is wrong, and blocks the one-way commit", async () => {
    mount();
    // Pista holds 600 and this lote sells 10, so it is the box's lote in a
    // floor's row: the size is the whole problem and it used to be invisible.
    fireEvent.change(await screen.findByLabelText("Pista"), { target: { value: "tkt-left" } });
    expect(screen.getByText(/Camarote Esquerdo has 10 tickets and Pista holds 600/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Put the seats on sale" })).toBeDisabled();
    expect(screen.getByText(/Resize the tickets flagged above/)).toBeInTheDocument();
  });

  it("resizes the lote to the place in one press and then allows the commit", async () => {
    mount();
    fireEvent.change(await screen.findByLabelText("Camarote esquerdo"), { target: { value: "tkt-big" } });
    fireEvent.click(screen.getByRole("button", { name: "Resize to 10" }));
    await waitFor(() => expect(updateTicket).toHaveBeenCalledOnce());
    expect(updateTicket.mock.calls[0][1]).toMatchObject({ quantity: 10, title: "Pista" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Put the seats on sale" })).toBeEnabled());
  });

  it("warns without blocking when a band's lote is smaller than the block of chairs", async () => {
    mount([tier("tkt-chairs", "Cadeiras", 1), ...tiers.slice(1)]);
    await screen.findByLabelText("Pista");
    // One lote against two drawn chairs: legal, and worth saying out loud.
    expect(screen.getByText(/only 1 can be sold/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Put the seats on sale" })).toBeEnabled();
  });

  it("skips the second call when no area was priced", async () => {
    mount();
    await screen.findByLabelText("Pista");
    fireEvent.click(screen.getByRole("button", { name: "Put the seats on sale" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Put the seats on sale" }));
    await waitFor(() => expect(api.bindSeating).toHaveBeenCalledOnce());
    expect(api.bindAreaTickets).not.toHaveBeenCalled();
  });

  it("says the seats went on sale without the areas when only the second call fails", async () => {
    api.bindAreaTickets.mockResolvedValue({ error: { message: "ticket quantity exceeds area capacity" } });
    mount();
    fireEvent.change(await screen.findByLabelText("Pista"), { target: { value: "tkt-big" } });
    fireEvent.click(screen.getByRole("button", { name: "Put the seats on sale" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Put the seats on sale" }));
    await waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(error.mock.calls[0][0]).toMatch(/seats went on sale, but the areas did not/i);
    expect(error.mock.calls[0][0]).toMatch(/exceeds area capacity/);
  });
});
