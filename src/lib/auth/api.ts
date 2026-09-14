"use client";

import { apiFetch } from "@/lib/api/client";

import type { AuthResponse, User } from "./types";

export type { ApiResult } from "@/lib/api/client";

/**
 * Password sign-in.
 *
 * Sign-in only: there is no register() beside it any more. A password is a
 * SECOND key, chosen after a code has proven the address, so nothing here can
 * bring an account into existence. See sign-in-flow.tsx for the ordering.
 */
export function login(email: string, password: string) {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function getCurrentUser() {
  return apiFetch<User>("/user/me");
}

export function logout() {
  return apiFetch<{ message: string }>("/auth/logout", { method: "POST", body: "{}" });
}
