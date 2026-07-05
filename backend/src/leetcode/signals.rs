use super::client::RawProfile;
use crate::scoring::types::Signals;

pub fn signals_from_payload(p: RawProfile) -> Signals {
    let acceptance_rate = if p.total_submissions == 0 {
        0.0
    } else {
        100.0 * p.accepted_submissions as f64 / p.total_submissions as f64
    };
    // Tenure/dedication signal: total ACTIVE DAYS over the last year, not the
    // longest streak — a 341/365 active-days profile is far more consistent than
    // one long 289-day streak followed by silence, even though the streak number
    // alone can't tell the two apart. Only guards true divide-by-zero (0 active
    // days) with a tiny epsilon — must NOT floor to 1.0, or every solver under a
    // full year of activity (the vast majority) looks identically "1 year active".
    let active_years = (p.active_days as f64 / 365.0).max(1.0 / 365.0);
    let avg_yearly_pace = p.total_solved as f64 / active_years;
    let recent_spike = avg_yearly_pace > 0.0 && p.recent_submission_count as f64 > avg_yearly_pace * 3.0;
    let topics_solved = p.easy_topics_solved + p.medium_topics_solved + p.hard_topics_solved;

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
        reputation: p.reputation,
        topics_solved,
        easy_topics_solved: p.easy_topics_solved,
        medium_topics_solved: p.medium_topics_solved,
        hard_topics_solved: p.hard_topics_solved,
        languages_used: p.languages_used,
        acceptance_rate,
        easy_solved: p.easy_solved,
        total_solved: p.total_solved,
        total_submissions: p.total_submissions,
        site_ranking: p.ranking,
        global_ranking_percentile: p.global_ranking_percentile,
        active_years,
        streak_days: p.streak_days,
        active_days: p.active_days,
        recent_spike,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw() -> RawProfile {
        RawProfile {
            username: "octocat".into(),
            real_name: Some("The Octocat".into()),
            avatar_url: "https://x/a.png".into(),
            country_name: Some("United States".into()),
            ranking: 12345,
            total_solved: 200,
            easy_solved: 100,
            medium_solved: 80,
            hard_solved: 20,
            total_submissions: 400,
            accepted_submissions: 200,
            easy_topics_solved: 6,
            medium_topics_solved: 4,
            hard_topics_solved: 2,
            languages_used: 3,
            reputation: 25,
            streak_days: 400,
            active_days: 341,
            recent_submission_count: 150,
            contest_rating: 1600.0,
            contests_attended: 8,
            global_ranking_percentile: 15.0,
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

    #[test]
    fn active_years_is_driven_by_active_days_not_streak() {
        let mut p = raw();
        p.active_days = 289; // under a year — must NOT read as a flat 1.0
        p.streak_days = 400; // deliberately different, to prove streak isn't the input
        let s = signals_from_payload(p);
        assert!((s.active_years - 289.0 / 365.0).abs() < 1e-9);
        assert!(s.active_years < 1.0);
    }

    #[test]
    fn active_years_only_guards_true_zero_active_days() {
        let mut p = raw();
        p.active_days = 0;
        let s = signals_from_payload(p);
        assert!(s.active_years > 0.0, "must avoid a literal zero (used as a divisor)");
        assert!(s.active_years < 0.01, "should stay a tiny epsilon, not jump to a full year");
    }

    #[test]
    fn sums_the_three_topic_tiers_into_total_topics_solved() {
        let s = signals_from_payload(raw());
        assert_eq!(s.topics_solved, 12);
        assert_eq!(s.easy_topics_solved, 6);
        assert_eq!(s.medium_topics_solved, 4);
        assert_eq!(s.hard_topics_solved, 2);
    }

    #[test]
    fn carries_through_languages_used_and_reputation() {
        let s = signals_from_payload(raw());
        assert_eq!(s.languages_used, 3);
        assert_eq!(s.reputation, 25);
    }
}
