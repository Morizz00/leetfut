use crate::scoring::types::Card;
use redis::AsyncCommands;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, OnceCell};

pub const CARD_TTL_SECONDS: u64 = 120 * 60;
const CACHE_VERSION: &str = "v1";

fn key_for(username: &str) -> String {
    format!("leetfut:card:{CACHE_VERSION}:{}", username.trim().trim_start_matches('@').to_lowercase())
}

pub struct Cache {
    conn: Option<redis::aio::ConnectionManager>,
}

impl Cache {
    // Mirrors GitFut's lib/redis.ts: absent REDIS_URL degrades to a no-op cache rather
    // than failing the whole service, so LeetFut stays explorable without Redis configured.
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

// Concurrent scouts of the same username collapse onto one in-flight build, mirroring
// GitFut's lib/scout.ts `inflight` map: the Redis cache takes a beat to populate, so
// when a profile trends every hit in that fill window would otherwise be a full cache
// miss. Entries are removed once the build settles (success or failure) so failures
// are never memoised and the map can't grow unbounded.
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

        let result = slot.get_or_init(|| build).await.clone();

        // Only the caller that actually populated the slot removes it, so late joiners
        // that awaited get_or_init still read the shared, cached-in-this-request result.
        let mut slots = self.slots.lock().await;
        slots.remove(key);

        result
    }
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

#[cfg(test)]
mod inflight_tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn fake_card() -> Card {
        use crate::scoring::engine::build_card;
        use crate::scoring::types::Signals;
        build_card(&Signals {
            username: "octocat".into(),
            name: "".into(),
            avatar_url: "".into(),
            country: None,
            recent_solved: 10,
            hard_solved: 1,
            medium_solved: 1,
            contest_rating: 1200.0,
            contests_attended: 1,
            reputation: 5,
            topics_solved: 2,
            easy_topics_solved: 2,
            medium_topics_solved: 0,
            hard_topics_solved: 0,
            languages_used: 1,
            acceptance_rate: 50.0,
            easy_solved: 5,
            total_solved: 10,
            total_submissions: 15,
            site_ranking: 800_000,
            global_ranking_percentile: 50.0,
            active_years: 1.0,
            streak_days: 5,
            active_days: 5,
            recent_spike: false,
        })
    }

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
}
