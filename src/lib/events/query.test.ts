import { describe, expect, it } from "vitest";

import { buildEventQuery, parseEventQuery, patchParams, toPairs } from "./query";
import { DEFAULT_PAGE_SIZE, MAX_OFFSET, MAX_PAGE_SIZE } from "./types";

/**
 * The catalogue's URL contract.
 *
 * These are the tests that matter for search, filtering and pagination,
 * because the URL is the only state any of the three has. A bug here is not a
 * rendering glitch: it is a shared link that opens the wrong events, a filter
 * that silently does nothing, or a page number that walks a buyer off the end
 * of the results.
 */

/** The URL a browser would have, as a page's `searchParams` prop. */
function url(query: string) {
  return Object.fromEntries(new URLSearchParams(query).entries());
}

describe("parseEventQuery: search", () => {
  it("reads a search term", () => {
    expect(parseEventQuery(url("q=rock+in+rio")).q).toBe("rock in rio");
  });

  it("trims surrounding whitespace", () => {
    expect(parseEventQuery(url("q=%20%20samba%20%20")).q).toBe("samba");
  });

  it("treats a blank term as no term at all", () => {
    // Otherwise the API is asked to full-text-search for "   ", which ranks
    // nothing and returns an empty catalogue for a buyer who searched for
    // nothing.
    expect(parseEventQuery(url("q=%20%20")).q).toBeUndefined();
    expect(parseEventQuery(url("q=")).q).toBeUndefined();
  });

  it("keeps punctuation the search engine understands", () => {
    expect(parseEventQuery(url('q=%22rock+in+rio%22+-tribute')).q).toBe('"rock in rio" -tribute');
  });
});

describe("parseEventQuery: filtering", () => {
  it("keeps a category it knows", () => {
    expect(parseEventQuery(url("category=festas_shows")).category).toBe("festas_shows");
  });

  it("drops a category it does not know", () => {
    // A link shared two years ago must still open the catalogue. Rejecting the
    // request would turn every renamed category into a broken bookmark.
    expect(parseEventQuery(url("category=vinyl_fairs")).category).toBeUndefined();
    expect(parseEventQuery(url("category=")).category).toBeUndefined();
  });

  it("keeps a sort it knows and drops one it does not", () => {
    expect(parseEventQuery(url("sort=price")).sort).toBe("price");
    expect(parseEventQuery(url("sort=cheapest")).sort).toBeUndefined();
  });

  it("reads the boolean filters as absent unless they say true", () => {
    expect(parseEventQuery(url("free=true")).free).toBe(true);
    expect(parseEventQuery(url("free=false")).free).toBeUndefined();
    expect(parseEventQuery(url("free=1")).free).toBeUndefined();
    expect(parseEventQuery(url("")).free).toBeUndefined();
    expect(parseEventQuery(url("available=true")).available).toBe(true);
  });

  it("reads a price ceiling and ignores a nonsensical one", () => {
    expect(parseEventQuery(url("maxPrice=15000")).maxPrice).toBe(15000);
    expect(parseEventQuery(url("maxPrice=abc")).maxPrice).toBeUndefined();
    expect(parseEventQuery(url("maxPrice=-1")).maxPrice).toBeUndefined();
  });

  it("carries a city through untouched", () => {
    expect(parseEventQuery(url("city=S%C3%A3o+Paulo")).city).toBe("São Paulo");
  });

  it("accepts URLSearchParams as readily as a params object", () => {
    const fromObject = parseEventQuery(url("q=jazz&category=festas_shows"));
    const fromParams = parseEventQuery(new URLSearchParams("q=jazz&category=festas_shows"));
    expect(fromParams).toEqual(fromObject);
  });
});

