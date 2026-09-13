import { describe, expect, it } from "vitest";

import de from "./messages/de.json";
import en from "./messages/en.json";
import es from "./messages/es.json";
import { locales } from "./config";
import pt from "./messages/pt.json";

type Catalog = Record<string, unknown>;

const catalogs: Record<string, Catalog> = { pt, en, de, es };

function keysOf(value: Catalog, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = `${prefix}${key}`;
    return entry !== null && typeof entry === "object"
      ? keysOf(entry as Catalog, `${path}.`)
      : [path];
  });
}

describe("message catalogs", () => {
  const reference = keysOf(pt as Catalog).sort();

  it("ships one catalog per routed locale", () => {
    expect(Object.keys(catalogs).sort()).toEqual([...locales].sort());
  });

  /**
   * The check that matters: a key present in one language and missing in
   * another renders as a humanized key path to whoever is reading that
   * language, and nobody working in the default locale ever sees it.
   */
  it.each(["en", "de", "es"])("%s covers every key pt defines", (locale) => {
    const translated = keysOf(catalogs[locale]).sort();
    expect(translated).toEqual(reference);
  });

  it("leaves no message empty", () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      const empty = flatten(catalog).filter(([, value]) => value.trim() === "");
      expect(empty, `${locale} has empty messages`).toEqual([]);
    }
  });

  it("keeps ICU placeholders identical across languages", () => {
    const expected = new Map(flatten(pt as Catalog).map(([key, value]) => [key, placeholders(value)]));
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const [key, value] of flatten(catalog)) {
        expect(placeholders(value), `${locale} → ${key}`).toEqual(expected.get(key));
      }
    }
  });
});

function flatten(value: Catalog, prefix = ""): [string, string][] {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = `${prefix}${key}`;
    if (entry !== null && typeof entry === "object") return flatten(entry as Catalog, `${path}.`);
    return [[path, String(entry)] as [string, string]];
  });
}

/**
 * The variable names a message interpolates.
 *
 * A name is only a placeholder when the brace closes right after it or a comma
 * follows, which is what separates `{value}` and `{count, plural, ...}` from a
 * plural branch's own text such as `{nenhum lote}`.
 */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{\s*(\w+)\s*(?:,|\})/g)].map((match) => match[1]).sort();
}
