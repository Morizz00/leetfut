import { describe, expect, it } from "vitest";
import { RESULT_THEME, duelThemes } from "@/components/finishTheme";
import type { Card, Finish } from "@/lib/types";

const card = (finish: Finish): Card => ({ finish }) as Card;
const TOTW_BLUE = "#7fa8ff";

describe("duelThemes (kit clash)", () => {
  it("totw vs silver: the totw side wears saturated blue, silver stays silver", () => {
    const { home, away } = duelThemes(card("totw"), card("silver"));
    expect(home.ink).toBe(TOTW_BLUE);
    expect(away).toEqual(RESULT_THEME.silver);
  });

  it("chrome vs silver: chrome side wears saturated blue", () => {
    expect(duelThemes(card("chrome"), card("silver")).home.ink).toBe(TOTW_BLUE);
    expect(duelThemes(card("silver"), card("chrome")).away.ink).toBe(TOTW_BLUE);
  });

  it("no other matchup is touched", () => {
    expect(duelThemes(card("gold"), card("icon"))).toEqual({
      home: RESULT_THEME.gold,
      away: RESULT_THEME.icon,
    });
    expect(duelThemes(card("gold"), card("gold"))).toEqual({
      home: RESULT_THEME.gold,
      away: RESULT_THEME.gold,
    });
  });
});
