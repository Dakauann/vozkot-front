import { setRequestLocale } from "next-intl/server";

import { EventReport } from "@/components/reports/event-report";

/**
 * Who buys, across everything this organiser sells.
 *
 * The same component the event report uses, with no event to narrow it: the
 * scope comes from the session on the server, so this page passes no id and has
 * none to get wrong.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
      <EventReport />
    </main>
  );
}
