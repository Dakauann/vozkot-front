"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import {
  CircleNotch,
  EnvelopeSimple,
  IdentificationCard,
  LockIcon,
  Person,
  Phone,
} from "@/components/icons";
import { Link } from "@/i18n/routing";
import { AudienceFields, emptyAudience, type AudienceValue } from "@/components/auth/audience-fields";
import { Field, SelectField } from "@/components/ui/field";
import ElevatedInput from "@/components/elevated-design/elevated-input";
import { useAuth } from "@/contexts/auth-context";
import type { AuthReason } from "@/contexts/auth-dialog-context";
import {
  getProfile,
  saveProfile,
  secondsUntil,
  startEmailSignIn,
  setPassword,
  signInWithPassword,
  startPhoneVerification,
  verifyEmailSignIn,
  verifyPhone,
  type ProfileState,
  type Started,
} from "@/lib/auth/verification";
import { cn } from "@/lib/utils";

/**
 * Getting into an account. The ONLY way into one.
 *
 * Five steps, and only the first two are ever on the critical path:
 *
 *  1. EMAIL; type an address, get a code. A password field is offered here
 *     too, for accounts that later chose one.
 *  2. CODE; six digits, and you are in.
 *  3. PASSWORD; offered, never demanded, and only to an account that has just
 *     been created.
 *  4. IDENTITY: document, legal name, date of birth. Asked AFTER the session
 *     exists, so nobody meets a document form before they are signed in.
 *  5. PHONE: optional, skippable, and skipping it blocks nothing.
 *
 * THERE IS NO SEPARATE "REGISTER". Step 2 creates the account when the address
 * has none and signs in when it has one, which is one call at the API too. It
 * is not a shortcut: splitting them would mean answering "is this address
 * registered?" before a code is ever sent, and that answer is an enumeration
 * oracle, for a ticketing site, a way to ask who went where.
 *
 * There USED to be a second door: a /register page that took a name, an email
 * and a password and made a working account out of them, with no code and no
 * proof the address belonged to whoever typed it. That is why it is gone. An
 * attacker could claim somebody else's address, and when the real owner later
 * signed in by code the lookup FOUND the squatter's account and put them in
 * it, with the attacker's password still on it, and the victim's orders and
 * identity block now inside it. Every route into an account now passes through
 * a code.
 *
 * Registering does not ask for a password, and that ordering is the point. A
 * password chosen before an address is proven is a password attached to a
 * mailbox nobody has demonstrated they can read; asked afterwards, it is a
 * SECOND way in for somebody who already has one. Nielsen Norman's guidance on
 * passwordless accounts says exactly this, offer the password after the
 * account exists, for the people who want it.
 *
 * It is offered at all because email delivery fails. A provider has an outage,
 * a filter eats the message, somebody is on a plane. An account whose only key
 * arrives by email is unreachable precisely when its owner most wants in.
 */

/**
 * The heading elements the surrounding surface wants used.
 *
 * The flow runs in two places and they owe their headings to different things:
 * inside the dialog Radix needs its own DialogTitle to point aria-labelledby
 * at, and on the sign-in page the heading owes the document an h1. Injecting
 * the pair is what lets one step machine serve both without either surface
 * borrowing the other's semantics.
 */
export interface SignInChrome {
  Title: React.ComponentType<{ className?: string; children: React.ReactNode }>;
  Description: React.ComponentType<{ className?: string; children: React.ReactNode }>;
}

export interface SignInFlowProps {
  reason: AuthReason;
  /** Called once there is a session and nothing is left to ask, or on giving up. */
  settle: (signedIn: boolean) => void;
  chrome: SignInChrome;
}

