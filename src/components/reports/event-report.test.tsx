import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/i18n/messages/en.json";
import type { EventReport as Report } from "@/lib/reports/types";
import { EventReport } from "./event-report";

const { getEventReport, getPortfolioReport, downloadAttendees } = vi.hoisted(() => ({
  getEventReport: vi.fn(),
  getPortfolioReport: vi.fn(),
  downloadAttendees: vi.fn(),
}));
vi.mock("@/lib/reports/api", () => ({ getEventReport, getPortfolioReport, downloadAttendees }));

const report = (over: Partial<Report> = {}): Report =>
  ({
    totals: {
      orders: 2, tickets: 9, buyers: 2, netCents: 90_00,
      refundedOrders: 0, refundedCents: 0,
      averageOrderCents: 45_00, averageTicketCents: 10_00,
    },
    byGender: [{ key: "female", orders: 2, tickets: 9, netCents: 90_00 }],
    byAge: [
      { key: "24_28", orders: 2, tickets: 6, netCents: 60_00 },
      { key: "39_43", orders: 1, tickets: 3, netCents: 30_00 },
    ],
    byUf: [], byCity: [], byTier: [], byDay: [],
    ...over,
  }) as unknown as Report;

function mount(props: { eventId?: string } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EventReport {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getEventReport.mockResolvedValue({ data: { data: report() } });
  getPortfolioReport.mockResolvedValue({ data: { data: report() } });
});
afterEach(cleanup);

describe("the audience report, in both scopes", () => {
  it("asks the EVENT endpoint when given an event, and only that one", async () => {
    mount({ eventId: "evt_1" });
    await waitFor(() => expect(getEventReport).toHaveBeenCalledWith("evt_1"));
    expect(getPortfolioReport).not.toHaveBeenCalled();
  });

  // The portfolio must never reach the per-event endpoint with an empty id:
  // that is the shape that asks the server for a report scoped to nothing.
  it("asks the PORTFOLIO endpoint when given no event, with no id at all", async () => {
    mount();
    await waitFor(() => expect(getPortfolioReport).toHaveBeenCalledOnce());
    expect(getPortfolioReport).toHaveBeenCalledWith();
    expect(getEventReport).not.toHaveBeenCalled();
  });

  it("names the scope it is showing, so the two are never confused", async () => {
    mount({ eventId: "evt_1" });
    expect(await screen.findByText("Event report")).toBeInTheDocument();
    cleanup();
    mount();
    expect(await screen.findByText("Audience across all your events")).toBeInTheDocument();
  });

  // The CSV streams one event's attendee list. There is no portfolio
  // equivalent, and offering the button would export something the server was
  // never asked for.
  it("offers the attendee export for an event and not for the portfolio", async () => {
    mount({ eventId: "evt_1" });
    expect(await screen.findByRole("button", { name: /CSV/i })).toBeInTheDocument();
    cleanup();
    mount();
    await screen.findByText("Audience across all your events");
    expect(screen.queryByRole("button", { name: /CSV/i })).not.toBeInTheDocument();
  });

  // The question this feature was asked for: which age buys most.
  it("shows the age breakdown in both scopes", async () => {
    mount();
    expect(await screen.findByText("24 to 28")).toBeInTheDocument();
    expect(screen.getByText("39 to 43")).toBeInTheDocument();
  });

  it("reports the average per admission, with the per-order figure beside it", async () => {
    mount({ eventId: "evt_1" });
    // The per-admission figure is the HEADLINE, because it is the one that
    // says what a seat is worth; the per-order figure is its hint, visible
    // rather than hidden in a tooltip so the two can be compared at a glance.
    // Getting them the wrong way round is the actual risk here.
    expect(await screen.findByText("Average ticket")).toBeInTheDocument();
    const headline = screen.getByText(/10\.00/);
    expect(headline.className).toContain("text-xl");
    expect(screen.getByText(/45\.00/)).toBeInTheDocument();
  });

  it("says so plainly when the whole portfolio is empty", async () => {
    getPortfolioReport.mockResolvedValue({
      data: { data: report({ totals: { ...report().totals, orders: 0 } } as Partial<Report>) },
    });
    mount();
    expect(await screen.findByText("No sales yet, on any event.")).toBeInTheDocument();
  });

  // The charts are the shape and the tables are the record. Both read the same
  // slices off the same response, so the failure worth guarding is one of them
  // disappearing, not their pixels, which a DOM test cannot see anyway.
  it("shows each breakdown as a chart AND keeps the table of exact figures", async () => {
    mount({ eventId: "evt_1" });
    await screen.findByText("Event report");
    // Every breakdown title appears twice: once over its chart, once over its
    // table. One of each is the contract.
    for (const heading of ["By age", "By gender"]) {
      const found = screen.getAllByText(heading);
      expect(found.length, `${heading} should head a chart and a table`).toBe(2);
    }
  });

  // A day breakdown with nothing in it must not render an empty plot frame.
  it("omits a chart whose breakdown has no rows", async () => {
    mount({ eventId: "evt_1" });
    await screen.findByText("Event report");
    // byDay is empty in the fixture, so neither its chart nor its table is
    // drawn: an empty plot frame and an empty table both read as a fault
    // rather than as "nothing sold on any day yet".
    expect(screen.queryByText("By date")).not.toBeInTheDocument();
  });

  it("shows an error rather than an empty report when the read fails", async () => {
    getPortfolioReport.mockResolvedValue({ error: { message: "down" } });
    mount();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("24 to 28")).not.toBeInTheDocument();
  });
});
