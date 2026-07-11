//! Phase 7 Spout / Syphon stub.
//!
//! Real GPU texture sharing (`Spout.dll` on Windows, Syphon framework on
//! macOS) mirrors the NDI Stage-1 pattern from Phase 2 — dynamic-load the
//! runtime, hand-roll the small FFI surface, honestly report unavailable
//! on machines without it installed. That work is deferred to Phase 8.
//!
//! Phase 7 ships this stub so the Tauri command surface + status shape are
//! already in place. When the real backend lands, only this file changes;
//! the `get_spout_status` command name, its return type, and the frontend
//! that reads it stay identical.
//!
//! Not `unimplemented!()` — the frontend must be able to *ask* about Spout
//! availability without panicking, and get an honest "not yet" back.

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpoutStatus {
    pub available: bool,
    pub reason: String,
    pub platform: &'static str,
}

fn platform_name() -> &'static str {
    #[cfg(target_os = "windows")]
    { "windows" }
    #[cfg(target_os = "macos")]
    { "macos" }
    #[cfg(target_os = "linux")]
    { "linux" }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    { "other" }
}

fn platform_reason() -> String {
    match platform_name() {
        "windows" => "Spout output is Phase 8 work — capture via NDI or FFmpeg for now.".into(),
        "macos" => "Syphon output is Phase 8 work — capture via NDI or FFmpeg for now.".into(),
        _ => "Spout/Syphon is a Windows/macOS-only GPU texture-sharing feature and is not supported on this platform.".into(),
    }
}

#[tauri::command]
pub fn get_spout_status() -> SpoutStatus {
    SpoutStatus {
        available: false,
        reason: platform_reason(),
        platform: platform_name(),
    }
}
