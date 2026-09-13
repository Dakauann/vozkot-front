import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

/**
 * Locale routing. Every page lives under /{locale}, and a request without one
 * is redirected to the visitor's best match before it reaches a route.
 *
 * The file is `proxy.ts`, not `middleware.ts`: Next 16 renamed the convention
 * and warns on the old name. The export contract is unchanged.
 */
export default createMiddleware(routing);

export const config = {
  // Everything except Next's internals, the API proxy paths and any request
  // carrying a file extension, which is how uploaded media and static assets
  // avoid being handed a locale prefix they cannot resolve.
  matcher: ["/((?!api|_next|_vercel|media|.*\..*).*)"],
};