export function SignInFlow({ reason, settle, chrome }: SignInFlowProps) {
  const { Title, Description } = chrome;
  const { refreshUser } = useAuth();
  const t = useTranslations("signIn");

  type Step = "email" | "code" | "password" | "identity" | "phone";
  const [step, setStep] = React.useState<Step>("email");
  const [email, setEmail] = React.useState("");
  const [challenge, setChallenge] = React.useState<Started | null>(null);

  // Signed in, and nothing left to ask: the dialog closes and whatever was
  // waiting on it carries on.
  const finish = React.useCallback(async () => {
    await refreshUser();
    settle(true);
  }, [refreshUser, settle]);

  // Signed in. What is left to ask depends on whether this code just MADE the
  // account: a new one is offered a password, an existing one is not asked
  // again. Either way the session is live from here, so closing the dialog at
  // any later step still counts as success.
  const afterSignIn = React.useCallback(
    async (created: boolean) => {
      await refreshUser();
      if (created) {
        setStep("password");
        return;
      }
      const { data } = await getProfile();
      if (data?.complete) {
        settle(true);
        return;
      }
      setStep("identity");
    },
    [refreshUser, settle],
  );

  // Past the password step: ask for the identity block if it is still owed.
  const afterPassword = React.useCallback(async () => {
    const { data } = await getProfile();
    if (data?.complete) {
      settle(true);
      return;
    }
    setStep("identity");
  }, [settle]);

  return (
    <>
      <div className="flex flex-col items-center gap-1 px-6 pt-6 text-center">
          <span className="plate plate-brand mb-2 size-11">
            {step === "identity" ? (
              <IdentificationCard size={22} aria-hidden />
            ) : step === "phone" ? (
              <Person size={22} aria-hidden />
            ) : step === "password" ? (
              <LockIcon size={22} aria-hidden />
            ) : (
              <EnvelopeSimple size={22} aria-hidden />
            )}
          </span>
          <Title className="font-display text-lg font-semibold text-foreground">
            {t(`${step}.title`)}
          </Title>
          <Description className="max-w-[44ch] text-sm text-muted-foreground">
            {step === "code" ? t("code.body", { email }) : t(`${step}.body`)}
          </Description>
        {reason !== "generic" && step === "email" ? (
          <p className="mt-1 text-xs text-muted-foreground">{t(`reason.${reason}`)}</p>
        ) : null}
      </div>

      <div className="px-6 pb-6 pt-5">
          {step === "email" ? (
            <EmailStep
              email={email}
              onEmail={setEmail}
              onStarted={(started) => {
                setChallenge(started);
                setStep("code");
              }}
              onSignedIn={() => afterSignIn(false)}
            />
          ) : step === "code" ? (
            <CodeStep
              email={email}
              challenge={challenge}
              onChallenge={setChallenge}
              onBack={() => setStep("email")}
              onVerified={afterSignIn}
            />
          ) : step === "password" ? (
            <PasswordStep onDone={afterPassword} />
          ) : step === "identity" ? (
            <IdentityStep onSaved={() => setStep("phone")} />
        ) : (
          <PhoneStep onDone={finish} />
        )}
      </div>
    </>
  );
}

function EmailStep({
  email,
  onEmail,
  onStarted,
  onSignedIn,
}: {
  email: string;
  onEmail: (value: string) => void;
  onStarted: (started: Started) => void;
  /** The password route signs in directly, with no code in between. */
  onSignedIn: () => void | Promise<void>;
}) {
  const t = useTranslations("signIn");
  const tCommon = useTranslations("common");
  const [mode, setMode] = React.useState<"code" | "password">("code");
  const [password, setPasswordValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: failed } = await startEmailSignIn(email.trim());
    setBusy(false);
    if (failed || !data) {
      setError(
        failed?.code === "delivery_unavailable"
          ? t("errors.unavailable")
          : (failed?.message ?? t("errors.send")),
      );
      return;
    }
    onStarted(data);
  };

  const withPassword = async () => {
    setBusy(true);
    setError(null);
    const { error: failed } = await signInWithPassword(email.trim(), password);
    setBusy(false);
    if (failed) {
      // One message for a wrong password and for an address with no account.
      // Distinguishing them would answer "does this person have an account
      // here", which for a ticketing site is a question about who went where.
      setError(t("errors.credentials"));
      return;
    }
    await onSignedIn();
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={mode === "code" ? submit : (submitEvent) => {
        submitEvent.preventDefault();
        void withPassword();
      }}
    >
      <ElevatedInput
        id="sign-in-email"
        label={t("email.label")}
        icon={<EnvelopeSimple size={18} aria-hidden />}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoFocus
        required
        value={email}
        onChange={(changeEvent) => onEmail(changeEvent.target.value)}
        placeholder={t("email.placeholder")}
      />

      {mode === "password" ? (
        <ElevatedInput
          id="sign-in-password"
          label={t("email.password")}
          icon={<LockIcon size={18} aria-hidden />}
          type="password"
          revealLabel={tCommon("showPassword")}
          hideRevealLabel={tCommon("hidePassword")}
          autoComplete="current-password"
          required
          value={password}
          onChange={(changeEvent) => setPasswordValue(changeEvent.target.value)}
        />
      ) : null}

      <Failure message={error} />
      <Primary busy={busy} disabled={email.trim() === "" || (mode === "password" && password === "")}>
        {mode === "code" ? t("email.submit") : t("email.submitPassword")}
      </Primary>

      {/* The second way in, offered as an alternative rather than as the
          default. Nothing here reveals whether the address HAS a password;
          the option is shown to everybody, and choosing it just fails
          generically for an account that has none. */}
      <button
        type="button"
        onClick={() => {
          setMode(mode === "code" ? "password" : "code");
          setError(null);
        }}
        className="rounded-[--radius] text-center text-sm font-medium text-primary-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {mode === "code" ? t("email.usePassword") : t("email.useCode")}
      </button>

      <LegalNote />
    </form>
  );
}

