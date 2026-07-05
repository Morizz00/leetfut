"use client";

import { useState } from "react";
import type { Card } from "@/lib/types";

const TTL = 3 * 60 * 60 * 1000;
// Bump this whenever the Card shape changes — it invalidates every previously
// cached entry at once instead of crashing on a stale shape missing new fields.
const CACHE_VERSION = "v2";
const cacheKey = (username: string) => `leetfut:card:${CACHE_VERSION}:${username.toLowerCase()}`;

function readCache(username: string): Card | null {
  try {
    const hit = JSON.parse(localStorage.getItem(cacheKey(username)) ?? "null");
    if (!hit || Date.now() - hit.t >= TTL) return null;
    const card = hit.card as Card;
    // Cheap shape guard: a cached entry from an older Card schema is missing
    // fields the report now reads unconditionally — treat it as a miss rather
    // than crash downstream.
    if (typeof card?.topicsSolved !== "number" || typeof card?.totalSolved !== "number") return null;
    return card;
  } catch {
    return null;
  }
}

// Re-persist a card under its username (used when the flag is edited on the
// report, so the chosen country survives a re-scout within the TTL).
export function writeCardCache(card: Card): void {
  try {
    localStorage.setItem(cacheKey(card.username), JSON.stringify({ t: Date.now(), card }));
  } catch {
    /* quota / private mode */
  }
}

export function useScout() {
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scout = async (name: string): Promise<boolean> => {
    if (loading) return false;
    const username = name.trim().replace(/^@/, "");

    const cached = readCache(username);
    if (cached) {
      setCard(cached);
      setError(null);
      return true;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/card/${encodeURIComponent(username)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't scout that profile.");
      setCard(data as Card);
      writeCardCache(data as Card);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Edit the current card's flag in place (from the report-page picker) and
  // persist it so a re-scout within the TTL keeps the choice. The cache write is
  // kept out of the setState updater (updaters must stay pure) — `card` is the
  // current value from the render this handler closed over.
  const setCountry = (code: string) => {
    if (!card) return;
    const next = { ...card, country: code };
    setCard(next);
    writeCardCache(next);
  };

  return { card, loading, error, scout, setCountry };
}
