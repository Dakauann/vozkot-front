import { setRequestLocale } from "next-intl/server";

import { LayoutBuilder } from "@/components/seating/layout-builder";

/**
 * One plan, on the canvas.
 *
 * No page header and no max-width container, unlike every other page in the
 * app, and both omissions are the point: this is a canvas, the room is the
 * content, and it takes the screen. The builder escapes the shell's padding
 * itself, so nothing here wraps it.
 *
 * The plan comes from the URL rather than from a dropdown inside the canvas, so
 * a room an organiser is working on is a link they can keep. `?for=` carries
 * the event they came from, when they came from one, which is what makes the
 * trip back one click instead of four.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ for?: string }>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  return <LayoutBuilder layoutId={id} forEventId={query.for} />;
}
