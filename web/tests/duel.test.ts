import { describe, expect, it } from "vitest";
import { computeDuel, dominanceShare, tallyRows } from "@/lib/duel";
import { duelSequenceFor, resolvedRows } from "@/lib/reveal";
import type { Card, Stats } from "@/lib/types";

const mkCard = (
  username: string,
  stats: Stats,
  overall: number,
  extras: {
    playstyles?: string[];
    contestRating?: number;
    hardSolved?: number;
  } = {},
): Card => ({
  username,
  name: username,
  avatarUrl: `https://example.com/${username}.png`,
  country: "",
  stats,
  position: "CM",
  family: "Playmaker",
  baseOvr: overall,
  overall,
  finish: "gold",
  archetype: "Mezzala",
  archetypeBlurb: "",
  legacy: 0,
  skillMoves: 3,
  weakFoot: 3,
  workRateAttack: "Med",
  workRateDefense: "Med",
  style: "Measured",
  playstyles: (extras.playstyles ?? []).map((name) => ({
    name,
    plus: false,
    reason: "",
  })),
  contestRating: extras.contestRating ?? 0,
  contestsAttended: 0,
  totalSolved: 0,
  easySolved: 0,
  mediumSolved: 0,
  hardSolved: extras.hardSolved ?? 0,
  topicsSolved: 0,
  easyTopicsSolved: 0,
  mediumTopicsSolved: 0,
  hardTopicsSolved: 0,
  languagesUsed: 0,
  reputation: 0,
  activeDays: 0,
});

const stats = (
  pac: number,
  sho: number,
  pas: number,
  dri: number,
  def: number,
  phy: number,
): Stats => ({ pac, sho, pas, dri, def, phy });

describe("computeDuel", () => {
  it("most stat wins takes the duel; equal rows score for neither side", () => {
    const a = mkCard("a", stats(90, 90, 90, 90, 10, 50), 80);
    const b = mkCard("b", stats(10, 10, 10, 10, 90, 50), 70);
    const duel = computeDuel(a, b);
    expect(duel.score).toEqual({ challenger: 4, opponent: 1 });
    expect(duel.rows.find((r) => r.key === "phy")?.winner).toBeNull();
    expect(duel.winner).toBe("challenger");
    expect(duel.onPenalties).toBe(false);
  });

  it("a 3–3 scoreline goes to penalties: higher overall takes it", () => {
    const a = mkCard("a", stats(90, 90, 90, 10, 10, 10), 70);
    const b = mkCard("b", stats(10, 10, 10, 90, 90, 90), 80);
    const duel = computeDuel(a, b);
    expect(duel.score).toEqual({ challenger: 3, opponent: 3 });
    expect(duel.winner).toBe("opponent");
    expect(duel.onPenalties).toBe(true);
  });

  it("the same username in both corners is a training match (draw)", () => {
    const a = mkCard("Same", stats(80, 70, 60, 50, 40, 30), 75);
    const b = mkCard("same", stats(80, 70, 60, 50, 40, 30), 75);
    const duel = computeDuel(a, b);
    expect(duel.training).toBe(true);
    expect(duel.winner).toBeNull();
  });

  it("receipts read from flat card fields", () => {
    const a = mkCard("a", stats(50, 50, 50, 50, 50, 50), 70, {
      contestRating: 1800,
      hardSolved: 42,
    });
    const b = mkCard("b", stats(50, 50, 50, 50, 50, 50), 70);
    const duel = computeDuel(a, b);
    expect(duel.receipts.find((r) => r.label === "Contest rating")?.challenger).toBe(1800);
    expect(duel.receipts.find((r) => r.label === "Hard problems solved")?.challenger).toBe(42);
    expect(duel.receipts.find((r) => r.label === "Contest rating")?.opponent).toBe(0);
  });

  it("shared playstyles are the intersection, in the challenger's order", () => {
    const a = mkCard("a", stats(50, 50, 50, 50, 50, 50), 70, {
      playstyles: ["Workhorse", "Star Magnet", "Polyglot"],
    });
    const b = mkCard("b", stats(50, 50, 50, 50, 50, 50), 70, {
      playstyles: ["Polyglot", "Workhorse", "Veteran"],
    });
    expect(computeDuel(a, b).sharedPlaystyles).toEqual(["Workhorse", "Polyglot"]);
  });
});

describe("dominanceShare", () => {
  it("is 50 for a dead-even duel and for no resolved rows", () => {
    const a = mkCard("a", stats(70, 70, 70, 70, 70, 70), 75);
    expect(dominanceShare(computeDuel(a, a).rows)).toBe(50);
    expect(dominanceShare([])).toBe(50);
  });
});

describe("duel broadcast sequence", () => {
  it("walks out, resolves all six rows, stamps, then settles", () => {
    const steps = duelSequenceFor(false);
    expect(steps[0].phase).toEqual({ kind: "walkout" });
    expect(steps[steps.length - 1].phase).toEqual({ kind: "settled" });
  });

  it("resolvedRows maps every phase to the scoreboard's row count", () => {
    expect(resolvedRows({ kind: "walkout" })).toBe(0);
    expect(resolvedRows({ kind: "row", row: 2 })).toBe(3);
    expect(resolvedRows({ kind: "settled" })).toBe(6);
  });
});
