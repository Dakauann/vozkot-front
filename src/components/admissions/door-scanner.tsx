"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  Barcode,
  Camera,
  CheckCircle,
  CircleNotch,
  Info,
  Prohibit,
  Warning,
  X,
  XCircle,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, TextField } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { formatLongDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CODE_LENGTH,
  codeLength,
  formatCode,
  getDoorCounters,
  scanAdmission,
  type ScanOutcome,
  type ScanResult,
} from "@/lib/admissions/api";

/**
 * The door.
 *
 * Designed for the scene it is actually used in, which is not a desk: one
 * hand, a phone at chest height, a dark entrance, a queue that can hear you,
 * and a person in front of you waiting to be told yes or no. Everything below
 * follows from that.
 *
 *  - THE VERDICT IS THE PAGE. It takes the top of the viewport at a size
 *    readable at arm's length, in one of four colours, with one word. A
 *    doorperson glancing down for a third of a second has to be certain, and
 *    a toast in the corner is not certainty.
 *  - THE INPUT IS ALWAYS THERE. Camera scanning is a convenience; typing is
 *    the guarantee. The field is large, monospace, auto-groups as you type and
 *    submits itself on the twelfth character, so the common path is: read the
 *    code, type it, look up. No button press, no aiming.
 *  - REFUSALS ARE NOT ERRORS. "Already used at 21:14" is an answer and is
 *    rendered as one, with the time, because that is the sentence that settles
 *    the conversation with the person holding the phone.
 *  - ONE AUTHORED MOMENT. The verdict panel arrives: a fast, exponential
 *    settle from slightly scaled-down and blurred. Nothing else animates,
 *    because everything else on this screen is either a number or a field and
 *    motion on those is noise at a door.
 *
 * Camera decoding uses the platform BarcodeDetector where it exists, which is
 * Chromium: Android Chrome and desktop Edge/Chrome. It is offered only when
 * present and never blocks the typed path, so Safari and Firefox get a screen
 * that still does the whole job. A WASM decoder would widen that and is a
 * dependency decision, not a design one.
 */

export interface DoorScannerProps {
  eventId: string;
  eventName?: string;
}

type Phase = "idle" | "checking";

export function DoorScanner({ eventId, eventName }: DoorScannerProps) {
  const t = useTranslations("door");
  const locale = useLocale() as Locale;

  const [typed, setTyped] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [result, setResult] = React.useState<ScanResult | null>(null);
  const [counters, setCounters] = React.useState<{ remaining: number; admittedCount: number } | null>(null);
  const [scanNonce, setScanNonce] = React.useState(0);
  // A transport failure is not a refused code and gets its own state, so the
  // verdict panel can say "no connection" instead of "invalid".
  const [transportError, setTransportError] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // The counters are loaded once and then kept fresh by the scans themselves:
  // every scan answers with them, so a door that is being worked never needs
  // to poll. The initial read is the only request that exists to draw a number.
  React.useEffect(() => {
    let live = true;
    getDoorCounters(eventId).then((response) => {
      if (live && response.data) setCounters(response.data.data);
    });
    return () => {
      live = false;
    };
  }, [eventId]);

  const submit = React.useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (code === "" || phase === "checking") return;

      setPhase("checking");
      const response = await scanAdmission(eventId, code);
      setPhase("idle");

      if (!response.data) {
        // A transport or authorisation failure, which is a different thing
        // from a refused code and must not be dressed as one.
        setResult(null);
        setTransportError(true);
        setScanNonce((nonce) => nonce + 1);
        window.setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }

      const verdict = response.data.data;
      setTransportError(false);
      setResult(verdict);
      setCounters({
        remaining: verdict.remaining,
        admittedCount: verdict.admittedCount,
      });
      setScanNonce((nonce) => nonce + 1);
      setTyped("");
      // Straight back to the field: the next person is already stepping up.
      window.setTimeout(() => inputRef.current?.focus(), 0);
    },
    [eventId, phase],
  );

  // Auto-submit on the last character. The code is a fixed twelve, so there is
  // nothing to confirm: waiting for a button press would add a tap to every
  // single entry.
  const onType = (value: string) => {
    const formatted = formatCode(value);
    setTyped(formatted);
    if (codeLength(formatted) === CODE_LENGTH) void submit(formatted);
  };

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-4">
      <Verdict
        result={result}
        phase={phase}
        transportError={transportError}
        nonce={scanNonce}
        locale={locale}
      />

      <div className="rounded-[--radius] border border-border bg-card p-4">
        {/* The app's own field primitive, so the label, the hint and the
            control's chrome are the ones every other form here uses. Only the
            type is overridden, because a code read aloud across a loud doorway
            has to be legible at arm's length. */}
        <Field id="door-code" label={t("codeLabel")} hint={t("codeHint")}>
          <div className="relative">
            <TextField
              ref={inputRef}
              id="door-code"
              value={typed}
              onChange={(event) => onType(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submit(typed);
                }
              }}
              // A door is not a form: focus lands here on load and returns
              // after every scan.
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              enterKeyHint="go"
              placeholder={t("codePlaceholder")}
              // Field renders the hint as `${id}-hint` but does not wire it to
              // the control, so the link is made here.
              aria-describedby="door-code-hint"
              className="h-14 pr-16 font-mono text-[1.5rem] font-bold uppercase tracking-[0.12em] placeholder:font-normal placeholder:tracking-[0.08em]"
            />
            {/* Inside the control, so the hint keeps the full line under it. */}
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs tabular-nums text-muted-foreground">
              {codeLength(typed)}/{CODE_LENGTH}
            </span>
          </div>
        </Field>

        <CameraScanner onCode={(code) => void submit(code)} busy={phase === "checking"} />
      </div>

      <Counters counters={counters} eventName={eventName} />
    </div>
  );
}

