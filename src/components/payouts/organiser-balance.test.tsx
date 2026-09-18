import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/i18n/messages/en.json";
import type { Balance, LedgerEntry } from "@/lib/payouts/types";
import { OrganiserBalance } from "./organiser-balance";

const { getBalance, listLedger } = vi.hoisted(() => ({
  getBalance: vi.fn(),
  listLedger: vi.fn(),
}));
vi.mock("@/lib/payouts/api", () => ({ getBalance, listLedger }));

const balance = (over: Partial<Balance> = {}): Balance => ({
  availableCents: 480_600,
  pendingCents: 1_200_000,
  reservedCents: 53_400,
  totalCents: 1_734_000,
  currency: "BRL",
  ...over,
});
const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: "led_1", eventId: "evt_1", orderId: "ord_9f2c", kind: "sale",
  amountCents: 480_600,
  availableAt: new Date(Date.now() + 86_400_000).toISOString(),
  createdAt: new Date().toISOString(),
  ...over,
});

function mount() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrganiserBalance />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getBalance.mockResolvedValue({ data: balance() });
  listLedger.mockResolvedValue({ data: { data: [entry()], total: 1 } });
});
afterEach(cleanup);

describe("the organiser's balance", () => {
  it("shows the four figures the server computed, without recomputing them", async () => {
    mount();
    // The same amount appears on a figure and on the entry behind it, which is
    // correct; the assertion is that it is rendered, not that it is unique.
    expect((await screen.findAllByText(/4,806\.00|4\.806,00/)).length).toBeGreaterThan(0);
    // Reserved and pending are distinct lines: "arrives on the 3rd" and "held
    // until next month" are different sentences to the person owed the money.
    for (const label of ["Available", "Pending", "Held back", "Total"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // The client asked for the balance rather than deriving one from the rows.
    expect(getBalance).toHaveBeenCalledOnce();
  });

  // The case the whole ledger exists to make visible: refunds have outrun
  // settlements. Clamping it at zero would show a position the organiser does
  // not have, and would hide exactly what they need to act on.
  it("shows a negative available balance as negative rather than as zero", async () => {
    getBalance.mockResolvedValue({ data: balance({ availableCents: -48_000, totalCents: 0 }) });
    mount();
    // Matched on the rendered text of the node itself: the currency symbol sits
    // between the sign and the digits, and which symbol that is belongs to Intl
    // rather than to this test.
    const figure = await screen.findByText(
      (_, element) => {
        const text = element?.textContent?.trim() ?? "";
        return element?.tagName === "P" && text.startsWith("-") && text.includes("480");
      },
      { selector: "p" },
    );
    expect(figure.className).toContain("text-destructive-ink");
  });

  it("says when each entry becomes payable, which the amount alone does not", async () => {
    listLedger.mockResolvedValue({
      data: {
        data: [
          entry({ id: "a", kind: "sale", availableAt: new Date(Date.now() - 1000).toISOString() }),
          entry({ id: "b", kind: "reserve", amountCents: 53_400 }),
        ],
        total: 2,
      },
    });
    mount();
    // Scoped to the statement, because "Available" is also a figure's label.
    const statement = await screen.findByRole("list");
    expect(within(statement).getByText("Available")).toBeInTheDocument();
    expect(within(statement).getByText(/Available on /)).toBeInTheDocument();
    expect(within(statement).getByText("Reserve")).toBeInTheDocument();
  });

  it("marks money leaving with a minus and the debit ink", async () => {
    listLedger.mockResolvedValue({
      data: { data: [entry({ kind: "refund", amountCents: -534_00 })], total: 1 },
    });
    mount();
    const amount = await screen.findByText(/−/);
    expect(amount.className).toContain("text-destructive-ink");
    expect(screen.getByText("Refund")).toBeInTheDocument();
  });

  it("offers a retry instead of an empty balance when the read fails", async () => {
    getBalance.mockResolvedValue({ error: { message: "down" } });
    mount();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // Never a zeroed balance, which would read as "you have earned nothing".
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("says so plainly when there is nothing yet", async () => {
    listLedger.mockResolvedValue({ data: { data: [], total: 0 } });
    mount();
    await waitFor(() => expect(screen.getByText(/first paid sale/)).toBeInTheDocument());
  });
});
