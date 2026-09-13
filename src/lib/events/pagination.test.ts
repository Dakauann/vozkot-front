import { describe, expect, it } from "vitest";

import { currentPage, pageCount, windowed } from "./pagination";
import { DEFAULT_PAGE_SIZE, MAX_OFFSET } from "./types";

describe("pageCount", () => {
  it("is zero when nothing matched", () => {
    expect(pageCount(0, DEFAULT_PAGE_SIZE)).toBe(0);
  });

  it("counts a partial last page", () => {
    expect(pageCount(1, 24)).toBe(1);
    expect(pageCount(24, 24)).toBe(1);
    expect(pageCount(25, 24)).toBe(2);
    expect(pageCount(100, 24)).toBe(5);
  });

  it("stops at the deepest page the API will serve", () => {
    // Beyond this the server clamps the offset, so a link would claim to go
    // somewhere it does not.
    const capped = pageCount(1_000_000, 24);
    expect(capped).toBe(Math.floor(MAX_OFFSET / 24) + 1);
    expect((capped - 1) * 24).toBeLessThanOrEqual(MAX_OFFSET);
  });

  it("respects a caller's own ceiling", () => {
    expect(pageCount(1_000_000, 10, 90)).toBe(10);
  });

  it("treats a nonsensical page size as the default rather than dividing by zero", () => {
    expect(pageCount(100, 0)).toBe(pageCount(100, DEFAULT_PAGE_SIZE));
    expect(Number.isFinite(pageCount(100, 0))).toBe(true);
  });

  it("never reports a negative count", () => {
    expect(pageCount(-5, 24)).toBe(0);
  });
});

describe("currentPage", () => {
  it("is one at the start", () => {
    expect(currentPage(0, 24)).toBe(1);
  });

  it("counts whole pages of offset", () => {
    expect(currentPage(24, 24)).toBe(2);
    expect(currentPage(4992, 24)).toBe(209);
  });

  it("rounds a partial offset down to the page it sits in", () => {
    expect(currentPage(30, 24)).toBe(2);
  });

  it("clamps a negative offset to the first page", () => {
    expect(currentPage(-10, 24)).toBe(1);
  });
});

describe("windowed", () => {
  it("shows every number while they still fit", () => {
    expect(windowed(1, 1)).toEqual([1]);
    expect(windowed(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(windowed(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("returns nothing when there are no pages", () => {
    expect(windowed(1, 0)).toEqual([]);
  });

  it("collapses the far end into a gap", () => {
    expect(windowed(1, 10)).toEqual([1, 2, 3, 4, 5, null, 10]);
    expect(windowed(10, 10)).toEqual([1, null, 6, 7, 8, 9, 10]);
  });

  it("keeps a window around the current page", () => {
    expect(windowed(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
  });

  it("slides the window inward near an end rather than clipping it", () => {
    // Both of these could have been rendered a slot narrower. They are not,
    // because the strip has to stay the same width to stay clickable.
    expect(windowed(3, 10)).toEqual([1, 2, 3, 4, 5, null, 10]);
    expect(windowed(8, 10)).toEqual([1, null, 6, 7, 8, 9, 10]);
  });

  it("hands over from one shape to the next without a jump", () => {
    // The page where the leading gap first appears. Either side of it the strip
    // must still contain the page it claims to be showing.
    expect(windowed(4, 10)).toEqual([1, 2, 3, 4, 5, null, 10]);
    expect(windowed(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(windowed(6, 10)).toEqual([1, null, 5, 6, 7, null, 10]);
    expect(windowed(7, 10)).toEqual([1, null, 6, 7, 8, 9, 10]);
  });

  it("uses gaps only once the numbers stop fitting", () => {
    expect(windowed(4, 8)).toEqual([1, 2, 3, 4, 5, null, 8]);
    expect(windowed(4, 7)).not.toContain(null);
  });

  it("always offers the first and last page", () => {
    // The two that people actually reach for: back to the top of the results,
    // and "how many are there".
    for (const current of [1, 2, 17, 99, 200]) {
      const strip = windowed(current, 200);
      expect(strip[0], `page ${current}`).toBe(1);
      expect(strip[strip.length - 1], `page ${current}`).toBe(200);
    }
  });

  it("never renders the same number twice", () => {
    for (let current = 1; current <= 40; current += 1) {
      const numbers = windowed(current, 40).filter((page): page is number => page !== null);
      expect(new Set(numbers).size, `page ${current}`).toBe(numbers.length);
    }
  });

  it("stays inside the range", () => {
    for (let current = 1; current <= 40; current += 1) {
      for (const page of windowed(current, 40)) {
        if (page === null) continue;
        expect(page, `page ${current}`).toBeGreaterThanOrEqual(1);
        expect(page, `page ${current}`).toBeLessThanOrEqual(40);
      }
    }
  });

  it("keeps a steady width so the control does not reflow under the cursor", () => {
    // A strip that changes length as you page through it moves the number you
    // were aiming at out from under the pointer.
    for (let current = 3; current <= 38; current += 1) {
      expect(windowed(current, 40).length, `page ${current}`).toBe(7);
    }
  });

  it("includes the current page itself", () => {
    for (let current = 1; current <= 40; current += 1) {
      expect(windowed(current, 40), `page ${current}`).toContain(current);
    }
  });

  it("clamps a current page outside the range instead of inventing numbers", () => {
    expect(windowed(0, 10)).toEqual(windowed(1, 10));
    expect(windowed(99, 10)).toEqual(windowed(10, 10));
  });
});
