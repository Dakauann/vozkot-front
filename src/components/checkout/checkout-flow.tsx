"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Link } from "@/i18n/routing";
import type { Locale } from "@/i18n/config";
import { formatLongDateTime, formatMoney } from "@/lib/format";
import { EventImage } from "@/components/events/event-image";
import type { EventMedia } from "@/lib/events/types";
import {
  confirmOrder,
  getOrder,
  newIdempotencyKey,
  reserveCheckout,
  type Order,
} from "@/lib/checkout/api";
import { readIntent, type CheckoutIntent } from "@/lib/checkout/intent";
import { OpenHolds } from "@/components/checkout/open-holds";
import { TextAreaField } from "@/components/ui/field";
import ElevatedInput from "@/components/elevated-design/elevated-input";
import { EnvelopeSimple, IdentificationCard, Person } from "@/components/icons";
import { useAuthDialog } from "@/contexts/auth-dialog-context";

/**
 * Checkout.
 *
 * Four states, and the FIRST one is where most ticketing sites get it wrong:
 *
 *  1. RESERVING. The tickets come off the shelf the moment this page opens,
 *     before the buyer has typed anything. Reserving on submit instead means
 *     every buyer fills in a name, an email and a CPF against stock anyone can
 *     still take, and learns at the last keystroke that it is gone. Sympla and
 *     Eventbrite both hold at this point; so do we.
 *  2. A form, against tickets that are already held, with the clock visible.
 *  3. The order is CONFIRMED and waiting for a PIX code. The charge is created
 *     by a durable job, so the code appears a second or two later; the page
 *     polls for it and says so rather than pretending to hang.
 *  4. The code is here, with a live countdown to the moment the hold lapses.
 *
 * That countdown is deliberate. Neither Sympla nor Eventbrite shows one: both
 * hold stock silently and then present a wall reading "your reservation has
 * expired" to a person who had no way of knowing they were on a clock. Showing
 * the clock costs nothing and is the difference between a deadline and an
 * ambush.
 */
/** One chosen line, resolved into something a person recognises. */
export interface PreviewLine {
  ticketId: string;
  quantity: number;
  title: string;
  /** Indicative. The order's own total is what gets charged. */
  unitPriceCents?: number;
  currency: string;
}

/**
 * What the buyer picked, resolved on the server so the summary is complete in
 * the first paint rather than a row of grey bars.
 */
export interface CheckoutPreview {
  event: {
    slug: string;
    name: string;
    startsAt: string;
    venue: string;
    city: string;
    uf: string;
    cover?: EventMedia;
  };
  lines: PreviewLine[];
}

export function CheckoutFlow({
  locale,
  authenticated,
  preview,
}: {
  locale: Locale;
  /** Resolved by the server component; checkout requires a session today. */
  authenticated: boolean;
  preview?: CheckoutPreview;
}) {
  const params = useSearchParams();

  // Read ONCE, at mount, and never again.
  //
  // This page rewrites its own address the moment a reservation exists, so that
  // a refresh resumes that order instead of reserving a second one. Reading the
  // URL on every render would turn our own rewrite into a state change: the
  // component would see an order id appear, switch branches mid-flow, and
  // remount the screen the buyer was already looking at. The address bar is a
  // RECOVERY marker here, read on arrival, not a second source of truth
  // competing with the component that is driving it.
  const [entry] = useState(() => ({
    resumeID: params.get("order")?.trim() ?? "",
    intent: readIntent(params),
  }));

  // Signing in is a DIALOG over this page, not a wall instead of it.
  //
  // The screen the buyer came for, the poster, the tiers, the total, renders
  // either way, and the dialog asks for a session on top of it. Swapping the
  // whole page for a "sign in first" card throws away the context they were
  // about to act on, and it is also a worse answer for a session that merely
  // EXPIRED: the old card could not tell "never signed in" from "the cookie
  // went stale ten minutes ago", so both got the same dead end.
  if (entry.resumeID) {
    return <Resume orderID={entry.resumeID} locale={locale} />;
  }
  if (!entry.intent) return <Recover />;
  return (
    <Purchase
      intent={entry.intent}
      locale={locale}
      preview={preview}
      authenticated={authenticated}
    />
  );
}

