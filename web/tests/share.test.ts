import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/types";
import { siteUrl } from "@/lib/site";
import { cardUrl, duelIntentUrl, duelShareMessage, duelUrl, intentUrl, nativeSharePayload, shareMessage, shareText } from "@/lib/share";

// We test the share DECISIONS: correct platform endpoints, well-formed encoded
// URLs, stable per-username text, brag-led message. Not the React wiring.

const card = (over: Partial<Card> = {}): Card =>
  ({
    username: "notorious137",
    name: "Notorious",
    avatarUrl: "https://example.com/a.png",
    country: "us",
    stats: { pac: 74, sho: 97, pas: 90, dri: 69, def: 65, phy: 96 },
    position: "ST",
    family: "Forward",
    baseOvr: 88,
    overall: 95,
    finish: "icon",
    archetype: "Galáctico",
    archetypeBlurb: "hall-of-fame problem solver",
    legacy: 1,
    skillMoves: 3,
    weakFoot: 4,
    workRateAttack: "High",
    workRateDefense: "Med",
    style: "Relentless",
    playstyles: [],
    ...over,
  }) as Card;

describe("share service", () => {
  it("builds the canonical card URL from the username, encoding the displayed flag", () => {
    expect(cardUrl(card())).toBe(`${siteUrl()}/notorious137?country=us`);
  });

  it("omits the country param when the card has no flag", () => {
    expect(cardUrl(card({ country: "" }))).toBe(`${siteUrl()}/notorious137`);
  });

  it("X intent uses /intent/tweet (NOT /intent/post) and carries url + hashtag", () => {
    const u = intentUrl("x", card());
    expect(u).toContain("https://twitter.com/intent/tweet?");
    expect(u).not.toContain("/intent/post");
    expect(u).toContain("hashtags=LeetFut");
    expect(u).toContain(encodeURIComponent(`${siteUrl()}/notorious137?country=us`));
  });

  it("LinkedIn intent uses share-offsite with only the url (preview from OG)", () => {
    const u = intentUrl("linkedin", card());
    expect(u).toContain("linkedin.com/sharing/share-offsite/?url=");
    expect(u).toContain(encodeURIComponent(`${siteUrl()}/notorious137?country=us`));
  });

  it("WhatsApp intent puts text + url in the message", () => {
    const u = intentUrl("whatsapp", card());
    expect(u).toContain("api.whatsapp.com/send?text=");
    expect(decodeURIComponent(u)).toContain(`${siteUrl().replace("https://", "")}/notorious137?country=us`);
  });

  it("share text is deterministic per username and mentions the rating", () => {
    const a = shareText(card());
    const b = shareText(card());
    expect(a).toBe(b);
    expect(a).toContain("95");
  });

  it("different usernames can select different lines", () => {
    const a = shareText(card({ username: "notorious137" }));
    const b = shareText(card({ username: "neetcode" }));
    // both are valid lines; at least one should differ across a sample of usernames
    const c = shareText(card({ username: "errichto" }));
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });

  it("native payload carries title, brag-led text, and url", () => {
    const p = nativeSharePayload(card());
    expect(p.title).toBe("LeetFut");
    expect(p.url).toBe(`${siteUrl()}/notorious137?country=us`);
    expect(p.text).toBe(shareMessage(card()));
    expect(p.text).toContain("get scouted");
  });

  it("share message is the text plus the CTA", () => {
    expect(shareMessage(card())).toContain(shareText(card()));
  });

  it("duel URL follows the /challenger/vs/opponent pattern", () => {
    expect(duelUrl("skywalkert", "cpcs")).toBe(`${siteUrl()}/skywalkert/vs/cpcs`);
  });

  it("duel share message is score-free and mentions the opponent", () => {
    const msg = duelShareMessage("skywalkert", "cpcs");
    expect(msg).toContain("@cpcs");
    expect(msg).not.toMatch(/\b\d+–\d+\b/);
  });

  it("duel X intent carries LeetFut hashtag", () => {
    const u = duelIntentUrl("skywalkert", "cpcs");
    expect(u).toContain("hashtags=LeetFut");
    expect(u).toContain(encodeURIComponent(`${siteUrl()}/skywalkert/vs/cpcs`));
  });
});
