// Bridge to the LeetFut Rust backend (leetfut/backend), which owns the LeetCode
// scrape, scoring, and caching. This layer is intentionally dumb: fetch the
// card JSON, hand back the status + body verbatim. No caching, no business
// logic — the backend already does both.

import type { Card } from "@/lib/types";

const API_BASE = process.env.LEETFUT_API_URL ?? "http://localhost:8080";

export interface ApiResult {
  status: number;
  body: unknown;
}

export async function fetchCard(username: string): Promise<ApiResult> {
  const res = await fetch(`${API_BASE}/card/${encodeURIComponent(username)}`, {
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({ error: "The LeetFut API returned an invalid response." }));
  return { status: res.status, body };
}

export type LoadCardResult = { card: Card } | { error: string; status: number };

// Typed convenience wrapper for server components: a 2xx body is trusted as a
// Card (the backend's contract), anything else becomes a status + message.
export async function loadCard(username: string): Promise<LoadCardResult> {
  const { status, body } = await fetchCard(username);
  if (status >= 200 && status < 300 && body && typeof body === "object") {
    return { card: body as Card };
  }
  const message =
    body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
      ? (body as { error: string }).error
      : "Failed to scout that profile.";
  return { error: message, status };
}
