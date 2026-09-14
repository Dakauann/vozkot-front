"use client";

import * as React from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SignInFlow, type SignInChrome } from "@/components/auth/sign-in-flow";
import { useAuthDialog } from "@/contexts/auth-dialog-context";

/**
 * Signing in OVER the page rather than instead of it.
 *
 * All this adds to the flow is the dialog around it and Radix's own heading
 * primitives, so that closing it returns the buyer to the checkout they were
 * filling in rather than to a page that has been torn down and rebuilt. The
 * steps themselves live in sign-in-flow.tsx, because the sign-in PAGE runs the
 * same ones and a second copy would be a second thing to keep correct.
 */
const dialogChrome: SignInChrome = { Title: DialogTitle, Description: DialogDescription };

export function SignInDialog() {
  const { open, reason, settle } = useAuthDialog();

  // The flow is rendered only while the dialog is open, so each opening
  // MOUNTS it fresh.
  //
  // The alternative is one long-lived form that clears itself from an effect
  // when `open` flips, which sets state during an effect and shows the previous
  // attempt's half-typed address for a frame before wiping it. Letting React
  // discard the instance says the same thing with nothing stale in between.
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        settle(false);
      }}
    >
      <DialogContent className="max-w-[440px] p-0">
        {open ? <SignInFlow reason={reason} settle={settle} chrome={dialogChrome} /> : null}
      </DialogContent>
    </Dialog>
  );
}
