import type { Metadata } from "next";
import Link from "next/link";
import Background from "@/components/Background";
import DuelView from "@/components/DuelView";
import { loadCard } from "@/lib/api";
import { pickFlag } from "@/lib/flagPriority";
import { computeDuel } from "@/lib/duel";
import type { Card } from "@/lib/types";

export const dynamic = "force-dynamic";

const withFlag = (card: Card): Card => ({
  ...card,
  country: pickFlag(null, card.country) ?? "",
});

interface Params {
  params: Promise<{ username: string; opponent: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username, opponent } = await params;
  const [a, b] = await Promise.all([loadCard(username), loadCard(opponent)]);
  if ("card" in a && "card" in b) {
    return {
      title: `${a.card.name} vs ${b.card.name} · LeetFut Duel`,
      description: `Six stats, one result: @${a.card.username} vs @${b.card.username}, settled on real LeetCode numbers.`,
      alternates: { canonical: `/${a.card.username}/vs/${b.card.username}` },
      twitter: { card: "summary_large_image" },
    };
  }
  return {
    title: `@${username} vs @${opponent} · LeetFut`,
    robots: { index: false },
  };
}

function MatchPostponed({
  username,
  opponent,
  aStatus,
  bStatus,
}: {
  username: string;
  opponent: string;
  aStatus?: number;
  bStatus?: number;
}) {
  const rateLimited = aStatus === 429 || bStatus === 429;
  const isNoShow = (s?: number) => s === 404 || s === 400;
  const noShows = [
    ...(isNoShow(aStatus) ? [username] : []),
    ...(isNoShow(bStatus) ? [opponent] : []),
  ];
  const message = rateLimited
    ? "LeetCode showed the scouts a yellow card for time-wasting. Give them a couple minutes to catch their breath, then replay the fixture."
    : noShows.length === 2
      ? `Neither @${username} nor @${opponent} made it out of the tunnel — check both usernames.`
      : noShows.length === 1
        ? `@${noShows[0]} didn't show for the fixture — there's no LeetCode profile by that name.`
        : "The scouts lost the feed mid-fixture — not your fault. Give it a minute and replay the duel.";
  return (
    <main className="relative z-[2] mx-auto flex min-h-screen max-w-[560px] flex-col items-center justify-center px-6 text-center">
      <div className="font-display text-[12px] font-bold tracking-[.3em] text-brand">
        SCOUT DUEL
      </div>
      <h1 className="font-display mt-3 text-[clamp(30px,6vw,48px)] font-black leading-[.95]">
        Match postponed
      </h1>
      <p className="mt-3 text-[15.5px] leading-[1.5] text-ink-soft">{message}</p>
      <Link
        href="/"
        className="font-display mt-7 inline-flex h-[46px] items-center rounded-xl bg-brand px-6 text-[16px] tracking-[.06em] text-[#1a0f00] transition hover:bg-brand-hi"
      >
        BACK TO THE BENCH
      </Link>
    </main>
  );
}

export default async function Page({ params }: Params) {
  const { username, opponent } = await params;
  const [a, b] = await Promise.all([loadCard(username), loadCard(opponent)]);

  if (!("card" in a) || !("card" in b)) {
    return (
      <div className="relative min-h-screen overflow-x-hidden text-ink">
        <Background />
        <MatchPostponed
          username={username}
          opponent={opponent}
          aStatus={"status" in a ? a.status : undefined}
          bStatus={"status" in b ? b.status : undefined}
        />
      </div>
    );
  }

  const duel = computeDuel(withFlag(a.card), withFlag(b.card));
  return (
    <div className="relative min-h-screen overflow-x-hidden text-ink">
      <Background />
      <DuelView key={`${a.card.username}/vs/${b.card.username}`} duel={duel} />
    </div>
  );
}
