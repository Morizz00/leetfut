use super::attributes::{derive_skill_moves, derive_style, derive_weak_foot, derive_work_rate};
use super::constants::{weights, K};
use super::playstyles::derive_playstyles;
use super::types::{Archetype, Card, Family, Finish, Position, Signals, StatKey, Stats, ATTACK_STATS, STATS};

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

// LeetCode's own overall site rank (1 = best, among millions of registered
// accounts — most barely active). No "out of N" figure is exposed alongside it
// the way contest rank exposes a clean percentile, so it's scored on a log
// scale against a generous reference ceiling instead: log10(10,000,000) ≈ 7.0,
// higher (smaller rank number) is better. A ranking of 0 means unranked/unknown
// (never computed one, e.g. zero problems solved) and must contribute nothing —
// NOT the max bonus, which `lg(0)=0` would otherwise produce here.
fn site_rank_term(ranking: u64) -> f64 {
    if ranking == 0 {
        return 0.0;
    }
    const REF_LOG: f64 = 7.0;
    (REF_LOG - lg(ranking as f64)).max(0.0)
}

// §2 — raw estimates, tuned so the six land on a comparable scale. Signals here
// are LeetCode-derived (see leetcode::signals): recent_solved replaces GitHub's
// recent_contributions, hard/medium_solved replaces stars, contest_rating replaces
// PR/follower reach, topics_solved replaces language count, acceptance_rate
// replaces reviews+issues, total_solved replaces lifetime contributions.
pub fn raw_stats(s: &Signals) -> Stats {
    let mut o = Stats {
        pac: 36.0 + 12.0 * lg(s.recent_solved as f64),
        sho: 36.0 + 13.0 * lg(s.hard_solved as f64) + 5.0 * lg(s.medium_solved as f64),
        // Reputation is a small, deliberately capped-influence add-on to PAS
        // (community/competitive reach): it's easy to farm with a couple of
        // popular posts, unlike contest rating, so it gets a lighter weight.
        // Kept low because reputation's dynamic range (0 to several thousand for
        // a small number of prolific discuss.leetcode.com posters) is far wider
        // than contest rating's realistic band, so even a modest-looking
        // coefficient can dominate PAS if it's not deliberately small.
        pas: 40.0
            + 12.0 * lg(s.contest_rating)
            + 9.0 * lg(s.contests_attended as f64)
            + 1.5 * lg(s.reputation.max(0) as f64),
        // Topic breadth leads DRI, with a bonus for hard-tier topic coverage
        // (mirrors SHO's hard/medium split) and a smaller nod to language
        // spread. Base + weights kept modest deliberately: LeetCode's Skills
        // page groups tags into a SMALL FIXED catalog (observed ceiling:
        // topics_solved maxes ~46, hard_topics_solved maxes ~18 — there's no
        // larger catalog to keep growing into). The original 58-base/5-6
        // weight version saturated DRI near 99 for almost anyone with decent
        // (not even complete) topic coverage — including modest profiles with
        // otherwise unremarkable stats — which was silently forcing nearly
        // every card into Playmaker/CAM regardless of their actual shape.
        dri: 40.0
            + 4.0 * (s.topics_solved as f64).sqrt()
            + 3.0 * (s.hard_topics_solved as f64).sqrt()
            + 2.0 * (s.languages_used as f64).sqrt(),
        // Contest rating gets a small direct pull here too, on top of PAS: it's
        // opponent-adjusted and timed, so it's evidence of solving accurately
        // under pressure — a form of "defending" a result — not just raw
        // acceptance rate, which a slow, careful solver can inflate by never
        // attempting anything hard.
        def: 40.0 + 14.0 * lg(s.acceptance_rate + s.easy_solved as f64 / 10.0) + 3.0 * lg(s.contest_rating),
        // total_submissions (includes failed attempts) adds a small, distinct
        // "grind volume" signal on top of total_solved — someone attempting many
        // problems shows real effort regardless of success, though the weight
        // stays light since it's correlated with (and could inflate alongside)
        // total_solved. site_rank_term is LeetCode's own composite standing
        // across all solvers — real validation we weren't using at all before.
        phy: 40.0
            + 9.0 * lg(s.total_solved as f64)
            + 2.2 * s.active_years.min(12.0)
            + 1.5 * lg(s.total_submissions as f64)
            + 1.0 * site_rank_term(s.site_ranking),
    };
    for k in STATS {
        o.set(k, o.get(k).round().clamp(1.0, 99.0));
    }
    o
}