/**
 * Whether this browser can open a camera at all.
 *
 * Only that. Decoding is handled either way: the platform BarcodeDetector
 * where it exists, and a bundled decoder where it does not. An earlier version
 * of this gated the whole feature on BarcodeDetector, which is Chromium-only
 * and, importantly, is NOT present in desktop Chrome on Windows. The result
 * was a doorperson with a working webcam being told their browser could not
 * scan, which is the kind of "correct" message that reads as broken software.
 *
 * Read as a function, never a module constant, so it is not evaluated during
 * server rendering.
 */
function cameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    // getUserMedia is only exposed on a secure origin. Saying so is more
    // useful than a permission prompt that never appears.
    (typeof window === "undefined" || window.isSecureContext !== false)
  );
}

/**
 * A frame decoder, native where the platform has one.
 *
 * Two implementations behind one signature:
 *
 *  - BarcodeDetector, where it exists. It runs off the main thread in the
 *    browser's own code, so it is both faster and cheaper on battery than
 *    anything shipped in a bundle.
 *  - jsQR otherwise, which covers Safari, Firefox and desktop Chrome on
 *    Windows. It is imported DYNAMICALLY so its ~40KB only reaches the browsers
 *    that need it, and only when a doorperson actually opens the camera.
 *
 * The bundled path draws the frame to a canvas first, because a pure-JS
 * decoder needs pixels and a <video> element does not hand them over.
 */
type FrameDecoder = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement | null,
) => Promise<string | null>;

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}

async function buildDecoder(): Promise<FrameDecoder> {
  const native = (window as unknown as {
    BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
  }).BarcodeDetector;

  if (native) {
    const detector = new native({ formats: ["qr_code"] });
    return async (video) => {
      const found = await detector.detect(video);
      return found[0]?.rawValue?.trim() ?? null;
    };
  }

  const { default: jsQR } = await import("jsqr");
  return async (video, canvas) => {
    if (!canvas || video.readyState < 2) return null;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) return null;

    // Decode at a bounded width. A 1280px frame is four times the pixels of a
    // 640px one for no gain: the symbol only has to be a few pixels per
    // module, and the smaller buffer is what keeps this at a usable frame rate
    // on the phone a doorperson actually has.
    const scale = Math.min(1, 640 / width);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);

    // dontInvert: a ticket is always dark-on-light, on paper and on a screen.
    // Trying the inverse doubles the work per frame for a case that does not
    // occur here.
    const found = jsQR(frame.data, frame.width, frame.height, {
      inversionAttempts: "dontInvert",
    });
    return found?.data?.trim() ?? null;
  };
}

/** The four tones a door needs, and which outcome earns each. */
const TONES: Record<ScanOutcome, "pass" | "duplicate" | "elsewhere" | "fail"> = {
  admitted: "pass",
  already_admitted: "duplicate",
  wrong_event: "elsewhere",
  void: "fail",
  not_paid: "fail",
  unknown: "fail",
  malformed: "fail",
};

