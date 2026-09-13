/**
 * The browser-visible API origin.
 *
 * This lives outside the client fetch module so server components can import
 * the value as an ordinary string. Importing a named value from a `use client`
 * module on the server produces a client-reference proxy, not the value, which
 * makes `fetch()` reject the resulting URL.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