describe("parseEventQuery: pagination", () => {
  it("defaults to the first page at the default size", () => {
    const query = parseEventQuery(url(""));
    expect(query.limit).toBe(DEFAULT_PAGE_SIZE);
    expect(query.offset).toBe(0);
  });

  it("turns a page number into an offset", () => {
    expect(parseEventQuery(url("page=3")).offset).toBe(2 * DEFAULT_PAGE_SIZE);
  });

  it("caps the page size at the ceiling the API enforces", () => {
    // A client that could ask for 10,000 rows could make one request cost what
    // four hundred should.
    expect(parseEventQuery(url("limit=10000")).limit).toBe(MAX_PAGE_SIZE);
  });

  it("falls back to the default for a page size that makes no sense", () => {
    for (const raw of ["limit=0", "limit=-5", "limit=abc", "limit="]) {
      expect(parseEventQuery(url(raw)).limit, raw).toBe(DEFAULT_PAGE_SIZE);
    }
  });

  it("never asks for an offset past the API's ceiling", () => {
    // The server clamps the offset. Passing a deeper one through would show
    // page one's events under a heading that claims to be page 9999.
    for (const raw of ["page=9999", "page=999999999", `page=${Number.MAX_SAFE_INTEGER}`]) {
      const query = parseEventQuery(url(raw));
      expect(query.offset, raw).toBeLessThanOrEqual(MAX_OFFSET);
    }
  });

  it("caps the page against the page size actually in use", () => {
    const big = parseEventQuery(url(`page=9999&limit=${MAX_PAGE_SIZE}`));
    expect(big.offset).toBeLessThanOrEqual(MAX_OFFSET);
    expect(big.limit).toBe(MAX_PAGE_SIZE);
  });

  it("treats a junk page number as the first page", () => {
    for (const raw of ["page=0", "page=-2", "page=abc", "page=1e999"]) {
      expect(parseEventQuery(url(raw)).offset, raw).toBe(0);
    }
  });
});

describe("buildEventQuery", () => {
  it("writes only what was asked for", () => {
    expect(buildEventQuery({})).toBe("");
    expect(buildEventQuery({ q: "jazz" })).toBe("q=jazz");
  });

  it("leaves a false filter off the address entirely", () => {
    // `free=false` and no `free` at all mean the same thing, and writing both
    // spellings gives one page two URLs, two cache entries and a duplicate for
    // search engines to choose between.
    expect(buildEventQuery({ free: false, available: false })).toBe("");
    expect(buildEventQuery({ offset: 0 })).toBe("");
  });

  it("writes an offset the API understands rather than a page number", () => {
    expect(buildEventQuery({ limit: 24, offset: 48 })).toBe("limit=24&offset=48");
  });

  it("survives a round trip through the address bar", () => {
    // Parsing is idempotent: what comes out of a built query string parses back
    // to the same query. Without this, one lap through a filter change loses a
    // parameter and nobody notices until a buyer reports the wrong results.
    const original = parseEventQuery(
      url("q=samba&category=festas_shows&city=Recife&free=true&sort=price&limit=12&page=4"),
    );
    const reparsed = parseEventQuery(
      // The address bar keeps pages, the API takes offsets, so the page is
      // restated here the way a link would carry it.
      url(`${buildEventQuery({ ...original, offset: undefined })}&page=4`),
    );
    expect(reparsed).toEqual(original);
  });
});

describe("toPairs", () => {
  it("keeps single values", () => {
    expect(toPairs({ q: "jazz", city: "Recife" })).toEqual([
      ["q", "jazz"],
      ["city", "Recife"],
    ]);
  });

  it("keeps the first of a repeated parameter and drops empties", () => {
    expect(toPairs({ city: ["Recife", "Olinda"], missing: undefined, none: [] })).toEqual([
      ["city", "Recife"],
    ]);
  });
});

describe("patchParams", () => {
  it("sets what it is given", () => {
    const next = patchParams(new URLSearchParams("q=jazz"), { category: "festas_shows" });
    expect(next.get("q")).toBe("jazz");
    expect(next.get("category")).toBe("festas_shows");
  });

  it("removes a parameter set to null or empty", () => {
    const next = patchParams(new URLSearchParams("q=jazz&city=Recife"), { q: null, city: "" });
    expect(next.toString()).toBe("");
  });

  it("resets the page whenever a filter changes", () => {
    const next = patchParams(new URLSearchParams("page=7&q=jazz"), { category: "esportivo" });
    expect(next.has("page")).toBe(false);
  });

  it("still lets a pagination link name its page", () => {
    const next = patchParams(new URLSearchParams("page=7&q=jazz"), { page: "3" });
    expect(next.get("page")).toBe("3");
    expect(next.get("q")).toBe("jazz");
  });

  it("keeps parameters it does not know about", () => {
    // Campaign tags belong to whoever put them on the link, not to the filter
    // row. Dropping them would break attribution the moment a visitor filters.
    const next = patchParams(new URLSearchParams("utm_source=news&q=jazz"), { q: "rock" });
    expect(next.get("utm_source")).toBe("news");
  });

  it("does not mutate the parameters it was given", () => {
    // The caller's copy comes from useSearchParams and is shared with React.
    const current = new URLSearchParams("q=jazz&page=2");
    patchParams(current, { q: "rock" });
    expect(current.toString()).toBe("q=jazz&page=2");
  });
});
