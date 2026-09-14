/**
 * The image loader.
 *
 * The API already resized every upload. When an operator adds artwork the media
 * pipeline writes 400px, 800px and 1600px copies beside the original under a
 * width suffix, precisely so the browser can ask for a size and nobody pays to
 * produce it. This function is the other half of that design: it turns a width
 * into the name of a file that already exists.
 *
 * Without it, Next's own optimiser re-does work that is already done, it
 * fetches the full-size original, decodes it, resizes it with sharp and caches
 * the result, per size, per image. On a catalogue page of twenty-four cards
 * that is twenty-four decodes of the largest file for images that were resized
 * at upload, which is most of why a cold page takes seconds rather than
 * milliseconds.
 *
 * Anything this does not recognise is returned untouched, so an icon in
 * /public, an external logo or a data URI still renders: just unoptimised,
 * which for those is the right answer anyway.
 */

/** The widths the API generates. Must match imaging.Variants on the server. */
const VARIANTS = [400, 800, 1600] as const;

/**
 * A storage key written by the media pipeline, and nothing else.
 *
 * The prefix is load-bearing. A looser pattern, "anything with an extension",
 * matches `/logo.svg` in /public too, and rewrites it to a variant that was
 * never generated, replacing a working image with a 404. Only files under the
 * bucket's own `events/` and `tickets/` prefixes have variants beside them.
 */
const MEDIA_PATH = /^(.*\/(?:events|tickets)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)(\.[A-Za-z0-9]+)$/;

export default function vozkotImageLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  // A data URI is the blur placeholder. It is already the smallest thing on the
  // page and has no server to ask for another size.
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;

  const cut = src.indexOf("?");
  const path = cut === -1 ? src : src.slice(0, cut);
  // Preserved rather than dropped: a bucket that ever starts signing its URLs
  // puts the signature here, and a loader that silently removed it would break
  // every image at once.
  const query = cut === -1 ? "" : src.slice(cut);

  const match = MEDIA_PATH.exec(path);
  if (!match) return src;

  const [, base] = match;

  // A file that already carries a width suffix has been through here, or was
  // written by the pipeline. Rewriting it would produce `..._800_400.jpg`.
  if (/_\d+$/.test(base)) return src;

  // The image pipeline deliberately encodes every derived size as JPEG,
  // regardless of whether the uploaded original was PNG, WebP or GIF. Keeping
  // the source extension here would ask for `_400.png` beside a `_400.jpg` and
  // turn every non-JPEG upload into a broken card image.
  return `${base}_${nearestVariant(width)}.jpg${query}`;
}

/**
 * The smallest generated width that still covers the requested one.
 *
 * Rounding UP rather than to the nearest: a 420px slot filled with the 400px
 * copy is visibly soft, and on a 2x screen it is worse. Overshooting costs
 * bytes; undershooting costs the thing the image is there for.
 */
export function nearestVariant(width: number): number {
  const wanted = Number.isFinite(width) ? width : VARIANTS[VARIANTS.length - 1];
  return VARIANTS.find((variant) => variant >= wanted) ?? VARIANTS[VARIANTS.length - 1];
}
