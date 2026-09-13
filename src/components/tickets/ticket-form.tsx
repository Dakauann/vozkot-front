"use client";

import * as React from "react";

import { ArrowLeft, CircleNotch, Receipt } from "@/components/icons";
import { Field, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { StagedMediaPicker, useStagedMedia } from "@/components/tickets/staged-media";
import { centsToMoneyInput, parseMoneyToCents } from "@/lib/format";
import { EventCombobox } from "@/components/events/event-combobox";
import { createTicket, getTicket, updateTicket, uploadTicketMedia } from "@/lib/tickets/api";
import { ticketStatuses, type Ticket, type TicketInput, type TicketStatus } from "@/lib/tickets/types";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/routing";
import type { Locale } from "@/i18n/config";
import { TicketMediaGallery } from "@/components/tickets/ticket-media-gallery";
import { toast } from "sonner";

interface TicketFormProps {
  /** Null while creating; the record being edited otherwise. */
  ticket: Ticket | null;
  /** Preselects the event when creating from that event's own page. */
  eventId?: string;
}

interface FormState {
  eventId: string;
  title: string;
  description: string;
  price: string;
  quantity: string;
  status: TicketStatus;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

/**
 * The ticket record, on its own page.
 *
 * It replaced a side sheet for one reason that matters: artwork. Media attaches
 * to a ticket id, so a sheet could only offer the gallery after the record
 * existed — an operator filled the form, saved, hunted the ticket down in the
 * list, and only then added the image that sells it. Here the files are chosen
 * alongside the fields and uploaded the instant the id comes back.
 *
 * A page also gives the form room to be read in sections rather than as one
 * scrolling column of nine controls in a 520px panel.
 */
export function TicketForm({ ticket, eventId = "" }: TicketFormProps) {
  const t = useTranslations("tickets");
  const common = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const isEdit = ticket !== null;

  // A new tier arriving from an event's own page already knows which night it
  // belongs to. Making the organiser pick it again out of a list of all their
  // events is asking them to re-answer a question they just answered by
  // navigating.
  const [form, setForm] = React.useState<FormState>(() =>
    ticket ? stateFrom(ticket, locale) : emptyState(locale, eventId),
  );
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [pending, setPending] = React.useState(false);
  const [uploading, setUploading] = React.useState<{ done: number; total: number } | null>(null);

  const { staged, add, remove } = useStagedMedia();
  const [gallery, setGallery] = React.useState(ticket?.media ?? []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  }

  function validate(): TicketInput | null {
    const next: FieldErrors = {};
    const priceCents = parseMoneyToCents(form.price);
    const quantity = Number.parseInt(form.quantity, 10);

    if (!form.eventId.trim()) next.eventId = t("form.errors.event");
    if (!form.title.trim()) next.title = t("form.errors.title");
    if (!Number.isFinite(priceCents) || priceCents < 0) next.price = t("form.errors.price");
    if (!Number.isFinite(quantity) || quantity <= 0) next.quantity = t("form.errors.quantity");

    setErrors(next);
    if (Object.keys(next).length > 0) {
      // Send focus to the first field that failed, so a long form does not
      // require hunting for the message.
      const firstInvalid = Object.keys(next)[0];
      document.getElementById(`ticket-${fieldId(firstInvalid as keyof FormState)}`)?.focus();
      return null;
    }

    return {
      eventId: form.eventId,
      title: form.title.trim(),
      description: form.description.trim(),
      priceCents,
      quantity,
      status: form.status,
    };
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = validate();
    if (!input) return;

    setPending(true);
    const result = isEdit ? await updateTicket(ticket.id, input) : await createTicket(input);

    if (result.error || !result.data) {
      setPending(false);
      toast.error(result.error?.message ?? "");
      return;
    }

    const saved = result.data;

    // The queue only exists while creating; an existing ticket uploads straight
    // through the gallery below.
    let failed = 0;
    if (staged.length > 0) {
      setUploading({ done: 0, total: staged.length });
      for (const [index, entry] of staged.entries()) {
        const upload = await uploadTicketMedia(saved.id, entry.file);
        if (upload.error) failed += 1;
        setUploading({ done: index + 1, total: staged.length });
      }
      setUploading(null);
    }

    if (failed > 0) {
      toast.warning(t("form.mediaPartial", { count: failed }));
    } else {
      toast.success(isEdit ? t("feedback.updated") : t("feedback.created"));
    }

    // Back to the catalogue with this ticket already selected, so the operator
    // sees the record they just wrote rather than an unfiltered list.
    router.push({ pathname: "/", query: { ticket: saved.id } });
  }

  const busy = pending || uploading !== null;

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="border-b border-border pb-3">
        <Link
          href="/dashboard"
          className="-ml-1 inline-flex items-center gap-1 rounded-[--radius] px-1 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft size={14} />
          {t("form.backToTickets")}
        </Link>
        <div className="mt-1.5 flex items-center gap-2">
          <Receipt size={18} weight="regular" className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <h1 className="truncate font-display text-xl font-semibold leading-tight tracking-[0.01em]">
            {isEdit ? t("form.editTitle") : t("form.createTitle")}
          </h1>
        </div>
        <p className="mt-0.5 max-w-2xl text-sm leading-snug text-muted-foreground">
          {isEdit ? t("form.editSubtitle") : t("form.createSubtitle")}
        </p>
      </div>

      <form onSubmit={submit} className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="min-w-0 space-y-4">
          <FormSection title={t("form.sections.event")}>
            {/* The tier names its event; it does not describe it. Everything
                about the happening itself — name, venue, city, date, category,
                map pin — lives on the event and is edited there. */}
            <Field id="ticket-eventId" label={t("fields.event")} error={errors.eventId}>
              <EventCombobox
                id="ticket-eventId"
                value={form.eventId}
                onChange={(eventId) => set("eventId", eventId)}
                invalid={Boolean(errors.eventId)}
                // A tier cannot move to another event: orders already reference
                // it, and moving it would rewrite what somebody has bought.
                disabled={isEdit || busy}
              />
            </Field>

            <Field id="ticket-title" label={t("fields.title")} error={errors.title}>
              <TextField
                id="ticket-title"
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder={t("form.titlePlaceholder")}
                disabled={busy}
              />
            </Field>

            <Field id="ticket-description" label={`${t("fields.description")} · ${common("optional")}`}>
              <TextAreaField
                id="ticket-description"
                rows={4}
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                placeholder={t("form.descriptionPlaceholder")}
                disabled={busy}
              />
            </Field>
          </FormSection>

          <FormSection title={t("form.sections.sale")}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="ticket-price" label={t("fields.price")} hint={t("form.priceHint")} error={errors.price}>
                <TextField
                  id="ticket-price"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(event) => set("price", event.target.value)}
                  className="text-right tabular-nums"
                  disabled={busy}
                />
              </Field>

              <Field
                id="ticket-quantity"
                label={t("fields.quantity")}
                hint={t("form.quantityHint")}
                error={errors.quantity}
              >
                <TextField
                  id="ticket-quantity"
                  inputMode="numeric"
                  value={form.quantity}
                  onChange={(event) => set("quantity", event.target.value.replace(/[^\d]/g, ""))}
                  className="text-right tabular-nums"
                  disabled={busy}
                />
              </Field>

              <Field id="ticket-status" label={t("fields.status")}>
                <SelectField
                  id="ticket-status"
                  value={form.status}
                  onChange={(event) => set("status", event.target.value as TicketStatus)}
                  disabled={busy}
                >
                  {ticketStatuses.map((status) => (
                    <option key={status} value={status}>
                      {t(`status.${status}`)}
                    </option>
                  ))}
                </SelectField>
              </Field>
            </div>
          </FormSection>
        </div>

        <aside className="min-w-0 rounded-[--radius] border border-border bg-card p-4 shadow-sm lg:sticky lg:top-[4.25rem]">
          {isEdit ? (
            // An existing ticket has an id, so its gallery talks to the API
            // directly and every change is saved on the spot.
            <TicketMediaGallery
              ticketId={ticket.id}
              media={gallery}
              onChanged={async () => {
                const fresh = await getTicket(ticket.id);
                if (fresh.data) setGallery(fresh.data.media);
              }}
            />
          ) : (
            <StagedMediaPicker staged={staged} onAdd={add} onRemove={remove} uploading={uploading} disabled={busy} />
          )}
        </aside>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3 lg:col-span-2">
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard")} disabled={busy}>
            {common("cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <CircleNotch className="animate-spin" />}
            {uploading
              ? t("form.uploadingMedia", { done: uploading.done, total: uploading.total })
              : pending
                ? t("form.submitting")
                : isEdit
                  ? t("form.submitEdit")
                  : t("form.submitCreate")}
          </Button>
        </div>
      </form>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[--radius] border border-border bg-card p-4 shadow-sm">
      <h2 className="legend mb-3">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function emptyState(locale: Locale, eventId = ""): FormState {
  return {
    eventId,
    title: "",
    description: "",
    price: centsToMoneyInput(0, locale),
    quantity: "100",
    status: "draft",
  };
}

function stateFrom(ticket: Ticket, locale: Locale): FormState {
  return {
    eventId: ticket.eventId,
    title: ticket.title,
    description: ticket.description,
    price: centsToMoneyInput(ticket.priceCents, locale),
    quantity: String(ticket.quantity),
    status: ticket.status,
  };
}

/** Maps a state key to the suffix of its input's DOM id. */
function fieldId(key: keyof FormState): string {
  return key;
}
