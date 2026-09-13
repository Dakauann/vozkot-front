import Image from "next/image";

import type { EventMedia } from "@/lib/events/types";

/**
 * One event image, with everything a grid needs to load without jumping.
 *
 * Three things happen here and each one exists because of a specific failure:
 *
 * The box is reserved from the media's own width and height, so the page does
 * not resize itself as images arrive. That shift is the single most noticeable
 * way a listing feels broken, and it is what Core Web Vitals measures.
 *
 * The placeholder is a tiny JPEG the API already generated, inlined as a data
 * URI. It needs no decoder, no library and no hydration: it is present in the
 * server-rendered HTML and paints on first paint. A hash like BlurHash or
 * ThumbHash is smaller on the wire but has to be decoded by JavaScript in the
 * browser, which only pays off past roughly fifty images on one page — a number
 * a card grid does not reach above the fold.
 *
 * The dominant colour sits behind everything as the last fallback, for the
 * moment before even the placeholder is there and for an asset that predates
 * the pipeline.
 */
export function EventImage({
  media,
  alt,
  sizes,
  priority = false,
  className,
  fallbackRatio = 16 / 9,
}: {
  media?: EventMedia;
  alt: string;
  /**
   * REQUIRED in practice. Without it the browser assumes the image fills the
   * viewport and downloads the largest variant for a 280px card.
   */
  sizes: string;
  /**
   * Only for an image already in the first screenful — a hero. Marking several
   * makes them compete and none of them arrives sooner.
   */
  priority?: boolean;
  className?: string;
  fallbackRatio?: number;
}) {
  if (!media) {
    return <div className={className} style={{ aspectRatio: fallbackRatio }} aria-hidden />;
  }

  // An asset from before the pipeline has no dimensions. Falling back to the
  // caller's ratio still reserves a box, which is the part that matters.
  const width = media.width && media.width > 0 ? media.width : 1600;
  const height = media.height && media.height > 0 ? media.height : Math.round(1600 / fallbackRatio);

  return (
    <Image
      src={media.url}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      // Lazy for everything that is not a hero. `priority` already implies
      // eager, so setting both would be contradictory.
      loading={priority ? undefined : "lazy"}
      decoding="async"
      {...(media.blurDataUrl
        ? { placeholder: "blur" as const, blurDataURL: media.blurDataUrl }
        : {})}
      className={className}
    />
  );
}

/**
 * The first image of an event, which is the one a card shows.
 *
 * Videos are skipped: a card renders a still, and a clip has no frame to show
 * without decoding it.
 */
export function coverImage(media: EventMedia[] | undefined): EventMedia | undefined {
  return media?.find((item) => item.kind === "image");
}
