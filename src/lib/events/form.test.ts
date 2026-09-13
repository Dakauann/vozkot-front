import { describe, expect, it } from "vitest";

import {
  emptyEventForm,
  eventFormFrom,
  firstInvalid,
  normalisePostalCode,
  validateEventForm,
  type ErrorKey,
  type EventFormState,
} from "./form";
import type { EventSummary } from "./types";

/** The key itself, so a test asserts on the rule rather than on its wording. */
const key = (name: ErrorKey) => name;

/** A form that passes, which each test then breaks in exactly one way. */
function valid(overrides: Partial<EventFormState> = {}): EventFormState {
  return {
    ...emptyEventForm(),
    name: "Festival Aurora",
    category: "festas_shows",
    startsAt: "2026-11-15T22:00",
    venue: "Arena Castelão",
    address: "Av. Alberto Craveiro, 2901",
    city: "Fortaleza",
    uf: "CE",
    ...overrides,
  };
}

describe("validateEventForm", () => {
  it("accepts a complete event and builds the request body", () => {
    const { input, errors } = validateEventForm(valid(), key);
    expect(errors).toEqual({});
    expect(input).toBeDefined();
    expect(input?.name).toBe("Festival Aurora");
    expect(input?.location.city).toBe("Fortaleza");
    expect(input?.status).toBe("draft");
  });

  it("never returns a body alongside an error", () => {
    // The two must not be able to disagree: a caller that reads `input` without
    // checking `errors` would otherwise post a half-validated event.
    const { input, errors } = validateEventForm(valid({ name: "  " }), key);
    expect(errors.name).toBe("errors.name");
    expect(input).toBeUndefined();
  });

  it("requires the fields a listing cannot render without", () => {
    expect(validateEventForm(valid({ name: "" }), key).errors.name).toBe("errors.name");
    expect(validateEventForm(valid({ venue: "  " }), key).errors.venue).toBe("errors.venue");
    expect(validateEventForm(valid({ city: "" }), key).errors.city).toBe("errors.city");
    expect(validateEventForm(valid({ startsAt: "" }), key).errors.startsAt).toBe("errors.startsAt");
  });

  it("rejects a category the catalogue has no filter for", () => {
    const state = valid({ category: "vinyl_fairs" as EventFormState["category"] });
    expect(validateEventForm(state, key).errors.category).toBe("errors.category");
  });

  it("wants a two-letter state", () => {
    expect(validateEventForm(valid({ uf: "" }), key).errors.uf).toBe("errors.uf");
    expect(validateEventForm(valid({ uf: "Ceará" }), key).errors.uf).toBe("errors.uf");
    expect(validateEventForm(valid({ uf: "C1" }), key).errors.uf).toBe("errors.uf");
  });

  it("uppercases the state rather than refusing a lowercase one", () => {
    const { input, errors } = validateEventForm(valid({ uf: "ce" }), key);
    expect(errors.uf).toBeUndefined();
    expect(input?.location.uf).toBe("CE");
  });

  it("trims the text that reaches the API", () => {
    const { input } = validateEventForm(
      valid({ name: "  Festival Aurora  ", venue: " Arena Castelão " }),
      key,
    );
    expect(input?.name).toBe("Festival Aurora");
    expect(input?.location.venue).toBe("Arena Castelão");
  });

  it("treats the end as optional", () => {
    const { input, errors } = validateEventForm(valid({ endsAt: "" }), key);
    expect(errors.endsAt).toBeUndefined();
    // Omitted, not empty: the column is a nullable timestamp and "" is not one.
    expect(input && "endsAt" in input).toBe(false);
  });

  it("sends an end that follows the start", () => {
    const { input, errors } = validateEventForm(
      valid({ startsAt: "2026-11-15T22:00", endsAt: "2026-11-16T04:00" }),
      key,
    );
    expect(errors.endsAt).toBeUndefined();
    expect(input?.endsAt).toBeDefined();
  });

  it("refuses an end at or before the start", () => {
    const before = valid({ startsAt: "2026-11-15T22:00", endsAt: "2026-11-15T20:00" });
    expect(validateEventForm(before, key).errors.endsAt).toBe("errors.endsBeforeStart");

    // Equal is a typo every time, and would render as "22:00 – 22:00".
    const same = valid({ startsAt: "2026-11-15T22:00", endsAt: "2026-11-15T22:00" });
    expect(validateEventForm(same, key).errors.endsAt).toBe("errors.endsBeforeStart");
  });

  it("refuses half a pin", () => {
    // The API rejects an unpaired coordinate, so catching it here saves the
    // whole save rather than losing it to a round trip.
    expect(validateEventForm(valid({ latitude: -3.807 }), key).errors.latitude).toBe(
      "errors.coordinates",
    );
    expect(validateEventForm(valid({ longitude: -38.522 }), key).errors.latitude).toBe(
      "errors.coordinates",
    );
  });

  it("sends a whole pin through", () => {
    const { input, errors } = validateEventForm(
      valid({ latitude: -3.807, longitude: -38.522 }),
      key,
    );
    expect(errors.latitude).toBeUndefined();
    expect(input?.location.latitude).toBe(-3.807);
    expect(input?.location.longitude).toBe(-38.522);
  });

  it("keeps a pin on the equator or the prime meridian", () => {
    // Zero is a real coordinate. A truthiness check here would silently drop it
    // and hand the event back to the geocoder.
    const { input, errors } = validateEventForm(valid({ latitude: 0, longitude: 0 }), key);
    expect(errors.latitude).toBeUndefined();
    expect(input?.location.latitude).toBe(0);
    expect(input?.location.longitude).toBe(0);
  });

  it("omits the coordinates entirely when there is no pin", () => {
    // Absent means "geocode this for me". Sending nulls would mean something
    // else, and sending zeros would mean the Atlantic.
    const { input } = validateEventForm(valid(), key);
    expect(input?.location.latitude).toBeUndefined();
    expect(input?.location.longitude).toBeUndefined();
  });

  it("normalises a postcode instead of refusing its punctuation", () => {
    const { input, errors } = validateEventForm(valid({ postalCode: "60861630" }), key);
    expect(errors.postalCode).toBeUndefined();
    expect(input?.location.postalCode).toBe("60861-630");
  });

  it("refuses a postcode that is not eight digits", () => {
    expect(validateEventForm(valid({ postalCode: "6086" }), key).errors.postalCode).toBe(
      "errors.postalCode",
    );
  });

  it("reports every problem at once", () => {
    // One round of corrections, not four. A validator that stops at the first
    // failure makes an operator submit the form once per mistake.
    const { errors } = validateEventForm({ ...emptyEventForm(), uf: "XYZ" }, key);
    expect(Object.keys(errors).sort()).toEqual(["city", "name", "startsAt", "uf", "venue"]);
  });

  it("does not claim the end is early when there is no start to compare it to", () => {
    // Two messages for one missing field is noise. The start is what is wrong,
    // and saying so once is enough.
    const { errors } = validateEventForm(valid({ startsAt: "", endsAt: "2026-11-16T04:00" }), key);
    expect(errors.startsAt).toBe("errors.startsAt");
    expect(errors.endsAt).toBeUndefined();
  });
});

