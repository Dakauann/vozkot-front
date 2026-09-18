"use client";

import * as React from "react";

/**
 * Puts the reader back where they were when they press back.
 *
 * WHY THIS EXISTS AT ALL, because "the browser does this" is nearly true and
 * the nearly is the whole bug. The App Router never touches
 * `history.scrollRestoration` (nothing under `next/dist/client` reads it; the
 * `experimental.scrollRestoration` flag is Pages Router only), so the browser's
 * own `auto` restoration is what runs. But the router applies the restored tree
 * inside a `startTransition` on popstate, with this comment still in the
 * shipped source:
 *
 *     // TODO-APP: Ideally the back button should not use startTransition as it
 *     // should apply the updates synchronously
 *
 * So the browser writes the saved offset while the SHORT page is still on
 * screen. An event page is a fraction of the catalogue's height, so the offset
 * is clamped to that page's scrollHeight on the way in, and the catalogue then
 * inherits the clamped number. Scroll a long way down, open an event, come
 * back, and you land wherever the event page happened to end.
 *
 * Reported as vercel/next.js#70716, which is closed as NOT PLANNED, with
 * #86528 folded into it. There is no framework fix to wait for on this version.
 *
 * WHAT IT COSTS TO GET WRONG. Baymard put a number on it: 13% of the largest
 * e-commerce sites drop the reader at the top of the list instead of their
 * place, and they record it as a direct cause of abandonment, with the second
 * order effect that people stop opening items at all once they learn the return
 * trip is expensive. That is exactly the loop this catalogue is for.
 *
 * HOW. Two mechanisms, in order of how well they survive a page that came back
 * a different height:
 *
 *  1. THE CARD. If the reader arrived by clicking an event, come back to that
 *     event's card rather than to a pixel offset. It is what they were looking
 *     at, and unlike a number it stays correct when a rail above it loaded a
 *     different number of cards, when an image settled, or when the window was
 *     resized in between.
 *  2. THE OFFSET, as the fallback, re-applied once the document is actually
 *     tall enough to hold it, which is the part the browser gets wrong.
 *
 * Nothing here sets React state. Every write is to the DOM or to
 * sessionStorage, which is also what keeps it clear of the project's
 * `react-hooks/set-state-in-effect` rule rather than needing an exception from
 * it.
 */

/** Where the reader was, per address. */
const OFFSETS = "vozkot:scroll:offsets";
/** The card they clicked to leave, if they left by clicking one. */
const CARD = "vozkot:scroll:card";

/**
 * How long a remembered place stays meaningful.
 *
 * Nielsen Norman's guidance is to restore within a session and not much beyond
 * it: an hour later the reader has lost the context that made the offset worth
 * anything, and landing halfway down a list they no longer remember browsing
 * is worse than landing at the top. Forty five minutes sits inside their
 * thirty-to-sixty window.
 */
const FRESH_FOR_MS = 45 * 60 * 1000;

/** How long to keep waiting for the page to grow back to its old height. */
const PATIENCE_MS = 1500;

type Place = { y: number; at: number };

/**
 * Every read and write is guarded.
 *
 * `sessionStorage` throws rather than returning null in a partitioned or
 * private context, and a seat map that cannot remember a scroll offset must
 * still render.
 */
function readPlaces(): Record<string, Place> {
  try {
    const raw = sessionStorage.getItem(OFFSETS);
    return raw ? (JSON.parse(raw) as Record<string, Place>) : {};
  } catch {
    return {};
  }
}

function writePlace(key: string, place: Place) {
  try {
    sessionStorage.setItem(OFFSETS, JSON.stringify({ ...readPlaces(), [key]: place }));
  } catch {
    /* nothing to be done, and nothing that needs saying */
  }
}

