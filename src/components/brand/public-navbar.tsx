"use client";

import { BrandLogo } from "@/components/brand/brand-mark";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Link } from "@/i18n/routing";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function PublicNavbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex rounded-[--radius] focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandLogo markClassName="size-9" />
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
