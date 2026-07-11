import { useEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Rect, Text, Group, Image as KonvaImage } from "react-konva";
import lottie, { type AnimationItem } from "lottie-web";
import type { Asset, Element, ImageElement, VideoElement, LottieElement } from "@/document/types";
import { useVideoFeed } from "@/components/set3d/videoFeeds";
import { useBitmap } from "./imageCache";

const DEG2RAD = Math.PI / 180;

/** Konva shadow props from an element's optional `shadow` (Phase 5.6). */
function shadowProps(el: Element): Record<string, unknown> {
  if (!el.shadow) return {};
  return {
    shadowColor: el.shadow.color,
    shadowBlur: el.shadow.blur,
    shadowOffsetX: el.shadow.offsetX,
    shadowOffsetY: el.shadow.offsetY,
    shadowOpacity: el.shadow.opacity ?? 0.5,
  };
}

export interface RenderOptions {
  interactive: boolean;
  /** True only in the Program window — the sole place a video/live source's
   * real audio plays. The editor, Preview, and confidence monitors always
   * stay silent so authoring never feeds back or doubles audio across
   * windows. Defaults to false (silent) when omitted. */
  audible?: boolean;
  /** Project assets, for image elements to resolve their bitmap. */
  assets?: Asset[];
  onSelect?: (id: string, additive: boolean) => void;
  registerNodeRef?: (id: string, node: Konva.Node | null) => void;
  onDragStart?: () => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
  onTransformStart?: () => void;
  onTransformEnd?: (id: string, node: Konva.Node) => void;
  /** Editor-only: double-click a text element to edit it inline on canvas. */
  onRequestEdit?: (id: string) => void;
}

/** EDITOR-ONLY dashed diagnostic box. On air (non-interactive) the caller
 * must render nothing instead — placeholders must never block output. */
function EditorPlaceholder({
  w,
  h,
  label,
  common,
  tone = "info",
}: {
  w: number;
  h: number;
  label: string;
  common: Record<string, unknown>;
  tone?: "info" | "error";
}) {
  return (
    <Group {...common}>
      <Rect width={w} height={h} fill="#060612" stroke="#4a90d9" dash={[4, 4]} />
      <Text
        text={label}
        width={w}
        height={h}
        align="center"
        verticalAlign="middle"
        fill={tone === "error" ? "#cc4444" : "#4a90d9"}
        fontSize={12}
        padding={8}
        wrap="word"
      />
    </Group>
  );
}

/**
 * A live video feed as a 2D graphics element — reuses the same
 * `useVideoFeed`/`VideoSource` machinery the 3D `videofeed` node uses (this
 * is the one leaf in the otherwise-pure renderNodes tree that needs hooks,
 * same pattern as SetNodes.tsx's VideoFeedView). Konva's `<Image>` doesn't
 * repaint on its own when the underlying video frame advances — the video
 * element isn't a Konva-managed resource, so nothing tells the layer a new
 * frame exists — hence the rAF loop below forcing `batchDraw()` every frame
 * while a video is attached.
 */
