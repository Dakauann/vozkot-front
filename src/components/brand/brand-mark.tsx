import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  /** Use on dark/brand-filled surfaces. */
  reversed?: boolean;
};

/**
 * Vozko Tickets' product mark.
 *
 * The split V, emerald diamond and rising circuit trace come directly from
 * Vozko's master mark. The three detached squares also read as a ticket's
 * perforation, giving this product its own mnemonic without redrawing the
 * parent brand.
 */
export function BrandMark({ className, reversed = false }: BrandMarkProps) {
  const body = reversed ? "hsl(var(--primary-foreground))" : "currentColor";
  const accent = reversed ? "hsl(var(--primary-foreground))" : "hsl(var(--primary))";

  return (
    <svg
      aria-hidden="true"
      className={cn("size-8", className)}
      viewBox="0 0 56 56"
      fill="none"
    >
      <path d="M4.5 8H16l11.35 20.15-6.18 11.7L4.5 17.1V8Z" fill={body} />
      <path d="M40.3 8H51.5L30.9 40.05l-6.15-11.56L40.3 8Z" fill={body} />
      <path d="M20.15 42.05 28 30.85l7.85 11.2L28 52l-7.85-9.95Z" fill={accent} />
      <path d="M28.85 28.25 35.7 17.6h5.18l2.24-3.55h-5.2L29.9 26.6l-1.05 1.65Z" fill={accent} />
      <rect x="42.1" y="8.1" width="4.35" height="4.35" rx=".65" fill={accent} />
      <rect x="47.2" y="2.8" width="3.8" height="3.8" rx=".6" fill={accent} />
      <rect x="51.6" y="-1" width="3.25" height="3.25" rx=".55" fill={accent} />
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
