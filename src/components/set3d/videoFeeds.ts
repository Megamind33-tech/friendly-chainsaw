import { useEffect, useState } from "react";
import type { VideoSource } from "@/document/types";

/**
 * Live video feed manager for `videofeed` nodes. Each distinct source
 * (capture device / screen share / URL) gets exactly one HTMLVideoElement +
 * MediaStream, refcounted across every plane that displays it — two LED
 * walls showing "CAM 1" share one getUserMedia stream, and releasing the
 * last consumer stops the hardware capture.
 *
 * These are real feeds only: a source that fails to open reports its error
 * to the consumer (rendered as the standby panel), never a fake picture.
 */

interface FeedEntry {
  video: HTMLVideoElement;
  stream: MediaStream | null;
  refCount: number;
  ready: boolean;
  error: string | null;
  /** Consumers waiting for ready/error state changes. */
  listeners: Set<() => void>;
}

const feeds = new Map<string, FeedEntry>();

export function videoSourceKey(source: VideoSource): string {
  switch (source.type) {
    case "none":
      return "none";
    case "device":
      return `device:${source.deviceId}`;
    case "screen":
      return "screen";
    case "url":
      return `url:${source.url}`;
    // Confidence-monitor sources never reach this module — VideoFeedView
    // (SetNodes.tsx) routes them to ConfidenceMonitorView (a render-texture
    // re-render, not a MediaStream) before useVideoFeed is ever called.
    case "program":
      return "program";
    case "preview":
      return "preview";
  }
}

function notify(entry: FeedEntry) {
  for (const listener of entry.listeners) listener();
}

async function openSource(entry: FeedEntry, source: VideoSource): Promise<void> {
  const { video } = entry;
  try {
    if (source.type === "device") {
      // Real audio capture: request the mic alongside the camera. A device
      // with no microphone simply yields a track-less audio (silent), it
      // doesn't fail the whole request. The element itself opens muted
      // (below) so autoplay is never blocked; consumers that want it
      // audible flip `.muted`/`.volume` afterward — see VideoElementView /
      // LiveVideoFeedView, both gated on the window-level `audible` flag.
      entry.stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: source.deviceId } },
        audio: true,
      });
      video.srcObject = entry.stream;
    } else if (source.type === "screen") {
      // `audio: true` here requests system/tab audio share (Chromium shows
      // a "share audio" checkbox) — real signal when the operator grants it.
      entry.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      video.srcObject = entry.stream;
    } else if (source.type === "url") {
      video.crossOrigin = "anonymous";
      video.loop = true;
      video.src = source.url;
    }
    await video.play();
    entry.ready = true;
    notify(entry);
  } catch (err) {
    entry.error = err instanceof Error ? err.message : String(err);
    notify(entry);
  }
}

function acquire(source: VideoSource): FeedEntry | null {
  // Confidence-monitor sources are handled entirely by ConfidenceMonitorView
  // (a render-texture re-render), never a real MediaStream — see VideoFeedView.
  if (source.type === "none" || source.type === "program" || source.type === "preview") return null;
  const key = videoSourceKey(source);
  let entry = feeds.get(key);
  if (!entry) {
    const video = document.createElement("video");
    // Muted-on-creation is required for the browser to allow autoplay
    // without a user gesture; toggling `.muted` on an already-playing
    // element afterward is allowed (unlike calling `.play()` unmuted cold),
    // so consumers safely unmute it later based on the node's authored
    // `muted`/`volume` and the window's `audible` flag.
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    entry = { video, stream: null, refCount: 0, ready: false, error: null, listeners: new Set() };
    feeds.set(key, entry);
    void openSource(entry, source);
  }
  entry.refCount += 1;
  return entry;
}

function release(source: VideoSource) {
  const key = videoSourceKey(source);
  const entry = feeds.get(key);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    entry.stream?.getTracks().forEach((t) => t.stop());
    entry.video.srcObject = null;
    entry.video.removeAttribute("src");
    feeds.delete(key);
  }
}

export interface VideoFeedState {
  /** Non-null once the source is actually producing frames. */
  video: HTMLVideoElement | null;
  error: string | null;
}

/** Subscribes a component to a live feed for the lifetime of its mount. */
export function useVideoFeed(source: VideoSource): VideoFeedState {
  const key = videoSourceKey(source);
  const [, bump] = useState(0);

  useEffect(() => {
    if (source.type === "none") return;
    const entry = acquire(source);
    if (!entry) return;
    const listener = () => bump((n) => n + 1);
    entry.listeners.add(listener);
    // The entry may already be ready (second consumer of a live feed).
    listener();
    return () => {
      entry.listeners.delete(listener);
      release(source);
    };
    // Re-acquire only when the source identity changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const entry = source.type === "none" ? undefined : feeds.get(key);
  return {
    video: entry?.ready ? entry.video : null,
    error: entry?.error ?? null,
  };
}

/** Real capture devices on this machine, for the Inspector's source picker. */
export async function listVideoInputDevices(): Promise<{ deviceId: string; label: string }[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "videoinput")
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}
