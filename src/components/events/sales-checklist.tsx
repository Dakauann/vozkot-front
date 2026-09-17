"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Check } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * What still has to happen before this event can sell.
 *
 * The chain is six steps across three screens — venue, plan, event, tiers,
 * seats, publish — and nothing in the product drew it, so an organiser could
 * not tell whether they were done or what came next. Onboarding research is
 * unusually concrete about the cost: a visible progress indicator lifts
 * completion by around 12% and cuts premature exits by about 20%, and the
 * recommended shape is a short list of four to six steps.
 *
 * It is deliberately NOT a wizard. Nielsen's own qualification on staged
 * disclosure is that it works when steps have low interdependence, and these
 * steps are nothing but interdependent — pricing a sector needs a tier, which
 * needs the event, which is where the plan gets bound. Forcing that into a
 * back-next sequence traps somebody who needs to go and change a tier halfway
 * through. So this reads out the state of the chain and links into it; the
 * organiser keeps the wheel.
 *
 * It disappears entirely once the event is selling, because a checklist that
 * stays after it is finished is furniture.
 */
export function SalesChecklist({
  seated,
  hasTiers,
  seatsBound,
  onSale,
  published,
}: {
  /** Whether this event declared it sells numbered seats. */
  seated: boolean;
  hasTiers: boolean;
  /** Whether a plan has been put on sale for this night. */
  seatsBound: boolean;
  /** Whether any tier is actually on sale, which publishing alone does not do. */
  onSale: boolean;
  published: boolean;
}) {
  const t = useTranslations("eventManager");

  // Only the steps this event has. A party has no seating step, and listing one
  // it will never complete makes the checklist unfinishable.
  const steps = [
    { key: "tiers", done: hasTiers },
    ...(seated ? [{ key: "seats", done: seatsBound }] : []),
    { key: "onSale", done: onSale },
    { key: "publish", done: published },
  ];

  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;

  // The first unfinished step, which is the only one worth pointing at.
  const next = steps.findIndex((step) => !step.done);

  return (
    <section
      aria-labelledby="checklist-heading"
      className="rounded-[--radius] border border-border bg-card px-4 py-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="checklist-heading" className="text-sm font-semibold text-foreground">
          {t("checklist.title")}
        </h2>
        <p className="text-xs tabular-nums text-muted-foreground">
          {t("checklist.progress", { done, total: steps.length })}
        </p>
      </div>

      <ol className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {/* No arrow between the chips. An ordered list already reads as a
            sequence, and a Unicode glyph standing in for an icon is the one
            thing the craft floor bans outright rather than discourages. */}
        {steps.map((step, index) => (
          <li key={step.key}>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
                // The ground is the same quiet neutral for every state and
                // only the mark takes the colour — the house rule, written out
                // above `.notice` in globals.css. Green ink on a green wash is
                // the tell it exists to prevent.
                step.done
                  ? "bg-muted text-foreground"
                  : index === next
                    ? "bg-primary text-primary-foreground font-medium"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {step.done ? (
                <Check className="size-3 shrink-0 text-healthy-ink" aria-hidden="true" />
              ) : null}
              {t(`checklist.${step.key}`)}
              {/* Said for a screen reader, which cannot see that a chip is
                  green or that it is the filled one. */}
              <span className="sr-only">
                {step.done
                  ? ` — ${t("checklist.doneLabel")}`
                  : index === next
                    ? ` — ${t("checklist.nextLabel")}`
                    : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>

      {/* One sentence about the step they are on, rather than four notices in
          three places saying different halves of it. */}
      <p className="mt-2 max-w-[74ch] text-xs leading-5 text-muted-foreground">
        {t(`checklist.hint.${steps[next].key}`)}
      </p>
    </section>
  );
}
