//! Phase 9 — Rundown Studio (rundownstudio.app) connector.
//!
//! Public REST API (OpenAPI spec at /api-v0/docs/spec.json). This module
//! wraps the two endpoints Phase 9 needs:
//!   * GET /ping                                     — token validation
//!   * GET /rundown/{rundownId}                      — rundown metadata
//!   * GET /rundown/{rundownId}/cues                 — cue array to import
//!
//! Auth: `Authorization: Bearer <token>`. Token is persisted to
//! `<app_data_dir>/rundowncloud_settings.json` (mirrors the AI-settings
//! pattern from Phase 6.4) and never sent back to the JS layer in
//! plaintext — only a `configured: bool` status flag.

use std::path::{Path, PathBuf};

const BASE_URL: &str = "https://app.rundownstudio.app/api-v0";

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct RundownCloudSettingsFile {
    #[serde(skip_serializing_if = "Option::is_none")]
    api_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rundown_id: Option<String>,
}

fn settings_path(assets_dir: &Path) -> PathBuf {
    // Same convention as ai_settings.json — sits alongside the assets dir,
    // not inside it (the assets dir is served over HTTP by the axum sidecar
    // and we never want secrets in that reachable path).
    assets_dir.parent().unwrap_or(assets_dir).join("rundowncloud_settings.json")
}

fn load_settings(assets_dir: &Path) -> RundownCloudSettingsFile {
    std::fs::read_to_string(settings_path(assets_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_settings(assets_dir: &Path, settings: &RundownCloudSettingsFile) -> Result<(), String> {
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(settings_path(assets_dir), json).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RundownCloudStatus {
    /// True when both a token AND a rundown ID are on disk. Deliberately
    /// AND, not OR — the operator's mental model is "connector is
    /// configured" ↔ "one-click Import will work"; a half-filled config
    /// isn't useful.
    pub configured: bool,
    pub rundown_id: Option<String>,
    /// Documented endpoint base URL — surfaced in the settings dialog so
    /// an operator on a network with a proxy knows exactly where they need
    /// to allow-list.
    pub base_url: &'static str,
}

/// Validated form of a rundown ID. Rundown Studio's public spec pins this
/// to `^[a-zA-Z0-9]{20}$` — enforce here so a mistyped ID gets a clear
/// client-side message instead of a server 400 with no context.
fn validate_rundown_id(id: &str) -> Result<(), String> {
    if id.len() != 20 {
        return Err(format!("rundown id must be exactly 20 characters (got {})", id.len()));
    }
    if !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("rundown id must be alphanumeric ASCII".to_string());
    }
    Ok(())
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("failed to build HTTP client: {e}"))
}

async fn authed_get(token: &str, path: &str) -> Result<reqwest::Response, String> {
    let url = format!("{BASE_URL}{path}");
    client()?
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))
}

// --------------------------------------------------------------------------
// Tauri commands
// --------------------------------------------------------------------------

#[tauri::command]
pub fn get_rundowncloud_status(state: tauri::State<crate::AssetDirState>) -> RundownCloudStatus {
    let s = load_settings(&state.assets_dir);
    let configured = s
        .api_token
        .as_deref()
        .is_some_and(|t| !t.trim().is_empty())
        && s.rundown_id.as_deref().is_some_and(|r| !r.trim().is_empty());
    RundownCloudStatus {
        configured,
        rundown_id: s.rundown_id.filter(|r| !r.trim().is_empty()),
        base_url: BASE_URL,
    }
}

#[tauri::command]
pub fn set_rundowncloud_config(
    api_token: String,
    rundown_id: String,
    state: tauri::State<crate::AssetDirState>,
) -> Result<(), String> {
    let token = api_token.trim().to_string();
    let id = rundown_id.trim().to_string();
    if token.is_empty() {
        return Err("api token is required".into());
    }
    validate_rundown_id(&id)?;
    save_settings(
        &state.assets_dir,
        &RundownCloudSettingsFile {
            api_token: Some(token),
            rundown_id: Some(id),
        },
    )
}

#[tauri::command]
pub fn clear_rundowncloud_config(state: tauri::State<crate::AssetDirState>) -> Result<(), String> {
    save_settings(&state.assets_dir, &RundownCloudSettingsFile::default())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    pub ok: bool,
    pub http_status: u16,
}

#[tauri::command]
pub async fn ping_rundowncloud(state: tauri::State<'_, crate::AssetDirState>) -> Result<PingResult, String> {
    let settings = load_settings(&state.assets_dir);
    let Some(token) = settings.api_token else {
        return Err("no API token configured".into());
    };
    let resp = authed_get(&token, "/ping").await?;
    let status = resp.status();
    Ok(PingResult {
        ok: status.is_success(),
        http_status: status.as_u16(),
    })
}

