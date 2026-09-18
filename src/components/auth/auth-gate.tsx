"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "@/i18n/routing";

import { API_URL } from "@/lib/api/url";
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
 *
 * The COPY, though, is written for a customer: an outage is not their fault and
 * naming an origin or a process gives them nothing to do about it. The origin is
 * rendered below the message in development only.
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

  // The spinner is for the FIRST check only, when nobody is known yet.
  //
  // `isLoading` is also true during a background revalidation: the auth
  // context re-checks the session on `visibilitychange` and on `online`, and
  // swapping the app for a spinner then UNMOUNTS the whole shell. Everything
  // the shell was holding goes with it: which context the operator was in,
  // which nav sections were open, whether the rail was collapsed, the scroll
  // position, and any half-filled form under it. Tabbing away to check an
  // email and coming back would move them somewhere else.
  //
  // A revalidation that finds the session gone still lands correctly: `user`
  // becomes null, `isAuthenticated` goes false, and the effect above redirects
  // to the sign-in.
  if (isLoading && !isAuthenticated) {
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
            {t("serverDownBody")}
          </p>
          {/*
           * The address, for the one audience that can act on it.
           *
           * This used to be interpolated into the sentence above, which meant a
           * customer was shown an origin they cannot reach and told to start a
           * backend they do not have. The distinction the component makes is
           * still worth making, see the doc comment, but the DETAIL behind it
           * is a developer's, so it ships only where a developer is.
           */}
          {process.env.NODE_ENV !== "production" ? (
            <p className="mx-auto mt-2 max-w-sm font-mono text-xs text-muted-foreground">{API_URL}</p>
          ) : null}
          <Button className="mt-5" onClick={() => void refreshUser()}>
            {t("retry")}
          </Button>
        </div>
      </div>
    );
  }

  return isAuthenticated ? children : null;
}
