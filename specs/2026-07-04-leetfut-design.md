# LeetFut — design spec

## Summary

A sibling project to GitFut: same FIFA-card concept and UI, but scouting a LeetCode
profile instead of a GitHub profile. Unlike GitFut (a single Next.js app with no
dedicated backend), LeetFut deliberately separates the stack: a **Rust (Axum) service**
owns all business logic (fetching, scoring, caching), and a **Next.js app** is pure UI
that calls it. Lives in a new `leetfut/` folder at the repo root for now; will be split
into its own git repo later.

## Structure

```
leetfut/
  backend/                 # Rust (Axum) service — owns ALL business logic
    Cargo.toml
    src/
      main.rs               # server setup, routes
      leetcode/             # reqwest-based GraphQL client -> leetcode.com/graphql
                             # (mirrors lib/github/client.ts: typed errors, retries, timeouts)
      scoring/               # port of engine.ts + constants.ts + types.ts + attributes.ts +
                             # playstyles.ts — same math, as Rust structs/fns
      cache.rs               # Redis client, same 120min TTL as gitfut
      routes.rs              # GET /card/:username -> cache check -> fetch -> score -> cache -> JSON
    tests/                   # Rust unit tests for the scoring engine (port of gitfut's vitest fixtures)

  web/                      # Next.js — pure UI, mirrors gitfut's app/components/hooks structure
    app/                    # [username] page, api/card-image/[username] (OG image render),
                             # opengraph-image.tsx, sitemap, robots — same routes as gitfut
    components/             # PlayerCard, CardFan, ScoutForm, ScoutReport, ResultView — copied as-is
    hooks/                  # useScout, useReveal, useClickOutside — copied as-is
    lib/
      api.ts                # thin fetch client -> backend's GET /card/:username
      og/, format.ts, geo.ts, share.ts, etc. — presentation-only helpers, copied as-is
    tests/                   # component/UI tests only
    package.json, tsconfig.json, next.config.ts, eslint.config.mjs, postcss.config.mjs, vitest.config.ts
```

## Architecture

### Split of responsibilities

GitFut has no dedicated backend — `lib/github/client.ts` and `lib/scoring/*` are just
server-only TypeScript running inside the Next.js process. LeetFut deliberately breaks
that apart:

- **`backend/` (Rust, Axum)**: owns fetching LeetCode data, running the scoring engine,
  and Redis caching. Exposes one endpoint, `GET /card/:username`, returning the fully
  built `Card` JSON (same shape as GitFut's `Card` type).
- **`web/` (Next.js)**: no business logic at all. `app/api/card/[username]/route.ts`
  becomes a thin same-origin proxy to the Rust backend (avoids CORS, keeps client hooks
  like `useScout` behaviorally unchanged). `app/api/card-image/[username]/route.tsx` and
  `opengraph-image.tsx` fetch the `Card` JSON from the backend, then render the PNG/OG
  image exactly as GitFut does today via `lib/og` (presentation, not business logic, so
  it stays in TS).

Two deployables instead of GitFut's one: the Rust service and the Next.js app.

### Scoring engine (ported to Rust, math unchanged)

GitFut's scoring pipeline (`lib/scoring/engine.ts`) is domain-agnostic: it consumes a
flat `Signals` struct and produces `Stats` → `Position`/`Family` → weighted `overall` →
`Finish` tier → `Archetype`. This pipeline — z-score, tension penalties between
antagonist stat pairs, spike-around-center, position-from-shape, weighted OVR (capped
at 88), the legacy gate that buys the 88→99 range, and finish-tier thresholds
(bronze/silver/gold/totw/toty/icon) — is ported to Rust with identical math. Only the
*inputs* (signals) and the *language* change.

Dropped: the `FOUNDERS`/`iconAllowlist` easter egg (GitFut-specific, not relevant here).

## Data source

`backend/src/leetcode/` replaces `lib/github/client.ts`, implemented with `reqwest`
against the unofficial `leetcode.com/graphql` endpoint (the same endpoint LeetCode's own
site and most third-party stats trackers use). No auth token required for public
profiles.

Error taxonomy mirrors GitFut's (`invalid` / `notfound` / `ratelimit` / `network`), plus
a new `private` case for profiles that hide their stats (no GitHub equivalent). Errors
map to typed JSON responses (`{ type, message }`) with matching HTTP status codes.

## Stat mapping

New `Signals` struct in `backend/src/scoring/types.rs`, and new attribute derivers in
`backend/src/scoring/attributes.rs` reading LeetCode data. Blends solve-volume,
difficulty, and consistency with contest performance:

| Stat | Signal |
|---|---|
| PAC | Problems solved in the last ~365 days (recent solving velocity) |
| SHO | Weighted count of Hard (+ partial credit for Medium) solves — peak difficulty firepower |
| PAS | Contest rating + contests attended — competitive performance |
| DRI | Distinct problem tags/categories solved — topic diversity |
| DEF | Acceptance rate blended with spread across Easy/Medium/Hard — consistency, not just farming Easy |
| PHY | Total problems solved all-time — lifetime stamina |

Legacy gate (the 88→99 "years + influence" bonus) is reworked to key on global ranking
percentile, years active, and contest rating, replacing GitHub's
followers/stars/account-age formula. Same sigmoid shape, new inputs.

## Position / archetype / playstyles

- Position/family system (`ST/RW/CAM/CM/CDM/CB`, `Forward/Playmaker/Anchor`) and the
  weighted-OVR math: unchanged mechanically, ported to Rust.
- Archetype names/blurbs (`archetypeFromShape`) reworded to LeetCode flavor during
  implementation (e.g. a SHO-dominant profile gets a "hard-problem closer" style name
  instead of "Poacher"). Exact wording is an implementation detail, not a design fork.
- Playstyle catalog (`lib/scoring/playstyles.ts` equivalent) keeps the same
  threshold/`plus`-tier mechanism, with a new catalog of LeetCode-flavored entries (e.g.
  streak-based, contest-count-based, hard-solve-based, topic-diversity-based).

## Visual design

Same components, same layout, reskinned:

- Accent color: LeetCode orange (`#FFA116`) replacing GitFut's green (`#39D353`)
- Background: dark charcoal/navy instead of GitFut's black-green
- Small difficulty-flavored accents (green/yellow/red for Easy/Medium/Hard) surfaced
  somewhere fitting (e.g. a metric bar or a difficulty-breakdown chip) — not a full
  palette overhaul
- Copy/labels updated to LeetCode nouns (e.g. "Commits" → "Problems solved", "Stars" →
  "Contest rating") in metrics and playstyle reasons

## Testing

- **Backend**: Rust unit tests (`cargo test`) for the scoring engine and attribute
  derivers, porting GitFut's hand-authored `Signals` fixtures from `tests/`.
- **Frontend**: component/UI tests only, matching GitFut's Vitest setup — no scoring
  logic to test here since it all lives in the backend now.
- UI/e2e testing out of scope for v1.

## Out of scope for v1

- Splitting into its own git repo (explicitly deferred by the user)
- Founders/easter-egg treatment
- Auth-gated or private-profile scouting beyond a clean error message
- Backend deployment target (Fly.io/Render/etc.) — decide at implementation/deploy time
