import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { ScrollMemory } from "./scroll-memory";

/**
 * What a browser would tell us anyway is left to a browser. These cover the
 * decisions: whether to restore at all, and which of the two mechanisms wins.
 *
 * The environment is happy-dom, which has no layout, so the two things the
 * restore reads are stubbed: how tall the document is, and where the window
 * is. That is enough, because the logic under test is a comparison between
 * a remembered number and a reachable one.
 */

const OFFSETS = "vozkot:scroll:offsets";
const CARD = "vozkot:scroll:card";

/** The restore runs inside requestAnimationFrame, so frames have to be run. */
async function frames(count = 4) {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }
}

function remember(address: string, y: number, ageMs = 0) {
  sessionStorage.setItem(
    OFFSETS,
    JSON.stringify({ [address]: { y, at: Date.now() - ageMs } }),
  );
}

/** How tall the page pretends to be, which is what gates the offset restore. */
function pageHeight(height: number) {
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: height,
  });
}

let scrolledTo: number | null = null;

beforeEach(() => {
  sessionStorage.clear();
  scrolledTo = null;
  window.history.replaceState({}, "", "/pt?sort=starts_at");
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  pageHeight(800);
  window.scrollTo = ((options: ScrollToOptions) => {
    scrolledTo = typeof options === "object" ? (options.top ?? null) : null;
  }) as typeof window.scrollTo;
  // happy-dom has no navigation timing; the mount-time restore reads it.
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ScrollMemory", () => {
  it("takes scroll restoration off the browser and hands it back on unmount", () => {
    history.scrollRestoration = "auto";
    const view = render(<ScrollMemory />);
    expect(history.scrollRestoration).toBe("manual");
    view.unmount();
    expect(history.scrollRestoration).toBe("auto");
  });

  it("restores the offset once the page is tall enough to hold it", async () => {
    remember("/pt?sort=starts_at", 4000);
    pageHeight(6000);
    render(<ScrollMemory />);

    window.dispatchEvent(new PopStateEvent("popstate"));
    await frames();

    expect(scrolledTo).toBe(4000);
  });

  it("waits rather than writing an offset the page would clamp", async () => {
    remember("/pt?sort=starts_at", 4000);
    // The event page is still on screen: short. This is the exact condition
    // that makes the browser's own restoration land in the wrong place.
    pageHeight(1200);
    render(<ScrollMemory />);

    window.dispatchEvent(new PopStateEvent("popstate"));
    await frames();
    expect(scrolledTo).toBeNull();

    // The catalogue commits and the document grows back.
    pageHeight(6000);
    await frames();
    expect(scrolledTo).toBe(4000);
  });

  it("leaves a place alone once it has gone stale", async () => {
    remember("/pt?sort=starts_at", 4000, 46 * 60 * 1000);
    pageHeight(6000);
    render(<ScrollMemory />);

    window.dispatchEvent(new PopStateEvent("popstate"));
    await frames();

    expect(scrolledTo).toBeNull();
  });

  it("keys a place on the full path, so two locales cannot share one", async () => {
    // Asserted on the SAVE rather than on a failed restore: a restore that
    // does nothing proves nothing, because a locale-stripping bug would also
    // fail to find a place written under the full path. The key itself is the
    // evidence. `usePathname` from `@/i18n/routing` would return "/" here.
    render(<ScrollMemory />);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 1200 });

    window.dispatchEvent(new Event("scroll"));
    await frames(2);

    const saved = JSON.parse(sessionStorage.getItem(OFFSETS) ?? "{}");
    expect(Object.keys(saved)).toEqual(["/pt?sort=starts_at"]);
    expect(saved["/pt?sort=starts_at"].y).toBe(1200);
  });

  it("comes home to the card the reader left through, not to the offset", async () => {
    remember("/pt?sort=starts_at", 4000);
    pageHeight(6000);
    const card = document.createElement("a");
    card.setAttribute("data-event-id", "evt_42");
    const into = vi.fn();
    card.scrollIntoView = into;
    document.body.append(card);
    sessionStorage.setItem(CARD, "evt_42");

    render(<ScrollMemory />);
    window.dispatchEvent(new PopStateEvent("popstate"));
    await frames();

    expect(into).toHaveBeenCalledWith({ block: "center", behavior: "instant" });
    // The card won, so the offset was never written.
    expect(scrolledTo).toBeNull();
    // And it is spent: a later back navigation is not dragged to the same card.
    expect(sessionStorage.getItem(CARD)).toBeNull();
    card.remove();
  });

  it("records the card a click went through, from anywhere in the page", () => {
    render(<ScrollMemory />);
    const card = document.createElement("a");
    card.setAttribute("data-event-id", "evt_7");
    const inner = document.createElement("span");
    card.append(inner);
    document.body.append(card);

    // The click lands on a child, which is what really happens: the id comes
    // from `closest`, not from the target.
    inner.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(sessionStorage.getItem(CARD)).toBe("evt_7");
    card.remove();
  });

  it("forgets the card when the click was not on one", () => {
    sessionStorage.setItem(CARD, "evt_stale");
    render(<ScrollMemory />);

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(sessionStorage.getItem(CARD)).toBeNull();
  });

  it("stops waiting for the page to grow as soon as the reader scrolls", async () => {
    remember("/pt?sort=starts_at", 4000);
    pageHeight(1200);
    render(<ScrollMemory />);

    window.dispatchEvent(new PopStateEvent("popstate"));
    await frames(1);
    window.dispatchEvent(new WheelEvent("wheel"));
    pageHeight(6000);
    await frames();

    // The reader is in charge of where they are now.
    expect(scrolledTo).toBeNull();
  });
});
