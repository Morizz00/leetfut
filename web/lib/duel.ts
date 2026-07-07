import type { Card, StatKey } from "./types";
import { STAT_LABELS, STATS } from "./constants";

export type DuelSide = "challenger" | "opponent";

export interface DuelRow {
  key: StatKey;
  label: string;
  challenger: number;
  opponent: number;
  /** Higher value takes the row; equal values score for neither side. */
  winner: DuelSide | null;
}

export interface DuelReceipt {
  label: string;
  challenger: number;
  opponent: number;
}

export interface Duel {
  challenger: Card;
  opponent: Card;
  rows: DuelRow[];
  score: Record<DuelSide, number>;
  /** null = Draw. */
  winner: DuelSide | null;
  /** true when a level Scoreline was decided by Overall (penalties). */
  onPenalties: boolean;
  /** Same username in both corners — a training match, always a Draw. */
  training: boolean;
  receipts: DuelReceipt[];
  /** Playstyle names both sides earned (shared traits strip). */
  sharedPlaystyles: string[];
}

const RECEIPTS: { field: keyof Card; label: string }[] = [
  { field: "contestRating", label: "Contest rating" },
  { field: "hardSolved", label: "Hard problems solved" },
  { field: "contestsAttended", label: "Contests attended" },
  { field: "reputation", label: "Reputation" },
  { field: "topicsSolved", label: "Topics solved" },
  { field: "totalSolved", label: "Total problems solved" },
];

const receiptValue = (card: Card, field: keyof Card): number => {
  const v = card[field];
  return typeof v === "number" ? v : 0;
};

export function tallyRows(rows: DuelRow[]): { a: number; b: number } {
  return {
    a: rows.filter((r) => r.winner === "challenger").length,
    b: rows.filter((r) => r.winner === "opponent").length,
  };
}

const FULL_ROW_GAP = 20;
const ROW_WEIGHT = 0.7;

export function dominanceShare(rows: DuelRow[]): number {
  if (rows.length === 0) return 50;
  const { a, b } = tallyRows(rows);
  const rowShare = (a + (rows.length - a - b) / 2) / rows.length;
  const marginShare =
    rows.reduce(
      (t, r) =>
        t +
        0.5 +
        Math.max(
          -0.5,
          Math.min(0.5, (r.challenger - r.opponent) / (2 * FULL_ROW_GAP)),
        ),
      0,
    ) / rows.length;
  return Math.round((ROW_WEIGHT * rowShare + (1 - ROW_WEIGHT) * marginShare) * 100);
}

export function computeDuel(challenger: Card, opponent: Card): Duel {
  const training =
    challenger.username.toLowerCase() === opponent.username.toLowerCase();

  const rows: DuelRow[] = STATS.map((key) => {
    const a = challenger.stats[key];
    const b = opponent.stats[key];
    return {
      key,
      label: STAT_LABELS[key],
      challenger: a,
      opponent: b,
      winner: a === b ? null : a > b ? "challenger" : "opponent",
    };
  });

  const tally = tallyRows(rows);
  const score: Record<DuelSide, number> = {
    challenger: tally.a,
    opponent: tally.b,
  };

  let winner: DuelSide | null = null;
  let onPenalties = false;
  if (!training) {
    if (score.challenger !== score.opponent) {
      winner = score.challenger > score.opponent ? "challenger" : "opponent";
    } else if (challenger.overall !== opponent.overall) {
      winner =
        challenger.overall > opponent.overall ? "challenger" : "opponent";
      onPenalties = true;
    }
  }

  const receipts: DuelReceipt[] = RECEIPTS.map(({ field, label }) => ({
    label,
    challenger: receiptValue(challenger, field),
    opponent: receiptValue(opponent, field),
  }));

  const opponentStyles = new Set(opponent.playstyles.map((p) => p.name));
  const sharedPlaystyles = challenger.playstyles
    .map((p) => p.name)
    .filter((name) => opponentStyles.has(name));

  return {
    challenger,
    opponent,
    rows,
    score,
    winner,
    onPenalties,
    training,
    receipts,
    sharedPlaystyles,
  };
}
