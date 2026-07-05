"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  Flame,
  Layers,
  Star,
  Target,
  TrendingUp,
  Trophy,
  type LucideIcon,
  Zap,
} from "lucide-react";
import type { Card, Finish, Playstyle } from "@/lib/types";
import { deEmDash } from "@/lib/text";
import { resolveResultTheme, FINISH_LABEL } from "./finishTheme";

// The backend's playstyle catalog (leetfut/backend/src/scoring/playstyles.rs)
// doesn't carry an icon key — only name/plus/reason — so the icon is resolved
// here by name, with a sane default for anything unrecognized.
const PLAYSTYLE_ICONS: Record<string, LucideIcon> = {
  "Speed Solver": Zap,
  "Hard Hitter": Flame,
  "Streak Keeper": Clock,
  "Contest Grinder": Trophy,
  Completionist: Star,
  Polymath: Layers,
  Sharpshooter: Target,
  Ranked: TrendingUp,
};

// The scout's one-line verdict — the signature, in recruitment vernacular.
const VERDICTS: Record<Finish, string> = {
  icon: "Generational talent",
  chrome: "Elite prospect",
  totw: "In-form, in demand",
  red: "Breaking out",
  gold: "First-team ready",
  silver: "Squad rotation",
  bronze: "One to watch",
};

const STAT_LABELS: Record<keyof Card["stats"], string> = {
  pac: "Pace",
  sho: "Shooting",
  pas: "Passing",
  dri: "Dribbling",
  def: "Defending",
  phy: "Physical",
};

// Lightweight hover popup explaining why a value was given.
function Tip({
  text,
  align = "center",
  children,
}: {
  text: string;
  align?: "left" | "right" | "center";
  children: React.ReactNode;
}) {
  const pos = align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span className="group/tip relative inline-flex cursor-help items-center">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full ${pos} z-30 mb-2 hidden w-max max-w-[220px] whitespace-normal rounded-lg border border-white/10 bg-[#17131f] px-3 py-2 text-left text-[12px] font-normal leading-snug text-ink-dim shadow-[0_10px_30px_rgba(0,0,0,.55)] group-hover/tip:block`}
      >
        {text}
      </span>
    </span>
  );
}

function StarRating({ value, accent }: { value: number; accent: string }) {
  return (
    <span className="inline-flex gap-[3px]" style={{ color: accent }} aria-label={`${value} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={15} className={i < value ? "fill-current" : "fill-transparent opacity-25"} />
      ))}
    </span>
  );
}

function AttributeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.06] py-[11px] last:border-0">
      <span className="text-[13.5px] text-ink-dim">{label}</span>
      <span className="font-display text-[14px] font-bold tracking-[.02em] text-ink-soft">{children}</span>
    </div>
  );
}

// Editorial section: an accent dash + tracked label, then content — reads as a
// scouting-report section rather than a dashboard card.
function Section({
  title,
  accent,
  className,
  children,
}: {
  title: string;
  accent: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] p-[16px] ${className ?? ""}`}>
      <div className="mb-[8px] flex items-center gap-[9px]">
        <span className="h-[2px] w-[16px] rounded-full" style={{ background: accent }} />
        <h3 className="font-display text-[11px] font-bold tracking-[.22em] text-ink-faint">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function PlaystyleList({ playstyles, accent }: { playstyles: Playstyle[]; accent: string }) {
  if (playstyles.length === 0) {
    return <p className="py-1 text-[13.5px] leading-snug text-ink-mute">No standout traits yet — keep solving.</p>;
  }
  return (
    <ul className="flex flex-col gap-[11px] pt-1">
      {playstyles.map((p) => {
        const Icon = PLAYSTYLE_ICONS[p.name] ?? Star;
        return (
          <li key={p.name}>
            <Tip text={p.reason} align="left">
              <Icon size={16} style={{ color: accent }} aria-hidden />
              <span className="ml-[11px] text-[14px] font-medium text-ink-soft">{p.name}</span>
              {p.plus && (
                <span
                  className="font-display ml-[7px] rounded-[5px] px-[5px] text-[11px] font-extrabold leading-[15px]"
                  style={{ background: accent, color: "#0b0a0f" }}
                  title="PlayStyle+"
                >
                  +
                </span>
              )}
            </Tip>
          </li>
        );
      })}
    </ul>
  );
}

// The headline scouting numbers — contest rating leads (it's the number a
// competitive solver actually recognizes), then volume/breadth. These are raw
// LeetCode counts, not normalized stats, so they get their own prominent block
// above the abstract 1-99 stat bars rather than being buried among them.
function BigStat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11.5px] uppercase tracking-[.12em] text-ink-faint">{label}</span>
      <span className="font-display text-[26px] font-black leading-[1.05] tabular-nums" style={{ color: accent }}>
        {value}
      </span>
      {sub && <span className="mt-[1px] text-[12px] text-ink-mute">{sub}</span>}
    </div>
  );
}