// §3.1 — magnitude -> gravity-well center the stats sit around. Global ranking
// percentile pulls here too (not just the elite legacy bonus, see legacy_score
// below): it's the best available relative-skill signal — adjusted for field
// strength and problem difficulty — and previously only mattered for profiles
// already near the 88 stat cap, i.e. almost nobody. Folding it into center lets
// a strong rank lift a profile's whole stat line continuously. Defaults to 0
// contribution for anyone with no contest rank (global_ranking_percentile
// defaults to 100 => (100-100)=0 => lg(0+1)=0), so this only ever helps.
pub fn center(s: &Signals) -> f64 {
    let m = &K::MAGNITUDE;
    let z = m.w1 * lg(s.contest_rating)
        + m.w2 * lg(s.contests_attended as f64)
        + m.w3 * lg(s.total_solved as f64)
        + m.w4 * s.active_years
        + m.w5 * lg((100.0 - s.global_ranking_percentile).max(0.0))
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
        Family::Forward => {
            if st.pac > st.sho {
                Position::Rw
            } else {
                Position::St
            }
        }
        Family::Playmaker => {
            if st.pas > st.dri {
                Position::Cm
            } else {
                Position::Cam
            }
        }
        Family::Anchor => {
            if st.def > st.phy {
                Position::Cb
            } else {
                Position::Cdm
            }
        }
    };
    (position, family)
}

// §3.6 — position-weighted, never a flat mean; stats alone cap at 88.
fn weighted_ovr(stats: &Stats, family: Family) -> u32 {
    let w = weights(family);
    let ovr: f64 = STATS.iter().map(|&k| stats.get(k) * w.get(k)).sum();
    (ovr.round() as u32).min(K::OVR_CAP)
}

// §4 — the 88->99 range is bought with a proven, elite track record: total
// volume, sustained contest participation, contest percentile, and overall
// site standing.
//
// This used to weight tenure via `active_years` the way GitHub's original
// formula weighted `account_age_years` (which realistically ranges 0-15+ for a
// GitHub veteran). But LeetCode's `active_years` here is `active_days/365` —
// days active in the LAST YEAR, bounded to roughly 0-1.0 — it can never
// represent multi-year tenure the way the old weights assumed. That silently
// starved this whole formula: even a 100%-solved, rank-1, top-0.25%-percentile
// profile (the most elite case realistically possible) produced a legacy score
// of ~0.018, indistinguishable from an average solver. Swapped the inputs for
// signals with real dynamic range at the top end: total_solved and
// contests_attended (both log-scaled, proven volume over time), contest
// percentile (skill), and site_rank_term (overall standing, shared with PHY's
// raw_stats term above) — verified against a real maxed-out profile
// (3985/3985 solved, rank 1, top 0.25%) to land around 0.72, comfortably
// clearing the Chrome gate and pushing overall into Icon range; an average
// solid profile (few hundred solved, mid-pack percentile) stays near-zero.
fn legacy_score(s: &Signals) -> f64 {
    let l = &K::LEGACY;
    let z = l.a * lg(s.total_solved as f64)
        + l.b * lg(s.contests_attended as f64)
        + l.c * lg((100.0 - s.global_ranking_percentile).max(0.0))
        + l.d * site_rank_term(s.site_ranking)
        - l.f;
    sigmoid(z)
}

