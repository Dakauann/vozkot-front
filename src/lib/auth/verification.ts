"use client";

import { apiFetch } from "@/lib/api/client";
import type { User } from "@/lib/auth/types";

/** What the server says after a code goes out. */
export interface Started {
  challengeId: string;
  /** ISO. When the code stops working. */
  expiresAt: string;
  /** ISO. When another code may be asked for. */
  resendAt: string;
}

/** The state of the legally required identity block. */
export interface ProfileState {
  complete: boolean;
  documentType?: string;
  /** Masked. The server never sends the digits back. */
  documentMask?: string;
  legalName?: string;
  birthDate?: string;
  phoneMask?: string;
  phoneVerified: boolean;
}

/**
 * Asks for a sign-in code.
 *
 * The response is deliberately identical whether or not the address has an
 * account, so nothing here can be used to tell the two apart — including by
 * branching on the result.
 */
export function startEmailSignIn(email: string) {
  return apiFetch<Started>("/auth/email/start", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/**
 * Answers a sign-in code. On success a session exists and the cookies are set.
 *
 * A 201 rather than a 200 means the account was created by this call, which is
 * how the caller knows to ask for the identity block next.
 */
export function verifyEmailSignIn(challengeId: string, code: string) {
  return apiFetch<User>("/auth/email/verify", {
    method: "POST",
    body: JSON.stringify({ challengeId, code }),
  });
}

export function startPhoneVerification(phone: string) {
  return apiFetch<Started>("/auth/phone/start", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export function verifyPhone(challengeId: string, code: string) {
  return apiFetch<ProfileState>("/auth/phone/verify", {
    method: "POST",
    body: JSON.stringify({ challengeId, code }),
  });
}

export function getProfile() {
  return apiFetch<ProfileState>("/user/profile");
}

export interface ProfileInput {
  documentType: string;
  document: string;
  legalName: string;
  birthDate: string;
}

export function saveProfile(input: ProfileInput) {
  return apiFetch<ProfileState>("/user/profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/**
 * Seconds left until an ISO instant, floored at zero.
 *
 * Shared so the resend countdown and the code's own expiry agree on what "how
 * long left" means, rather than each rounding it its own way.
 */
export function secondsUntil(iso: string | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
}
