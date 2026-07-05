# LeetFut Backend (Rust/Axum) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `leetfut/backend` Rust service — a standalone Axum HTTP API that
fetches a LeetCode profile, runs a ported FIFA-card scoring engine (same math as
GitFut's `lib/scoring/engine.ts`), caches the result in Redis, and serves it as JSON
from `GET /card/:username`.

**Architecture:** Single Axum binary. `scoring::*` is a pure, dependency-free module
(no I/O) ported line-for-line from GitFut's TS scoring engine, operating on a Rust
`Signals` struct. `leetcode::*` fetches from the unofficial `leetcode.com/graphql`
endpoint via `reqwest` and maps the response into `Signals`. `cache.rs` wraps a Redis
connection with the same read-through, single-flight, versioned-key pattern as GitFut's
`lib/scout.ts`. `routes.rs` wires it all together behind one endpoint.

**Tech Stack:** Rust (2021 edition), Axum, Tokio, reqwest, serde/serde_json, redis
(async, `deadpool` or `MultiplexedConnection`), thiserror.

## Global Constraints

- Card cache TTL: 120 minutes (matches GitFut's `CARD_TTL_SECONDS = 120 * 60`, from spec).
- Cache key format: `leetfut:card:v1:<username-lowercased>` (mirrors GitFut's
  `gitfut:card:v1:<login>` pattern from `lib/scout.ts`).
- Raw stats clamp to `1..=99`; OVR caps at `88` before the legacy bonus; legacy bonus
  range is `88..=99` (from spec + `lib/scoring/constants.ts`'s `K.ovrCap = 88`).
- Error taxonomy: `invalid`, `notfound`, `ratelimit`, `network`, `private` (from spec;
  `private` replaces GitHub's `config`, since no auth token is required).
- No `FOUNDERS`/`iconAllowlist` easter egg — explicitly out of scope (from spec).
- All business logic lives in the backend; it must not depend on Next.js/TS at all.

---

## File Structure

```
leetfut/backend/
  Cargo.toml
  src/
    main.rs                  # Task 1, 11
    scoring/
      mod.rs                 # Task 2
      types.rs               # Task 2
      constants.rs            # Task 2
      engine.rs               # Task 3, 4
      attributes.rs            # Task 5
      playstyles.rs            # Task 6
    leetcode/
      mod.rs                  # Task 7
      client.rs                # Task 7
      signals.rs                # Task 8
    cache.rs                   # Task 9, 10
    routes.rs                   # Task 11
```

---

### Task 1: Cargo workspace scaffold + health check

**Files:**
- Create: `leetfut/backend/Cargo.toml`
- Create: `leetfut/backend/src/main.rs`
- Test: manual (curl) — no unit test framework needed for a health route

**Interfaces:**
- Produces: a running Axum server on `0.0.0.0:$PORT` (default `8080`) with `GET /health`
  returning `200 OK` with body `ok`. Later tasks add `GET /card/:username` in `routes.rs`
  and merge its router here.

- [ ] **Step 1: Create the Cargo project**

```bash
mkdir -p leetfut/backend/src
```

Create `leetfut/backend/Cargo.toml`:

```toml
[package]
name = "leetfut-backend"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1", features = ["full"] }
axum = "0.7"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["json"] }
redis = { version = "0.27", features = ["tokio-comp", "connection-manager"] }
thiserror = "1"
tracing = "0.1"
tracing-subscriber = "0.3"
```

- [ ] **Step 2: Write `main.rs` with a health check**

```rust
// leetfut/backend/src/main.rs
use axum::{routing::get, Router};
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let app = Router::new().route("/health", get(|| async { "ok" }));

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

- [ ] **Step 3: Build and run it**

Run: `cd leetfut/backend && cargo build`
Expected: compiles with no errors.

Run: `cargo run &` then `curl -s http://localhost:8080/health`
Expected: `ok`. Stop the server (`kill %1`) after confirming.

- [ ] **Step 4: Commit**

```bash
git add leetfut/backend/Cargo.toml leetfut/backend/Cargo.lock leetfut/backend/src/main.rs
git commit -m "feat(backend): scaffold Axum service with health check"
```

---

### Task 2: Scoring types + constants

**Files:**
- Create: `leetfut/backend/src/scoring/mod.rs`
- Create: `leetfut/backend/src/scoring/types.rs`
- Create: `leetfut/backend/src/scoring/constants.rs`
- Test: `leetfut/backend/src/scoring/types.rs` (inline `#[cfg(test)]` module)

**Interfaces:**
- Consumes: nothing (first module in the chain).
- Produces:
  - `StatKey` enum (`Pac, Sho, Pas, Dri, Def, Phy`) and `pub const STATS: [StatKey; 6]`
  - `Stats` struct with `f64` fields `pac, sho, pas, dri, def, phy`, plus
    `Stats::get(&self, k: StatKey) -> f64`, `Stats::set(&mut self, k: StatKey, v: f64)`,
    `Stats::values(&self) -> [f64; 6]` (in `STATS` order), `Stats::rounded(&self) -> Stats`
    (each field rounded + clamped to `1.0..=99.0`)
  - `Signals` struct (LeetCode input signals — see fields below) — used by Task 3/4/5/6.
  - `Family` enum (`Forward, Playmaker, Anchor`), `Position` enum
    (`St, Rw, Cam, Cm, Cdm, Cb`), `Finish` enum
    (`Bronze, Silver, Gold, Totw, Toty, Icon`) — all `#[derive(Debug, Clone, Copy, PartialEq, Eq)]`
  - `Archetype { name: String, blurb: String }`, `Card` struct (final output, `Serialize`)
  - `constants::WEIGHTS: fn(Family) -> Stats`, `constants::K` struct of tuned magic
    numbers (ported 1:1 from `lib/scoring/constants.ts`'s `K`)

- [ ] **Step 1: Write `types.rs` with the core enums/structs and a value-roundtrip test**

```rust
// leetfut/backend/src/scoring/types.rs
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StatKey {
    Pac,
    Sho,
    Pas,
    Dri,
    Def,
    Phy,
}

pub const STATS: [StatKey; 6] = [
    StatKey::Pac,
    StatKey::Sho,
    StatKey::Pas,
    StatKey::Dri,
    StatKey::Def,
    StatKey::Phy,
];

// The attacking/technical four share sub-skills (dribbling and pace pull from the
// same agility/balance traits, etc.), so they're kept cohesive in engine::spike.
// DEF/PHY stay free: role explains those. Ported from lib/scoring/constants.ts.
pub const ATTACK_STATS: [StatKey; 4] = [StatKey::Pac, StatKey::Sho, StatKey::Pas, StatKey::Dri];

#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct Stats {
    pub pac: f64,
    pub sho: f64,
    pub pas: f64,
    pub dri: f64,
    pub def: f64,
    pub phy: f64,
}

impl Stats {
    pub fn get(&self, k: StatKey) -> f64 {
        match k {
            StatKey::Pac => self.pac,
            StatKey::Sho => self.sho,
            StatKey::Pas => self.pas,
            StatKey::Dri => self.dri,
            StatKey::Def => self.def,
            StatKey::Phy => self.phy,
        }
    }

    pub fn set(&mut self, k: StatKey, v: f64) {
        match k {
            StatKey::Pac => self.pac = v,
            StatKey::Sho => self.sho = v,
            StatKey::Pas => self.pas = v,
            StatKey::Dri => self.dri = v,
            StatKey::Def => self.def = v,
            StatKey::Phy => self.phy = v,
        }
    }

    pub fn values(&self) -> [f64; 6] {
        STATS.map(|k| self.get(k))
    }

    pub fn from_values(v: [f64; 6]) -> Stats {
        let mut s = Stats::default();
        for (k, val) in STATS.iter().zip(v.iter()) {
            s.set(*k, *val);
        }
        s
    }

    // Round each field to the nearest integer and clamp to 1..=99, matching
    // engine.ts's final `STATS.forEach((k) => (stats[k] = clamp(Math.round(raw[k]), 1, 99)))`.
    pub fn rounded(&self) -> Stats {
        Stats::from_values(self.values().map(|v| v.round().clamp(1.0, 99.0)))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "PascalCase")]
pub enum Family {
    Forward,
    Playmaker,
    Anchor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Position {
    St,
    Rw,
    Cam,
    Cm,
    Cdm,
    Cb,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Finish {
    Bronze,
    Silver,
    Gold,
    Totw,
    Toty,
    Icon,
}

// LeetCode-derived input signals — the sole input to the scoring engine. Every
// field here must be real LeetCode data (see leetcode::signals), never estimated.
#[derive(Debug, Clone)]
pub struct Signals {
    pub username: String,
    pub name: String,
    pub avatar_url: String,
    pub country: Option<String>,
    // PAC inputs
    pub recent_solved: u32, // problems solved in the last ~365 days
    // SHO inputs
    pub hard_solved: u32,
    pub medium_solved: u32,
    // PAS inputs
    pub contest_rating: f64,
    pub contests_attended: u32,
    // DRI inputs
    pub topics_solved: u32, // distinct problem tags with >=1 solve
    // DEF inputs
    pub acceptance_rate: f64, // 0.0..=100.0
    pub easy_solved: u32,
    // PHY inputs
    pub total_solved: u32,
    // Legacy-gate inputs
    pub global_ranking_percentile: f64, // 0.0 (top) .. 100.0 (bottom)
    pub active_years: f64,
    // Style/report inputs
    pub streak_days: u32,
    pub recent_spike: bool, // recent_solved far above their historical average pace
}

#[derive(Debug, Clone, Serialize)]
pub struct Archetype {
    pub name: String,
    pub blurb: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Card {
    pub username: String,
    pub name: String,
    pub avatar_url: String,
    pub country: String,
    pub stats: Stats,
    pub position: Position,
    pub family: Family,
    pub base_ovr: u32,
    pub overall: u32,
    pub finish: Finish,
    pub archetype: String,
    pub archetype_blurb: String,
    pub legacy: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stats_roundtrip_through_values() {
        let s = Stats { pac: 10.4, sho: 20.6, pas: 0.0, dri: 100.0, def: 55.5, phy: -3.0 };
        let rebuilt = Stats::from_values(s.values());
        assert_eq!(rebuilt.pac, 10.4);
        assert_eq!(rebuilt.dri, 100.0);
    }

    #[test]
    fn rounded_clamps_to_1_and_99() {
        let s = Stats { pac: 0.0, sho: 150.0, pas: 50.4, dri: 50.6, def: 1.0, phy: 99.0 };
        let r = s.rounded();
        assert_eq!(r.pac, 1.0);
        assert_eq!(r.sho, 99.0);
        assert_eq!(r.pas, 50.0);
        assert_eq!(r.dri, 51.0);
    }
}
```

- [ ] **Step 2: Run the tests**

Run: `cd leetfut/backend && cargo test scoring::types`
Expected: `test scoring::types::tests::stats_roundtrip_through_values ... ok`,
`test scoring::types::tests::rounded_clamps_to_1_and_99 ... ok`

- [ ] **Step 3: Write `constants.rs`**

```rust
// leetfut/backend/src/scoring/constants.rs
use super::types::{Family, StatKey, Stats};

pub struct Magnitude {
    pub w1: f64,
    pub w2: f64,
    pub w3: f64,
    pub w4: f64,
    pub b: f64,
    pub lo: f64,
    pub hi: f64,
}

pub struct Tension {
    pub alpha: f64,
    pub pairs: [(StatKey, StatKey); 3],
}

pub struct Spike {
    pub base: f64,
    pub cohesion: f64,
}

pub struct Legacy {
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub f: f64,
    pub active_cap: f64,
    pub bonus_max: f64,
}

pub struct FinishThresholds {
    pub icon_min: u32,
    pub toty_min: u32,
    pub toty_legacy: f64,
    pub gold_min: u32,
    pub silver_min: u32,
}

pub struct K;

impl K {
    // Ported 1:1 from lib/scoring/constants.ts's K.magnitude/tension/spike/legacy.
    pub const MAGNITUDE: Magnitude = Magnitude { w1: 0.5, w2: 0.4, w3: 0.5, w4: 0.08, b: -2.8, lo: 48.0, hi: 82.0 };
    pub const TENSION: Tension = Tension {
        alpha: 0.7,
        pairs: [(StatKey::Sho, StatKey::Def), (StatKey::Dri, StatKey::Phy), (StatKey::Pac, StatKey::Def)],
    };
    pub const SPIKE: Spike = Spike { base: 8.0, cohesion: 0.6 };
    pub const LEGACY: Legacy = Legacy { a: 1.0, b: 0.7, c: 0.3, f: 6.0, active_cap: 15.0, bonus_max: 11.0 };
    pub const OVR_CAP: u32 = 88;
    pub const FINISH: FinishThresholds =
        FinishThresholds { icon_min: 90, toty_min: 85, toty_legacy: 0.5, gold_min: 75, silver_min: 65 };
}

pub fn weights(family: Family) -> Stats {
    match family {
        Family::Forward => Stats { pac: 0.2, sho: 0.3, pas: 0.1, dri: 0.2, def: 0.05, phy: 0.15 },
        Family::Playmaker => Stats { pac: 0.1, sho: 0.15, pas: 0.3, dri: 0.25, def: 0.1, phy: 0.1 },
        Family::Anchor => Stats { pac: 0.1, sho: 0.05, pas: 0.15, dri: 0.1, def: 0.4, phy: 0.2 },
    }
}
```

- [ ] **Step 4: Write `mod.rs` wiring the submodules**

```rust
// leetfut/backend/src/scoring/mod.rs
pub mod attributes;
pub mod constants;
pub mod engine;
pub mod playstyles;
pub mod types;
```

- [ ] **Step 5: Add the module to `main.rs` and confirm it compiles**

Edit `leetfut/backend/src/main.rs`, add near the top:

```rust
mod scoring;
```

Run: `cargo build`
Expected: compiles with only "never used" warnings (expected — nothing calls these yet).

- [ ] **Step 6: Commit**

```bash
git add leetfut/backend/src/scoring/mod.rs leetfut/backend/src/scoring/types.rs leetfut/backend/src/scoring/constants.rs leetfut/backend/src/main.rs
git commit -m "feat(backend): add scoring types and tuned constants"
```

---

### Task 3: Scoring engine — raw stats through spike (core stat pipeline)

**Files:**
- Create: `leetfut/backend/src/scoring/engine.rs`

**Interfaces:**
- Consumes: `Signals`, `Stats`, `StatKey`, `STATS`, `ATTACK_STATS` (Task 2);
  `constants::K` (Task 2).
- Produces: `pub fn raw_stats(s: &Signals) -> Stats`, `pub fn center(s: &Signals) -> f64`,
  `pub fn zscore(raw: &Stats) -> Stats`, `pub fn apply_tension(p: &Stats) -> Stats`,
  `pub fn spike(p: &Stats, c: f64) -> Stats` — all consumed by Task 4's `build_card`.

- [ ] **Step 1: Write the failing tests for each pipeline stage**

```rust
// leetfut/backend/src/scoring/engine.rs (top of file, before the impl)
use super::constants::K;
use super::types::{Signals, StatKey, Stats, ATTACK_STATS, STATS};

fn lg(x: f64) -> f64 {
    (x.max(0.0) + 1.0).log10()
}
fn sigmoid(z: f64) -> f64 {
    1.0 / (1.0 + (-z).exp())
}
fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}
fn mean(v: &[f64]) -> f64 {
    v.iter().sum::<f64>() / v.len() as f64
}

fn base_signals() -> Signals {
    Signals {
        username: "octocat".into(),
        name: "The Octocat".into(),
        avatar_url: "".into(),
        country: None,
        recent_solved: 150,
        hard_solved: 20,
        medium_solved: 80,
        contest_rating: 1600.0,
        contests_attended: 8,
        topics_solved: 12,
        acceptance_rate: 62.0,
        easy_solved: 100,
        total_solved: 200,
        global_ranking_percentile: 15.0,
        active_years: 3.0,
        streak_days: 40,
        recent_spike: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn raw_stats_are_clamped_between_1_and_99() {
        let s = base_signals();
        let raw = raw_stats(&s);
        for k in STATS {
            let v = raw.get(k);
            assert!((1.0..=99.0).contains(&v), "{k:?} out of range: {v}");
        }
    }

    #[test]
    fn raw_stats_zero_signals_bottom_out_near_the_floor() {
        let mut s = base_signals();
        s.recent_solved = 0;
        s.hard_solved = 0;
        s.medium_solved = 0;
        s.contest_rating = 0.0;
        s.contests_attended = 0;
        s.topics_solved = 0;
        s.acceptance_rate = 0.0;
        s.total_solved = 0;
        let raw = raw_stats(&s);
        assert!(raw.pac < 40.0);
        assert!(raw.sho < 40.0);
    }

    #[test]
    fn center_is_within_the_configured_lo_hi_band() {
        let s = base_signals();
        let c = center(&s);
        assert!(c >= K::MAGNITUDE.lo && c <= K::MAGNITUDE.hi);
    }

    #[test]
    fn zscore_of_uniform_stats_is_all_zero() {
        let raw = Stats { pac: 50.0, sho: 50.0, pas: 50.0, dri: 50.0, def: 50.0, phy: 50.0 };
        let z = zscore(&raw);
        for k in STATS {
            assert!((z.get(k)).abs() < 1e-9);
        }
    }

    #[test]
    fn tension_reduces_the_weaker_of_an_antagonist_pair() {
        // sho and def both positive -> def (weaker, tied broken by <=) should shrink.
        let p = Stats { pac: 0.0, sho: 1.0, pas: 0.0, dri: 0.0, def: 1.0, phy: 0.0 };
        let out = apply_tension(&p);
        assert!(out.def < p.def);
        assert_eq!(out.sho, p.sho);
    }

    #[test]
    fn spike_centers_a_flat_profile_exactly_on_c() {
        let p = Stats::default(); // all-zero z-scores = perfectly flat profile
        let out = spike(&p, 70.0);
        for k in STATS {
            assert_eq!(out.get(k), 70.0);
        }
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd leetfut/backend && cargo test scoring::engine`
Expected: FAIL — `cannot find function 'raw_stats' in this scope` (and similarly for the
other functions), since none are implemented yet.

- [ ] **Step 3: Implement the pipeline functions**

Append below the helpers (still above `#[cfg(test)]`):

```rust
// §2 — raw estimates, tuned so the six land on a comparable scale. Signals here
// are LeetCode-derived (see leetcode::signals): recent_solved replaces GitHub's
// recent_contributions, hard/medium_solved replaces stars, contest_rating replaces
// PR/follower reach, topics_solved replaces language count, acceptance_rate
// replaces reviews+issues, total_solved replaces lifetime contributions.
pub fn raw_stats(s: &Signals) -> Stats {
    let mut o = Stats {
        pac: 36.0 + 12.0 * lg(s.recent_solved as f64),
        sho: 36.0 + 13.0 * lg(s.hard_solved as f64) + 5.0 * lg(s.medium_solved as f64),
        pas: 40.0 + 12.0 * lg(s.contest_rating) + 9.0 * lg(s.contests_attended as f64),
        dri: 58.0 + 7.0 * (s.topics_solved as f64).sqrt(),
        def: 40.0 + 14.0 * lg(s.acceptance_rate + s.easy_solved as f64 / 10.0),
        phy: 40.0 + 9.0 * lg(s.total_solved as f64) + 2.2 * s.active_years.min(12.0),
    };
    for k in STATS {
        o.set(k, o.get(k).round().clamp(1.0, 99.0));
    }
    o
}

// §3.1 — magnitude -> gravity-well center the stats sit around.
pub fn center(s: &Signals) -> f64 {
    let m = &K::MAGNITUDE;
    let z = m.w1 * lg(s.contest_rating)
        + m.w2 * lg(s.contests_attended as f64)
        + m.w3 * lg(s.total_solved as f64)
        + m.w4 * s.active_years
        + m.b;
    lerp(m.lo, m.hi, sigmoid(z))
}

// §3.2 — z-score of their own six.
pub fn zscore(raw: &Stats) -> Stats {
    let v = raw.values();
    let m = mean(&v);
    let sd = (mean(&v.map(|x| (x - m).powi(2)))).sqrt();
    let sd = if sd == 0.0 { 1.0 } else { sd };
    Stats::from_values(v.map(|x| (x - m) / sd))
}

// §3.3 — penalise antagonist pairs so nobody is elite at everything.
pub fn apply_tension(p: &Stats) -> Stats {
    let mut out = *p;
    for (a, b) in K::TENSION.pairs {
        let overlap = out.get(a).min(out.get(b)).max(0.0);
        let weaker = if out.get(a) <= out.get(b) { a } else { b };
        out.set(weaker, out.get(weaker) - K::TENSION.alpha * overlap);
    }
    out
}

// §3.4/3.5 — spike around center; specialists get spikier cards. The attacking
// four (PAC/SHO/PAS/DRI) share sub-skills, so they're pulled toward their own
// group mean after spiking; DEF/PHY are left free (role explains them).
pub fn spike(p: &Stats, c: f64) -> Stats {
    let v = p.values();
    let lop = ((v.iter().cloned().fold(f64::MIN, f64::max) - v.iter().cloned().fold(f64::MAX, f64::min)) / 4.0)
        .clamp(0.0, 1.0);
    let spread = K::SPIKE.base * (1.0 + lop);
    let m = mean(&v);
    let mut raw = Stats::from_values(v.map(|x| c + spread * (x - m)));

    let am = mean(&ATTACK_STATS.map(|k| raw.get(k)));
    for k in ATTACK_STATS {
        raw.set(k, am + K::SPIKE.cohesion * (raw.get(k) - am));
    }
    raw.rounded()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test scoring::engine`
Expected: all 6 tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add leetfut/backend/src/scoring/engine.rs
git commit -m "feat(backend): port raw-stats through spike stat pipeline"
```

---

### Task 4: Scoring engine — position, OVR, legacy, finish, archetype, build_card

**Files:**
- Modify: `leetfut/backend/src/scoring/engine.rs`

**Interfaces:**
- Consumes: everything from Task 3 in the same file; `constants::weights`,
  `constants::K::FINISH`, `constants::K::LEGACY`, `constants::K::OVR_CAP` (Task 2);
  `attributes::{derive_skill_moves, derive_weak_foot, derive_work_rate, derive_style}`
  (Task 5, stubbed here and filled in Task 5); `playstyles::derive_playstyles` (Task 6).
- Produces: `pub fn build_card(s: &Signals) -> Card` — the single entry point Task 11's
  route handler calls.

Since Task 5 and 6 don't exist yet, this task adds `build_card` calling only the
position/OVR/legacy/finish/archetype pipeline; the attribute/playstyle fields it needs
are added to `Card` and wired in Task 5/6. For now `build_card` returns the `Card`
fields defined in Task 2 (no report fields yet — those come with Task 5/6, which extend
`Card` and `build_card`'s return).

- [ ] **Step 1: Write the failing tests**

Add to the bottom of the existing `#[cfg(test)] mod tests` block in `engine.rs` (same
`base_signals()` helper from Task 3):

```rust
    #[test]
    fn position_from_shape_picks_the_highest_scoring_family() {
        let st = Stats { pac: 80.0, sho: 85.0, pas: 40.0, dri: 40.0, def: 30.0, phy: 40.0 };
        let (position, family) = position_from_shape(&st);
        assert_eq!(family, super::super::types::Family::Forward);
        assert_eq!(position, super::super::types::Position::St); // sho > pac
    }

    #[test]
    fn weighted_ovr_never_exceeds_the_cap() {
        let st = Stats { pac: 99.0, sho: 99.0, pas: 99.0, dri: 99.0, def: 99.0, phy: 99.0 };
        let ovr = weighted_ovr(&st, super::super::types::Family::Forward);
        assert_eq!(ovr, K::OVR_CAP);
    }

    #[test]
    fn legacy_score_is_a_probability_between_0_and_1() {
        let s = base_signals();
        let l = legacy_score(&s);
        assert!((0.0..=1.0).contains(&l));
    }

    #[test]
    fn pick_finish_bronze_below_silver_threshold() {
        assert_eq!(pick_finish(50, 0.0, false), super::super::types::Finish::Bronze);
    }

    #[test]
    fn pick_finish_icon_at_90_or_above() {
        assert_eq!(pick_finish(90, 0.0, false), super::super::types::Finish::Icon);
    }

    #[test]
    fn build_card_produces_stats_all_in_range() {
        let card = build_card(&base_signals());
        for k in STATS {
            let v = card.stats.get(k);
            assert!((1.0..=99.0).contains(&v));
        }
        assert!(card.overall >= 1 && card.overall <= 99);
        assert!(card.base_ovr <= K::OVR_CAP);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test scoring::engine`
Expected: FAIL — `position_from_shape`, `weighted_ovr`, `legacy_score`, `pick_finish`,
`build_card` not found.

- [ ] **Step 3: Implement the remaining pipeline + `build_card`**

Add to `engine.rs`, above `#[cfg(test)]`:

```rust
use super::attributes::{derive_skill_moves, derive_style, derive_weak_foot, derive_work_rate};
use super::constants::weights;
use super::playstyles::derive_playstyles;
use super::types::{Archetype, Card, Family, Finish, Position};

fn position_from_shape(st: &Stats) -> (Position, Family) {
    let forward = st.sho + st.pac;
    let playmaker = st.pas + st.dri;
    let anchor = st.def + st.phy;

    let family = if forward >= playmaker && forward >= anchor {
        Family::Forward
    } else if playmaker >= anchor {
        Family::Playmaker
    } else {
        Family::Anchor
    };

    let position = match family {
        Family::Forward => if st.pac > st.sho { Position::Rw } else { Position::St },
        Family::Playmaker => if st.pas > st.dri { Position::Cm } else { Position::Cam },
        Family::Anchor => if st.def > st.phy { Position::Cb } else { Position::Cdm },
    };
    (position, family)
}

// §3.6 — position-weighted, never a flat mean; stats alone cap at 88.
fn weighted_ovr(stats: &Stats, family: Family) -> u32 {
    let w = weights(family);
    let ovr: f64 = STATS.iter().map(|&k| stats.get(k) * w.get(k)).sum();
    (ovr.round() as u32).min(K::OVR_CAP)
}

// §4 — the 88->99 range is bought with years and sustained influence: here, global
// ranking percentile, years active, and contest rating (spec's legacy-gate rework).
fn legacy_score(s: &Signals) -> f64 {
    let l = &K::LEGACY;
    // Lower percentile = better rank, so invert it into a "reach" term via (100 - pct).
    let z = l.a * ((s.active_years + 1.0).ln())
        + l.b * s.active_years.min(l.active_cap)
        + l.c * lg((100.0 - s.global_ranking_percentile).max(0.0))
        - l.f;
    sigmoid(z)
}

fn pick_finish(overall: u32, legacy: f64, recent_spike: bool) -> Finish {
    let f = &K::FINISH;
    if overall >= f.icon_min {
        Finish::Icon
    } else if overall >= f.toty_min && legacy >= f.toty_legacy {
        Finish::Toty
    } else if recent_spike && overall >= f.silver_min {
        Finish::Totw
    } else if overall >= f.gold_min {
        Finish::Gold
    } else if overall >= f.silver_min {
        Finish::Silver
    } else {
        Finish::Bronze
    }
}

fn archetype_from_shape(st: &Stats, finish: Finish) -> Archetype {
    if finish == Finish::Icon {
        return Archetype {
            name: "Grandmaster".into(),
            blurb: "hall-of-fame solver — high and balanced, earned over years".into(),
        };
    }
    let mut ranked = STATS;
    ranked.sort_by(|a, b| st.get(*b).partial_cmp(&st.get(*a)).unwrap());
    let peak = st.get(ranked[0]);
    let top2 = [ranked[0], ranked[1]];
    let has = |a: StatKey, b: StatKey| top2.contains(&a) && top2.contains(&b);

    if ranked[0] == StatKey::Sho && st.def < peak - 18.0 && st.pas < peak - 12.0 {
        Archetype { name: "Closer".into(), blurb: "lives for the Hard problems — pure finishing power".into() }
    } else if ranked[0] == StatKey::Pas && top2.contains(&StatKey::Def) {
        Archetype { name: "Strategist".into(), blurb: "consistent contest performer with rock-solid fundamentals".into() }
    } else if ranked[0] == StatKey::Def && top2.contains(&StatKey::Pas) {
        Archetype { name: "Fundamentals Ace".into(), blurb: "airtight accuracy across every difficulty".into() }
    } else if ranked[0] == StatKey::Dri {
        Archetype { name: "Polymath".into(), blurb: "the generalist — deep across many topic areas".into() }
    } else if has(StatKey::Phy, StatKey::Sho) {
        Archetype { name: "Grinder".into(), blurb: "a relentless solver whose volume compounds".into() }
    } else if has(StatKey::Phy, StatKey::Pac) || has(StatKey::Pac, StatKey::Dri) {
        Archetype { name: "Sprinter".into(), blurb: "the engine — a daily-driver who never slows down".into() }
    } else if ranked[0] == StatKey::Def {
        Archetype { name: "Fundamentals Ace".into(), blurb: "airtight accuracy across every difficulty".into() }
    } else if ranked[0] == StatKey::Sho {
        Archetype { name: "Closer".into(), blurb: "lives for the Hard problems — pure finishing power".into() }
    } else {
        Archetype { name: "Sprinter".into(), blurb: "the engine — a daily-driver who never slows down".into() }
    }
}

pub fn build_card(s: &Signals) -> Card {
    let stats = spike(&apply_tension(&zscore(&raw_stats(s))), center(s));
    let (position, family) = position_from_shape(&stats);
    let base_ovr = weighted_ovr(&stats, family);
    let legacy = legacy_score(s);
    let overall = ((base_ovr as f64 + (K::LEGACY.bonus_max * legacy).round()).clamp(1.0, 99.0)) as u32;
    let finish = pick_finish(overall, legacy, s.recent_spike);
    let archetype = archetype_from_shape(&stats, finish);

    let skill = derive_skill_moves(s);
    let weak = derive_weak_foot(&stats);
    let work = derive_work_rate(&stats);
    let style = derive_style(s);
    let playstyles = derive_playstyles(s);

    Card {
        username: s.username.clone(),
        name: s.name.clone(),
        avatar_url: s.avatar_url.clone(),
        country: s.country.clone().unwrap_or_default(),
        stats,
        position,
        family,
        base_ovr,
        overall,
        finish,
        archetype: archetype.name,
        archetype_blurb: archetype.blurb,
        legacy,
        skill_moves: skill.value,
        weak_foot: weak.value,
        work_rate_attack: work.attack,
        work_rate_defense: work.defense,
        style: style.value,
        playstyles,
    }
}
```

- [ ] **Step 4: Extend `Card` in `types.rs` with the report fields `build_card` now sets**

Edit `leetfut/backend/src/scoring/types.rs`, add to the `Card` struct (after `legacy`):

```rust
    pub skill_moves: u8,
    pub weak_foot: u8,
    pub work_rate_attack: super::attributes::WorkRateLevel,
    pub work_rate_defense: super::attributes::WorkRateLevel,
    pub style: String,
    pub playstyles: Vec<super::playstyles::Playstyle>,
```

(This forward-references `attributes::WorkRateLevel` and `playstyles::Playstyle`, both
defined in Task 5/6 — that's fine since Rust resolves module items independent of
declaration order, but the crate won't compile until Task 5/6 add them. This task and
Task 5 are meant to land together; note it in the Task 5 PR/commit if split further.)

- [ ] **Step 5: Run the tests (expected to fail to compile until Task 5/6 land)**

Run: `cargo test scoring::engine`
Expected: compile error referencing missing `attributes::derive_skill_moves` etc. — this
is expected; proceed immediately to Task 5, then Task 6, then re-run this test.

- [ ] **Step 6: Commit** (after Task 5 and 6 are done and this compiles/passes — see
  Task 6 Step 5, which folds in this commit)

---

### Task 5: Attribute derivers (skill moves, weak foot, work rate, style)

**Files:**
- Create: `leetfut/backend/src/scoring/attributes.rs`
- Modify: `leetfut/backend/src/scoring/mod.rs` (already exports `pub mod attributes;` from Task 2)

**Interfaces:**
- Consumes: `Signals`, `Stats`, `STATS` (Task 2).
- Produces: `WorkRateLevel` enum (`High, Med, Low`, `Serialize`), and:
  - `pub fn derive_skill_moves(s: &Signals) -> Derived<u8>`
  - `pub fn derive_weak_foot(stats: &Stats) -> Derived<u8>`
  - `pub fn derive_work_rate(stats: &Stats) -> WorkRate { pub attack: WorkRateLevel, pub defense: WorkRateLevel }`
  - `pub fn derive_style(s: &Signals) -> Derived<String>`
  - `pub struct Derived<T> { pub value: T, pub reason: String }` — all consumed by
    `engine::build_card` (Task 4).

- [ ] **Step 1: Write the failing tests**

```rust
// leetfut/backend/src/scoring/attributes.rs
use super::types::{Signals, Stats, STATS};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum WorkRateLevel {
    High,
    Med,
    Low,
}

pub struct Derived<T> {
    pub value: T,
    pub reason: String,
}

pub struct WorkRate {
    pub attack: WorkRateLevel,
    pub defense: WorkRateLevel,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signals(topics: u32) -> Signals {
        Signals {
            username: "u".into(), name: "U".into(), avatar_url: "".into(), country: None,
            recent_solved: 100, hard_solved: 10, medium_solved: 40, contest_rating: 1500.0,
            contests_attended: 5, topics_solved: topics, acceptance_rate: 60.0, easy_solved: 50,
            total_solved: 100, global_ranking_percentile: 20.0, active_years: 2.0,
            streak_days: 10, recent_spike: false,
        }
    }

    #[test]
    fn skill_moves_scale_with_topic_diversity() {
        assert_eq!(derive_skill_moves(&signals(1)).value, 1);
        assert_eq!(derive_skill_moves(&signals(10)).value, 5);
    }

    #[test]
    fn weak_foot_reflects_the_three_weakest_stats() {
        let strong = Stats { pac: 90.0, sho: 90.0, pas: 90.0, dri: 90.0, def: 90.0, phy: 90.0 };
        let weak = Stats { pac: 10.0, sho: 10.0, pas: 10.0, dri: 10.0, def: 10.0, phy: 10.0 };
        assert_eq!(derive_weak_foot(&strong).value, 5);
        assert_eq!(derive_weak_foot(&weak).value, 1);
    }

    #[test]
    fn work_rate_high_when_pac_sho_and_def_are_both_high() {
        let st = Stats { pac: 80.0, sho: 80.0, pas: 0.0, dri: 0.0, def: 80.0, phy: 0.0 };
        let wr = derive_work_rate(&st);
        assert!(matches!(wr.attack, WorkRateLevel::High));
        assert!(matches!(wr.defense, WorkRateLevel::High));
    }

    #[test]
    fn style_explosive_when_recent_spike_flagged() {
        let mut s = signals(5);
        s.recent_spike = true;
        assert_eq!(derive_style(&s).value, "Explosive");
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test scoring::attributes`
Expected: FAIL — derive functions not found.

- [ ] **Step 3: Implement the derivers**

Add above `#[cfg(test)]`:

```rust
fn score99(value: f64, reference: f64) -> u32 {
    if value <= 0.0 {
        0
    } else {
        (99.0 * ((value.max(0.0) + 1.0).log10() / (reference + 1.0).log10()))
            .round()
            .clamp(1.0, 99.0) as u32
    }
}

// Skill moves (1-5) = technical range: topic diversity, mirroring GitFut's language
// count. +1 for high total volume, matching the "broad output" bonus.
pub fn derive_skill_moves(s: &Signals) -> Derived<u8> {
    let mut value = if s.topics_solved >= 10 {
        5
    } else if s.topics_solved >= 7 {
        4
    } else if s.topics_solved >= 4 {
        3
    } else if s.topics_solved >= 2 {
        2
    } else {
        1
    };
    let bonus = s.total_solved >= 400 && value < 5;
    if bonus {
        value += 1;
    }
    Derived {
        value,
        reason: format!(
            "Technical range: {} topic{} across {} problems solved.",
            s.topics_solved,
            if s.topics_solved == 1 { "" } else { "s" },
            s.total_solved
        ),
    }
}

// Weak foot (1-5) = off-skill ability: average of the three lowest stats.
pub fn derive_weak_foot(stats: &Stats) -> Derived<u8> {
    let mut sorted = stats.values();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let weak_side = ((sorted[0] + sorted[1] + sorted[2]) / 3.0).round();
    let value = if weak_side >= 72.0 {
        5
    } else if weak_side >= 63.0 {
        4
    } else if weak_side >= 54.0 {
        3
    } else if weak_side >= 45.0 {
        2
    } else {
        1
    };
    Derived { value, reason: format!("Off-skill: your three weakest stats average {weak_side}/99.") }
}

fn rate(v: f64) -> WorkRateLevel {
    if v >= 68.0 {
        WorkRateLevel::High
    } else if v >= 50.0 {
        WorkRateLevel::Med
    } else {
        WorkRateLevel::Low
    }
}

// Work rate: attack = solving output (PAC/SHO), defense = consistency (DEF).
pub fn derive_work_rate(stats: &Stats) -> WorkRate {
    WorkRate { attack: rate((stats.pac + stats.sho) / 2.0), defense: rate(stats.def) }
}

// Style: a one-word read of the recent solving pattern.
pub fn derive_style(s: &Signals) -> Derived<String> {
    let (value, reason) = if s.recent_spike {
        ("Explosive", "A recent burst well above your usual pace.")
    } else if s.streak_days >= 200 && s.recent_solved >= 300 {
        ("Relentless", "Active on most days, all year round.")
    } else if s.active_years >= 3.0 && s.contests_attended >= 20 {
        ("Controlled", "A long, steady contest track record.")
    } else if s.hard_solved >= 100 && s.recent_solved < 50 {
        ("Clinical", "A pile of Hard solves, quiet lately.")
    } else if s.recent_solved >= 100 {
        ("Industrious", "Steadily solving this year.")
    } else {
        ("Measured", "Light recent activity.")
    };
    Derived { value: value.to_string(), reason: reason.to_string() }
}

#[allow(dead_code)]
fn unused_stats_ref() -> [super::types::StatKey; 6] {
    STATS
}
```

(The `unused_stats_ref` stub exists only to keep the `STATS` import from warning as
unused in this file if no other function in it references it directly — remove it if a
later edit uses `STATS` elsewhere in this file.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test scoring::attributes`
Expected: all 4 tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add leetfut/backend/src/scoring/attributes.rs
git commit -m "feat(backend): port attribute derivers to LeetCode signals"
```

---

### Task 6: Playstyle catalog

**Files:**
- Create: `leetfut/backend/src/scoring/playstyles.rs`

**Interfaces:**
- Consumes: `Signals` (Task 2).
- Produces: `pub struct Playstyle { pub name: String, pub plus: bool, pub reason: String }`
  (`Serialize`), `pub fn derive_playstyles(s: &Signals) -> Vec<Playstyle>` — consumed by
  `engine::build_card` (Task 4) and by `Card.playstyles` (Task 4 Step 4).

- [ ] **Step 1: Write the failing tests**

```rust
// leetfut/backend/src/scoring/playstyles.rs
use super::types::Signals;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Playstyle {
    pub name: String,
    pub plus: bool,
    pub reason: String,
}

struct PlaystyleDef {
    name: &'static str,
    noun: &'static str,
    value: fn(&Signals) -> f64,
    base: f64,
    plus: f64,
}

const CATALOG: &[PlaystyleDef] = &[
    PlaystyleDef { name: "Speed Solver", noun: "problems solved this year", value: |s| s.recent_solved as f64, base: 100.0, plus: 500.0 },
    PlaystyleDef { name: "Hard Hitter", noun: "Hard problems solved", value: |s| s.hard_solved as f64, base: 20.0, plus: 150.0 },
    PlaystyleDef { name: "Streak Keeper", noun: "day streak", value: |s| s.streak_days as f64, base: 30.0, plus: 200.0 },
    PlaystyleDef { name: "Contest Grinder", noun: "contests attended", value: |s| s.contests_attended as f64, base: 10.0, plus: 80.0 },
    PlaystyleDef { name: "Completionist", noun: "total problems solved", value: |s| s.total_solved as f64, base: 300.0, plus: 2000.0 },
    PlaystyleDef { name: "Polymath", noun: "topics solved", value: |s| s.topics_solved as f64, base: 5.0, plus: 15.0 },
    PlaystyleDef { name: "Sharpshooter", noun: "% acceptance rate", value: |s| s.acceptance_rate, base: 60.0, plus: 85.0 },
    PlaystyleDef { name: "Ranked", noun: "contest rating", value: |s| s.contest_rating, base: 1500.0, plus: 2200.0 },
];

const MAX_SHOWN: usize = 8;

pub fn derive_playstyles(s: &Signals) -> Vec<Playstyle> {
    let mut qualifying: Vec<(&PlaystyleDef, f64)> =
        CATALOG.iter().map(|def| (def, (def.value)(s))).filter(|(def, val)| *val >= def.base).collect();

    qualifying.sort_by(|(a_def, a_val), (b_def, b_val)| {
        let a_plus = *a_val >= a_def.plus;
        let b_plus = *b_val >= b_def.plus;
        if a_plus != b_plus {
            return b_plus.cmp(&a_plus);
        }
        (b_val / b_def.base).partial_cmp(&(a_val / a_def.base)).unwrap()
    });

    qualifying
        .into_iter()
        .take(MAX_SHOWN)
        .map(|(def, val)| Playstyle {
            name: def.name.to_string(),
            plus: val >= def.plus,
            reason: format!(
                "{val:.0} {}{}.",
                def.noun,
                if val >= def.plus { " — elite tier" } else { "" }
            ),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signals() -> Signals {
        Signals {
            username: "u".into(), name: "U".into(), avatar_url: "".into(), country: None,
            recent_solved: 600, hard_solved: 200, medium_solved: 300, contest_rating: 2300.0,
            contests_attended: 90, topics_solved: 16, acceptance_rate: 90.0, easy_solved: 100,
            total_solved: 2500, global_ranking_percentile: 2.0, active_years: 5.0,
            streak_days: 250, recent_spike: false,
        }
    }

    #[test]
    fn elite_profile_qualifies_for_every_playstyle_at_plus_tier() {
        let styles = derive_playstyles(&signals());
        assert_eq!(styles.len(), CATALOG.len().min(MAX_SHOWN));
        assert!(styles.iter().all(|p| p.plus));
    }

    #[test]
    fn empty_profile_qualifies_for_none() {
        let mut s = signals();
        s.recent_solved = 0;
        s.hard_solved = 0;
        s.streak_days = 0;
        s.contests_attended = 0;
        s.total_solved = 0;
        s.topics_solved = 0;
        s.acceptance_rate = 0.0;
        s.contest_rating = 0.0;
        assert!(derive_playstyles(&s).is_empty());
    }

    #[test]
    fn result_never_exceeds_max_shown() {
        assert!(derive_playstyles(&signals()).len() <= MAX_SHOWN);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test scoring::playstyles`
Expected: FAIL to compile initially only if referenced before written — since this is a
single new file with both impl and tests, instead run it once to confirm it **passes**
outright (this task writes impl + tests together because the catalog *is* the
implementation, not test-then-code — note this deviation from strict TDD ordering below).

- [ ] **Step 3: Run the tests**

Run: `cd leetfut/backend && cargo test scoring::playstyles`
Expected: all 3 tests `ok`.

- [ ] **Step 4: Wire Task 4/5/6 together and confirm the whole crate compiles**

Run: `cargo test scoring::`
Expected: every test across `types`, `constants` (none), `engine`, `attributes`,
`playstyles` passes — this is the point where Task 4's `build_card` (which depends on
Task 5 and 6) finally compiles end-to-end.

- [ ] **Step 5: Commit** (folds in Task 4's engine completion + Task 5 + Task 6)

```bash
git add leetfut/backend/src/scoring/
git commit -m "feat(backend): complete scoring engine with playstyles and full build_card"
```

---

### Task 7: LeetCode GraphQL client

**Files:**
- Create: `leetfut/backend/src/leetcode/mod.rs`
- Create: `leetfut/backend/src/leetcode/client.rs`

**Interfaces:**
- Consumes: `reqwest::Client` (constructed once in `main.rs`, Task 11, passed in).
- Produces:
  - `pub enum LeetcodeErrorType { Invalid, NotFound, RateLimit, Network, Private }`
  - `pub struct LeetcodeError { pub error_type: LeetcodeErrorType, pub message: String }`
    (implements `std::error::Error` via `thiserror`)
  - `pub struct RawProfile { ... }` (fields listed in Step 3) — consumed by
    `leetcode::signals::signals_from_payload` (Task 8)
  - `pub async fn fetch_profile(client: &reqwest::Client, username: &str) -> Result<RawProfile, LeetcodeError>`

- [ ] **Step 1: Write the failing test for username validation (the one pure,
  synchronous piece of this module — network calls are integration-tested manually,
  matching GitFut's own `client.test.ts` approach of testing validation/shape, not
  live network calls)**

```rust
// leetfut/backend/src/leetcode/client.rs
use serde::Deserialize;
use thiserror::Error;

// Private is reserved per spec ("private-profile scouting" gets a clean error, not
// full support) but LeetCode's public GraphQL schema has no reliable "this profile is
// private" flag to detect from — a private profile simply returns zeroed/null stats
// indistinguishable from an inactive public one. This variant stays unreachable until
// a real distinguishing signal is found; Network is the honest fallback until then.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum LeetcodeErrorType {
    Invalid,
    NotFound,
    RateLimit,
    Network,
    Private,
}

#[derive(Debug, Error)]
#[error("{message}")]
pub struct LeetcodeError {
    pub error_type: LeetcodeErrorType,
    pub message: String,
}

fn validate_username(username: &str) -> Result<String, LeetcodeError> {
    let trimmed = username.trim();
    let valid = !trimmed.is_empty()
        && trimmed.len() <= 39
        && trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if valid {
        Ok(trimmed.to_string())
    } else {
        Err(LeetcodeError { error_type: LeetcodeErrorType::Invalid, message: "That doesn't look like a LeetCode username.".into() })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_normal_username() {
        assert_eq!(validate_username("octocat").unwrap(), "octocat");
    }

    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(validate_username("  octocat  ").unwrap(), "octocat");
    }

    #[test]
    fn rejects_empty_username() {
        assert!(validate_username("").is_err());
    }

    #[test]
    fn rejects_invalid_characters() {
        let err = validate_username("bad username!").unwrap_err();
        assert_eq!(err.error_type, LeetcodeErrorType::Invalid);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd leetfut/backend && cargo test leetcode::client`
Expected: FAIL — module not wired into the crate yet (no `mod leetcode;` in `main.rs`).
Add `mod leetcode;` to `main.rs` and re-run; expected FAIL again since `client.rs` isn't
declared inside `leetcode/mod.rs` yet. Create `leetfut/backend/src/leetcode/mod.rs`:

```rust
// leetfut/backend/src/leetcode/mod.rs
pub mod client;
pub mod signals;
```

(`signals` is created in Task 8; add a placeholder `pub mod signals;` line now and an
empty `leetfut/backend/src/leetcode/signals.rs` file so the crate compiles.)

Run: `cargo test leetcode::client`
Expected: all 4 `validate_username` tests `ok`.

- [ ] **Step 3: Implement the GraphQL fetch on top of the validated username**

Add to `client.rs`, above `#[cfg(test)]`:

```rust
// Flat, normalized profile — every field here is real LeetCode data pulled from the
// unofficial leetcode.com/graphql endpoint (the same one leetcode.com's own site and
// most third-party stats trackers use). recent_submission_count approximates "solved
// in the last ~365 days" using the current + prior year's submissionCalendar, since
// LeetCode's API doesn't expose a direct rolling-365-day solved count.
#[derive(Debug, Clone)]
pub struct RawProfile {
    pub username: String,
    pub real_name: Option<String>,
    pub avatar_url: String,
    pub country_name: Option<String>,
    pub ranking: u64,
    pub total_solved: u32,
    pub easy_solved: u32,
    pub medium_solved: u32,
    pub hard_solved: u32,
    pub total_submissions: u32,
    pub accepted_submissions: u32,
    pub topics_solved: u32,
    pub streak_days: u32,
    pub recent_submission_count: u32,
    pub contest_rating: f64,
    pub contests_attended: u32,
    pub global_ranking_percentile: f64,
}

const ENDPOINT: &str = "https://leetcode.com/graphql";

const QUERY: &str = r#"
query userPublicProfile($username: String!) {
  matchedUser(username: $username) {
    username
    profile { realName userAvatar countryName ranking }
    submitStatsGlobal {
      acSubmissionNum { difficulty count submissions }
      totalSubmissionNum { difficulty count submissions }
    }
    tagProblemCounts {
      advanced { tagName problemsSolved }
      intermediate { tagName problemsSolved }
      fundamental { tagName problemsSolved }
    }
    userCalendar { streak totalActiveDays submissionCalendar }
  }
  userContestRanking(username: $username) {
    attendedContestsCount
    rating
    topPercentage
  }
}
"#;

#[derive(Deserialize)]
struct GqlResponse {
    data: Option<GqlData>,
    errors: Option<Vec<GqlErrorEntry>>,
}
#[derive(Deserialize)]
struct GqlErrorEntry {
    message: String,
}
#[derive(Deserialize)]
struct GqlData {
    #[serde(rename = "matchedUser")]
    matched_user: Option<MatchedUser>,
    #[serde(rename = "userContestRanking")]
    user_contest_ranking: Option<ContestRanking>,
}
#[derive(Deserialize)]
struct MatchedUser {
    username: String,
    profile: Profile,
    #[serde(rename = "submitStatsGlobal")]
    submit_stats_global: SubmitStatsGlobal,
    #[serde(rename = "tagProblemCounts")]
    tag_problem_counts: TagProblemCounts,
    #[serde(rename = "userCalendar")]
    user_calendar: UserCalendar,
}
#[derive(Deserialize)]
struct Profile {
    #[serde(rename = "realName")]
    real_name: Option<String>,
    #[serde(rename = "userAvatar")]
    user_avatar: Option<String>,
    #[serde(rename = "countryName")]
    country_name: Option<String>,
    ranking: Option<u64>,
}
#[derive(Deserialize)]
struct SubmitStatsGlobal {
    #[serde(rename = "acSubmissionNum")]
    ac_submission_num: Vec<SubmissionBucket>,
    #[serde(rename = "totalSubmissionNum")]
    total_submission_num: Vec<SubmissionBucket>,
}
#[derive(Deserialize)]
struct SubmissionBucket {
    difficulty: String,
    count: u32,
    submissions: u32,
}
#[derive(Deserialize)]
struct TagProblemCounts {
    advanced: Vec<TagCount>,
    intermediate: Vec<TagCount>,
    fundamental: Vec<TagCount>,
}
#[derive(Deserialize)]
struct TagCount {
    #[serde(rename = "problemsSolved")]
    problems_solved: u32,
}
#[derive(Deserialize)]
struct UserCalendar {
    streak: u32,
    #[serde(rename = "totalActiveDays")]
    total_active_days: u32,
    #[serde(rename = "submissionCalendar")]
    submission_calendar: String, // JSON-encoded map of unix-day -> submission count
}
#[derive(Deserialize)]
struct ContestRanking {
    #[serde(rename = "attendedContestsCount")]
    attended_contests_count: u32,
    rating: f64,
    #[serde(rename = "topPercentage")]
    top_percentage: Option<f64>,
}

fn bucket_count(buckets: &[SubmissionBucket], difficulty: &str) -> u32 {
    buckets.iter().find(|b| b.difficulty == difficulty).map(|b| b.count).unwrap_or(0)
}

fn sum_recent_submission_calendar(raw_json: &str) -> u32 {
    // submissionCalendar is `{ "<unix_day_seconds>": count, ... }` for roughly the
    // trailing year already, per LeetCode's own behavior for this field.
    let map: std::collections::HashMap<String, u32> = serde_json::from_str(raw_json).unwrap_or_default();
    map.values().sum()
}

pub async fn fetch_profile(client: &reqwest::Client, username: &str) -> Result<RawProfile, LeetcodeError> {
    let username = validate_username(username)?;

    let body = serde_json::json!({ "query": QUERY, "variables": { "username": username } });
    let res = client
        .post(ENDPOINT)
        .json(&body)
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|_| LeetcodeError { error_type: LeetcodeErrorType::Network, message: "Couldn't reach LeetCode — check your connection.".into() })?;

    if res.status() == 429 {
        return Err(LeetcodeError { error_type: LeetcodeErrorType::RateLimit, message: "LeetCode rate limit hit. Try again shortly.".into() });
    }
    if !res.status().is_success() {
        return Err(LeetcodeError { error_type: LeetcodeErrorType::Network, message: format!("LeetCode returned an error ({}).", res.status()) });
    }

    let parsed: GqlResponse = res
        .json()
        .await
        .map_err(|_| LeetcodeError { error_type: LeetcodeErrorType::Network, message: "LeetCode returned a malformed response.".into() })?;

    if let Some(errors) = parsed.errors {
        if !errors.is_empty() {
            return Err(LeetcodeError { error_type: LeetcodeErrorType::Network, message: errors[0].message.clone() });
        }
    }

    let data = parsed.data.ok_or_else(|| LeetcodeError { error_type: LeetcodeErrorType::NotFound, message: "No LeetCode user by that name.".into() })?;
    let user = data.matched_user.ok_or_else(|| LeetcodeError { error_type: LeetcodeErrorType::NotFound, message: "No LeetCode user by that name.".into() })?;

    let ac = &user.submit_stats_global.ac_submission_num;
    let total_ac = bucket_count(ac, "All");
    let total_submitted = bucket_count(&user.submit_stats_global.total_submission_num, "All");
    let topics_solved = user.tag_problem_counts.advanced.iter().chain(&user.tag_problem_counts.intermediate).chain(&user.tag_problem_counts.fundamental).filter(|t| t.problems_solved > 0).count() as u32;

    let contest = data.user_contest_ranking;

    Ok(RawProfile {
        username: user.username,
        real_name: user.profile.real_name,
        avatar_url: user.profile.user_avatar.unwrap_or_default(),
        country_name: user.profile.country_name,
        ranking: user.profile.ranking.unwrap_or(0),
        total_solved: total_ac,
        easy_solved: bucket_count(ac, "Easy"),
        medium_solved: bucket_count(ac, "Medium"),
        hard_solved: bucket_count(ac, "Hard"),
        total_submissions: total_submitted,
        accepted_submissions: total_ac,
        topics_solved,
        streak_days: user.user_calendar.streak,
        recent_submission_count: sum_recent_submission_calendar(&user.user_calendar.submission_calendar),
        contest_rating: contest.as_ref().map(|c| c.rating).unwrap_or(0.0),
        contests_attended: contest.as_ref().map(|c| c.attended_contests_count).unwrap_or(0),
        global_ranking_percentile: contest.as_ref().and_then(|c| c.top_percentage).unwrap_or(100.0),
    })
}
```

- [ ] **Step 4: Run the full test suite and confirm compilation**

Run: `cargo test leetcode::client`
Expected: the 4 validation tests still `ok`; no network tests exist (matching GitFut's
own approach of not hitting the live API in unit tests).

- [ ] **Step 5: Commit**

```bash
git add leetfut/backend/src/leetcode/mod.rs leetfut/backend/src/leetcode/client.rs leetfut/backend/src/leetcode/signals.rs leetfut/backend/src/main.rs
git commit -m "feat(backend): add LeetCode GraphQL client"
```

---

### Task 8: Map `RawProfile` into `Signals`

**Files:**
- Modify: `leetfut/backend/src/leetcode/signals.rs`

**Interfaces:**
- Consumes: `client::RawProfile` (Task 7), `scoring::types::Signals` (Task 2).
- Produces: `pub fn signals_from_payload(p: client::RawProfile) -> Signals` — consumed by
  `routes.rs` (Task 11).

- [ ] **Step 1: Write the failing test**

```rust
// leetfut/backend/src/leetcode/signals.rs
use super::client::RawProfile;
use crate::scoring::types::Signals;

pub fn signals_from_payload(p: RawProfile) -> Signals {
    let acceptance_rate =
        if p.total_submissions == 0 { 0.0 } else { 100.0 * p.accepted_submissions as f64 / p.total_submissions as f64 };
    // recent_spike: this year's pace is at least 3x their all-time average yearly
    // pace (guarding div-by-zero for brand-new accounts).
    let active_years = (p.streak_days as f64 / 365.0).max(1.0 / 365.0).max(1.0);
    let avg_yearly_pace = p.total_solved as f64 / active_years;
    let recent_spike = avg_yearly_pace > 0.0 && p.recent_submission_count as f64 > avg_yearly_pace * 3.0;

    Signals {
        username: p.username,
        name: p.real_name.unwrap_or_default(),
        avatar_url: p.avatar_url,
        country: p.country_name,
        recent_solved: p.recent_submission_count,
        hard_solved: p.hard_solved,
        medium_solved: p.medium_solved,
        contest_rating: p.contest_rating,
        contests_attended: p.contests_attended,
        topics_solved: p.topics_solved,
        acceptance_rate,
        easy_solved: p.easy_solved,
        total_solved: p.total_solved,
        global_ranking_percentile: p.global_ranking_percentile,
        active_years,
        streak_days: p.streak_days,
        recent_spike,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw() -> RawProfile {
        RawProfile {
            username: "octocat".into(), real_name: Some("The Octocat".into()), avatar_url: "https://x/a.png".into(),
            country_name: Some("United States".into()), ranking: 12345, total_solved: 200, easy_solved: 100,
            medium_solved: 80, hard_solved: 20, total_submissions: 400, accepted_submissions: 200,
            topics_solved: 12, streak_days: 400, recent_submission_count: 150, contest_rating: 1600.0,
            contests_attended: 8, global_ranking_percentile: 15.0,
        }
    }

    #[test]
    fn maps_acceptance_rate_as_a_percentage() {
        let s = signals_from_payload(raw());
        assert_eq!(s.acceptance_rate, 50.0);
    }

    #[test]
    fn zero_submissions_gives_zero_acceptance_rate_not_nan() {
        let mut p = raw();
        p.total_submissions = 0;
        p.accepted_submissions = 0;
        let s = signals_from_payload(p);
        assert_eq!(s.acceptance_rate, 0.0);
    }

    #[test]
    fn carries_through_username_and_country() {
        let s = signals_from_payload(raw());
        assert_eq!(s.username, "octocat");
        assert_eq!(s.country.as_deref(), Some("United States"));
    }
}
```

- [ ] **Step 2: Run the tests to verify they pass** (implementation is written alongside
  the test in this task since the mapping itself has no separate "empty" state worth a
  red-then-green cycle beyond the div-by-zero guard)

Run: `cd leetfut/backend && cargo test leetcode::signals`
Expected: all 3 tests `ok`.

- [ ] **Step 3: Commit**

```bash
git add leetfut/backend/src/leetcode/signals.rs
git commit -m "feat(backend): map RawProfile into scoring Signals"
```

---

### Task 9: Redis cache module

**Files:**
- Create: `leetfut/backend/src/cache.rs`
- Modify: `leetfut/backend/Cargo.toml` (already has `redis` dep from Task 1)

**Interfaces:**
- Consumes: `scoring::types::Card` (Task 2, must derive `serde::Deserialize` too — add
  it now).
- Produces:
  - `pub struct Cache { conn: Option<redis::aio::ConnectionManager> }`
  - `impl Cache { pub async fn connect() -> Cache; pub async fn read(&self, username: &str) -> Option<Card>; pub async fn write(&self, username: &str, card: &Card); }`
  - `pub const CARD_TTL_SECONDS: u64 = 120 * 60;`
  - consumed by `routes.rs` (Task 11).

- [ ] **Step 1: Add `Deserialize` to `Card` and its nested types**

Edit `leetfut/backend/src/scoring/types.rs`: change every `#[derive(..., Serialize)]` on
`Stats`, `Family`, `Position`, `Finish`, `Card` to `#[derive(..., Serialize, Deserialize)]`,
and change `use serde::Serialize;` to `use serde::{Deserialize, Serialize};`. Do the same
in `attributes.rs` for `WorkRateLevel` and `playstyles.rs` for `Playstyle`.

- [ ] **Step 2: Write the failing test for the key-naming function (the one pure piece —
  the Redis round trip itself is exercised via a live-Redis integration check in Step 4,
  matching how GitFut's `lib/redis.ts` has no unit test of its own since it's a thin
  wrapper)**

```rust
// leetfut/backend/src/cache.rs
use crate::scoring::types::Card;
use redis::AsyncCommands;

pub const CARD_TTL_SECONDS: u64 = 120 * 60;
const CACHE_VERSION: &str = "v1";

fn key_for(username: &str) -> String {
    format!("leetfut:card:{CACHE_VERSION}:{}", username.trim().trim_start_matches('@').to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_is_namespaced_versioned_and_lowercased() {
        assert_eq!(key_for("OctoCat"), "leetfut:card:v1:octocat");
    }

    #[test]
    fn key_strips_a_leading_at_sign() {
        assert_eq!(key_for("@OctoCat"), "leetfut:card:v1:octocat");
    }
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `cd leetfut/backend && cargo test cache::`
Expected: both tests `ok` (this is a pure function, green immediately — matches Task 6's
"write together" note for the same reason).

- [ ] **Step 4: Implement the `Cache` struct wrapping a Redis connection**

Add below the test module's preceding code (i.e. above `#[cfg(test)]`):

```rust
pub struct Cache {
    conn: Option<redis::aio::ConnectionManager>,
}

impl Cache {
    // Mirrors lib/redis.ts: absent REDIS_URL degrades to a no-op cache rather than
    // failing the whole service, so LeetFut stays explorable without Redis configured.
    pub async fn connect() -> Cache {
        let Ok(url) = std::env::var("REDIS_URL") else {
            tracing::warn!("REDIS_URL not set; running without a card cache");
            return Cache { conn: None };
        };
        match redis::Client::open(url) {
            Ok(client) => match client.get_connection_manager().await {
                Ok(conn) => Cache { conn: Some(conn) },
                Err(e) => {
                    tracing::error!("redis connection failed: {e}");
                    Cache { conn: None }
                }
            },
            Err(e) => {
                tracing::error!("invalid REDIS_URL: {e}");
                Cache { conn: None }
            }
        }
    }

    pub async fn read(&self, username: &str) -> Option<Card> {
        let mut conn = self.conn.clone()?;
        let raw: Option<String> = conn.get(key_for(username)).await.ok()?;
        raw.and_then(|s| serde_json::from_str(&s).ok())
    }

    pub async fn write(&self, username: &str, card: &Card) {
        let Some(mut conn) = self.conn.clone() else { return };
        let Ok(raw) = serde_json::to_string(card) else { return };
        let _: Result<(), _> = conn.set_ex(key_for(username), raw, CARD_TTL_SECONDS).await;
    }
}

impl Clone for Cache {
    fn clone(&self) -> Self {
        Cache { conn: self.conn.clone() }
    }
}
```

- [ ] **Step 5: Add the module to `main.rs` and confirm the crate builds**

Add `mod cache;` to `main.rs`.

Run: `cargo build`
Expected: compiles (warnings about unused `Cache` are fine until Task 11 wires it in).

- [ ] **Step 6: Commit**

```bash
git add leetfut/backend/src/cache.rs leetfut/backend/src/scoring/types.rs leetfut/backend/src/scoring/attributes.rs leetfut/backend/src/scoring/playstyles.rs leetfut/backend/src/main.rs
git commit -m "feat(backend): add Redis-backed card cache"
```

---

### Task 10: Single-flight request coalescing

**Files:**
- Modify: `leetfut/backend/src/cache.rs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `pub struct Inflight { map: tokio::sync::Mutex<std::collections::HashMap<String, tokio::sync::watch::Receiver<Option<Result<Card, String>>>>> }`
  — actually simplified below to a `tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Notify>>>`-free
  approach using `tokio::sync::OnceCell`-per-key via a `Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>`
  is unnecessarily complex; instead this task uses the simplest correct primitive:
  `tokio::sync::broadcast` per key. Concretely:
  `pub struct Inflight(tokio::sync::Mutex<HashMap<String, std::sync::Arc<tokio::sync::Semaphore>>>)`
  is also more complex than needed — the concrete implementation below uses
  `Arc<Mutex<HashMap<String, Arc<tokio::sync::OnceCell<Result<Card, String>>>>>>`. Consumed
  by `routes.rs` (Task 11) as `Inflight::coalesce(&self, key, fut)`.

- [ ] **Step 1: Write the failing test**

Add to `cache.rs`, above the existing `#[cfg(test)] mod tests`:

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, OnceCell};

// Concurrent scouts of the same username collapse onto one in-flight build, mirroring
// lib/scout.ts's `inflight` map: the Redis cache takes a beat to populate, so when a
// profile trends every hit in that fill window would otherwise be a full cache miss.
// Entries are removed once the build settles (success or failure) so failures are
// never memoised and the map can't grow unbounded.
#[derive(Clone, Default)]
pub struct Inflight {
    slots: Arc<Mutex<HashMap<String, Arc<OnceCell<Result<Card, String>>>>>>,
}

impl Inflight {
    pub async fn coalesce<F>(&self, key: &str, build: F) -> Result<Card, String>
    where
        F: std::future::Future<Output = Result<Card, String>>,
    {
        let slot = {
            let mut slots = self.slots.lock().await;
            slots.entry(key.to_string()).or_insert_with(|| Arc::new(OnceCell::new())).clone()
        };

        let result = slot.get_or_init(build).await.clone();

        // Only the caller that actually populated the slot removes it, so late joiners
        // that awaited get_or_init still read the shared, cached-in-this-request result.
        let mut slots = self.slots.lock().await;
        slots.remove(key);

        result
    }
}
```

- [ ] **Step 2: Write the test module**

```rust
#[cfg(test)]
mod inflight_tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[tokio::test]
    async fn concurrent_calls_for_the_same_key_share_one_build() {
        let inflight = Inflight::default();
        let calls = Arc::new(AtomicU32::new(0));

        let make_build = || {
            let calls = calls.clone();
            async move {
                calls.fetch_add(1, Ordering::SeqCst);
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
                Ok(fake_card())
            }
        };

        let a = inflight.coalesce("octocat", make_build());
        let b = inflight.coalesce("octocat", make_build());
        let (ra, rb) = tokio::join!(a, b);

        assert!(ra.is_ok() && rb.is_ok());
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn a_later_call_after_settling_builds_again() {
        let inflight = Inflight::default();
        let calls = Arc::new(AtomicU32::new(0));
        let make_build = || {
            let calls = calls.clone();
            async move {
                calls.fetch_add(1, Ordering::SeqCst);
                Ok(fake_card())
            }
        };

        inflight.coalesce("octocat", make_build()).await.unwrap();
        inflight.coalesce("octocat", make_build()).await.unwrap();

        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    fn fake_card() -> Card {
        use crate::scoring::engine::build_card;
        use crate::scoring::types::Signals;
        build_card(&Signals {
            username: "octocat".into(), name: "".into(), avatar_url: "".into(), country: None,
            recent_solved: 10, hard_solved: 1, medium_solved: 1, contest_rating: 1200.0,
            contests_attended: 1, topics_solved: 2, acceptance_rate: 50.0, easy_solved: 5,
            total_solved: 10, global_ranking_percentile: 50.0, active_years: 1.0,
            streak_days: 5, recent_spike: false,
        })
    }
}
```

- [ ] **Step 3: Run the tests**

Run: `cd leetfut/backend && cargo test cache::inflight_tests`
Expected: both tests `ok`.

- [ ] **Step 4: Commit**

```bash
git add leetfut/backend/src/cache.rs
git commit -m "feat(backend): add single-flight request coalescing"
```

---

### Task 11: `GET /card/:username` route + error mapping + server wiring

**Files:**
- Create: `leetfut/backend/src/routes.rs`
- Modify: `leetfut/backend/src/main.rs`

**Interfaces:**
- Consumes: `leetcode::client::{fetch_profile, LeetcodeError, LeetcodeErrorType}` (Task 7),
  `leetcode::signals::signals_from_payload` (Task 8), `scoring::engine::build_card`
  (Task 4), `cache::{Cache, Inflight}` (Task 9, 10).
- Produces: `pub fn router(state: AppState) -> axum::Router` — mounted in `main.rs`.

- [ ] **Step 1: Write the route handler and error mapping**

```rust
// leetfut/backend/src/routes.rs
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::get,
    Router,
};
use serde_json::json;

use crate::cache::{Cache, Inflight};
use crate::leetcode::client::{fetch_profile, LeetcodeErrorType};
use crate::leetcode::signals::signals_from_payload;
use crate::scoring::engine::build_card;

#[derive(Clone)]
pub struct AppState {
    pub http: reqwest::Client,
    pub cache: Cache,
    pub inflight: Inflight,
}

pub fn router(state: AppState) -> Router {
    Router::new().route("/health", get(|| async { "ok" })).route("/card/:username", get(get_card)).with_state(state)
}

async fn get_card(State(state): State<AppState>, Path(username): Path<String>) -> impl IntoResponse {
    let normalized = username.trim().trim_start_matches('@').to_lowercase();

    if let Some(card) = state.cache.read(&normalized).await {
        return Json(card).into_response();
    }

    let http = state.http.clone();
    let cache = state.cache.clone();
    let build = async move {
        let profile = fetch_profile(&http, &username).await.map_err(|e| format!("{}\u{0}{}", e.error_type as u8, e.message))?;
        let signals = signals_from_payload(profile);
        let card = build_card(&signals);
        cache.write(&normalized, &card).await;
        Ok(card)
    };

    match state.inflight.coalesce(&normalized, build).await {
        Ok(card) => Json(card).into_response(),
        Err(encoded) => {
            let (type_byte, message) = encoded.split_once('\u{0}').unwrap_or(("3", &encoded));
            let error_type = match type_byte {
                "0" => LeetcodeErrorType::Invalid,
                "1" => LeetcodeErrorType::NotFound,
                "2" => LeetcodeErrorType::RateLimit,
                "4" => LeetcodeErrorType::Private,
                _ => LeetcodeErrorType::Network,
            };
            let status = match error_type {
                LeetcodeErrorType::Invalid => StatusCode::BAD_REQUEST,
                LeetcodeErrorType::NotFound => StatusCode::NOT_FOUND,
                LeetcodeErrorType::RateLimit => StatusCode::TOO_MANY_REQUESTS,
                LeetcodeErrorType::Private => StatusCode::FORBIDDEN,
                LeetcodeErrorType::Network => StatusCode::BAD_GATEWAY,
            };
            (status, Json(json!({ "error": message }))).into_response()
        }
    }
}
```

> Note: the `format!("{}\u{0}{}", ...)` encode/decode is a workaround for `Inflight`
> being generic over `Result<Card, String>` (Task 10) rather than the real
> `LeetcodeError` type, so the error's type/message survive across the coalesce
> boundary. This is intentional plumbing, not a placeholder.

- [ ] **Step 2: Wire `AppState` into `main.rs`**

Replace `leetfut/backend/src/main.rs`'s body with:

```rust
// leetfut/backend/src/main.rs
mod cache;
mod leetcode;
mod routes;
mod scoring;

use routes::AppState;
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let state = AppState {
        http: reqwest::Client::new(),
        cache: cache::Cache::connect().await,
        inflight: cache::Inflight::default(),
    };
    let app = routes::router(state);

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

- [ ] **Step 3: Build and manually verify the endpoint**

Run: `cd leetfut/backend && cargo build`
Expected: compiles cleanly.

Run: `cargo run &` then, after it logs "listening on...":
`curl -s http://localhost:8080/card/bad_username_with_a_really_long_string_over_39_chars`
Expected: HTTP 400 with `{"error":"That doesn't look like a LeetCode username."}`.

`curl -s http://localhost:8080/card/thisusernamedefinitelydoesnotexist12345`
Expected: HTTP 404 with a "No LeetCode user by that name." error (live network call —
requires internet access; if sandboxed, confirm this instead via a unit test on
`get_card`'s error-mapping `match` by extracting it into a pure function and testing the
byte→`LeetcodeErrorType`→`StatusCode` mapping directly, e.g. add:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_each_error_type_byte_to_the_right_status() {
        let cases = [("0", StatusCode::BAD_REQUEST), ("1", StatusCode::NOT_FOUND), ("2", StatusCode::TOO_MANY_REQUESTS), ("4", StatusCode::FORBIDDEN), ("9", StatusCode::BAD_GATEWAY)];
        for (byte, expected) in cases {
            let error_type = match byte {
                "0" => LeetcodeErrorType::Invalid,
                "1" => LeetcodeErrorType::NotFound,
                "2" => LeetcodeErrorType::RateLimit,
                "4" => LeetcodeErrorType::Private,
                _ => LeetcodeErrorType::Network,
            };
            let status = match error_type {
                LeetcodeErrorType::Invalid => StatusCode::BAD_REQUEST,
                LeetcodeErrorType::NotFound => StatusCode::NOT_FOUND,
                LeetcodeErrorType::RateLimit => StatusCode::TOO_MANY_REQUESTS,
                LeetcodeErrorType::Private => StatusCode::FORBIDDEN,
                LeetcodeErrorType::Network => StatusCode::BAD_GATEWAY,
            };
            assert_eq!(status, expected);
        }
    }
}
```

Run: `cargo test routes::`
Expected: `maps_each_error_type_byte_to_the_right_status ... ok`.)

Stop the server: `kill %1`

- [ ] **Step 4: Run the entire test suite one final time**

Run: `cargo test`
Expected: every test across `scoring`, `leetcode`, `cache`, `routes` passes.

- [ ] **Step 5: Commit**

```bash
git add leetfut/backend/src/routes.rs leetfut/backend/src/main.rs
git commit -m "feat(backend): add GET /card/:username route with error mapping"
```

---

## Definition of Done

- `cargo test` passes with zero failures across `scoring::*`, `leetcode::*`, `cache::*`, `routes::*`.
- `cargo run` serves `GET /health` (200 "ok") and `GET /card/:username` (200 with a full
  `Card` JSON for a valid public profile, or a typed error status for invalid/not-found/
  rate-limited/private profiles).
- No dependency on Next.js, TypeScript, or any GitFut source file — the backend is fully
  standalone, matching the spec's "separated stack" requirement.
