"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

/**
 * The report's chart grammar — one module, so every graph on the analytics
 * pages speaks the same language instead of recharts' defaults.
 *
 * The rules, and why each one is a rule:
 *
 * - ONE MEASURE, ONE HUE. A chart answering "how much, by category" for a
 *   single measure paints every mark `--chart-1` and lets the axis label carry
 *   the category. Paying out a hue per bar is colour doing a job the label
 *   already does, and it double-encodes length as colour.
 * - CATEGORICAL HUES ARE FOR IDENTITY ONLY, and only where the segments ARE
 *   the subject: a composition ring. They are assigned by ENTITY, in the order
 *   the caller passes, never by rank — a filter that reorders the rows must not
 *   repaint them.
 * - CHROME RECEDES: horizontal hairlines only, SOLID, on the border token;
 *   axes carry no line and no tick marks, just 11px muted labels.
 * - TEXT WEARS TEXT TOKENS. Values, labels and legends stay in foreground or
 *   muted ink; the coloured mark beside them carries the identity.
 * - A ONE-ROW DIMENSION IS NOT A CHART. One bar spanning a card is a stat
 *   wearing a chart's costume; `StatFigure` is what that data actually is.
 *
 * The hairlines are the one place this deliberately parts with Vozko's chart
 * module, which dashes them: a dashed rule reads as a threshold or a projection
 * when it is only a grid, and it adds noise to a card that is mostly air.
 *
 * Series colour comes from `--chart-1..5`, the same tokens the tiles beside
 * these charts plate their glyphs from. Both themes were re-validated
 * 2026-09-20 against this product's own surfaces: every slot clears the
 * lightness band, the chroma floor and the CVD separation floor. Two results
 * bind what is written below — light amber (`--chart-3`) sits at 2.25:1 on
 * white, and dark magenta against dark cyan reads deltaE 6.5 under tritanopia
 * — so any chart seating four or more segments MUST carry its legend and its
 * values as text. The ring below always does.
 */

const SERIES = "hsl(var(--chart-1))";

/** The five series tokens, in their fixed assignment order. */
const SERIES_SCALE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
] as const;

/** How many segments a ring seats before the tail folds into "other". */
export const RING_SEATS = SERIES_SCALE.length;

export interface ChartPoint {
  /** The axis label: an age band, a state, a tier, a day. */
  label: string;
  value: number;
  /** Already formatted, for the tooltip: money as money, counts as counts. */
  detail?: string;
}

const axisTick = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };
const gridStroke = "hsl(var(--border))";

/** Recessive chrome, spread into the grid so no chart can forget it. */
const grid = { stroke: gridStroke, strokeWidth: 1 } as const;

/**
 * The 2px surface ring every hovered dot wears.
 *
 * Not decoration: it is what keeps the dot legible where it crosses its own
 * line, and it is part of the hit target rather than only spacing.
 */
const activeDot = { r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" } as const;

function configFor(label: string): ChartConfig {
  return { value: { label, color: SERIES } };
}

/** The tooltip reads the formatted `detail`, never the raw number. */
const formatter = (_: unknown, __: unknown, item: { payload?: ChartPoint }) =>
  item?.payload?.detail ?? "";

/**
 * Magnitude by category, horizontally.
 *
 * Horizontal because the categories are WORDS: "Saúde e bem estar", "Camarote
 * direito", a state name, and a vertical bar chart turns those into rotated
 * labels nobody reads. The bar's length is the encoding; the label sits flat
 * beside it.
 *
 * `ordered` keeps the given order, for a scale that has one: age bands run
 * youngest to oldest and sorting them by size would destroy the only thing the
 * chart is for. Everything else sorts by size, largest first.
 */
export function CategoryBars({
  points,
  valueLabel,
  ordered = false,
  className,
}: {
  points: ChartPoint[];
  valueLabel: string;
  ordered?: boolean;
  className?: string;
}) {
  const data = React.useMemo(
    () => (ordered ? points : [...points].sort((a, b) => b.value - a.value)),
    [points, ordered],
  );
  if (data.length === 0) return null;
  // One row is a number, not a chart. A single bar spanning the card is the
  // fastest way to make a page of real data look like a page of empty graphs,
  // and it tells a reader nothing the figure beside its label does not.
  if (data.length === 1) {
    return (
      <StatFigure
        value={data[0].detail ?? String(data[0].value)}
        caption={data[0].label}
        className={className}
      />
    );
  }

  // Enough room per row to hit with a finger, and a floor so two bars do not
  // collapse into a stripe.
  const height = Math.max(data.length * 30 + 20, 120);
  return (
    <ChartContainer
      config={configFor(valueLabel)}
      className={cn("w-full", className)}
      style={{ height }}
    >
      <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 4, right: 12 }}>
        <CartesianGrid {...grid} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={112}
          tickLine={false}
          axisLine={false}
          tick={axisTick}
        />
        <ChartTooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          content={<ChartTooltipContent formatter={formatter} hideLabel={false} />}
        />
        {/* 4px rounded ends on the data end only, anchored to the baseline. */}
        <Bar dataKey="value" fill={SERIES} radius={[0, 4, 4, 0]} barSize={14} />
      </BarChart>
    </ChartContainer>
  );
}

