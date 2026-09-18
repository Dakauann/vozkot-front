// Deliberately NOT "use client", unlike the generated set beside it. These
// are pure SVG with no state, and CATEGORY_GLYPHS is a plain OBJECT that a
// server component indexes into. Across a client boundary that export
// arrives as a module reference rather than the map, and the lookup throws
// at render, which is what it did.
import * as React from "react";

import type { Icon } from "./types";
import type { EventCategory } from "@/lib/events/types";

/**
 * One drawing per event category.
 *
 * WHY THESE ARE NOT IN ./glyphs.tsx: that file is generated from ./svg by a
 * tool that lives outside this repository, and its header says so. These are
 * hand-authored to the same contract: 24x24 grid, 1.5 nominal stroke, round
 * terminals, a `currentColor` base and an `--icon-accent` highlight, so they
 * sit beside the generated ones without reading as a second set. The geometry
 * lives HERE and nowhere else: copying it into ./svg as well would be a second
 * source of truth for the same drawing. Whoever next runs the generator should
 * move these into it and delete this file.
 *
 * WHY THEY EXIST AT ALL: the collection strip carried no icons, deliberately,
 * because the app's set is a UI set. It has no trophy, no fork, no mask, no
 * controller and no rainbow, and mapping sixteen categories onto what it does
 * have would have put the same unrelated glyph on "Esportivo" and "Saúde e bem
 * estar", which looks decided when it was arbitrary, and is worse than
 * nothing. That objection was about ARBITRARY icons, not about icons. Every
 * drawing below is specific to the category it names.
 *
 * "Religião e espiritualidade" is a flame rather than any faith's own symbol:
 * the category spans all of them, and picking one would be a statement the
 * product has no business making.
 */
const ACCENT = "var(--icon-accent, currentColor)";
const DEFAULT_SIZE = 16;

/**
 * The same optical ramp the generated set uses.
 *
 * Duplicated rather than imported because the generated module does not export
 * it. Keep it in step with glyphs.tsx if that ever changes: a category tile
 * sitting beside a UI icon at the same size must carry the same weight.
 */
function strokeFor(size: number): number {
  const w = 27.6 / size + 0.35;
  return Math.min(2.4, Math.max(1.5, Math.round(w * 100) / 100));
}

function glyph(displayName: string, children: React.ReactNode): Icon {
  const Glyph: Icon = ({
    size = DEFAULT_SIZE,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    weight: _weight,
    mirrored,
    color,
    style,
    ...rest
  }) => {
    const px = typeof size === "number" ? size : Number.parseFloat(size) || DEFAULT_SIZE;
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke={color ?? "currentColor"}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        style={{
          strokeWidth: `calc(${strokeFor(px)} * var(--icon-stroke-scale, 1))`,
          ...(mirrored ? { transform: "scaleX(-1)" } : null),
          ...style,
        }}
        {...rest}
      >
        {children}
      </svg>
    );
  };
  Glyph.displayName = displayName;
  return Glyph;
}

/** Festas e shows: a beamed pair of notes, the near head in the accent. */
const Notes = glyph(
  "CategoryNotes",
  <>
    <path d="M9.25 16.75V6.1l9-1.85V14.9" />
    <ellipse cx="7" cy="17" rx="2.25" ry="1.9" stroke={ACCENT} />
    <ellipse cx="16" cy="15.15" rx="2.25" ry="1.9" />
  </>,
);

/** Teatros e espetáculos: a stage mask. */
const Mask = glyph(
  "CategoryMask",
  <>
    <path d="M4.75 4.75h14.5v7.25a7.25 7.25 0 0 1-14.5 0z" />
    <path d="M9.5 14.15c.72.66 1.6.99 2.5.99s1.78-.33 2.5-.99" stroke={ACCENT} />
    <circle cx="9.35" cy="9.75" r="0.95" fill={ACCENT} stroke="none" />
    <circle cx="14.65" cy="9.75" r="0.95" fill={ACCENT} stroke="none" />
  </>,
);

