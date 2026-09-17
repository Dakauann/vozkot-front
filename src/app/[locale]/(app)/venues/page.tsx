import { setRequestLocale } from "next-intl/server";

import { LayoutBuilder } from "@/components/seating/layout-builder";

/**
 * The room builder.
 *
 * No page header and no max-width container, unlike every other page in the
 * app, and both omissions are the point: this is a canvas, the room is the
 * content, and it takes the screen. A title bar above it would push the canvas
 * down for a heading that repeats what the sidebar already says, and a 1100px
 * cap would waste the half of a wide monitor that a seat map is exactly the
 * thing to use.
 *
 * The component escapes the shell's padding itself, so nothing here wraps it.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LayoutBuilder />;
}
