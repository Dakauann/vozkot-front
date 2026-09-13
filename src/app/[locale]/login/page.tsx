"use client";

import { Suspense, useEffect, useState } from "react";
import { Envelope, Lock } from "@/components/icons";
import { Link, useRouter } from "@/i18n/routing";

import { AuthFormAlert } from "@/components/auth/auth-form-alert";
import { AuthSurface } from "@/components/auth/auth-surface";
import { Button } from "@/components/ui/button";
import ElevatedInput from "@/components/elevated-design/elevated-input";
import { login } from "@/lib/auth/api";
import { useAuth } from "@/contexts/auth-context";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useTranslations("auth.signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const { isAuthenticated, isLoading, refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const destination = safeRedirect(searchParams.get("redirect"));

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace(destination);
  }, [destination, isAuthenticated, isLoading, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await login(email, password);
    if (result.error) {
      // 401 is the one failure worth rewording: the API answers "invalid
      // credentials" for a wrong password and an unknown account alike, and
      // saying which would confirm to a stranger that an address is registered.
      setError(result.error.status === 401 ? t("invalidCredentials") : result.error.message);
      setPending(false);
      return;
    }
    await refreshUser();
    router.replace(destination);
  }

  return (
    <AuthSurface>
      <div className="px-5 py-6 sm:px-6">
        <h1 className="font-display text-xl font-semibold tracking-[-0.015em]">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("subtitle")}</p>
        {error ? <AuthFormAlert message={error} /> : null}
        <form onSubmit={submit} className="mt-7 space-y-5">
          <ElevatedInput
            type="email"
            label={t("email")}
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            icon={<Envelope className="size-4" />}
            autoComplete="email"
            autoFocus
            required
            disabled={pending}
          />
          <ElevatedInput
            type="password"
            label={t("password")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            icon={<Lock className="size-4" />}
            autoComplete="current-password"
            required
            disabled={pending}
          />
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? t("submitting") : t("submit")}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link href="/register" className="font-medium text-primary-ink hover:underline">
            {t("createAccount")}
          </Link>
        </p>
      </div>
    </AuthSurface>
  );
}

/** Only same-site paths are followed back after sign-in. */
function safeRedirect(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}