/** Stand up comedy: a handheld microphone. */
const Mic = glyph(
  "CategoryMic",
  <>
    <rect x="9" y="3.25" width="6" height="10.5" rx="3" />
    <path d="M5.75 11.25a6.25 6.25 0 0 0 12.5 0" stroke={ACCENT} />
    <path d="M12 17.5v3.25M8.75 20.75h6.5" />
  </>,
);

/** Cursos e workshops: a mortarboard. */
const Cap = glyph(
  "CategoryCap",
  <>
    <path d="M2.75 8.75 12 4.5l9.25 4.25L12 13z" />
    <path d="M6.75 10.6v4.15c0 1.8 2.35 3.15 5.25 3.15s5.25-1.35 5.25-3.15V10.6" stroke={ACCENT} />
  </>,
);

/** Congressos e palestras: a board with a rising line. */
const Board = glyph(
  "CategoryBoard",
  <>
    <rect x="3.25" y="3.75" width="17.5" height="11.5" rx="2.25" />
    <path d="M12 15.25v2.75M8.5 20.75 12 18l3.5 2.75" />
    <path d="M7.5 11.5 10.4 8.6l2.2 2.2L16.5 6.9" stroke={ACCENT} />
  </>,
);

/** Esportivo: a trophy with handles. */
const Trophy = glyph(
  "CategoryTrophy",
  <>
    <path d="M7.25 3.75h9.5v5.5a4.75 4.75 0 0 1-9.5 0z" />
    <path d="M7.25 5.5H4.5v1a2.75 2.75 0 0 0 2.75 2.75M16.75 5.5h2.75v1a2.75 2.75 0 0 1-2.75 2.75" stroke={ACCENT} />
    <path d="M12 14v3.5M8.5 20.5h7" />
  </>,
);

/** Gastronomia: a fork and a knife. */
const Cutlery = glyph(
  "CategoryCutlery",
  <>
    <path d="M6.25 3.5v4.4a2.75 2.75 0 0 0 5.5 0V3.5" />
    <path d="M9 10.65v9.85" />
    <path d="M9 3.5v4.4" stroke={ACCENT} />
    <path d="M17.9 3.5c-1.75 2.1-2.65 4.35-2.65 6.75 0 1.5.88 2.45 2.65 2.7z" stroke={ACCENT} />
    <path d="M17.9 12.95v7.55" stroke={ACCENT} />
  </>,
);

/** Religião e espiritualidade: a flame, which belongs to no one faith. */
const Flame = glyph(
  "CategoryFlame",
  <>
    <path d="M12 3.25c3.6 3.35 5.75 6.05 5.75 9.15a5.75 5.75 0 1 1-11.5 0c0-3.1 2.15-5.8 5.75-9.15z" />
    <path d="M12 18a2.6 2.6 0 0 0 2.6-2.6c0-1.3-.87-2.25-2.6-3.95-1.73 1.7-2.6 2.65-2.6 3.95A2.6 2.6 0 0 0 12 18z" stroke={ACCENT} />
  </>,
);

/** Passeios e tours: a place on a map. */
const Pin = glyph(
  "CategoryPin",
  <>
    <path d="M12 20.75s6.5-5.7 6.5-10.5a6.5 6.5 0 1 0-13 0c0 4.8 6.5 10.5 6.5 10.5z" />
    <circle cx="12" cy="10.25" r="2.5" stroke={ACCENT} />
  </>,
);

/** Infantil: a balloon. */
const Balloon = glyph(
  "CategoryBalloon",
  <>
    <path d="M12 3.5A5.5 5.5 0 0 1 17.5 9c0 3.3-2.7 6-5.5 6S6.5 12.3 6.5 9A5.5 5.5 0 0 1 12 3.5z" />
    <path d="m10.8 14.75 1.2 1.75 1.2-1.75" stroke={ACCENT} />
    <path d="M12 16.5c0 1.4 1.7 1.5 1.7 2.95 0 .75-.55 1.3-1.3 1.3" stroke={ACCENT} />
  </>,
);

