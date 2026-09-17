import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { LayoutSeat, Marker } from "@/lib/seating/api";
import { RoomPreview, toneAt, toneSwatch } from "./room-preview";

/** A ring of chairs around the origin, which is the shape that broke labels. */
function ring(count: number, radius: number): LayoutSeat[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      id: `s${index}`, sectionId: "stands", row: "1", seat: String(index + 1),
      category: "Arquibancada", kind: "standard", rowOrder: 0, seatOrder: index,
      x: 264 + radius * Math.sin(angle), y: 264 - radius * Math.cos(angle),
    } as unknown as LayoutSeat;
  });
}
const arena: Marker = {
  id: "arena", name: "Arena", kind: "arena", capacity: 0,
  x: 114, y: 114, width: 300, height: 300,
};
const block: LayoutSeat[] = [0, 1, 2].map((index) => ({
  id: `b${index}`, sectionId: "stalls", row: "A", seat: String(index + 1),
  category: "Plateia", kind: "standard", rowOrder: 0, seatOrder: index,
  x: 100 + index * 24, y: 500,
}) as unknown as LayoutSeat);

const names = { stands: "Arquibancada", stalls: "Plateia", arena: "Arena" };
const labelY = (text: string) =>
  Number(screen.getByText(text).getAttribute("y"));

afterEach(cleanup);

describe("naming the parts of a drawn room", () => {
  it("lifts a ring's name clear of whatever sits in the middle of it", () => {
    render(<RoomPreview seats={ring(24, 200)} markers={[arena]} names={names} />);
    // Both names exist and neither is drawn at the other's spot: the stands
    // average out to the centre of the room, which is where the arena is.
    expect(screen.getByText("Arquibancada")).toBeInTheDocument();
    expect(screen.getByText("Arena")).toBeInTheDocument();
    expect(labelY("Arquibancada")).toBeLessThan(arena.y);
    expect(labelY("Arena")).toBe(arena.y + arena.height / 2);
  });

  it("leaves an ordinary block's name in the middle of its own chairs", () => {
    render(<RoomPreview seats={block} markers={[arena]} names={names} />);
    // Nothing sits on top of this one, so the plain centroid is still right.
    expect(labelY("Plateia")).toBe(500);
  });

  it("paints a part in its ticket's colour and leaves an unsold part grey", () => {
    const { container } = render(
      <RoomPreview seats={block} markers={[arena]} names={names}
        tones={{ Plateia: toneAt(0), arena: 0 }} />,
    );
    const seat = container.querySelector("circle");
    expect(seat?.getAttribute("class")).toContain("fill-chart-1");
    // An unsold marker keeps the room's own grey and its dashed outline.
    const rect = container.querySelector("ellipse, rect");
    expect(rect?.getAttribute("class")).not.toContain("chart");
  });

  it("gives a row's swatch a background class, not an SVG fill", () => {
    // The row's dot is an HTML element; fill-* would render it invisible.
    expect(toneSwatch(toneAt(0))).toMatch(/^bg-/);
    expect(toneSwatch(0)).toBe("bg-muted");
  });
});