/**
 * What we are about to do with their details, said where they are asked for.
 *
 * Both documents are real links rather than a sentence naming them: a policy
 * that cannot be opened from the screen that invokes it is a policy nobody has
 * read, and consent to a document somebody could not reach is not consent.
 */
function LegalNote() {
  const t = useTranslations("signIn");
  return (
    <div className="mt-1 border-t border-border pt-3">
      <p className="text-xs leading-relaxed text-muted-foreground">{t("email.legal")}</p>
      <p className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        <Link
          href="/terms-of-service"
          target="_blank"
          className="rounded-[--radius] font-medium text-primary-ink underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("email.terms")}
        </Link>
        <Link
          href="/privacy-policy"
          target="_blank"
          className="rounded-[--radius] font-medium text-primary-ink underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("email.privacy")}
        </Link>
      </p>
    </div>
  );
}

/**
 * Offering a password, once the account exists.
 *
 * Skippable, and the skip is a real button rather than a corner X: an optional
 * step that looks mandatory is one people abandon the whole flow at.
 */
function PasswordStep({ onDone }: { onDone: () => void | Promise<void> }) {
  const t = useTranslations("signIn");
  const tCommon = useTranslations("common");
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    setBusy(true);
    setError(null);
    const { error: failed } = await setPassword({ next: value });
    setBusy(false);
    if (failed) {
      setError(
        failed.code === "weak_password" ? t("password.weak") : (failed.message ?? t("errors.profile")),
      );
      return;
    }
    await onDone();
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <ElevatedInput
        id="new-password"
        label={t("password.label")}
        icon={<LockIcon size={18} aria-hidden />}
        type="password"
        revealLabel={tCommon("showPassword")}
        hideRevealLabel={tCommon("hidePassword")}
        autoComplete="new-password"
        required
        value={value}
        onChange={(changeEvent) => setValue(changeEvent.target.value)}
        hint={t("password.rule")}
      />
      <Failure message={error} />
      <Primary busy={busy} disabled={value === ""}>
        {t("password.submit")}
      </Primary>
      <button
        type="button"
        onClick={() => void onDone()}
        className="rounded-[--radius] text-center text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("password.skip")}
      </button>
    </form>
  );
}

