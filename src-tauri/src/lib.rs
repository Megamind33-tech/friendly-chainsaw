mod capture;
mod control_server;
mod mos;
mod ndi;
mod record;
mod rundowncloud;
mod spout;
mod status;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};
use base64::Engine;

const OUTPUT_SERVER_ADDR: &str = "127.0.0.1:4977";

/// Current envelope JSON (`{project, programSceneId, previewSceneId,
/// layerPlayback}`), pushed by the Control Room on every autosave/Take/Cut/
/// Play-In-Out (see `set_program_document`) and read by both `/document`
/// (fetched in-app by ProgramView/PreviewView) and `/program` (rendered
/// server-side for OBS Browser Source). This mutex is still the source of
/// truth for late-joining clients (a fresh `/document` GET, or a
/// `/document/stream` connection's initial event); `DocBroadcast` below is
/// the live push on top of it.
type ProgramDocState = Arc<Mutex<String>>;

/// Broadcasts every new document string the instant `set_program_document`
/// is called, so `/document/stream` subscribers (ProgramView, PreviewView)
/// see a Play In/Out command with real (sub-millisecond, loopback) latency
/// instead of waiting for their next poll tick. `set_program_document`
/// sends on this after updating `ProgramDocState`; `/document/stream`
/// subscribes to it and forwards every message verbatim. A `send` with
/// zero active receivers
/// (e.g. no Program/Preview window open yet) is not an error — the state
/// still lives in `ProgramDocState` for the next client to fetch fresh.
type DocBroadcast = Arc<tokio::sync::broadcast::Sender<String>>;

#[derive(Clone)]
pub(crate) struct AssetDirState {
    pub(crate) assets_dir: PathBuf,
}

#[derive(Clone)]
struct AppState {
    doc: ProgramDocState,
    doc_broadcast: DocBroadcast,
    stats: Arc<Mutex<status::RequestStats>>,
    ndi: Arc<dyn ndi::NdiOutput>,
    /// Where imported 3D model binaries live on disk (Phase 5). Uploaded via
    /// `POST /assets` straight from the Control Room's fetch — deliberately
    /// not Tauri IPC, which JSON-serializes and chokes on multi-MB binaries.
    assets_dir: PathBuf,
    /// Candidate directories containing the built Vite app. OBS cannot load
    /// Tauri's internal app protocol, so packaged `/program` serves the same
    /// React bundle from the sidecar.
    frontend_roots: Vec<PathBuf>,
}

