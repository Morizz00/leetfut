"use client";

import { useEffect, useRef, useState } from "react";
import { toBlob, toPng } from "html-to-image";
import { Check, Copy, Download, ImageDown, Link2, Share2 } from "lucide-react";
import type { Card } from "@/lib/types";
import { cardUrl, intentUrl, nativeSharePayload } from "@/lib/share";
import { renderCardImage } from "@/lib/capture";
import { resolveResultTheme } from "./finishTheme";

// The on-page card is small, so it captures at 3× to hit print resolution. The
// story frame is already rendered at its native 1080×1920, so 1× is exact —
// upscaling it would just bloat the file for no added detail.
const RENDER_OPTS = { pixelRatio: 3, cacheBust: true } as const;
const STORY_RENDER_OPTS = { pixelRatio: 1, cacheBust: true } as const;

function XLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

interface ExportAction {
  id: string;
  label: string;
  title: string;
  done: string;
  icon: typeof Download;
  run: (node: HTMLElement, card: Card) => Promise<void>;
}

// Image actions only — link/social sharing lives in the visible share row.
const EXPORTS: ExportAction[] = [
  {
    id: "download",
    label: "Download",
    title: "Download as PNG",
    done: "Saved",
    icon: Download,
    run: async (node, card) => {
      // renderCardImage awaits fonts and captures an off-screen clone that
      // carries the leetfut.com signature (hidden on the live card).
      const url = await renderCardImage(node, (n) => toPng(n, RENDER_OPTS));
      const a = document.createElement("a");
      a.download = `${card.username}-leetfut.png`;
      a.href = url;
      a.click();
    },
  },
  {
    id: "copy",
    label: "Copy image",
    title: "Copy image to clipboard",
    done: "Copied",
    icon: Copy,
    run: async (node) => {
      // Pass a Promise<Blob> so clipboard.write() fires synchronously within the
      // click's user activation; awaiting the (slow, 3x) render first lets the
      // activation lapse → NotAllowedError. The browser awaits the blob itself.
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": renderCardImage(
            node,
            async (n) => {
              const blob = await toBlob(n, RENDER_OPTS);
              if (!blob) throw new Error("render returned no image");
              return blob;
            },
            { transparent: true },
          ),
        }),
      ]);
    },
  },
];

const PLATFORM_BTN =
  "group flex items-center justify-center gap-[7px] rounded-xl border border-line bg-white/[0.03] py-[11px] text-[12.5px] font-semibold text-ink-soft transition-all duration-200 ease-out hover:-translate-y-[1px] hover:bg-[var(--pb)]/[0.12] hover:text-white active:translate-y-0 active:scale-[.98]";

// Brand-colored border + glow on hover, so each target reads as tappable and
// recognizable rather than three identical grey tabs.
const brandHover = (brand: string) => ({
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.borderColor = `${brand}66`;
    e.currentTarget.style.boxShadow = `0 6px 18px -8px ${brand}80`;
  },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.borderColor = "";
    e.currentTarget.style.boxShadow = "";
  },
});