/**
 * Picking up an order that already has a hold.
 *
 * Read-only as far as inventory is concerned: it fetches, then hands off to
 * exactly the same screens a fresh checkout uses, so a resumed order and a new
 * one cannot drift apart in how they look or what they do.
 */
function Resume({ orderID, locale }: { orderID: string; locale: Locale }) {
  const t = useTranslations("checkout");
  const router = useRouter();
  const { requireAuth } = useAuthDialog();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // An order belongs to an account, so reading one needs a session. Asked
      // for the same way as everywhere else: a dialog over this page.
      if (!(await requireAuth("orders"))) {
        if (!cancelled) setError(t("signInBody"));
        return;
      }
      const { data, error: failed } = await getOrder(orderID);
      if (cancelled) return;
      if (failed || !data) {
        setError(failed?.message ?? t("notFound"));
        return;
      }
      setOrder(data.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderID, requireAuth, t]);

  const confirm = async (buyer: { name: string; email: string; document: string }) => {
    if (!order) return;
    setSubmitting(true);
    setError(null);
    const { data, error: failed } = await confirmOrder(order.id, {
      ...buyer,
      document: buyer.document.replace(/[^0-9]/g, ""),
    });
    setSubmitting(false);
    if (failed || !data) {
      setError(failed?.message ?? t("failed"));
      return;
    }
    setOrder(data.data);
  };

  if (!order && error) return <ReserveFailed message={error} />;
  if (!order) return <Reserving resuming />;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
      <div className="min-w-0">
        {order.confirmed ? (
          <Payment order={order} locale={locale} onUpdate={setOrder} eventSlug={order.event?.slug} />
        ) : (
          <BuyerForm
            submitting={submitting}
            error={error}
            onSubmit={confirm}
            onBack={() => router.back()}
          />
        )}
      </div>
      <OrderSummary order={order} locale={locale} />
    </div>
  );
}

