"use client";

import * as React from "react";

import { listOwnEvents } from "./admin-api";
import { MAX_PAGE_SIZE, type EventListing } from "./types";

/**
 * The operator's events, by id.
 *
 * A tier carries only an `eventId` now — the event owns the name, the venue and
 * the date. Every screen that lists tiers therefore needs a way to turn that id
 * back into something a person recognises, and none of them should each invent
 * their own.
 *
 * The alternative would be for the tier endpoint to embed its event, and that
 * is arguably where this belongs. It is not done here because an embedded copy
 * is a copy: it goes stale the moment an operator renames an event, and the
 * tier list would show the old name until something else happened to refresh
 * it.
 */

/** Stop after this many pages. An operator with 300 events has other problems. */
const MAX_PAGES = 5;

export interface EventDirectory {
  byId: Map<string, EventListing>;
  /** The event's name, or the fallback when it is not in the directory. */
  nameOf: (eventId: string, fallback: string) => string;
  loading: boolean;
}

export function useEventDirectory(): EventDirectory {
  const [byId, setById] = React.useState<Map<string, EventListing>>(() => new Map());
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;

    async function run() {
      const found = new Map<string, EventListing>();

      // Paged rather than one huge request: the API caps a page at MAX_PAGE_SIZE
      // and silently clamps anything larger, so asking for "all of them" would
      // quietly return the first sixty and leave the rest looking deleted.
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await listOwnEvents({
          limit: MAX_PAGE_SIZE,
          offset: page * MAX_PAGE_SIZE,
        });
        if (!active) return;
        if (result.error || !result.data) break;

        for (const event of result.data.data) found.set(event.id, event);
        if (found.size >= result.data.total || result.data.data.length === 0) break;
      }

      if (!active) return;
      setById(found);
      setLoading(false);
    }

    void run();
    return () => {
      active = false;
    };
  }, []);

  const nameOf = React.useCallback(
    (eventId: string, fallback: string) => byId.get(eventId)?.name ?? fallback,
    [byId],
  );

  return { byId, nameOf, loading };
}
