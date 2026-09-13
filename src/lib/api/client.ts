"use client";

/**
 * The one way this app talks to the API.
 *
 * Everything goes through here so three behaviours exist exactly once: cookie
 * credentials, the single reactive refresh after a 401, and the timeout. A
 * second fetch wrapper elsewhere is how a feature ends up silently logged out
 * while the rest of the app recovers.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

const DEFAULT_TIMEOUT_MS = 15_000;
/** Uploads carry up to 50 MB and are measured in minutes on hotel wifi. */
export const UPLOAD_TIMEOUT_MS = 120_000;

export interface ApiError {
  message: string;
  status?: number;
}

export interface ApiResult<T> {
  data?: T;
  error?: ApiError;
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  /** Refresh-and-retry is skipped for the auth endpoints themselves. */
  retryOnUnauthorized?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retryOnUnauthorized = !path.startsWith("/auth/"), ...init } = options;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      signal: controller.signal,
      headers: buildHeaders(init.body, init.headers),
    });

    if (response.status === 401 && retryOnUnauthorized) {
      const refreshed = await refreshSession();
      if (refreshed) {
        return apiFetch<T>(path, { ...options, retryOnUnauthorized: false });
      }
    }

    if (response.status === 204) {
      return { data: undefined as T };
    }

    const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
    if (!response.ok) {
      return {
        error: {
          message: (payload as { error?: string } | null)?.error ?? `Request failed with status ${response.status}`,
          status: response.status,
        },
      };
    }
    return { data: payload as T };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return { error: { message: timedOut ? "Request timed out" : "Could not reach the API" } };
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * A multipart body must NOT carry a hand-written Content-Type: the browser adds
 * the header together with the boundary it generated, and a manual value leaves
 * the server parsing a body whose boundary it was never told.
 */
function buildHeaders(body: BodyInit | null | undefined, headers: HeadersInit | undefined): HeadersInit {
  const base: Record<string, string> = { "X-Auth-Mode": "cookie" };
  if (!(body instanceof FormData)) {
    base["Content-Type"] = "application/json";
  }
  return { ...base, ...(headers as Record<string, string> | undefined) };
}

/**
 * One refresh at a time. Without the shared promise, a screen that fires four
 * requests at once answers a single expired session with four rotations, and
 * refresh-token rotation treats the losers as token reuse.
 */
function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = apiFetch<unknown>("/auth/refresh", {
      method: "POST",
      body: "{}",
      retryOnUnauthorized: false,
    })
      .then((result) => !result.error)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}
