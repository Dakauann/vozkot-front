import { describe, expect, it } from "vitest";

import loader, { nearestVariant } from "./loader";

/**
 * The loader points at files the API already wrote. A bug here is not a slow
 * image, it is a broken one: a URL pointing at a variant that was never
 * generated 404s, and the card renders an empty box.
 */

const ORIGIN = "https://cdn.example.com/events/evt_a1b2/med_9f2c1d8a.jpg";

describe("nearestVariant", () => {
  it("picks the smallest generated width that covers the request", () => {
    expect(nearestVariant(1)).toBe(400);
    expect(nearestVariant(400)).toBe(400);
    expect(nearestVariant(401)).toBe(800);
    expect(nearestVariant(800)).toBe(800);
    expect(nearestVariant(1200)).toBe(1600);
  });

  it("rounds up rather than to the nearest", () => {
    // 420 is much closer to 400 than to 800, and the 400 copy would still be
    // visibly soft in a 420px slot.
    expect(nearestVariant(420)).toBe(800);
  });

  it("falls back to the largest for anything wider or nonsensical", () => {
    expect(nearestVariant(4000)).toBe(1600);
    expect(nearestVariant(Number.NaN)).toBe(1600);
    expect(nearestVariant(Number.POSITIVE_INFINITY)).toBe(1600);
  });
});

describe("loader", () => {
  it("rewrites a media URL to the generated variant", () => {
    expect(loader({ src: ORIGIN, width: 400 })).toBe(
      "https://cdn.example.com/events/evt_a1b2/med_9f2c1d8a_400.jpg",
    );
    expect(loader({ src: ORIGIN, width: 900 })).toBe(
      "https://cdn.example.com/events/evt_a1b2/med_9f2c1d8a_1600.jpg",
    );
  });

  it("keeps a query string, which may one day be a signature", () => {
    expect(loader({ src: `${ORIGIN}?v=2`, width: 400 })).toBe(
      "https://cdn.example.com/events/evt_a1b2/med_9f2c1d8a_400.jpg?v=2",
    );
  });

  it("leaves a URL that already names a variant alone", () => {
    // Otherwise a second pass produces "..._800_400.jpg", which does not exist.
    const already = "https://cdn.example.com/events/evt_a1b2/med_9f2c1d8a_800.jpg";
    expect(loader({ src: already, width: 400 })).toBe(already);
  });

  it("leaves a data URI alone", () => {
    // This is the blur placeholder. There is no server to ask for another size.
    const blur = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    expect(loader({ src: blur, width: 400 })).toBe(blur);
    expect(loader({ src: "blob:http://localhost/abc", width: 400 })).toBe(
      "blob:http://localhost/abc",
    );
  });

  it("leaves anything that is not a media file alone", () => {
    // A logo in /public has no variants, and inventing a name for one would
    // replace a working image with a 404.
    for (const src of [
      "/logo.svg",
      "/icon.png",
      "https://example.com/",
      "relative.jpg",
      // Right shape, wrong prefix: not a key the pipeline ever wrote.
      "https://cdn.example.com/uploads/evt_a1b2/med_9f2c.jpg",
    ]) {
      expect(loader({ src, width: 400 }), src).toBe(src);
    }
  });

  it("uses the JPEG extension produced by the pipeline for every original format", () => {
    expect(
      loader({ src: "https://cdn.example.com/events/evt_a1b2/med_9f2c.png", width: 400 }),
    ).toBe("https://cdn.example.com/events/evt_a1b2/med_9f2c_400.jpg");
    expect(
      loader({ src: "https://cdn.example.com/events/evt_a1b2/med_9f2c.webp", width: 800 }),
    ).toBe("https://cdn.example.com/events/evt_a1b2/med_9f2c_800.jpg");
  });

  it("rewrites legacy ticket-scoped keys too", () => {
    // Media uploaded before the event entity existed still sits under tickets/.
    expect(
      loader({ src: "https://cdn.example.com/tickets/tkt_1/med_9f2c.jpg", width: 800 }),
    ).toBe("https://cdn.example.com/tickets/tkt_1/med_9f2c_800.jpg");
  });
});
