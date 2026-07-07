"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { Card } from "@/lib/types";
import PlayerCard from "./PlayerCard";
import StoryFrame from "./StoryFrame";
import CardActions from "./CardActions";
import DuelButton from "./DuelButton";
import FlagPicker from "./FlagPicker";
import Mascot from "./Mascot";
import FooterCredit from "./FooterCredit";
import HowItWorksModal from "./HowItWorksModal";
import { AttributesPanel, StatsPanel, ScoutingMetrics, TopicsPanel, ReportHeader } from "./ScoutReport";
import { resolveResultTheme } from "./finishTheme";
import { useReveal } from "@/hooks/useReveal";
import { burstConfetti } from "@/lib/confetti";

interface Props {
  card: Card;
  onBack: () => void;
  /** Edit the card's flag from the report (click-the-flag picker). */
  onCountryChange: (code: string) => void;
  /** LeetCode-derived flag; share links only carry ?country= when it's overridden. */
  canonicalCountry?: string;
}

// Card width scales with the viewport but is bounded by BOTH width and height
// (and a hard min/max) so it never overflows a narrow phone or a short laptop.
const CARD_WIDTH = "clamp(220px, min(80vw, 40vh), 332px)";

// Confetti palette per tier — gold for prestige, brand orange always woven in.
const CONFETTI: Record<string, string[]> = {
  chrome: ["#d8dde3", "#f6f8fb", "#9aa4ae", "#ffffff", "#ffa116"],
  icon: ["#e9cc74", "#d4af37", "#f5f0e1", "#ffffff", "#ffa116"],
  totw: ["#ffa116", "#e9cc74", "#ffffff", "#7fa8ff"],
};

