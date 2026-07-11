import { useEffect, useRef, useState } from "react";
import type { Project, ID } from "./types";
import type { LayerPlayback } from "./playbackState";
import type { CameraMove, CameraOrbit } from "./cameraMoves";
import type { ArFocus } from "./arFocus";
import { parseRenderEnvelope } from "./renderEnvelope";

const STREAM_URL = "http://127.0.0.1:4977/document/stream";
const DOCUMENT_URL = "http://127.0.0.1:4977/document";
/** Only used at startup (before the stream connects) and as a fallback if
 * it can't connect at all (older sidecar build, network hiccup). */
const POLL_FALLBACK_MS = 100;

export interface DocumentEnvelope {
  project: Project | null;
  programSceneId: string | null;
  previewSceneId: string | null;
  layerPlayback?: Record<ID, LayerPlayback>;
  /** Transient camera motion (see cameraMoves.ts) — absent on older pushes. */
  cameraMoves?: Record<ID, CameraMove>;
  cameraOrbits?: Record<ID, CameraOrbit>;
  cameraPreview?: Record<ID, ID>;
  arFocus?: Record<ID, ArFocus>;
}

/**
 * Real-time program/preview document sync. Connects to the sidecar's
 * `/document/stream` Server-Sent Events endpoint (see lib.rs's
 * `document_stream_handler`) so a Play In/Out or Timeline command reaches
 * this window the instant it's pushed, with sub-millisecond loopback
 * latency — not on the next poll tick. This is what makes short (0.3-1.2s)
 * authored animations actually visible instead of "snapping" straight to
 * their resting state: the old pure-polling design (1000ms, later 100ms as
 * a stopgap) could easily miss a layer's entire tween window before ever
 * rendering an in-between frame (see PLAN.md, 2026-07-07).
 *
 * SSE rather than a WebSocket: the data only ever flows server -> client
 * (a window never has anything to send back), and `EventSource` gives free
 * built-in auto-reconnect with no client-side reconnect/backoff code needed.
 *
 * Falls back to fast polling if the stream can't connect at all — an honest
 * degrade (the window still updates, just coarser) rather than a silent
 * dead window. Also polls once immediately in parallel with the connect
 * attempt so the very first paint doesn't wait on the handshake.
 */
export function useDocumentEnvelope(): DocumentEnvelope | null {
  const [envelope, setEnvelope] = useState<DocumentEnvelope | null>(null);
  const lastTextRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;

    const applyText = (text: string) => {
      if (!text || text === lastTextRef.current) return;
      lastTextRef.current = text;
      try {
        const next = parseRenderEnvelope(JSON.parse(text));
        if (next) setEnvelope(next);
      } catch {
        // A torn/partial frame — the next message (stream) or tick (poll)
        // lands correctly, so this is silently skippable, not fatal.
      }
    };

    const stopPolling = () => {
      if (pollId) {
        clearInterval(pollId);
        pollId = null;
      }
    };

    const startPolling = () => {
      if (pollId || cancelled) return;
      const poll = async () => {
        try {
          const res = await fetch(DOCUMENT_URL);
          applyText(await res.text());
        } catch (err) {
          console.error("document poll failed", err);
        }
      };
      poll();
      pollId = setInterval(poll, POLL_FALLBACK_MS);
    };

    source = new EventSource(STREAM_URL);
    source.onopen = () => stopPolling();
    source.onmessage = (ev) => applyText(ev.data);
    // EventSource retries the connection itself (browser-native, no backoff
    // code needed here) — onerror just means "we don't know when it'll be
    // back," so keep the window alive via polling until onopen fires again.
    source.onerror = () => startPolling();
    startPolling();

    return () => {
      cancelled = true;
      stopPolling();
      source?.close();
    };
  }, []);

  return envelope;
}
