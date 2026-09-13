"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { CircleNotch, EnvelopeSimple, IdentificationCard, Person } from "@/components/icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/auth-context";
import { useAuthDialog } from "@/contexts/auth-dialog-context";
import {
  getProfile,
  saveProfile,
  secondsUntil,
  startEmailSignIn,
  startPhoneVerification,
  verifyEmailSignIn,
  verifyPhone,
  type ProfileState,
  type Started,
} from "@/lib/auth/verification";
import { cn } from "@/lib/utils";

/**
 * Signing in, over the page rather than instead of it.
 *
 * Four steps, and only the first two are ever on the critical path:
 *
 *  1. EMAIL — type an address, get a code.
 *  2. CODE — six digits, and you are in.
 *  3. IDENTITY — document, legal name, date of birth. Asked only of an account
 *     that has not given them, and asked AFTER the session exists, so the
 *     person is already signed in by the time they see a document form.
 *  4. PHONE — optional, skippable, and skipping it does not block anything.
 *
 * No password anywhere. There is nothing to choose, nothing to remember,
 * nothing to reuse from another site that has been breached, and nothing for us
 * to store that is worth stealing.
 */
export function SignInDialog() {
  const { open, reason, settle } = useAuthDialog();

  // The flow is rendered only while the dialog is open, so each opening
  // MOUNTS it fresh.
  //
  // The alternative is one long-lived form that clears itself from an effect
  // when `open` flips, which sets state during an effect and shows the previous
  // attempt's half-typed address for a frame before wiping it. Letting React
  // discard the instance says the same thing with nothing stale in between.
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        settle(false);
      }}
    >
      <DialogContent className="max-w-[440px] p-0">
        {open ? <SignInFlow reason={reason} settle={settle} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SignInFlow({
  reason,
  settle,
}: {
  reason: ReturnType<typeof useAuthDialog>["reason"];
  settle: (signedIn: boolean) => void;
}) {
  const { refreshUser } = useAuth();
  const t = useTranslations("signIn");

  type Step = "email" | "code" | "identity" | "phone";
  const [step, setStep] = React.useState<Step>("email");
  const [email, setEmail] = React.useState("");
  const [challenge, setChallenge] = React.useState<Started | null>(null);

  // Signed in, and nothing left to ask: the dialog closes and whatever was
  // waiting on it carries on.
  const finish = React.useCallback(async () => {
    await refreshUser();
    settle(true);
  }, [refreshUser, settle]);

  // Signed in, but the account still owes its identity block. The session is
  // already live at this point — closing here still counts as success.
  const afterSignIn = React.useCallback(async () => {
    await refreshUser();
    const { data } = await getProfile();
    if (data?.complete) {
      settle(true);
      return;
    }
    setStep("identity");
  }, [refreshUser, settle]);

  return (
    <>
      <div className="flex flex-col items-center gap-1 px-6 pt-6 text-center">
          <span className="mb-2 grid size-11 place-items-center rounded-full bg-primary-subtle text-primary-ink">
            {step === "identity" ? (
              <IdentificationCard size={22} aria-hidden />
            ) : step === "phone" ? (
              <Person size={22} aria-hidden />
            ) : (
              <EnvelopeSimple size={22} aria-hidden />
            )}
          </span>
          <DialogTitle className="font-display text-lg font-semibold text-foreground">
            {t(`${step}.title`)}
          </DialogTitle>
          <DialogDescription className="max-w-[44ch] text-sm text-muted-foreground">
            {step === "code" ? t("code.body", { email }) : t(`${step}.body`)}
          </DialogDescription>
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
            />
          ) : step === "code" ? (
            <CodeStep
              email={email}
              challenge={challenge}
              onChallenge={setChallenge}
              onBack={() => setStep("email")}
              onVerified={afterSignIn}
            />
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
}: {
  email: string;
  onEmail: (value: string) => void;
  onStarted: (started: Started) => void;
}) {
  const t = useTranslations("signIn");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: failed } = await startEmailSignIn(email.trim());
    setBusy(false);
    if (failed || !data) {
      setError(failed?.message ?? t("errors.send"));
      return;
    }
    onStarted(data);
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Field
        id="sign-in-email"
        label={t("email.label")}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoFocus
        required
        value={email}
        onChange={onEmail}
        placeholder={t("email.placeholder")}
      />
      <Failure message={error} />
      <Primary busy={busy} disabled={email.trim() === ""}>
        {t("email.submit")}
      </Primary>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">{t("email.legal")}</p>
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
  onVerified: () => void | Promise<void>;
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
      const { data, error: failed } = await verifyEmailSignIn(challenge.challengeId, value);
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
      await onVerified();
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
            "h-12 w-11 rounded-md border text-center font-mono text-lg font-semibold text-foreground",
            "border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: failed } = await saveProfile(form);
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
      <div className="flex flex-col gap-1">
        <label htmlFor="identity-type" className="text-sm font-medium text-foreground">
          {t("identity.documentType")}
        </label>
        <select
          id="identity-type"
          value={form.documentType}
          onChange={(changeEvent) => set("documentType")(changeEvent.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="cpf">{t("identity.cpf")}</option>
          <option value="cnpj">{t("identity.cnpj")}</option>
          <option value="passport">{t("identity.passport")}</option>
        </select>
      </div>

      <Field
        id="identity-document"
        label={t("identity.document")}
        value={form.document}
        onChange={set("document")}
        inputMode={form.documentType === "passport" ? "text" : "numeric"}
        autoComplete="off"
        required
        placeholder={t("identity.documentPlaceholder")}
      />
      <Field
        id="identity-name"
        label={t("identity.legalName")}
        value={form.legalName}
        onChange={set("legalName")}
        autoComplete="name"
        required
        hint={t("identity.legalNameHint")}
      />
      <Field
        id="identity-birth"
        label={t("identity.birthDate")}
        type="date"
        value={form.birthDate}
        onChange={set("birthDate")}
        autoComplete="bday"
        required
      />

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
      setError(failed?.message ?? t("errors.send"));
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
          {/* The provider is a stub today, and saying so beats a person staring
              at a phone that will never buzz. */}
          <p className="text-center text-xs text-warning-ink">{t("phone.mockNotice")}</p>
        </>
      ) : (
        <>
          <Field
            id="phone-number"
            label={t("phone.label")}
            value={phone}
            onChange={setPhone}
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

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  type = "text",
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  type?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "type" | "value" | "onChange">) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        {...rest}
        id={id}
        type={type}
        value={value}
        onChange={(changeEvent) => onChange(changeEvent.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

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
      className="rounded-md border border-destructive-edge bg-destructive-subtle px-3 py-2 text-sm text-destructive-ink"
    >
      {message}
    </p>
  );
}
