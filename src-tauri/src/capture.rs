use crate::ndi::NdiOutput;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// NDI Stage 2 — real Program-window frame capture.
///
/// WebView2's `CapturePreview` renders the live content of a webview into an
/// image stream (we use PNG so the transparent Program overlay keeps its
/// alpha). It's the honest source for "what's actually on Program" without a
/// separate GPU capture pipeline. The call must originate on the UI thread
/// (Tauri's `with_webview` dispatches there); the completion handler — also
/// on the UI thread — decodes the PNG and pushes it to NDI as BGRA.
///
/// Capture is asynchronous: this returns immediately and clears `in_flight`
/// once the frame is sent (or the attempt fails), so the sender loop can
/// throttle to the real capture rate instead of queueing requests faster than
/// WebView2 can service them.
#[cfg(windows)]
pub fn trigger_program_capture(
    window: &tauri::WebviewWindow,
    ndi: Arc<dyn NdiOutput>,
    fps: (u32, u32),
    in_flight: Arc<AtomicBool>,
) {
    use webview2_com::CapturePreviewCompletedHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG;
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::Com::StructuredStorage::CreateStreamOnHGlobal;

    let t = TRIGGERS.fetch_add(1, Ordering::Relaxed);
    let diag = t < 8;
    if diag {
        eprintln!("ndi capture: trigger #{t} — dispatching with_webview");
    }
    let in_flight_dispatch = in_flight.clone();
    let dispatched = window.with_webview(move |webview| unsafe {
        if diag {
            eprintln!("ndi capture: trigger #{t} — closure running on UI thread");
        }
        let core = match webview.controller().CoreWebView2() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("ndi capture: no CoreWebView2: {e}");
                in_flight.store(false, Ordering::Relaxed);
                return;
            }
        };
        // Auto-growing HGLOBAL-backed stream; released when the last COM ref
        // drops (fDeleteOnRelease = true).
        let stream = match CreateStreamOnHGlobal(HGLOBAL(std::ptr::null_mut()), true) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("ndi capture: CreateStreamOnHGlobal: {e}");
                in_flight.store(false, Ordering::Relaxed);
                return;
            }
        };
        let stream_read = stream.clone();
        let in_flight_cb = in_flight.clone();
        let handler = CapturePreviewCompletedHandler::create(Box::new(move |result: windows::core::Result<()>| {
            match result {
                Ok(()) => match read_stream_bytes(&stream_read) {
                    // Decode + NDI send happen OFF the UI thread. PNG decode is
                    // heavy (and pathologically slow in a debug build); doing it
                    // in this completion handler froze the webview and serialized
                    // captures to ~0.3 fps. `in_flight` is cleared only when the
                    // whole pipeline finishes, so exactly one capture+decode is
                    // ever outstanding — the reader here only does a cheap memcpy
                    // out of the HGLOBAL.
                    Ok(bytes) => {
                        let ndi_worker = ndi.clone();
                        let in_flight_worker = in_flight_cb.clone();
                        std::thread::spawn(move || {
                            if let Err(e) = decode_convert_send(&bytes, &ndi_worker, fps) {
                                eprintln!("ndi capture: {e}");
                            }
                            in_flight_worker.store(false, Ordering::Relaxed);
                        });
                    }
                    Err(e) => {
                        eprintln!("ndi capture: {e}");
                        in_flight_cb.store(false, Ordering::Relaxed);
                    }
                },
                Err(e) => {
                    eprintln!("ndi capture: CapturePreview reported {e}");
                    in_flight_cb.store(false, Ordering::Relaxed);
                }
            }
            Ok(())
        }));
        if let Err(e) = core.CapturePreview(COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG, &stream, &handler) {
            eprintln!("ndi capture: CapturePreview call failed: {e}");
            in_flight.store(false, Ordering::Relaxed);
        } else if diag {
            eprintln!("ndi capture: trigger #{t} — CapturePreview dispatched, awaiting handler");
        }
    });
    if let Err(e) = &dispatched {
        eprintln!("ndi capture: trigger #{t} — with_webview dispatch failed: {e:?}");
        in_flight_dispatch.store(false, Ordering::Relaxed);
    }
}

/// Cheap: copies the PNG bytes CapturePreview wrote into the stream out of the
/// HGLOBAL (runs on the UI thread, so it must not do heavy work).
#[cfg(windows)]
unsafe fn read_stream_bytes(stream: &windows::Win32::System::Com::IStream) -> Result<Vec<u8>, String> {
    use windows::Win32::System::Com::StructuredStorage::GetHGlobalFromStream;
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

    let hg = GetHGlobalFromStream(stream).map_err(|e| format!("GetHGlobalFromStream: {e}"))?;
    let size = GlobalSize(hg);
    if size == 0 {
        return Err("empty capture stream".into());
    }
    let ptr = GlobalLock(hg);
    if ptr.is_null() {
        return Err("GlobalLock returned null".into());
    }
    let bytes = std::slice::from_raw_parts(ptr as *const u8, size).to_vec();
    let _ = GlobalUnlock(hg);
    Ok(bytes)
}

/// Heavy: decodes the PNG, converts RGBA→BGRA and sends the frame over NDI at
/// the captured size. Runs on a worker thread (see the handler), never the UI
/// thread.
#[cfg(windows)]
fn decode_convert_send(bytes: &[u8], ndi: &Arc<dyn NdiOutput>, fps: (u32, u32)) -> Result<(), String> {
    let img = image::load_from_memory_with_format(bytes, image::ImageFormat::Png)
        .map_err(|e| format!("PNG decode: {e}"))?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let mut raw = rgba.into_raw();
    // RGBA -> BGRA in place (NDI's BGRA FourCC).
    for px in raw.chunks_exact_mut(4) {
        px.swap(0, 2);
    }
    ndi.send_frame(&raw, w, h, fps.0, fps.1)?;
    // Throttled proof-of-life so the log shows real decoded dimensions.
    let n = CAPTURE_FRAMES.fetch_add(1, Ordering::Relaxed);
    if n < 5 || n % 30 == 0 {
        eprintln!("ndi capture: sent Program frame #{n} — {w}x{h} BGRA ({} bytes)", raw.len());
    }
    Ok(())
}

#[cfg(windows)]
static CAPTURE_FRAMES: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
#[cfg(windows)]
static TRIGGERS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

#[cfg(not(windows))]
pub fn trigger_program_capture(
    _window: &tauri::WebviewWindow,
    _ndi: Arc<dyn NdiOutput>,
    _fps: (u32, u32),
    in_flight: Arc<AtomicBool>,
) {
    // Program capture is WebView2-specific; nothing to do off-Windows.
    in_flight.store(false, Ordering::Relaxed);
}
