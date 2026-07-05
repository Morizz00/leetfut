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
        Err(LeetcodeError {
            error_type: LeetcodeErrorType::Invalid,
            message: "That doesn't look like a LeetCode username.".into(),
        })
    }
}

// Flat, normalized profile — every field here is real LeetCode data pulled from the
// unofficial leetcode.com/graphql endpoint (the same one leetcode.com's own site and
// most third-party stats trackers use). recent_submission_count approximates "solved
// in the last ~365 days" using the current year's submissionCalendar, since
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
    // LeetCode's own tag-difficulty tiers are named fundamental/intermediate/advanced;
    // renamed here to easy/medium/hard to match the rest of the app's difficulty
    // vocabulary instead of introducing a second naming scheme.
    pub easy_topics_solved: u32,
    pub medium_topics_solved: u32,
    pub hard_topics_solved: u32,
    pub languages_used: u32,
    pub reputation: i32,
    pub streak_days: u32,
    // Total distinct days with at least one submission in the last year — a far
    // better tenure/dedication signal than streak (streak is the longest single
    // run; this is how consistently they actually show up).
    pub active_days: u32,
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
    profile { realName userAvatar countryName ranking reputation }
    submitStatsGlobal {
      acSubmissionNum { difficulty count submissions }
      totalSubmissionNum { difficulty count submissions }
    }
    tagProblemCounts {
      advanced { tagName problemsSolved }
      intermediate { tagName problemsSolved }
      fundamental { tagName problemsSolved }
    }
    languageProblemCount { languageName problemsSolved }
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
    #[serde(rename = "languageProblemCount")]
    language_problem_count: Vec<LanguageCount>,
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
    reputation: Option<i32>,
}
#[derive(Deserialize)]
struct LanguageCount {
    #[serde(rename = "problemsSolved")]
    problems_solved: u32,
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
    #[allow(dead_code)]
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
        .map_err(|_| LeetcodeError {
            error_type: LeetcodeErrorType::Network,
            message: "Couldn't reach LeetCode — check your connection.".into(),
        })?;

    if res.status() == 429 {
        return Err(LeetcodeError {
            error_type: LeetcodeErrorType::RateLimit,
            message: "LeetCode rate limit hit. Try again shortly.".into(),
        });
    }
    if !res.status().is_success() {
        return Err(LeetcodeError {
            error_type: LeetcodeErrorType::Network,
            message: format!("LeetCode returned an error ({}).", res.status()),
        });
    }

    let parsed: GqlResponse = res.json().await.map_err(|_| LeetcodeError {
        error_type: LeetcodeErrorType::Network,
        message: "LeetCode returned a malformed response.".into(),
    })?;

    if let Some(errors) = parsed.errors {
        if !errors.is_empty() {
            return Err(LeetcodeError { error_type: LeetcodeErrorType::Network, message: errors[0].message.clone() });
        }
    }

    let data = parsed.data.ok_or_else(|| LeetcodeError {
        error_type: LeetcodeErrorType::NotFound,
        message: "No LeetCode user by that name.".into(),
    })?;
    let user = data.matched_user.ok_or_else(|| LeetcodeError {
        error_type: LeetcodeErrorType::NotFound,
        message: "No LeetCode user by that name.".into(),
    })?;

    let ac = &user.submit_stats_global.ac_submission_num;
    let total_ac = bucket_count(ac, "All");
    let total_submitted = bucket_count(&user.submit_stats_global.total_submission_num, "All");
    let count_solved = |tags: &[TagCount]| tags.iter().filter(|t| t.problems_solved > 0).count() as u32;
    let languages_used = user.language_problem_count.iter().filter(|l| l.problems_solved > 0).count() as u32;

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
        easy_topics_solved: count_solved(&user.tag_problem_counts.fundamental),
        medium_topics_solved: count_solved(&user.tag_problem_counts.intermediate),
        hard_topics_solved: count_solved(&user.tag_problem_counts.advanced),
        languages_used,
        reputation: user.profile.reputation.unwrap_or(0),
        streak_days: user.user_calendar.streak,
        active_days: user.user_calendar.total_active_days,
        recent_submission_count: sum_recent_submission_calendar(&user.user_calendar.submission_calendar),
        contest_rating: contest.as_ref().map(|c| c.rating).unwrap_or(0.0),
        contests_attended: contest.as_ref().map(|c| c.attended_contests_count).unwrap_or(0),
        global_ranking_percentile: contest.as_ref().and_then(|c| c.top_percentage).unwrap_or(100.0),
    })
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
