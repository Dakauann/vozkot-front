"use client";

import * as React from "react";

import { AnimatePresence, motion } from "framer-motion";
import { CaretDown, Gear, List as ListIcon, SignOut } from "@/components/icons";

import { BrandLogo } from "@/components/brand/brand-mark";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Link, useRouter } from "@/i18n/routing";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useSidebar } from "@/contexts/sidebar-context";
import { useTranslations } from "next-intl";

export interface DashboardNavbarProps {
  logoLink?: string;
  settingsLink?: string;
  className?: string;
}

/**
 * The app bar.
 *
 * Full width, owning the top-left corner; the nav spine starts BELOW it. The
 * far-left group is the shell's identity line, read as "Product | Scope":
 * hamburger, brand mark, a hairline divider, then the name. The right side is
 * the readout rack: theme and account.
 *
 * Breadcrumbs deliberately do not live here. The trail belongs with the page it
 * describes, so it sits in the page header, directly above the title it leads
 * to.
 */
export function DashboardNavbar({
  logoLink = "/",
  settingsLink = "/settings",
  className,
}: DashboardNavbarProps = {}) {
  const t = useTranslations("navbar");
  const nav = useTranslations("nav");
  const { user, logout } = useAuth();
  const router = useRouter();
  const { toggleCollapsed, setMobileOpen } = useSidebar();
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials =
    user?.name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U";

  const handleLogout = async () => {
    try {
      await logout();
      router.replace("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <header
      className={cn(
        // Full width and above the spine: the bar owns the corner, which is
        // this shell topology's defining move. z-40 keeps it over the spine
        // (z-30); the mobile drawer and its veil still cover both.
        "fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-2",
        "border-b border-sidebar-border bg-sidebar pl-1.5 pr-3 shadow-sm",
        className,
      )}
    >
      {/* The hamburger. One affordance, two behaviours by viewport: on the
          desktop shell it collapses the spine to its 52px icon rail; below md
          it opens the drawer. Split into two buttons so each carries the right
          accessible name. */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={t("toggleSidebar")}
        title={t("toggleSidebar")}
        className="hidden size-9 shrink-0 items-center justify-center rounded-[--radius] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
      >
        <ListIcon className="size-[18px]" weight="regular" />
      </button>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label={t("openMenu")}
        className="flex size-9 shrink-0 items-center justify-center rounded-[--radius] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
      >
        <ListIcon className="size-[18px]" weight="regular" />
      </button>

      <Link
        href={logoLink}
        className="flex shrink-0 items-center rounded-[--radius] px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BrandLogo markClassName="size-8" />
      </Link>

      <div className="min-w-0 flex-1" />

      <div className="flex shrink-0 items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />

        <div className="mx-1 hidden h-5 w-px bg-border md:block" />

        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setShowUserMenu(!showUserMenu)}
            aria-haspopup="menu"
            aria-expanded={showUserMenu}
            className={cn(
              "flex items-center gap-2 rounded-[--radius] p-1 transition-colors",
              showUserMenu ? "bg-muted" : "hover:bg-muted",
            )}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-[--radius] border border-border bg-foreground text-[10px] font-semibold text-background">
              {initials}
            </span>
            <span className="hidden min-w-0 flex-col items-start lg:flex">
              <span className="max-w-[140px] truncate text-sm font-semibold leading-tight text-foreground">
                {user?.name || user?.email?.split("@")[0] || "Admin"}
              </span>
              <span className="legend leading-tight">
                {user?.role === "admin" ? nav("admin") : t("account")}
              </span>
            </span>
            <CaretDown
              className={cn(
                "hidden size-3 text-muted-foreground transition-transform lg:block",
                showUserMenu && "rotate-180",
              )}
              weight="bold"
            />
          </button>

          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
                className="absolute right-0 top-full mt-1 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
              >
                <div className="border-b border-border px-3 py-2.5">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {user?.name || user?.email?.split("@")[0]}
                  </p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {user?.email}
                  </p>
                </div>

                <div className="p-1">
                  <Link
                    href={settingsLink}
                    className="flex items-center gap-2 rounded-[--radius] px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Gear className="size-4 text-muted-foreground" weight="regular" />
                    <span>{nav("settings")}</span>
                  </Link>
                </div>

                <div className="border-t border-border p-1">
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="flex w-full items-center gap-2 rounded-[--radius] px-2 py-1.5 text-sm text-destructive-ink transition-colors hover:bg-muted"
                  >
                    <SignOut className="size-4" weight="bold" />
                    <span>{t("signOut")}</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
