"use client";

import * as React from "react";

/**
 * "Sign in, then carry on with what you were doing."
 *
 * The old arrangement sent people to /login with the thing they wanted encoded
 * in a `next` parameter. That works, and it costs a full navigation: the page
 * they were on is torn down, whatever they had typed into it is gone, and
 * coming back depends on every intermediate screen having remembered to pass
 * the parameter along. Anything not in the URL: a half-filled form, a chosen
 * quantity, a scroll position; does not survive it.
 *
 * So signing in happens in a DIALOG over the page, and the thing that was
 * interrupted is a callback rather than a URL. The page is never unmounted, so
 * there is nothing to restore: it is still there underneath, exactly as it was,
 * and the callback simply runs.
 *
 * The contract is deliberately narrow. `requireAuth` returns a promise that
 * resolves true once there is a session and false if the person closes the
 * dialog, so a caller reads as a plain guard:
 *
 *     if (!(await requireAuth())) return;
 *     …the thing that needed a session
 *
 * That shape matters: an API built on callbacks-in-props ends up with every
 * caller inventing its own "what was I doing" state, which is the bug this
 * exists to remove.
 */

/** What the caller needs a session FOR, so the dialog can say so. */
export type AuthReason = "checkout" | "orders" | "generic";

interface Pending {
  reason: AuthReason;
  resolve: (signedIn: boolean) => void;
}

interface AuthDialogValue {
  /**
   * Ensures there is a session, opening the dialog if there is not.
   *
   * Resolves true when signed in; immediately, if there already was a session
   *, and false when the person closed the dialog instead.
   */
  requireAuth: (reason?: AuthReason) => Promise<boolean>;
  /** Opens the dialog without a task waiting on it. */
  openSignIn: (reason?: AuthReason) => void;
  open: boolean;
  reason: AuthReason;
  /** Called by the dialog when it closes, either way. */
  settle: (signedIn: boolean) => void;
}

const AuthDialogContext = React.createContext<AuthDialogValue | undefined>(undefined);

export function AuthDialogProvider({
  children,
  isAuthenticated,
}: {
  children: React.ReactNode;
  isAuthenticated: boolean;
}) {
  const [pending, setPending] = React.useState<Pending | null>(null);

  // The live value, read inside requireAuth without making it a dependency.
  //
  // requireAuth must keep a stable identity: callers put it in effect
  // dependency lists and in event handlers, and an identity that changed on
  // every session refresh would re-run those.
  const signedIn = React.useRef(isAuthenticated);
  React.useEffect(() => {
    signedIn.current = isAuthenticated;
  }, [isAuthenticated]);

  const requireAuth = React.useCallback((reason: AuthReason = "generic") => {
    if (signedIn.current) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      setPending((current) => {
        // Two guards racing, a click and a keyboard activation, must not
        // stack two dialogs. The first one wins and the second is told no,
        // rather than being left hanging on a promise nothing will resolve.
        if (current) {
          resolve(false);
          return current;
        }
        return { reason, resolve };
      });
    });
  }, []);

  const openSignIn = React.useCallback(
    (reason: AuthReason = "generic") => {
      void requireAuth(reason);
    },
    [requireAuth],
  );

  // settle consults the LIVE session state rather than trusting only what the
  // caller passed.
  //
  // That covers the case an effect would otherwise have to watch for: a session
  // appearing some other way while the dialog is open: another tab signed in,
  // a refresh landed. Closing then resolves true, because by the time the
  // dialog closed the thing the caller asked for was true. Watching for it in
  // an effect instead would mean setting state during an effect to close a
  // dialog that is about to be closed anyway.
  const settle = React.useCallback((result: boolean) => {
    setPending((current) => {
      current?.resolve(result || signedIn.current);
      return null;
    });
  }, []);

  const value = React.useMemo<AuthDialogValue>(
    () => ({
      requireAuth,
      openSignIn,
      open: pending !== null,
      reason: pending?.reason ?? "generic",
      settle,
    }),
    [requireAuth, openSignIn, pending, settle],
  );

  return <AuthDialogContext.Provider value={value}>{children}</AuthDialogContext.Provider>;
}

export function useAuthDialog(): AuthDialogValue {
  const value = React.useContext(AuthDialogContext);
  if (!value) {
    throw new Error("useAuthDialog must be used inside AuthDialogProvider");
  }
  return value;
}