/**
 * Change over time, as an area.
 *
 * An area rather than bars because the days are a continuum and the question is
 * the shape of the run-up, where the campaign landed, where it went quiet,
 * not the value of any one day.
 *
 * ONE AXIS. A second scale for tickets beside money would be two charts
 * pretending to be one, and the two lines would cross wherever the scales
 * happened to put them rather than where anything happened. Tickets per day get
 * their own panel, `TrendColumns`, on their own scale.
 */
export function TrendArea({
  points,
  valueLabel,
  className,
  height = 220,
}: {
  points: ChartPoint[];
  valueLabel: string;
  className?: string;
  height?: number;
}) {
  if (points.length === 0) return null;
  // A single day is a point, not a trend, and an area chart of one value is a
  // triangle that says nothing. What it IS, is one number.
  if (points.length === 1) {
    return (
      <StatFigure
        value={points[0].detail ?? String(points[0].value)}
        caption={points[0].label}
        className={className}
      />
    );
  }
  return (
    <ChartContainer
      config={configFor(valueLabel)}
      className={cn("w-full", className)}
      style={{ height }}
    >
      <AreaChart accessibilityLayer data={points} margin={{ left: 4, right: 12, top: 8 }}>
        <defs>
          {/* A wash, never a block: the line carries the value, the fill only
              says which side of it is "under". */}
          <linearGradient id="vk-series-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES} stopOpacity={0.16} />
            <stop offset="100%" stopColor={SERIES} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid {...grid} vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          minTickGap={28}
        />
        <YAxis hide />
        <ChartTooltip
          cursor={{ stroke: gridStroke }}
          content={<ChartTooltipContent formatter={formatter} />}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={SERIES}
          strokeWidth={2}
          fill="url(#vk-series-fade)"
          dot={false}
          activeDot={activeDot}
        />
      </AreaChart>
    </ChartContainer>
  );
}

/**
 * Counts over time, as columns.
 *
 * The companion to the area above, and a second panel rather than a second axis
 * on the same one: money and admissions are different units, and aligning two
 * scales on one plot invents a correlation the data never claimed. Columns
 * because a count is a discrete tally per day, not a continuum.
 */
export function TrendColumns({
  points,
  valueLabel,
  className,
  height = 200,
}: {
  points: ChartPoint[];
  valueLabel: string;
  className?: string;
  height?: number;
}) {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return (
      <StatFigure
        value={points[0].detail ?? String(points[0].value)}
        caption={points[0].label}
        className={className}
      />
    );
  }
  return (
    <ChartContainer
      config={configFor(valueLabel)}
      className={cn("w-full", className)}
      style={{ height }}
    >
      <BarChart accessibilityLayer data={points} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid {...grid} vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          minTickGap={24}
        />
        <YAxis hide />
        <ChartTooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          content={<ChartTooltipContent formatter={formatter} />}
        />
        {/* Capped rather than filled to the band: the leftover is the air that
            keeps a dense month from reading as a solid block. */}
        <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} barSize={18} maxBarSize={24} />
      </BarChart>
    </ChartContainer>
  );
}

export interface RingSlice {
  key: string;
  label: string;
  value: number;
  /** Already formatted: what the legend prints beside the label. */
  detail: string;
}

/**
 * Part-to-whole, as a ring.
 *
 * A ring and never a wedge pie, and never for comparing close values: this is
 * for "roughly how is the whole split", read at a glance, with the exact
 * figures in the legend beside it and in the table below. Six segments is the
 * ceiling; past that adjacent classes blur and the tail folds into one row.
 *
 * The segments are separated by a 2px gap in the CARD colour rather than by a
 * stroke drawn around each one. A border is ink that is not data; the gap is
 * the surface showing through, which is what actually makes two neighbours read
 * as two.
 *
 * Colour is assigned by position in the array the caller passes, which is a
 * stable catalogue order (the genders in the order the form offers them, the
 * tiers in the order they were priced), NOT by size. A filter that drops a row
 * must not repaint the survivors, and a reader who learned that "Pista" is
 * green must not find it blue next week.
 */
