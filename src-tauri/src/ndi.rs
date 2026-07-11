use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiStatus {
    pub available: bool,
    /// Set only when `available` is false — the specific reason the real
    /// backend couldn't load (never a generic message).
    pub reason: Option<String>,
    /// `Some(count)` once a sender is active (after `start()`), reflecting a
    /// real `NDIlib_send_get_no_connections()` read; `None` before `start()`
    /// has been called.
    pub connections: Option<i32>,
}

/// One NDI source found on the network by `NdiOutput::find_sources` (NDI
/// Tools Stage 1 — real `NDIlib_find_*` discovery, not a mock list).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiSourceInfo {
    /// "MACHINE (Source Name)" — NDI's own display convention.
    pub name: String,
    /// Internal network address, not meant for display — kept for Stage 2
    /// (receive), when a specific source needs to be connected to.
    pub url_address: Option<String>,
}

/// Contract any NDI backend must satisfy. Frame delivery timing is owned
/// by the caller — this trait is deliberately synchronous and minimal so a
/// real implementation (once the NDI SDK is installed) can be dropped in
/// without touching any calling code in lib.rs.
pub trait NdiOutput: Send + Sync {
    fn status(&self) -> NdiStatus;
    fn start(&self, source_name: &str) -> Result<(), String>;
    fn stop(&self);
    fn send_frame(&self, frame: &[u8], width: u32, height: u32, fps_n: u32, fps_d: u32) -> Result<(), String>;
    /// Real network discovery (NDI Tools Stage 1): creates a finder, waits up
    /// to `timeout_ms` for the source list to settle, and returns whatever is
    /// currently visible. A fresh finder per call is deliberate — this backs
    /// an operator-facing "refresh" action, not a hot per-frame path, so the
    /// simplicity of not managing persistent finder state wins.
    fn find_sources(&self, timeout_ms: u32) -> Result<Vec<NdiSourceInfo>, String>;
}

/// The fallback implementation — used whenever the real NDI runtime can't be
/// loaded (SDK/Runtime not installed, wrong architecture, unsupported CPU).
/// Every fallible method returns `Err` — there is no code path here that can
/// report a fake NDI success.
pub struct UnavailableNdiOutput {
    reason: String,
}

impl UnavailableNdiOutput {
    pub fn new(reason: impl Into<String>) -> Self {
        Self { reason: reason.into() }
    }
}

impl Default for UnavailableNdiOutput {
    fn default() -> Self {
        Self::new("NDI SDK not installed")
    }
}

impl NdiOutput for UnavailableNdiOutput {
    fn status(&self) -> NdiStatus {
        NdiStatus {
            available: false,
            reason: Some(self.reason.clone()),
            connections: None,
        }
    }

    fn start(&self, _source_name: &str) -> Result<(), String> {
        Err(self.reason.clone())
    }

    fn stop(&self) {}

    fn send_frame(&self, _frame: &[u8], _width: u32, _height: u32, _fps_n: u32, _fps_d: u32) -> Result<(), String> {
        Err(self.reason.clone())
    }

    fn find_sources(&self, _timeout_ms: u32) -> Result<Vec<NdiSourceInfo>, String> {
        Err(self.reason.clone())
    }
}

// ---------------------------------------------------------------------------
// Real NDI backend — Windows only, dynamically loaded.
//
// The NDI SDK's own recommended pattern (see Processing.NDI.DynamicLoad.h in
// the installed SDK) is `LoadLibrary`, not link-time linking — specifically
// so an app built against the SDK still runs (reporting honestly unavailable
// rather than failing to start) on a machine without the runtime installed.
// We hand-roll the small subset of the C ABI we actually use rather than
// pull in a third-party wrapper crate, since the surface is tiny (init,
// create a sender, send BGRA video frames, tear down).
// ---------------------------------------------------------------------------
#[cfg(windows)]
mod real {
    use super::{NdiOutput, NdiSourceInfo, NdiStatus};
    use libloading::{Library, Symbol};
    use std::ffi::{c_char, c_void, CStr, CString};
    use std::sync::Mutex;

    // Candidate DLL locations, in order: the well-known SDK dev-machine
    // install path first (this machine has the SDK, not just the runtime),
    // then bare names relying on PATH/System32 (where the separate NDI
    // Runtime redistributable installs it on an end-user machine).
    const CANDIDATE_PATHS: &[&str] = &[
        r"C:\Program Files\NDI\NDI 6 SDK\Bin\x64\Processing.NDI.Lib.x64.dll",
        "Processing.NDI.Lib.x64.dll",
    ];

