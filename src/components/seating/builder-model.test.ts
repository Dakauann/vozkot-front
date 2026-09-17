import { describe as suite, expect, it } from "vitest";

import { blocksFrom, collisionsIn, extentOf } from "./builder-model";
import type { LayoutSeat } from "@/lib/seating/api";

/**
 * The frame a block is drawn in.
 *
 * This is the one piece of client-side geometry that can lie without anybody
 * noticing, because an SVG clips silently: a frame one column too small does
 * not error, it just draws fewer chairs than the room has. It did exactly that
 * — sixteen seats per row rendered as nine — so it is measured from the seats
 * now, and these tests are what hold it there.
 */

/** A block of rows at the generator's real defaults: 24 across, 28 apart. */
function block(
  sectionId: string,
  options: { rows: number; perRow: number; atX: number; atY: number },
): LayoutSeat[] {
  const seats: LayoutSeat[] = [];
  for (let row = 0; row < options.rows; row += 1) {
    for (let seat = 0; seat < options.perRow; seat += 1) {
      seats.push({
        id: `${sectionId}-${row}-${seat}`,
        sectionId,
        row: String(row + 1),
        seat: String(seat + 1),
        x: options.atX + seat * 24,
        y: options.atY + row * 28,
        kind: "standard",
        rowOrder: row + 1,
        seatOrder: seat + 1,
      });
    }
  }
  return seats;
}

suite("extentOf", () => {
  it("measures a box that holds every point", () => {
    const extent = extentOf([
      { x: 10, y: 4 },
      { x: 90, y: 4 },
      { x: 50, y: 60 },
    ]);
    expect(extent).toEqual({ minX: 10, minY: 4, width: 80, height: 56 });
  });

  it("never returns a zero dimension, so a single seat still has a frame", () => {
    const extent = extentOf([{ x: 5, y: 5 }]);
    expect(extent.width).toBe(1);
    expect(extent.height).toBe(1);
  });
});

suite("blocksFrom", () => {
  it("frames a block around all of its seats", () => {
    const seats = block("sec_a", { rows: 10, perRow: 16, atX: 320, atY: 120 });
    const blocks = blocksFrom({
      keys: ["node_a"],
      sections: [{ id: "sec_a" }],
      seats,
    });

    // 16 seats, 24 apart: the span is 15 gaps, not 16, and certainly not half
    // of it. A frame of 180 is what clipped a sixteen-wide row down to nine.
    expect(blocks.node_a.width).toBe(15 * 24);
    expect(blocks.node_a.height).toBe(9 * 28);
    expect(blocks.node_a.seats).toHaveLength(160);
  });

  it("frames from the seats even when the section's offset disagrees", () => {
    // The whole point. Whatever any other number says about where this block
    // begins, every seat lands inside the frame.
    const seats = block("sec_a", { rows: 4, perRow: 8, atX: 500, atY: 300 });
    const blocks = blocksFrom({
      keys: ["node_a"],
      sections: [{ id: "sec_a", offsetX: 0, offsetY: 0 } as { id: string }],
      seats,
    });

    const frame = blocks.node_a;
    for (const seat of seats) {
      expect(seat.x - frame.originX).toBeGreaterThanOrEqual(0);
      expect(seat.x - frame.originX).toBeLessThanOrEqual(frame.width);
      expect(seat.y - frame.originY).toBeGreaterThanOrEqual(0);
      expect(seat.y - frame.originY).toBeLessThanOrEqual(frame.height);
    }
  });

  it("matches each response to the piece that asked for it, by order", () => {
    // A stage sells nothing and produces no seats, so the list of sections and
    // the list of seat groups are different lengths — which is exactly where an
    // index-by-seat-group would put the plateia's chairs in the camarote's box.
    const plateia = block("sec_plateia", { rows: 2, perRow: 4, atX: 200, atY: 200 });
    const balcao = block("sec_balcao", { rows: 3, perRow: 5, atX: 900, atY: 40 });
    const blocks = blocksFrom({
      keys: ["node_stage", "node_plateia", "node_booth", "node_balcao"],
      sections: [
        { id: "sec_stage" },
        { id: "sec_plateia" },
        { id: "sec_booth" },
        { id: "sec_balcao" },
      ],
      seats: [...plateia, ...balcao],
    });

    expect(Object.keys(blocks).sort()).toEqual(["node_balcao", "node_plateia"]);
    expect(blocks.node_plateia.seats).toHaveLength(8);
    expect(blocks.node_balcao.seats).toHaveLength(15);
    expect(blocks.node_balcao.originX).toBe(900);
  });

  it("leaves out a piece the response has no seats for", () => {
    // A block whose first preview is still in flight, or one the server refused
    // to draw. It gets no frame, and the node shows that it is being drawn
    // rather than an empty box that reads as a failure.
    const blocks = blocksFrom({
      keys: ["node_a", "node_b"],
      sections: [{ id: "sec_a" }, { id: "sec_b" }],
      seats: block("sec_a", { rows: 1, perRow: 2, atX: 0, atY: 0 }),
    });
    expect(blocks.node_a).toBeDefined();
    expect(blocks.node_b).toBeUndefined();
  });

  it("ignores a response that has more sections than the canvas has pieces", () => {
    // A late response from before a piece was deleted. Without the recorded
    // order it would key geometry under a node id that no longer exists — and
    // with more sections than keys, under `undefined`.
    const blocks = blocksFrom({
      keys: ["node_a"],
      sections: [{ id: "sec_a" }, { id: "sec_b" }],
      seats: [
        ...block("sec_a", { rows: 1, perRow: 2, atX: 0, atY: 0 }),
        ...block("sec_b", { rows: 1, perRow: 2, atX: 400, atY: 0 }),
      ],
    });
    expect(Object.keys(blocks)).toEqual(["node_a"]);
  });
});

