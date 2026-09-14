"use client";

import { useTranslations } from "next-intl";
import * as React from "react";

import { AddressSearch } from "@/components/events/address-search";
import { LocationPicker } from "@/components/events/location-picker";
import { Field, TextField } from "@/components/ui/field";
import { cepDigits, lookupPostalCode, type AddressSuggestion } from "@/lib/events/geocode";

/**
 * Where the event is.
 *
 * The address is what an operator knows and what a buyer reads; the coordinates
 * are what a map app needs. The two are kept in one section because they are
 * one fact, and because an operator who corrects the pin without correcting the
 * address has made the page lie to whoever reads it.
 *
 * The server geocodes the address on save. The pin is the correction: when an
 * operator drags it, the coordinates travel with the request and the server
 * leaves them alone. That is the whole contract, and it is why "clear the pin"
 * is an action rather than a hidden side effect: it is the only way back to
 * "let the server work it out".
 *
 * THREE WAYS IN, in the order people reach for them. Searching for the venue by
 * name or street fills everything at once and is what this section leads with.
 * A CEP fills the blanks it knows, for an operator who has the postcode in
 * front of them. Typing into the fields directly always works. The pin is the
 * last word over all three, because only a person can say which side of the
 * building the door is on.
 */

export interface LocationValue {
  venue: string;
  address: string;
  neighborhood: string;
  city: string;
  uf: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
}

export type LocationErrors = Partial<Record<keyof LocationValue, string>>;

/** Where the postcode lookup is: idle, asking, found, unknown, or unreachable. */
type LookupState = "idle" | "loading" | "ok" | "not_found" | "unavailable";

