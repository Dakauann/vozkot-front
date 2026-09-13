import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function readableInkFor(color: string | null | undefined): string {
  if (!color) return "#ffffff";
  const hex = color.trim().replace(/^#/, "");
  const full = hex.length === 3
    ? hex.split("").map((channel) => channel + channel).join("")
    : hex.length === 6 ? hex : null;
  if (!full || !/^[0-9a-fA-F]{6}$/.test(full)) return "#ffffff";
  const channel = (index: number) => {
    const value = Number.parseInt(full.slice(index, index + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.179 ? "#0E1113" : "#ffffff";
}

