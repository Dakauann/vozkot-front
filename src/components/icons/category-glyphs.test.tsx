import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { EVENT_CATEGORIES } from "@/lib/events/types";
import { CATEGORY_GLYPHS } from "./category-glyphs";

/** The drawing itself, as markup, for comparing one glyph against another. */
function geometryOf(category: (typeof EVENT_CATEGORIES)[number]): string {
  const Glyph = CATEGORY_GLYPHS[category];
  const { container, unmount } = render(<Glyph size={24} />);
  const svg = container.querySelector("svg");
  const shapes = svg?.innerHTML ?? "";
  const result = { shapes, svg };
  const box = svg?.getAttribute("viewBox");
  unmount();
  return JSON.stringify({ shapes: result.shapes, box });
}

describe("a drawing for every category", () => {
  it("covers all sixteen, with nothing missing", () => {
    for (const category of EVENT_CATEGORIES) {
      expect(CATEGORY_GLYPHS[category], `no glyph for ${category}`).toBeTypeOf("function");
    }
    expect(Object.keys(CATEGORY_GLYPHS)).toHaveLength(EVENT_CATEGORIES.length);
  });

  it("gives each category its OWN drawing", () => {
    // The failure this guards is the one the strip avoided icons over for so
    // long: two categories quietly wearing the same mark, which looks decided
    // when it was arbitrary.
    const seen = new Map<string, string>();
    for (const category of EVENT_CATEGORIES) {
      const geometry = geometryOf(category);
      const twin = seen.get(geometry);
      expect(twin, `${category} is drawn identically to ${twin}`).toBeUndefined();
      seen.set(geometry, category);
    }
  });

  it("draws on the house grid, so they sit beside the generated set", () => {
    for (const category of EVENT_CATEGORIES) {
      const Glyph = CATEGORY_GLYPHS[category];
      const { container, unmount } = render(<Glyph size={20} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg.getAttribute("fill")).toBe("none");
      // Optical ramp, not a flat nominal weight: 27.6/20 + 0.35 = 1.73.
      expect(svg.getAttribute("style")).toContain("1.73");
      // At least one real shape, so an empty glyph cannot ship silently.
      expect(svg.querySelectorAll("path, circle, rect, ellipse").length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("is decorative, because the tile's own text names the category", () => {
    const { container } = render(<CATEGORY_GLYPHS.pride size={16} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
  });
});