function Purchase({
  intent,
  locale,
  preview,
  authenticated,
}: {
  intent: CheckoutIntent;
  locale: Locale;
  preview?: CheckoutPreview;
  /** The server's read of the session cookie, used only to avoid a flash. */
  authenticated: boolean;
}) {
  const t = useTranslations("checkout");
  const router = useRouter();
  const { requireAuth, openSignIn } = useAuthDialog();
  // Set when the buyer closed the sign-in dialog without signing in. The page
  // stays exactly as it is and offers the dialog again, rather than becoming
  // an error.
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const [order, setOrder] = useState<Order | null>(null);
  const [failure, setFailure] = useState<{ message: string; code?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Bumped to ask for the reservation again after the buyer has freed up an
  // allowance. A counter rather than a boolean, so a second release retries a
  // second time.
  const [attempt, setAttempt] = useState(0);

  // One key per ATTEMPT, and reused for every retry within it. A fresh key per
  // network retry would create a second order for a buyer whose phone dropped
  // the response, which is precisely what the key exists to prevent, while
  // reusing one key across a deliberate retry, after the first was refused,
  // would replay the refusal instead of trying again.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  // A deliberate retry, after the buyer released one of their other holds,
  // needs a NEW key. Reusing the old one would replay the stored refusal
  // instead of asking again.
  const retry = useCallback(() => {
    setIdempotencyKey(newIdempotencyKey());
    setAttempt((current) => current + 1);
  }, []);

  // The reservation, fired once on arrival.
  //
  // Guarded by a ref rather than by the effect's dependencies, because React's
  // development mode runs every effect twice on purpose. The idempotency key
  // would make the second call harmless at the API; it returns the same order,
  // but firing it at all is a wasted round trip on the one screen where
  // latency is most visible.
  //
  // There is deliberately NO cancelled flag here, and that is the subtle part.
  // The obvious pairing of a once-guard with a cleanup that cancels is a trap:
  // in development React mounts, unmounts and remounts, so the cleanup cancels
  // the only request that was ever sent and the once-guard stops a replacement
  // being made. The screen then waits forever on a reservation that already
  // succeeded. Since this fires exactly once per mount either way, the right
  // answer is to let it land; a state update after unmount is a no-op in React
  // 18, not a leak.
  const reserved = useRef(-1);
  useEffect(() => {
    if (reserved.current === attempt) return;
    reserved.current = attempt;
    setFailure(null);
    setNeedsSignIn(false);

    void (async () => {
      // The SERVER's read of the cookie decides whether to ask up front.
      //
      // Consulting the client's own session state instead would flash the
      // dialog at somebody who is already signed in, because that state starts
      // false and only becomes true after a round trip to /user/me. The server
      // already knows a cookie was sent, so a buyer who has one goes straight
      // to reserving, and if that cookie turns out to be stale, the 401 below
      // asks for a session properly. That is the case the server cannot see:
      // it knows a cookie EXISTS, and one that expired an hour ago looks
      // identical to a live one from there.
      if (!authenticated && !(await requireAuth("checkout"))) {
        setNeedsSignIn(true);
        return;
      }

      const lines = intent.lines.map(({ ticketId, quantity }) => ({ ticketId, quantity }));
      let { data, error: failed } = await reserveCheckout({ items: lines }, idempotencyKey);

      // The cookie was there and the API refused it anyway. Ask for a real
      // session and try once more, rather than showing "authentication
      // required" to somebody who is looking at a Sign in button.
      if (failed?.status === 401) {
        if (!(await requireAuth("checkout"))) {
          setNeedsSignIn(true);
          return;
        }
        ({ data, error: failed } = await reserveCheckout({ items: lines }, idempotencyKey));
      }

      if (failed || !data) {
        setFailure({ message: failed?.message ?? t("reserveFailed"), code: failed?.code });
        return;
      }
      setOrder(data.data);
      rememberOrder(data.data.id);
    })();
  }, [intent, idempotencyKey, attempt, authenticated, requireAuth, t]);

  const confirm = async (buyer: { name: string; email: string; document: string }) => {
    if (!order) return;
    setSubmitting(true);
    setError(null);
    const { data, error: failed } = await confirmOrder(order.id, {
      ...buyer,
      document: buyer.document.replace(/\D/g, ""),
    });
    setSubmitting(false);
    if (failed || !data) {
      setError(failed?.message ?? t("failed"));
      return;
    }
    setOrder(data.data);
  };

  // Closed the dialog. The basket is still on screen in the panel beside this;
  // all that is missing is a session, and the way back is one button.
  if (!order && needsSignIn) {
    return (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="rounded-lg border border-border bg-card p-6 text-center shadow-sm sm:p-8">
          <p className="font-display text-lg font-semibold text-card-foreground">
            {t("signInTitle")}
          </p>
          <p className="mx-auto mt-2 max-w-[46ch] text-sm text-muted-foreground">
            {t("signInBody")}
          </p>
          <button
            type="button"
            onClick={() => {
              openSignIn("checkout");
              // Re-runs the reservation once a session exists. The attempt
              // counter is what the effect above watches.
              retry();
            }}
            className="mt-5 inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[var(--elev-button-primary)] hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("signIn")}
          </button>
        </div>
        <OrderSummary order={null} preview={preview} locale={locale} />
      </div>
    );
  }

  // The reservation failed outright: no hold, nothing to fill in.
  if (!order && failure) {
    return (
      <ReserveFailed
        message={failure.message}
        code={failure.code}
        locale={locale}
        eventSlug={intent.eventSlug}
        onRetry={retry}
      />
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
      <div className="min-w-0">
        {!order ? (
          <Reserving />
        ) : order.confirmed ? (
          <Payment order={order} locale={locale} onUpdate={setOrder} eventSlug={intent.eventSlug} />
        ) : (
          <BuyerForm
            submitting={submitting}
            error={error}
            onSubmit={confirm}
            onBack={() => router.back()}
          />
        )}
      </div>

      {/* The order summary stays on screen through every step, which is the
          one piece of layout advice every checkout benchmark agrees on: a
          buyer should never have to leave the form to remember what they are
          buying or what it costs. */}
      <OrderSummary order={order} preview={preview} locale={locale} />
    </div>
  );
}

/** The moment before the hold exists. Usually a few hundred milliseconds. */
function Reserving({ resuming = false }: { resuming?: boolean }) {
  const t = useTranslations("checkout");
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-6 py-16 text-center shadow-sm"
      role="status"
      aria-live="polite"
    >
      <span className="size-5 animate-spin rounded-full border-2 border-border-strong border-t-primary" aria-hidden />
      <p className="mt-2 text-sm font-semibold text-card-foreground">
        {resuming ? t("loadingOrder") : t("reservingTitle")}
      </p>
      {resuming ? null : (
        <p className="max-w-[42ch] text-sm text-muted-foreground">{t("reservingBody")}</p>
      )}
    </div>
  );
}

/**
 * No hold was taken: sold out, over a limit, or the tier went off sale.
 *
 * "Over a limit" is the one of those the buyer can actually fix, and it is the
 * one a plain error message fails worst. The cap counts orders they cannot see
 * from here, so the refusal shows them and offers to release one, the remedy
 * attached to the sentence that mentions it, rather than an instruction to go
 * and find it somewhere else while the basket goes cold.
 *
 * Branching on the API's CODE rather than on its message: the message is
 * written for a person and ships in four languages, so matching on it would
 * work in one of them.
 */
function ReserveFailed({
  message,
  code,
  locale,
  eventSlug,
  onRetry,
}: {
  message: string;
  code?: string;
  locale?: Locale;
  eventSlug?: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("checkout");
  const overHoldLimit = code === "too_many_open_orders" || code === "too_many_held_tickets";

  return (
    <div
      // One quiet ground for both, and the STATE is carried by the ink on the
      // title. A washed amber panel and a washed red one read as two shades of
      // the same thing at a glance; a neutral card with a warning-inked heading
      // and a fault-inked one do not.
      className={`notice ${overHoldLimit ? "notice-warning" : "notice-fault"} p-6 text-center sm:p-8`}
    >
      <p
        className="notice-ink font-display text-lg font-semibold"
      >
        {overHoldLimit ? t("holdLimitTitle") : t("reserveFailedTitle")}
      </p>
      <p
        role="alert"
        className="mx-auto mt-2 max-w-[52ch] text-sm text-muted-foreground"
      >
        {message}
      </p>

      {overHoldLimit && locale && onRetry ? (
        <OpenHolds locale={locale} onReleased={onRetry} />
      ) : (
        <Link
          href={eventSlug ? `/eventos/${eventSlug}` : "/"}
          className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          {t("tryAgain")}
        </Link>
      )}
    </div>
  );
}


/** A link that arrived without a usable choice on it. */
function Recover() {
  const t = useTranslations("checkout");
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      <p className="font-display text-lg font-semibold text-card-foreground">{t("noSelectionTitle")}</p>
      <p className="mx-auto mt-2 max-w-[46ch] text-sm text-muted-foreground">{t("noSelectionBody")}</p>
      <Link
        href="/"
        className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        {t("browseEvents")}
      </Link>
    </div>
  );
}


/**
 * What the buyer is buying and what it costs, on screen the whole way through.
 *
 * It renders from the INTENT before the hold exists and from the ORDER
 * afterwards. The two agree on quantities, and only the order knows the real
 * prices, so the panel shows the lines immediately and fills in the money when
 * the server has priced them. Guessing the price client-side and correcting it
 * a moment later would be a number that changes under the buyer's eyes on the
 * one screen where that is least forgivable.
 */
function OrderSummary({
  order,
  preview,
  locale,
}: {
  order: Order | null;
  /** The chosen basket, for the moment before the priced order exists. */
  preview?: CheckoutPreview;
  locale: Locale;
}) {
  const t = useTranslations("checkout");
  // The order once it exists, the preview until then. Never a blend of the two:
  // the order is what will be charged, and a panel that mixed a real total with
  // an indicative line would be unreadable at exactly the wrong moment.
  const priced = order !== null;
  const lines: SummaryLine[] = priced
    ? order.items.map((item) => ({
        key: item.ticketId,
        title: item.ticketTitle,
        quantity: item.quantity,
        totalCents: item.totalCents,
        currency: order.currency,
      }))
    : (preview?.lines ?? []).map((line) => ({
        key: line.ticketId,
        title: line.title || t("ticket"),
        quantity: line.quantity,
        totalCents:
          line.unitPriceCents === undefined ? undefined : line.unitPriceCents * line.quantity,
        currency: line.currency,
      }));
  const event = order?.event
    ? {
        name: order.event.name,
        venue: order.event.venue,
        city: order.event.city,
        startsAt: order.event.startsAt,
      }
    : preview
      ? {
          name: preview.event.name,
          venue: preview.event.venue,
          city: preview.event.city,
          startsAt: preview.event.startsAt,
        }
      : null;
  const indicativeTotal = lines.reduce<number | undefined>((sum, line) => {
    if (sum === undefined || line.totalCents === undefined) return undefined;
    return sum + line.totalCents;
  }, 0);

  return (
    <aside className="overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:sticky lg:top-24">
      {/* The poster. A buyer three screens deep in a form should be able to
          glance right and see the night they are buying, not an id. */}
      {preview?.event.cover && !order ? (
        <EventImage
          media={preview.event.cover}
          alt={preview.event.name}
          sizes="360px"
          className="h-32 w-full object-cover"
          fallbackRatio={1.91}
        />
      ) : order?.event?.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={order.event.coverUrl}
          alt={order.event.name}
          className="h-32 w-full object-cover"
        />
      ) : null}

      <div className="border-b border-border px-5 py-4">
        <h2 className="font-display text-base font-semibold text-card-foreground">{t("summary")}</h2>
        {event ? (
          <>
            <p className="mt-1 text-sm font-medium text-foreground">{event.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatLongDateTime(event.startsAt, locale)}
            </p>
            <p className="text-xs text-muted-foreground">
              {event.venue} · {event.city}
            </p>
          </>
        ) : null}
      </div>

      <ul className="divide-y divide-border">
        {lines.map((line) => (
          <li key={line.key} className="flex items-baseline justify-between gap-3 px-5 py-3">
            <span className="min-w-0 text-sm text-card-foreground">
              <span className="font-semibold tabular-nums">{line.quantity}×</span> {line.title}
            </span>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {line.totalCents === undefined
                ? /* a glyph for "no amount yet", not punctuation */ "-"
                : formatMoney(line.totalCents, locale, line.currency)}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-border bg-muted px-5 py-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">{t("total")}</span>
          {priced ? (
            <span className="font-display text-xl font-semibold tabular-nums text-card-foreground">
              {formatMoney(order.totalCents, locale, order.currency)}
            </span>
          ) : indicativeTotal !== undefined ? (
            <span className="font-display text-xl font-semibold tabular-nums text-muted-foreground">
              {formatMoney(indicativeTotal, locale, lines[0]?.currency ?? "BRL")}
            </span>
          ) : (
            <span className="h-6 w-24 animate-pulse rounded bg-accent-hover" aria-hidden />
          )}
        </div>
        {/* Said plainly, because a total that grows at the last step is the
            single largest cause of abandoned checkouts. */}
        <p className="mt-1 text-xs text-muted-foreground">{t("noExtraFees")}</p>

        {order ? (
          <>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">{t("heldUntil")}</span>
              <Countdown expiresAt={order.holdExpiresAt} />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t("holdExplainer")}</p>
            {/* The order's own reference. It is what a buyer quotes to support,
                and what makes this page's address something they can come back
                to rather than a basket that re-reserves on every refresh. */}
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              {t("orderReference")}{" "}
              <span className="select-all font-mono text-foreground">{order.id}</span>
            </p>
          </>
        ) : null}
      </div>
    </aside>
  );
}

function BuyerForm({
  submitting,
  error,
  onSubmit,
  onBack,
}: {
  submitting: boolean;
  error: string | null;
  onSubmit: (buyer: { name: string; email: string; document: string }) => void;
  onBack: () => void;
}) {
  const t = useTranslations("checkout");
  const [buyer, setBuyer] = useState({ name: "", email: "", document: "" });

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(buyer);
      }}
    >
      <div>
        <h2 className="font-display text-lg font-semibold text-card-foreground">{t("yourDetails")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("detailsHint")}</p>
      </div>

      <ElevatedInput
        id="buyer-name"
        label={t("name")}
        icon={<Person size={18} aria-hidden />}
        value={buyer.name}
        onChange={(event) => setBuyer((current) => ({ ...current, name: event.target.value }))}
        autoComplete="name"
        required
      />
      <ElevatedInput
        id="buyer-email"
        label={t("email")}
        icon={<EnvelopeSimple size={18} aria-hidden />}
        type="email"
        value={buyer.email}
        onChange={(event) => setBuyer((current) => ({ ...current, email: event.target.value }))}
        autoComplete="email"
        inputMode="email"
        required
        hint={t("emailHint")}
      />
      <ElevatedInput
        id="buyer-document"
        label={t("document")}
        icon={<IdentificationCard size={18} aria-hidden />}
        value={buyer.document}
        onChange={(event) => setBuyer((current) => ({ ...current, document: event.target.value }))}
        inputMode="numeric"
        autoComplete="off"
        required
        hint={t("documentHint")}
      />

      {error ? (
        <p role="alert" className="notice notice-fault notice-ink px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="h-11 flex-1 rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow-[var(--elev-button-primary)] hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {submitting ? t("confirming") : t("goToPayment")}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="h-11 rounded-md border border-border-strong px-4 text-sm font-medium text-foreground hover:bg-accent-hover"
        >
          {t("back")}
        </button>
      </div>
    </form>
  );
}

/**
 * The order is confirmed. Now it needs a PIX code, and then it needs paying.
 *
 * Polling rather than pushing, because the charge is created by a durable job
 * that normally finishes in about a second. A websocket for a wait that short
 * is machinery nobody needs.
 */
function Payment({
  order,
  locale,
  onUpdate,
  eventSlug,
}: {
  order: Order;
  locale: Locale;
  onUpdate: (order: Order) => void;
  eventSlug?: string;
}) {
  const t = useTranslations("checkout");
  const waitingForCode = !order.payment.pixCopyPaste;
  const settled = order.status !== "pending_payment";

  // Poll while there is something to wait for, and stop the moment there is
  // not. A page left open on a paid order should not keep a request in flight
  // forever.
  useEffect(() => {
    if (settled) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      const { data } = await getOrder(order.id);
      if (!cancelled && data) onUpdate(data.data);
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [order.id, settled, onUpdate]);

  if (order.status === "paid") {
    return (
      <div className="notice notice-healthy p-8 text-center">
        <p className="notice-ink font-display text-lg font-semibold">{t("paidTitle")}</p>
        <p className="mx-auto mt-2 max-w-[46ch] text-sm text-muted-foreground">
          {t("paidBody", { email: order.buyerEmail })}
        </p>
        <Link
          href="/orders"
          className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          {t("myOrders")}
        </Link>
      </div>
    );
  }

  if (settled) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="font-display text-lg font-semibold text-card-foreground">{t("expiredTitle")}</p>
        <p className="mx-auto mt-2 max-w-[46ch] text-sm text-muted-foreground">{t("expiredBody")}</p>
        <Link
          href={eventSlug ? `/eventos/${eventSlug}` : "/"}
          className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          {t("tryAgain")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-card-foreground">{t("payTitle")}</h2>
        <Countdown expiresAt={order.holdExpiresAt} />
      </div>

      <p className="text-sm text-muted-foreground">
        {t("payBody", {
          total: formatMoney(order.totalCents, locale, order.currency),
          count: order.quantity,
        })}
      </p>

      {waitingForCode ? (
        <div
          className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border-strong px-4 py-10 text-center"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-foreground">{t("preparingCode")}</p>
          <p className="text-xs text-muted-foreground">{t("preparingCodeHint")}</p>
        </div>
      ) : (
        <PixCode order={order} />
      )}
    </div>
  );
}

function PixCode({ order }: { order: Order }) {
  const t = useTranslations("checkout");
  const [copied, setCopied] = useState(false);
  const code = order.payment.pixCopyPaste ?? "";

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused; the code is on screen and
      // selectable, so this is a convenience rather than the only route.
      setCopied(false);
    }
  }, [code]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Copy first, QR second, and that order is the whole point on a phone:
          the buyer is already holding the screen the QR is on and cannot scan
          it. The QR is for somebody at a desktop. */}
      <button
        type="button"
        onClick={copy}
        className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow-[var(--elev-button-primary)] hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {copied ? t("copied") : t("copyCode")}
      </button>

      {order.payment.pixQrCodeBase64 ? (
        // A base64 QR code is inline data: there is no origin for the image
        // optimiser to fetch from, and next/image would only add a wrapper
        // around bytes that are already in the HTML.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${order.payment.pixQrCodeBase64}`}
          alt={t("qrAlt")}
          width={200}
          height={200}
          className="rounded-md border border-border bg-white p-2"
        />
      ) : null}

      <details className="w-full">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          {t("showCode")}
        </summary>
        <TextAreaField
          id="pix-code"
          readOnly
          value={code}
          rows={3}
          aria-label={t("copyPaste")}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-2 resize-none break-all bg-muted p-2 font-mono text-xs"
        />
      </details>

      <p className="text-center text-xs text-muted-foreground" role="status" aria-live="polite">
        {t("waitingForPayment")}
      </p>
    </div>
  );
}

