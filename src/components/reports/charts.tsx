"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
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
 * The report's charts: one measure each, one hue each.
 *
 * NONE OF THESE IS A CATEGORICAL PALETTE. Every chart here answers "how much,
 * by category" or "how much, over time" for a SINGLE measure, so the marks are
 * one colour and the category is carried by the axis label beside them. Paying
 * out a different hue per bar would be colour doing a job the label already
 * does, and it is how a chart ends up needing a legend to explain itself.
 *
 * The hue is `--chart-1`, the product's own series token, the same one the
 * tiles beside these charts take their plate from, so a category reads the same
 * in a tile as it does in the graph. Its DARK step was re-measured rather than
 * inherited: the old one sat outside the lightness band a mark has to occupy to
 * read on a dark card, which is the opposite of the instinct that a dark theme
 * wants a lighter colour.
 *
 * Built on the product's ChartContainer rather than on raw recharts, so the
 * tooltip, the theme variables and the responsive box are the same ones every
 * other chart in the family uses.
 */

const SERIES = "hsl(var(--chart-1))";

export interface ChartPoint {
  /** The axis label: an age band, a state, a tier, a day. */
  label: string;
  value: number;
  /** Already formatted, for the tooltip: money as money, counts as counts. */
  detail?: string;
}

const axisTick = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };
const gridStroke = "hsl(var(--border))";

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
        <CartesianGrid horizontal={false} stroke={gridStroke} strokeDasharray="3 3" />
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
 * happened to put them rather than where anything happened.
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
  // triangle that says nothing.
  if (points.length === 1) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {points[0].label} · {points[0].detail ?? points[0].value}
      </p>
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
          <linearGradient id="vk-series-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES} stopOpacity={0.3} />
            <stop offset="100%" stopColor={SERIES} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={gridStroke} strokeDasharray="3 3" />
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
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
