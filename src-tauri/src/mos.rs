//! Phase 10 — MOS Protocol.
//!
//! Accepts rundowns from a Newsroom Computer System (iNews, ENPS, Octopus)
//! over the real MOS 2.8.5 wire format: raw TCP, XML per message,
//! `\x00` message terminator.
//!
//! Scope: a subset — heartbeat, mosID handshake, `roCreate`,
//! `roStorySend`, `roStoryInsert/Delete/Move`, `roDelete`. Wide enough for
//! a small-station iNews rundown transfer; deliberately narrow so the
//! parser stays honest (see `docs/PHASE10_DESIGN.md`).
//!
//! Phase 10.1: TCP listener now spawns on startup when
//! `settings.enabled = true`. Per-connection loop reads null-terminated
//! frames, ACKs heartbeats inline, and emits `mos:message` Tauri events
//! for all other messages so `controlBridge.ts` can apply rundown
//! mutations against `usePlayoutStore`.
//!
//! Not verified against a live iNews instance — no NRCS to hand in this
//! environment. Parser is verified against synthetic MOS XML samples
//! matching the public spec.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tokio::sync::Notify;

/// The set of MOS message roles we parse. Everything outside this list is
/// acknowledged (heartbeat-style) but produces no state change; the
/// operator can see raw log entries.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MosMessage {
    Heartbeat { message_id: String },
    MosId { message_id: String, mos_id: String, ncs_id: String },
    /// Full rundown, replaces the current playout items.
    RoCreate {
        message_id: String,
        ro_id: String,
        ro_slug: String,
        stories: Vec<MosStory>,
    },
    /// A single story updated (partial update of an existing rundown).
    RoStorySend { message_id: String, ro_id: String, story: MosStory },
    /// Delete stories by id from a rundown.
    RoStoryDelete { message_id: String, ro_id: String, story_ids: Vec<String> },
    /// Insert stories at a position; `target_id` is None → append at end.
    RoStoryInsert {
        message_id: String,
        ro_id: String,
        target_id: Option<String>,
        stories: Vec<MosStory>,
    },
    /// Reorder stories: the given ids should end up in the given order at
    /// `target_id`'s position.
    RoStoryMove { message_id: String, ro_id: String, target_id: Option<String>, story_ids: Vec<String> },
    /// Clear the rundown.
    RoDelete { message_id: String, ro_id: String },
    /// A message we recognized structurally but don't handle. Not an
    /// error — real MOS traffic includes many messages a partial impl
    /// doesn't care about; we just log and move on.
    Unhandled { message_id: String, role_name: String },
}

/// A story from a `roCreate`/`roStorySend` message. Items (individual clips
/// within a story) are not surfaced in Stage 1 — story-level is enough for
/// rundown import into `ProgramItem[]`.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MosStory {
    pub id: String,
    pub slug: String,
    /// Duration in seconds. MOS carries this as `storyDuration` in seconds
    /// (unlike Rundown Studio's milliseconds), or absent — default 30s.
    pub duration_sec: u32,
}

// ---------------------------------------------------------------------------
// XML parser
//
// Approach: a single streaming pass records every `(path, text)` pair. A
// second pass over that flat list decides the role (the first direct child
// of `<mos>` that isn't message metadata) and extracts fields by path.
// Two passes keeps each stage simple and separately testable.
// ---------------------------------------------------------------------------

use quick_xml::events::Event;
use quick_xml::reader::Reader;

/// Element metadata names that are NOT the message role — they wrap it.
/// The role is the first direct child of `<mos>` outside this set.
const META_ELEMENTS: &[&str] = &["mosID", "ncsID", "messageID"];

#[derive(Debug, Clone)]
struct FlatEvent {
    /// Slash-separated path (e.g. `mos/roCreate/story/storyID`).
    path: String,
    /// The text content of this element (if any).
    text: String,
    /// Element name at the end of the path.
    name: String,
    /// Nesting depth (root `<mos>` is 1).
    depth: usize,
}

fn tokenize_xml(xml: &[u8]) -> Result<Vec<FlatEvent>, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut path: Vec<String> = Vec::new();
    let mut events: Vec<FlatEvent> = Vec::new();
    let mut pending: Option<FlatEvent> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                if let Some(p) = pending.take() {
                    events.push(p);
                }
                let name = std::str::from_utf8(e.name().as_ref())
                    .map_err(|e| format!("invalid UTF-8 in tag: {e}"))?
                    .to_string();
                path.push(name.clone());
                pending = Some(FlatEvent {
                    path: path.join("/"),
                    text: String::new(),
                    name,
                    depth: path.len(),
                });
            }
            Ok(Event::Text(t)) => {
                let text = t.unescape().map_err(|e| e.to_string())?.into_owned();
                if let Some(p) = pending.as_mut() {
                    p.text.push_str(&text);
                }
            }
            Ok(Event::Empty(e)) => {
                if let Some(p) = pending.take() {
                    events.push(p);
                }
                let name = std::str::from_utf8(e.name().as_ref())
                    .map_err(|e| format!("invalid UTF-8 in empty tag: {e}"))?
                    .to_string();
                path.push(name.clone());
                events.push(FlatEvent {
                    path: path.join("/"),
                    text: String::new(),
                    name,
                    depth: path.len(),
                });
                path.pop();
            }
            Ok(Event::End(_)) => {
                if let Some(p) = pending.take() {
                    events.push(p);
                }
                path.pop();
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error at position {}: {e}", reader.buffer_position())),
            _ => {}
        }
        buf.clear();
    }
    Ok(events)
}

