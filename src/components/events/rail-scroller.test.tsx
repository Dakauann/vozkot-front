import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/i18n/messages/en.json";
import type { EventListing } from "@/lib/events/types";
import { RailScroller } from "./rail-scroller";

const { moreRailEvents } = vi.hoisted(() => ({ moreRailEvents: vi.fn() }));
vi.mock("./rail-actions", () => ({ moreRailEvents }));
vi.mock("@/i18n/routing", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("next/image", () => ({ default: () => <span /> }));

const listing = (id: string): EventListing =>
  ({
    id, slug: id, name: `Show ${id}`, startsAt: "2026-09-20T17:20:00Z",
    location: { venue: "Casa Vozkot", city: "Natal", uf: "RN" },
    media: [], fromPriceCents: 12000, availableTickets: 40,
  }) as unknown as EventListing;

const query = { sort: "starts_at" as const, available: true };
function mount({ loaded = 2, total = 10 } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RailScroller query={query} locale="en" loaded={loaded} total={total} pageSize={8}>
        <li>first page</li>
      </RailScroller>
    </NextIntlClientProvider>,
  );
}
/** happy-dom does no layout, so the track's geometry is stated outright. */
function track(geometry: { scrollWidth: number; clientWidth: number; scrollLeft: number }) {
  const node = screen.getByRole("list");
  for (const [key, value] of Object.entries(geometry)) {
    Object.defineProperty(node, key, { value, configurable: true });
  }
  node.scrollBy = vi.fn();
  return node;
}

beforeEach(() => {
  vi.clearAllMocks();
  moreRailEvents.mockResolvedValue({ events: [listing("b1"), listing("b2")], more: true });
});
afterEach(cleanup);

describe("a rail that fetches the rest of itself", () => {
  it("renders the server's first page without asking for anything", () => {
    mount();
    expect(screen.getByText("first page")).toBeInTheDocument();
    expect(moreRailEvents).not.toHaveBeenCalled();
  });

  it("asks for the next page only once the reader nears the end", async () => {
    mount();
    const node = track({ scrollWidth: 4000, clientWidth: 1000, scrollLeft: 0 });
    fireEvent.scroll(node);
    expect(moreRailEvents).not.toHaveBeenCalled();

    // Within one card's width of the end.
    track({ scrollWidth: 4000, clientWidth: 1000, scrollLeft: 2850 });
    fireEvent.scroll(node);
    await waitFor(() => expect(moreRailEvents).toHaveBeenCalledOnce());
    // Continues from what the server already sent, not from zero.
    expect(moreRailEvents).toHaveBeenCalledWith(query, 2, 8);
    expect(await screen.findByText("Show b1")).toBeInTheDocument();
  });

  it("does not fire the same page twice while the first request is in flight", async () => {
    mount();
    const node = track({ scrollWidth: 4000, clientWidth: 1000, scrollLeft: 2900 });
    fireEvent.scroll(node);
    fireEvent.scroll(node);
    fireEvent.scroll(node);
    await waitFor(() => expect(moreRailEvents).toHaveBeenCalledOnce());
  });

  it("never asks when the server already sent the whole rail", async () => {
    mount({ loaded: 6, total: 6 });
    const node = track({ scrollWidth: 4000, clientWidth: 1000, scrollLeft: 2900 });
    fireEvent.scroll(node);
    await waitFor(() => expect(screen.getByText("first page")).toBeInTheDocument());
    expect(moreRailEvents).not.toHaveBeenCalled();
  });

  it("stops asking after a failure and keeps what is already on screen", async () => {
    moreRailEvents.mockRejectedValue(new Error("catalogue is down"));
    mount();
    const node = track({ scrollWidth: 4000, clientWidth: 1000, scrollLeft: 2900 });
    fireEvent.scroll(node);
    await waitFor(() => expect(moreRailEvents).toHaveBeenCalledOnce());
    fireEvent.scroll(node);
    fireEvent.scroll(node);
    await waitFor(() => expect(screen.getByText("first page")).toBeInTheDocument());
    expect(moreRailEvents).toHaveBeenCalledOnce();
  });

  it("scrolls the track by the arrows and hides the one with nowhere to go", async () => {
    mount();
    const node = track({ scrollWidth: 4000, clientWidth: 1000, scrollLeft: 0 });
    fireEvent.scroll(node);
    const next = screen.getByTitle("Show more");
    await waitFor(() => expect(screen.getByTitle("Show previous")).toHaveClass("opacity-0"));
    expect(next).toHaveClass("opacity-100");
    fireEvent.click(next);
    expect(node.scrollBy).toHaveBeenCalledWith({ left: 680, behavior: "smooth" });
  });
});
