"use client";

import { Suspense, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { AuthSurface } from "@/components/auth/auth-surface";
import { SignInFlow, type SignInChrome } from "@/components/auth/sign-in-flow";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "@/i18n/routing";
import { safeNext } from "@/lib/checkout/intent";

/**
 * Signing in as a PAGE, for the times there is nothing to come back to.
 *
 * The dialog is the normal way in; it keeps the page underneath alive, so a
 * half-filled checkout survives signing in. This route exists for the arrivals
 * that have no such page: the gate bouncing someone off a deep link, a signed
 * out session landing here from the dashboard, a bookmark.
 *
 * It runs the SAME flow the dialog runs, which is the whole point of the file
 * it imports from. This page used to be a password form with a "Criar conta"
 * link beside it, and that link led to a page that made working accounts out of
 * an unverified address, so the two doors into an account disagreed about
 * whether an address had to be proven. There is one door now.
 */
export default function LoginPage() {
  // useSearchParams needs a boundary for the statically rendered shell.
  return (
    <Suspense fallback={null}>
      <SignInPage />
    </Suspense>
  );
}

/** The page owes the document a real h1; the dialog owes Radix a DialogTitle. */
const pageChrome: SignInChrome = {
  Title: ({ className, children }) => <h1 className={className}>{children}</h1>,
  Description: ({ className, children }) => <p className={className}>{children}</p>,
};

function SignInPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const params = useSearchParams();
  const router = useRouter();

  // Two names for the same idea, because two callers wrote it differently: the
  // gate sends `redirect`, older checkout links send `next`. Both are validated
  // as same-site paths before they are followed; an unchecked one here is an
  // open redirect, and an open redirect on a sign-in page is how a phishing
  // link borrows a real domain's credibility.
  const destination = safeNext(params.get("redirect") ?? params.get("next"));

  // Whether there was ALREADY a session when this page opened, recorded once.
  //
  // Not `isAuthenticated` read live, and the difference is the whole reason
  // this ref exists: the flow signs somebody in at the CODE step and then keeps
  // going; a new account is offered a password, and then asked for the
  // identity block. Watching the live flag would bounce them off this page the
  // instant the code was accepted and skip everything after it. Only somebody
  // who arrived with a session has nothing left to do here.
  const arrivedSignedIn = useRef<boolean | null>(null);
  useEffect(() => {
    if (isLoading) return;
    if (arrivedSignedIn.current === null) arrivedSignedIn.current = isAuthenticated;
    if (arrivedSignedIn.current) router.replace(destination);
  }, [destination, isAuthenticated, isLoading, router]);

  const settle = useCallback(
    (signedIn: boolean) => {
      // Giving up on this screen has nowhere to return to, so it goes to the
      // catalogue rather than leaving a finished form on screen.
      router.replace(signedIn ? destination : "/");
    },
    [destination, router],
  );

  return (
    <AuthSurface>
      <SignInFlow reason="generic" settle={settle} chrome={pageChrome} />
    </AuthSurface>
  );
}
