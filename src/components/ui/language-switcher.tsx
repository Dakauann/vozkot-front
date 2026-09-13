"use client";

import * as React from "react";

import { Check, Globe } from "@/components/icons";
import { localeLabels, localeNames, locales, type Locale } from "@/i18n/config";
import { usePathname, useRouter } from "@/i18n/routing";

import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";

/**
 * The language control.
 *
 * It switches the URL, not a client-side string table: the locale lives in the
 * path, so the choice survives a reload, a bookmark and a link pasted to a
 * colleague. The pathname from next-intl's navigation is already stripped of
 * its locale segment, which is what lets the same route be re-entered in
 * another language instead of bouncing to the home page.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("common");
  const active = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function select(next: Locale) {
    setOpen(false);
    if (next === active) return;
    startTransition(() => {
      // The same route, re-entered under another locale. usePathname from the
      // i18n navigation already has the locale segment stripped, so a deep link
      // such as /pt/check-in becomes /en/check-in rather than /en.
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language")}
        disabled={pending}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-[--radius] px-2 text-xs font-medium text-muted-foreground",
          "transition-colors hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && "bg-muted text-foreground",
        )}
      >
        <Globe size={16} aria-hidden="true" />
        <span className="tabular-nums">{localeLabels[active]}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("language")}
          className="absolute right-0 top-full z-50 mt-1 min-w-[9.5rem] overflow-hidden rounded-[--radius] border border-border bg-popover py-1 shadow-elev-4"
        >
          {locales.map((locale) => (
            <li key={locale}>
              <button
                type="button"
                role="option"
                aria-selected={locale === active}
                onClick={() => select(locale)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm transition-colors",
                  "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                  locale === active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                <span>{localeNames[locale]}</span>
                {locale === active ? (
                  <Check size={14} className="text-primary-ink" aria-hidden="true" />
                ) : (
                  <span className="text-[11px] tabular-nums text-muted-foreground">{localeLabels[locale]}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
