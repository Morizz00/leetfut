// Canonical public URL for share links, OG tags, sitemap, and card signatures.
// Resolution order:
//   1. NEXT_PUBLIC_SITE_URL (set in Vercel → Settings → Environment Variables)
//   2. http://localhost:3000 in dev
//   3. https://leetfut-eta.vercel.app (current production default)
//
// We deliberately do NOT read VERCEL_URL — preview deploys get one-off hash
// hostnames that must not end up in copied share links.

const DEFAULT_SITE = "https://leetfut-eta.vercel.app";

function normalize(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL;
  if (explicit) return normalize(explicit);
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  return DEFAULT_SITE;
}

export function siteHost(): string {
  return new URL(siteUrl()).host;
}

/** Uppercase host for card export signatures (e.g. LEETFUT-ETA.VERCEL.APP). */
export function siteHostDisplay(): string {
  return siteHost().toUpperCase();
}
