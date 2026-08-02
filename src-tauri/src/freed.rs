//! FreeD camera tracking ingest.
//!
//! FreeD is the de-facto interchange format for broadcast camera tracking —
//! Vinten/Vitec's original protocol, and what Mo-Sys StarTracker, Stype,
//! Ncam and most robotic heads emit. It is a small fixed-size UDP datagram
//! carrying the physical camera's pose and lens state.
//!
//! This is what makes AR *AR*. Until now the engine rendered 3D graphics to a
//! virtual camera with authored moves — a virtual set, in Vizrt's vocabulary,
//! not augmented reality (see docs/GAP_ANALYSIS.md). Locking the render camera
//! to a real tracked camera is the difference.
//!
//! ## Message layout — FreeD "D1" (29 bytes, big-endian)
//!
//! ```text
//!  0        0xD1  message type
//!  1        camera id
//!  2..=4    pan    signed 24-bit, units of 1/32768 degree
//!  5..=7    tilt   signed 24-bit, units of 1/32768 degree
//!  8..=10   roll   signed 24-bit, units of 1/32768 degree
//! 11..=13   x      signed 24-bit, units of 1/64 mm
//! 14..=16   y      signed 24-bit, units of 1/64 mm
//! 17..=19   z      signed 24-bit, units of 1/64 mm
//! 20..=22   zoom   unsigned 24-bit, raw encoder units
//! 23..=25   focus  unsigned 24-bit, raw encoder units
//! 26..=27   spare / user-defined
//! 28        checksum
//! ```
//!
//! The checksum starts at 0x40 and each of the preceding 28 bytes is
//! subtracted from it modulo 256.
//!
//! **Not verified against real hardware.** The layout above is implemented
//! from the published specification and is covered by round-trip tests against
//! this module's own builder, which cannot prove conformance with a physical
//! tracker. Validating against a real Mo-Sys/Stype feed is the acceptance
//! criterion in REMEDIATION_PLAN.md R7 and must happen before this is trusted
//! on air.

use std::sync::{Arc, Mutex};

/// Wire size of a FreeD D1 message.
pub const FREED_D1_LEN: usize = 29;
/// First byte of a D1 message.
pub const FREED_D1_TYPE: u8 = 0xD1;

/// Angles arrive as 1/32768 of a degree.
const ANGLE_SCALE: f64 = 32768.0;
/// Positions arrive as 1/64 mm.
const POSITION_SCALE: f64 = 64.0;
/// Millimetres per metre — the render scene works in metres.
const MM_PER_M: f64 = 1000.0;

/// A decoded camera pose. Angles are degrees, positions **metres**, because
/// that is what the 3D scene is authored in — converting once here keeps the
/// unit change out of every consumer.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FreedPose {
    pub camera_id: u8,
    pub pan_deg: f64,
    pub tilt_deg: f64,
    pub roll_deg: f64,
    pub x_m: f64,
    pub y_m: f64,
    pub z_m: f64,
    /// Raw encoder counts. Mapping these to a focal length needs a per-lens
    /// calibration table, which this does not attempt to invent.
    pub zoom_raw: u32,
    pub focus_raw: u32,
    /// Milliseconds since the Unix epoch, stamped on arrival. Consumers use it
    /// to age out a feed that has stopped, exactly like the data hub does.
    pub received_at_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FreedParseError {
    /// Not `FREED_D1_LEN` bytes.
    BadLength,
    /// First byte was not 0xD1.
    UnknownMessageType,
    /// Checksum did not match — a corrupted or misaligned datagram.
    BadChecksum,
}

/// Big-endian signed 24-bit.
fn read_i24(bytes: &[u8]) -> i32 {
    let raw = ((bytes[0] as i32) << 16) | ((bytes[1] as i32) << 8) | (bytes[2] as i32);
    // Sign-extend from bit 23.
    if raw & 0x0080_0000 != 0 {
        raw | !0x00FF_FFFF
    } else {
        raw
    }
}

/// Big-endian unsigned 24-bit.
fn read_u24(bytes: &[u8]) -> u32 {
    ((bytes[0] as u32) << 16) | ((bytes[1] as u32) << 8) | (bytes[2] as u32)
}

/// Checksum over the first 28 bytes: start at 0x40 and subtract each, mod 256.
pub fn freed_checksum(body: &[u8]) -> u8 {
    body.iter().fold(0x40u8, |acc, b| acc.wrapping_sub(*b))
}