    // NDI_LIB_FOURCC('B','G','R','A') — see Processing.NDI.structs.h. We only
    // ever send uncompressed BGRA (4 bytes/pixel), matching what a Windows
    // GDI/Direct3D frame grab naturally produces — the actual frame source
    // is Phase 2 of this feature, not built yet (see PLAN.md).
    const FOURCC_BGRA: i32 = 0x4152_4742u32 as i32;
    const FRAME_FORMAT_PROGRESSIVE: i32 = 1;

    #[repr(C)]
    struct NdiSendCreateT {
        p_ndi_name: *const c_char,
        p_groups: *const c_char,
        clock_video: bool,
        clock_audio: bool,
    }

    // Matches NDIlib_find_create_t exactly (Processing.NDI.Find.h).
    #[repr(C)]
    struct NdiFindCreateT {
        show_local_sources: bool,
        p_groups: *const c_char,
        p_extra_ips: *const c_char,
    }

    // Matches NDIlib_source_t (Processing.NDI.structs.h). The SDK declares
    // p_url_address/p_ip_address as a union, but both members are a bare
    // `const char*` of the same size — a single field reads correctly either
    // way, so no #[repr(C)] union is needed here.
    #[repr(C)]
    struct NdiSourceT {
        p_ndi_name: *const c_char,
        p_url_address: *const c_char,
    }

    #[repr(C)]
    struct NdiVideoFrameV2T {
        xres: i32,
        yres: i32,
        four_cc: i32,
        frame_rate_n: i32,
        frame_rate_d: i32,
        picture_aspect_ratio: f32,
        frame_format_type: i32,
        timecode: i64,
        p_data: *mut u8,
        line_stride_in_bytes: i32,
        p_metadata: *const c_char,
        timestamp: i64,
    }

    type FnInitialize = unsafe extern "C" fn() -> bool;
    type FnDestroy = unsafe extern "C" fn();
    type FnIsSupportedCpu = unsafe extern "C" fn() -> bool;
    type FnSendCreate = unsafe extern "C" fn(*const NdiSendCreateT) -> *mut c_void;
    type FnSendDestroy = unsafe extern "C" fn(*mut c_void);
    type FnSendSendVideoV2 = unsafe extern "C" fn(*mut c_void, *const NdiVideoFrameV2T);
    type FnSendGetNoConnections = unsafe extern "C" fn(*mut c_void, u32) -> i32;
    type FnFindCreate = unsafe extern "C" fn(*const NdiFindCreateT) -> *mut c_void;
    type FnFindDestroy = unsafe extern "C" fn(*mut c_void);
    type FnFindWaitForSources = unsafe extern "C" fn(*mut c_void, u32) -> bool;
    type FnFindGetCurrentSources = unsafe extern "C" fn(*mut c_void, *mut u32) -> *const NdiSourceT;

    struct SenderHandle(*mut c_void);
    // Safety: NDI's send API is documented as safe to call concurrently for
    // sending; creation/destruction of this instance is serialized by the
    // `Mutex` in `DynamicNdi`, which is the only place this handle is touched.
    unsafe impl Send for SenderHandle {}

    pub struct DynamicNdi {
        // Declared last so it's dropped last — every fn pointer above
        // borrows validity from this library staying loaded. `NDIlib_initialize`
        // itself is only ever called once, during `from_library`, so it isn't
        // kept around as a field.
        fn_destroy: FnDestroy,
        fn_send_create: FnSendCreate,
        fn_send_destroy: FnSendDestroy,
        fn_send_send_video_v2: FnSendSendVideoV2,
        fn_send_get_no_connections: FnSendGetNoConnections,
        fn_find_create: FnFindCreate,
        fn_find_destroy: FnFindDestroy,
        fn_find_wait_for_sources: FnFindWaitForSources,
        fn_find_get_current_sources: FnFindGetCurrentSources,
        sender: Mutex<Option<SenderHandle>>,
        _lib: Library,
    }

    impl DynamicNdi {
        /// Attempts to load the real NDI runtime and initialize it. Returns
        /// `Err(reason)` for every failure mode (DLL not found, unsupported
        /// CPU, init failure) so the caller can fall back to
        /// `UnavailableNdiOutput` with an honest, specific reason — never a
        /// generic "something went wrong".
        pub fn try_load() -> Result<Self, String> {
            let mut last_err = String::from("no candidate path attempted");
            for path in CANDIDATE_PATHS {
                match unsafe { Library::new(path) } {
                    Ok(lib) => return Self::from_library(lib),
                    Err(e) => last_err = format!("{path}: {e}"),
                }
            }
            Err(format!("NDI runtime DLL not found ({last_err})"))
        }