export function ScrollMemory() {
  React.useEffect(() => {
    // The FULL path, locale included. `usePathname` from `@/i18n/routing`
    // strips `/pt` and `/en`, which would make the two locales share one
    // remembered place and send a Portuguese reader to an English offset.
    const addressOf = () => window.location.pathname + window.location.search;

    const previous = history.scrollRestoration;
    // Taking it off `auto` is the point: letting the browser write its clamped
    // guess and then correcting it is a visible jump. Owning it means one
    // write, at the moment the page can hold it.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";

    let saveFrame = 0;
    const remember = () => {
      if (saveFrame) return;
      saveFrame = requestAnimationFrame(() => {
        saveFrame = 0;
        writePlace(addressOf(), { y: window.scrollY, at: Date.now() });
      });
    };
    const rememberNow = () => writePlace(addressOf(), { y: window.scrollY, at: Date.now() });

    let attempt = 0;
    const giveUp = () => {
      if (attempt) cancelAnimationFrame(attempt);
      attempt = 0;
    };

    const restore = () => {
      giveUp();
      const address = addressOf();

      // The card first. `closest` is how it was recorded, so the id belongs to
      // whichever card the click actually landed inside.
      let wanted = "";
      try {
        wanted = sessionStorage.getItem(CARD) ?? "";
      } catch {
        wanted = "";
      }

      const place = readPlaces()[address];
      const stale = !place || place.y <= 0 || Date.now() - place.at > FRESH_FOR_MS;
      if (!wanted && stale) return;

      const deadline = performance.now() + PATIENCE_MS;
      const tick = () => {
        attempt = 0;

        if (wanted) {
          const card = document.querySelector(`[data-event-id="${CSS.escape(wanted)}"]`);
          if (card) {
            // Centred rather than at the top edge, because the card is a
            // landmark and the rows around it are the context that says where
            // in the list this is.
            card.scrollIntoView({ block: "center", behavior: "instant" });
            try {
              sessionStorage.removeItem(CARD);
            } catch {
              /* it will be overwritten by the next click anyway */
            }
            return;
          }
        }

        if (!stale) {
          // The offset is only honest once the document can reach it. Until
          // then a write would be clamped, which is the framework bug this
          // whole file exists to work around, reproduced by hand.
          const reachable = document.documentElement.scrollHeight - window.innerHeight;
          if (reachable >= place.y - 1) {
            // `instant`, not an assignment. Nothing sets `scroll-behavior:
            // smooth` globally today, and if anything ever does, a restore
            // must not become an animation the reader watches.
            window.scrollTo({ top: place.y, behavior: "instant" });
            return;
          }
        }

        if (performance.now() < deadline) attempt = requestAnimationFrame(tick);
      };
      attempt = requestAnimationFrame(tick);
    };

    /**
     * Which card the reader left through.
     *
     * Delegated from the document rather than wired into the card's own Link,
     * so it does not depend on whether next-intl's Link wrapper forwards
     * `onNavigate`, and so a card rendered anywhere (grid, rail, strip) is
     * covered by the same six lines. Capture phase, because a handler further
     * in might stop propagation.
     */
    const noteCard = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest("[data-event-id]");
      const id = card?.getAttribute("data-event-id");
      try {
        if (id) sessionStorage.setItem(CARD, id);
        else sessionStorage.removeItem(CARD);
      } catch {
        /* see writePlace */
      }
      // The offset goes with it: the scroll listener is throttled to a frame,
      // and a click can outrun it.
      rememberNow();
    };

    // The reader's own input always wins. If they start scrolling while the
    // retry loop is still waiting for the page to grow, stop waiting.
    const surrender = () => giveUp();

    /**
     * A page served from the back/forward cache comes back with its layout, and
     * its scroll offset, already intact. `manual` does not suppress that. So on
     * a persisted restore there is nothing to do, and doing something would
     * move a reader who was already in the right place.
     */
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      giveUp();
    };

    window.addEventListener("scroll", remember, { passive: true });
    window.addEventListener("popstate", restore);
    window.addEventListener("pageshow", onShow);
    // `pagehide`, not `beforeunload`, which iOS Safari never fires.
    window.addEventListener("pagehide", rememberNow);
    document.addEventListener("click", noteCard, true);
    for (const kind of ["wheel", "touchstart", "keydown", "pointerdown"] as const) {
      window.addEventListener(kind, surrender, { passive: true });
    }

    // A reload keeps its history entry, so `auto` would have restored it and
    // `manual` means nobody will unless we do. Only for a reload or a
    // traversal: a fresh arrival at a remembered address belongs at the top.
    const how = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (how?.type === "reload" || how?.type === "back_forward") restore();

    return () => {
      if ("scrollRestoration" in history) history.scrollRestoration = previous;
      giveUp();
      if (saveFrame) cancelAnimationFrame(saveFrame);
      window.removeEventListener("scroll", remember);
      window.removeEventListener("popstate", restore);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("pagehide", rememberNow);
      document.removeEventListener("click", noteCard, true);
      for (const kind of ["wheel", "touchstart", "keydown", "pointerdown"] as const) {
        window.removeEventListener(kind, surrender);
      }
    };
  }, []);

  return null;
}