/// Decode a FreeD D1 datagram.
///
/// A malformed packet is rejected rather than partially decoded: a
/// misaligned or corrupted datagram interpreted as a pose would visibly throw
/// the AR camera, and on air a frozen graphic is far better than one that
/// jumps to a garbage position.
pub fn parse_freed_d1(data: &[u8], received_at_ms: u64) -> Result<FreedPose, FreedParseError> {
    if data.len() != FREED_D1_LEN {
        return Err(FreedParseError::BadLength);
    }
    if data[0] != FREED_D1_TYPE {
        return Err(FreedParseError::UnknownMessageType);
    }
    if freed_checksum(&data[..FREED_D1_LEN - 1]) != data[FREED_D1_LEN - 1] {
        return Err(FreedParseError::BadChecksum);
    }

    Ok(FreedPose {
        camera_id: data[1],
        pan_deg: read_i24(&data[2..5]) as f64 / ANGLE_SCALE,
        tilt_deg: read_i24(&data[5..8]) as f64 / ANGLE_SCALE,
        roll_deg: read_i24(&data[8..11]) as f64 / ANGLE_SCALE,
        x_m: read_i24(&data[11..14]) as f64 / POSITION_SCALE / MM_PER_M,
        y_m: read_i24(&data[14..17]) as f64 / POSITION_SCALE / MM_PER_M,
        z_m: read_i24(&data[17..20]) as f64 / POSITION_SCALE / MM_PER_M,
        zoom_raw: read_u24(&data[20..23]),
        focus_raw: read_u24(&data[23..26]),
        received_at_ms,
    })
}

/// Encode a pose as a D1 datagram. Exists so the parser can be round-trip
/// tested and so an operator can be given a synthetic feed for bench setup
/// without a physical camera present.
pub fn build_freed_d1(pose: &FreedPose) -> [u8; FREED_D1_LEN] {
    fn write_i24(out: &mut [u8], value: i32) {
        let v = value & 0x00FF_FFFF;
        out[0] = ((v >> 16) & 0xFF) as u8;
        out[1] = ((v >> 8) & 0xFF) as u8;
        out[2] = (v & 0xFF) as u8;
    }
    fn write_u24(out: &mut [u8], value: u32) {
        out[0] = ((value >> 16) & 0xFF) as u8;
        out[1] = ((value >> 8) & 0xFF) as u8;
        out[2] = (value & 0xFF) as u8;
    }

    let mut buf = [0u8; FREED_D1_LEN];
    buf[0] = FREED_D1_TYPE;
    buf[1] = pose.camera_id;
    write_i24(&mut buf[2..5], (pose.pan_deg * ANGLE_SCALE).round() as i32);
    write_i24(&mut buf[5..8], (pose.tilt_deg * ANGLE_SCALE).round() as i32);
    write_i24(&mut buf[8..11], (pose.roll_deg * ANGLE_SCALE).round() as i32);
    write_i24(&mut buf[11..14], (pose.x_m * MM_PER_M * POSITION_SCALE).round() as i32);
    write_i24(&mut buf[14..17], (pose.y_m * MM_PER_M * POSITION_SCALE).round() as i32);
    write_i24(&mut buf[17..20], (pose.z_m * MM_PER_M * POSITION_SCALE).round() as i32);
    write_u24(&mut buf[20..23], pose.zoom_raw);
    write_u24(&mut buf[23..26], pose.focus_raw);
    let checksum = freed_checksum(&buf[..FREED_D1_LEN - 1]);
    buf[FREED_D1_LEN - 1] = checksum;
    buf
}

// ---------------------------------------------------------------------------
// Listener state
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FreedConfig {
    pub enabled: bool,
    pub port: u16,
    /// Accept only this camera id. `None` accepts every camera on the wire —
    /// a tracked studio usually multicasts several.
    pub camera_id: Option<u8>,
}