function CodeStep({
  email,
  challenge,
  onChallenge,
  onBack,
  onVerified,
}: {
  email: string;
  challenge: Started | null;
  onChallenge: (started: Started) => void;
  onBack: () => void;
  /** created is true when this code MADE the account rather than found it. */
  onVerified: (created: boolean) => void | Promise<void>;
}) {
  const t = useTranslations("signIn");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resendIn, setResendIn] = React.useState(() => secondsUntil(challenge?.resendAt));

  // The resend countdown. Driven off the server's own timestamp rather than a
  // local guess, so the button does not become available a moment before the
  // API is willing to honour it.
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setResendIn(secondsUntil(challenge?.resendAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [challenge?.resendAt]);

  const submit = React.useCallback(
    async (value: string) => {
      if (!challenge) return;
      setBusy(true);
      setError(null);
      const { data, error: failed, status } = await verifyEmailSignIn(challenge.challengeId, value);
      setBusy(false);
      if (failed || !data) {
        setError(failed?.message ?? t("errors.code"));
        // A spent or expired challenge cannot be answered again, whatever is
        // typed next. Sending the person back to the address field is the only
        // thing that can actually help.
        if (failed?.code === "code_expired" || failed?.code === "too_many_attempts") {
          setCode("");
        }
        return;
      }
      // 201 means the account did not exist a moment ago.
      await onVerified(status === 201);
    },
    [challenge, onVerified, t],
  );

  const resend = async () => {
    setBusy(true);
    setError(null);
    const { data, error: failed } = await startEmailSignIn(email);
    setBusy(false);
    if (failed || !data) {
      setError(failed?.message ?? t("errors.send"));
      return;
    }
    onChallenge(data);
    setCode("");
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(submitEvent) => {
        submitEvent.preventDefault();
        void submit(code);
      }}
    >
      <CodeInput
        value={code}
        onChange={(next) => {
          setCode(next);
          // Submitted the moment six digits exist. Asking someone to type a
          // code and then press a button is one action too many, and every
          // bank app has already taught the shorter version.
          if (next.length === 6) void submit(next);
        }}
        disabled={busy}
      />
      <Failure message={error} />

      <div className="flex items-center justify-between gap-3 text-sm">
        <button
          type="button"
          onClick={onBack}
          className="rounded-[--radius] text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("code.changeEmail")}
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={resendIn > 0 || busy}
          className="rounded-[--radius] font-medium text-primary-ink underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {resendIn > 0 ? t("code.resendIn", { seconds: resendIn }) : t("code.resend")}
        </button>
      </div>

      {busy ? (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
          <CircleNotch className="size-4 animate-spin" aria-hidden />
          {t("code.checking")}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Six boxes that behave like one field.
 *
 * A single input with letter-spacing is simpler and is wrong on a phone: the
 * caret lands between characters, selection is fiddly, and paste from an SMS
 * fills it in a way the person cannot then correct. Six boxes with one shared
 * value gets the autofill and the paste behaviour people expect, and
 * `inputMode="numeric"` gets them the number pad.
 *
 * It is the one control in this dialog that is not an ElevatedInput, because
 * that component's whole mechanism is a label floating out of the value slot
 * and a single digit has no room for one. It borrows the SURFACE instead:
 * the same card fill, the same 3:1 control edge, the same brand underline on
 * focus, so six boxes and the address field above them read as one family.
 */
function CodeInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const t = useTranslations("signIn");
  const inputs = React.useRef<(HTMLInputElement | null)[]>([]);

  const set = (index: number, raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits === "") {
      onChange(value.slice(0, index) + value.slice(index + 1));
      return;
    }
    // A paste lands in whichever box was focused and fills from there, which is
    // what the browser hands us and what somebody pasting expects.
    const next = (value.slice(0, index) + digits + value.slice(index + digits.length)).slice(0, 6);
    onChange(next);
    inputs.current[Math.min(index + digits.length, 5)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2" role="group" aria-label={t("code.label")}>
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <input
          key={index}
          ref={(node) => {
            inputs.current[index] = node;
          }}
          type="text"
          inputMode="numeric"
          // One-time-code autofill: iOS and Android offer the code from the
          // message without the person leaving the screen.
          autoComplete="one-time-code"
          maxLength={6}
          disabled={disabled}
          autoFocus={index === 0}
          aria-label={t("code.digit", { position: index + 1 })}
          value={value[index] ?? ""}
          onChange={(changeEvent) => set(index, changeEvent.target.value)}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === "Backspace" && !value[index] && index > 0) {
              inputs.current[index - 1]?.focus();
            }
          }}
          className={cn(
            "h-12 w-11 rounded-[--radius] border text-center font-mono text-lg font-semibold text-foreground",
            "border-control-edge bg-card dark:bg-muted",
            "transition-[border-color,box-shadow] duration-150 ease-out",
            "hover:border-[hsl(var(--muted-foreground)/0.5)]",
            "focus-visible:outline-none focus-visible:shadow-[inset_0_-2px_0_0_hsl(var(--primary-edge))]",
            "focus-visible:ring-2 focus-visible:ring-primary/15",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        />
      ))}
    </div>
  );
}

