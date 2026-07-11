//! Phase 7 control plane.
//!
//! Two axum routes:
//!   * `POST /control/command` — external client (Companion, curl, custom
//!     HTTP dashboard) submits a broadcast command. Commands with an
//!     in-JS effect (take/arm/playIn/playOut/rundown) are forwarded to the
//!     Control Room window via a Tauri event; commands with an in-Rust
//!     effect (startRecord/stopRecord) dispatch directly here.
//!   * `GET /control/state/stream` — SSE channel that pushes the current
//!     `ControlState` snapshot the moment `set_control_state` is called,
//!     with a full-snapshot first frame for late joiners. Identical
//!     late-join semantics to `/document/stream` (Phase 2).
//!
//! Transport rationale (see docs/PHASE7_DESIGN.md): rejecting a raw
//! WebSocket in favor of HTTP+SSE. Every message is one-directional
//! (client→server or server→client), and `tokio-tungstenite` failed
//! crates.io TLS revocation on this project's build network (see
//! Cargo.toml). The SSE dependency is already loaded and proven end-to-end
//! in Phase 2.

use std::sync::{Arc, Mutex};

use axum::extract::State;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::Json;
use tauri::{AppHandle, Emitter};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

/// Current compact control snapshot. `String` (not `serde_json::Value`)
/// deliberately: the source of truth is the Control Room's Zustand store,
/// which produces the JSON before calling `set_control_state`. Rust only
/// mirrors it — never parses, never reshapes.
pub type ControlStateBuffer = Arc<Mutex<String>>;

/// Broadcast channel used by `/control/state/stream` to fan the latest
/// snapshot out to every connected SSE subscriber. Same buffered-lag
/// tolerance as the document broadcast (16 slots) — a burst of rapid
/// commands must never wedge a slow Companion install.
pub type ControlStateBroadcast = Arc<tokio::sync::broadcast::Sender<String>>;

#[derive(Clone)]
pub struct ControlServerState {
    pub state: ControlStateBuffer,
    pub broadcast: ControlStateBroadcast,
    pub app_handle: AppHandle,
}

/// All command types the protocol accepts. Names match `docs/PHASE7_DESIGN.md`'s
/// protocol table verbatim — this is the union external clients (Companion
/// module, curl, dashboards) target, so a rename here is a wire break.
///
/// Not deserialized as an enum directly because `params` shapes differ per
/// command and the frontend dispatcher is the authoritative interpreter —
/// Rust only validates that the type name is one of the accepted strings,
/// then forwards the raw JSON. Keeping the validation set here (rather than
/// on the JS side alone) means an obviously-wrong command like
/// `{"type":"foo"}` gets a synchronous HTTP 400, not a silent no-op.
const KNOWN_COMMANDS: &[&str] = &[
    "take",
    "arm",
    "playIn",
    "playOut",
    "takeItem",
    "nextItem",
    "previousItem",
    "playSchedule",
    "pauseSchedule",
    "stopSchedule",
    "startRecord",
    "stopRecord",
    "ping",
];

/// Commands that Rust handles directly (not forwarded to JS). Kept as a
/// small explicit list rather than pattern-matching in the dispatcher so
/// adding a new Rust-side command is a one-line change.
fn is_rust_command(t: &str) -> bool {
    matches!(t, "startRecord" | "stopRecord" | "ping")
}