// Shared visual pattern for any easy/medium/hard split — problems solved AND
// distinct topics solved both read the same way, so this isn't card-specific.
function DifficultyBreakdown({ easy, medium, hard, total }: { easy: number; medium: number; hard: number; total: number }) {
  const parts: { label: string; value: number; color: string }[] = [
    { label: "Easy", value: easy, color: "#00b8a3" },
    { label: "Medium", value: medium, color: "#ffc01e" },
    { label: "Hard", value: hard, color: "#ff375f" },
  ];
  const safeTotal = Math.max(total, 1);
  return (
    <div className="mt-[10px]">
      <div className="flex h-[6px] overflow-hidden rounded-full bg-white/[0.07]">
        {parts.map((p) => (
          <div key={p.label} style={{ width: `${(p.value / safeTotal) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="mt-[7px] flex flex-wrap gap-x-[14px] gap-y-[3px]">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-[5px] text-[12px] text-ink-dim">
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: p.color }} />
            {p.label} <span className="tabular-nums text-ink-soft">{p.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Right side, top block: contests + problems + topics — the numbers a solver
// recognizes at a glance, prioritized above the derived FUT-style stat bars.
export function ScoutingMetrics({ card }: { card: Card }) {
  const accent = resolveResultTheme(card).ink;
  return (
    <Section title="CONTESTS & PROBLEMS" accent={accent} className="w-full">
      <div className="grid grid-cols-2 gap-[16px] pt-1">
        <BigStat
          label="Contest rating"
          value={card.contestRating > 0 ? Math.round(card.contestRating).toLocaleString() : "—"}
          sub={`${card.contestsAttended} contest${card.contestsAttended === 1 ? "" : "s"}`}
          accent={accent}
        />
        <BigStat
          label="Topics solved"
          value={card.topicsSolved.toString()}
          sub="distinct tags"
          accent={accent}
        />
      </div>
      <div className="mt-[16px] border-t border-white/[0.06] pt-[14px]">
        <BigStat label="Problems solved" value={card.totalSolved.toLocaleString()} accent={accent} />
        <DifficultyBreakdown
          easy={card.easySolved}
          medium={card.mediumSolved}
          hard={card.hardSolved}
          total={card.totalSolved}
        />
      </div>
    </Section>
  );
}

// Right side, second block: how that topic/problem breadth was earned — the
// difficulty spread of the topics themselves (not just problems), plus the two
// signals LeetCode's own profile leads with that GitFut had no equivalent for:
// language diversity and community reputation.
export function TopicsPanel({ card }: { card: Card }) {
  const accent = resolveResultTheme(card).ink;
  return (
    <Section title="TOPICS & LANGUAGES" accent={accent} className="w-full">
      <DifficultyBreakdown
        easy={card.easyTopicsSolved}
        medium={card.mediumTopicsSolved}
        hard={card.hardTopicsSolved}
        total={card.topicsSolved}
      />
      <div className="mt-[16px] grid grid-cols-2 gap-[16px] border-t border-white/[0.06] pt-[14px]">
        <BigStat label="Languages used" value={card.languagesUsed.toString()} accent={accent} />
        <BigStat label="Reputation" value={card.reputation.toLocaleString()} accent={accent} />
      </div>
      <div className="mt-[14px] flex items-center justify-between border-t border-white/[0.06] pt-[12px]">
        <span className="text-[13px] text-ink-dim">Active days (past year)</span>
        <span className="font-display text-[14px] font-bold tracking-[.02em] text-ink-soft">{card.activeDays}</span>
      </div>
    </Section>
  );
}

function StatBar({ label, value, accent, index = 0 }: { label: string; value: number; accent: string; index?: number }) {
  const fill = Math.max(value, 4); // never an empty bar; show a sliver minimum
  // Entrance: each row eases up + its bar sweeps from 0 to value, staggered down
  // the list, so the panel "draws itself" like a live scouting readout.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Set is kept inside the timeout (never synchronous in the effect body) so it
    // can't cascade renders. Reduced motion uses a 0ms delay — the global
    // prefers-reduced-motion reset in globals.css makes the transition instant.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const t = setTimeout(() => setMounted(true), reduced ? 0 : 120 + index * 55);
    return () => clearTimeout(t);
  }, [index]);

  return (
    <div
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(6px)",
        transition: "opacity .5s ease, transform .5s cubic-bezier(.16,1,.3,1)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-ink-dim">{label}</span>
        <span className="font-display text-[16px] font-bold leading-none tabular-nums" style={{ color: accent }}>
          {value}
        </span>
      </div>
      <div className="mt-[7px] h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full transition-[width] duration-[900ms] ease-out"
          style={{ width: mounted ? `${fill}%` : "0%", background: `linear-gradient(90deg, ${accent}99, ${accent})` }}
        />
      </div>
    </div>
  );
}

// A child that fades + lifts into place on mount, staggered by `step`. Honors
// reduced motion (appears instantly). Powers the header's cascade entrance.
function Stagger({ step, children, className }: { step: number; children: React.ReactNode; className?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const t = setTimeout(() => setShown(true), reduced ? 0 : 90 + step * 110);
    return () => clearTimeout(t);
  }, [step]);
  return (
    <div
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0) scale(1)" : "translateY(10px) scale(.98)",
        transition: "opacity .55s ease, transform .55s cubic-bezier(.16,1,.3,1)",
      }}
    >
      {children}
    </div>
  );
}

// Scouting-dossier header. A left "grade stamp" (the OVR + tier, the scout's
// verdict-at-a-glance) anchors the row; the identity block sits beside it with
// the name as hero, one clean meta line, and the verdict inline. No centered
// stack, no floating pill, no decorative flanking rules.
export function ReportHeader({ card }: { card: Card }) {
  const theme = resolveResultTheme(card);
  const accent = theme.ink;
  return (
    <header className="relative mx-auto flex max-w-[640px] items-center gap-[clamp(16px,3vw,28px)]">
      {/* left — the grade stamp: OVR over tier, the dossier's headline metric */}
      <Stagger step={0} className="shrink-0">
        <div
          className="relative flex h-[clamp(78px,13vw,98px)] w-[clamp(78px,13vw,98px)] flex-col items-center justify-center rounded-2xl border"
          style={{
            borderColor: `${accent}40`,
            background: `linear-gradient(160deg, ${accent}1a, transparent 70%), #161b22`,
            boxShadow: `0 0 30px ${accent}1f, inset 0 1px 0 ${accent}26`,
          }}
        >
          <span
            className="font-display text-[clamp(34px,6vw,46px)] font-black leading-[.82] tabular-nums"
            style={{ color: accent, filter: `drop-shadow(0 1px 8px ${accent}55)` }}
          >
            {card.overall}
          </span>
          <span className="font-display mt-[2px] text-[10px] font-bold tracking-[.22em] text-ink-faint">
            {FINISH_LABEL[card.finish]}
          </span>
        </div>
      </Stagger>

      {/* right — identity block, left-aligned */}
      <div className="min-w-0 flex-1 text-left">
        <Stagger step={1}>
          <div className="flex items-center gap-[8px]">
            <span className="font-display text-[11px] font-bold tracking-[.3em] text-brand">SCOUT REPORT</span>
            <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
          </div>
        </Stagger>

        <Stagger step={2} className="relative">
          <div
            aria-hidden
            className="animate-glow pointer-events-none absolute -left-[6%] top-1/2 -z-10 h-[160%] w-[70%] -translate-y-1/2 rounded-full blur-[42px]"
            style={{ background: `radial-gradient(closest-side, ${theme.glow}, transparent 72%)` }}
          />
          <h2
            className="font-display mt-[2px] truncate text-[clamp(32px,5.4vw,56px)] font-black leading-[.92]"
            style={{
              backgroundImage: `linear-gradient(100deg, #e6edf3 0%, #e6edf3 38%, ${accent} 50%, #fff 54%, #e6edf3 64%, #e6edf3 100%)`,
              backgroundSize: "220% 100%",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              filter: `drop-shadow(0 2px 14px ${accent}38)`,
              animation: "lf-name-shimmer 4.5s ease-in-out 0.6s both",
            }}
          >
            {card.name}
          </h2>
        </Stagger>

        <Stagger step={3}>
          <div className="mt-[8px] flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
            <span
              className="font-display inline-flex items-center rounded-[6px] border border-brand/40 bg-brand/15 px-[9px] py-[3px] text-[12.5px] font-bold leading-none tracking-[.14em] text-brand"
            >
              {card.position}
            </span>
            <span className="text-[14px] font-medium text-ink-dim">{card.archetype}</span>
            <span aria-hidden className="h-[11px] w-px bg-white/15" />
            <a
              href={`https://leetcode.com/u/${card.username}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[13px] text-ink-faint underline-offset-2 transition hover:text-brand hover:underline"
            >
              @{card.username}
            </a>
          </div>
        </Stagger>

        {/* verdict inline: label + grade, then the blurb continues the sentence */}
        <Stagger step={4}>
          <p className="mt-[9px] line-clamp-2 text-[13.5px] leading-[1.5] text-ink-soft">
            <span className="font-display mr-[7px] text-[11px] font-bold tracking-[.18em]" style={{ color: accent }}>
              {VERDICTS[card.finish].toUpperCase()}
            </span>
            {deEmDash(card.archetypeBlurb)}.
          </p>
        </Stagger>
      </div>
    </header>
  );
}

// Left side: attributes + playstyles. The report has no per-attribute "reason"
// text (the backend's Card carries no tooltip strings for these), so the rows
// are plain values — the header's verdict + blurb already carry the "why".
export function AttributesPanel({ card }: { card: Card }) {
  const accent = resolveResultTheme(card).ink;
  return (
    <div className="flex w-full flex-col gap-[14px]">
      <Section title="ATTRIBUTES" accent={accent}>
        <AttributeRow label="Skill moves">
          <StarRating value={card.skillMoves} accent={accent} />
        </AttributeRow>
        <AttributeRow label="Weak foot">
          <StarRating value={card.weakFoot} accent={accent} />
        </AttributeRow>
        <AttributeRow label="Work rate">
          <span>
            {card.workRateAttack} / {card.workRateDefense}
          </span>
        </AttributeRow>
        <AttributeRow label="Style">
          <span>{card.style}</span>
        </AttributeRow>
      </Section>

      <Section title="PLAYSTYLES" accent={accent}>
        <PlaystyleList playstyles={card.playstyles} accent={accent} />
      </Section>
    </div>
  );
}

// Right side: the six core stats as a compact readout. GitFut's raw-count
// "scouting metrics" (stars, commits, etc.) don't exist in this Card shape —
// the backend never sends the underlying LeetCode counts, only the normalized
// 1-99 stats — so this panel is that stat block instead.
export function StatsPanel({ card }: { card: Card }) {
  const accent = resolveResultTheme(card).ink;
  const keys = Object.keys(STAT_LABELS) as (keyof Card["stats"])[];
  return (
    <Section title="STAT BREAKDOWN" accent={accent} className="w-full">
      <div className="flex flex-col gap-[13px] pt-1">
        {keys.map((k, i) => (
          <StatBar key={k} label={STAT_LABELS[k]} value={card.stats[k]} accent={accent} index={i} />
        ))}
      </div>
    </Section>
  );
}
