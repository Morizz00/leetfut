use super::types::{Signals, Stats};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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

#[cfg(test)]
mod tests {
    use super::*;

    fn signals(topics: u32) -> Signals {
        Signals {
            username: "u".into(),
            name: "U".into(),
            avatar_url: "".into(),
            country: None,
            recent_solved: 100,
            hard_solved: 10,
            medium_solved: 40,
            contest_rating: 1500.0,
            contests_attended: 5,
            reputation: 10,
            topics_solved: topics,
            easy_topics_solved: topics,
            medium_topics_solved: 0,
            hard_topics_solved: 0,
            languages_used: 2,
            acceptance_rate: 60.0,
            easy_solved: 50,
            total_solved: 100,
            total_submissions: 160,
            site_ranking: 500_000,
            global_ranking_percentile: 20.0,
            active_years: 2.0,
            streak_days: 10,
            active_days: 80,
            recent_spike: false,
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
