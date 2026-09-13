"use client";

import { BrandLogo } from "@/components/brand/brand-mark";
import { Link } from "@/i18n/routing";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export function BrandFooter({ className }: { className?: string }) {
  const t = useTranslations("footer");

  return (
    <footer className={cn("border-t border-border bg-card", className)}>
      <div className="mx-auto grid w-full max-w-[1400px] gap-6 px-4 py-7 sm:grid-cols-[minmax(0,1.5fr)_auto] sm:px-6">
        <div className="min-w-0">
          <Link
            href="/"
            className="inline-flex rounded-[--radius] focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandLogo markClassName="size-9" />
          </Link>
          <p className="mt-3 max-w-[58ch] text-xs leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </div>

        <div className="flex min-w-0 flex-col items-start gap-2 sm:items-end sm:text-right">
          <nav aria-label={t("legalNavigation")} className="flex flex-wrap gap-x-5 gap-y-2">
            <Link
              href="/terms-of-service"
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("terms")}
            </Link>
            <Link
              href="/privacy-policy"
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("privacy")}
            </Link>
          </nav>
          <a
            href={`mailto:${brand.supportEmail}`}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {brand.supportEmail}
          </a>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {brand.legalName}. {t("rights")}
            {brand.cnpj ? ` · CNPJ ${brand.cnpj}` : ""}
          </p>
        </div>
      </div>
    </footer>
  );
}
