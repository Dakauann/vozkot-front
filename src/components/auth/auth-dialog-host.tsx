"use client";

import { AuthDialogProvider } from "@/contexts/auth-dialog-context";
import { useAuth } from "@/contexts/auth-context";
import { SignInDialog } from "@/components/auth/sign-in-dialog";

/**
 * Mounts the sign-in dialog once, at the root, for the whole app.
 *
 * One instance rather than one per caller, and that is the point: anything
 * anywhere can ask for a session without rendering a dialog of its own, and
 * there is never a second one behind the first.
 *
 * It sits INSIDE AuthProvider because it needs to know whether there is already
 * a session; a guard must resolve immediately for somebody who is signed in,
 * not flash a dialog and close it.
 */
export function AuthDialogHost({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return (
    <AuthDialogProvider isAuthenticated={isAuthenticated}>
      {children}
      <SignInDialog />
    </AuthDialogProvider>
  );
}
