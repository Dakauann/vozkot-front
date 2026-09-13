"use client";

import { useTranslations } from "next-intl";

import { BrandLogo } from "@/components/brand/brand-mark";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuth } from "@/contexts/auth-context";
import { Link } from "@/i18n/routing";
import ElevatedInput from "../elevated-design/elevated-input";

/**
 * The buyer-facing header.
 *
 * Three jobs, in the order a visitor needs them: get back to the catalogue,
 * search from anywhere, and reach their own tickets. Everything else — the
 * language, the theme — is a preference and sits at the far end where it does
 * not compete.
 *
 * Search lives HERE and only here, on every page including the landing page.
 * That is the arrangement every ticketing marketplace converged on, and the
 * reason is that a second search box in a hero splits the answer to "where do I
 * type" — and costs a viewport of scroll to ask a question the header already
 * asks. The landing page below spends that space on real events instead.
 */
export function PublicNavbar() {
  const t = useTranslations("catalogue");
  const nav = useTranslations("publicNav");
  const { isAuthenticated } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card">
      <div className="flex h-16 w-full items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8 xl:px-10">
        <Link
          href="/"
          aria-label={nav("home")}
          className="inline-flex shrink-0 rounded-[--radius] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandLogo markClassName="size-9" />
        </Link>

        {/* A plain GET form aimed at the catalogue. No JavaScript: it submits,
            the server renders the results, and the term lands in the URL where
            the rest of the catalogue already reads it from. */}
        <form action="/" method="get" className="min-w-0 flex-1 sm:max-w-xl 2xl:max-w-3xl mx-auto">
          {/* <label className="sr-only" htmlFor="navbar-search">
            {t("searchLabel")}
          </label>
          <input
            id="navbar-search"
            name="q"
            type="search"
            placeholder={t("searchPlaceholder")}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          /> */}
          <ElevatedInput
            id="navbar-search"
            name="q"
            type="search"
            label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
/>
        </form>

        <nav aria-label={nav("label")} className="flex shrink-0 items-center gap-1">
          {isAuthenticated ? (
            <>
              <NavLink href="/orders">{nav("myTickets")}</NavLink>
              <NavLink href="/dashboard">{nav("organiser")}</NavLink>
            </>
          ) : (
            <>
              {/* Organisers are a tiny fraction of the traffic here, so the
                  link is quiet and the buyer's own action is the loud one. */}
              <NavLink href="/login" className="hidden sm:inline-flex">
                {nav("sell")}
              </NavLink>
              <Link
                href="/login"
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--elev-button-primary)] transition-[transform,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-primary-hover hover:shadow-[var(--elev-button-primary-hover)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {nav("signIn")}
              </Link>
            </>
          )}
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
          <LanguageSwitcher />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-accent-hover hover:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      {children}
    </Link>
  );
}
