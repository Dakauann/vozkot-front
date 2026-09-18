"use client";

import * as React from "react";

import { useAuth } from "@/contexts/auth-context";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";

import { listOwnEvents } from "./admin-api";

/**
 * Whether this account organizes, as opposed to buys.
 *
 * There is no organizer ROLE. The backend knows `admin` and `user`, and that
 * is deliberate: on this platform anybody may sell, so organizing is a STATE
 * an account arrives at by creating an event, not a permission an admin
 * grants. The question "is this an organizer" therefore has to be asked of
 * the data, and the honest form of it is "does this account own any event".
 *
 * This decides NAVIGATION ONLY. Every organizer surface is already authorized
 * in its own usecase against the actor's ownership, so a buyer who types
 * /reports into the address bar sees an empty report either way. What this
 * fixes is a buyer being offered five doors that all open onto nothing.
 *
 * Three things make it cheap enough to sit in the shell:
 *
 *   - It asks for ONE row (`limit: 1`) and reads `total`, which is the count
 *     query the listing already runs.
 *   - The answer is cached per account for the life of the tab, so moving
 *     between pages costs nothing.
 *   - The previous answer is remembered in localStorage, so a returning
 *     organizer renders the organizer spine on the FIRST paint instead of
 *     watching four rows appear a moment later. The remembered value is a
 *     hint, never the authority: the fetch still runs and corrects it.
 */

/** Unknown until the first answer arrives, and only then true or false. */
export type OrganizerState = boolean | null;

const cache = new Map<string, Promise<boolean>>();

function hintKey(userId: string) {
  return `vk.organizer.${userId}`;
}

function readHint(userId: string): OrganizerState {
  try {
    const stored = window.localStorage.getItem(hintKey(userId));
    return stored === null ? null : stored === "1";
  } catch {
    // Private windows and blocked site data both throw here. An unknown
    // answer is the correct fallback, and the fetch resolves it.
    return null;
  }
}

function writeHint(userId: string, value: boolean) {
  try {
    window.localStorage.setItem(hintKey(userId), value ? "1" : "0");
  } catch {
    // A hint that cannot be stored costs one flash on the next visit, which
    // is not worth failing navigation over.
  }
}

function resolve(userId: string): Promise<boolean> {
  const inFlight = cache.get(userId);
  if (inFlight) return inFlight;

  const request = listOwnEvents({ limit: 1, offset: 0 }).then((result) => {
    // A failed request must not demote an organizer to a buyer: that would
    // take their tools away because of one flaky response. Unknown falls
    // back to the remembered hint, and to "buyer" only if there is none.
    if (result.error) {
      cache.delete(userId);
      return readHint(userId) ?? false;
    }
    const owns = (result.data?.total ?? 0) > 0;
    writeHint(userId, owns);
    return owns;
  });

  cache.set(userId, request);
  return request;
}

/**
 * Everyone currently rendering an answer.
 *
 * Dropping the cache is not enough on its own: the hook resolves once per
 * account, so an invalidated entry would sit there unread until something else
 * happened to remount the spine. The listeners are what turn "forget this" into
 * "and ask again now".
 */
const listeners = new Set<() => void>();

/**
 * Forget the cached answer, and re-ask.
 *
 * Called when an account crosses the boundary: its first event created, its
 * last one deleted, so the spine changes on the spot rather than on the next
 * full reload. With no argument it forgets every account, which is what a
 * caller that does not want to reach for the session should pass.
 */
export function forgetOrganizerState(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
  for (const notify of listeners) notify();
}

export function useIsOrganizer(): OrganizerState {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = React.useState<OrganizerState>(null);
  const [generation, setGeneration] = React.useState(0);

  // The hint lands before the first paint, by the same mechanism and for the
  // same reason as the spine's remembered sections: it cannot be read in a
  // useState initialiser, because that initialiser also runs during SSR where
  // there is no localStorage, and the two renders would disagree.
  useIsomorphicLayoutEffect(() => {
    setState(userId ? readHint(userId) : null);
  }, [userId]);

  React.useEffect(() => {
    const invalidated = () => setGeneration((current) => current + 1);
    listeners.add(invalidated);
    return () => {
      listeners.delete(invalidated);
    };
  }, []);

  // The authority. Asynchronous, so it never cascades a render synchronously,
  // and it overwrites the hint whichever way it lands.
  React.useEffect(() => {
    if (!userId) return;
    let live = true;
    resolve(userId).then((owns) => {
      if (live) setState(owns);
    });
    return () => {
      live = false;
    };
  }, [userId, generation]);

  return state;
}
