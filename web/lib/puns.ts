// Loading-screen pun bank — football × LeetCode. Pure data + a deterministic
// rotation helper so the loading screen stays lively without randomness.
export const PUNS: readonly string[] = [
  "Measuring your xG (eXpected Grinding)…",
  "Checking VAR (Variable & Array Review)…",
  "Counting clean sheets (zero-TLE submissions)…",
  "Reviewing the tape (your submission history)…",
  "Assessing first touch (first-attempt accepts)…",
  "Timing your sprints (and your contests)…",
  "Scouting your set pieces (edge cases)…",
  "Weighing your transfer fee (contest rating)…",
  "Inspecting your stamina (solve streak)…",
  "Reading your through-balls (optimal solutions)…",
  "Grading your work rate (problems per night)…",
  "Auditing your big-O (not your big ego)…",
];

// Stable line for a given tick — callers advance `tick` on an interval.
export function punAt(tick: number): string {
  return PUNS[((tick % PUNS.length) + PUNS.length) % PUNS.length];
}
