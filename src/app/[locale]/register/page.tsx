"use client";

import { Envelope, Lock, User } from "@/components/icons";
import { Link, useRouter } from "@/i18n/routing";

import { AuthFormAlert } from "@/components/auth/auth-form-alert";
import { AuthSurface } from "@/components/auth/auth-surface";
import { Button } from "@/components/ui/button";
import ElevatedInput from "@/components/elevated-design/elevated-input";
import { register } from "@/lib/auth/api";
import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";
import { useTranslations } from "next-intl";

export default function RegisterPage() {
  const t = useTranslations("auth.signUp");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const { refreshUser } = useAuth();
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError(t("passwordMismatch"));
      return;
    }
    setPending(true);
    const result = await register(name, email, password);
    if (result.error) {
      setError(result.error.status === 409 ? t("emailTaken") : result.error.message);
      setPending(false);
      return;
    }
    await refreshUser();
    router.replace("/");
  }

  return (
    <AuthSurface>
      <div className="px-5 py-6 sm:px-6">
        <h1 className="font-display text-xl font-semibold tracking-[-0.015em]">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("subtitle")}</p>
        {error ? <AuthFormAlert message={error} /> : null}
        <form onSubmit={submit} className="mt-7 space-y-4">
          <ElevatedInput
            label={t("name")}
            placeholder={t("namePlaceholder")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            icon={<User className="size-4" />}
            autoComplete="name"
            required
            disabled={pending}
          />
          <ElevatedInput
            type="email"
            label={t("email")}
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            icon={<Envelope className="size-4" />}
            autoComplete="email"
            required
            disabled={pending}
          />
          <ElevatedInput
            type="password"
            label={t("password")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            icon={<Lock className="size-4" />}
            autoComplete="new-password"
            required
            minLength={8}
            disabled={pending}
          />
          <ElevatedInput
            type="password"
            label={t("confirmPassword")}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            icon={<Lock className="size-4" />}
            autoComplete="new-password"
            required
            minLength={8}
            disabled={pending}
          />
          <p className="text-xs leading-5 text-muted-foreground">{t("passwordHint")}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("agreementBefore")} {" "}
            <Link
              href="/terms-of-service"
              className="font-medium text-primary-ink underline underline-offset-2"
            >
              {t("terms")}
            </Link>{" "}
            {t("agreementAnd")} {" "}
            <Link
              href="/privacy-policy"
              className="font-medium text-primary-ink underline underline-offset-2"
            >
              {t("privacy")}
            </Link>
            .
          </p>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? t("submitting") : t("submit")}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {t("hasAccount")}{" "}
          <Link href="/login" className="font-medium text-primary-ink hover:underline">
            {t("signIn")}
          </Link>
        </p>
      </div>
    </AuthSurface>
  );
}