impl Default for FreedConfig {
    fn default() -> Self {
        // 6301 is the port Mo-Sys and Stype default to.
        Self { enabled: false, port: 6301, camera_id: None }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FreedStatus {
    pub enabled: bool,
    pub port: u16,
    pub listening: bool,
    /// True while the built-in synthetic tracker is emitting. Reported so the
    /// UI can never show generated motion as a real camera — the same rule the
    /// election feed had to be fixed to obey (AUDIT-2026-08.md S0-2).
    pub simulated: bool,
    /// Populated only when the socket could not be opened.
    pub error: Option<String>,
    pub packets_received: u64,
    /// Datagrams rejected by length, type or checksum — a non-zero value with
    /// a live feed means something on the wire is wrong, and hiding it would
    /// leave an operator debugging a jittery camera blind.
    pub packets_rejected: u64,
    pub last_pose: Option<FreedPose>,
}

#[derive(Debug, Default)]
pub struct FreedState {
    pub config: FreedConfig,
    pub listening: bool,
    pub simulated: bool,
    pub error: Option<String>,
    pub packets_received: u64,
    pub packets_rejected: u64,
    pub last_pose: Option<FreedPose>,
}

impl FreedState {
    pub fn snapshot(&self) -> FreedStatus {
        FreedStatus {
            enabled: self.config.enabled,
            port: self.config.port,
            listening: self.listening,
            simulated: self.simulated,
            error: self.error.clone(),
            packets_received: self.packets_received,
            packets_rejected: self.packets_rejected,
            last_pose: self.last_pose,
        }
    }
}

pub type SharedFreedState = Arc<Mutex<FreedState>>;
/// Broadcasts each accepted pose as JSON to `/tracking/stream` subscribers.
pub type FreedBroadcast = Arc<tokio::sync::broadcast::Sender<String>>;

/// Apply one received datagram to the shared state, returning the pose to
/// broadcast when it is accepted.
///
/// Split out from the socket loop so the accept/reject/filter behaviour is
/// testable without binding a UDP port.
pub fn ingest_datagram(
    state: &SharedFreedState,
    data: &[u8],
    received_at_ms: u64,
) -> Option<FreedPose> {
    let mut guard = crate::lock_recover(state);
    match parse_freed_d1(data, received_at_ms) {
        Ok(pose) => {
            // A camera-id filter is not a parse failure — the packet is valid,
            // it just belongs to another camera, so it must not inflate the
            // rejected counter an operator uses to diagnose wire problems.
            if let Some(want) = guard.config.camera_id {
                if pose.camera_id != want {
                    return None;
                }
            }
            guard.packets_received += 1;
            guard.last_pose = Some(pose);
            Some(pose)
        }
        Err(_) => {
            guard.packets_rejected += 1;
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pose() -> FreedPose {
        FreedPose {
            camera_id: 3,
            pan_deg: 45.5,
            tilt_deg: -12.25,
            roll_deg: 0.5,
            x_m: 1.5,
            y_m: -0.75,
            z_m: 2.0,
            zoom_raw: 12345,
            focus_raw: 54321,
            received_at_ms: 1_000,
        }
    }

    #[test]
    fn round_trips_a_pose() {
        let original = pose();
        let parsed = parse_freed_d1(&build_freed_d1(&original), 1_000).expect("valid");
        assert_eq!(parsed.camera_id, original.camera_id);
        // 1/32768 degree and 1/64 mm are the wire quantisation limits.
        assert!((parsed.pan_deg - original.pan_deg).abs() < 1e-4);
        assert!((parsed.tilt_deg - original.tilt_deg).abs() < 1e-4);
        assert!((parsed.roll_deg - original.roll_deg).abs() < 1e-4);
        assert!((parsed.x_m - original.x_m).abs() < 1e-4);
        assert!((parsed.y_m - original.y_m).abs() < 1e-4);
        assert!((parsed.z_m - original.z_m).abs() < 1e-4);
        assert_eq!(parsed.zoom_raw, original.zoom_raw);
        assert_eq!(parsed.focus_raw, original.focus_raw);
    }

    #[test]
    fn message_is_exactly_29_bytes_and_typed() {
        let bytes = build_freed_d1(&pose());
        assert_eq!(bytes.len(), FREED_D1_LEN);
        assert_eq!(bytes[0], FREED_D1_TYPE);
    }

    #[test]
    fn handles_negative_angles_and_positions() {
        // Sign extension from bit 23 is the classic place a 24-bit parser
        // breaks: a camera panned left would read as ~+180 degrees.
        let mut p = pose();
        p.pan_deg = -170.0;
        p.tilt_deg = -45.0;
        p.x_m = -4.25;
        p.z_m = -0.001;
        let parsed = parse_freed_d1(&build_freed_d1(&p), 0).expect("valid");
        assert!(parsed.pan_deg < 0.0, "pan was {}", parsed.pan_deg);
        assert!((parsed.pan_deg - (-170.0)).abs() < 1e-3);
        assert!((parsed.tilt_deg - (-45.0)).abs() < 1e-3);
        assert!((parsed.x_m - (-4.25)).abs() < 1e-4);
        assert!(parsed.z_m < 0.0);
    }

    #[test]
    fn handles_the_full_angle_range() {
        for deg in [-180.0f64, -90.0, -0.001, 0.0, 0.001, 90.0, 179.999] {
            let mut p = pose();
            p.pan_deg = deg;
            let parsed = parse_freed_d1(&build_freed_d1(&p), 0).expect("valid");
            assert!((parsed.pan_deg - deg).abs() < 1e-3, "{deg} -> {}", parsed.pan_deg);
        }
    }

    #[test]
    fn converts_positions_from_millimetres_to_metres() {
        // The scene is authored in metres; a factor-of-1000 error would put
        // the camera a kilometre away and render an empty frame.
        let mut p = pose();
        p.x_m = 2.0;
        let bytes = build_freed_d1(&p);
        // 2 m = 2000 mm = 128000 in 1/64 mm units.
        assert_eq!(read_i24(&bytes[11..14]), 128_000);
        assert!((parse_freed_d1(&bytes, 0).unwrap().x_m - 2.0).abs() < 1e-6);
    }

    #[test]
    fn rejects_a_short_or_long_datagram() {
        assert_eq!(parse_freed_d1(&[], 0), Err(FreedParseError::BadLength));
        assert_eq!(parse_freed_d1(&[0xD1; 28], 0), Err(FreedParseError::BadLength));
        assert_eq!(parse_freed_d1(&[0xD1; 30], 0), Err(FreedParseError::BadLength));
    }

    #[test]
    fn rejects_an_unknown_message_type() {
        let mut bytes = build_freed_d1(&pose());
        bytes[0] = 0xD2;
        assert_eq!(parse_freed_d1(&bytes, 0), Err(FreedParseError::UnknownMessageType));
    }

    #[test]
    fn rejects_a_corrupted_datagram() {
        // A misaligned or corrupted packet decoded as a pose would visibly
        // throw the AR camera. On air a frozen graphic beats one that jumps.
        let mut bytes = build_freed_d1(&pose());
        bytes[4] ^= 0xFF;
        assert_eq!(parse_freed_d1(&bytes, 0), Err(FreedParseError::BadChecksum));
    }

    #[test]
    fn checksum_matches_the_published_definition() {
        let bytes = build_freed_d1(&pose());
        let expected = bytes[..FREED_D1_LEN - 1]
            .iter()
            .fold(0x40u8, |acc, b| acc.wrapping_sub(*b));
        assert_eq!(bytes[FREED_D1_LEN - 1], expected);
    }

    #[test]
    fn stamps_arrival_time() {
        let parsed = parse_freed_d1(&build_freed_d1(&pose()), 42).unwrap();
        assert_eq!(parsed.received_at_ms, 42);
    }

    fn state() -> SharedFreedState {
        Arc::new(Mutex::new(FreedState::default()))
    }

    #[test]
    fn ingest_accepts_a_valid_datagram_and_counts_it() {
        let s = state();
        assert!(ingest_datagram(&s, &build_freed_d1(&pose()), 5).is_some());
        let snap = crate::lock_recover(&s).snapshot();
        assert_eq!(snap.packets_received, 1);
        assert_eq!(snap.packets_rejected, 0);
        assert!(snap.last_pose.is_some());
    }

    #[test]
    fn ingest_counts_a_rejected_datagram_separately() {
        // A non-zero reject count with a live feed is how an operator finds a
        // wire problem; folding it into "received" would hide it.
        let s = state();
        assert!(ingest_datagram(&s, &[0u8; 10], 0).is_none());
        let snap = crate::lock_recover(&s).snapshot();
        assert_eq!(snap.packets_received, 0);
        assert_eq!(snap.packets_rejected, 1);
        assert!(snap.last_pose.is_none());
    }

    #[test]
    fn camera_filter_drops_other_cameras_without_counting_them_as_errors() {
        let s = state();
        crate::lock_recover(&s).config.camera_id = Some(1);

        let mut other = pose();
        other.camera_id = 2;
        assert!(ingest_datagram(&s, &build_freed_d1(&other), 0).is_none());

        let mut wanted = pose();
        wanted.camera_id = 1;
        assert!(ingest_datagram(&s, &build_freed_d1(&wanted), 0).is_some());

        let snap = crate::lock_recover(&s).snapshot();
        assert_eq!(snap.packets_received, 1);
        // The filtered packet was valid — it just belonged to another camera.
        assert_eq!(snap.packets_rejected, 0);
    }

    #[test]
    fn no_filter_accepts_every_camera() {
        let s = state();
        for id in [0u8, 1, 7, 255] {
            let mut p = pose();
            p.camera_id = id;
            assert!(ingest_datagram(&s, &build_freed_d1(&p), 0).is_some());
        }
        assert_eq!(crate::lock_recover(&s).snapshot().packets_received, 4);
    }

    #[test]
    fn default_config_is_off_on_the_conventional_port() {
        let c = FreedConfig::default();
        assert!(!c.enabled, "tracking must never start listening uninvited");
        assert_eq!(c.port, 6301);
        assert!(c.camera_id.is_none());
    }
}

// ---------------------------------------------------------------------------
// UDP listener, settings, and Tauri commands
// ---------------------------------------------------------------------------

use std::path::{Path, PathBuf};

fn settings_path(assets_dir: &Path) -> PathBuf {
    // Same convention as the other connector settings: alongside the assets
    // dir, never inside it — the assets dir is served over HTTP.
    assets_dir.parent().unwrap_or(assets_dir).join("freed_settings.json")
}

fn load_settings(assets_dir: &Path) -> FreedConfig {
    std::fs::read_to_string(settings_path(assets_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_settings(assets_dir: &Path, config: &FreedConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(settings_path(assets_dir), json).map_err(|e| e.to_string())
}

/// Spawn the UDP receive loop.
///
/// Aborts any previous listener first, so changing the port does not leave the
/// old socket bound and quietly consuming packets nobody reads.
pub fn spawn_listener(
    state: SharedFreedState,
    broadcast: FreedBroadcast,
    handle: Arc<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>>,
) {
    if let Some(previous) = crate::lock_recover(&handle).take() {
        previous.abort();
    }

    let (enabled, port) = {
        let guard = crate::lock_recover(&state);
        (guard.config.enabled, guard.config.port)
    };
    if !enabled {
        let mut guard = crate::lock_recover(&state);
        guard.listening = false;
        guard.error = None;
        return;
    }

    let task_state = state.clone();
    let task = tauri::async_runtime::spawn(async move {
        let socket = match tokio::net::UdpSocket::bind(("0.0.0.0", port)).await {
            Ok(s) => s,
            Err(e) => {
                // A bind failure is reported, never panicked — the same rule
                // the output server had to be fixed to follow (S2-12).
                let detail = format!("Could not listen on UDP {port}: {e}");
                eprintln!("freed: {detail}");
                let mut guard = crate::lock_recover(&task_state);
                guard.listening = false;
                guard.error = Some(detail);
                return;
            }
        };
        {
            let mut guard = crate::lock_recover(&task_state);
            guard.listening = true;
            guard.error = None;
        }
        eprintln!("freed: listening on UDP {port}");

        // One datagram is 29 bytes; this is generous enough to see an
        // oversized packet and reject it rather than silently truncating one.
        let mut buf = [0u8; 256];
        loop {
            match socket.recv_from(&mut buf).await {
                Ok((len, _addr)) => {
                    let now_ms = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);
                    if let Some(pose) = ingest_datagram(&task_state, &buf[..len], now_ms) {
                        if let Ok(json) = serde_json::to_string(&pose) {
                            // No active subscriber is not an error — a tracked
                            // studio streams whether or not Program is open.
                            let _ = broadcast.send(json);
                        }
                    }
                }
                Err(e) => {
                    let detail = format!("UDP receive failed: {e}");
                    eprintln!("freed: {detail}");
                    let mut guard = crate::lock_recover(&task_state);
                    guard.listening = false;
                    guard.error = Some(detail);
                    return;
                }
            }
        }
    });

    *crate::lock_recover(&handle) = Some(task);
}

pub type FreedTaskHandle = Arc<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>>;

/// Load persisted config at startup and start listening if it was enabled.
pub fn maybe_start_listener(
    assets_dir: &Path,
    state: SharedFreedState,
    broadcast: FreedBroadcast,
    handle: FreedTaskHandle,
) {
    let config = load_settings(assets_dir);
    crate::lock_recover(&state).config = config;
    spawn_listener(state, broadcast, handle);
}

#[tauri::command]
pub fn get_freed_status(state: tauri::State<'_, SharedFreedState>) -> FreedStatus {
    crate::lock_recover(&state).snapshot()
}

#[tauri::command]
pub fn set_freed_config(
    config: FreedConfig,
    assets: tauri::State<'_, crate::AssetDirState>,
    state: tauri::State<'_, SharedFreedState>,
    broadcast: tauri::State<'_, FreedBroadcast>,
    handle: tauri::State<'_, FreedTaskHandle>,
) -> Result<FreedStatus, String> {
    save_settings(&assets.assets_dir, &config)?;
    {
        let mut guard = crate::lock_recover(&state);
        guard.config = config;
        // Counters describe the CURRENT session on the CURRENT port; carrying
        // them across a reconfigure would make a fresh port look like it had
        // already seen traffic.
        guard.packets_received = 0;
        guard.packets_rejected = 0;
        guard.last_pose = None;
    }
    spawn_listener(state.inner().clone(), broadcast.inner().clone(), handle.inner().clone());
    Ok(crate::lock_recover(&state).snapshot())
}

// ---------------------------------------------------------------------------
// Synthetic tracker
// ---------------------------------------------------------------------------

/// Emit generated FreeD packets at the configured port, over loopback.
///
/// Deliberately sends REAL datagrams to the real listener rather than
/// injecting poses directly into the state. That way it exercises the entire
/// chain an actual tracker would — encode, UDP, parse, checksum, camera-id
/// filter, SSE fan-out, render camera — so a green result here means the path
/// works, not merely that the renderer can be fed.
///
/// It cannot prove wire conformance: it speaks this module's own encoder, so
/// it validates the plumbing and not the specification (see the module header).
///
/// `simulated` is surfaced in the status so the UI can never present generated
/// motion as a real camera.
pub fn spawn_simulator(
    state: SharedFreedState,
    handle: Arc<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>>,
) {
    if let Some(previous) = crate::lock_recover(&handle).take() {
        previous.abort();
    }
    let port = crate::lock_recover(&state).config.port;
    crate::lock_recover(&state).simulated = true;

    let task = tauri::async_runtime::spawn(async move {
        let socket = match tokio::net::UdpSocket::bind(("127.0.0.1", 0)).await {
            Ok(s) => s,
            Err(e) => {
                eprintln!("freed simulator: could not open a sending socket: {e}");
                crate::lock_recover(&state).simulated = false;
                return;
            }
        };
        let target = format!("127.0.0.1:{port}");
        // 50 Hz — a broadcast camera rate, so the timing the renderer sees
        // matches what a real tracker would produce.
        let mut ticker = tokio::time::interval(std::time::Duration::from_millis(20));
        let mut t: f64 = 0.0;
        loop {
            ticker.tick().await;
            t += 0.02;
            // A slow arc with a gentle tilt and a breathing zoom: enough motion
            // to make a mis-mapped axis or a wrong Euler order obvious on
            // screen, slow enough to watch.
            let pose = FreedPose {
                camera_id: 1,
                pan_deg: 30.0 * (t * 0.25).sin(),
                tilt_deg: -8.0 + 5.0 * (t * 0.17).cos(),
                roll_deg: 0.0,
                x_m: 2.0 * (t * 0.25).sin(),
                y_m: -3.5,
                z_m: 1.6,
                zoom_raw: (8_000_000.0 + 4_000_000.0 * (t * 0.2).sin()) as u32,
                focus_raw: 0,
                received_at_ms: 0,
            };
            if socket.send_to(&build_freed_d1(&pose), &target).await.is_err() {
                // The listener is not up; keep trying rather than dying, so
                // starting the simulator before the listener still works.
                continue;
            }
        }
    });
    *crate::lock_recover(&handle) = Some(task);
}

pub type FreedSimHandle = Arc<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>>;

#[tauri::command]
pub fn set_freed_simulator(
    enabled: bool,
    state: tauri::State<'_, SharedFreedState>,
    sim: tauri::State<'_, FreedSimHandle>,
) -> FreedStatus {
    if enabled {
        spawn_simulator(state.inner().clone(), sim.inner().clone());
    } else {
        if let Some(task) = crate::lock_recover(&sim).take() {
            task.abort();
        }
        crate::lock_recover(&state).simulated = false;
    }
    crate::lock_recover(&state).snapshot()
}
