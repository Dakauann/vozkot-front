"use client";

import { apiFetch } from "@/lib/api/client";
import type { User } from "@/lib/auth/types";
import type { Gender } from "@/lib/reports/types";

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
  /**
   * What the buyer volunteered about themselves. All three are optional and
   * come back as they were sent: an empty value means "not answered", which is
   * a real state and not a missing one.
   */
  gender?: Gender | "";
  city?: string;
  uf?: string;
}

/**
 * Asks for a sign-in code.
 *
 * The response is deliberately identical whether or not the address has an
 * account, so nothing here can be used to tell the two apart, including by
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
  /**
   * Optional, and they must stay optional. They are asked for because an
   * organiser needs to know who came to their event; nobody should have to
   * answer that to buy a ticket, so an empty string is a valid value and is
   * sent as one rather than omitted.
   */
  gender?: Gender | "";
  city?: string;
  uf?: string;
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

export interface SetPasswordInput {
  /** Required only when the account already has a password. */
  current?: string;
  next: string;
}

/**
 * Adds a password to an account, as a SECOND way in.
 *
 * Never the first: the account already exists and already works without one.
 * This is for the person who would rather type a password than wait for an
 * email, and for the day their mail provider is having an outage.
 */
export function setPassword(input: SetPasswordInput) {
  return apiFetch<void>("/user/password", {
    method: "PUT",
    body: JSON.stringify({ current: input.current, new: input.next }),
  });
}

/**
 * Signs in with an email and a password.
 *
 * Answers the same generic refusal for a wrong password and for an address
 * with no account, which is what keeps this from being a way to ask who has
 * one.
 */
export function signInWithPassword(email: string, password: string) {
  return apiFetch<{ user: unknown }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}
