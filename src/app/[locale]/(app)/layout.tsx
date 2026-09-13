import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { AuthGate } from "@/components/auth/auth-gate";

/**
 * Every signed-in route shares one shell.
 *
 * A route GROUP, not a path segment, so the URLs are untouched: "/" is still
 * "/". Before this the shell was mounted per page, which meant the spine
 * remounted on every navigation and lost its collapse and accordion state.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