#[derive(serde::Deserialize)]
pub struct ControlCommandRequest {
    #[serde(default)]
    pub seq: Option<u64>,
    #[serde(rename = "type")]
    pub cmd_type: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

#[derive(serde::Serialize)]
pub struct ControlCommandResponse {
    pub ok: bool,
    pub seq: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
}

const CORS: [(axum::http::HeaderName, &str); 3] = [
    (axum::http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
    (axum::http::header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, OPTIONS"),
    (axum::http::header::ACCESS_CONTROL_ALLOW_HEADERS, "content-type"),
];

/// Preflight for the cross-origin POST from a browser-based Companion
/// alternative or a curl-from-anywhere sanity check.
pub async fn control_command_preflight() -> impl IntoResponse {
    (CORS, axum::http::StatusCode::NO_CONTENT)
}

pub async fn control_command_handler(
    State(state): State<ControlServerState>,
    Json(req): Json<ControlCommandRequest>,
) -> axum::response::Response {
    let seq = req.seq;
    let ty = req.cmd_type.trim().to_string();

    if !KNOWN_COMMANDS.contains(&ty.as_str()) {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            CORS,
            Json(ControlCommandResponse {
                ok: false,
                seq,
                error: Some(format!("unknown command type: {ty}")),
                result: None,
            }),
        )
            .into_response();
    }

    if is_rust_command(&ty) {
        match dispatch_rust_command(&state, &ty, &req.params).await {
            Ok(result) => (
                CORS,
                Json(ControlCommandResponse {
                    ok: true,
                    seq,
                    error: None,
                    result: Some(result),
                }),
            )
                .into_response(),
            Err(e) => (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                CORS,
                Json(ControlCommandResponse {
                    ok: false,
                    seq,
                    error: Some(e),
                    result: None,
                }),
            )
                .into_response(),
        }
    } else {
        let payload = serde_json::json!({
            "seq": seq,
            "type": ty,
            "params": req.params,
        });
        // Emit to every window — the Control Room is the only one listening
        // (see controlBridge.ts). Program/Preview windows explicitly do not
        // subscribe to this event.
        if let Err(e) = state.app_handle.emit("control:command", payload) {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                CORS,
                Json(ControlCommandResponse {
                    ok: false,
                    seq,
                    error: Some(format!("emit failed: {e}")),
                    result: None,
                }),
            )
                .into_response();
        }
        // The POST confirms *dispatch*, not effect. Effect is observed on
        // /control/state/stream, per the protocol documented in
        // docs/PHASE7_DESIGN.md.
        (
            CORS,
            Json(ControlCommandResponse {
                ok: true,
                seq,
                error: None,
                result: None,
            }),
        )
            .into_response()
    }
}

async fn dispatch_rust_command(
    state: &ControlServerState,
    ty: &str,
    params: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    match ty {
        "ping" => Ok(serde_json::json!({ "pong": true })),
        "startRecord" => {
            let filename = params
                .get("filename")
                .and_then(|v| v.as_str())
                .map(String::from);
            let codec = params
                .get("codec")
                .and_then(|v| v.as_str())
                .map(String::from);
            // The record module owns its own state; we just forward.
            crate::record::start_record_from_command(&state.app_handle, filename, codec)
                .await
                .map(|r| serde_json::to_value(r).unwrap_or(serde_json::Value::Null))
        }
        "stopRecord" => crate::record::stop_record_from_command(&state.app_handle)
            .map(|r| serde_json::to_value(r).unwrap_or(serde_json::Value::Null)),
        other => Err(format!("is_rust_command returned true for '{other}' but no branch exists")),
    }
}

/// SSE endpoint. First frame is the current snapshot (for late joiners);
/// every subsequent frame is a full replace pushed by `set_control_state`.
pub async fn control_state_stream_handler(
    State(state): State<ControlServerState>,
) -> impl IntoResponse {
    let initial = state.state.lock().unwrap().clone();
    let rx = state.broadcast.subscribe();
    let updates = BroadcastStream::new(rx).filter_map(|msg| {
        msg.ok()
            .map(|snap| Ok::<Event, std::convert::Infallible>(Event::default().data(snap)))
    });
    let stream = tokio_stream::once(Ok::<Event, std::convert::Infallible>(
        Event::default().data(initial),
    ))
    .chain(updates);
    (CORS, Sse::new(stream).keep_alive(KeepAlive::default()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// If a `ControlCommandType` is added on the TypeScript side but this
    /// list drifts, every command matching the new name will silently 400
    /// with "unknown command type" — an operator-visible regression that
    /// TypeScript can't catch. Pinning the list here keeps drift honest.
    #[test]
    fn known_commands_contains_every_documented_command() {
        for expected in [
            "take",
            "arm",
            "playIn",
            "playOut",
            "takeItem",
            "nextItem",
            "previousItem",
            "playSchedule",
            "pauseSchedule",
            "stopSchedule",
            "startRecord",
            "stopRecord",
            "ping",
        ] {
            assert!(
                KNOWN_COMMANDS.contains(&expected),
                "KNOWN_COMMANDS missing documented command {expected}"
            );
        }
        assert_eq!(
            KNOWN_COMMANDS.len(),
            13,
            "KNOWN_COMMANDS length must match protocol docs; add + update this test if you added a command"
        );
    }

    #[test]
    fn is_rust_command_covers_rust_side_dispatch() {
        assert!(is_rust_command("startRecord"));
        assert!(is_rust_command("stopRecord"));
        assert!(is_rust_command("ping"));
    }

    #[test]
    fn is_rust_command_rejects_js_side_commands() {
        // These commands emit to Control Room via `control:command` event —
        // they must NEVER be handled inline in Rust or the state won't
        // reflect in the JS store.
        for js in ["take", "arm", "playIn", "playOut", "takeItem", "nextItem"] {
            assert!(!is_rust_command(js), "{js} must route through the JS bridge");
        }
    }
}