#[allow(dead_code)]
fn render_element_html(el: &serde_json::Value) -> String {
    let visible = el.get("visible").and_then(|v| v.as_bool()).unwrap_or(true);
    if !visible {
        return String::new();
    }
    let kind = el.get("kind").and_then(|k| k.as_str()).unwrap_or("");
    let t = el.get("transform");
    let x = t.and_then(|t| t.get("x")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let y = t.and_then(|t| t.get("y")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let w = t.and_then(|t| t.get("width")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let h = t.and_then(|t| t.get("height")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let rot = t.and_then(|t| t.get("rotation")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let opacity = el.get("opacity").and_then(|v| v.as_f64()).unwrap_or(1.0);

    match kind {
        "rect" => {
            let fill = el.get("fill").and_then(|v| v.as_str()).unwrap_or("#cccccc");
            let radius = el.get("cornerRadius").and_then(|v| v.as_f64()).unwrap_or(0.0);
            format!(
                r#"<div class="el" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;transform:rotate({rot}deg);opacity:{opacity};background:{fill};border-radius:{radius}px;"></div>"#
            )
        }
        "text" => {
            let text = el.get("text").and_then(|v| v.as_str()).unwrap_or("");
            let font_size = el.get("fontSize").and_then(|v| v.as_f64()).unwrap_or(16.0);
            let font_family = el.get("fontFamily").and_then(|v| v.as_str()).unwrap_or("sans-serif");
            let fill = el.get("fill").and_then(|v| v.as_str()).unwrap_or("#ffffff");
            let align = el.get("align").and_then(|v| v.as_str()).unwrap_or("left");
            let escaped = text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
            format!(
                r#"<div class="el" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;transform:rotate({rot}deg);opacity:{opacity};color:{fill};font-family:'{font_family}',sans-serif;font-size:{font_size}px;text-align:{align};">{escaped}</div>"#
            )
        }
        // image/group rendering lands with the asset pipeline / group
        // support in a later phase — Phase 1's DoD only needs rect+text.
        _ => String::new(),
    }
}

/// A parsed `/document` envelope. `program_scene_id`/`preview_scene_id` are
/// `None` for a stale, un-migrated bare-Project blob (Phase 1 shape) —
/// callers fall back to `scenes[0]` in that case.
struct DocEnvelope {
    project: serde_json::Value,
    #[allow(dead_code)]
    program_scene_id: Option<String>,
}

fn parse_envelope(doc_json: &str) -> Option<DocEnvelope> {
    let value = serde_json::from_str::<serde_json::Value>(doc_json).ok()?;
    if value.is_null() {
        return None;
    }
    if let Some(project) = value.get("project") {
        Some(DocEnvelope {
            project: project.clone(),
            program_scene_id: value.get("programSceneId").and_then(|v| v.as_str()).map(String::from),
        })
    } else if value.get("scenes").is_some() {
        // Back-compat: Phase 1 pushed a bare Project, no envelope wrapper.
        Some(DocEnvelope { project: value, program_scene_id: None })
    } else {
        None
    }
}

#[allow(dead_code)]
fn select_scene<'a>(project: &'a serde_json::Value, scene_id: Option<&str>) -> Option<&'a serde_json::Value> {
    let scenes = project.get("scenes")?.as_array()?;
    if let Some(id) = scene_id {
        if let Some(found) = scenes.iter().find(|s| s.get("id").and_then(|v| v.as_str()) == Some(id)) {
            return Some(found);
        }
    }
    scenes.first()
}

/// Server-side snapshot render of the program scene's visible gfx2d
/// layers, driven entirely by the live document JSON. Deliberately not
/// pixel-identical to the Konva renderer; it exists so OBS has something
/// real to point at ahead of a proper video pipeline (Phase 8). Also
/// injects a small same-origin heartbeat loop hitting `/program/tick` at
/// the project's fps — this is the actual liveness signal, since OBS's
/// Browser Source is a static CEF page load and never re-fetches
/// `/program` on its own.
#[allow(dead_code)]
fn render_document_html(project: &serde_json::Value, scene_id: Option<&str>) -> String {
    let fps = project.get("fps").and_then(|v| v.as_f64()).filter(|f| *f > 0.0).unwrap_or(30.0);
    let interval_ms = 1000.0 / fps;

    let mut body = String::new();
    if let Some(scene) = select_scene(project, scene_id) {
        if let Some(layers) = scene.get("layers").and_then(|l| l.as_array()) {
            let mut sorted: Vec<&serde_json::Value> = layers.iter().collect();
            sorted.sort_by_key(|l| l.get("zIndex").and_then(|z| z.as_i64()).unwrap_or(0));
            for layer in sorted {
                let visible = layer.get("visible").and_then(|v| v.as_bool()).unwrap_or(true);
                let kind = layer.get("kind").and_then(|k| k.as_str()).unwrap_or("");
                if !visible || kind != "gfx2d" {
                    continue;
                }
                let Some(elements) = layer
                    .get("props")
                    .and_then(|p| p.get("elements"))
                    .and_then(|e| e.as_array())
                else {
                    continue;
                };
                for el in elements {
                    body.push_str(&render_element_html(el));
                }
            }
        }
    }

    format!(
        r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Program Output</title>
<style>
  html, body {{ margin: 0; padding: 0; width: 100vw; height: 100vh; background: transparent; overflow: hidden; position: relative; }}
  .el {{ position: absolute; box-sizing: border-box; }}
</style>
</head>
<body>{body}<script>
(function () {{
  setInterval(function () {{
    fetch('/program/tick').catch(function () {{}});
  }}, {interval_ms});
}})();
</script></body>
</html>
"#
    )
}

fn static_mime(file: &str) -> &'static str {
    match file.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn frontend_file(state: &AppState, rel: &str) -> Option<PathBuf> {
    let rel = rel.trim_start_matches('/').replace('\\', "/");
    if rel.contains("..") {
        return None;
    }
    state.frontend_roots.iter().map(|root| root.join(&rel)).find(|path| path.is_file())
}

fn program_index_html(state: &AppState) -> Result<String, String> {
    let index = frontend_file(state, "renderer.html")
        .or_else(|| frontend_file(state, "index.html"))
        .ok_or_else(|| "built renderer.html not found".to_string())?;
    let mut html = std::fs::read_to_string(&index).map_err(|e| format!("failed to read {}: {e}", index.display()))?;
    // Vite emits absolute `/assets/...` URLs. The sidecar already reserves
    // `/assets` for imported media/model/image files, so bundled app assets
    // are exposed through `/program-static`.
    html = html
        .replace("src=\"/assets/", "src=\"/program-static/assets/")
        .replace("href=\"/assets/", "href=\"/program-static/assets/")
        .replace("href=\"/vite.svg\"", "href=\"/program-static/vite.svg\"")
        .replace("href=\"/tauri.svg\"", "href=\"/program-static/tauri.svg\"");
    // `/program` is a normal path, but the SPA selects ProgramView via hash.
    // Run this before the module script so OBS opens directly on ProgramView.
    html = html.replace(
        "<body>",
        "<body><script>if(!location.hash){location.replace(location.pathname + location.search + '#/program');}</script>",
    );
    Ok(html)
}

/// OBS Browser Source entry point. Dev redirects to Vite's ProgramView; a
/// packaged app serves the built Vite SPA from the sidecar. Either way,
/// `/program` now uses the same React/Konva/R3F renderer as the in-app Program
/// window instead of the old Rust rect/text snapshot.
async fn program_handler(axum::extract::State(state): axum::extract::State<AppState>) -> axum::response::Response {
    use axum::response::IntoResponse;
    state.stats.lock().unwrap().record_hit();
    if cfg!(debug_assertions) {
        return axum::response::Redirect::temporary("http://localhost:1423/renderer.html#/program").into_response();
    }
    match program_index_html(&state) {
        Ok(html) => ([(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")], html).into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            CORS_HEADERS,
            format!("program frontend unavailable: {e}"),
        )
            .into_response(),
    }
}

async fn program_static_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::extract::Path(path): axum::extract::Path<String>,
) -> axum::response::Response {
    use axum::response::IntoResponse;
    let safe = path.trim_start_matches('/').replace('\\', "/");
    let Some(file) = frontend_file(&state, &safe) else {
        return (axum::http::StatusCode::NOT_FOUND, CORS_HEADERS).into_response();
    };
    match tokio::fs::read(&file).await {
        Ok(bytes) => (CORS_HEADERS, [(axum::http::header::CONTENT_TYPE, static_mime(&safe))], bytes).into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            CORS_HEADERS,
            format!("failed to read frontend asset: {e}"),
        )
            .into_response(),
    }
}

/// Hit by the heartbeat script injected into `/program` — the real signal
/// that a consumer (OBS's Browser Source) is actively displaying us, since
/// a CEF page load alone never re-requests `/program`.
async fn program_tick_handler(axum::extract::State(state): axum::extract::State<AppState>) -> axum::http::StatusCode {
    state.stats.lock().unwrap().record_hit();
    axum::http::StatusCode::OK
}

/// Real-time push: ProgramView/PreviewView connect here (via `EventSource`,
/// see useDocumentEnvelope.ts) instead of relying purely on polling
/// `/document`. A just-connected client gets the current snapshot as its
/// first event, then every subsequent `set_program_document` call is
/// forwarded verbatim the moment it happens — sub-millisecond on loopback,
/// versus the ~1000ms worst case the old pure-polling design had. That
/// latency is what made short (0.3-1.2s) authored animations "snap" instead
/// of visibly tween (see PLAN.md, 2026-07-07): the window's first frame of
/// a layer could already land after its whole tween window had elapsed.
///
/// Server-Sent Events, not WebSockets: the data only ever flows server ->
/// client, so a full duplex socket buys nothing here — and axum's "ws"
/// feature needs `tokio-tungstenite`, which this machine's network could
/// not fetch from crates.io at the time this was built (TLS revocation
/// check failure), while `tokio-stream` (used below) was already a cached
/// transitive dependency.
async fn document_stream_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> impl axum::response::IntoResponse {
    use axum::response::sse::{Event, KeepAlive, Sse};
    use tokio_stream::StreamExt;
    use tokio_stream::wrappers::BroadcastStream;

    let initial = state.doc.lock().unwrap().clone();
    let rx = state.doc_broadcast.subscribe();
    let updates = BroadcastStream::new(rx).filter_map(|msg| {
        // A slow client missed some intermediate frames (Lagged) — not
        // fatal, the next message it does get is still the latest state.
        msg.ok()
            .map(|doc| Ok::<Event, std::convert::Infallible>(Event::default().data(doc)))
    });
    let stream =
        tokio_stream::once(Ok::<Event, std::convert::Infallible>(Event::default().data(initial))).chain(updates);
    (CORS_HEADERS, Sse::new(stream).keep_alive(KeepAlive::default()))
}

/// Fetched in-app by ProgramView/PreviewView as a startup/fallback path (see
/// `document_stream_handler` for the real-time path). CORS is wide open
/// deliberately — this is a same-machine local dev tool, not a public
/// service. Returns the envelope as pushed, unmodified.
async fn document_handler(axum::extract::State(state): axum::extract::State<AppState>) -> impl axum::response::IntoResponse {
    let content = state.doc.lock().unwrap().clone();
    let value: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::Value::Null);
    (
        [(axum::http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")],
        axum::response::Json(value),
    )
}

/// Real health/liveness JSON, polled by the Control Room's Output panel
/// (~1s). `programState`/rates are computed entirely from measured
/// `/program` + `/program/tick` hits — see status.rs. `ndi` is always
/// honest about the stub being unavailable.
async fn status_handler(axum::extract::State(state): axum::extract::State<AppState>) -> impl axum::response::IntoResponse {
    let content = state.doc.lock().unwrap().clone();
    let expected_fps = parse_envelope(&content)
        .and_then(|env| env.project.get("fps").and_then(|v| v.as_f64()))
        .filter(|f| *f > 0.0)
        .unwrap_or(30.0);
    let snapshot = state.stats.lock().unwrap().snapshot(expected_fps);
    let ndi_status = state.ndi.status();
    let body = serde_json::json!({
        "programState": snapshot.program_state,
        "requestsPerSecond": snapshot.requests_per_second,
        "expectedFps": snapshot.expected_fps,
        "healthPct": snapshot.health_pct,
        "missedPullsProxy": snapshot.missed_pulls_proxy,
        "ndi": ndi_status,
    });
    (
        [(axum::http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")],
        axum::response::Json(body),
    )
}

/// Strips anything path-traversal-shaped out of a client-supplied name;
/// the stored file is always `<millis>-<sanitized>` directly in assets_dir.
fn sanitize_asset_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let trimmed = cleaned.trim_matches('.').to_string();
    if trimmed.is_empty() { "asset".to_string() } else { trimmed }
}

fn asset_mime(file: &str) -> &'static str {
    match file.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "glb" => "model/gltf-binary",
        "gltf" => "model/gltf+json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "json" | "lottie" => "application/json",
        _ => "application/octet-stream",
    }
}

const CORS_HEADERS: [(axum::http::HeaderName, &str); 3] = [
    (axum::http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
    (axum::http::header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, OPTIONS"),
    (axum::http::header::ACCESS_CONTROL_ALLOW_HEADERS, "content-type"),
];

/// CORS preflight for the cross-origin POST from the Control Room webview.
async fn asset_preflight_handler() -> impl axum::response::IntoResponse {
    (CORS_HEADERS, axum::http::StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
struct AssetUploadQuery {
    name: String,
}

#[derive(serde::Serialize)]
struct StoredAssetResponse {
    file: String,
    url: String,
    bytes: usize,
}

#[derive(serde::Deserialize)]
struct OpenAiImageData {
    b64_json: Option<String>,
}

#[derive(serde::Deserialize)]
struct OpenAiImageResponse {
    data: Vec<OpenAiImageData>,
}

/// AI image-gen settings (Rust-only file — this is the one thing that keeps
/// a real API key out of the web layer end to end). Lives next to the assets
/// dir (`<app_data_dir>/ai_settings.json`), never sent back to JS as
/// plaintext — only `get_ai_settings_status` reports a `configured` bool.
/// `OPENAI_API_KEY`/`OPENAI_IMAGE_MODEL` env vars still work as a fallback
/// (dev/CI convenience), but the stored file takes priority so an operator
/// can configure this from inside the running app, not just via env vars.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
struct AiSettingsFile {
    #[serde(skip_serializing_if = "Option::is_none")]
    openai_api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
}

fn ai_settings_path(assets_dir: &std::path::Path) -> std::path::PathBuf {
    assets_dir.parent().unwrap_or(assets_dir).join("ai_settings.json")
}

fn load_ai_settings(assets_dir: &std::path::Path) -> AiSettingsFile {
    std::fs::read_to_string(ai_settings_path(assets_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_ai_settings(assets_dir: &std::path::Path, settings: &AiSettingsFile) -> Result<(), String> {
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(ai_settings_path(assets_dir), json).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AiSettingsStatus {
    configured: bool,
    model: Option<String>,
}

#[tauri::command]
fn get_ai_settings_status(state: tauri::State<AssetDirState>) -> AiSettingsStatus {
    let settings = load_ai_settings(&state.assets_dir);
    let configured = settings.openai_api_key.as_deref().is_some_and(|k| !k.trim().is_empty())
        || std::env::var("OPENAI_API_KEY").is_ok_and(|v| !v.trim().is_empty());
    AiSettingsStatus { configured, model: settings.model }
}

#[tauri::command]
fn set_openai_api_key(key: String, model: Option<String>, state: tauri::State<AssetDirState>) -> Result<(), String> {
    let trimmed = key.trim().to_string();
    let settings = AiSettingsFile {
        openai_api_key: if trimmed.is_empty() { None } else { Some(trimmed) },
        model: model.map(|m| m.trim().to_string()).filter(|m| !m.is_empty()),
    };
    save_ai_settings(&state.assets_dir, &settings)
}

#[tauri::command]
fn clear_openai_api_key(state: tauri::State<AssetDirState>) -> Result<(), String> {
    save_ai_settings(&state.assets_dir, &AiSettingsFile::default())
}

async fn generate_ai_image_to_assets(
    assets_dir: &std::path::Path,
    prompt: &str,
    size: Option<String>,
    reference_url: Option<String>,
) -> Result<StoredAssetResponse, String> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err("prompt is required".into());
    }
    let size = size.unwrap_or_else(|| "1024x1024".to_string());
    match size.as_str() {
        "1024x1024" | "1024x1536" | "1536x1024" => {}
        _ => return Err(format!("unsupported image size: {size}")),
    }
    let stored_settings = load_ai_settings(assets_dir);
    let api_key = stored_settings
        .openai_api_key
        .filter(|k| !k.trim().is_empty())
        .or_else(|| std::env::var("OPENAI_API_KEY").ok().filter(|k| !k.trim().is_empty()))
        .ok_or_else(|| "no OpenAI API key configured — add one in AI Image settings".to_string())?;
    let model = stored_settings
        .model
        .filter(|m| !m.trim().is_empty())
        .or_else(|| std::env::var("OPENAI_IMAGE_MODEL").ok())
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| "gpt-image-2".to_string());
    let broadcast_prompt = format!(
        "Create a premium, high-fidelity broadcast television graphics asset. \
        It must look like a polished network package element: clean geometry, \
        refined lighting, crisp edges, realistic glass/metal/plastic material \
        response where appropriate, layered depth, subtle shadows, production-ready \
        finishing, no muddy textures, no fake text, no logos, no watermarks, \
        no low-resolution artifacts. Asset use: {prompt}"
    );
    let reference_url = reference_url.and_then(|u| {
        let trimmed = u.trim().to_string();
        if trimmed.is_empty() { None } else { Some(trimmed) }
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("failed to create OpenAI client: {e}"))?;
    let response = if let Some(url) = reference_url {
        let reference_response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("failed to fetch reference image: {e}"))?;
        if !reference_response.status().is_success() {
            return Err(format!(
                "failed to fetch reference image ({})",
                reference_response.status()
            ));
        }
        let content_type = reference_response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/png")
            .to_string();
        let reference_bytes = reference_response
            .bytes()
            .await
            .map_err(|e| format!("failed to read reference image: {e}"))?;
        let boundary = format!(
            "----broadcast-ai-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let mut form = Vec::new();
        fn push_form_field(body: &mut Vec<u8>, boundary: &str, name: &str, value: &str) {
            body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
            body.extend_from_slice(
                format!("Content-Disposition: form-data; name=\"{name}\"\r\n\r\n").as_bytes(),
            );
            body.extend_from_slice(value.as_bytes());
            body.extend_from_slice(b"\r\n");
        }
        push_form_field(&mut form, &boundary, "model", &model);
        push_form_field(&mut form, &boundary, "prompt", &broadcast_prompt);
        push_form_field(&mut form, &boundary, "size", &size);
        push_form_field(&mut form, &boundary, "quality", "high");
        push_form_field(&mut form, &boundary, "output_format", "png");
        form.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
        form.extend_from_slice(
            b"Content-Disposition: form-data; name=\"image[]\"; filename=\"reference.png\"\r\n",
        );
        form.extend_from_slice(format!("Content-Type: {content_type}\r\n\r\n").as_bytes());
        form.extend_from_slice(&reference_bytes);
        form.extend_from_slice(b"\r\n");
        form.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
        client
            .post("https://api.openai.com/v1/images/edits")
            .bearer_auth(api_key)
            .header(reqwest::header::ACCEPT_ENCODING, "identity")
            .header(
                reqwest::header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={boundary}"),
            )
            .body(form)
            .send()
            .await
    } else {
        let payload = serde_json::json!({
                "model": model,
                "prompt": broadcast_prompt,
                "size": size,
                "quality": "high",
                "output_format": "png",
                "n": 1
        });
        client
            .post("https://api.openai.com/v1/images/generations")
            .bearer_auth(api_key)
            .header(reqwest::header::ACCEPT_ENCODING, "identity")
            .json(&payload)
            .send()
            .await
    }
    .map_err(|e| format!("OpenAI image request failed: {e:?}"))?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let response_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("failed to read OpenAI response: {e}"))?;
    if !status.is_success() {
        let body = String::from_utf8_lossy(&response_bytes);
        return Err(format!("OpenAI image request failed ({status}): {body}"));
    }
    let bytes = if content_type.starts_with("image/") {
        response_bytes.to_vec()
    } else {
        let body = String::from_utf8_lossy(&response_bytes);
        let parsed: OpenAiImageResponse = serde_json::from_str(&body)
            .map_err(|e| format!("invalid OpenAI image response: {e}"))?;
        let b64 = parsed
            .data
            .first()
            .and_then(|d| d.b64_json.as_deref())
            .ok_or_else(|| "OpenAI image response did not include b64_json".to_string())?;
        base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| format!("invalid generated image data: {e}"))?
    };
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let file = format!("{millis}-ai-generated.png");
    let path = assets_dir.join(&file);
    tokio::fs::write(&path, &bytes)
        .await
        .map_err(|e| format!("failed to store generated image: {e}"))?;
    Ok(StoredAssetResponse {
        file: file.clone(),
        url: format!("http://{OUTPUT_SERVER_ADDR}/assets/{file}"),
        bytes: bytes.len(),
    })
}

#[tauri::command]
async fn generate_ai_image_asset(
    prompt: String,
    size: Option<String>,
    reference_url: Option<String>,
    state: tauri::State<'_, AssetDirState>,
) -> Result<StoredAssetResponse, String> {
    generate_ai_image_to_assets(&state.assets_dir, &prompt, size, reference_url).await
}

#[derive(serde::Deserialize)]
struct GenerateImageRequest {
    prompt: String,
    size: Option<String>,
    reference_url: Option<String>,
}

async fn asset_generate_image_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::Json(req): axum::Json<GenerateImageRequest>,
) -> axum::response::Response {
    use axum::response::IntoResponse;
    match generate_ai_image_to_assets(&state.assets_dir, &req.prompt, req.size, req.reference_url).await {
        Ok(asset) => (CORS_HEADERS, axum::Json(asset)).into_response(),
        Err(e) => (
            axum::http::StatusCode::BAD_REQUEST,
            CORS_HEADERS,
            e,
        )
            .into_response(),
    }
}

/// Stores an uploaded binary (3D model, image) on disk and returns its
/// serving URL. The document only ever persists this URL — binaries never
/// enter the SQLite JSON blob.
async fn asset_upload_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::extract::Query(query): axum::extract::Query<AssetUploadQuery>,
    body: axum::body::Bytes,
) -> impl axum::response::IntoResponse {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let file = format!("{millis}-{}", sanitize_asset_name(&query.name));
    let path = state.assets_dir.join(&file);
    match tokio::fs::write(&path, &body).await {
        Ok(()) => {
            let json = serde_json::json!({
                "file": file,
                "url": format!("http://{OUTPUT_SERVER_ADDR}/assets/{file}"),
                "bytes": body.len(),
            });
            axum::response::IntoResponse::into_response((CORS_HEADERS, axum::response::Json(json)))
        }
        Err(e) => axum::response::IntoResponse::into_response((
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            CORS_HEADERS,
            format!("failed to store asset: {e}"),
        )),
    }
}

/// Parses a single-range `Range: bytes=start-end` header (the only form
/// `<video>` elements actually send) into an inclusive `(start, end)` byte
/// range, clamped to `file_size`. Multi-range requests and malformed headers
/// both fall back to `None` (serve the whole file) rather than erroring —
/// a client that sent something we don't understand still gets the asset.
fn parse_byte_range(header: &str, file_size: u64) -> Option<(u64, u64)> {
    let spec = header.strip_prefix("bytes=")?;
    let (start_str, end_str) = spec.split_once('-')?;
    if start_str.is_empty() {
        // Suffix range, e.g. "bytes=-500" — last 500 bytes.
        let suffix_len: u64 = end_str.parse().ok()?;
        let start = file_size.saturating_sub(suffix_len);
        return Some((start, file_size.saturating_sub(1)));
    }
    let start: u64 = start_str.parse().ok()?;
    let end: u64 = if end_str.is_empty() {
        file_size.saturating_sub(1)
    } else {
        end_str.parse().ok()?
    };
    if file_size == 0 || start > end || end >= file_size {
        None
    } else {
        Some((start, end))
    }
}

/// Serves stored asset binaries to every consumer — editor, Program window,
/// and (eventually) OBS — from one canonical URL. Range-request aware:
/// `<video>` elements issue `Range` requests as part of normal playback, not
/// just seeking, and WebView2's media pipeline outright refuses to play a
/// source ("no supported source was found") if the server never answers
/// with `206 Partial Content` — this isn't an optional nicety for video the
/// way it might be for images/models.
async fn asset_get_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::extract::Path(file): axum::extract::Path<String>,
    headers: axum::http::HeaderMap,
) -> axum::response::Response {
    use axum::response::IntoResponse;
    use tokio::io::{AsyncReadExt, AsyncSeekExt};

    let safe = sanitize_asset_name(&file);
    if safe != file {
        return (CORS_HEADERS, axum::http::StatusCode::BAD_REQUEST).into_response();
    }

    let path = state.assets_dir.join(&safe);
    let file_size = match tokio::fs::metadata(&path).await {
        Ok(m) => m.len(),
        Err(_) => return (CORS_HEADERS, axum::http::StatusCode::NOT_FOUND).into_response(),
    };
    let mut f = match tokio::fs::File::open(&path).await {
        Ok(f) => f,
        Err(_) => return (CORS_HEADERS, axum::http::StatusCode::NOT_FOUND).into_response(),
    };

    let range = headers
        .get(axum::http::header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|r| parse_byte_range(r, file_size));

    if let Some((start, end)) = range {
        let len = (end - start + 1) as usize;
        if f.seek(std::io::SeekFrom::Start(start)).await.is_err() {
            return (CORS_HEADERS, axum::http::StatusCode::INTERNAL_SERVER_ERROR).into_response();
        }
        let mut buf = vec![0u8; len];
        if f.read_exact(&mut buf).await.is_err() {
            return (CORS_HEADERS, axum::http::StatusCode::INTERNAL_SERVER_ERROR).into_response();
        }
        (
            axum::http::StatusCode::PARTIAL_CONTENT,
            CORS_HEADERS,
            [
                (axum::http::header::CONTENT_TYPE, asset_mime(&safe).to_string()),
                (axum::http::header::ACCEPT_RANGES, "bytes".to_string()),
                (axum::http::header::CONTENT_RANGE, format!("bytes {start}-{end}/{file_size}")),
            ],
            buf,
        )
            .into_response()
    } else {
        let mut buf = Vec::with_capacity(file_size as usize);
        if f.read_to_end(&mut buf).await.is_err() {
            return (CORS_HEADERS, axum::http::StatusCode::INTERNAL_SERVER_ERROR).into_response();
        }
        (
            CORS_HEADERS,
            [
                (axum::http::header::CONTENT_TYPE, asset_mime(&safe).to_string()),
                (axum::http::header::ACCEPT_RANGES, "bytes".to_string()),
            ],
            buf,
        )
            .into_response()
    }
}

/// Imported models can be tens of MB — axum's 2MB default body limit
/// would reject them.
const ASSET_BODY_LIMIT_BYTES: usize = 512 * 1024 * 1024;

fn spawn_output_server(state: AppState, control_state: control_server::ControlServerState) {
    tauri::async_runtime::spawn(async move {
        // The control server has its own state type; mount its routes with
        // a distinct `with_state` on a sub-router so the shared root router
        // remains typed on `AppState`.
        let control_router = axum::Router::new()
            .route(
                "/control/command",
                axum::routing::post(control_server::control_command_handler)
                    .options(control_server::control_command_preflight),
            )
            .route(
                "/control/state/stream",
                axum::routing::get(control_server::control_state_stream_handler),
            )
            .with_state(control_state);

        let router = axum::Router::new()
            .route("/program", axum::routing::get(program_handler))
            .route("/program-static/{*path}", axum::routing::get(program_static_handler))
            .route("/program/tick", axum::routing::get(program_tick_handler))
            .route("/document", axum::routing::get(document_handler))
            .route("/document/stream", axum::routing::get(document_stream_handler))
            .route("/status", axum::routing::get(status_handler))
            .route(
                "/assets",
                axum::routing::post(asset_upload_handler)
                    .options(asset_preflight_handler)
                    .layer(axum::extract::DefaultBodyLimit::max(ASSET_BODY_LIMIT_BYTES)),
            )
            .route(
                "/assets/generate-image",
                axum::routing::post(asset_generate_image_handler).options(asset_preflight_handler),
            )
            .route("/assets/{file}", axum::routing::get(asset_get_handler))
            .with_state(state)
            .merge(control_router);
        // Bind with retry: on a dev-watcher or crash restart the previous
        // instance can still hold the port for a few seconds; panicking here
        // (the old behavior) silently left the app running with NO sidecar —
        // program output, status, and assets all dead while the UI looked fine.
        let listener = {
            let mut attempt = 0u32;
            loop {
                match tokio::net::TcpListener::bind(OUTPUT_SERVER_ADDR).await {
                    Ok(listener) => break listener,
                    Err(e) => {
                        attempt += 1;
                        if attempt >= 60 {
                            panic!("output server: failed to bind {OUTPUT_SERVER_ADDR} after {attempt} attempts: {e}");
                        }
                        eprintln!("output server: {OUTPUT_SERVER_ADDR} busy ({e}), retrying ({attempt})");
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                }
            }
        };
        axum::serve(listener, router)
            .await
            .expect("output server crashed");
    });
}

#[tauri::command]
fn set_program_document(
    doc: String,
    state: tauri::State<ProgramDocState>,
    broadcast: tauri::State<DocBroadcast>,
) -> Result<(), String> {
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        *guard = doc.clone();
    }
    // No active `/document/stream` receivers is not an error (e.g. neither Program nor
    // Preview window is open yet) — the mutex above is still updated, so
    // the next window to connect gets the fresh value as its initial frame.
    let _ = broadcast.send(doc);
    Ok(())
}

/// Phase 7 control-plane state push. Called by the Control Room's
/// `controlBridge.ts` whenever a control-relevant slice changes (program
/// scene, on-air lamp, playout current/next item, ndi/record status). The
/// sidecar mirrors it verbatim into the SSE broadcast + the current-state
/// buffer for late-joining `/control/state/stream` clients.
#[tauri::command]
fn set_control_state(
    state_json: String,
    state: tauri::State<control_server::ControlStateBuffer>,
    broadcast: tauri::State<control_server::ControlStateBroadcast>,
) -> Result<(), String> {
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        *guard = state_json.clone();
    }
    let _ = broadcast.send(state_json);
    Ok(())
}

/// Phase 7 record from the Tauri IPC layer (used by the PlayoutPanel
/// Record button). The control-server path in control_server.rs calls the
/// same underlying `record::start_record_from_command`, so a Companion
/// button and an in-app button behave identically.
#[tauri::command]
async fn start_record(
    filename: Option<String>,
    codec: Option<String>,
    app: tauri::AppHandle,
) -> Result<record::StartRecordResult, String> {
    record::start_record_from_command(&app, filename, codec).await
}

#[tauri::command]
fn stop_record(app: tauri::AppHandle) -> Result<record::StopRecordResult, String> {
    record::stop_record_from_command(&app)
}

#[tauri::command]
fn get_ndi_status(state: tauri::State<Arc<dyn ndi::NdiOutput>>) -> ndi::NdiStatus {
    state.status()
}

/// NDI Tools Stage 1 — real network source discovery, exposed to the
/// Settings > NDI Tools panel. `timeout_ms` defaults to 1500 (enough for
/// mDNS to settle without making a manual "refresh" click feel sluggish).
#[tauri::command]
fn list_ndi_sources(
    timeout_ms: Option<u32>,
    state: tauri::State<Arc<dyn ndi::NdiOutput>>,
) -> Result<Vec<ndi::NdiSourceInfo>, String> {
    state.find_sources(timeout_ms.unwrap_or(1500))
}

/// What NDI actually sends: the live Program window (Stage 2, default) or the
/// Stage-1 synthetic test pattern (kept as a fallback / connectivity check).
#[derive(Clone, Copy, PartialEq)]
enum NdiSourceMode {
    Program,
    TestPattern,
}

/// Real, operator-facing NDI output settings — resolution/fps come from the
/// Control Room's actual project (see `NdiPanel.tsx`), not placeholder
/// constants, so what the panel shows is what goes out. In Program mode the
/// captured frame's own dimensions win (see capture.rs); these still drive the
/// test pattern and the advertised frame rate.
#[derive(Clone, Copy)]
struct NdiOutputConfig {
    width: u32,
    height: u32,
    fps_n: u32,
    fps_d: u32,
    mode: NdiSourceMode,
}

impl Default for NdiOutputConfig {
    fn default() -> Self {
        Self { width: 1280, height: 720, fps_n: 30, fps_d: 1, mode: NdiSourceMode::Program }
    }
}

type NdiConfigState = Arc<Mutex<NdiOutputConfig>>;

#[tauri::command]
fn start_ndi_output(
    source_name: String,
    width: u32,
    height: u32,
    fps_n: u32,
    fps_d: u32,
    ndi: tauri::State<Arc<dyn ndi::NdiOutput>>,
    streaming: tauri::State<Arc<std::sync::atomic::AtomicBool>>,
    config: tauri::State<NdiConfigState>,
) -> Result<(), String> {
    if width == 0 || height == 0 || fps_d == 0 || fps_n == 0 {
        return Err(format!("invalid NDI output settings: {width}x{height} @ {fps_n}/{fps_d}"));
    }
    ndi.start(&source_name)?;
    if let Ok(mut guard) = config.lock() {
        // Preserve the current source mode; only the resolution/fps change here.
        guard.width = width;
        guard.height = height;
        guard.fps_n = fps_n;
        guard.fps_d = fps_d;
    }
    streaming.store(true, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
fn stop_ndi_output(
    ndi: tauri::State<Arc<dyn ndi::NdiOutput>>,
    streaming: tauri::State<Arc<std::sync::atomic::AtomicBool>>,
) -> Result<(), String> {
    streaming.store(false, std::sync::atomic::Ordering::Relaxed);
    ndi.stop();
    Ok(())
}

/// Switches what NDI sends between the live Program window ("program") and the
/// synthetic test pattern ("test"). Takes effect on the next frame — no
/// stop/start needed.
#[tauri::command]
fn set_ndi_source_mode(mode: String, config: tauri::State<NdiConfigState>) -> Result<(), String> {
    let m = match mode.as_str() {
        "program" => NdiSourceMode::Program,
        "test" => NdiSourceMode::TestPattern,
        other => return Err(format!("unknown NDI source mode: {other}")),
    };
    if let Ok(mut guard) = config.lock() {
        guard.mode = m;
    }
    Ok(())
}

/// Stage 1's synthetic frame — retained as a connectivity check / fallback
/// alongside the real Program capture (Stage 2).
fn generate_test_pattern(w: u32, h: u32, frame_i: u32) -> Vec<u8> {
    let mut buf = vec![0u8; (w * h * 4) as usize];
    let bar_count = 8u32;
    let shift = frame_i % w;
    for y in 0..h {
        for x in 0..w {
            let scrolled_x = (x + shift) % w;
            let bar = (scrolled_x * bar_count / w) % bar_count;
            let (b, g, r) = match bar {
                0 => (255, 255, 255),
                1 => (0, 255, 255),
                2 => (255, 255, 0),
                3 => (0, 255, 0),
                4 => (255, 0, 255),
                5 => (0, 0, 255),
                6 => (255, 0, 0),
                _ => (0, 0, 0),
            };
            let idx = ((y * w + x) * 4) as usize;
            buf[idx] = b;
            buf[idx + 1] = g;
            buf[idx + 2] = r;
            buf[idx + 3] = 255;
        }
    }
    buf
}

/// The NDI frame pump. Runs for the app's lifetime but only sends while
/// `streaming` (between start/stop). In Program mode it triggers a WebView2
/// capture of the Program window each tick (throttled to one outstanding
/// capture at a time — see the in-flight guard — so it self-paces to whatever
/// rate CapturePreview can actually sustain); in TestPattern mode it generates
/// and sends a synthetic frame directly.
fn spawn_ndi_sender(
    ndi: Arc<dyn ndi::NdiOutput>,
    streaming: Arc<std::sync::atomic::AtomicBool>,
    config: NdiConfigState,
    program_window: Option<tauri::WebviewWindow>,
) {
    use std::sync::atomic::Ordering;
    let in_flight = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let last_trigger = Arc::new(Mutex::new(std::time::Instant::now()));
    tauri::async_runtime::spawn(async move {
        let mut frame_i: u32 = 0;
        let mut program_ticks: u64 = 0;
        loop {
            let cfg = config.lock().map(|g| *g).unwrap_or_default();
            let frame_ms = (1000.0 * cfg.fps_d as f64 / cfg.fps_n as f64).max(1.0) as u64;
            tokio::time::sleep(std::time::Duration::from_millis(frame_ms)).await;
            if !streaming.load(Ordering::Relaxed) {
                continue;
            }
            match cfg.mode {
                NdiSourceMode::TestPattern => {
                    // Generated on the blocking pool so the pixel loop never
                    // stalls the async runtime that also serves the axum sidecar.
                    let (w, h) = (cfg.width, cfg.height);
                    let buf = tokio::task::spawn_blocking(move || generate_test_pattern(w, h, frame_i))
                        .await
                        .unwrap_or_default();
                    if let Err(e) = ndi.send_frame(&buf, w, h, cfg.fps_n, cfg.fps_d) {
                        eprintln!("ndi test pattern: send_frame failed: {e}");
                    }
                    frame_i = frame_i.wrapping_add(4);
                }
                NdiSourceMode::Program => {
                    let Some(win) = program_window.as_ref() else {
                        eprintln!("ndi: Program window unavailable; cannot capture");
                        continue;
                    };
                    // Keep only one capture outstanding; if one somehow never
                    // completes, recover after 2s rather than wedging forever.
                    let busy = in_flight.load(Ordering::Relaxed);
                    // Safety net only: a capture+decode normally clears `busy`
                    // well within this; it exists so a dropped/never-firing
                    // completion handler can't wedge the pump forever.
                    let stale = last_trigger.lock().map(|t| t.elapsed() > std::time::Duration::from_secs(5)).unwrap_or(true);
                    program_ticks += 1;
                    if program_ticks <= 200 && program_ticks % 20 == 0 {
                        eprintln!("ndi sender: program tick {program_ticks} — busy={busy} stale={stale}");
                    }
                    if busy && !stale {
                        continue;
                    }
                    in_flight.store(true, Ordering::Relaxed);
                    if let Ok(mut t) = last_trigger.lock() {
                        *t = std::time::Instant::now();
                    }
                    capture::trigger_program_capture(win, ndi.clone(), (cfg.fps_n, cfg.fps_d), in_flight.clone());
                }
            }
        }
    });
}

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create health check table",
            sql: "CREATE TABLE IF NOT EXISTS _health (id INTEGER PRIMARY KEY, checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create projects and app_state tables",
            sql: "CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    doc TEXT NOT NULL,
                    schema_version INTEGER NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                  );
                  CREATE TABLE IF NOT EXISTS app_state (k TEXT PRIMARY KEY, v TEXT NOT NULL);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add program state column for PGM/PVW",
            sql: "ALTER TABLE projects ADD COLUMN program TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "user-saved graphics templates (Phase 5.8)",
            sql: "CREATE TABLE IF NOT EXISTS user_templates (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    layer TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                  );",
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Without this, `getUserMedia()` for camera/mic never resolves or rejects —
/// it just hangs forever. WebView2 has no default permission UI in a
/// chromeless embedded host like Tauri's, and with no handler registered it
/// leaves the request permanently pending rather than prompting or denying
/// (confirmed live: the JS promise sat unsettled indefinitely with no
/// handler). This is a local, single-user desktop app — every window here is
/// our own trusted content, never third-party — so auto-granting camera/mic
/// is the correct behavior, not a security compromise. Registered per-window
/// in `.setup()` since each Tauri window on Windows is its own WebView2
/// instance with its own permission state.
#[cfg(windows)]
fn grant_media_permissions(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PERMISSION_KIND_CAMERA, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::PermissionRequestedEventHandler;

    let label = window.label().to_string();
    let result = window.with_webview(move |webview| {
        let core = match unsafe { webview.controller().CoreWebView2() } {
            Ok(core) => core,
            Err(e) => {
                eprintln!("grant_media_permissions: no CoreWebView2 for '{label}': {e}");
                return;
            }
        };
        let handler = PermissionRequestedEventHandler::create(Box::new(move |_sender, args| {
            if let Some(args) = args {
                let mut kind = Default::default();
                unsafe { args.PermissionKind(&mut kind) }?;
                if kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA || kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                    unsafe { args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW) }?;
                }
            }
            Ok(())
        }));
        let mut token: i64 = 0;
        if let Err(e) = unsafe { core.add_PermissionRequested(&handler, &mut token) } {
            eprintln!("grant_media_permissions: add_PermissionRequested failed: {e}");
        }
    });
    if let Err(e) = result {
        eprintln!("grant_media_permissions: with_webview failed: {e}");
    }
}

#[cfg(not(windows))]
fn grant_media_permissions(_window: &tauri::WebviewWindow) {}

pub fn run() {
    let doc_state: ProgramDocState = Arc::new(Mutex::new("null".to_string()));
    // Capacity 16: a burst of rapid Play In/Out clicks or a fast-dragged
    // Timeline scrub can outrun a slow/backgrounded receiver; `Lagged` just
    // means that receiver skips ahead to the newest state, which is exactly
    // the semantics wanted here (always show the latest document, never a
    // stale queued one).
    let (doc_tx, _doc_rx) = tokio::sync::broadcast::channel::<String>(16);
    let doc_broadcast: DocBroadcast = Arc::new(doc_tx);
    let ndi: Arc<dyn ndi::NdiOutput> = ndi::create_ndi_output();
    let ndi_streaming = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let ndi_config: NdiConfigState = Arc::new(Mutex::new(NdiOutputConfig::default()));
    // Phase 7 control-plane state — mirrors what controlBridge.ts publishes,
    // fanned out to /control/state/stream subscribers.
    let control_state_buffer: control_server::ControlStateBuffer =
        Arc::new(Mutex::new("null".to_string()));
    let (control_tx, _control_rx) = tokio::sync::broadcast::channel::<String>(16);
    let control_broadcast: control_server::ControlStateBroadcast = Arc::new(control_tx);
    // Phase 7 FFmpeg record — Arc so both the Tauri state and the
    // control-server dispatch share the same one-active-record guard.
    let record_state = record::RecordState::new();
    let server_doc = doc_state.clone();
    let server_broadcast = doc_broadcast.clone();
    let server_ndi = ndi.clone();
    let server_control_state = control_state_buffer.clone();
    let server_control_broadcast = control_broadcast.clone();
    // The sender is spawned in `.setup()` (not here) because Program-mode
    // capture needs the "program" WebviewWindow, which doesn't exist until the
    // app is built.
    let sender_ndi = ndi.clone();
    let sender_streaming = ndi_streaming.clone();
    let sender_config = ndi_config.clone();

    tauri::Builder::default()
        // MUST be the first plugin (per its docs): a second launch of the
        // packaged app must never spawn a twin instance — two instances
        // fight over the sidecar port, the SQLite DB and the WebView2
        // profile and BOTH break (observed live 2026-07-10 as a white
        // Control Room). Instead, re-launching focuses the running app.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("control-room") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(doc_state)
        .manage(doc_broadcast)
        .manage(ndi)
        .manage(ndi_streaming)
        .manage(ndi_config)
        .manage(control_state_buffer)
        .manage(control_broadcast)
        .manage(record_state)
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:studio.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            set_program_document,
            set_control_state,
            get_ndi_status,
            list_ndi_sources,
            start_ndi_output,
            stop_ndi_output,
            set_ndi_source_mode,
            generate_ai_image_asset,
            get_ai_settings_status,
            set_openai_api_key,
            clear_openai_api_key,
            record::get_record_status,
            start_record,
            stop_record,
            spout::get_spout_status,
            rundowncloud::get_rundowncloud_status,
            rundowncloud::set_rundowncloud_config,
            rundowncloud::clear_rundowncloud_config,
            rundowncloud::ping_rundowncloud,
            rundowncloud::fetch_rundowncloud_rundown,
            rundowncloud::fetch_rundowncloud_cues,
            mos::get_mos_status,
            mos::set_mos_config
        ])
        .setup(move |app| {
            // The assets dir needs the app handle to resolve, so AppState is
            // assembled here rather than before the builder.
            let assets_dir = app
                .path()
                .app_data_dir()
                .expect("app data dir unavailable")
                .join("assets");
            std::fs::create_dir_all(&assets_dir).expect("failed to create assets dir");
            app.manage(AssetDirState {
                assets_dir: assets_dir.clone(),
            });
            let mut frontend_roots = Vec::new();
            if let Ok(cwd) = std::env::current_dir() {
                frontend_roots.push(cwd.join("dist"));
            }
            if let Ok(exe) = std::env::current_exe() {
                if let Some(exe_dir) = exe.parent() {
                    frontend_roots.push(exe_dir.join("dist"));
                    frontend_roots.push(exe_dir.to_path_buf());
                }
            }
            if let Ok(resource_dir) = app.path().resource_dir() {
                frontend_roots.push(resource_dir.join("dist"));
                frontend_roots.push(resource_dir);
            }
            for (_, window) in app.webview_windows() {
                grant_media_permissions(&window);
            }
            // Start the NDI frame pump now that the Program window exists.
            spawn_ndi_sender(
                sender_ndi.clone(),
                sender_streaming.clone(),
                sender_config.clone(),
                app.get_webview_window("program"),
            );
            spawn_output_server(
                AppState {
                    doc: server_doc.clone(),
                    doc_broadcast: server_broadcast.clone(),
                    stats: Arc::new(Mutex::new(status::RequestStats::new())),
                    ndi: server_ndi.clone(),
                    assets_dir,
                    frontend_roots,
                },
                control_server::ControlServerState {
                    state: server_control_state.clone(),
                    broadcast: server_control_broadcast.clone(),
                    app_handle: app.handle().clone(),
                },
            );
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
