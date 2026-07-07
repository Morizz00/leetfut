import { ImageResponse } from "next/og";
import { loadCard } from "@/lib/api";
import { pickFlag } from "@/lib/flagPriority";
import { resolveResultTheme } from "@/components/finishTheme";
import { VS_PALETTE } from "@/components/VsBurst";
import { S_PATH, V_PATH, particlesAlong, sliverBetween } from "@/lib/vsBurst";
import { loadCardAssets, cardTree } from "@/lib/og/renderCard";
import { loadCardFonts } from "@/lib/og/card";
import type { Card } from "@/lib/types";

export const runtime = "nodejs";
export const alt = "LeetFut Scout Duel — two player cards facing off across a lightning strike";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CARD_W = 373;
const TILT = 6;
const CARD_X = 150;
const CARD_Y = 32;

const BOLT_TOP: [number, number] = [740, -40];
const BOLT_BOT: [number, number] = [460, 670];
const EMBERS = particlesAlong(BOLT_BOT, BOLT_TOP, 34, 4, 4.2);

const VS_SCALE = 3.55;
const VS_TX = 600 - 60.5 * VS_SCALE;
const VS_TY = 315 - 87 * VS_SCALE;

const CACHE = {
  "Cache-Control":
    "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
};

async function tryCard(username: string): Promise<Card | null> {
  const res = await loadCard(username);
  if (!("card" in res)) return null;
  return { ...res.card, country: pickFlag(null, res.card.country) ?? "" };
}

function title(fontSize: number) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "DINPro",
        fontSize,
        fontWeight: 700,
        color: "#f3ede3",
        letterSpacing: 6,
        textShadow: "0 0 26px rgba(255,161,22,.6), 0 2px 0 rgba(0,0,0,.6)",
      }}
    >
      SCOUT DUEL
    </div>
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ username: string; opponent: string }>;
}) {
  const { username, opponent } = await params;
  const [a, b] = await Promise.all([tryCard(username), tryCard(opponent)]);

  if (!a || !b) {
    const fonts = await loadCardFonts();
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#15110b",
            backgroundImage:
              "radial-gradient(520px 300px at 50% -8%, rgba(255,161,22,0.14), transparent 60%), radial-gradient(760px 200px at 50% 103%, rgba(255,161,22,0.18), transparent 70%)",
            color: "#e6edf3",
            fontFamily: "DINPro",
            textAlign: "center",
            padding: 64,
          }}
        >
          {title(96)}
          <div style={{ display: "flex", fontSize: 56, fontWeight: 700, marginTop: 18 }}>
            @{username} vs @{opponent}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#a8b3bd", marginTop: 18 }}>
            watch the duel at
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 32,
              color: "#ffa116",
              fontWeight: 700,
              marginTop: 10,
            }}
          >
            leetfut.com
          </div>
        </div>
      ),
      { ...size, fonts, headers: CACHE },
    );
  }

  const aGlow = resolveResultTheme(a).glow;
  const bGlow = resolveResultTheme(b).glow;
  const [aAssets, bAssets, fonts] = await Promise.all([
    loadCardAssets(a, CARD_W),
    loadCardAssets(b, CARD_W),
    loadCardFonts(),
  ]);

  const { fill, rim, glow, core } = VS_PALETTE;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#15110b",
          backgroundImage: [
            "radial-gradient(520px 300px at 50% -8%, rgba(255,244,230,0.10), transparent 60%)",
            "radial-gradient(820px 210px at 50% 103%, rgba(255,161,22,0.22), transparent 70%)",
            "radial-gradient(260px 100px at 20% 101%, rgba(255,161,22,0.12), transparent 70%)",
            "radial-gradient(260px 100px at 80% 101%, rgba(255,161,22,0.1), transparent 70%)",
            `radial-gradient(440px 580px at 26% 48%, ${aGlow}, transparent 60%)`,
            `radial-gradient(440px 580px at 74% 48%, ${bGlow}, transparent 60%)`,
          ].join(", "),
          fontFamily: "DINPro",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: CARD_X,
            top: CARD_Y,
            display: "flex",
            transform: `rotate(-${TILT}deg)`,
          }}
        >
          {cardTree(a, aAssets, CARD_W)}
        </div>

        <div
          style={{
            position: "absolute",
            left: size.width - CARD_X - CARD_W,
            top: CARD_Y,
            display: "flex",
            transform: `rotate(${TILT}deg)`,
          }}
        >
          {cardTree(b, bAssets, CARD_W)}
        </div>

        <svg
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          style={{ position: "absolute", left: 0, top: 0 }}
        >
          <polygon points={sliverBetween(BOLT_BOT, BOLT_TOP, 24)} fill={glow} opacity={0.18} />
          <polygon points={sliverBetween(BOLT_BOT, BOLT_TOP, 13)} fill={glow} opacity={0.38} />
          <polygon points={sliverBetween(BOLT_BOT, BOLT_TOP, 6)} fill={rim} opacity={0.9} />
          <polygon points={sliverBetween(BOLT_BOT, BOLT_TOP, 2.5)} fill={core} opacity={0.97} />
          {EMBERS.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={p.r}
              fill={p.bright ? core : glow}
              opacity={p.o}
            />
          ))}

          <g transform={`translate(${VS_TX} ${VS_TY}) scale(${VS_SCALE})`}>
            <path
              d={V_PATH}
              fill="none"
              stroke="#02001e"
              strokeWidth={7}
              strokeLinejoin="round"
              opacity={0.85}
            />
            <path
              d={S_PATH}
              fill="none"
              stroke="#02001e"
              strokeWidth={7}
              strokeLinejoin="round"
              opacity={0.85}
            />
            <path d={V_PATH} fill={fill} stroke={rim} strokeWidth={2} strokeLinejoin="round" />
            <path d={S_PATH} fill={fill} stroke={rim} strokeWidth={2} strokeLinejoin="round" />
          </g>
        </svg>

        <div
          style={{
            position: "absolute",
            left: 0,
            top: 10,
            width: size.width,
            display: "flex",
            justifyContent: "center",
          }}
        >
          {title(92)}
        </div>
      </div>
    ),
    { ...size, fonts: [...aAssets.fonts, ...fonts], headers: CACHE },
  );
}