        fn from_library(lib: Library) -> Result<Self, String> {
            unsafe {
                let fn_initialize: Symbol<FnInitialize> =
                    lib.get(b"NDIlib_initialize\0").map_err(|e| format!("missing NDIlib_initialize: {e}"))?;
                let fn_is_supported_cpu: Symbol<FnIsSupportedCpu> = lib
                    .get(b"NDIlib_is_supported_CPU\0")
                    .map_err(|e| format!("missing NDIlib_is_supported_CPU: {e}"))?;
                if !fn_is_supported_cpu() {
                    return Err("CPU does not support the required instruction set (NDIlib_is_supported_CPU)".to_string());
                }
                if !fn_initialize() {
                    return Err("NDIlib_initialize() returned false".to_string());
                }
                let fn_destroy: Symbol<FnDestroy> =
                    lib.get(b"NDIlib_destroy\0").map_err(|e| format!("missing NDIlib_destroy: {e}"))?;
                let fn_send_create: Symbol<FnSendCreate> =
                    lib.get(b"NDIlib_send_create\0").map_err(|e| format!("missing NDIlib_send_create: {e}"))?;
                let fn_send_destroy: Symbol<FnSendDestroy> =
                    lib.get(b"NDIlib_send_destroy\0").map_err(|e| format!("missing NDIlib_send_destroy: {e}"))?;
                let fn_send_send_video_v2: Symbol<FnSendSendVideoV2> = lib
                    .get(b"NDIlib_send_send_video_v2\0")
                    .map_err(|e| format!("missing NDIlib_send_send_video_v2: {e}"))?;
                let fn_send_get_no_connections: Symbol<FnSendGetNoConnections> = lib
                    .get(b"NDIlib_send_get_no_connections\0")
                    .map_err(|e| format!("missing NDIlib_send_get_no_connections: {e}"))?;
                let fn_find_create: Symbol<FnFindCreate> =
                    lib.get(b"NDIlib_find_create_v2\0").map_err(|e| format!("missing NDIlib_find_create_v2: {e}"))?;
                let fn_find_destroy: Symbol<FnFindDestroy> =
                    lib.get(b"NDIlib_find_destroy\0").map_err(|e| format!("missing NDIlib_find_destroy: {e}"))?;
                let fn_find_wait_for_sources: Symbol<FnFindWaitForSources> = lib
                    .get(b"NDIlib_find_wait_for_sources\0")
                    .map_err(|e| format!("missing NDIlib_find_wait_for_sources: {e}"))?;
                let fn_find_get_current_sources: Symbol<FnFindGetCurrentSources> = lib
                    .get(b"NDIlib_find_get_current_sources\0")
                    .map_err(|e| format!("missing NDIlib_find_get_current_sources: {e}"))?;

                Ok(Self {
                    fn_destroy: *fn_destroy,
                    fn_send_create: *fn_send_create,
                    fn_send_destroy: *fn_send_destroy,
                    fn_send_send_video_v2: *fn_send_send_video_v2,
                    fn_send_get_no_connections: *fn_send_get_no_connections,
                    fn_find_create: *fn_find_create,
                    fn_find_destroy: *fn_find_destroy,
                    fn_find_wait_for_sources: *fn_find_wait_for_sources,
                    fn_find_get_current_sources: *fn_find_get_current_sources,
                    sender: Mutex::new(None),
                    _lib: lib,
                })
            }
        }
    }

    impl Drop for DynamicNdi {
        fn drop(&mut self) {
            if let Ok(mut guard) = self.sender.lock() {
                if let Some(handle) = guard.take() {
                    unsafe { (self.fn_send_destroy)(handle.0) };
                }
            }
            unsafe { (self.fn_destroy)() };
        }
    }

    impl NdiOutput for DynamicNdi {
        fn status(&self) -> NdiStatus {
            // Loading + NDIlib_initialize() already succeeded by construction
            // (see try_load) — reaching this impl at all means real NDI is up.
            let connections = self
                .sender
                .lock()
                .ok()
                .and_then(|g| g.as_ref().map(|h| unsafe { (self.fn_send_get_no_connections)(h.0, 0) }));
            NdiStatus {
                available: true,
                reason: None,
                connections,
            }
        }

        fn start(&self, source_name: &str) -> Result<(), String> {
            let mut guard = self.sender.lock().map_err(|e| e.to_string())?;
            if let Some(handle) = guard.take() {
                unsafe { (self.fn_send_destroy)(handle.0) };
            }
            let c_name = CString::new(source_name).map_err(|e| e.to_string())?;
            let create = NdiSendCreateT {
                p_ndi_name: c_name.as_ptr(),
                p_groups: std::ptr::null(),
                clock_video: true,
                clock_audio: true,
            };
            let handle = unsafe { (self.fn_send_create)(&create) };
            if handle.is_null() {
                return Err("NDIlib_send_create returned NULL".to_string());
            }
            *guard = Some(SenderHandle(handle));
            Ok(())
        }

        fn stop(&self) {
            if let Ok(mut guard) = self.sender.lock() {
                if let Some(handle) = guard.take() {
                    unsafe { (self.fn_send_destroy)(handle.0) };
                }
            }
        }

