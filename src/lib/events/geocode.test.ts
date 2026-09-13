import { afterEach, describe, expect, it, vi } from "vitest";

import { CEP_DIGITS, cepDigits, lookupPostalCode } from "./geocode";

/**
 * The postcode lookup is what moves the pin, so the two things that matter are
 * that it recognises a CEP however it was punctuated, and that it never throws
 * — it runs while somebody is typing, and a rejected promise there is a form
 * that silently stops responding.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cepDigits", () => {
  it("accepts every shape an operator pastes", () => {
    for (const raw of ["60861630", "60861-630", "60.861-630", " 60861 630 "]) {
      expect(cepDigits(raw), raw).toBe("60861630");
    }
  });

  it("refuses anything that is not eight digits", () => {
    for (const raw of ["", "6086163", "608616300", "abcdefgh", "   "]) {
      expect(cepDigits(raw), raw).toBeNull();
    }
  });

  it("agrees with the digit count the API enforces", () => {
    expect(CEP_DIGITS).toBe(8);
  });
});

describe("lookupPostalCode", () => {
  function stubFetch(response: Partial<Response> | (() => never)) {
    const fetchMock = vi.fn(async () => {
      if (typeof response === "function") response();
      return response as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("reads an address and a point out of the v2 response", async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: async () => ({
        cep: "60861630",
        state: "ce",
        city: "Fortaleza",
        neighborhood: "Castelão",
        street: "Avenida Alberto Craveiro",
        // Quoted, exactly as the API sends them. Decoding these as numbers is
        // the bug this endpoint's clients keep hitting.
        location: { coordinates: { longitude: "-38.522", latitude: "-3.807" } },
      }),
    } as Partial<Response>);

    const outcome = await lookupPostalCode("60861-630");
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;

    expect(outcome.address.postalCode).toBe("60861-630");
    expect(outcome.address.street).toBe("Avenida Alberto Craveiro");
    expect(outcome.address.city).toBe("Fortaleza");
    // Upper-cased, because the form and the API both want the two-letter form.
    expect(outcome.address.uf).toBe("CE");
    expect(outcome.address.latitude).toBe(-3.807);
    expect(outcome.address.longitude).toBe(-38.522);
  });

  it("returns the address without a point when the service has no coordinates", async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: async () => ({ state: "CE", city: "Fortaleza", street: "Rua X", location: {} }),
    } as Partial<Response>);

    const outcome = await lookupPostalCode("60861630");
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    // Both absent, never one: half a pin fails the form's own validation.
    expect(outcome.address.latitude).toBeUndefined();
    expect(outcome.address.longitude).toBeUndefined();
    expect(outcome.address.city).toBe("Fortaleza");
  });

  it("treats an empty coordinate string as no coordinate, not as zero", async () => {
    // "" coerces to 0, which is a real point in the Atlantic. Storing it would
    // put the venue in the Gulf of Guinea.
    stubFetch({
      ok: true,
      status: 200,
      json: async () => ({
        location: { coordinates: { latitude: "", longitude: "" } },
      }),
    } as Partial<Response>);

    const outcome = await lookupPostalCode("60861630");
    if (outcome.status !== "ok") throw new Error("expected ok");
    expect(outcome.address.latitude).toBeUndefined();
  });

  it("reports a postcode the service does not know", async () => {
    stubFetch({ ok: false, status: 404 } as Partial<Response>);
    expect((await lookupPostalCode("00000000")).status).toBe("not_found");
  });

  it("does not ask when the input is not a postcode", async () => {
    const fetchMock = stubFetch({ ok: true, status: 200 } as Partial<Response>);
    expect((await lookupPostalCode("123")).status).toBe("not_found");
    // Spending a request to be told what we already knew.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a server error as unavailable rather than as not found", async () => {
    // The difference matters to the operator: "we could not check" invites a
    // retry, "no such postcode" tells them to correct a field that is right.
    stubFetch({ ok: false, status: 500 } as Partial<Response>);
    expect((await lookupPostalCode("60861630")).status).toBe("unavailable");
  });

  it("never throws when the network does", async () => {
    stubFetch(() => {
      throw new Error("offline");
    });
    expect((await lookupPostalCode("60861630")).status).toBe("unavailable");
  });
});
