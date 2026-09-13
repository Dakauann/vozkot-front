"use client";

import { apiFetch } from "@/lib/api/client";

import type { AuthResponse, User } from "./types";

export type { ApiResult } from "@/lib/api/client";

export function login(email: string, password: string) {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(name: string, email: string, password: string) {
  return apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export function getCurrentUser() {
  return apiFetch<User>("/user/me");
}

export function logout() {
  return apiFetch<{ message: string }>("/auth/logout", { method: "POST", body: "{}" });
}