export default function CardActions({
  card,
  targetRef,
  storyRef,
  canonicalCountry = "",
}: {
  card: Card;
  targetRef: React.RefObject<HTMLDivElement | null>;
  /** Off-screen 1080×1920 story canvas, captured for the Instagram-Story export. */
  storyRef?: React.RefObject<HTMLDivElement | null>;
  /** LeetCode-derived flag; the share link only carries ?country= when overridden. */
  canonicalCountry?: string;
}) {
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  // Default true so supported browsers (mobile + modern desktop) render the CTA
  // with no layout shift; the effect hides it where Web Share is unavailable
  // (e.g. desktop Firefox) so it never falls back to a redundant X-share.
  const [canNativeShare, setCanNativeShare] = useState(true);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Default is "shown"; only hide where Web Share is missing. The set is
    // deferred (not synchronous in the effect) so it can't cascade renders.
    const supported = typeof navigator !== "undefined" && typeof navigator.share === "function";
    if (supported) return;
    const t = setTimeout(() => setCanNativeShare(false), 0);
    return () => clearTimeout(t);
  }, []);

  // Download CTA picks up the card's own tier color so the action matches the
  // card the user is saving (bronze → bronze, silver → silver, chrome → chrome).
  const tier = resolveResultTheme(card).ink;

  // The share/copy link carries ?country= ONLY when the flag is a manual override
  // (differs from the LeetCode-derived default). Otherwise we strip it so the URL
  // stays clean — the recipient still resolves to the same canonical flag.
  const shareCard =
    card.country && card.country !== canonicalCountry ? card : { ...card, country: "" };

  const runExport = async (a: ExportAction) => {
    const node = targetRef.current;
    if (!node || busy) return;
    setBusy(a.id);
    setError(null);
    try {
      await a.run(node, card); // each action awaits fonts.ready itself, so the
      // clipboard copy can call write() synchronously within the user gesture.
      setDone(a.id);
      setTimeout(() => setDone((d) => (d === a.id ? null : d)), 1500);
    } catch (e) {
      console.error("[leetfut] card export failed:", e);
      setError(`${a.label} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  // Native share sheet — the best one-tap path on mobile (and the only route to
  // Instagram Stories). Tries to attach the card image; falls back to text+url.
  const nativeShare = async () => {
    const node = targetRef.current;
    const payload = nativeSharePayload(shareCard);
    try {
      if (node && "canShare" in navigator) {
        const blob = await renderCardImage(node, (n) => toBlob(n, RENDER_OPTS));
        if (blob) {
          const file = new File([blob], `${card.username}-leetfut.png`, { type: "image/png" });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ ...payload, files: [file] });
            return;
          }
        }
      }
      await navigator.share(payload);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // user dismissed
      window.open(intentUrl("x", shareCard), "_blank", "noopener,noreferrer");
    }
  };

  // Instagram-Story export (1080×1920). On mobile, prefer the native share sheet
  // with the image attached — that's the one-tap route into IG Stories. On
  // desktop (no file share), fall back to downloading the PNG to upload manually.
  const shareStory = async () => {
    const node = storyRef?.current;
    if (!node || busy) return;
    setBusy("story");
    setError(null);
    try {
      const blob = await renderCardImage(node, async (n) => {
        const b = await toBlob(n, STORY_RENDER_OPTS);
        if (!b) throw new Error("render returned no image");
        return b;
      });
      const file = new File([blob], `${card.username}-leetfut-story.png`, { type: "image/png" });

      // On mobile, the share sheet is the one-tap route into IG Stories. On
      // desktop, navigator.share with a file is often advertised (canShare=true)
      // but no-ops or is dismissed — so it must NEVER be the only outcome.
      // Only mobile (coarse pointer) attempts share; everyone else downloads,
      // and a dismissed/failed share also falls back to download.
      const isMobile =
        typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
      let shared = false;
      if (
        isMobile &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({ ...nativeSharePayload(shareCard), files: [file] });
          shared = true;
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") {
            shared = true; // user saw the sheet and chose to dismiss — don't also download
          }
          // any other failure: fall through to download
        }
      }

      if (!shared) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.download = file.name;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
      }

      setDone("story");
      setTimeout(() => setDone((d) => (d === "story" ? null : d)), 1500);
    } catch (e) {
      console.error("[leetfut] story export failed:", e);
      setError(`Story failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(cardUrl(shareCard));
      setLinkCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setLinkCopied(false), 1600);
    } catch {
      /* clipboard unavailable — silent */
    }
  };

  return (
    <div className="flex w-full flex-col gap-[10px]">
      {/* primary — native share sheet (shown only where it's supported, so it
          never degrades into a duplicate X-share). Focal brand CTA. */}
      {canNativeShare && (
        <button
          type="button"
          onClick={nativeShare}
          className="font-display group relative flex h-[50px] w-full items-center justify-center gap-[9px] overflow-hidden rounded-xl bg-gradient-to-b from-brand to-brand-mid text-[18px] tracking-[.05em] text-[#1a0f00] shadow-[0_0_0_1px_rgba(255,161,22,.45),0_10px_28px_-6px_rgba(255,161,22,.5)] transition-all duration-200 ease-out hover:-translate-y-[1px] hover:shadow-[0_0_0_1px_rgba(255,181,64,.6),0_14px_34px_-6px_rgba(255,161,22,.62)] active:translate-y-0 active:scale-[.985] active:duration-75"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
          />
          <Share2 size={18} strokeWidth={2.5} className="relative" />
          <span className="relative">SHARE MY CARD</span>
        </button>
      )}

      {/* visible share targets — one tap each, always shown */}
      <div className="grid w-full grid-cols-3 gap-[8px]">
        <button
          type="button"
          onClick={() => window.open(intentUrl("x", shareCard), "_blank", "noopener,noreferrer")}
          title="Share on X"
          aria-label="Share on X"
          className={PLATFORM_BTN}
          style={{ "--pb": "#ffffff" } as React.CSSProperties}
          {...brandHover("#ffffff")}
        >
          <XLogo size={15} />
          <span className="max-[360px]:hidden">X</span>
        </button>
        <button
          type="button"
          onClick={() => window.open(intentUrl("linkedin", shareCard), "_blank", "noopener,noreferrer")}
          title="Share on LinkedIn"
          aria-label="Share on LinkedIn"
          className={PLATFORM_BTN}
          style={{ "--pb": "#3b9eff" } as React.CSSProperties}
          {...brandHover("#3b9eff")}
        >
          <LinkedInLogo size={15} />
          <span className="max-[360px]:hidden">LinkedIn</span>
        </button>
        <button
          type="button"
          onClick={copyLink}
          title="Copy link to this card"
          aria-label="Copy link to this card"
          className={PLATFORM_BTN}
          style={{ "--pb": "#ffa116" } as React.CSSProperties}
          {...brandHover("#ffa116")}
        >
          {linkCopied ? <Check size={15} className="text-brand" /> : <Link2 size={15} />}
          <span className="max-[360px]:hidden">{linkCopied ? "Copied" : "Copy link"}</span>
        </button>
      </div>

      {/* image actions — Download is the highest-intent action (save to repost),
          so it's the hero of this row; Copy image sits beside it. */}
      {(() => {
        const dl = EXPORTS.find((a) => a.id === "download")!;
        const rest = EXPORTS.filter((a) => a.id !== "download");
        const dlDone = done === dl.id;
        const dlBusy = busy === dl.id;
        const DlIcon = dl.icon;
        return (
          <div className="grid w-full grid-cols-[1.6fr_1fr] gap-[8px]">
            <button
              onClick={() => runExport(dl)}
              disabled={dlBusy}
              title="Download your card as an image"
              aria-label="Download your card as an image"
              className="group relative flex items-center justify-center gap-[8px] overflow-hidden rounded-xl border py-[12px] text-[13.5px] font-bold tracking-[.02em] transition-all duration-200 ease-out hover:-translate-y-[1px] active:translate-y-0 active:scale-[.98] disabled:opacity-70"
              style={{ color: tier, borderColor: `${tier}66`, background: `${tier}1f` }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${tier}b3`;
                e.currentTarget.style.background = `${tier}33`;
                e.currentTarget.style.boxShadow = `0 10px 26px -8px ${tier}8c`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = `${tier}66`;
                e.currentTarget.style.background = `${tier}1f`;
                e.currentTarget.style.boxShadow = "";
              }}
            >
              {dlBusy ? (
                <span
                  className="h-[15px] w-[15px] animate-spin rounded-full border-[1.5px]"
                  style={{ borderColor: `${tier}40`, borderTopColor: tier }}
                />
              ) : dlDone ? (
                <Check size={16} strokeWidth={2.6} />
              ) : (
                <DlIcon size={16} strokeWidth={2.4} className="transition-transform group-hover:translate-y-[1px]" />
              )}
              {dlBusy ? "Saving…" : dlDone ? "Saved" : "Download"}
            </button>

            {rest.map((a) => {
              const isDone = done === a.id;
              const isBusy = busy === a.id;
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  onClick={() => runExport(a)}
                  disabled={isBusy}
                  title={a.title}
                  aria-label={a.title}
                  className="group inline-flex items-center justify-center gap-[6px] rounded-xl border border-line bg-white/[0.03] py-[12px] text-[12.5px] font-semibold text-ink-soft transition-all duration-200 ease-out hover:-translate-y-[1px] hover:border-white/25 hover:bg-white/[0.07] hover:text-white active:translate-y-0 active:scale-[.98] disabled:opacity-60"
                >
                  {isBusy ? (
                    <span className="h-[13px] w-[13px] animate-spin rounded-full border-[1.5px] border-white/25 border-t-white/80" />
                  ) : isDone ? (
                    <Check size={14} className="text-brand" />
                  ) : (
                    <Icon size={14} className="transition-colors group-hover:text-white" />
                  )}
                  {isBusy ? "…" : isDone ? a.done : a.label}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Instagram-Story export — a 1080×1920 vertical image, the format Stories
          want. One button: shares-with-file on mobile (one tap into IG), or
          downloads the PNG on desktop. */}
      {storyRef && (
        <button
          type="button"
          onClick={shareStory}
          disabled={busy === "story"}
          title="Download a 1080×1920 image sized for Instagram Stories"
          aria-label="Download a story-format image for Instagram Stories"
          className="group inline-flex w-full items-center justify-center gap-[8px] rounded-xl border border-line bg-white/[0.03] py-[12px] text-[12.5px] font-semibold text-ink-soft transition-all duration-200 ease-out hover:-translate-y-[1px] hover:border-[#e1306c]/55 hover:bg-[#e1306c]/[0.1] hover:text-white hover:shadow-[0_8px_22px_-10px_rgba(225,48,108,.8)] active:translate-y-0 active:scale-[.98] disabled:opacity-60"
        >
          {busy === "story" ? (
            <span className="h-[14px] w-[14px] animate-spin rounded-full border-[1.5px] border-white/25 border-t-white/80" />
          ) : done === "story" ? (
            <Check size={15} className="text-brand" />
          ) : (
            <ImageDown size={15} className="transition-colors group-hover:text-[#ff5a8a]" />
          )}
          {busy === "story" ? "Rendering…" : done === "story" ? "Done" : "Story format"}
        </button>
      )}

      {error && <p className="text-center text-[12px] leading-snug text-[#ff9d96]">{error}</p>}
    </div>
  );
}
