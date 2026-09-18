import type { ReactNode } from "react";

import { BrandFooter } from "@/components/brand/brand-footer";
import { BrandLogo } from "@/components/brand/brand-mark";
import { CircuitTraces, DotMatrix } from "@/components/brand/circuit";
import { LightPool } from "@/components/brand/light-pool";
import { PublicNavbar } from "@/components/brand/public-navbar";

/**
 * The frame the sign-in screen sits in.
 *
 * It used to hold two, a login form and a register form, and now holds one,
 * because there is one way into an account and the register form was the other
 * one. See sign-in-flow.tsx for why that one went.
 *
 * The old "back to the app" row under the card is gone too: every app route is
 * behind the gate, so the link sent an unauthenticated visitor to a redirect
 * that returned them to the screen they were already on.
 *
 * It does carry the buyer's header, though. The page exists for the arrivals
 * with nothing behind them — a deep link that bounced, a bookmark, a signed out
 * dashboard — and those are exactly the people for whom a bare card is a dead
 * end: the only way on from it was to sign in or press back, and back is where
 * they just came from. The header is the way out, and it also restores search,
 * which otherwise disappeared on the one screen somebody might land on first.
 *
 * `min-h-dvh` rather than `min-h-screen`, because `100vh` on mobile Safari is
 * the viewport WITHOUT the browser chrome that is actually covering it, which
 * pushes the footer under the address bar.
 */
export function AuthSurface({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <PublicNavbar />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10 sm:py-16">
        <LightPool />
        <CircuitTraces className="pointer-events-none absolute -right-12 -top-12 hidden h-80 w-80 text-ornament/70 sm:block lg:-right-16 lg:-top-16 lg:h-[30rem] lg:w-[30rem]" />
        <DotMatrix className="pointer-events-none absolute bottom-10 left-8 hidden h-24 w-36 text-ornament/55 sm:block" />
        <div className="relative w-full max-w-[400px]">
          <div className="well overflow-hidden border border-border">
            <div className="rule-engraved flex items-center px-5 py-3.5">
              <BrandLogo markClassName="size-10" />
            </div>
            {children}
          </div>
        </div>
      </main>
      <BrandFooter />
    </div>
  );
}