/** Games e geek: a controller. */
const Controller = glyph(
  "CategoryController",
  <>
    <rect x="2.75" y="7.5" width="18.5" height="9.75" rx="4.85" />
    <path d="M7.35 11.6v2.9M5.9 13.05h2.9" stroke={ACCENT} />
    <circle cx="16.1" cy="12.3" r="1.05" fill={ACCENT} stroke="none" />
    <circle cx="18.1" cy="14.5" r="1.05" fill={ACCENT} stroke="none" />
  </>,
);

/** Moda e beleza: a hanger. */
const Hanger = glyph(
  "CategoryHanger",
  <>
    <path d="M12 8.5a2.4 2.4 0 1 1 2.4-2.4" stroke={ACCENT} />
    <path d="M12 8.5 3.9 14.6c-1 .75-.47 2.35.78 2.35h14.64c1.25 0 1.78-1.6.78-2.35L12 8.5z" />
  </>,
);

/** Saúde e bem estar: a heart carrying a pulse. */
const Pulse = glyph(
  "CategoryPulse",
  <>
    <path d="M12 20.5S3.5 15.6 3.5 9.85a4.6 4.6 0 0 1 8.5-2.5 4.6 4.6 0 0 1 8.5 2.5C20.5 15.6 12 20.5 12 20.5z" />
    <path d="M6.9 11.6h2.55l1.35-2.6 1.7 4.85 1.15-2.25h2.45" stroke={ACCENT} />
  </>,
);

/** Arte, cultura e lazer: a palette. */
const Palette = glyph(
  "CategoryPalette",
  <>
    <path d="M12 3.4c-4.85 0-8.6 3.85-8.6 8.6s3.75 8.6 8.6 8.6c1.15 0 1.85-.9 1.85-1.85 0-.52-.2-.95-.53-1.28a1.8 1.8 0 0 1 1.28-3.07h1.55a5.45 5.45 0 0 0 5.45-5.45c0-3.5-3.95-5.55-9.6-5.55z" />
    <circle cx="8.15" cy="8.6" r="1.05" fill={ACCENT} stroke="none" />
    <circle cx="7.1" cy="13.1" r="1.05" fill={ACCENT} stroke="none" />
    <circle cx="12.5" cy="7.05" r="1.05" fill={ACCENT} stroke="none" />
  </>,
);

/** Pride: a rainbow. */
const Rainbow = glyph(
  "CategoryRainbow",
  <>
    <path d="M3.5 18.25a8.5 8.5 0 0 1 17 0" />
    <path d="M6.85 18.25a5.15 5.15 0 0 1 10.3 0" stroke={ACCENT} />
    <path d="M10.2 18.25a1.8 1.8 0 0 1 3.6 0" />
  </>,
);

/** Outros: the row's own "and the rest". */
const More = glyph(
  "CategoryMore",
  <>
    <circle cx="5.4" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill={ACCENT} stroke="none" />
    <circle cx="18.6" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </>,
);

/** Every category, drawn for itself. Exhaustive by construction. */
export const CATEGORY_GLYPHS: Record<EventCategory, Icon> = {
  festas_shows: Notes,
  teatros_espetaculos: Mask,
  stand_up_comedy: Mic,
  cursos_workshops: Cap,
  congressos_palestras: Board,
  esportivo: Trophy,
  gastronomia: Cutlery,
  religiao_espiritualidade: Flame,
  passeios_tours: Pin,
  infantil: Balloon,
  games_geek: Controller,
  moda_beleza: Hanger,
  saude_bem_estar: Pulse,
  arte_cultura_lazer: Palette,
  pride: Rainbow,
  outros: More,
};