function IdentityStep({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations("signIn");
  const [form, setForm] = React.useState({
    documentType: "cpf",
    document: "",
    legalName: "",
    birthDate: "",
  });
  // Kept beside the identity block rather than inside it, because the two are
  // governed by different rules: the block above is required by law and gates
  // the purchase, this is volunteered and gates nothing.
  const [audience, setAudience] = React.useState<AudienceValue>(emptyAudience);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: failed } = await saveProfile({ ...form, ...audience });
    setBusy(false);
    if (failed || !data) {
      setError(failed?.message ?? t("errors.profile"));
      return;
    }
    onSaved();
  };

  const complete =
    form.document.trim() !== "" && form.legalName.trim() !== "" && form.birthDate !== "";

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      {/* The one control here that is not an input. Its label sits above
          rather than floating; a select is never empty, so there is nothing
          for a label to float out of, and it is sized to the fields beside
          it so the column does not step. */}
      <Field id="identity-type" label={t("identity.documentType")}>
        <SelectField
          id="identity-type"
          value={form.documentType}
          onChange={(changeEvent) => set("documentType")(changeEvent.target.value)}
          className="h-11"
        >
          <option value="cpf">{t("identity.cpf")}</option>
          <option value="cnpj">{t("identity.cnpj")}</option>
          <option value="passport">{t("identity.passport")}</option>
        </SelectField>
      </Field>

      <ElevatedInput
        id="identity-document"
        label={t("identity.document")}
        icon={<IdentificationCard size={18} aria-hidden />}
        value={form.document}
        onChange={(changeEvent) => set("document")(changeEvent.target.value)}
        inputMode={form.documentType === "passport" ? "text" : "numeric"}
        autoComplete="off"
        required
        placeholder={t("identity.documentPlaceholder")}
      />
      <ElevatedInput
        id="identity-name"
        label={t("identity.legalName")}
        icon={<Person size={18} aria-hidden />}
        value={form.legalName}
        onChange={(changeEvent) => set("legalName")(changeEvent.target.value)}
        autoComplete="name"
        required
        hint={t("identity.legalNameHint")}
      />
      <ElevatedInput
        id="identity-birth"
        label={t("identity.birthDate")}
        type="date"
        value={form.birthDate}
        onChange={(changeEvent) => set("birthDate")(changeEvent.target.value)}
        autoComplete="bday"
        required
      />

      <div className="border-t border-border pt-3">
        <AudienceFields value={audience} onChange={setAudience} idPrefix="identity" />
      </div>

      <Failure message={error} />
      <Primary busy={busy} disabled={!complete}>
        {t("identity.submit")}
      </Primary>
      {/* Said where the data is asked for, not buried in a policy page. */}
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {t("identity.privacy")}
      </p>
    </form>
  );
}

function PhoneStep({ onDone }: { onDone: () => void | Promise<void> }) {
  const t = useTranslations("signIn");
  const [phone, setPhone] = React.useState("");
  const [challenge, setChallenge] = React.useState<Started | null>(null);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [state, setState] = React.useState<ProfileState | null>(null);

  const start = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: failed } = await startPhoneVerification(phone);
    setBusy(false);
    if (failed || !data) {
      // 503 means no SMS provider is wired. That is not a retry the person can
      // win, so it is named rather than shown as a generic failure, and the
      // step is skippable anyway.
      setError(
        failed?.code === "delivery_unavailable"
          ? t("phone.unavailable")
          : (failed?.message ?? t("errors.send")),
      );
      return;
    }
    setChallenge(data);
  };

  const confirm = async (value: string) => {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    const { data, error: failed } = await verifyPhone(challenge.challengeId, value);
    setBusy(false);
    if (failed || !data) {
      setError(failed?.message ?? t("errors.code"));
      return;
    }
    setState(data);
    await onDone();
  };

  if (state?.phoneVerified) return null;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={challenge ? (submitEvent) => submitEvent.preventDefault() : start}
    >
      {challenge ? (
        <>
          <CodeInput
            value={code}
            onChange={(next) => {
              setCode(next);
              if (next.length === 6) void confirm(next);
            }}
            disabled={busy}
          />

        </>
      ) : (
        <>
          <ElevatedInput
            id="phone-number"
            label={t("phone.label")}
            icon={<Phone size={18} aria-hidden />}
            value={phone}
            onChange={(changeEvent) => setPhone(changeEvent.target.value)}
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="(84) 99440-9624"
          />
          <Primary busy={busy} disabled={phone.trim() === ""}>
            {t("phone.submit")}
          </Primary>
        </>
      )}

      <Failure message={error} />
      {/* Skippable, and skipping costs nothing: a phone is useful, not
          required, and a step that blocks a purchase over it would be a step
          that loses the purchase. */}
      <button
        type="button"
        onClick={() => void onDone()}
        className="rounded-[--radius] text-center text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("phone.skip")}
      </button>
    </form>
  );
}

// --- small shared pieces ----------------------------------------------------

function Primary({
  children,
  busy,
  disabled,
}: {
  children: React.ReactNode;
  busy: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow-[var(--elev-button-primary)] hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {busy ? <CircleNotch className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

function Failure({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="notice notice-fault notice-ink px-3 py-2 text-sm"
    >
      {message}
    </p>
  );
}