export function CompositionRing({
  slices,
  total,
  totalLabel,
  className,
}: {
  slices: RingSlice[];
  /** The centre figure, already formatted. */
  total: string;
  totalLabel: string;
  className?: string;
}) {
  if (slices.length === 0) return null;
  // One slice is the whole thing. A full ring saying "100%" is a decoration
  // around a number, so the number is what gets rendered.
  if (slices.length === 1) {
    return <StatFigure value={total} caption={slices[0].label} className={className} />;
  }

  const config: ChartConfig = Object.fromEntries(
    slices.map((slice, index) => [
      slice.key,
      { label: slice.label, color: SERIES_SCALE[index % SERIES_SCALE.length] },
    ]),
  );

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center", className)}>
      <div className="relative mx-auto size-[160px] shrink-0">
        <ChartContainer config={config} className="size-full">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="label" />} />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="64%"
              outerRadius="96%"
              paddingAngle={2}
              stroke="hsl(var(--card))"
              strokeWidth={2}
            >
              {slices.map((slice, index) => (
                <Cell key={slice.key} fill={SERIES_SCALE[index % SERIES_SCALE.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        {/* The total sits in the hole rather than above the card: the ring is
            the split OF this number, and putting them apart makes the reader
            carry it across the panel. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-lg font-semibold leading-none text-foreground">
            {total}
          </span>
          <span className="mt-1 max-w-[88px] text-center text-[0.625rem] leading-tight text-muted-foreground">
            {totalLabel}
          </span>
        </div>
      </div>

      {/* The legend is not optional and not a nicety. Two of the five series
          tokens sit close enough under tritanopia, and light amber close enough
          to white, that colour alone is not a dependable channel here. The
          swatch carries identity; the words carry the value. */}
      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((slice, index) => (
          <li key={slice.key} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ background: SERIES_SCALE[index % SERIES_SCALE.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{slice.label}</span>
            <span className="shrink-0 font-medium tabular-nums text-foreground">
              {slice.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One ratio against its whole.
 *
 * A meter, not a two-slice pie: a share of a total is a length against a track,
 * and a pie of two wedges is the hardest possible way to read one percentage.
 * The track is the same hue at low alpha rather than a neutral grey, so the
 * filled and unfilled halves read as one scale.
 */
export function ShareMeter({
  value,
  caption,
  share,
  tone = "series",
  className,
}: {
  /** The figure itself, already formatted. */
  value: string;
  caption: string;
  /** 0..1. Anything outside is clamped, because a meter past its own end lies. */
  share: number;
  /** `debit` is for money going the wrong way: refunds, chargebacks. */
  tone?: "series" | "debit";
  className?: string;
}) {
  const clamped = Math.min(Math.max(share, 0), 1);
  const hue = tone === "debit" ? "hsl(var(--destructive))" : SERIES;
  return (
    <div className={cn("flex flex-col", className)}>
      <span
        className={cn(
          "font-display text-2xl font-semibold leading-none",
          tone === "debit" ? "text-destructive-ink" : "text-foreground",
        )}
      >
        {value}
      </span>
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full"
        style={{ background: `color-mix(in oklab, ${hue} 16%, transparent)` }}
      >
        <div className="h-full rounded-full" style={{ width: `${clamped * 100}%`, background: hue }} />
      </div>
      <span className="mt-2 text-xs leading-5 text-muted-foreground">{caption}</span>
    </div>
  );
}

/**
 * The number, when the number is the chart.
 *
 * One state, one tier, one day: a bar chart of a single row is a rectangle
 * spanning a card, which tells a reader nothing the figure does not, and makes
 * a page of them look like a page of empty charts. This is what that data is.
 */
export function StatFigure({
  value,
  caption,
  className,
}: {
  value: string;
  caption: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col justify-center py-2", className)}>
      {/* Proportional figures, not tabular: equal-width digits are for numbers
          that stack in a column, and they make a standalone figure read loose. */}
      <span className="font-display text-2xl font-semibold leading-none text-foreground">
        {value}
      </span>
      <span className="mt-2 text-xs leading-5 text-muted-foreground">{caption}</span>
    </div>
  );
}
