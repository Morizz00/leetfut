// lucide dropped its brand marks, so the GitHub mark is an inline SVG.
// `relative top-px` nudges the glyph onto the text's optical center (the SVG's
// own bounding box sits a hair high against the font's x-height).
function GithubMark({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="relative top-px shrink-0"
    >
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.8 1.19 1.83 1.19 3.09 0 4.43-2.7 5.41-5.26 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56C20.71 21.39 24 17.08 24 12c0-6.27-5.23-11.5-12-11.5z" />
    </svg>
  );
}

// Footer credit — "Built by @Morizz00, inspired by GitFut". Purely the maker
// credit — no repo-star CTA (LeetFut has no GitHub-star equivalent of its own
// yet). Shared by the home footer (AppShell) and the scout-report footer
// (ResultView) so they match. A soft dark backdrop lifts the credit off the
// submission-grid motif so the text keeps its contrast wherever it lands.
export default function FooterCredit() {
  return (
    <div className="relative inline-flex max-w-full items-center justify-center">
      {/* weak dark fade behind the credit — soft-edged, no hard pill outline */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-[-18px] inset-y-[-6px] rounded-full bg-bg-deep/70 blur-[10px]"
      />

      <div className="relative flex flex-wrap items-center justify-center gap-x-[6px] gap-y-[4px] text-[13.5px] font-semibold leading-none text-ink-soft">
        <span className="text-ink-mute">Built by</span>
        <a
          href="https://github.com/Morizz00"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-[5px] rounded-[7px] px-[6px] py-[3px] text-ink-dim transition hover:bg-white/8 hover:text-ink"
        >
          <GithubMark size={13} />@Morizz00
        </a>
        <span className="text-ink-mute">
          &middot; inspired by{" "}
          <a
            href="https://github.com/Younesfdj/gitfut"
            target="_blank"
            rel="noopener"
            className="text-ink-dim underline-offset-2 transition hover:text-ink hover:underline"
          >
            GitFut
          </a>
        </span>
      </div>
    </div>
  );
}
