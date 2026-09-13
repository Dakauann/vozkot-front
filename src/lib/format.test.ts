import { centsToMoneyInput, formatMoney, parseMoneyToCents } from "@/lib/format";
import { describe, expect, it } from "vitest";

describe("parseMoneyToCents", () => {
  it("reads a decimal point written either way", () => {
    // The bug this pins: "240.00" used to be read as grouping and became
    // R$ 24.000,00 on a pt-BR screen.
    expect(parseMoneyToCents("240.00")).toBe(24_000);
    expect(parseMoneyToCents("240,00")).toBe(24_000);
    expect(parseMoneyToCents("240")).toBe(24_000);
    expect(parseMoneyToCents("240,5")).toBe(24_050);
  });

  it("reads grouped thousands in both conventions", () => {
    expect(parseMoneyToCents("1.240,50")).toBe(124_050);
    expect(parseMoneyToCents("1,240.50")).toBe(124_050);
    expect(parseMoneyToCents("1.500")).toBe(150_000);
    expect(parseMoneyToCents("12.345.678,90")).toBe(1_234_567_890);
  });

  it("accepts a currency symbol and spacing around the number", () => {
    expect(parseMoneyToCents("R$ 240,00")).toBe(24_000);
    expect(parseMoneyToCents(" 240,00 ")).toBe(24_000);
  });

  it("rejects anything without a number", () => {
    expect(parseMoneyToCents("")).toBeNaN();
    expect(parseMoneyToCents("abc")).toBeNaN();
    expect(parseMoneyToCents(",")).toBeNaN();
  });

  it("keeps a negative sign so validation can reject it", () => {
    expect(parseMoneyToCents("-10,00")).toBe(-1000);
  });
});

describe("money round trip", () => {
  it("survives the locale's own separators", () => {
    for (const locale of ["pt", "en", "de", "es"] as const) {
      const field = centsToMoneyInput(123_456, locale);
      expect(parseMoneyToCents(field)).toBe(123_456);
    }
  });
});

describe("formatMoney", () => {
  it("keeps the currency Brazilian while the separators follow the reader", () => {
    // A German operator of a Brazilian venue reads German separators and
    // Brazilian money; deriving the currency from the locale would relabel the
    // price as euros.
    expect(formatMoney(24_000, "pt")).toContain("240,00");
    expect(formatMoney(24_000, "de")).toContain("240,00");
    expect(formatMoney(24_000, "en")).toContain("240.00");
    expect(formatMoney(24_000, "en")).toMatch(/R\$/);
  });
});
