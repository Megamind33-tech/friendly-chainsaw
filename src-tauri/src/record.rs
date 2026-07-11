//! Phase 7 FFmpeg record.
//!
//! Spawns an ffmpeg subprocess capturing the Program window (or the whole
//! screen — see per-OS input below) to disk. Kept deliberately minimal: one
//! active record at a time, one file per session, no timestamped chunking or
//! auto-restart. Phase 8 hardening will layer disk-space checks and chunk
//! rotation on top of this scaffold.
//!
//! Failure modes surfaced honestly:
//!   * ffmpeg not on PATH → `start` returns an error, no orphan process
//!   * already recording → `start` refuses (operator must stop first)
//!   * ffmpeg subprocess exits unexpectedly → next `status()` reports it
//!     as inactive with the last known exit code
//!
//! Not covered here (deliberate Phase 8 work): tight PGM window capture
//! (currently uses OS screen-grab targeting the whole desktop on macOS/Linux
//! and the app title on Windows), audio mux, timecode overlay.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordStatus {
    pub active: bool,
    pub path: Option<String>,
    pub started_at: Option<i64>,
    pub last_error: Option<String>,
}

impl Default for RecordStatus {
    fn default() -> Self {
        Self {
            active: false,
            path: None,
            started_at: None,
            last_error: None,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRecordResult {
    pub path: String,
    pub started_at: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StopRecordResult {
    pub path: String,
    pub duration_ms: i64,
}

struct RecordInner {
    child: Option<std::process::Child>,
    path: Option<PathBuf>,
    started_at_ms: Option<i64>,
    last_error: Option<String>,
}

impl RecordInner {
    fn new() -> Self {
        Self {
            child: None,
            path: None,
            started_at_ms: None,
            last_error: None,
        }
    }
}

#[derive(Clone)]
pub struct RecordState {
    inner: Arc<Mutex<RecordInner>>,
}

impl RecordState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(RecordInner::new())),
        }
    }

    pub fn status(&self) -> RecordStatus {
        let mut guard = self.inner.lock().unwrap();
        // Poll for silent subprocess exit: an ffmpeg that crashed without
        // being stopped by us must not read as still-recording. try_wait()
        // is non-blocking; None means still running.
        if let Some(child) = guard.child.as_mut() {
            match child.try_wait() {
                Ok(Some(status)) => {
                    guard.last_error = Some(format!("ffmpeg exited unexpectedly: {status}"));
                    guard.child = None;
                }
                Ok(None) => {}
                Err(e) => {
                    guard.last_error = Some(format!("try_wait failed: {e}"));
                }
            }
        }
        RecordStatus {
            active: guard.child.is_some(),
            path: guard.path.as_ref().map(|p| p.to_string_lossy().into_owned()),
            started_at: guard.started_at_ms,
            last_error: guard.last_error.clone(),
        }
    }
}

fn recordings_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir unavailable: {e}"))?
        .join("recordings");
    std::fs::create_dir_all(&base).map_err(|e| format!("failed to create {}: {e}", base.display()))?;
    Ok(base)
}

fn ext_for_codec(codec: &str) -> &'static str {
    match codec {
        "prores" | "prores_ks" => "mov",
        "dnxhd" => "mxf",
        _ => "mp4",
    }
}

fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let trimmed = cleaned.trim_matches('.').to_string();
    if trimmed.is_empty() { "recording".to_string() } else { trimmed }
}

/// Builds the OS-specific ffmpeg command line. Kept in one function so a
/// unit test can exercise the arg construction without launching ffmpeg.
fn build_ffmpeg_args(output_path: &std::path::Path, codec: &str) -> Vec<String> {
    let path = output_path.to_string_lossy().into_owned();
    let mut args: Vec<String> = Vec::new();

    // OS-specific input.
    #[cfg(target_os = "windows")]
    {
        args.extend([
            "-y".into(),
            "-f".into(), "gdigrab".into(),
            "-framerate".into(), "30".into(),
            "-i".into(), "desktop".into(),
        ]);
    }
    #[cfg(target_os = "macos")]
    {
        args.extend([
            "-y".into(),
            "-f".into(), "avfoundation".into(),
            "-framerate".into(), "30".into(),
            "-i".into(), "1:none".into(),
        ]);
    }
    #[cfg(target_os = "linux")]
    {
        // DISPLAY defaulted here; real deployments will override via env
        // rather than this default. Phase 8 will replace with per-window
        // capture.
        args.extend([
            "-y".into(),
            "-f".into(), "x11grab".into(),
            "-framerate".into(), "30".into(),
            "-i".into(), ":0.0".into(),
        ]);
    }

    // Encoder — one bit per codec, cheap enough to just list.
    match codec {
        "prores" | "prores_ks" => {
            args.extend([
                "-c:v".into(), "prores_ks".into(),
                "-profile:v".into(), "3".into(),
            ]);
        }
        "dnxhd" => {
            args.extend([
                "-c:v".into(), "dnxhd".into(),
                "-b:v".into(), "120M".into(),
            ]);
        }
        _ => {
            // Default: H.264, CRF 18 (visually lossless-ish, still small).
            args.extend([
                "-c:v".into(), "libx264".into(),
                "-preset".into(), "veryfast".into(),
                "-crf".into(), "18".into(),
                "-pix_fmt".into(), "yuv420p".into(),
            ]);
        }
    }

    args.push(path);
    args
}

