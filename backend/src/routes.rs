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

fn error_type_to_status(error_type: LeetcodeErrorType) -> StatusCode {
    match error_type {
        LeetcodeErrorType::Invalid => StatusCode::BAD_REQUEST,
        LeetcodeErrorType::NotFound => StatusCode::NOT_FOUND,
        LeetcodeErrorType::RateLimit => StatusCode::TOO_MANY_REQUESTS,
        LeetcodeErrorType::Private => StatusCode::FORBIDDEN,
        LeetcodeErrorType::Network => StatusCode::BAD_GATEWAY,
    }
}

fn encode_error(error_type: LeetcodeErrorType, message: &str) -> String {
    let byte = match error_type {
        LeetcodeErrorType::Invalid => "0",
        LeetcodeErrorType::NotFound => "1",
        LeetcodeErrorType::RateLimit => "2",
        LeetcodeErrorType::Private => "4",
        LeetcodeErrorType::Network => "9",
    };
    format!("{byte}\u{0}{message}")
}

fn decode_error(encoded: &str) -> (StatusCode, String) {
    let (type_byte, message) = encoded.split_once('\u{0}').unwrap_or(("9", encoded));
    let error_type = match type_byte {
        "0" => LeetcodeErrorType::Invalid,
        "1" => LeetcodeErrorType::NotFound,
        "2" => LeetcodeErrorType::RateLimit,
        "4" => LeetcodeErrorType::Private,
        _ => LeetcodeErrorType::Network,
    };
    (error_type_to_status(error_type), message.to_string())
}

async fn get_card(State(state): State<AppState>, Path(username): Path<String>) -> impl IntoResponse {
    let normalized = username.trim().trim_start_matches('@').to_lowercase();

    if let Some(card) = state.cache.read(&normalized).await {
        return Json(card).into_response();
    }

    let http = state.http.clone();
    let cache = state.cache.clone();
    let normalized_for_write = normalized.clone();
    let build = async move {
        let profile =
            fetch_profile(&http, &username).await.map_err(|e| encode_error(e.error_type, &e.message))?;
        let signals = signals_from_payload(profile);
        let card = build_card(&signals);
        cache.write(&normalized_for_write, &card).await;
        Ok(card)
    };

    match state.inflight.coalesce(&normalized, build).await {
        Ok(card) => Json(card).into_response(),
        Err(encoded) => {
            let (status, message) = decode_error(&encoded);
            (status, Json(json!({ "error": message }))).into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_each_error_type_byte_to_the_right_status() {
        let cases = [
            (LeetcodeErrorType::Invalid, StatusCode::BAD_REQUEST),
            (LeetcodeErrorType::NotFound, StatusCode::NOT_FOUND),
            (LeetcodeErrorType::RateLimit, StatusCode::TOO_MANY_REQUESTS),
            (LeetcodeErrorType::Private, StatusCode::FORBIDDEN),
            (LeetcodeErrorType::Network, StatusCode::BAD_GATEWAY),
        ];
        for (error_type, expected) in cases {
            assert_eq!(error_type_to_status(error_type), expected);
        }
    }

    #[test]
    fn encode_decode_roundtrips_the_message() {
        let encoded = encode_error(LeetcodeErrorType::NotFound, "No LeetCode user by that name.");
        let (status, message) = decode_error(&encoded);
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(message, "No LeetCode user by that name.");
    }
}
