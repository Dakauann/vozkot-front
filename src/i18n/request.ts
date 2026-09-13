import { getRequestConfig } from "next-intl/server";

import { isLocale } from "./config";
import { humanizeMessageKey, reportMessageError } from "./fallback";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : routing.defaultLocale;

  const messages = (await import(`./messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    onError: reportMessageError,
    // Shared with the client provider in the locale layout. Two copies is how a
    // client component ends up with none and starts printing key paths.
    getMessageFallback({ key }) {
      return humanizeMessageKey(key);
    },
  };
});
