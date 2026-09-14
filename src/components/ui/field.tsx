"use client";

import * as React from "react";

import { FIELD_CHROME } from "@/components/elevated-design/elevated-input";
import { cn } from "@/lib/utils";

/**
 * Form controls for data entry.
 *
 * The surface IS the one ElevatedInput draws: the chrome comes from that
 * component rather than from a copy of it, so a field here and a field on the
 * sign-in screen cannot drift apart. It used to be a duplicate kept in step by
 * hand, and a duplicate kept in step by hand eventually is not.
 *
 * What differs is where the label sits. ElevatedInput floats it into the
 * control, which is right for a two-field sign-in and wrong for an eight-field
 * record: a floating label vacates the moment you type, exactly when a form
 * being scanned needs it, and it leaves nowhere for the hint under a price
 * field to live. Labels sit above here for both reasons.
 */
export const FIELD_SURFACE = cn(
  "w-full rounded-[--radius]",
  FIELD_CHROME,
  "transition-[background-color,border-color,box-shadow] duration-150 ease-out",
  "placeholder:text-muted-foreground focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
);

const CONTROL_HEIGHT = "h-9 px-3 text-sm";

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({ id, label, hint, error, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p id={errorId} className="mt-1 text-xs font-medium text-destructive-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const TextField = React.forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<"input">>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(FIELD_SURFACE, CONTROL_HEIGHT, className)} {...props} />
  ),
);
TextField.displayName = "TextField";

export const TextAreaField = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<"textarea">
>(({ className, rows = 3, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={cn(FIELD_SURFACE, "resize-y px-3 py-2 text-sm leading-relaxed", className)}
    {...props}
  />
));
TextAreaField.displayName = "TextAreaField";

export const SelectField = React.forwardRef<
  HTMLSelectElement,
  React.ComponentPropsWithoutRef<"select">
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    // The native control, on purpose: it brings the platform's own keyboard
    // behaviour and its scroll-on-touch, which a rebuilt listbox spends a lot
    // of code getting half right.
    className={cn(FIELD_SURFACE, CONTROL_HEIGHT, "cursor-pointer appearance-none pr-8", className)}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23687076' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 0.6rem center",
    }}
    {...props}
  >
    {children}
  </select>
));
SelectField.displayName = "SelectField";
