"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Plus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, TextField } from "@/components/ui/field";
import { createTicket } from "@/lib/tickets/api";
import { parseMoneyToCents } from "@/lib/format";
import type { Ticket } from "@/lib/tickets/types";

/**
 * Making a lote from the list it belongs to.
 *
 * The action existed only in the event's header row, four buttons along from
 * the list it fills, and it navigated to a full page with a media queue and an
 * event picker — to answer three questions the organiser already had in mind.
 * A lote is a name, a price and a count, so it is asked here, over the list,
 * and the row appears without a page load.
 *
 * The full editor is still where a lote gains a description, images or a
 * status; this only covers the moment of creating one, which is the moment
 * that was in the way.
 */
export function NewTierDialog({
  eventId,
  onCreated,
  variant = "secondary",
  size = "sm",
}: {
  eventId: string;
  onCreated: (tier: Ticket) => void;
  variant?: "secondary" | "primary";
  size?: "sm" | "default";
}) {
  const t = useTranslations("tickets");
  const label = useTranslations("eventManager");
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [errors, setErrors] = React.useState<{ title?: string; price?: string; quantity?: string }>({});
  const [pending, setPending] = React.useState(false);

  // Cleared on open rather than on close, so a failed submit keeps what was
  // typed and reopening never shows the last lote's numbers.
  const start = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setTitle("");
    setPrice("");
    setQuantity("");
    setErrors({});
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cents = parseMoneyToCents(price);
    const count = Number.parseInt(quantity, 10);
    const next: typeof errors = {};
    if (!title.trim()) next.title = t("form.errors.title");
    if (!Number.isFinite(cents) || cents < 0) next.price = t("form.errors.price");
    if (!Number.isFinite(count) || count <= 0) next.quantity = t("form.errors.quantity");
    setErrors(next);
    if (Object.keys(next).length > 0) {
      document.getElementById(`new-tier-${Object.keys(next)[0]}`)?.focus();
      return;
    }

    setPending(true);
    // Draft, always. A lote that went on sale the instant it was named would
    // be sellable before anyone chose which part of the room it prices.
    const result = await createTicket({
      eventId,
      title: title.trim(),
      description: "",
      priceCents: cents,
      quantity: count,
      status: "draft",
    });
    setPending(false);
    if (result.error || !result.data) {
      setErrors({ title: result.error?.message ?? t("form.errors.title") });
      return;
    }
    onCreated(result.data);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={start}>
      <DialogTrigger asChild>
        <Button type="button" size={size} variant={variant}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {label("newTier")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>{t("form.createTitle")}</DialogTitle>
          <DialogDescription>{t("form.createSubtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <Field id="new-tier-title" label={t("fields.title")} error={errors.title}>
            <TextField
              id="new-tier-title"
              value={title}
              autoFocus
              placeholder={t("form.titlePlaceholder")}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="new-tier-price"
              label={t("fields.price")}
              hint={t("form.priceHint")}
              error={errors.price}
            >
              <TextField
                id="new-tier-price"
                value={price}
                inputMode="decimal"
                onChange={(event) => setPrice(event.target.value)}
              />
            </Field>
            <Field
              id="new-tier-quantity"
              label={t("fields.quantity")}
              hint={t("form.quantityHint")}
              error={errors.quantity}
            >
              <TextField
                id="new-tier-quantity"
                value={quantity}
                inputMode="numeric"
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? t("form.submitting") : t("form.submitCreate")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
