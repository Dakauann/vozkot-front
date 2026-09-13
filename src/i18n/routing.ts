import { createNavigation } from "next-intl/navigation";
import { defineRouting } from "next-intl/routing";

import { defaultLocale, locales } from "./config";

/**
 * Every route carries its locale in the path, including the default one.
 *
 * "always" rather than "as-needed" so a URL is never ambiguous: /pt/tickets and
 * /en/tickets are two addresses an operator can bookmark, share and land on
 * without the app guessing which language they meant.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
  localeDetection: true,
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
