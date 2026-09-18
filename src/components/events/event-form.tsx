"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { ArrowLeft, CircleNotch } from "@/components/icons";
import { LocationFields, type LocationValue } from "@/components/events/location-fields";
import { StagedMediaPicker, useStagedMedia } from "@/components/tickets/staged-media";
import { Button } from "@/components/ui/button";
import { Field, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Link, useRouter } from "@/i18n/routing";
import { createEvent, updateEvent, uploadEventMedia } from "@/lib/events/admin-api";
import { forgetOrganizerState } from "@/lib/events/organizer";
import {
  emptyEventForm,
  eventFormFrom,
  firstInvalid,
  validateEventForm,
  type ErrorKey,
  type EventFormErrors,
  type EventFormState,
} from "@/lib/events/form";
import {
  EVENT_CATEGORIES,
  type EventCategory,
  type EventSalesMode,
  type EventStatus,
  type EventSummary,
} from "@/lib/events/types";

/**
 * The event record.
 *
 * An event is the thing a buyer browses to; the tiers under it are the things
 * they buy. Splitting them was the point of the whole migration, and it shows
 * up here: this form owns the name, the date, the place and the artwork, and
 * says nothing about price or quantity.
 *
 * Artwork is staged rather than uploaded, because media attaches to an event
 * id and the id does not exist until the record is saved. The operator picks
 * the files alongside the fields and the submit handler uploads them the moment
 * the id comes back: one action here, two calls underneath.
 */
