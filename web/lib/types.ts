// The LeetFut Card contract — mirrors the Rust backend's scoring::types::Card
// (leetfut/backend/src/scoring/types.rs) 1:1. This is the ONLY shape the API
// returns; there is no nested report/metrics object like GitFut had.

export type StatKey = "pac" | "sho" | "pas" | "dri" | "def" | "phy";
export type Stats = Record<StatKey, number>;

export type Position = "ST" | "RW" | "CAM" | "CM" | "CDM" | "CB";
export type Family = "Forward" | "Playmaker" | "Anchor";
export type Finish = "bronze" | "silver" | "gold" | "red" | "totw" | "chrome" | "icon";
export type WorkRateLevel = "High" | "Med" | "Low";

export interface Playstyle {
  name: string;
  plus: boolean; // elite "PlayStyle+" tier
  reason: string; // short, plain why-it-was-given (tooltip)
}

export interface Card {
  username: string;
  name: string;
  avatarUrl: string;
  // empty string when unknown — same semantics as GitFut's card.country
  country: string;
  stats: Stats;
  position: Position;
  family: Family;
  baseOvr: number;
  overall: number;
  finish: Finish;
  archetype: string;
  archetypeBlurb: string;
  legacy: number; // 0..1
  skillMoves: number; // 1-5
  weakFoot: number; // 1-5
  workRateAttack: WorkRateLevel;
  workRateDefense: WorkRateLevel;
  style: string;
  playstyles: Playstyle[];
  // Raw LeetCode counts, not normalized into a stat — surfaced as-is so the report
  // can lead with contests/problems/topics rather than only the abstract stats.
  contestRating: number;
  contestsAttended: number;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  topicsSolved: number;
  easyTopicsSolved: number;
  mediumTopicsSolved: number;
  hardTopicsSolved: number;
  languagesUsed: number;
  reputation: number;
  activeDays: number;
}
