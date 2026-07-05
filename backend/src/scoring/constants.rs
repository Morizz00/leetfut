use super::types::{Family, StatKey, Stats};

pub struct Magnitude {
    pub w1: f64,
    pub w2: f64,
    pub w3: f64,
    pub w4: f64,
    // Global ranking percentile's pull on the gravity-well center. Zero for
    // anyone with no contest rank (percentile defaults to 100 => lg(0+1)=0), so
    // this only ever helps, never penalizes a no-contest profile. Kept separate
    // from w1-w4 so it's clear this term didn't exist in GitFut's original
    // magnitude formula — it's LeetFut-specific, added because percentile is the
    // best available relative-skill signal and was previously only used inside
    // the elite (88+) legacy bonus, where it did nothing for the vast majority
    // of profiles that never approach the stat cap.
    pub w5: f64,
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
    pub a: f64, // total_solved weight
    pub b: f64, // contests_attended weight
    pub c: f64, // contest percentile weight
    pub d: f64, // site_rank_term weight
    pub f: f64, // bias
    pub bonus_max: f64,
}

pub struct FinishThresholds {
    pub icon_min: u32,
    pub chrome_min: u32,
    pub chrome_legacy: f64,
    pub red_min: u32,
    pub gold_min: u32,
    pub silver_min: u32,
}

pub struct K;

impl K {
    // Ported 1:1 from lib/scoring/constants.ts's K.magnitude/tension/spike/legacy.
    pub const MAGNITUDE: Magnitude =
        Magnitude { w1: 0.5, w2: 0.4, w3: 0.5, w4: 0.08, w5: 0.45, b: -2.8, lo: 48.0, hi: 82.0 };
    pub const TENSION: Tension = Tension {
        alpha: 0.7,
        pairs: [(StatKey::Sho, StatKey::Def), (StatKey::Dri, StatKey::Phy), (StatKey::Pac, StatKey::Def)],
    };
    pub const SPIKE: Spike = Spike { base: 8.0, cohesion: 0.6 };
    pub const LEGACY: Legacy = Legacy { a: 1.2, b: 0.8, c: 0.6, d: 0.5, f: 9.0, bonus_max: 11.0 };
    pub const OVR_CAP: u32 = 88;
    // Bronze <65, Silver 65-74, Gold 75-79, Red 80-84, Chrome 85-89 (legacy-gated,
    // same gate the old TOTY tier used), Icon 90+.
    pub const FINISH: FinishThresholds =
        FinishThresholds { icon_min: 90, chrome_min: 85, chrome_legacy: 0.5, red_min: 80, gold_min: 75, silver_min: 65 };
}

pub fn weights(family: Family) -> Stats {
    match family {
        Family::Forward => Stats { pac: 0.2, sho: 0.3, pas: 0.1, dri: 0.2, def: 0.05, phy: 0.15 },
        Family::Playmaker => Stats { pac: 0.1, sho: 0.15, pas: 0.3, dri: 0.25, def: 0.1, phy: 0.1 },
        Family::Anchor => Stats { pac: 0.1, sho: 0.05, pas: 0.15, dri: 0.1, def: 0.4, phy: 0.2 },
    }
}
