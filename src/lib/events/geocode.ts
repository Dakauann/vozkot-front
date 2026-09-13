"use client";

/**
 * Turning a Brazilian postcode into an address and a point, in the browser.
 *
 * The same service the API geocodes with, called from the same shape of
 * request, and that is the point: what the operator sees the map do when they
 * type a CEP is exactly what the server would have computed on save. A
 * different provider here would put a pin in one place in the form and store a
 * different one in the database, and nobody would notice until a buyer drove to
 * the wrong address.
 *
 * BrasilAPI needs no key and no account, sends permissive CORS headers, and
 * returns coordinates from open data that may be stored — which most geocoders
 * forbid, and which is the whole reason an event's coordinates can live on its
 * row at all.
 *
 * What it does NOT give is street-number precision. A CEP is a block in a dense
 * city and can be a whole district in a small town. That is what the draggable
 * pin is for.
 */

const BASE_URL = "https://brasilapi.com.br/api/cep/v2";

/** A lookup must not hold the form open. The address is typed, not waited for. */
const TIMEOUT_MS = 5_000;

/** Exactly what the endpoint accepts once punctuation is stripped. */
export const CEP_DIGITS = 8;

export interface GeocodedAddress {
  postalCode: string;
  street: string;
  neighborhood: string;
  city: string;
  uf: string;
  /** Absent when the service knows the postcode but has no point for it. */
  latitude?: number;
  longitude?: number;
}

export type GeocodeOutcome =
  | { status: "ok"; address: GeocodedAddress }
  /** The service looked and does not know this postcode. */
  | { status: "not_found" }
  /** We could not ask: offline, blocked, timed out. Not the operator's fault. */
  | { status: "unavailable" };

/** The digits of a CEP, however it was punctuated, or null if it is not one. */
export function cepDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length === CEP_DIGITS ? digits : null;
}

/**
 * Looks a postcode up.
 *
 * Never throws. Every failure is an outcome the caller renders, because this
 * runs while somebody is typing and a rejected promise in that path is an
 * unhandled error in the console and a form that silently stops responding.
 */
export async function lookupPostalCode(
  raw: string,
  signal?: AbortSignal,
): Promise<GeocodeOutcome> {
  const cep = cepDigits(raw);
  if (!cep) return { status: "not_found" };

  // An abort from the caller and the timeout both have to cancel the same
  // request, so they are combined rather than raced.
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const response = await fetch(`${BASE_URL}/${cep}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (response.status === 404) return { status: "not_found" };
    if (!response.ok) return { status: "unavailable" };

    const payload = (await response.json()) as CepResponse;
    return { status: "ok", address: toAddress(cep, payload) };
  } catch {
    return { status: "unavailable" };
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** v2 of the endpoint, which is the version that carries coordinates. */
interface CepResponse {
  cep?: string;
  state?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
  location?: {
    coordinates?: {
      // Quoted in the response, so they are strings here too. Decoding them as
      // numbers is exactly the bug the API's own clients keep hitting.
      longitude?: string;
      latitude?: string;
    };
  };
}

function toAddress(cep: string, payload: CepResponse): GeocodedAddress {
  const latitude = toCoordinate(payload.location?.coordinates?.latitude);
  const longitude = toCoordinate(payload.location?.coordinates?.longitude);

  return {
    postalCode: `${cep.slice(0, 5)}-${cep.slice(5)}`,
    street: payload.street?.trim() ?? "",
    neighborhood: payload.neighborhood?.trim() ?? "",
    city: payload.city?.trim() ?? "",
    uf: payload.state?.trim().toUpperCase() ?? "",
    // Both or neither. A single coordinate is not a place, and half a pin would
    // fail the form's own validation on save.
    ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
  };
}

/**
 * A coordinate, or undefined.
 *
 * An empty string parses to zero, which is a real point in the Atlantic, so the
 * emptiness is checked before the number is.
 */
function toCoordinate(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
