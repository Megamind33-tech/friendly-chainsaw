import { useEffect, useState } from "react";

/**
 * Shared bitmap loader for 2D image elements — one HTMLImageElement per URL
 * regardless of how many elements show it, with load/error state pushed to
 * every subscribed consumer (the Konva counterpart of videoFeeds.ts).
 */

interface ImageEntry {
  img: HTMLImageElement;
  ready: boolean;
  failed: boolean;
  listeners: Set<() => void>;
}

const images = new Map<string, ImageEntry>();

function acquire(url: string): ImageEntry {
  let entry = images.get(url);
  if (!entry) {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    entry = { img, ready: false, failed: false, listeners: new Set() };
    images.set(url, entry);
    img.onload = () => {
      entry!.ready = true;
      entry!.listeners.forEach((l) => l());
    };
    img.onerror = () => {
      entry!.failed = true;
      entry!.listeners.forEach((l) => l());
    };
    img.src = url;
  }
  return entry;
}

export interface BitmapState {
  image: HTMLImageElement | null;
  failed: boolean;
}

export function useBitmap(url: string | null): BitmapState {
  const [, bump] = useState(0);

  useEffect(() => {
    if (!url) return;
    const entry = acquire(url);
    const listener = () => bump((n) => n + 1);
    entry.listeners.add(listener);
    // May already be ready (second consumer of a cached bitmap).
    listener();
    return () => {
      entry.listeners.delete(listener);
    };
  }, [url]);

  const entry = url ? images.get(url) : undefined;
  return {
    image: entry?.ready ? entry.img : null,
    failed: entry?.failed ?? false,
  };
}