fn pick_finish(overall: u32, legacy: f64, recent_spike: bool) -> Finish {
    let f = &K::FINISH;
    if overall >= f.icon_min {
        Finish::Icon
    } else if overall >= f.chrome_min && legacy >= f.chrome_legacy {
        Finish::Chrome
    } else if recent_spike && overall >= f.silver_min {
        Finish::Totw
    } else if overall >= f.red_min {
        Finish::Red
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
        Archetype {
            name: "Strategist".into(),
            blurb: "consistent contest performer with rock-solid fundamentals".into(),
        }
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
        contest_rating: s.contest_rating,
        contests_attended: s.contests_attended,
        total_solved: s.total_solved,
        easy_solved: s.easy_solved,
        medium_solved: s.medium_solved,
        hard_solved: s.hard_solved,
        topics_solved: s.topics_solved,
        easy_topics_solved: s.easy_topics_solved,
        medium_topics_solved: s.medium_topics_solved,
        hard_topics_solved: s.hard_topics_solved,
        languages_used: s.languages_used,
        reputation: s.reputation,
        active_days: s.active_days,
        total_submissions: s.total_submissions,
        site_ranking: s.site_ranking,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
            reputation: 30,
            topics_solved: 12,
            easy_topics_solved: 6,
            medium_topics_solved: 4,
            hard_topics_solved: 2,
            languages_used: 3,
            acceptance_rate: 62.0,
            easy_solved: 100,
            total_solved: 200,
            total_submissions: 320,
            site_ranking: 250_000,
            global_ranking_percentile: 15.0,
            active_years: 3.0,
            streak_days: 40,
            active_days: 120,
            recent_spike: false,
        }
    }

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
        // (sho, def) is tied at 1.0 each; ties break toward the first of the pair
        // (matches lib/scoring/engine.ts's `out[a] <= out[b] ? a : b`), so sho shrinks.
        let p = Stats { pac: 0.0, sho: 1.0, pas: 0.0, dri: 0.0, def: 1.0, phy: 0.0 };
        let out = apply_tension(&p);
        assert!(out.sho < p.sho);
        assert_eq!(out.def, p.def);
    }

    #[test]
    fn tension_reduces_the_strictly_weaker_stat_of_the_pair() {
        let p = Stats { pac: 0.0, sho: 2.0, pas: 0.0, dri: 0.0, def: 1.0, phy: 0.0 };
        let out = apply_tension(&p);
        assert!(out.def < p.def);
        assert_eq!(out.sho, p.sho);
    }

    #[test]
    fn spike_centers_a_flat_profile_exactly_on_c() {
        let p = Stats::default();
        let out = spike(&p, 70.0);
        for k in STATS {
            assert_eq!(out.get(k), 70.0);
        }
    }

    #[test]
    fn position_from_shape_picks_the_highest_scoring_family() {
        let st = Stats { pac: 80.0, sho: 85.0, pas: 40.0, dri: 40.0, def: 30.0, phy: 40.0 };
        let (position, family) = position_from_shape(&st);
        assert_eq!(family, Family::Forward);
        assert_eq!(position, Position::St); // sho > pac
    }

    #[test]
    fn weighted_ovr_never_exceeds_the_cap() {
        let st = Stats { pac: 99.0, sho: 99.0, pas: 99.0, dri: 99.0, def: 99.0, phy: 99.0 };
        let ovr = weighted_ovr(&st, Family::Forward);
        assert_eq!(ovr, K::OVR_CAP);
    }

    #[test]
    fn legacy_score_is_a_probability_between_0_and_1() {
        let s = base_signals();
        let l = legacy_score(&s);
        assert!((0.0..=1.0).contains(&l));
    }

    // Regression for a real profile (LeetCode user "cpcs"): solved 3985/3985 (the
    // entire catalog), rank 1 site-wide, top 0.25% contest percentile, 2450
    // rating, 22 contests. Before the legacy_score recalibration this landed at
    // legacy=0.018 (indistinguishable from an average solver) because the old
    // formula weighted `active_years` the way GitHub's account-age-in-years was
    // weighted, but LeetCode's active_years (active_days/365) never exceeds ~1.0.
    #[test]
    fn a_maxed_out_profile_clears_the_chrome_legacy_gate_and_reaches_icon_range() {
        let maxed = Signals {
            username: "cpcs".into(),
            recent_solved: 2854,
            hard_solved: 951,
            medium_solved: 2081,
            contest_rating: 2449.563,
            contests_attended: 22,
            reputation: 4767,
            topics_solved: 46,
            easy_topics_solved: 10,
            medium_topics_solved: 18,
            hard_topics_solved: 18,
            languages_used: 18,
            acceptance_rate: 100.0,
            easy_solved: 953,
            total_solved: 3985,
            total_submissions: 3985,
            site_ranking: 1,
            global_ranking_percentile: 0.238,
            active_years: 363.0 / 365.0,
            streak_days: 283,
            active_days: 363,
            recent_spike: false,
            ..base_signals()
        };
        let legacy = legacy_score(&maxed);
        assert!(legacy >= K::FINISH.chrome_legacy, "legacy {legacy} should clear the Chrome gate");

        let card = build_card(&maxed);
        assert!(card.overall >= K::FINISH.icon_min, "overall {} should reach Icon range", card.overall);
    }

    #[test]
    fn pick_finish_bronze_below_silver_threshold() {
        assert_eq!(pick_finish(50, 0.0, false), Finish::Bronze);
    }

    #[test]
    fn pick_finish_icon_at_90_or_above() {
        assert_eq!(pick_finish(90, 0.0, false), Finish::Icon);
    }

    #[test]
    fn pick_finish_red_at_80_to_84_regardless_of_legacy() {
        assert_eq!(pick_finish(80, 0.0, false), Finish::Red);
        assert_eq!(pick_finish(84, 1.0, false), Finish::Red);
    }

    #[test]
    fn pick_finish_chrome_needs_both_the_overall_and_legacy_gate() {
        assert_eq!(pick_finish(87, 0.5, false), Finish::Chrome);
        // Clears the overall band but not the legacy gate: falls back to Red,
        // the next tier down it does qualify for, not Gold.
        assert_eq!(pick_finish(87, 0.1, false), Finish::Red);
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

    #[test]
    fn a_top_percentile_rank_lifts_center_over_an_identical_unranked_profile() {
        let ranked = Signals { global_ranking_percentile: 1.0, ..base_signals() };
        let unranked = Signals { global_ranking_percentile: 100.0, ..base_signals() };
        assert!(center(&ranked) > center(&unranked));
    }

    #[test]
    fn no_contest_rank_contributes_zero_to_center_not_a_penalty() {
        let no_rank = Signals { global_ranking_percentile: 100.0, ..base_signals() };
        let bit_of_rank = Signals { global_ranking_percentile: 99.9, ..base_signals() };
        // 100.0 -> (100-100)=0 -> lg(1)=0 contribution; anything better than dead
        // last should be >= that, never worse.
        assert!(center(&bit_of_rank) >= center(&no_rank));
    }

    #[test]
    fn contest_rating_lifts_def_alongside_pas() {
        let with_rating = Signals { contest_rating: 2400.0, ..base_signals() };
        let no_rating = Signals { contest_rating: 0.0, contests_attended: 0, ..base_signals() };
        let stats_with = raw_stats(&with_rating);
        let stats_without = raw_stats(&no_rating);
        assert!(stats_with.def > stats_without.def);
        assert!(stats_with.pas > stats_without.pas);
    }

    #[test]
    fn site_rank_term_is_zero_for_an_unranked_profile() {
        assert_eq!(site_rank_term(0), 0.0);
    }

    #[test]
    fn site_rank_term_rewards_a_smaller_rank_number() {
        assert!(site_rank_term(1_000) > site_rank_term(1_000_000));
    }

    #[test]
    fn site_ranking_lifts_phy_but_unranked_is_not_penalized_vs_a_bad_rank() {
        let elite_rank = Signals { site_ranking: 1_000, ..base_signals() };
        let bad_rank = Signals { site_ranking: 5_000_000, ..base_signals() };
        let unranked = Signals { site_ranking: 0, ..base_signals() };
        assert!(raw_stats(&elite_rank).phy > raw_stats(&bad_rank).phy);
        // Unranked must read as neutral (no data), not worse than a genuinely bad rank.
        assert!(raw_stats(&unranked).phy >= raw_stats(&bad_rank).phy);
    }

    #[test]
    fn total_submissions_gives_phy_a_small_lift_distinct_from_total_solved() {
        let base = base_signals();
        let more_submissions_same_solved = Signals { total_submissions: base.total_submissions * 5, ..base_signals() };
        assert!(raw_stats(&more_submissions_same_solved).phy > raw_stats(&base).phy);
    }

    #[test]
    fn hard_tier_topics_lift_dri_beyond_total_topic_count_alone() {
        let base = base_signals(); // topics_solved: 12, hard_topics_solved: 2
        let more_hard_same_total = Signals { hard_topics_solved: 8, medium_topics_solved: 4, easy_topics_solved: 0, ..base_signals() };
        assert_eq!(more_hard_same_total.topics_solved, base.topics_solved); // total unchanged
        assert!(raw_stats(&more_hard_same_total).dri > raw_stats(&base).dri);
    }

    #[test]
    fn language_diversity_gives_a_small_dri_lift() {
        let one_language = Signals { languages_used: 1, ..base_signals() };
        let five_languages = Signals { languages_used: 5, ..base_signals() };
        assert!(raw_stats(&five_languages).dri > raw_stats(&one_language).dri);
    }

    #[test]
    fn reputation_gives_a_small_pas_lift_but_less_than_contest_rating() {
        // Bounds reflect realistic LeetCode reputation (most active solvers sit in
        // the tens to low hundreds; thousands is a rare outlier), not an
        // unbounded range that would make any nonzero weight look dominant.
        let no_reputation = Signals { reputation: 0, ..base_signals() };
        let high_reputation = Signals { reputation: 500, ..base_signals() };
        let reputation_delta = raw_stats(&high_reputation).pas - raw_stats(&no_reputation).pas;

        let low_rating = Signals { contest_rating: 800.0, ..base_signals() };
        let high_rating = Signals { contest_rating: 2800.0, ..base_signals() };
        let rating_delta = raw_stats(&high_rating).pas - raw_stats(&low_rating).pas;

        assert!(reputation_delta > 0.0);
        assert!(reputation_delta < rating_delta, "reputation shouldn't out-swing contest rating on PAS");
    }

    // The comparison the user asked to see: a high-volume "grinder" with a
    // middling rank vs. a lower-volume "contest specialist" with an elite rank
    // and rating, holding everything else roughly comparable. Before this
    // change, global_ranking_percentile only mattered inside the 88+ legacy
    // bonus, so the specialist's elite rank did nothing for their baseOVR.
    #[test]
    fn a_contest_specialist_now_outscores_a_pure_grinder_with_comparable_volume() {
        let grinder = Signals {
            username: "grinder".into(),
            recent_solved: 500,
            hard_solved: 40,
            medium_solved: 300,
            contest_rating: 1200.0,
            contests_attended: 3,
            topics_solved: 14,
            acceptance_rate: 55.0,
            easy_solved: 400,
            total_solved: 1200,
            global_ranking_percentile: 60.0, // middling — never competes
            active_years: 3.0,
            streak_days: 300,
            recent_spike: false,
            ..base_signals()
        };
        let specialist = Signals {
            username: "specialist".into(),
            recent_solved: 250,
            hard_solved: 60,
            medium_solved: 200,
            contest_rating: 2600.0,
            contests_attended: 60,
            topics_solved: 16,
            acceptance_rate: 68.0,
            easy_solved: 150,
            total_solved: 700,
            global_ranking_percentile: 2.0, // top 2% — elite
            active_years: 3.0,
            streak_days: 300,
            recent_spike: false,
            ..base_signals()
        };
        let grinder_card = build_card(&grinder);
        let specialist_card = build_card(&specialist);
        assert!(
            specialist_card.overall >= grinder_card.overall,
            "specialist {} should not score below grinder {} despite half the volume",
            specialist_card.overall,
            grinder_card.overall
        );
    }
}
