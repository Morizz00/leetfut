import { fetchCard } from "@/lib/api";
import { pickFlag } from "@/lib/flagPriority";
import type { Card } from "@/lib/types";

// Resolve the card's flag by priority (override → LeetCode-derived). No IP/geo
// fallback — an unknown country shows no flag rather than the viewer's own.
function resolveCountry(card: Card, override: string | null): Card {
  return { ...card, country: pickFlag(override, card.country) ?? "" };
}

// Thin same-origin proxy to the Rust backend. No caching/business logic here —
// the backend owns that; this just forwards the JSON + status and applies the
// visitor's flag override (a purely presentational concern).
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const override = new URL(req.url).searchParams.get("country");
  const { status, body } = await fetchCard(username);
  if (status >= 200 && status < 300 && body && typeof body === "object") {
    return Response.json(resolveCountry(body as Card, override), { status });
  }
  return Response.json(body, { status });
}
