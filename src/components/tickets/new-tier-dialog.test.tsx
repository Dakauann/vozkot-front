import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/i18n/messages/en.json";
import { NewTierDialog } from "./new-tier-dialog";

const { createTicket } = vi.hoisted(() => ({ createTicket: vi.fn() }));
vi.mock("@/lib/tickets/api", () => ({ createTicket }));

const onCreated = vi.fn();
function mount() {
  return render(<NextIntlClientProvider locale="en" messages={messages}>
    <NewTierDialog eventId="evt-1" onCreated={onCreated} />
  </NextIntlClientProvider>);
}
const open = () => fireEvent.click(screen.getByRole("button", { name: /New tier/i }));
const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  createTicket.mockResolvedValue({ data: { id: "tkt-1", title: "Camarote esquerdo" } });
});
afterEach(cleanup);

describe("creating a lote over the list it belongs to", () => {
  it("creates it as a draft and hands the new row back without a page load", async () => {
    mount();
    open();
    type(/Tier name/i, "  Camarote esquerdo  ");
    type(/price/i, "400,00");
    type(/quantity/i, "10");
    fireEvent.click(await screen.findByRole("button", { name: /Create ticket/i }));
    await waitFor(() => expect(createTicket).toHaveBeenCalledOnce());
    expect(createTicket).toHaveBeenCalledWith({
      eventId: "evt-1", title: "Camarote esquerdo", description: "",
      priceCents: 40000, quantity: 10, status: "draft",
    });
    expect(onCreated).toHaveBeenCalledWith({ id: "tkt-1", title: "Camarote esquerdo" });
  });

  it("refuses an empty name or a quantity of zero before asking the server", async () => {
    mount();
    open();
    type(/price/i, "400,00");
    type(/quantity/i, "0");
    fireEvent.click(await screen.findByRole("button", { name: /Create ticket/i }));
    await waitFor(() => expect(screen.getByLabelText(/Tier name/i)).toHaveFocus());
    expect(createTicket).not.toHaveBeenCalled();
  });

  it("keeps what was typed when the server refuses, so nothing has to be retyped", async () => {
    createTicket.mockResolvedValue({ error: { message: "a tier with that name exists" } });
    mount();
    open();
    type(/Tier name/i, "Camarote esquerdo");
    type(/price/i, "400,00");
    type(/quantity/i, "10");
    fireEvent.click(await screen.findByRole("button", { name: /Create ticket/i }));
    await waitFor(() => expect(screen.getByText(/a tier with that name exists/)).toBeInTheDocument());
    expect(screen.getByLabelText(/Tier name/i)).toHaveValue("Camarote esquerdo");
    expect(onCreated).not.toHaveBeenCalled();
  });
});
