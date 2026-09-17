import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  /** Use on dark/brand-filled surfaces. */
  reversed?: boolean;
};

/**
 * Vozko Tickets' product mark.
 *
 * The split V, emerald diamond and circuit trace come straight from Vozko's
 * master mark. The ticket the trace builds is pulled in close to the V here:
 * the master artwork (public/brand/vozko-logo.svg) parks it far up the pixel
 * trail, which turns to noise at navbar and favicon sizes.
 */
export function BrandMark({ className, reversed = false }: BrandMarkProps) {
  const body = reversed ? "hsl(var(--primary-foreground))" : "currentColor";
  const accent = reversed ? "hsl(var(--primary-foreground))" : "hsl(var(--primary))";

  return (
    <svg
      aria-hidden="true"
      className={cn("size-8", className)}
      viewBox="2 4 58 58"
      fill="none"
    >
      <g transform="translate(-15.365 0.258) scale(0.175)">
        <polygon fill={body} points="107.80,106.60 178.44,106.60 226.70,189.81 215.49,209.15 249.87,268.42 225.76,309.98" />
        <polygon fill={body} points="319.40,106.60 354.90,106.60 314.18,176.80 302.33,178.10 255.25,259.28 243.05,238.24" />
        <polygon fill={body} points="375.20,126.30 392.50,126.30 284.55,309.26 260.97,268.61 298.79,203.40 331.41,201.80" />
        <polygon fill={accent} points="350.30,132.20 361.03,132.20 324.61,195.00 303.80,195.00 308.96,186.10 319.04,186.10" />
        <polygon fill={accent} points="255.30,277.30 279.50,318.20 255.30,347.10 231.10,318.20" />
      </g>
      <path
        fill={accent}
        fillRule="evenodd"
        d="M58.46,7.27 L58.41,7.06 L58.33,6.86 L58.24,6.66 L58.13,6.48 L58.00,6.30 L57.86,6.14 L57.70,6.00 L57.52,5.87 L57.34,5.76 L57.14,5.67 L56.94,5.59 L56.73,5.54 L56.52,5.51 L56.30,5.50 L47.10,5.50 L47.10,5.59 L47.09,5.68 L47.09,5.76 L47.08,5.85 L47.06,5.94 L47.05,6.03 L47.03,6.11 L47.01,6.20 L46.98,6.28 L46.96,6.37 L46.93,6.45 L46.89,6.53 L46.86,6.61 L46.82,6.69 L46.78,6.77 L46.74,6.85 L46.69,6.93 L46.64,7.00 L46.59,7.07 L46.54,7.14 L46.49,7.21 L46.43,7.28 L46.37,7.35 L46.31,7.41 L46.25,7.47 L46.18,7.53 L46.11,7.59 L46.04,7.64 L45.97,7.69 L45.90,7.74 L45.83,7.79 L45.75,7.84 L45.67,7.88 L45.59,7.92 L45.51,7.96 L45.43,7.99 L45.35,8.03 L45.27,8.06 L45.18,8.08 L45.10,8.11 L45.01,8.13 L44.93,8.15 L44.84,8.16 L44.75,8.18 L44.66,8.19 L44.58,8.19 L44.49,8.20 L44.40,8.20 L44.31,8.20 L44.22,8.19 L44.14,8.19 L44.05,8.18 L43.96,8.16 L43.87,8.15 L43.79,8.13 L43.70,8.11 L43.62,8.08 L43.53,8.06 L43.45,8.03 L43.37,7.99 L43.29,7.96 L43.21,7.92 L43.13,7.88 L43.05,7.84 L42.97,7.79 L42.90,7.74 L42.83,7.69 L42.76,7.64 L42.69,7.59 L42.62,7.53 L42.55,7.47 L42.49,7.41 L42.43,7.35 L42.37,7.28 L42.31,7.21 L42.26,7.14 L42.21,7.07 L42.16,7.00 L42.11,6.93 L42.06,6.85 L42.02,6.77 L41.98,6.69 L41.94,6.61 L41.91,6.53 L41.87,6.45 L41.84,6.37 L41.82,6.28 L41.79,6.20 L41.77,6.11 L41.75,6.03 L41.74,5.94 L41.72,5.85 L41.71,5.76 L41.71,5.68 L41.70,5.59 L41.70,5.50 L39.20,5.50 L38.98,5.51 L38.77,5.54 L38.56,5.59 L38.36,5.67 L38.16,5.76 L37.98,5.87 L37.80,6.00 L37.64,6.14 L37.50,6.30 L37.37,6.48 L37.26,6.66 L37.17,6.86 L37.09,7.06 L37.04,7.27 L37.01,7.48 L37.00,7.70 L37.00,17.80 L37.01,18.02 L37.04,18.23 L37.09,18.44 L37.17,18.64 L37.26,18.84 L37.37,19.02 L37.50,19.20 L37.64,19.36 L37.80,19.50 L37.98,19.63 L38.16,19.74 L38.36,19.83 L38.56,19.91 L38.77,19.96 L38.98,19.99 L39.20,20.00 L41.70,20.00 L41.70,19.91 L41.71,19.82 L41.71,19.74 L41.72,19.65 L41.74,19.56 L41.75,19.47 L41.77,19.39 L41.79,19.30 L41.82,19.22 L41.84,19.13 L41.87,19.05 L41.91,18.97 L41.94,18.89 L41.98,18.81 L42.02,18.73 L42.06,18.65 L42.11,18.57 L42.16,18.50 L42.21,18.43 L42.26,18.36 L42.31,18.29 L42.37,18.22 L42.43,18.15 L42.49,18.09 L42.55,18.03 L42.62,17.97 L42.69,17.91 L42.76,17.86 L42.83,17.81 L42.90,17.76 L42.97,17.71 L43.05,17.66 L43.13,17.62 L43.21,17.58 L43.29,17.54 L43.37,17.51 L43.45,17.47 L43.53,17.44 L43.62,17.42 L43.70,17.39 L43.79,17.37 L43.87,17.35 L43.96,17.34 L44.05,17.32 L44.14,17.31 L44.22,17.31 L44.31,17.30 L44.40,17.30 L44.49,17.30 L44.58,17.31 L44.66,17.31 L44.75,17.32 L44.84,17.34 L44.93,17.35 L45.01,17.37 L45.10,17.39 L45.18,17.42 L45.27,17.44 L45.35,17.47 L45.43,17.51 L45.51,17.54 L45.59,17.58 L45.67,17.62 L45.75,17.66 L45.83,17.71 L45.90,17.76 L45.97,17.81 L46.04,17.86 L46.11,17.91 L46.18,17.97 L46.25,18.03 L46.31,18.09 L46.37,18.15 L46.43,18.22 L46.49,18.29 L46.54,18.36 L46.59,18.43 L46.64,18.50 L46.69,18.57 L46.74,18.65 L46.78,18.73 L46.82,18.81 L46.86,18.89 L46.89,18.97 L46.93,19.05 L46.96,19.13 L46.98,19.22 L47.01,19.30 L47.03,19.39 L47.05,19.47 L47.06,19.56 L47.08,19.65 L47.09,19.74 L47.09,19.82 L47.10,19.91 L47.10,20.00 L56.30,20.00 L56.52,19.99 L56.73,19.96 L56.94,19.91 L57.14,19.83 L57.34,19.74 L57.52,19.63 L57.70,19.50 L57.86,19.36 L58.00,19.20 L58.13,19.02 L58.24,18.84 L58.33,18.64 L58.41,18.44 L58.46,18.23 L58.49,18.02 L58.50,17.80 L58.50,7.70 L58.49,7.48 Z"
      />
    </svg>
  );
}

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  /** Collapses the lockup to the product mark in narrow chrome. */
  markOnly?: boolean;
  reversed?: boolean;
};

/** The primary horizontal Vozko Tickets lockup used by product chrome. */
export function BrandLogo({
  className,
  markClassName,
  markOnly = false,
  reversed = false,
}: BrandLogoProps) {
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-2.5", className)}
      aria-label="Vozko Tickets"
    >
      <BrandMark
        reversed={reversed}
        className={cn("size-8 shrink-0", markClassName)}
      />
      {!markOnly ? (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="font-display text-[17px] font-semibold tracking-[0.115em] text-foreground">
            VOZKO
          </span>
          <span className="mt-1 font-display text-[8px] font-semibold tracking-[0.31em] text-primary-ink">
            TICKETS
          </span>
        </span>
      ) : null}
    </span>
  );
}