pub async fn start_record_from_command(
    app: &AppHandle,
    filename: Option<String>,
    codec: Option<String>,
) -> Result<StartRecordResult, String> {
    let state = app.state::<RecordState>();
    {
        let guard = state.inner.lock().unwrap();
        if guard.child.is_some() {
            return Err("already recording — stop first".to_string());
        }
    }

    let codec = codec.unwrap_or_else(|| "h264".to_string());
    let ext = ext_for_codec(&codec);
    let dir = recordings_dir(app)?;
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let base = match filename {
        Some(raw) if !raw.trim().is_empty() => sanitize_filename(raw.trim()),
        _ => format!("rec-{millis}"),
    };
    let stem = if base.ends_with(&format!(".{ext}")) {
        base.trim_end_matches(&format!(".{ext}")).to_string()
    } else {
        base
    };
    let path = dir.join(format!("{stem}-{millis}.{ext}"));

    let args = build_ffmpeg_args(&path, &codec);

    // Spawn.
    let child = match std::process::Command::new("ffmpeg")
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            let err = format!("failed to spawn ffmpeg: {e} (is ffmpeg on PATH?)");
            let record_state = app.state::<RecordState>();
            let mut guard = record_state.inner.lock().unwrap();
            guard.last_error = Some(err.clone());
            return Err(err);
        }
    };

    let started_at = millis as i64;
    {
        let record_state = app.state::<RecordState>();
        let mut guard = record_state.inner.lock().unwrap();
        guard.child = Some(child);
        guard.path = Some(path.clone());
        guard.started_at_ms = Some(started_at);
        guard.last_error = None;
    }

    Ok(StartRecordResult {
        path: path.to_string_lossy().into_owned(),
        started_at,
    })
}

pub fn stop_record_from_command(app: &AppHandle) -> Result<StopRecordResult, String> {
    let state = app.state::<RecordState>();
    let (mut child, path, started_at) = {
        let mut guard = state.inner.lock().unwrap();
        let child = guard.child.take().ok_or_else(|| "not recording".to_string())?;
        let path = guard.path.clone().ok_or_else(|| "record path missing".to_string())?;
        let started_at = guard.started_at_ms.unwrap_or(0);
        (child, path, started_at)
    };

    // Ask ffmpeg to finalize the file cleanly. ffmpeg treats stdin closure
    // as a stop signal only if invoked with `-i pipe:0` (not our case);
    // sending 'q' via stdin is the documented graceful-quit for capture
    // inputs, and falls back to a hard kill if that doesn't take within a
    // reasonable window.
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = stdin.write_all(b"q\n");
        let _ = stdin.flush();
    }

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(4);
    let exited = loop {
        match child.try_wait() {
            Ok(Some(_)) => break true,
            Ok(None) => {
                if std::time::Instant::now() >= deadline {
                    break false;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(_) => break false,
        }
    };
    if !exited {
        let _ = child.kill();
        let _ = child.wait();
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0) as i64;

    Ok(StopRecordResult {
        path: path.to_string_lossy().into_owned(),
        duration_ms: now - started_at,
    })
}

#[tauri::command]
pub fn get_record_status(state: tauri::State<RecordState>) -> RecordStatus {
    state.status()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn args_include_output_path_last() {
        let args = build_ffmpeg_args(std::path::Path::new("/tmp/x.mp4"), "h264");
        assert_eq!(args.last().map(|s| s.as_str()), Some("/tmp/x.mp4"));
    }

    #[test]
    fn args_h264_uses_libx264() {
        let args = build_ffmpeg_args(std::path::Path::new("/tmp/x.mp4"), "h264");
        assert!(args.iter().any(|a| a == "libx264"));
    }

    #[test]
    fn args_prores_uses_prores_ks() {
        let args = build_ffmpeg_args(std::path::Path::new("/tmp/x.mov"), "prores");
        assert!(args.iter().any(|a| a == "prores_ks"));
    }

    #[test]
    fn ext_for_codec_maps_prores_to_mov() {
        assert_eq!(ext_for_codec("prores"), "mov");
        assert_eq!(ext_for_codec("h264"), "mp4");
        assert_eq!(ext_for_codec("dnxhd"), "mxf");
    }

    #[test]
    fn sanitize_replaces_traversal() {
        // '/' → '_', then leading dots trimmed. So "../etc/passwd" becomes
        // "_etc_passwd" — the path escape is neutralized.
        assert_eq!(sanitize_filename("../etc/passwd"), "_etc_passwd");
        assert_eq!(sanitize_filename(""), "recording");
        assert_eq!(sanitize_filename("...."), "recording"); // all dots strip to empty → default
    }
}