suite("collisionsIn", () => {
  const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

  it("names every piece involved, not just the first pair", () => {
    // One block nudged into two others is two problems, and an organiser wants
    // to see both rather than fix one and discover the next.
    const hit = collisionsIn({
      middle: box(100, 100, 200, 200),
      left: box(50, 150, 100, 100),
      right: box(250, 150, 100, 100),
      away: box(600, 600, 100, 100),
    });
    expect([...hit].sort()).toEqual(["left", "middle", "right"]);
  });

  it("allows sectors that share an edge", () => {
    // A balcony directly behind the stalls, two stands meeting at a corner.
    // The most ordinary room there is.
    expect(collisionsIn({ a: box(0, 0, 200, 100), b: box(200, 0, 200, 100) }).size).toBe(0);
    expect(collisionsIn({ a: box(0, 0, 200, 100), b: box(0, 100, 200, 100) }).size).toBe(0);
    expect(collisionsIn({ a: box(0, 0, 200, 100), b: box(200, 100, 200, 100) }).size).toBe(0);
  });

  it("needs both dimensions to overlap", () => {
    // Two columns of seats side by side share every bit of their height and
    // none of their width. That is a room, not a collision.
    expect(collisionsIn({ a: box(0, 0, 100, 600), b: box(100, 0, 100, 600) }).size).toBe(0);
  });

  it("ignores a piece with no footprint", () => {
    // A block whose first preview has not landed has no box yet, and flagging
    // it would mark a collision against a rectangle that is not on screen.
    expect(collisionsIn({ pending: box(100, 100, 0, 0), real: box(100, 100, 200, 200) }).size).toBe(
      0,
    );
  });

  it("agrees with the server about what counts as touching", () => {
    // One unit of slack, the same constant the Go side uses. A hair of overlap
    // from a rounded drag is not a room somebody has broken.
    expect(collisionsIn({ a: box(0, 0, 200, 100), b: box(199, 0, 200, 100) }).size).toBe(0);
    expect(collisionsIn({ a: box(0, 0, 200, 100), b: box(150, 50, 200, 100) }).size).toBe(2);
  });
});
