import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Inter, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

// Display — ultra-condensed all-caps for the WC26 "tournament" impact.
const display = Bebas_Neue({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bebas",
});

// UI / body — clean and legible at small sizes.
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

// The "@handle" / dev signal.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

// FUT card fonts (DINPro suite) ported from GitFut — used by the player card
// overlays. (Champions-*.otf/ttf are also bundled in ./fonts for future use but
// not wired here.)
const dinCond = localFont({ src: "./fonts/DINPro-Cond.otf", variable: "--font-din-cond", display: "swap" });
const dinBold = localFont({ src: "./fonts/DINPro-CondBold.otf", variable: "--font-din-bold", display: "swap" });
const dinMedium = localFont({ src: "./fonts/DINPro-CondMedium.otf", variable: "--font-din-medium", display: "swap" });

const TITLE = "LeetFut — your LeetCode, rated out of 99";
const DESCRIPTION =
  "Rate any LeetCode profile out of 99 as a FIFA-Ultimate-Team-style player card, scored from real submissions, contests and streaks. Get scouted and share your card.";

export const metadata: Metadata = {
  metadataBase: new URL("https://leetfut.com"),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "LeetCode profile card",
    "rate my LeetCode",
    "LeetCode stats",
    "developer trading card",
    "FUT card",
    "LeetCode rating",
    "World Cup",
    "LeetFut",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://leetfut.com",
    siteName: "LeetFut",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#15110b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} ${dinCond.variable} ${dinBold.variable} ${dinMedium.variable} antialiased`}
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
