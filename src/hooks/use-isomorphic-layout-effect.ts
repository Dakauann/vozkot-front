import * as React from "react";

/**
 * useLayoutEffect on the client, useEffect on the server.
 *
 * For state that lives in the browser and must be applied BEFORE the first
 * paint: a remembered spine width, an open section, which context an operator
 * last worked in. Reading it in a `useState` initialiser is not an option,
 * because that initialiser also runs during SSR, where the value does not
 * exist: the server would render one shape, the client another, and React
 * reports that as a hydration error and repairs it by discarding the markup.
 *
 * A layout effect is flushed synchronously before the browser paints, so the
 * first frame anybody sees is already the remembered one, with no flash and no
 * mismatch. React warns when useLayoutEffect runs during SSR, so the passive
 * version is substituted there, where it does nothing anyway.
 *
 * This is the one place setState inside an effect is the correct tool rather
 * than a cascading render: it runs once per key, synchronises React with an
 * external store it cannot read during render, and is exactly the case
 * react-hooks/set-state-in-effect describes as legitimate.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;