function Verdict({
  result,
  phase,
  transportError,
  nonce,
  locale,
}: {
  result: ScanResult | null;
  phase: Phase;
  transportError: boolean;
  nonce: number;
  locale: Locale;
}) {
  const t = useTranslations("door");

  if (phase === "checking") {
    return (
      <Panel tone="idle">
        <CircleNotch className="size-7 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="font-display text-xl font-semibold text-foreground">{t("checking")}</p>
      </Panel>
    );
  }

  if (transportError) {
    return (
      <Panel tone="fail" role="alert">
        <Warning className="size-8" aria-hidden="true" />
        <p className="font-display text-2xl font-bold">{t("transportError")}</p>
        <p className="text-sm opacity-90">{t("transportErrorHint")}</p>
      </Panel>
    );
  }

  if (!result) {
    return (
      <Panel tone="idle">
        <Barcode className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="font-display text-xl font-semibold text-foreground">{t("ready")}</p>
        <p className="max-w-[40ch] text-sm text-muted-foreground">{t("readyHint")}</p>
      </Panel>
    );
  }

  const tone = TONES[result.outcome];
  const Glyph =
    tone === "pass" ? CheckCircle : tone === "duplicate" ? Warning : tone === "elsewhere" ? Info : XCircle;

  return (
    // The key remounts the panel per scan, which is what makes the entrance
    // play again on two identical verdicts in a row. Without it the second
    // "admitted" would appear without motion and read as a stale screen.
    <Panel key={nonce} tone={tone} role="status" animate>
      <Glyph className="size-9" aria-hidden="true" />
      <p className="font-display text-[2rem] font-bold leading-none tracking-[-0.02em]">
        {t(`outcome.${result.outcome}`)}
      </p>

      {/* The seat, and it goes ABOVE the tier on purpose.
          Somebody has just been told they may come in and the very next thing
          they ask is where to sit. At a loud doorway the usher reads this out,
          so it is the largest thing on the panel after the verdict itself. */}
      {result.seat ? (
        <p className="font-display text-xl font-bold leading-tight tracking-[-0.01em]">
          {result.seat.label}
        </p>
      ) : null}

      {result.ticketTitle ? (
        <p className="text-base font-semibold opacity-95">
          {result.ticketTitle}
          {result.sequence ? <span className="opacity-75"> · #{result.sequence}</span> : null}
        </p>
      ) : null}

      {result.outcome === "already_admitted" && result.admittedAt ? (
        <p className="text-sm font-medium opacity-95">
          {t("usedAt", { when: formatLongDateTime(result.admittedAt, locale) })}
        </p>
      ) : null}

      {result.orderReference ? (
        <p className="font-mono text-xs tracking-[0.08em] opacity-80">{result.orderReference}</p>
      ) : null}
    </Panel>
  );
}

/**
 * The verdict surface.
 *
 * Solid colour rather than a tinted card: this is read in a dark doorway at
 * arm's length, and a subtle background with coloured text is the version that
 * gets misread. Foregrounds are the paired `-foreground` tokens, so the
 * contrast is the one the theme already guarantees.
 */
function Panel({
  tone,
  children,
  role,
  animate,
}: {
  tone: "idle" | "pass" | "duplicate" | "elsewhere" | "fail";
  children: React.ReactNode;
  role?: "status" | "alert";
  animate?: boolean;
}) {
  const surface = {
    idle: "bg-card text-foreground border-border",
    pass: "bg-healthy text-healthy-foreground border-transparent",
    duplicate: "bg-warning text-warning-foreground border-transparent",
    elsewhere: "bg-info text-info-foreground border-transparent",
    fail: "bg-destructive text-destructive-foreground border-transparent",
  }[tone];

  return (
    <div
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      className={cn(
        "flex min-h-[184px] flex-col items-center justify-center gap-2 rounded-[--radius] border px-5 py-7 text-center",
        "shadow-[0_2px_4px_rgba(20,23,26,0.06),0_18px_40px_-24px_rgba(20,23,26,0.35)]",
        surface,
        animate && "vk-verdict",
      )}
    >
      {children}
    </div>
  );
}

/**
 * Camera scanning, where the platform can do it.
 *
 * Offered only when BarcodeDetector exists, because a button that opens a
 * camera and then cannot read anything is worse than no button. The stream is
 * stopped on unmount and whenever the panel closes: a door screen left open in
 * a pocket must not hold the camera.
 */
function CameraScanner({
  onCode,
  busy,
}: {
  onCode: (code: string) => void;
  busy: boolean;
}) {
  const t = useTranslations("door");
  // Read once, lazily, rather than set from an effect: the answer cannot
  // change during the session, and a render that starts as "unsupported" and
  // corrects itself flashes the fallback text at a doorperson.
  const [supported] = React.useState(cameraSupported);
  const [open, setOpen] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  React.useEffect(() => stop, [stop]);

  React.useEffect(() => {
    if (!open) {
      stop();
      return;
    }

    let live = true;
    let frame = 0;

    const run = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // The back camera, and a resolution high enough to resolve a small
          // symbol on a bright phone screen without asking for 4K.
          video: { facingMode: "environment", width: { ideal: 1280 } },
        });
        if (!live) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const decode = await buildDecoder();

        const tick = async () => {
          if (!live || !videoRef.current) return;
          try {
            const value = await decode(videoRef.current, canvasRef.current);
            if (value) {
              // Close first: the verdict is the thing to look at, and a live
              // camera behind it is a distraction at a door.
              setOpen(false);
              onCode(value);
              return;
            }
          } catch {
            // A frame that cannot be decoded is the normal case while aiming.
          }
          // ~7 frames a second. Fast enough that aiming feels immediate, slow
          // enough that a mid-range phone does not heat up and throttle
          // halfway through a queue.
          frame = window.setTimeout(() => void tick(), 140);
        };
        void tick();
      } catch {
        if (live) {
          setFailed(true);
          setOpen(false);
        }
      }
    };

    void run();
    return () => {
      live = false;
      window.clearTimeout(frame);
      stop();
    };
  }, [open, onCode, stop]);

  if (!supported) {
    return (
      <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
        {t("cameraNoDevice")}
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      {open ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-[--radius] bg-foreground/90">
            <video
              ref={videoRef}
              muted
              playsInline
              className="block aspect-[4/3] w-full object-cover"
            />
            {/* Where the bundled decoder reads its pixels. Never shown. */}
            <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
            {/* An aiming frame, not a decoration: it tells the doorperson where
                to put the phone in front of them. */}
            <div
              className="pointer-events-none absolute inset-0 grid place-items-center"
              aria-hidden="true"
            >
              <div className="size-[58%] rounded-[--radius] border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setOpen(false)}
            className="w-full gap-1.5"
          >
            <X className="size-4" aria-hidden="true" />
            {t("cameraClose")}
          </Button>
        </div>
      ) : (
        <>
          {/* Taller than the scale's tallest, and only here: this is the one
              control a doorperson hits one-handed, in the dark, with a queue
              waiting. */}
          <Button
            type="button"
            size="lg"
            disabled={busy}
            onClick={() => {
              setFailed(false);
              setOpen(true);
            }}
            className="h-12 w-full gap-2"
          >
            <Camera className="size-4" aria-hidden="true" />
            {t("cameraOpen")}
          </Button>
          {failed ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-destructive-ink">
              <Prohibit className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {t("cameraDenied")}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Counters({
  counters,
  eventName,
}: {
  counters: { remaining: number; admittedCount: number } | null;
  eventName?: string;
}) {
  const t = useTranslations("door");
  const locale = useLocale();

  const format = (value: number) => new Intl.NumberFormat(locale).format(value);
  const total = counters ? counters.admittedCount + counters.remaining : 0;
  const share = total > 0 && counters ? Math.round((counters.admittedCount / total) * 100) : 0;

  return (
    <div className="rounded-[--radius] border border-border bg-card px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">
          {eventName ?? t("countersTitle")}
        </p>
        <p className="shrink-0 text-xs text-muted-foreground">
          {counters ? t("countersShare", { share }) : "-"}
        </p>
      </div>
      <div className="mt-2 flex items-baseline gap-5">
        <p className="font-display text-2xl font-bold tabular-nums text-foreground">
          {counters ? format(counters.admittedCount) : "-"}
          <span className="ml-1.5 text-xs font-medium text-muted-foreground">{t("in")}</span>
        </p>
        <p className="font-display text-2xl font-bold tabular-nums text-muted-foreground">
          {counters ? format(counters.remaining) : "-"}
          <span className="ml-1.5 text-xs font-medium text-muted-foreground">{t("left")}</span>
        </p>
      </div>
      {/* A single bar, because "how full is the room" is the one question the
          numbers above do not answer at a glance. */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${share}%` }}
        />
      </div>
    </div>
  );
}