export function LocationFields({
  value,
  errors = {},
  onChange,
  idPrefix = "event",
}: {
  value: LocationValue;
  errors?: LocationErrors;
  onChange: (next: LocationValue) => void;
  idPrefix?: string;
}) {
  const t = useTranslations("eventAdmin");

  // The live value, read from callbacks that must not be rebuilt when it
  // changes: a search or a lookup lands after the operator has typed more, and
  // closing over a stale object would write the older form back.
  const latest = React.useRef(value);
  React.useEffect(() => {
    latest.current = value;
  }, [value]);

  const set = React.useCallback(
    <K extends keyof LocationValue>(key: K, next: LocationValue[K]) => {
      onChange({ ...value, [key]: next });
    },
    [onChange, value],
  );

  const move = React.useCallback(
    (latitude: number, longitude: number) => {
      onChange({ ...value, latitude, longitude });
    },
    [onChange, value],
  );

  /**
   * A place taken from the search.
   *
   * Everything it knows is written, INCLUDING over what is already there, and
   * that is the difference between this and the CEP lookup below. A postcode
   * lookup is an aside; it fills blanks and leaves typed text alone, because
   * the operator was doing something else and it fired on its own. Choosing a
   * search result is a deliberate act that means "this is the place", so a
   * neighbourhood left over from the last address would be a stale field
   * nobody thought to clear.
   *
   * Blanks are the exception: a geocoder that has no postcode for a rural venue
   * must not wipe the one somebody typed from the invitation.
   */
  const pick = React.useCallback(
    (found: AddressSuggestion) => {
      const current = latest.current;
      onChange({
        ...current,
        // The venue name is the one field a search should not overwrite: it is
        // what prints on the ticket, and an operator's "Espaço Aurora, Sala 2"
        // beats OpenStreetMap's "Espaço Aurora".
        venue: current.venue.trim() === "" ? found.name : current.venue,
        address: found.street || current.address,
        neighborhood: found.neighborhood || current.neighborhood,
        city: found.city || current.city,
        uf: found.uf || current.uf,
        postalCode: found.postalCode || current.postalCode,
        latitude: found.latitude,
        longitude: found.longitude,
      });
    },
    [onChange],
  );

  const clearPin = React.useCallback(() => {
    // Both at once. A location with one coordinate is not a location, and the
    // API rejects the pair unless it is whole.
    onChange({ ...value, latitude: undefined, longitude: undefined });
  }, [onChange, value]);


  /**
   * The address drives the map.
   *
   * A CEP is the one thing an operator already knows that a machine can turn
   * into a point, so the moment eight digits are present the form fills the
   * street, the neighbourhood, the city and the state from it and drops the pin
   *, which is what every Brazilian checkout has trained people to expect.
   *
   * `value` is deliberately not a dependency. The effect watches the postcode
   * and nothing else: including the whole location object would re-run the
   * lookup every time the operator typed a letter of the venue name, and
   * dragging the pin would immediately snap it back to the CEP's centre.
   */
  const [lookup, setLookup] = React.useState<LookupState>("idle");

  const postalCode = value.postalCode;
  const complete = cepDigits(postalCode) !== null;
  // Derived, not stored: an incomplete postcode has no lookup state to report,
  // and resetting it from inside the effect would set state during the effect
  // body on every keystroke.
  const shown: LookupState = complete ? lookup : "idle";

  React.useEffect(() => {
    const cep = cepDigits(postalCode);
    if (!cep) return;

    const controller = new AbortController();
    // Debounced: an operator pasting a CEP produces one lookup, not eight.
    const timer = window.setTimeout(async () => {
      setLookup("loading");
      const outcome = await lookupPostalCode(cep, controller.signal);
      if (controller.signal.aborted) return;

      if (outcome.status !== "ok") {
        setLookup(outcome.status);
        return;
      }

      setLookup("ok");
      const found = outcome.address;
      const current = latest.current;
      onChange({
        ...current,
        postalCode: found.postalCode,
        // What the operator has already written wins. A CEP lookup fills in
        // blanks; it does not overwrite an address somebody typed by hand,
        // which is often more precise than the postcode's own.
        address: current.address.trim() === "" ? found.street : current.address,
        neighborhood:
          current.neighborhood.trim() === "" ? found.neighborhood : current.neighborhood,
        city: current.city.trim() === "" ? found.city : current.city,
        uf: current.uf.trim() === "" ? found.uf : current.uf,
        // The pin, however, does move, unless the operator has placed one
        // themselves, which is a deliberate correction and outranks a lookup.
        ...(found.latitude !== undefined &&
        found.longitude !== undefined &&
        current.latitude === undefined
          ? { latitude: found.latitude, longitude: found.longitude }
          : {}),
      });
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // onChange is stable in every caller; including it would restart the
    // lookup on each parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postalCode]);

  return (
    <div className="flex flex-col gap-4">
      <AddressSearch id={`${idPrefix}-search`} onPick={pick} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${idPrefix}-venue`}
          label={t("fields.venue")}
          error={errors.venue}
          className="sm:col-span-2"
        >
          <TextField
            id={`${idPrefix}-venue`}
            value={value.venue}
            onChange={(event) => set("venue", event.target.value)}
            placeholder={t("placeholders.venue")}
            autoComplete="off"
          />
        </Field>

        <Field
          id={`${idPrefix}-address`}
          label={t("fields.address")}
          error={errors.address}
          className="sm:col-span-2"
        >
          <TextField
            id={`${idPrefix}-address`}
            value={value.address}
            onChange={(event) => set("address", event.target.value)}
            placeholder={t("placeholders.address")}
            autoComplete="off"
          />
        </Field>

        <Field id={`${idPrefix}-neighborhood`} label={t("fields.neighborhood")}>
          <TextField
            id={`${idPrefix}-neighborhood`}
            value={value.neighborhood}
            onChange={(event) => set("neighborhood", event.target.value)}
            autoComplete="off"
          />
        </Field>

        <Field
          id={`${idPrefix}-postalCode`}
          label={t("fields.postalCode")}
          hint={t(`lookup.${shown}`)}
          error={errors.postalCode}
        >
          <TextField
            id={`${idPrefix}-postalCode`}
            value={value.postalCode}
            onChange={(event) => set("postalCode", event.target.value)}
            inputMode="numeric"
            placeholder="00000-000"
            autoComplete="postal-code"
            // The lookup writes into the other fields, so a screen reader has to
            // be told that typing here changed things it is not focused on.
            aria-busy={shown === "loading"}
          />
        </Field>

        <Field id={`${idPrefix}-city`} label={t("fields.city")} error={errors.city}>
          <TextField
            id={`${idPrefix}-city`}
            value={value.city}
            onChange={(event) => set("city", event.target.value)}
            autoComplete="off"
          />
        </Field>

        <Field id={`${idPrefix}-uf`} label={t("fields.uf")} error={errors.uf}>
          <TextField
            id={`${idPrefix}-uf`}
            value={value.uf}
            onChange={(event) => set("uf", event.target.value.toUpperCase().slice(0, 2))}
            maxLength={2}
            placeholder="CE"
            autoComplete="off"
          />
        </Field>
      </div>

      <LocationPicker
        latitude={value.latitude}
        longitude={value.longitude}
        onMove={move}
        onClear={clearPin}
        busy={shown === "loading"}
      />
    </div>
  );
}
