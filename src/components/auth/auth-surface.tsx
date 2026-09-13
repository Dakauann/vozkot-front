import type { ReactNode } from "react";

import { BrandFooter } from "@/components/brand/brand-footer";
import { BrandLogo } from "@/components/brand/brand-mark";
import { CircuitTraces, DotMatrix } from "@/components/brand/circuit";
import { LightPool } from "@/components/brand/light-pool";

/**
 * The frame both credential screens sit in.
 *
 * The old "back to the app" row under the card is gone: every app route is
 * behind the gate, so the link sent an unauthenticated visitor to a redirect
 * that returned them to the screen they were already on.
 */
export function AuthSurface({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
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
