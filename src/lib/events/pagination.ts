import { DEFAULT_PAGE_SIZE, MAX_OFFSET } from "./types";

/**
 * Pagination arithmetic.
 *
 * Pure functions, deliberately kept out of the component that renders them:
 * "which numbers should this control show" is a decision worth testing at every
 * boundary, and a decision buried in JSX beside translation calls and routing
 * is one nobody can test at all.
 */

/** A gap in the number strip. Rendered as an ellipsis. */
export type PageGap = null;

/**
 * How many pages a result set has, capped by how deep the API will actually go.
 *
 * The cap is not cosmetic. The server clamps the offset, so a link past it
 * returns the last reachable page under a label that claims otherwise — a
 * control that lies about where it goes is worse than one that stops.
 */
export function pageCount(total: number, limit: number, maxOffset: number = MAX_OFFSET): number {
  const pageSize = Math.max(Math.floor(limit) || DEFAULT_PAGE_SIZE, 1);
  const reachable = Math.floor(maxOffset / pageSize) + 1;
  return Math.min(Math.ceil(Math.max(total, 0) / pageSize), reachable);
}

/** The 1-based page an offset lands on. */
export function currentPage(offset: number, limit: number): number {
  const pageSize = Math.max(Math.floor(limit) || DEFAULT_PAGE_SIZE, 1);
  return Math.floor(Math.max(offset, 0) / pageSize) + 1;
}

/**
 * How many slots the number strip occupies once it needs gaps. Seven is the
 * widest that still fits a 320px phone beside the previous/next arrows.
 */
const SLOTS = 7;

/** How close to an end the current page must be before the window stops moving. */
const EDGE = 4;

/**
 * The page numbers worth rendering: the ends, and a window around the current
 * page. `null` is a gap.
 *
 * Rendering every number is fine at ten pages and a wall of links at four
 * hundred, which is exactly when a catalogue has enough events to need them.
 *
 * The strip is always the same width, and that is the part worth being careful
 * about. Near an end the window slides inward instead of being clipped, so the
 * control keeps its size as someone pages through it. A strip that grows and
 * shrinks moves the number a person is aiming at out from under the pointer
 * between one click and the next, which is how someone lands on page 9 twice
 * and never reaches page 10.
 */
export function windowed(current: number, pages: number): (number | PageGap)[] {
  const total = Math.max(Math.floor(pages), 0);
  if (total <= SLOTS) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  // A page outside the range is clamped rather than rendered: a hand-edited
  // `?page=9999` should offer the last page, not page numbers that do not exist.
  const here = Math.min(Math.max(Math.floor(current), 1), total);

  if (here <= EDGE) {
    // 1 2 3 4 5 … last
    return [...run(1, SLOTS - 2), null, total];
  }
  if (here >= total - (EDGE - 1)) {
    // 1 … last-4 last-3 last-2 last-1 last
    return [1, null, ...run(total - (SLOTS - 3), SLOTS - 2)];
  }
  // 1 … here-1 here here+1 … last
  return [1, null, here - 1, here, here + 1, null, total];
}

/** `length` consecutive page numbers starting at `from`. */
function run(from: number, length: number): number[] {
  return Array.from({ length }, (_, index) => from + index);
}
