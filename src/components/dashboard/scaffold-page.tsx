"use client";

import type { ReactNode } from "react";

import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { useTranslations } from "next-intl";

/**
 * A route that exists so the spine has somewhere to point, and says so.
 *
 * A starter's navigation is a scaffold: the rows are there to show the shape of
 * the shell, and wiring each one is the work being handed over. The alternative
 * was nav rows that 404, which reads as a broken shell rather than an
 * unfinished one.
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
      <div className="mt-6 rounded-[--radius] border border-dashed border-border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-foreground">{t("title")}</p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{t("body")}</p>
      </div>
    </div>
  );
}