/// Mirrors Rundown Studio's Rundown schema exactly — the JS side
/// deserializes it as-is via camelCase serde. `status` stays a string
/// (not an enum) because Rundown Studio may add new statuses without a
/// wire break; forwarding whatever they send lets us render new ones
/// verbatim rather than crashing on parse.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RundownMetadata {
    pub id: String,
    pub name: String,
    pub start_time: String,
    pub end_time: String,
    pub status: String,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[tauri::command]
pub async fn fetch_rundowncloud_rundown(
    state: tauri::State<'_, crate::AssetDirState>,
) -> Result<RundownMetadata, String> {
    let settings = load_settings(&state.assets_dir);
    let (Some(token), Some(rundown_id)) = (settings.api_token, settings.rundown_id) else {
        return Err("rundowncloud connector is not fully configured".into());
    };
    validate_rundown_id(&rundown_id)?;
    let resp = authed_get(&token, &format!("/rundown/{rundown_id}")).await?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {body}"));
    }
    resp.json::<RundownMetadata>()
        .await
        .map_err(|e| format!("invalid rundown response: {e}"))
}

/// Mirrors Rundown Studio's Cue schema. Every field the OpenAPI spec
/// declares as required is required here; optional fields land as
/// `Option<...>`. `subtitle` and `background_color` land on the wire
/// (in case a future Phase surfaces them) but the Phase 9 mapping
/// discards them per the design doc.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RundownCue {
    pub id: String,
    #[serde(rename = "type")]
    pub cue_type: String,
    pub title: String,
    #[serde(default)]
    pub subtitle: Option<String>,
    /// Milliseconds — Rundown Studio's unit. Converted to seconds on the
    /// JS side (`mapCueToItem` in rundowncloud.ts).
    pub duration: i64,
    #[serde(default)]
    pub background_color: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

/// GET /rundown/{rundownId}/cues returns `{cues: Cue[]}` — this is that
/// envelope. Kept as its own struct so the JS side gets a single tidy
/// shape back rather than needing to reach into a naked `Vec`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuesResponse {
    pub cues: Vec<RundownCue>,
}

#[derive(serde::Deserialize)]
struct CuesEnvelope {
    cues: Vec<RundownCue>,
}

#[tauri::command]
pub async fn fetch_rundowncloud_cues(
    state: tauri::State<'_, crate::AssetDirState>,
) -> Result<CuesResponse, String> {
    let settings = load_settings(&state.assets_dir);
    let (Some(token), Some(rundown_id)) = (settings.api_token, settings.rundown_id) else {
        return Err("rundowncloud connector is not fully configured".into());
    };
    validate_rundown_id(&rundown_id)?;
    let resp = authed_get(&token, &format!("/rundown/{rundown_id}/cues")).await?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {body}"));
    }
    let envelope = resp
        .json::<CuesEnvelope>()
        .await
        .map_err(|e| format!("invalid cues response: {e}"))?;
    Ok(CuesResponse { cues: envelope.cues })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rundown_id_20_char_alnum_accepted() {
        assert!(validate_rundown_id("abcdefghijklmnopqrst").is_ok());
        assert!(validate_rundown_id("ABC123def456GHI789jk").is_ok());
    }

    #[test]
    fn rundown_id_wrong_length_rejected() {
        assert!(validate_rundown_id("").is_err());
        assert!(validate_rundown_id("short").is_err());
        assert!(validate_rundown_id("waytoolongforavalidrundownid").is_err());
    }

    #[test]
    fn rundown_id_non_alnum_rejected() {
        assert!(validate_rundown_id("abcdefghijklmnopqrs-").is_err());
        assert!(validate_rundown_id("abcdefghij klmnopqrs").is_err());
        assert!(validate_rundown_id("abcdefghijklmnopqrs/").is_err());
    }

    #[test]
    fn settings_round_trip_through_disk() {
        let tmp = std::env::temp_dir().join(format!("rc-test-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        let assets_dir = tmp.join("assets");
        std::fs::create_dir_all(&assets_dir).unwrap();
        let original = RundownCloudSettingsFile {
            api_token: Some("tok_test".into()),
            rundown_id: Some("aBcDeFgHiJkLmNoPqRsT".into()),
        };
        save_settings(&assets_dir, &original).unwrap();
        let reloaded = load_settings(&assets_dir);
        assert_eq!(reloaded.api_token.as_deref(), Some("tok_test"));
        assert_eq!(reloaded.rundown_id.as_deref(), Some("aBcDeFgHiJkLmNoPqRsT"));
        // Cleanup so a second test run doesn't leave state behind.
        let _ = std::fs::remove_file(settings_path(&assets_dir));
    }
}
