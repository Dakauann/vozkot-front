import { afterEach, describe, expect, it, vi } from "vitest";

import { CEP_DIGITS, cepDigits, lookupPostalCode, searchAddresses } from "./geocode";

/**
 * The postcode lookup is what moves the pin, so the two things that matter are
 * that it recognises a CEP however it was punctuated, and that it never throws;
 * it runs while somebody is typing, and a rejected promise there is a form
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

/**
 * The address search is what fills five form fields and drops the pin from one
 * click, so the tests are about the translation step: OpenStreetMap's shape is
 * not the form's shape, and every mismatch between them ends up stored on an
 * event and printed on a ticket.
 */
describe("searchAddresses", () => {
  function stubSearch(features: unknown[], ok = true) {
    const fetchMock = vi.fn(async () => ({
      ok,
      status: ok ? 200 : 503,
      json: async () => ({ features }),
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    return fetchMock;
  }

  /** Photon's own shape, copied from a real response for Rua Harmonia. */
  function feature(properties: Record<string, unknown>, coordinates = [-46.6901877, -23.5521457]) {
    return { geometry: { type: "Point", coordinates }, properties };
  }

  it("does not ask about a query too short to mean anything", async () => {
    const fetchMock = stubSearch([]);
    expect(await searchAddresses("ru")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flattens a house result into the street line the form stores", async () => {
    stubSearch([
      feature({
        osm_type: "W",
        osm_id: 450169794,
        name: "Edifício Madalena",
        street: "Rua Harmonia",
        housenumber: "755",
        district: "Vila Madalena",
        city: "São Paulo",
        state: "São Paulo",
        postcode: "05435-000",
        countrycode: "BR",
      }),
    ]);

    const [found] = await searchAddresses("rua harmonia 755");
    expect(found.name).toBe("Edifício Madalena");
    expect(found.street).toBe("Rua Harmonia, 755");
    expect(found.neighborhood).toBe("Vila Madalena");
    expect(found.city).toBe("São Paulo");
    expect(found.uf).toBe("SP");
    expect(found.postalCode).toBe("05435-000");
    expect(found).toMatchObject({ latitude: -23.5521457, longitude: -46.6901877 });
  });

  it("does not pass a street off as a venue name", async () => {
    // A road result has the road in `name` and no `street` at all. Copying
    // that into the venue field would print "Rua Harmonia" on a ticket.
    stubSearch([
      feature({
        osm_type: "W",
        osm_id: 699663666,
        osm_key: "highway",
        type: "street",
        name: "Rua Harmonia",
        district: "Vila Madalena",
        city: "São Paulo",
        state: "São Paulo",
        countrycode: "BR",
      }),
    ]);

    const [found] = await searchAddresses("rua harmonia");
    expect(found.name).toBe("");
    expect(found.street).toBe("Rua Harmonia");
  });

  it("turns every state name into the two letters the API accepts", async () => {
    // The form stores a UF and the API validates one. OSM sends the full name,
    // and it is not consistent about accents, so both spellings must land.
    const states: [string, string][] = [
      ["São Paulo", "SP"],
      ["Rio Grande do Sul", "RS"],
      ["Ceará", "CE"],
      ["Ceara", "CE"],
      ["Distrito Federal", "DF"],
      ["Espírito Santo", "ES"],
      ["Paraná", "PR"],
    ];
    for (const [state, uf] of states) {
      stubSearch([feature({ name: "Casa", street: "Rua A", state, countrycode: "BR" })]);
      const [found] = await searchAddresses("casa");
      expect(found.uf, state).toBe(uf);
    }
  });

  it("leaves the state blank rather than guessing at one it does not know", async () => {
    stubSearch([feature({ name: "Casa", street: "Rua A", state: "Somewhere", countrycode: "BR" })]);
    const [found] = await searchAddresses("casa");
    expect(found.uf).toBe("");
  });

  it("drops results outside Brazil, which the bounding box only de-ranks", async () => {
    stubSearch([
      feature({ name: "Teatro UC", city: "Ñuñoa", state: "Santiago", countrycode: "CL" }),
      feature({ name: "Teatro Municipal", city: "São Paulo", state: "São Paulo", countrycode: "BR" }),
    ]);

    const found = await searchAddresses("teatro");
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe("Teatro Municipal");
  });

  it("drops a result with no point, which could not place a pin", async () => {
    stubSearch([
      { geometry: undefined, properties: { name: "Sem ponto", countrycode: "BR" } },
      feature({ name: "Com ponto", countrycode: "BR" }),
    ]);

    const found = await searchAddresses("ponto");
    expect(found.map((item) => item.name)).toEqual(["Com ponto"]);
  });

  it("keeps a partial postcode out of the form instead of half-filling it", async () => {
    stubSearch([feature({ name: "Casa", street: "Rua A", postcode: "05435", countrycode: "BR" })]);
    const [found] = await searchAddresses("casa");
    expect(found.postalCode).toBe("");
  });

  it("answers with nothing rather than throwing when the service is down", async () => {
    stubSearch([], false);
    await expect(searchAddresses("qualquer coisa")).resolves.toEqual([]);
  });

  it("answers with nothing rather than throwing when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch);
    await expect(searchAddresses("qualquer coisa")).resolves.toEqual([]);
  });

  it("asks only for Brazil and only for a listful of results", async () => {
    const fetchMock = stubSearch([]);
    await searchAddresses("espaço aurora");

    const [requested] = fetchMock.mock.calls[0] as unknown as [RequestInfo];
    const url = new URL(String(requested));
    expect(url.searchParams.get("q")).toBe("espaço aurora");
    expect(url.searchParams.get("bbox")).toBe("-73.99,-33.75,-28.85,5.27");
    expect(Number(url.searchParams.get("limit"))).toBeLessThanOrEqual(10);
  });
});