        fn send_frame(&self, frame: &[u8], width: u32, height: u32, fps_n: u32, fps_d: u32) -> Result<(), String> {
            let guard = self.sender.lock().map_err(|e| e.to_string())?;
            let handle = guard.as_ref().ok_or("NDI sender not started — call start() first")?;
            let expected_len = (width as usize) * (height as usize) * 4;
            if frame.len() != expected_len {
                return Err(format!(
                    "frame buffer is {} bytes, expected {expected_len} for {width}x{height} BGRA",
                    frame.len()
                ));
            }
            let ndi_frame = NdiVideoFrameV2T {
                xres: width as i32,
                yres: height as i32,
                four_cc: FOURCC_BGRA,
                frame_rate_n: fps_n as i32,
                frame_rate_d: fps_d as i32,
                picture_aspect_ratio: width as f32 / height as f32,
                frame_format_type: FRAME_FORMAT_PROGRESSIVE,
                timecode: i64::MAX, // NDIlib_send_timecode_synthesize
                p_data: frame.as_ptr() as *mut u8,
                line_stride_in_bytes: (width * 4) as i32,
                p_metadata: std::ptr::null(),
                timestamp: 0,
            };
            // NDIlib_send_send_video_v2 is documented as blocking/copying
            // before returning (unlike the _async variant) — safe to let
            // `frame`'s borrow end right after this call.
            unsafe { (self.fn_send_send_video_v2)(handle.0, &ndi_frame) };
            Ok(())
        }

        fn find_sources(&self, timeout_ms: u32) -> Result<Vec<NdiSourceInfo>, String> {
            unsafe {
                // show_local_sources: true — this machine's own outputs (e.g.
                // our own Program sender) should be discoverable too, same as
                // any other NDI monitoring tool would show them.
                let create = NdiFindCreateT { show_local_sources: true, p_groups: std::ptr::null(), p_extra_ips: std::ptr::null() };
                let finder = (self.fn_find_create)(&create);
                if finder.is_null() {
                    return Err("NDIlib_find_create_v2 returned NULL".to_string());
                }
                // Best-effort: a false return just means "no change within the
                // timeout", not an error — we still read whatever is current.
                (self.fn_find_wait_for_sources)(finder, timeout_ms);

                let mut count: u32 = 0;
                let ptr = (self.fn_find_get_current_sources)(finder, &mut count);
                let mut sources = Vec::with_capacity(count as usize);
                if !ptr.is_null() && count > 0 {
                    let raw = std::slice::from_raw_parts(ptr, count as usize);
                    for s in raw {
                        let name = if s.p_ndi_name.is_null() {
                            String::new()
                        } else {
                            CStr::from_ptr(s.p_ndi_name).to_string_lossy().into_owned()
                        };
                        let url_address =
                            if s.p_url_address.is_null() { None } else { Some(CStr::from_ptr(s.p_url_address).to_string_lossy().into_owned()) };
                        sources.push(NdiSourceInfo { name, url_address });
                    }
                }
                // The source list's char* buffers are only valid until this
                // destroy call (or the next get_current_sources) — we've
                // already copied everything into owned Strings above.
                (self.fn_find_destroy)(finder);
                Ok(sources)
            }
        }
    }
}

/// Tries the real dynamically-loaded NDI backend first; falls back to the
/// honest "unavailable" stub with the *specific* reason loading failed
/// (never a generic message) if that doesn't work. This is the only
/// constructor `lib.rs` should use.
pub fn create_ndi_output() -> std::sync::Arc<dyn NdiOutput> {
    #[cfg(windows)]
    {
        match real::DynamicNdi::try_load() {
            Ok(ndi) => return std::sync::Arc::new(ndi),
            Err(reason) => return std::sync::Arc::new(UnavailableNdiOutput::new(reason)),
        }
    }
    #[cfg(not(windows))]
    {
        std::sync::Arc::new(UnavailableNdiOutput::new("NDI backend only implemented for Windows"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stub_status_reports_unavailable_with_reason() {
        let ndi = UnavailableNdiOutput::default();
        let status = ndi.status();
        assert!(!status.available);
        assert_eq!(status.reason.as_deref(), Some("NDI SDK not installed"));
    }

    #[test]
    fn stub_start_always_errs() {
        let ndi = UnavailableNdiOutput::default();
        assert!(ndi.start("test-source").is_err());
    }

    #[test]
    fn stub_send_frame_always_errs() {
        let ndi = UnavailableNdiOutput::default();
        assert!(ndi.send_frame(&[0u8; 16], 2, 2, 30, 1).is_err());
    }

    #[test]
    fn stub_find_sources_always_errs() {
        let ndi = UnavailableNdiOutput::default();
        assert!(ndi.find_sources(500).is_err());
    }
}
