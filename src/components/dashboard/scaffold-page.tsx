"use client";

import type { ReactNode } from "react";

import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { Wrench } from "@/components/icons";
import { useTranslations } from "next-intl";

/**
 * A part of the product that is being built, saying so in its own voice.
 *
 * It replaces a starter's scaffold notice, which told whoever landed here that
 * the route "faz parte do esqueleto do projeto" and invited them to substitute
 * their own page. That is a message written for the developer who installed
 * the template, shown to the organiser paying for the product; it reads as
 * abandonment, and on a page somebody reached from a working menu it reads as
 * a broken one.
 *
 * The dashed border went with it. A dashed box is the convention for a slot
 * waiting to be filled by the person looking at it — a drop target, an empty
 * form. Nothing here is waiting on them.
 */
export function InDevelopment({ className }: { className?: string }) {
  const t = useTranslations("scaffold");

  return (
    <section
      className={
        "flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center shadow-sm" +
        (className ? " " + className : "")
      }
    >
      <span aria-hidden="true" className="plate plate-brand size-11">
        <Wrench size={22} />
      </span>
      <div>
        <p className="font-display text-base font-semibold text-foreground">{t("title")}</p>
        <p className="mx-auto mt-1 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
          {t("body")}
        </p>
      </div>
    </section>
  );
}

/**
 * A route the spine points at that has no page behind it yet: its own header,
 * then the notice above.
 */
export function ScaffoldPage({
  icon,
  messageKey,
}: {
  icon: ReactNode;
  /** Names the block under `scaffold` that titles this route. */
  messageKey: string;
}) {
  const t = useTranslations("scaffold");

  return (
    <div className="mx-auto max-w-[1600px]">
      <DashboardPageHeader
        icon={icon}
        title={t(`${messageKey}.title`)}
        description={t(`${messageKey}.description`)}
      />
      <InDevelopment className="mt-6" />
    </div>
  );
}
