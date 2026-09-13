/**
 * What the UI shows when a message key is missing.
 *
 * next-intl's own fallback renders the dotted key path, which reaches an
 * operator as "tickets.form.startsAt" in the middle of a form. Humanizing the
 * last segment is still wrong, but it is wrong in a way that reads as a label
 * rather than as a broken build, and the console error below is what actually
 * gets it fixed.
 */
export function humanizeMessageKey(key: string): string {
  const leaf = key.split(".").pop() ?? key;
  const spaced = leaf
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function reportMessageError(error: unknown): void {
  if (process.env.NODE_ENV === "production") return;
  console.error("[i18n]", error);
}
