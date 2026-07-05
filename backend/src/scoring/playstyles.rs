use super::types::Signals;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    PlaystyleDef {
        name: "Speed Solver",
        noun: "problems solved this year",
        value: |s| s.recent_solved as f64,
        base: 100.0,
        plus: 500.0,
    },
    PlaystyleDef { name: "Hard Hitter", noun: "Hard problems solved", value: |s| s.hard_solved as f64, base: 20.0, plus: 150.0 },
    PlaystyleDef { name: "Streak Keeper", noun: "day streak", value: |s| s.streak_days as f64, base: 30.0, plus: 200.0 },
    PlaystyleDef {
        name: "Contest Grinder",
        noun: "contests attended",
        value: |s| s.contests_attended as f64,
        base: 10.0,
        plus: 80.0,
    },
    PlaystyleDef {
        name: "Completionist",
        noun: "total problems solved",
        value: |s| s.total_solved as f64,
        base: 300.0,
        plus: 2000.0,
    },
    PlaystyleDef { name: "Polymath", noun: "topics solved", value: |s| s.topics_solved as f64, base: 5.0, plus: 15.0 },
    PlaystyleDef {
        name: "Sharpshooter",
        noun: "% acceptance rate",
        value: |s| s.acceptance_rate,
        base: 60.0,
        plus: 85.0,
    },
    PlaystyleDef { name: "Ranked", noun: "contest rating", value: |s| s.contest_rating, base: 1500.0, plus: 2200.0 },
    PlaystyleDef { name: "Polyglot", noun: "languages used", value: |s| s.languages_used as f64, base: 3.0, plus: 6.0 },
    PlaystyleDef {
        name: "Specialist",
        noun: "hard-tier topics solved",
        value: |s| s.hard_topics_solved as f64,
        base: 5.0,
        plus: 12.0,
    },
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
            reason: format!("{val:.0} {}{}.", def.noun, if val >= def.plus { " — elite tier" } else { "" }),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signals() -> Signals {
        Signals {
            username: "u".into(),
            name: "U".into(),
            avatar_url: "".into(),
            country: None,
            recent_solved: 600,
            hard_solved: 200,
            medium_solved: 300,
            contest_rating: 2300.0,
            contests_attended: 90,
            reputation: 2000,
            topics_solved: 16,
            easy_topics_solved: 2,
            medium_topics_solved: 2,
            hard_topics_solved: 12,
            languages_used: 6,
            acceptance_rate: 90.0,
            easy_solved: 100,
            total_solved: 2500,
            total_submissions: 2900,
            site_ranking: 5_000,
            global_ranking_percentile: 2.0,
            active_years: 5.0,
            streak_days: 250,
            active_days: 300,
            recent_spike: false,
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
        s.hard_topics_solved = 0;
        s.languages_used = 0;
        s.acceptance_rate = 0.0;
        s.contest_rating = 0.0;
        assert!(derive_playstyles(&s).is_empty());
    }

    #[test]
    fn result_never_exceeds_max_shown() {
        assert!(derive_playstyles(&signals()).len() <= MAX_SHOWN);
    }
}