/// Find the role name: the first element at depth 2 (direct child of the
/// root `<mos>` at depth 1) whose name isn't a metadata element.
fn find_role_name(events: &[FlatEvent]) -> Option<String> {
    events
        .iter()
        .find(|e| e.depth == 2 && !META_ELEMENTS.contains(&e.name.as_str()))
        .map(|e| e.name.clone())
}

fn first_text(events: &[FlatEvent], path_suffix: &str) -> Option<String> {
    events
        .iter()
        .find(|e| e.path.ends_with(path_suffix) && !e.text.is_empty())
        .map(|e| e.text.clone())
}

/// Extract every `<story>` block from a role subtree, in document order.
fn extract_stories(events: &[FlatEvent], role_name: &str) -> Vec<MosStory> {
    // Group events by `story` boundary. A story starts when we see an
    // event whose path is `mos/{role}/story` and ends when the next such
    // start (or end of events) is seen.
    let story_marker = format!("mos/{role_name}/story");
    let mut stories: Vec<MosStory> = Vec::new();
    let mut current: Option<MosStory> = None;
    for e in events {
        let is_story_start = e.path == story_marker;
        if is_story_start {
            if let Some(s) = current.take() {
                stories.push(s);
            }
            current = Some(MosStory {
                id: String::new(),
                slug: String::new(),
                duration_sec: 30,
            });
            continue;
        }
        if let Some(s) = current.as_mut() {
            if e.path == format!("{story_marker}/storyID") {
                s.id = e.text.clone();
            } else if e.path == format!("{story_marker}/storySlug") {
                s.slug = e.text.clone();
            } else if e.path == format!("{story_marker}/storyDuration") {
                s.duration_sec = e
                    .text
                    .parse::<f64>()
                    .unwrap_or(30.0)
                    .round()
                    .max(1.0) as u32;
            }
        }
    }
    if let Some(s) = current {
        stories.push(s);
    }
    stories
}

/// Extract storyIDs that appear as direct children of the role element
/// (not nested inside a `<story>` block). Used by `roStoryDelete`,
/// `roStoryInsert`, `roStoryMove` where the ids identify targets rather
/// than defining stories.
fn extract_top_level_story_ids(events: &[FlatEvent], role_name: &str) -> Vec<String> {
    let want = format!("mos/{role_name}/storyID");
    events
        .iter()
        .filter(|e| e.path == want && !e.text.is_empty())
        .map(|e| e.text.clone())
        .collect()
}

/// Parses one whole MOS message from an XML byte slice. Returns
/// `Err(reason)` on any structural failure — the caller keeps the
/// connection alive and moves to the next message.
pub fn parse_mos_message(xml: &[u8]) -> Result<MosMessage, String> {
    let events = tokenize_xml(xml)?;
    let message_id = first_text(&events, "/messageID").unwrap_or_default();
    let role_name = find_role_name(&events).unwrap_or_else(|| "unknown".to_string());

    Ok(match role_name.as_str() {
        "heartbeat" => MosMessage::Heartbeat { message_id },
        "mosID" | "mosReqAll" => MosMessage::MosId {
            message_id,
            mos_id: first_text(&events, "mos/mosID").unwrap_or_default(),
            ncs_id: first_text(&events, "mos/ncsID").unwrap_or_default(),
        },
        "roCreate" => {
            let stories = extract_stories(&events, "roCreate");
            MosMessage::RoCreate {
                message_id,
                ro_id: first_text(&events, "/roID").unwrap_or_default(),
                ro_slug: first_text(&events, "/roSlug").unwrap_or_default(),
                stories,
            }
        }
        "roStorySend" => {
            let mut stories = extract_stories(&events, "roStorySend");
            let story = if stories.is_empty() {
                MosStory {
                    id: first_text(&events, "/storyID").unwrap_or_default(),
                    slug: first_text(&events, "/storySlug").unwrap_or_default(),
                    duration_sec: first_text(&events, "/storyDuration")
                        .and_then(|t| t.parse::<f64>().ok())
                        .map(|d| d.round().max(1.0) as u32)
                        .unwrap_or(30),
                }
            } else {
                stories.remove(0)
            };
            MosMessage::RoStorySend {
                message_id,
                ro_id: first_text(&events, "/roID").unwrap_or_default(),
                story,
            }
        }
        "roStoryDelete" => MosMessage::RoStoryDelete {
            message_id,
            ro_id: first_text(&events, "/roID").unwrap_or_default(),
            story_ids: extract_top_level_story_ids(&events, "roStoryDelete"),
        },
        "roStoryInsert" => {
            let mut story_ids = extract_top_level_story_ids(&events, "roStoryInsert");
            // First top-level storyID is the target; the rest (and any
            // <story> blocks) are the payload.
            let target_id = if !story_ids.is_empty() { Some(story_ids.remove(0)) } else { None };
            MosMessage::RoStoryInsert {
                message_id,
                ro_id: first_text(&events, "/roID").unwrap_or_default(),
                target_id,
                stories: extract_stories(&events, "roStoryInsert"),
            }
        }
        "roStoryMove" => {
            let mut story_ids = extract_top_level_story_ids(&events, "roStoryMove");
            let target_id = if !story_ids.is_empty() { Some(story_ids.remove(0)) } else { None };
            MosMessage::RoStoryMove {
                message_id,
                ro_id: first_text(&events, "/roID").unwrap_or_default(),
                target_id,
                story_ids,
            }
        }
        "roDelete" => MosMessage::RoDelete {
            message_id,
            ro_id: first_text(&events, "/roID").unwrap_or_default(),
        },
        other => MosMessage::Unhandled {
            message_id,
            role_name: other.to_string(),
        },
    })
}

