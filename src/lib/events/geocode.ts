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
 * returns coordinates from open data that may be stored, which most geocoders
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

/* -------------------------------------------------------------------------- */
/* Searching for a place by name or street address                            */
/* -------------------------------------------------------------------------- */

/**
 * Free-text address search, the way a maps app does it.
 *
 * A CEP lookup answers "where is this postcode", which is the wrong question
 * for somebody who knows the venue and not its postcode, and a CEP is a block
 * in a dense city and a whole district in a small town, so even when it is
 * known it cannot place a door. This answers the question an organiser actually
 * has: "Espaço Aurora", or "Rua Harmonia 150 Vila Madalena", and gets back
 * candidates with a point each.
 *
 * PHOTON, and the choice is about terms rather than quality. It is built for
 * search-as-you-type over OpenStreetMap, needs no key, sends open CORS headers,
 * and its data is ODbL, which permits STORING the coordinates, the thing this
 * whole feature exists to do. The large commercial geocoders forbid exactly
 * that on their cheaper tiers: you may display a result and not keep it, which
 * an event row holding a latitude quietly violates.
 *
 * Its public instance asks for fair use rather than bulk traffic, which this
 * is: the search sits behind the organiser's event form, not on a buyer-facing
 * page, it is debounced, and it wants three characters before it asks anything.
 * A deployment that outgrows that points NEXT_PUBLIC_GEOCODER_URL at its own
 * instance and changes nothing else.
 */
const SEARCH_URL = process.env.NEXT_PUBLIC_GEOCODER_URL ?? "https://photon.komoot.io/api";

/** Brazil, corner to corner. A bias on the ranking, not a filter, see below. */
const BRAZIL_BBOX = "-73.99,-33.75,-28.85,5.27";

/** Few enough to read without scrolling; more than that is a list nobody reads. */
const SEARCH_LIMIT = 6;

/** Below this there is nothing to search for, only load to generate. */
export const MIN_SEARCH_LENGTH = 3;

export interface AddressSuggestion {
  /** Stable within one response, which is all a React key needs. */
  id: string;
  /** The venue or building name, when the result is a place rather than a street. */
  name: string;
  /** Street and number, already joined the way the form wants them. */
  street: string;
  neighborhood: string;
  city: string;
  uf: string;
  postalCode: string;
  latitude: number;
  longitude: number;
}

/**
 * Searches for a place.
 *
 * Never throws, for the same reason lookupPostalCode does not: it runs while
 * somebody is typing, and a rejected promise there is a console error and a
 * search box that silently stops responding. An empty array means "nothing to
 * show", whether that is no matches or no network.
 */
export async function searchAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_SEARCH_LENGTH) return [];

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const params = new URLSearchParams({
      q: trimmed,
      limit: String(SEARCH_LIMIT),
      bbox: BRAZIL_BBOX,
    });
    const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as PhotonResponse;
    return (payload.features ?? [])
      // The bbox biases the ranking without bounding it, so a search for
      // "teatro municipal" can still surface one in Santiago. Brazil is where
      // the tickets are sold and where the CEP field means anything, so the
      // rest are dropped rather than offered and then rejected on save.
      .filter((feature) => feature.properties?.countrycode === "BR")
      .map(toSuggestion)
      .filter((suggestion): suggestion is AddressSuggestion => suggestion !== null);
  } catch {
    return [];
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    state?: string;
    postcode?: string;
    countrycode?: string;
  };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

function toSuggestion(feature: PhotonFeature): AddressSuggestion | null {
  const properties = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates;
  const longitude = coordinates?.[0];
  const latitude = coordinates?.[1];
  // A candidate with no point cannot place a pin, which is the only reason this
  // search exists. Dropped rather than offered.
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  // Which field holds the road depends on WHAT was found, and the difference
  // matters because these two land in different form fields.
  //
  // A road itself, osm_key "highway", has its name in `name`, because the
  // road is the result. Everything else is a place: `name` is the venue and
  // `street` is its address. Deciding that by whether `street` happens to be
  // present, which is the obvious shortcut, gets a venue OSM has no address
  // for exactly backwards; "Teatro Municipal" would be written into the
  // address line and the venue field left empty.
  const isRoad = properties.osm_key === "highway" || properties.type === "street";
  const road = properties.street ?? (isRoad ? (properties.name ?? "") : "");
  const number = properties.housenumber ?? "";

  return {
    id: `${properties.osm_type ?? "?"}${properties.osm_id ?? road}${number}`,
    // Only a real place name. Echoing the road back as the venue would print
    // "Rua Harmonia" on somebody's ticket.
    name: isRoad ? "" : (properties.name ?? ""),
    street: number === "" ? road : `${road}, ${number}`,
    neighborhood: properties.district ?? "",
    city: properties.city ?? "",
    uf: ufFromState(properties.state),
    postalCode: formatCEP(properties.postcode),
    latitude: latitude as number,
    longitude: longitude as number,
  };
}

/** The CEP as the form writes it, or blank when there is not a whole one. */
function formatCEP(raw: string | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length !== CEP_DIGITS) return "";
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * The two-letter UF for a state's name.
 *
 * OpenStreetMap names states in full, "São Paulo", "Rio Grande do Sul", and
 * the form stores the two-letter code a Brazilian address line is written with.
 * Without this the field would be filled with something the API rejects on
 * save, which is worse than leaving it blank for the operator to type.
 */
const UF_BY_STATE: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

function ufFromState(state: string | undefined): string {
  if (!state) return "";
  // Accent-folded, because OSM is not consistent about them and a lookup that
  // missed on "Ceara" against "Ceará" would silently return no state at all.
  const key = state
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
  if (UF_BY_STATE[key]) return UF_BY_STATE[key];
  // Some extracts already carry the code.
  return /^[a-z]{2}$/.test(key) ? key.toUpperCase() : "";
}