export function EventForm({ event }: { event: EventSummary | null }) {
  const t = useTranslations("eventAdmin");
  const tCategory = useTranslations("categories");
  const common = useTranslations("common");
  const router = useRouter();
  const isEdit = event !== null;

  const [form, setForm] = React.useState<EventFormState>(() =>
    event ? eventFormFrom(event) : emptyEventForm(),
  );
  const [errors, setErrors] = React.useState<EventFormErrors>({});
  const [pending, setPending] = React.useState(false);
  const [uploading, setUploading] = React.useState<{ done: number; total: number } | null>(null);

  const { staged, add, remove } = useStagedMedia();

  function set<K extends keyof EventFormState>(key: K, value: EventFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  }

  // The location section owns six fields plus the pin, so it hands back a whole
  // value rather than firing one change per key.
  const setLocation = React.useCallback((next: LocationValue) => {
    setForm((current) => ({ ...current, ...next }));
    setErrors((current) => ({
      ...current,
      venue: undefined,
      city: undefined,
      uf: undefined,
      postalCode: undefined,
      latitude: undefined,
    }));
  }, []);

  async function submit(submitEvent: React.FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();

    const { input, errors: found } = validateEventForm(form, (key: ErrorKey) => t(key));
    setErrors(found);
    if (!input) {
      // Focus the first field that failed, so a form this long does not require
      // hunting for the message that explains why nothing happened.
      const target = firstInvalid(found);
      if (target) document.getElementById(`event-${target}`)?.focus();
      return;
    }

    setPending(true);
    const result = isEdit ? await updateEvent(event.id, input) : await createEvent(input);

    if (result.error || !result.data) {
      setPending(false);
      toast.error(result.error?.message ?? t("errors.save"));
      return;
    }

    const saved = result.data;

    if (!isEdit) {
      // The moment this account became an organizer. The spine decides which
      // contexts to offer from a cached count of owned events, so without
      // this the buyer who just created their first event keeps the buyer
      // navigation until the next full reload -- having just been told the
      // event was created.
      forgetOrganizerState();
    }

    if (staged.length > 0) {
      setUploading({ done: 0, total: staged.length });
      for (const [index, entry] of staged.entries()) {
        const upload = await uploadEventMedia(saved.id, entry.file);
        if (upload.error) {
          // The event itself is saved. Losing an image is not losing the work,
          // so this reports and carries on rather than rolling anything back.
          toast.error(upload.error.message);
        }
        setUploading({ done: index + 1, total: staged.length });
      }
      setUploading(null);
    }

    toast.success(isEdit ? t("saved") : t("created"));
    // To the event, not back to the form that made it.
    //
    // This was `/events/{id}/edit`, which answered "you made a thing" by
    // showing the thing's form again, and, worse, routed around the only page
    // that asks whether the event has assigned seats. An organiser could create
    // an event and three tiers without the product ever mentioning seating.
    // The event list already prefers the manager and says so in a comment; this
    // was the one place that disagreed.
    router.push(`/events/${saved.id}`);
    router.refresh();
  }

  const location: LocationValue = {
    venue: form.venue,
    address: form.address,
    neighborhood: form.neighborhood,
    city: form.city,
    uf: form.uf,
    postalCode: form.postalCode,
    latitude: form.latitude,
    longitude: form.longitude,
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-8" noValidate>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/events">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("backToList")}
          </Link>
        </Button>
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          {isEdit ? t("editTitle") : t("newTitle")}
        </h1>
      </div>

      <Section title={t("sections.about")} description={t("sections.aboutHint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="event-name"
            label={t("fields.name")}
            error={errors.name}
            className="sm:col-span-2"
          >
            <TextField
              id="event-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={t("placeholders.name")}
              autoComplete="off"
            />
          </Field>

          <Field id="event-category" label={t("fields.category")} error={errors.category}>
            <SelectField
              id="event-category"
              value={form.category}
              onChange={(e) => set("category", e.target.value as EventCategory)}
            >
              {EVENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {tCategory(category)}
                </option>
              ))}
            </SelectField>
          </Field>

          {/* Only when editing. Every new event is a draft by design, so on a
              create form this control existed only to let somebody get it
              wrong, and "Cancelado" let them create an event that is born
              dead, with the publish toggle permanently disabled and no path
              back. */}
          {isEdit ? (
            <Field id="event-status" label={t("fields.status")} hint={t("hints.status")}>
              <SelectField
                id="event-status"
                value={form.status}
                onChange={(e) => set("status", e.target.value as EventStatus)}
              >
                {(["draft", "published", "cancelled"] as EventStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {t(`status.${status}`)}
                  </option>
                ))}
              </SelectField>
            </Field>
          ) : null}

          {/* How this event sells.
              The ONLY seating decision a create form can make: binding a plan
              needs an event that already exists and tiers to price the sectors
              with, and this form has neither. But it can ask, and without the
              answer every screen afterwards has to guess where to send
              somebody, which is how a theatre booking ended up selling
              unnumbered tickets because nothing said otherwise. */}
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium text-foreground">
              {t("fields.salesMode")}
            </legend>
            <p className="mt-0.5 max-w-[68ch] text-xs leading-5 text-muted-foreground">
              {t("hints.salesMode")}
            </p>
            <RadioGroup
              value={form.salesMode}
              onValueChange={(value) => set("salesMode", value as EventSalesMode)}
              className="mt-2.5 gap-2.5"
            >
              {(["counted", "seated"] as EventSalesMode[]).map((mode) => (
                <div key={mode} className="flex items-start gap-2.5">
                  <RadioGroupItem
                    value={mode}
                    id={`event-sales-${mode}`}
                    className="mt-[0.1875rem] shrink-0"
                  />
                  <label htmlFor={`event-sales-${mode}`} className="min-w-0 cursor-pointer">
                    <span className="block text-sm font-medium text-foreground">
                      {t(`salesMode.${mode}`)}
                    </span>
                    <span className="block max-w-[64ch] text-xs leading-5 text-muted-foreground">
                      {t(`salesModeHint.${mode}`)}
                    </span>
                  </label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>

          <Field
            id="event-description"
            label={t("fields.description")}
            hint={t("hints.description")}
            className="sm:col-span-2"
          >
            <TextAreaField
              id="event-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={5}
            />
          </Field>

          <Field id="event-startsAt" label={t("fields.startsAt")} error={errors.startsAt}>
            <TextField
              id="event-startsAt"
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => set("startsAt", e.target.value)}
            />
          </Field>

          <Field
            id="event-endsAt"
            label={t("fields.endsAt")}
            error={errors.endsAt}
            hint={t("hints.endsAt")}
          >
            <TextField
              id="event-endsAt"
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => set("endsAt", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section title={t("sections.where")} description={t("sections.whereHint")}>
        {errors.latitude ? (
          <p role="alert" className="mb-3 text-xs font-medium text-destructive-ink">
            {errors.latitude}
          </p>
        ) : null}
        <LocationFields value={location} errors={errors} onChange={setLocation} />
      </Section>

      <Section title={t("sections.media")} description={t("sections.mediaHint")}>
        <StagedMediaPicker
          staged={staged}
          onAdd={add}
          onRemove={remove}
          uploading={uploading}
          disabled={pending}
        />
      </Section>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? <CircleNotch className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {common("save")}
        </Button>
        <Button asChild variant="ghost" type="button">
          <Link href="/events">{common("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 lg:flex-row lg:gap-10">
      {/* The label column sits beside the fields on a desktop and above them on
          a phone, so a long form reads as four decisions rather than as
          eighteen inputs. */}
      <div className="lg:w-56 lg:shrink-0">
        <h2 className="font-display text-sm font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}
