import { fromDateTimeLocalValue, toDateTimeLocalValue } from "@/lib/format";

import type { EventInput } from "./admin-api";
import { EVENT_CATEGORIES, type EventCategory, type EventStatus, type EventSummary } from "./types";

/**
 * The event form's rules, with no React in them.
 *
 * Validation is where a form is either trustworthy or not, and a rule buried in
 * a submit handler beside setState calls is a rule nobody can check. Keeping it
 * here means every branch — the pair of coordinates that must travel together,
 * the end that must follow the start — is a plain function call in a test
 * rather than a rendered component and a simulated click.
 *
 * These rules deliberately mirror the API's, and do not replace them. The
 * server validates everything again because a browser is not a trust boundary;
 * this exists so an operator hears about a mistake before the round trip.
 */

/** Every field as the form holds it: strings, because inputs hold strings. */
export interface EventFormState {
  name: string;
  description: string;
  category: EventCategory;
  status: EventStatus;
  /** `datetime-local` wall-clock values, not ISO instants. */
  startsAt: string;
  endsAt: string;
  venue: string;
  address: string;
  neighborhood: string;
  city: string;
  uf: string;
  postalCode: string;
  /** Undefined until a pin is placed. They are set and cleared together. */
  latitude?: number;
  longitude?: number;
}

export type EventFormErrors = Partial<Record<keyof EventFormState, string>>;

/** Message keys, resolved by the caller against the `eventAdmin` namespace. */
export type ErrorKey =
  | "errors.name"
  | "errors.category"
  | "errors.venue"
  | "errors.city"
  | "errors.uf"
  | "errors.startsAt"
  | "errors.endsBeforeStart"
  | "errors.postalCode"
  | "errors.coordinates";

export function emptyEventForm(): EventFormState {
  return {
    name: "",
    description: "",
    category: "festas_shows",
    // Draft, always. An event created straight into the catalogue is one that
    // goes on sale before anyone has checked the date, the venue or the price.
    status: "draft",
    startsAt: "",
    endsAt: "",
    venue: "",
    address: "",
    neighborhood: "",
    city: "",
    uf: "",
    postalCode: "",
  };
}

/** The form state for an event that already exists. */
export function eventFormFrom(event: EventSummary): EventFormState {
  return {
    name: event.name,
    description: event.description,
    category: event.category,
    status: event.status,
    startsAt: toDateTimeLocalValue(event.startsAt),
    endsAt: event.endsAt ? toDateTimeLocalValue(event.endsAt) : "",
    venue: event.location.venue,
    address: event.location.address,
    neighborhood: event.location.neighborhood,
    city: event.location.city,
    uf: event.location.uf,
    postalCode: event.location.postalCode,
    latitude: event.location.latitude,
    longitude: event.location.longitude,
  };
}

export interface ValidationResult {
  input?: EventInput;
  errors: EventFormErrors;
}

/**
 * Validates the form and, when it passes, produces the request body.
 *
 * One function for both, on purpose: a validator that returns only booleans
 * leaves the caller to rebuild the payload from the same fields, and the two
 * drift. Here the payload can only be produced by the code that just checked
 * it.
 *
 * `translate` maps a message key to text, so this module never imports the i18n
 * runtime and stays callable from a test with a one-line stub.
 */
export function validateEventForm(
  state: EventFormState,
  translate: (key: ErrorKey) => string,
): ValidationResult {
  const errors: EventFormErrors = {};

  if (state.name.trim() === "") errors.name = translate("errors.name");
  if (!(EVENT_CATEGORIES as readonly string[]).includes(state.category)) {
    errors.category = translate("errors.category");
  }
  if (state.venue.trim() === "") errors.venue = translate("errors.venue");
  if (state.city.trim() === "") errors.city = translate("errors.city");

  const uf = state.uf.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) errors.uf = translate("errors.uf");

  const startsAt = fromDateTimeLocalValue(state.startsAt);
  if (state.startsAt.trim() === "" || startsAt === "") {
    errors.startsAt = translate("errors.startsAt");
  }

  const endsAt = state.endsAt.trim() === "" ? "" : fromDateTimeLocalValue(state.endsAt);
  if (state.endsAt.trim() !== "" && endsAt === "") {
    errors.endsAt = translate("errors.endsBeforeStart");
  } else if (endsAt !== "" && startsAt !== "" && Date.parse(endsAt) <= Date.parse(startsAt)) {
    // Equal counts as wrong: a zero-length event is a typo every time, and
    // letting it through produces a listing that says "22:00 – 22:00".
    errors.endsAt = translate("errors.endsBeforeStart");
  }

  const postalCode = normalisePostalCode(state.postalCode);
  if (state.postalCode.trim() !== "" && postalCode === null) {
    errors.postalCode = translate("errors.postalCode");
  }

  // Coordinates are a pair or nothing. Half a pin is not a place, and the API
  // rejects it — better to say so here than to lose the whole save to it.
  const hasLatitude = isCoordinate(state.latitude);
  const hasLongitude = isCoordinate(state.longitude);
  if (hasLatitude !== hasLongitude) {
    errors.latitude = translate("errors.coordinates");
  }

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    input: {
      name: state.name.trim(),
      description: state.description.trim(),
      category: state.category,
      status: state.status,
      startsAt,
      // Omitted rather than sent empty: the field is a nullable timestamp, and
      // "" is not a timestamp.
      ...(endsAt !== "" ? { endsAt } : {}),
      location: {
        venue: state.venue.trim(),
        address: state.address.trim(),
        neighborhood: state.neighborhood.trim(),
        city: state.city.trim(),
        uf,
        postalCode: postalCode ?? "",
        ...(hasLatitude && hasLongitude
          ? { latitude: state.latitude, longitude: state.longitude }
          : {}),
      },
    },
  };
}

/**
 * A Brazilian CEP as eight digits with the hyphen, or null if it is not one.
 *
 * Operators paste these from anywhere — "60861630", "60861-630", "60.861-630" —
 * and the geocoder only accepts one shape. Normalising here means an operator
 * never sees "we could not find that address" for a postcode that was simply
 * punctuated differently.
 */
export function normalisePostalCode(raw: string): string | null {
  // Blank is "no postcode", which is allowed. Anything else the operator
  // actually typed has to be a postcode or be reported as wrong — stripping
  // non-digits first would turn a field full of letters into a blank one and
  // discard what they wrote without saying so.
  if (raw.trim() === "") return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Zero is a real coordinate, so presence is a type check and not truthiness.
 */
function isCoordinate(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/** The first field with a message, for moving focus after a failed submit. */
export function firstInvalid(errors: EventFormErrors): keyof EventFormState | null {
  const order: (keyof EventFormState)[] = [
    "name",
    "category",
    "startsAt",
    "endsAt",
    "venue",
    "address",
    "postalCode",
    "city",
    "uf",
    "latitude",
  ];
  return order.find((key) => errors[key] !== undefined) ?? null;
}