export default function ResultView({
  card,
  onBack,
  onCountryChange,
  canonicalCountry = "",
}: Props) {
  const captureRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const theme = resolveResultTheme(card);
  const phase = useReveal(card.finish);
  const [modalOpen, setModalOpen] = useState(false);

  // BACK when the visitor came from home this tab; otherwise (direct / shared
  // link) a CTA to make their own card. Default to the CTA so share-link
  // visitors — the growth case — see it without a flash.
  const [seenHome, setSeenHome] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("leetfut:seen-home") === "1";
    } catch {}
    // Deferred (not a synchronous set-in-effect) so it can't cascade a render.
    const t = setTimeout(() => setSeenHome(seen), 0);
    return () => clearTimeout(t);
  }, []);

  // Fire confetti when the rare-tier reveal hits its burst.
  useEffect(() => {
    if (phase === "burst") {
      const palette = CONFETTI[card.finish] ?? ["#ffa116", "#e9cc74", "#ffffff"];
      burstConfetti(palette);
    }
  }, [phase, card.finish]);

  const ignited = phase === "ignite" || phase === "burst" || phase === "freeze";

  return (
    <>
    <main className="relative z-[2] mx-auto flex min-h-[100dvh] w-full max-w-[1600px] flex-col px-[clamp(16px,4vw,40px)]">
      {/* Tier-reactive backdrop: dims the global brand wash and lets the card's
          own tier color own the result screen (brand is the action, the card is
          the prize — they shouldn't fight here). Fades in with the reveal. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: `radial-gradient(120% 80% at 50% -10%, ${theme.glow}, transparent 55%), #15110b`,
          opacity: ignited ? 0.9 : 0.4,
          transition: "opacity 1s ease",
        }}
      />

      {/* top bar: BACK button + mascot on the left, "how it works" on the right */}
      <div className="mb-[8px] mt-[clamp(8px,2vh,18px)] flex w-full shrink-0 items-center justify-between gap-[10px]">
        <div className="flex items-center gap-[10px]">
          <button
            onClick={onBack}
            className={
              seenHome
                ? "group inline-flex items-center gap-[6px] text-[13px] font-medium tracking-wide text-ink-faint transition hover:text-ink"
                : "group inline-flex items-center gap-[6px] text-[13px] font-semibold tracking-wide text-brand transition hover:text-brand-hi"
            }
          >
            {seenHome ? (
              <>
                <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
                BACK
              </>
            ) : (
              <>
                <ArrowLeft size={16} className="transition-transform group-hover:translate-x-0.5" />
                GET SCOUTED
              </>
            )}
          </button>
          <Mascot size={40} kick={false} ball={false} animate={false} />
        </div>
        <div className="flex items-center gap-[clamp(10px,2vw,16px)] justify-end">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="cursor-pointer text-[12.5px] font-semibold text-ink-soft underline-offset-2 transition hover:text-brand hover:underline max-[420px]:hidden"
          >
            how it works ↗
          </button>
        </div>
      </div>

      <div className="shrink-0">
        <ReportHeader card={card} />
      </div>

      <div className="mt-[clamp(14px,2.4vh,26px)] grid grid-cols-[1fr_auto_1fr] items-start gap-[clamp(16px,2.4vw,40px)] max-[980px]:mt-6 max-[980px]:flex max-[980px]:flex-col max-[980px]:items-center">
        {/* left — attributes + playstyles. Pinned to the column's outer (left)
            edge, not the card-facing edge, so widening the page pushes this
            panel further from the card instead of leaving dead space at the
            true left edge. */}
        <div className="flex justify-start max-[980px]:order-2 max-[980px]:w-full max-[980px]:max-w-[420px] max-[980px]:justify-center">
          <div className="w-full max-w-[360px]">
            <AttributesPanel card={card} />
          </div>
        </div>

        {/* center — the card + actions (the walkout happens here) */}
        <div className="relative flex flex-col items-center gap-[clamp(12px,2vh,18px)] max-[980px]:order-1">
          {/* spotlight wash — a soft, diffuse glow from above as the card rises.
              Reduced + blurred so it reads as ambient light, not a hard beam. */}
          <div
            className="animate-spotlight pointer-events-none absolute left-1/2 top-[-10%] z-0 h-[70%] w-[120%] blur-[40px]"
            style={{
              background: `radial-gradient(60% 70% at 50% 0%, ${theme.glow}, transparent 72%)`,
              opacity: ignited ? 0.4 : 0,
              transition: "opacity .5s ease",
            }}
          />
          {/* card stage — holds the captured card AND the flag editor as siblings.
              The editor overlays the flag slot but lives OUTSIDE captureRef, so the
              downloaded/copied PNG never includes the picker UI. */}
          <div className="animate-walkout relative" style={{ width: CARD_WIDTH }}>
            <div ref={captureRef} className="relative">
              {/* tier glow that ignites on reveal */}
              <div
                className="animate-glow pointer-events-none absolute -inset-[12%] z-0 rounded-full blur-[20px]"
                style={{
                  background: `radial-gradient(closest-side, ${theme.glow}, transparent 72%)`,
                  opacity: ignited ? 1 : 0,
                  transition: "opacity .6s ease",
                }}
              />
              <div className="relative z-[1]">
                <PlayerCard card={card} />
              </div>
            </div>
            <FlagPicker value={card.country} onChange={onCountryChange} />
          </div>
          <div style={{ width: CARD_WIDTH }}>
            <CardActions
              card={card}
              targetRef={captureRef}
              storyRef={storyRef}
              canonicalCountry={canonicalCountry}
            />
            <div className="mt-[10px]">
              <DuelButton username={card.username} />
            </div>
          </div>
        </div>

        {/* right — contests/problems lead, then topics/languages, then the
            derived stat breakdown. Pinned to the column's outer (right) edge,
            mirroring the left panel, so the card gets the breathing room in
            the middle instead of both panels crowding toward center. */}
        <div className="flex justify-end max-[980px]:order-3 max-[980px]:w-full max-[980px]:max-w-[420px] max-[980px]:justify-center">
          <div className="flex w-full max-w-[360px] flex-col gap-[14px]">
            <ScoutingMetrics card={card} />
            <TopicsPanel card={card} />
            <StatsPanel card={card} />
          </div>
        </div>
      </div>

      <footer className="relative z-[2] mt-auto flex flex-none items-center justify-center p-[clamp(12px,2.6vh,24px)]">
        <FooterCredit />
      </footer>

      {/* Off-screen story canvas (1080×1920). Parked in a 0×0 clip holder at the
          viewport origin — NOT display:none — so its card art/avatar/fonts paint
          and decode, letting renderCardImage clone + capture it for the Story
          download/share. Same off-screen technique as lib/capture.ts. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          overflow: "hidden",
          zIndex: -1,
          pointerEvents: "none",
        }}
      >
        <StoryFrame ref={storyRef} card={card} />
      </div>
    </main>

    {modalOpen && <HowItWorksModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
