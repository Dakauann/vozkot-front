"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ArrowLeft } from "@/components/icons";
import { BrandFooter } from "@/components/brand/brand-footer";
import { PublicNavbar } from "@/components/brand/public-navbar";
import { Link } from "@/i18n/routing";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";

type LegalNamespace = "termsOfService" | "privacyPolicy";

export interface LegalDocumentProps {
  namespace: LegalNamespace;
  sections: readonly string[];
  version: string;
  lastUpdated: string;
}

export function LegalDocument({
  namespace,
  sections,
  version,
  lastUpdated,
}: LegalDocumentProps) {
  const t = useTranslations(namespace);
  const common = useTranslations("legal");
  const locale = useLocale();
  const [activeSection, setActiveSection] = useState(sections[0] ?? "");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const values = useMemo(
    () => ({
      productName: brand.productName,
      legalName: brand.legalName,
      siteUrl: brand.siteUrl,
      supportEmail: brand.supportEmail,
      dpoEmail: brand.dpoEmail,
    }),
    [],
  );

  const clauses = sections.map((key, index) => ({
    key,
    number: index + 1,
    title: t(`sections.${key}.title`),
    content: t(`sections.${key}.content`, values),
  }));
  const readingMinutes = Math.max(
    1,
    Math.round(
      clauses.reduce((total, clause) => total + clause.content.split(/\s+/).length, 0) /
        200,
    ),
  );
  const formattedDate = new Date(`${lastUpdated}T00:00:00`).toLocaleDateString(
    locale,
    { day: "numeric", month: "long", year: "numeric" },
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-88px 0px -68% 0px", threshold: 0 },
    );

    Object.values(sectionRefs.current).forEach((node) => {
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [clauses.length]);

  const contactEmail =
    namespace === "privacyPolicy" ? brand.dpoEmail : brand.supportEmail;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNavbar />
      <main>
        <header className="border-b border-border bg-card">
          <div className="mx-auto w-full max-w-[1100px] px-4 py-9 sm:px-6 lg:px-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              {common("back")}
            </Link>
            <h1 className="mt-5 font-display text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
              {t("title")}
            </h1>
            <p className="mt-3 max-w-[70ch] text-sm leading-6 text-muted-foreground">
              {t("intro", values)}
            </p>
            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{common("version")}</dt>
                <dd className="mt-1 font-display text-sm font-semibold">{version}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{common("updated")}</dt>
                <dd className="mt-1 text-sm font-medium">{formattedDate}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{common("reading")}</dt>
                <dd className="mt-1 text-sm font-medium">
                  {common("minutes", { minutes: readingMinutes })}
                </dd>
              </div>
            </dl>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6 lg:px-8">
          <div className="gap-12 py-10 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
            <nav
              aria-label={common("contents")}
              className="mb-9 lg:sticky lg:top-[76px] lg:mb-0 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
            >
              <p className="border-b border-border pb-2 text-xs font-semibold text-foreground">
                {common("contents")}
              </p>
              <ol className="mt-2 space-y-0.5">
                {clauses.map((clause) => {
                  const current = activeSection === clause.key;
                  return (
                    <li key={clause.key}>
                      <a
                        href={`#${clause.key}`}
                        aria-current={current ? "location" : undefined}
                        className={cn(
                          "flex items-start gap-2 rounded-[--radius] px-2 py-1.5 text-xs leading-snug transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                          current
                            ? "bg-primary-subtle font-semibold text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <span className="w-4 shrink-0 font-display tabular-nums opacity-60">
                          {clause.number}
                        </span>
                        <span>{clause.title}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <article className="min-w-0">
              {clauses.map((clause) => (
                <section
                  key={clause.key}
                  id={clause.key}
                  ref={(node) => {
                    sectionRefs.current[clause.key] = node;
                  }}
                  className="scroll-mt-20 border-b border-border py-8 first:pt-0 last:border-0"
                >
                  <h2 className="flex items-baseline gap-3 font-display text-xl font-semibold tracking-[-0.01em]">
                    <span className="text-base tabular-nums text-primary-ink">
                      {clause.number}
                    </span>
                    {clause.title}
                  </h2>
                  <div className="mt-3 space-y-3">
                    {clause.content.split("\n\n").map((paragraph, index) =>
                      paragraph.startsWith("•") ? (
                        <ul key={index} className="max-w-[72ch] space-y-2">
                          {paragraph.split("\n").map((item) => (
                            <li key={item} className="flex gap-2.5 text-sm leading-6 text-muted-foreground">
                              <span className="mt-[0.68rem] size-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                              <span>{item.replace(/^•\s*/, "")}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p key={index} className="max-w-[72ch] text-sm leading-6 text-muted-foreground">
                          {paragraph}
                        </p>
                      ),
                    )}
                  </div>
                </section>
              ))}

              <aside className="well mt-10 border border-border p-5">
                <p className="text-sm font-semibold">{common("questions")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{common("contact")}</p>
                <a
                  href={`mailto:${contactEmail}`}
                  className="mt-2 inline-block text-sm font-medium text-primary-ink underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {contactEmail}
                </a>
                <dl className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">
                      {common("operator")}
                    </dt>
                    <dd className="mt-1 text-sm font-medium">{brand.legalName}</dd>
                  </div>
                  {brand.cnpj ? (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">CNPJ</dt>
                      <dd className="mt-1 text-sm font-medium">{brand.cnpj}</dd>
                    </div>
                  ) : null}
                  {brand.legalAddress ? (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">
                        {common("address")}
                      </dt>
                      <dd className="mt-1 text-sm font-medium">{brand.legalAddress}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">
                      {common("website")}
                    </dt>
                    <dd className="mt-1 text-sm font-medium">
                      <a
                        href={brand.siteUrl}
                        className="text-primary-ink underline underline-offset-4"
                        rel="noreferrer"
                        target="_blank"
                      >
                        {brand.siteUrl.replace(/^https?:\/\//, "")}
                      </a>
                    </dd>
                  </div>
                </dl>
              </aside>
            </article>
          </div>
        </div>
      </main>
      <BrandFooter />
    </div>
  );
}
