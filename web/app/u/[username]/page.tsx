import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Background from "@/components/Background";
import { loadCard, type LoadCardResult } from "@/lib/api";
import { pickFlag } from "@/lib/flagPriority";
import { FINISH_LABEL } from "@/components/finishTheme";
import type { Card } from "@/lib/types";
import ScoutRoute from "./ScoutRoute";

export const dynamic = "force-dynamic"; // per-user, always fresh

// Memoised per request so generateMetadata and the page share one scout.
const load = cache(async (username: string): Promise<LoadCardResult> => loadCard(username));

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const res = await load(username);
  if ("card" in res) {
    return {
      title: `${res.card.name} — ${res.card.overall} ${FINISH_LABEL[res.card.finish]} · LeetFut`,
      description: `${res.card.name} scouted on LeetFut: ${res.card.overall} OVR ${res.card.position}, ${res.card.archetype}.`,
      alternates: { canonical: `/${res.card.username}` },
      twitter: { card: "summary_large_image" },
      // og:image comes from the file-convention opengraph-image.tsx (the landscape
      // unfurl card). The portrait FUT card lives at /<username>.png for README embeds.
    };
  }
  // Not a real profile — keep these soft-404s out of the index.
  return { title: `@${username} · LeetFut`, robots: { index: false } };
}

function NotScouted({ username, error, status }: { username: string; error: string; status: number }) {
  const rateLimited = status === 429;
  const heading = rateLimited ? "The scouts are gassed" : "No file found";
  const message = rateLimited
    ? `You lot went viral and stormed the training ground all at once — LeetCode just showed us a yellow card for time-wasting. Give the scouts a couple minutes to catch their breath, then send @${username} back on.`
    : status === 404
      ? `There's no LeetCode user named @${username}.`
      : status === 400
        ? `"${username}" isn't a valid LeetCode username.`
        : status === 403
          ? `@${username}'s profile is private — the scouts can't read the tape.`
          : error;
  return (
    <main className="relative z-[2] mx-auto flex min-h-screen max-w-[560px] flex-col items-center justify-center px-6 text-center">
      <div className="font-display text-[12px] font-bold tracking-[.3em] text-brand">SCOUT REPORT</div>
      <h1 className="font-display mt-3 text-[clamp(30px,6vw,48px)] font-black leading-[.95]">{heading}</h1>
      <p className="mt-3 text-[15.5px] leading-[1.5] text-ink-soft">{message}</p>
      <Link
        href="/"
        className="font-display mt-7 inline-flex h-[46px] items-center rounded-xl bg-brand px-6 text-[16px] tracking-[.06em] text-[#1a0f00] transition hover:bg-brand-hi"
      >
        {rateLimited ? "BACK TO THE BENCH" : "SCOUT SOMEONE ELSE"}
      </Link>
    </main>
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ country?: string }>;
}) {
  const { username } = await params;
  const { country: override } = await searchParams;
  const res = await load(username);
  // Flag priority: a shared-link ?country= override wins, else the LeetCode-
  // derived country. No IP/geo fallback — we never put the *viewer's* country
  // on someone else's card.
  let card: Card | null = "card" in res ? res.card : null;
  let canonicalCountry = ""; // LeetCode-derived flag; share links omit ?country= unless overridden
  if (card) {
    canonicalCountry = pickFlag(null, card.country) ?? ""; // LeetCode-derived only
    const displayCountry = pickFlag(override, card.country) ?? "";
    card = { ...card, country: displayCountry };
  }
  return (
    <div className="relative min-h-screen overflow-x-hidden text-ink">
      <Background />
      {card ? (
        <ScoutRoute card={card} canonicalCountry={canonicalCountry} />
      ) : (
        <NotScouted username={username} error={(res as { error: string }).error} status={(res as { status: number }).status} />
      )}
    </div>
  );
}