describe("normalisePostalCode", () => {
  it("accepts the shapes an operator pastes", () => {
    for (const raw of ["60861630", "60861-630", "60.861-630", " 60861 630 "]) {
      expect(normalisePostalCode(raw), raw).toBe("60861-630");
    }
  });

  it("treats an empty field as no postcode rather than a bad one", () => {
    expect(normalisePostalCode("")).toBe("");
    expect(normalisePostalCode("   ")).toBe("");
  });

  it("refuses the wrong number of digits", () => {
    expect(normalisePostalCode("6086163")).toBeNull();
    expect(normalisePostalCode("608616300")).toBeNull();
    expect(normalisePostalCode("abcdefgh")).toBeNull();
  });
});

describe("eventFormFrom", () => {
  const event: EventSummary = {
    id: "evt_1",
    slug: "festival-aurora",
    name: "Festival Aurora",
    description: "Duas noites.",
    category: "festas_shows",
    location: {
      venue: "Arena Castelão",
      address: "Av. Alberto Craveiro, 2901",
      neighborhood: "Castelão",
      city: "Fortaleza",
      uf: "CE",
      postalCode: "60861-630",
      latitude: -3.807,
      longitude: -38.522,
    },
    startsAt: "2026-11-15T22:00:00.000Z",
    status: "published",
    media: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("carries every field into the form", () => {
    const form = eventFormFrom(event);
    expect(form.name).toBe("Festival Aurora");
    expect(form.category).toBe("festas_shows");
    expect(form.status).toBe("published");
    expect(form.venue).toBe("Arena Castelão");
    expect(form.latitude).toBe(-3.807);
    expect(form.longitude).toBe(-38.522);
  });

  it("leaves the end blank when the event has none", () => {
    expect(eventFormFrom(event).endsAt).toBe("");
  });

  it("round-trips back through validation unchanged", () => {
    // Loading an event and saving it without touching anything must not alter
    // it. Anything that fails here is a field the edit screen quietly rewrites.
    const { input, errors } = validateEventForm(eventFormFrom(event), key);
    expect(errors).toEqual({});
    expect(input?.name).toBe(event.name);
    expect(input?.location).toMatchObject(event.location);
    expect(input?.startsAt).toBe(event.startsAt);
  });
});

describe("firstInvalid", () => {
  it("names the field to focus, top of the form first", () => {
    expect(firstInvalid({ city: "x", name: "y" })).toBe("name");
    expect(firstInvalid({ uf: "x", venue: "y" })).toBe("venue");
  });

  it("is null when nothing failed", () => {
    expect(firstInvalid({})).toBeNull();
  });
});