/**
 * The live clock on the hold.
 *
 * Announced politely rather than assertively: a timer that interrupts a screen
 * reader every second is unusable. The urgent colour appears only in the last
 * two minutes, so it means something when it does.
 */
function Countdown({ expiresAt }: { expiresAt: string }) {
  const t = useTranslations("checkout");
  const target = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [remaining, setRemaining] = useState(() => Math.max(target - Date.now(), 0));

  // No synchronous re-sync on mount: the first value came from the lazy
  // initialiser, and a set during the effect is a second render before the
  // browser has painted the first. The interval corrects within a second, and a
  // clock that is one tick stale has never mattered to anyone.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(Math.max(target - Date.now(), 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [target]);

  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const urgent = totalSeconds <= 120;

  return (
    <p
      className={`shrink-0 text-sm font-semibold tabular-nums ${urgent ? "text-destructive-ink" : "text-foreground"}`}
      // Minute-level announcements, not per-second: aria-live on a ticking
      // clock reads every tick aloud.
      aria-live="off"
    >
      <span className="sr-only">{t("timeLeft")} </span>
      {minutes}:{String(seconds).padStart(2, "0")}
    </p>
  );
}

/** One row of the summary, from either the priced order or the preview. */
interface SummaryLine {
  key: string;
  title: string;
  quantity: number;
  /** Undefined while nothing has priced this line yet. */
  totalCents?: number;
  currency: string;
}

/**
 * Puts the order's id in the address bar, so a refresh RESUMES it.
 *
 * Without this the page's address describes only a basket, and reloading it:
 * an impatient refresh, a restored tab, a phone waking up, reserves a second
 * set of tickets. Two refreshes and the buyer is holding three times what they
 * asked for, against an account limit they will then hit for no reason, with
 * inventory off the shelf that nobody is going to pay for.
 *
 * history.replaceState rather than a router push: this is a correction to the
 * address of the page already on screen, not a new place. It must not add a
 * history entry; a buyer pressing Back should return to the event, not to a
 * basket that would reserve all over again, and it must not re-run the route.
 */
function rememberOrder(orderID: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("order") === orderID) return;
  url.searchParams.set("order", orderID);
  // The basket is dropped from the address once the order exists: the order IS
  // the basket now, and leaving both would invite the two to disagree.
  url.searchParams.delete("items");
  url.searchParams.delete("ticket");
  url.searchParams.delete("quantity");
  window.history.replaceState(window.history.state, "", url.toString());
}