function VideoElementView({
  el,
  common,
  opts,
}: {
  el: VideoElement;
  common: Record<string, unknown>;
  opts: RenderOptions;
}) {
  // Confidence monitors (program/preview) aren't implemented for 2D graphics
  // yet — a real one would need to recursively re-render the whole Konva
  // stage, not just swap an image source. Honest standby, not a silent no-op.
  const isConfidence = el.source.type === "program" || el.source.type === "preview";
  const { video, error } = useVideoFeed(isConfidence ? { type: "none" } : el.source);
  const imageRef = useRef<Konva.Image | null>(null);

  useEffect(() => {
    if (!video) return;
    let raf: number;
    const tick = () => {
      imageRef.current?.getLayer()?.batchDraw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [video]);

  // Real audio, gated on the window-level `audible` flag (true only in the
  // Program window — see RenderOptions.audible) AND the element's own mute.
  useEffect(() => {
    if (!video) return;
    video.muted = !opts.audible || (el.muted ?? false);
    video.volume = el.volume ?? 1;
  }, [video, opts.audible, el.muted, el.volume]);

  const composedRef = (node: Konva.Image | null) => {
    imageRef.current = node;
    const originalRef = common.ref;
    if (typeof originalRef === "function") (originalRef as (n: Konva.Node | null) => void)(node);
  };

  if (video) {
    // toneMapped has no Konva equivalent — 2D canvas compositing is already
    // "unlit," so the feed's color is shown as-is by construction.
    return <KonvaImage {...common} ref={composedRef} image={video} />;
  }

  // ON AIR an unassigned/failed source renders NOTHING — a diagnostic box
  // over Program/Preview would block the virtual set behind it.
  if (!opts.interactive) return null;

  const label = isConfidence
    ? `${el.name} — confidence monitors not yet supported in 2D graphics`
    : error
      ? `${el.name} — ${error}`
      : el.name;
  return (
    <EditorPlaceholder
      w={el.transform.width}
      h={el.transform.height}
      label={label}
      common={common}
      tone={error || isConfidence ? "error" : "info"}
    />
  );
}

/**
 * Real After-Effects-authored motion graphics — plays a Lottie/Bodymovin
 * asset through `lottie-web`'s canvas renderer, then hands that canvas to
 * Konva as an image source (same "foreign canvas as Konva.Image" trick
 * VideoElementView uses for a `<video>` element). Frame-stepped by hand via
 * `goToAndStop` on a wall-clock timer rather than the library's own
 * autoplay ticker, for the same reason VideoElementView drives its own rAF
 * loop instead of trusting a black-box timer: this component owns exactly
 * when Konva gets told to redraw.
 *
 * Playback position is wall-clock-since-mount, matching how VideoElement's
 * `<video>` already behaves in this engine (its position is also not
 * resynced to the layer's `elapsedSec` — it just plays from when the
 * element mounted). A future pass could thread the layer's `elapsedSec`
 * through `RenderOptions` for perfect resume-on-late-join parity; today
 * this is an honest "starts from the top when it mounts," not a silent
 * mismatch with an existing guarantee.
 */
function LottieElementView({
  el,
  common,
  opts,
}: {
  el: LottieElement;
  common: Record<string, unknown>;
  opts: RenderOptions;
}) {
  const asset = opts.assets?.find((a) => a.id === el.assetId);
  const animRef = useRef<AnimationItem | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<Konva.Image | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setReady(false);
    setFailed(false);
    if (!asset || asset.kind !== "lottie") return;
    const container = document.createElement("div");
    let cancelled = false;
    const anim = lottie.loadAnimation({
      container,
      renderer: "canvas",
      loop: false, // looping is stepped manually below, so speed changes never skip the wrap boundary
      autoplay: false,
      path: asset.src,
    });
    const onLoaded = () => {
      if (cancelled) return;
      canvasElRef.current = container.querySelector("canvas");
      setReady(true);
    };
    const onFailed = () => {
      if (!cancelled) setFailed(true);
    };
    anim.addEventListener("DOMLoaded", onLoaded);
    anim.addEventListener("data_failed", onFailed);
    animRef.current = anim;
    return () => {
      cancelled = true;
      anim.removeEventListener("DOMLoaded", onLoaded);
      anim.removeEventListener("data_failed", onFailed);
      anim.destroy();
      animRef.current = null;
      canvasElRef.current = null;
    };
  }, [asset?.src, asset?.kind]);

  useEffect(() => {
    if (!ready) return;
    const anim = animRef.current;
    if (!anim || anim.totalFrames <= 0) return;
    const durationSec = anim.getDuration(false) || 1;
    const speed = el.speed && el.speed > 0 ? el.speed : 1;
    const loop = el.loop ?? true;
    const startedAt = Date.now();
    let raf: number;
    const tick = () => {
      const elapsedSec = ((Date.now() - startedAt) / 1000) * speed;
      const progress = loop ? (elapsedSec % durationSec) / durationSec : Math.min(elapsedSec / durationSec, 1);
      anim.goToAndStop(progress * anim.totalFrames, true);
      imageRef.current?.getLayer()?.batchDraw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, el.speed, el.loop]);

  const composedRef = (node: Konva.Image | null) => {
    imageRef.current = node;
    const originalRef = common.ref;
    if (typeof originalRef === "function") (originalRef as (n: Konva.Node | null) => void)(node);
  };

  if (ready && canvasElRef.current) {
    return <KonvaImage {...common} ref={composedRef} image={canvasElRef.current} />;
  }

  // ON AIR a missing/loading/failed asset renders nothing — same discipline
  // as every other element view: a diagnostic box must never leak on air.
  if (!opts.interactive) return null;

  const label = !asset
    ? `${el.name} — missing motion graphic asset`
    : failed
      ? `${el.name} — motion graphic failed to load`
      : `${el.name} — loading…`;
  return (
    <EditorPlaceholder
      w={el.transform.width}
      h={el.transform.height}
      label={label}
      common={common}
      tone={!asset || failed ? "error" : "info"}
    />
  );
}

/** Real bitmap rendering for image elements — resolves the element's asset,
 * draws the actual image. Editor shows a diagnostic placeholder while
 * loading/missing/broken; on air those states render nothing. */
function ImageElementView({
  el,
  common,
  opts,
}: {
  el: ImageElement;
  common: Record<string, unknown>;
  opts: RenderOptions;
}) {
  const asset = opts.assets?.find((a) => a.id === el.assetId);
  const { image, failed } = useBitmap(asset && asset.kind === "image" ? asset.src : null);

  if (image) return <KonvaImage {...common} {...shadowProps(el)} image={image} />;
  if (!opts.interactive) return null;

  const label = !asset
    ? `${el.name} — missing image asset`
    : failed
      ? `${el.name} — image failed to load`
      : `${el.name} — loading…`;
  return (
    <EditorPlaceholder
      w={el.transform.width}
      h={el.transform.height}
      label={label}
      common={common}
      tone={!asset || failed ? "error" : "info"}
    />
  );
}

/**
 * Pure Element -> react-konva node mapping. No store, no hooks — this is
 * the single source both the interactive GfxEditor and the non-interactive
 * DocumentRenderer call, so editor and program output can never diverge.
 */
export function renderElement(el: Element, opts: RenderOptions): React.ReactNode {
  if (!el.visible) return null;

  const interactiveProps = opts.interactive
    ? {
        draggable: !el.locked,
        listening: true,
        onClick: (e: Konva.KonvaEventObject<MouseEvent>) => opts.onSelect?.(el.id, e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey),
        onTap: () => opts.onSelect?.(el.id, false),
        onDragStart: () => opts.onDragStart?.(),
        onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => opts.onDragEnd?.(el.id, e.target.x(), e.target.y()),
        onTransformStart: () => opts.onTransformStart?.(),
        onTransformEnd: (e: Konva.KonvaEventObject<Event>) => opts.onTransformEnd?.(el.id, e.target),
        onDblClick: () => opts.onRequestEdit?.(el.id),
        onDblTap: () => opts.onRequestEdit?.(el.id),
        ref: (node: Konva.Node | null) => opts.registerNodeRef?.(el.id, node),
      }
    : { listening: false };

  // `key` deliberately excluded from this object — React requires it be
  // passed directly at each JSX call site below, never through a spread
  // (spreading a `key`-bearing props object only warns, it doesn't apply
  // the key reliably).
  const common = {
    id: el.id,
    x: el.transform.x,
    y: el.transform.y,
    width: el.transform.width,
    height: el.transform.height,
    rotation: el.transform.rotation,
    opacity: el.opacity,
    ...interactiveProps,
  };

  switch (el.kind) {
    case "rect": {
      // Gradient wins over flat fill. Brand-themed panels keep using flat
      // `fill` + a fill binding (the scorebug convention); gradients are for
      // backdrops and gloss bars where one bound color wouldn't make sense.
      // The optional `mid` stop produces the glossy sheen broadcast bars use.
      const gradientProps = el.gradient
        ? {
            fillPriority: "linear-gradient" as const,
            fillLinearGradientStartPoint: { x: 0, y: 0 },
            fillLinearGradientEndPoint:
              el.gradient.direction === "vertical"
                ? { x: 0, y: el.transform.height }
                : el.gradient.direction === "horizontal"
                  ? { x: el.transform.width, y: 0 }
                  : { x: el.transform.width, y: el.transform.height },
            fillLinearGradientColorStops: el.gradient.mid
              ? [0, el.gradient.from, 0.5, el.gradient.mid, 1, el.gradient.to]
              : [0, el.gradient.from, 1, el.gradient.to],
          }
        : {};
      return (
        <Rect
          key={el.id}
          {...common}
          {...shadowProps(el)}
          fill={el.fill}
          {...gradientProps}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
          cornerRadius={el.cornerRadius}
          // Konva skew is a tangent factor; the document stores degrees.
          skewX={el.skewX ? Math.tan(el.skewX * DEG2RAD) : 0}
        />
      );
    }
    case "text":
      return (
        <Text
          key={el.id}
          {...common}
          {...shadowProps(el)}
          text={el.uppercase ? el.text.toUpperCase() : el.text}
          fontFamily={el.fontFamily}
          fontSize={el.fontSize}
          fill={el.fill}
          align={el.align}
          fontStyle={el.fontStyle}
          letterSpacing={el.letterSpacing ?? 0}
        />
      );
    case "image":
      return <ImageElementView key={el.id} el={el} common={common} opts={opts} />;
    case "video":
      return <VideoElementView key={el.id} el={el} common={common} opts={opts} />;
    case "lottie":
      return <LottieElementView key={el.id} el={el} common={common} opts={opts} />;
    case "group":
      return (
        <Group key={el.id} {...common}>
          {el.children.map((child) => renderElement(child, opts))}
        </Group>
      );
  }
}