/// Build a heartbeat ACK matching the incoming message's `messageID`. This
/// is what an NRCS expects on the wire — same shape, same id.
pub fn build_heartbeat_ack(message_id: &str, mos_id: &str, ncs_id: &str) -> Vec<u8> {
    let xml = format!(
        r#"<mos><mosID>{mos_id}</mosID><ncsID>{ncs_id}</ncsID><messageID>{message_id}</messageID><heartbeat><time>{time}</time></heartbeat></mos>"#,
        time = "0"
    );
    let mut out = xml.into_bytes();
    out.push(0);
    out
}

/// Minimal XML text escape covering exactly the characters that break
/// the MOS wire format when embedded in an element body. Not general-
/// purpose: MOS ids and slugs never contain HTML entities in practice,
/// but a slug with an ampersand or angle bracket would otherwise
/// invalidate the emitted XML and get rejected by the NCS.
fn xml_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '\'' => out.push_str("&apos;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

/// Phase 10.2: build a `roAck` reply for a specific inbound message. Sent
/// back to the same NCS on the same connection after every non-heartbeat
/// message that carried a parseable `roID`. `status` is `"OK"` on
/// successful ingest; other strings are error codes if we ever surface
/// a specific rejection.
pub fn build_ro_ack(message_id: &str, mos_id: &str, ncs_id: &str, ro_id: &str, status: &str) -> Vec<u8> {
    let xml = format!(
        r#"<mos><mosID>{mos}</mosID><ncsID>{ncs}</ncsID><messageID>{mid}</messageID><roAck><roID>{roid}</roID><roStatus>{st}</roStatus></roAck></mos>"#,
        mos = xml_escape(mos_id),
        ncs = xml_escape(ncs_id),
        mid = xml_escape(message_id),
        roid = xml_escape(ro_id),
        st = xml_escape(status),
    );
    let mut out = xml.into_bytes();
    out.push(0);
    out
}

/// Phase 10.2: build a `roItemCue` message signalling "this cue is going
/// to air". Fired when the operator takes a rundown item whose external
/// id starts with `mos:`. See docs/PHASE10_2_DESIGN.md for the
/// story-vs-item disclaimer.
pub fn build_ro_item_cue(
    message_id: &str,
    mos_id: &str,
    ncs_id: &str,
    ro_id: &str,
    story_id: &str,
) -> Vec<u8> {
    let xml = format!(
        r#"<mos><mosID>{mos}</mosID><ncsID>{ncs}</ncsID><messageID>{mid}</messageID><roItemCue><roID>{roid}</roID><storyID>{sid}</storyID></roItemCue></mos>"#,
        mos = xml_escape(mos_id),
        ncs = xml_escape(ncs_id),
        mid = xml_escape(message_id),
        roid = xml_escape(ro_id),
        sid = xml_escape(story_id),
    );
    let mut out = xml.into_bytes();
    out.push(0);
    out
}

// ---------------------------------------------------------------------------
// Persisted settings + Tauri commands
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct MosSettingsFile {
    #[serde(skip_serializing_if = "Option::is_none")]
    listen_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    our_mos_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    expected_ncs_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    enabled: Option<bool>,
}

fn settings_path(assets_dir: &Path) -> PathBuf {
    assets_dir.parent().unwrap_or(assets_dir).join("mos_settings.json")
}

fn load_settings(assets_dir: &Path) -> MosSettingsFile {
    std::fs::read_to_string(settings_path(assets_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_settings(assets_dir: &Path, settings: &MosSettingsFile) -> Result<(), String> {
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(settings_path(assets_dir), json).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MosStatus {
    pub enabled: bool,
    pub listen_port: u16,
    pub our_mos_id: String,
    pub expected_ncs_id: Option<String>,
}

const DEFAULT_PORT: u16 = 10540;
const DEFAULT_MOS_ID: &str = "bge.local";

#[tauri::command]
pub fn get_mos_status(state: tauri::State<crate::AssetDirState>) -> MosStatus {
    let s = load_settings(&state.assets_dir);
    MosStatus {
        enabled: s.enabled.unwrap_or(false),
        listen_port: s.listen_port.unwrap_or(DEFAULT_PORT),
        our_mos_id: s.our_mos_id.unwrap_or_else(|| DEFAULT_MOS_ID.to_string()),
        expected_ncs_id: s.expected_ncs_id,
    }
}

#[tauri::command]
pub fn set_mos_config(
    listen_port: u16,
    our_mos_id: String,
    expected_ncs_id: Option<String>,
    enabled: bool,
    state: tauri::State<crate::AssetDirState>,
) -> Result<(), String> {
    let our_mos_id = our_mos_id.trim().to_string();
    if our_mos_id.is_empty() {
        return Err("MOS ID cannot be empty".into());
    }
    if listen_port == 0 {
        return Err("listen port must be > 0".into());
    }
    save_settings(
        &state.assets_dir,
        &MosSettingsFile {
            listen_port: Some(listen_port),
            our_mos_id: Some(our_mos_id),
            expected_ncs_id: expected_ncs_id.filter(|s| !s.trim().is_empty()),
            enabled: Some(enabled),
        },
    )
}

// ---------------------------------------------------------------------------
// Phase 10.1 — TCP listener (server)
// ---------------------------------------------------------------------------

/// Cap per connection to catch a broken NRCS that floods. The automation
/// engine uses the same rolling-window primitive; the number here is
/// higher because MOS heartbeats can legitimately reach ~10Hz on a busy
/// rundown and we shouldn't refuse them.
const MAX_MSGS_PER_SEC: usize = 100;
/// Maximum concurrent NRCS connections. MOS isn't a public service —
/// a small station has one NCS, not four. This is a defense in depth
/// against a rogue port scanner, not a real limit.
const MAX_CONCURRENT: usize = 4;
/// Guard against a malformed message that never terminates. Real MOS
/// messages fit well under this.
const MAX_FRAME_BYTES: usize = 128 * 1024;

/// Runtime handle for the running listener — dropping this cancels the
/// accept loop (its `Notify` is triggered on shutdown). Stored in Tauri
/// state so the restart command can swap it atomically.
///
/// Phase 10.2: `outbound_tx` is the broadcast sender live connections
/// subscribe to. Every subscribed writer forwards each published frame
/// to its socket, so `send_mos_item_cue` reaches every NCS at once.
pub struct MosServerHandle {
    shutdown: Arc<Notify>,
    outbound_tx: tokio::sync::broadcast::Sender<Vec<u8>>,
    our_mos_id: String,
    /// Most recently seen `roID` from an inbound MOS message. Populated
    /// on every parseable message; read by `send_mos_item_cue` so the
    /// JS side can pass `story_id` alone. Not perfect if the operator
    /// juggles two NCSes with different rundowns simultaneously, but
    /// that's not a real workflow — same-rundown as the last-inbound
    /// is the operator's mental model.
    last_ro_id: Arc<Mutex<Option<String>>>,
    /// Monotonic message id for BGE-originated frames. Starts at 7000 to
    /// avoid overlapping the small integers NCS typically uses. Wraps
    /// at u32::MAX which we'll never realistically reach.
    next_msg_id: Arc<std::sync::atomic::AtomicU32>,
}

pub type MosServerState = Arc<Mutex<Option<MosServerHandle>>>;

/// Emitted payload for a `mos:message` Tauri event. The JS side pattern-
/// matches on `role` and interprets `data` accordingly.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MosMessageEvent {
    pub role: String,
    pub message_id: String,
    pub ro_id: Option<String>,
    /// The full parsed message, serialized as JSON per `MosMessage`'s
    /// `#[serde(rename_all = "camelCase")]` shape.
    pub data: serde_json::Value,
}

fn role_of(msg: &MosMessage) -> &'static str {
    match msg {
        MosMessage::Heartbeat { .. } => "heartbeat",
        MosMessage::MosId { .. } => "mosID",
        MosMessage::RoCreate { .. } => "roCreate",
        MosMessage::RoStorySend { .. } => "roStorySend",
        MosMessage::RoStoryDelete { .. } => "roStoryDelete",
        MosMessage::RoStoryInsert { .. } => "roStoryInsert",
        MosMessage::RoStoryMove { .. } => "roStoryMove",
        MosMessage::RoDelete { .. } => "roDelete",
        MosMessage::Unhandled { .. } => "unhandled",
    }
}

fn ro_id_of(msg: &MosMessage) -> Option<String> {
    match msg {
        MosMessage::RoCreate { ro_id, .. }
        | MosMessage::RoStorySend { ro_id, .. }
        | MosMessage::RoStoryDelete { ro_id, .. }
        | MosMessage::RoStoryInsert { ro_id, .. }
        | MosMessage::RoStoryMove { ro_id, .. }
        | MosMessage::RoDelete { ro_id, .. } => Some(ro_id.clone()),
        _ => None,
    }
}

fn message_id_of(msg: &MosMessage) -> String {
    match msg {
        MosMessage::Heartbeat { message_id }
        | MosMessage::MosId { message_id, .. }
        | MosMessage::RoCreate { message_id, .. }
        | MosMessage::RoStorySend { message_id, .. }
        | MosMessage::RoStoryDelete { message_id, .. }
        | MosMessage::RoStoryInsert { message_id, .. }
        | MosMessage::RoStoryMove { message_id, .. }
        | MosMessage::RoDelete { message_id, .. }
        | MosMessage::Unhandled { message_id, .. } => message_id.clone(),
    }
}

/// Per-connection rate limiter. Rolling 1-second window with a hard cap.
/// A malformed NRCS that floods gets its connection dropped rather than
/// being allowed to burn CPU parsing.
struct RateWindow {
    timestamps: std::collections::VecDeque<std::time::Instant>,
}
impl RateWindow {
    fn new() -> Self {
        Self { timestamps: std::collections::VecDeque::with_capacity(MAX_MSGS_PER_SEC + 8) }
    }
    fn check_and_record(&mut self) -> bool {
        let now = std::time::Instant::now();
        let window_start = now - std::time::Duration::from_secs(1);
        while let Some(&t) = self.timestamps.front() {
            if t < window_start {
                self.timestamps.pop_front();
            } else {
                break;
            }
        }
        if self.timestamps.len() >= MAX_MSGS_PER_SEC {
            return false;
        }
        self.timestamps.push_back(now);
        true
    }
}

async fn handle_connection(
    mut stream: tokio::net::TcpStream,
    peer: std::net::SocketAddr,
    our_mos_id: String,
    ncs_display_id: Arc<Mutex<String>>,
    expected_ncs_id: Option<String>,
    outbound_rx: tokio::sync::broadcast::Receiver<Vec<u8>>,
    last_ro_id: Arc<Mutex<Option<String>>>,
    app: AppHandle,
) {
    let (mut reader, mut writer) = stream.split();
    let mut buf = Vec::with_capacity(4096);
    let mut chunk = [0u8; 4096];
    let mut rate = RateWindow::new();
    let mut outbound_rx = outbound_rx;

    loop {
        tokio::select! {
            // Outbound broadcast — forward every published frame to this
            // socket. A single receiver going Lagged (a slow NCS falling
            // behind) skips ahead to the newest frame, matching the
            // semantics we want (as-run signals reflect the operator's
            // latest take, not a stale one).
            outbound = outbound_rx.recv() => match outbound {
                Ok(frame) => {
                    if let Err(e) = writer.write_all(&frame).await {
                        eprintln!("mos: outbound write to {peer} failed: {e}");
                        return;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    eprintln!("mos: {peer} lagged {n} outbound frames — skipping ahead");
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    // The server is shutting down; other side of select
                    // will handle it.
                }
            },

            // Inbound bytes from the NCS.
            read = reader.read(&mut chunk) => {
                let n = match read {
                    Ok(0) => {
                        eprintln!("mos: {peer} closed connection");
                        return;
                    }
                    Ok(n) => n,
                    Err(e) => {
                        eprintln!("mos: read from {peer} failed: {e}");
                        return;
                    }
                };
                buf.extend_from_slice(&chunk[..n]);
                if buf.len() > MAX_FRAME_BYTES {
                    eprintln!("mos: {peer} frame exceeded {MAX_FRAME_BYTES} bytes without terminator; dropping");
                    return;
                }

                while let Some(pos) = buf.iter().position(|&b| b == 0) {
                    let frame: Vec<u8> = buf.drain(..=pos).collect();
                    let payload = &frame[..frame.len() - 1]; // strip trailing \x00

                    if !rate.check_and_record() {
                        eprintln!("mos: {peer} exceeded {MAX_MSGS_PER_SEC} msg/sec — dropping connection");
                        return;
                    }

                    let msg = match parse_mos_message(payload) {
                        Ok(m) => m,
                        Err(e) => {
                            eprintln!("mos: parse error from {peer}: {e}");
                            continue;
                        }
                    };

                    // Heartbeat: ACK inline.
                    if let MosMessage::Heartbeat { message_id } = &msg {
                        let ack = build_heartbeat_ack(message_id, &our_mos_id, "");
                        if let Err(e) = writer.write_all(&ack).await {
                            eprintln!("mos: heartbeat ACK to {peer} failed: {e}");
                            return;
                        }
                        continue;
                    }

                    // MosID handshake: remember the connection's ncsID
                    // so outbound frames carry the right value; reject if
                    // it doesn't match an operator-configured expectation.
                    if let MosMessage::MosId { ncs_id, .. } = &msg {
                        if let Some(expected) = &expected_ncs_id {
                            if ncs_id != expected {
                                eprintln!(
                                    "mos: {peer} MosID ncsID '{ncs_id}' does not match expected '{expected}' — closing"
                                );
                                return;
                            }
                        }
                        if let Ok(mut guard) = ncs_display_id.lock() {
                            *guard = ncs_id.clone();
                        }
                    }

                    // Phase 10.2: auto-ACK every message that carried a
                    // parseable roID. Silent for messages without an roID
                    // (mosID handshake, unhandled meta) — nothing to ack.
                    if let Some(ro_id) = ro_id_of(&msg) {
                        if let Ok(mut guard) = last_ro_id.lock() {
                            *guard = Some(ro_id.clone());
                        }
                        let ncs_display = ncs_display_id
                            .lock()
                            .ok()
                            .map(|g| g.clone())
                            .unwrap_or_default();
                        let ack = build_ro_ack(
                            &message_id_of(&msg),
                            &our_mos_id,
                            &ncs_display,
                            &ro_id,
                            "OK",
                        );
                        if let Err(e) = writer.write_all(&ack).await {
                            eprintln!("mos: roAck to {peer} failed: {e}");
                            return;
                        }
                    }

                    let event = MosMessageEvent {
                        role: role_of(&msg).to_string(),
                        message_id: message_id_of(&msg),
                        ro_id: ro_id_of(&msg),
                        data: serde_json::to_value(&msg).unwrap_or(serde_json::Value::Null),
                    };
                    if let Err(e) = app.emit("mos:message", event) {
                        eprintln!("mos: emit failed: {e}");
                    }
                }
            }
        }
    }
}

/// Spawn the MOS TCP listener. Returns an `MosServerHandle` whose `Drop`
/// (via the Notify) cancels the accept loop and terminates all live
/// connections.
pub async fn spawn_mos_server(app: AppHandle, settings: MosSettingsFile) -> Result<MosServerHandle, String> {
    let port = settings.listen_port.unwrap_or(DEFAULT_PORT);
    let our_mos_id = settings.our_mos_id.unwrap_or_else(|| DEFAULT_MOS_ID.to_string());
    let expected_ncs_id = settings.expected_ncs_id.filter(|s| !s.trim().is_empty());

    let addr = format!("0.0.0.0:{port}");
    let listener = TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("failed to bind {addr}: {e}"))?;
    eprintln!("mos: listening on {addr} (our_mos_id={our_mos_id})");

    let shutdown = Arc::new(Notify::new());
    let shutdown_signal = shutdown.clone();
    // Capacity 32 — as-run signals fire once per operator take, well
    // under 32/sec even in aggressive playout; Lagged just skips ahead.
    let (outbound_tx, _) = tokio::sync::broadcast::channel::<Vec<u8>>(32);
    let outbound_for_accept = outbound_tx.clone();
    let last_ro_id: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let last_ro_id_for_accept = last_ro_id.clone();
    let next_msg_id = Arc::new(std::sync::atomic::AtomicU32::new(7000));
    let our_mos_id_for_handle = our_mos_id.clone();

    tokio::spawn(async move {
        let live = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        loop {
            tokio::select! {
                _ = shutdown_signal.notified() => {
                    eprintln!("mos: shutdown requested, accept loop exiting");
                    return;
                }
                accept = listener.accept() => {
                    match accept {
                        Ok((stream, peer)) => {
                            let n = live.load(std::sync::atomic::Ordering::Relaxed);
                            if n >= MAX_CONCURRENT {
                                eprintln!("mos: refusing {peer} — at max {MAX_CONCURRENT} connections");
                                drop(stream);
                                continue;
                            }
                            live.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                            let live_clone = live.clone();
                            let our_mos_id = our_mos_id.clone();
                            let expected = expected_ncs_id.clone();
                            let app_h = app.clone();
                            let outbound_rx = outbound_for_accept.subscribe();
                            let last_ro_id_conn = last_ro_id_for_accept.clone();
                            // Per-connection display copy of the ncsID
                            // for outbound frames (filled in on the mosID
                            // handshake).
                            let ncs_display = Arc::new(Mutex::new(String::new()));
                            tokio::spawn(async move {
                                eprintln!("mos: {peer} connected");
                                handle_connection(
                                    stream, peer, our_mos_id, ncs_display, expected,
                                    outbound_rx, last_ro_id_conn, app_h,
                                ).await;
                                live_clone.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
                            });
                        }
                        Err(e) => {
                            eprintln!("mos: accept failed: {e}");
                            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                        }
                    }
                }
            }
        }
    });

    Ok(MosServerHandle {
        shutdown,
        outbound_tx,
        our_mos_id: our_mos_id_for_handle,
        last_ro_id,
        next_msg_id,
    })
}

/// Startup path: read settings, spawn if enabled. Called once from
/// `.setup()` in lib.rs. Never panics — a bind failure or missing settings
/// just leaves the server not-running, which shows up in the panel.
pub fn maybe_start_mos_server(app: AppHandle, assets_dir: &Path, state: MosServerState) {
    let settings = load_settings(assets_dir);
    if !settings.enabled.unwrap_or(false) {
        eprintln!("mos: not enabled in settings; server not started");
        return;
    }
    let app_h = app.clone();
    tauri::async_runtime::spawn(async move {
        match spawn_mos_server(app_h, settings).await {
            Ok(handle) => {
                if let Ok(mut guard) = state.lock() {
                    *guard = Some(handle);
                }
            }
            Err(e) => eprintln!("mos: server failed to start: {e}"),
        }
    });
}

/// Phase 10.2: send an outbound `roItemCue` to every active MOS
/// connection. `ro_id` may be empty — in that case we substitute the
/// last-seen inbound roID (which is the operator's mental model, "same
/// rundown as the last one that came in").
///
/// Returns `true` if at least one connection was subscribed at the moment
/// the frame was published. Never errors on "no listeners" — that's the
/// honest behavior of an as-run feed with nobody plugged in yet.
#[tauri::command]
pub fn send_mos_item_cue(
    ro_id: String,
    story_id: String,
    state: tauri::State<MosServerState>,
) -> Result<bool, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let Some(handle) = guard.as_ref() else {
        return Ok(false); // server not running — silent no-op
    };
    let effective_ro_id = if ro_id.trim().is_empty() {
        handle
            .last_ro_id
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .unwrap_or_default()
    } else {
        ro_id
    };
    if effective_ro_id.is_empty() || story_id.trim().is_empty() {
        return Err("ro_id and story_id are required".into());
    }
    let msg_id = handle
        .next_msg_id
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let frame = build_ro_item_cue(
        &msg_id.to_string(),
        &handle.our_mos_id,
        "",
        &effective_ro_id,
        &story_id,
    );
    // send() returns Ok(usize) with the number of active receivers, or
    // Err when there are none — we translate that into a bool for the
    // caller and never propagate as an error.
    match handle.outbound_tx.send(frame) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Restart the listener with the currently-persisted settings. Called by
/// the operator's Restart button after saving new settings.
#[tauri::command]
pub async fn restart_mos_server(
    app: AppHandle,
    state: tauri::State<'_, MosServerState>,
    assets_state: tauri::State<'_, crate::AssetDirState>,
) -> Result<bool, String> {
    // Drop any existing handle first — this fires the shutdown Notify and
    // the accept loop exits. Live connections finish their current frame
    // and then find the socket closed.
    if let Ok(mut guard) = state.lock() {
        if let Some(handle) = guard.take() {
            handle.shutdown.notify_waiters();
        }
    }
    // Give the OS a moment to release the port. Not fully waterproof
    // against SO_REUSEADDR races on Windows; a real production listener
    // would poll for release. Fine for a single-operator workflow.
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    let settings = load_settings(&assets_state.assets_dir);
    if !settings.enabled.unwrap_or(false) {
        return Ok(false); // honestly reported "off"
    }
    match spawn_mos_server(app, settings).await {
        Ok(handle) => {
            if let Ok(mut guard) = state.lock() {
                *guard = Some(handle);
            }
            Ok(true)
        }
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEARTBEAT_XML: &[u8] = br#"<mos>
        <mosID>bge.studio</mosID>
        <ncsID>NCS1</ncsID>
        <messageID>12345</messageID>
        <heartbeat><time>2026-07-11T18:00:00</time></heartbeat>
    </mos>"#;

    const RO_CREATE_XML: &[u8] = br#"<mos>
        <mosID>bge.studio</mosID>
        <ncsID>NCS1</ncsID>
        <messageID>77</messageID>
        <roCreate>
            <roID>RO001</roID>
            <roSlug>6PM News</roSlug>
            <story>
                <storyID>STORY01</storyID>
                <storySlug>Cold Open</storySlug>
                <storyDuration>15</storyDuration>
            </story>
            <story>
                <storyID>STORY02</storyID>
                <storySlug>Live report</storySlug>
                <storyDuration>120</storyDuration>
            </story>
        </roCreate>
    </mos>"#;

    const RO_STORY_DELETE_XML: &[u8] = br#"<mos>
        <mosID>bge.studio</mosID>
        <ncsID>NCS1</ncsID>
        <messageID>78</messageID>
        <roStoryDelete>
            <roID>RO001</roID>
            <storyID>STORY01</storyID>
            <storyID>STORY02</storyID>
        </roStoryDelete>
    </mos>"#;

    const RO_DELETE_XML: &[u8] = br#"<mos>
        <mosID>bge.studio</mosID>
        <ncsID>NCS1</ncsID>
        <messageID>99</messageID>
        <roDelete>
            <roID>RO001</roID>
        </roDelete>
    </mos>"#;

    #[test]
    fn parses_heartbeat() {
        let m = parse_mos_message(HEARTBEAT_XML).unwrap();
        assert_eq!(m, MosMessage::Heartbeat { message_id: "12345".to_string() });
    }

    #[test]
    fn parses_ro_create_with_two_stories() {
        let m = parse_mos_message(RO_CREATE_XML).unwrap();
        match m {
            MosMessage::RoCreate { ro_id, ro_slug, stories, message_id } => {
                assert_eq!(ro_id, "RO001");
                assert_eq!(ro_slug, "6PM News");
                assert_eq!(message_id, "77");
                assert_eq!(stories.len(), 2);
                assert_eq!(stories[0].id, "STORY01");
                assert_eq!(stories[0].slug, "Cold Open");
                assert_eq!(stories[0].duration_sec, 15);
                assert_eq!(stories[1].id, "STORY02");
                assert_eq!(stories[1].duration_sec, 120);
            }
            other => panic!("expected RoCreate, got {other:?}"),
        }
    }

    #[test]
    fn parses_ro_story_delete_with_multiple_ids() {
        let m = parse_mos_message(RO_STORY_DELETE_XML).unwrap();
        match m {
            MosMessage::RoStoryDelete { ro_id, story_ids, .. } => {
                assert_eq!(ro_id, "RO001");
                assert_eq!(story_ids, vec!["STORY01".to_string(), "STORY02".to_string()]);
            }
            other => panic!("expected RoStoryDelete, got {other:?}"),
        }
    }

    #[test]
    fn parses_ro_delete() {
        let m = parse_mos_message(RO_DELETE_XML).unwrap();
        match m {
            MosMessage::RoDelete { ro_id, .. } => assert_eq!(ro_id, "RO001"),
            other => panic!("expected RoDelete, got {other:?}"),
        }
    }

    #[test]
    fn heartbeat_ack_has_null_terminator() {
        let ack = build_heartbeat_ack("42", "bge.studio", "NCS1");
        assert_eq!(*ack.last().unwrap(), 0u8, "must end with MOS \\x00 message terminator");
        let body = std::str::from_utf8(&ack[..ack.len() - 1]).unwrap();
        assert!(body.contains("<messageID>42</messageID>"));
        assert!(body.contains("<mosID>bge.studio</mosID>"));
        assert!(body.contains("<heartbeat>"));
    }

    #[test]
    fn malformed_xml_returns_error_not_panic() {
        let bad = b"<mos><messageID>1</message"; // truncated
        let result = parse_mos_message(bad);
        assert!(result.is_err(), "expected parse error, got {result:?}");
    }

    #[test]
    fn unhandled_role_flagged_not_dropped() {
        let xml = br#"<mos>
            <mosID>bge</mosID>
            <ncsID>ncs</ncsID>
            <messageID>1</messageID>
            <roItemInsert><roID>RO1</roID></roItemInsert>
        </mos>"#;
        let m = parse_mos_message(xml).unwrap();
        match m {
            MosMessage::Unhandled { role_name, message_id } => {
                assert_eq!(role_name, "roItemInsert");
                assert_eq!(message_id, "1");
            }
            other => panic!("expected Unhandled, got {other:?}"),
        }
    }

    #[test]
    fn duration_defaults_to_30_when_missing() {
        let xml = br#"<mos>
            <mosID>bge</mosID><ncsID>ncs</ncsID><messageID>1</messageID>
            <roCreate>
                <roID>R</roID><roSlug>S</roSlug>
                <story><storyID>S1</storyID><storySlug>slug</storySlug></story>
            </roCreate>
        </mos>"#;
        let m = parse_mos_message(xml).unwrap();
        if let MosMessage::RoCreate { stories, .. } = m {
            assert_eq!(stories[0].duration_sec, 30);
        } else {
            panic!("expected RoCreate");
        }
    }

    // Phase 10.2 — outbound builder tests.

    #[test]
    fn ro_ack_has_null_terminator_and_status() {
        let bytes = build_ro_ack("42", "bge.local", "NCS1", "RO001", "OK");
        assert_eq!(*bytes.last().unwrap(), 0u8);
        let s = std::str::from_utf8(&bytes[..bytes.len() - 1]).unwrap();
        assert!(s.contains("<messageID>42</messageID>"));
        assert!(s.contains("<mosID>bge.local</mosID>"));
        assert!(s.contains("<ncsID>NCS1</ncsID>"));
        assert!(s.contains("<roAck>"));
        assert!(s.contains("<roID>RO001</roID>"));
        assert!(s.contains("<roStatus>OK</roStatus>"));
    }

    #[test]
    fn ro_ack_survives_parser_as_unhandled() {
        // Sanity: our own outbound frames are well-formed enough that the
        // inbound parser accepts them (a small station using two BGEs
        // would have one BGE receiving the other's roAck). roAck is not
        // a role we handle, so it lands as Unhandled — the point is that
        // parsing doesn't fail on our own emission.
        let bytes = build_ro_ack("42", "bge.local", "NCS1", "RO001", "OK");
        let payload = &bytes[..bytes.len() - 1];
        let m = parse_mos_message(payload).expect("valid XML from our builder");
        match m {
            MosMessage::Unhandled { role_name, .. } => assert_eq!(role_name, "roAck"),
            other => panic!("expected Unhandled('roAck'), got {other:?}"),
        }
    }

    #[test]
    fn ro_item_cue_has_null_terminator_and_fields() {
        let bytes = build_ro_item_cue("7001", "bge.local", "NCS1", "RO001", "STORY01");
        assert_eq!(*bytes.last().unwrap(), 0u8);
        let s = std::str::from_utf8(&bytes[..bytes.len() - 1]).unwrap();
        assert!(s.contains("<messageID>7001</messageID>"));
        assert!(s.contains("<roItemCue>"));
        assert!(s.contains("<roID>RO001</roID>"));
        assert!(s.contains("<storyID>STORY01</storyID>"));
    }

    #[test]
    fn ro_item_cue_survives_parser_as_unhandled() {
        let bytes = build_ro_item_cue("7002", "bge.local", "NCS1", "RO001", "STORY_XYZ");
        let payload = &bytes[..bytes.len() - 1];
        let m = parse_mos_message(payload).expect("valid XML");
        match m {
            MosMessage::Unhandled { role_name, .. } => assert_eq!(role_name, "roItemCue"),
            other => panic!("expected Unhandled('roItemCue'), got {other:?}"),
        }
    }

    #[test]
    fn xml_escape_covers_wire_hostile_chars() {
        assert_eq!(xml_escape("a & b"), "a &amp; b");
        assert_eq!(xml_escape("<x>"), "&lt;x&gt;");
        assert_eq!(xml_escape("she said \"hi\""), "she said &quot;hi&quot;");
        assert_eq!(xml_escape("it's ok"), "it&apos;s ok");
    }

    #[test]
    fn ro_ack_escapes_status_and_ids() {
        // A slug with an ampersand (real: "Story A & B") must not
        // invalidate the XML emitted for it — the parser round-trip is
        // proof.
        let bytes = build_ro_ack("1", "bge", "NCS", "RO&1", "OK");
        let payload = &bytes[..bytes.len() - 1];
        assert!(parse_mos_message(payload).is_ok(), "escaped roID parses");
    }

    #[test]
    fn ro_story_insert_target_and_payload() {
        let xml = br#"<mos>
            <mosID>bge</mosID><ncsID>ncs</ncsID><messageID>1</messageID>
            <roStoryInsert>
                <roID>RO001</roID>
                <storyID>TARGET_STORY</storyID>
                <story>
                    <storyID>NEW_STORY</storyID>
                    <storySlug>Inserted</storySlug>
                    <storyDuration>45</storyDuration>
                </story>
            </roStoryInsert>
        </mos>"#;
        let m = parse_mos_message(xml).unwrap();
        match m {
            MosMessage::RoStoryInsert { target_id, stories, ro_id, .. } => {
                assert_eq!(ro_id, "RO001");
                assert_eq!(target_id, Some("TARGET_STORY".to_string()));
                assert_eq!(stories.len(), 1);
                assert_eq!(stories[0].id, "NEW_STORY");
                assert_eq!(stories[0].duration_sec, 45);
            }
            other => panic!("expected RoStoryInsert, got {other:?}"),
        }
    }
}
