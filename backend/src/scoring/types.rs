use serde::{Deserialize, Serialize};

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
// DEF/PHY stay free: role explains those. Ported from GitFut's lib/scoring/constants.ts.
pub const ATTACK_STATS: [StatKey; 4] = [StatKey::Pac, StatKey::Sho, StatKey::Pas, StatKey::Dri];

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Family {
    Forward,
    Playmaker,
    Anchor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Position {
    #[serde(rename = "ST")]
    St,
    #[serde(rename = "RW")]
    Rw,
    #[serde(rename = "CAM")]
    Cam,
    #[serde(rename = "CM")]
    Cm,
    #[serde(rename = "CDM")]
    Cdm,
    #[serde(rename = "CB")]
    Cb,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Finish {
    Bronze,
    Silver,
    Gold,
    Red,
    Totw,
    Chrome, // replaces the old blue/gold TOTY look-and-slot at 85-89
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
    pub reputation: i32,
    // DRI inputs
    pub topics_solved: u32, // distinct problem tags with >=1 solve, any tier
    pub easy_topics_solved: u32,
    pub medium_topics_solved: u32,
    pub hard_topics_solved: u32,
    pub languages_used: u32,
    // DEF inputs
    pub acceptance_rate: f64, // 0.0..=100.0
    pub easy_solved: u32,
    // PHY inputs
    pub total_solved: u32,
    pub total_submissions: u32, // includes failed attempts — raw grind volume, distinct from accepted-only total_solved
    pub site_ranking: u64, // LeetCode's own overall rank (1 = best); 0 means unranked/unknown
    // Legacy-gate inputs
    pub global_ranking_percentile: f64, // 0.0 (top) .. 100.0 (bottom)
    pub active_years: f64,
    // Style/report inputs
    pub streak_days: u32,
    pub active_days: u32,
    pub recent_spike: bool, // recent_solved far above their historical average pace
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Archetype {
    pub name: String,
    pub blurb: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    pub skill_moves: u8,
    pub weak_foot: u8,
    pub work_rate_attack: super::attributes::WorkRateLevel,
    pub work_rate_defense: super::attributes::WorkRateLevel,
    pub style: String,
    pub playstyles: Vec<super::playstyles::Playstyle>,
    // Raw LeetCode counts, surfaced as-is (not normalized into a 1-99 stat) so the
    // UI can lead with contests/problems/topics — the numbers a solver actually
    // recognizes — rather than only the abstracted FUT-style stats.
    pub contest_rating: f64,
    pub contests_attended: u32,
    pub total_solved: u32,
    pub easy_solved: u32,
    pub medium_solved: u32,
    pub hard_solved: u32,
    pub topics_solved: u32,
    pub easy_topics_solved: u32,
    pub medium_topics_solved: u32,
    pub hard_topics_solved: u32,
    pub languages_used: u32,
    pub reputation: i32,
    pub active_days: u32,
    pub total_submissions: u32,
    pub site_ranking: u64,
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
