"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "@/i18n/routing";

import { API_URL } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { CircleNotch } from "@/components/icons";
import { useAuth } from "@/contexts/auth-context";
import { useTranslations } from "next-intl";

/**
 * The gate every signed-in route sits behind.
 *
 * A failed session check and an unreachable API are answered differently on
 * purpose: the first is a sign-in, the second is a server that is down, and
 * bouncing a developer to the login screen because their backend is not running
 * hides the actual problem behind a form they cannot submit.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const t = useTranslations("auth.gate");
  const { isAuthenticated, isLoading, serverError, refreshUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !serverError) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, isLoading, pathname, router, serverError]);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <CircleNotch className="size-5 animate-spin" aria-label={t("checking")} />
      </div>
    );
  }

  if (serverError) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6 text-center">
        <div>
          <h1 className="font-display text-xl font-semibold">{t("serverDown")}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("serverDownBody", { url: API_URL })}
          </p>
          <Button className="mt-5" onClick={() => void refreshUser()}>
            {t("retry")}
          </Button>
        </div>
      </div>
    );
  }

  return isAuthenticated ? children : null;
}
