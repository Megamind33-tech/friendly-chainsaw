import { useEffect, useRef } from "react";
import { DocumentRenderer, type DocumentRendererProps } from "./DocumentRenderer";
import { useAnimationTicker } from "@/document/timelineEngine";
import {
  isTransitionCurrent,
  transitionMix,
  wipeMaskGradient,
  type SceneTransition,
  type WipeGeometry,
} from "@/document/sceneTransition";
import type { Asset } from "@/document/types";

export interface TransitionCompositorProps extends DocumentRendererProps {
  /** In-flight transition from the envelope, or null. */
  transition?: SceneTransition | null;
}

/** Both prefixed and unprefixed: Chromium only unprefixed `mask-image`
 * relatively recently, and WebView2's version tracks the installed Edge
 * runtime, which on an operator's machine is not something we control. */
function maskStyle(gradient: string): React.CSSProperties {
  return {
    WebkitMaskImage: gradient,
    maskImage: gradient,
    // Without this a mask that is narrower than the box tiles, which puts a
    // second ghost edge on screen partway through the wipe.
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
  };
}

/**
 * Full-frame stinger clip, played over the scene change.
 *
 * Seeks to the transition's own elapsed time on mount rather than just
 * calling `play()`: a window that joins mid-transition (Program opened late,
 * OBS reconnecting, a Browser Source refreshed) must land at the same frame
 * as everyone else, not restart the clip from zero.
 *
 * Always muted. Stinger audio would need the output audio path that does not
 * exist yet (see AUDIT-2026-08.md S2-11), and unmuted autoplay is subject to
 * browser gesture policy in a window the operator never clicked — so it would
 * be an unreliable promise, not a feature.
 */
function StingerOverlay({ src, elapsedSec }: { src: string; elapsedSec: number }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.currentTime = elapsedSec;
    void video.play().catch(() => {
      // A blocked or interrupted play must not take Program down; the scene
      // change underneath still happens on time.
    });
    // Deliberately mount-only: re-seeking every frame would fight playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      muted
      playsInline
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}

function resolveStinger(assets: Asset[] | undefined, assetId: string | undefined): string | null {
  if (!assetId) return null;
  const asset = assets?.find((a) => a.id === assetId);
  // A deleted or wrong-kind asset renders nothing rather than a broken <video>
  // box — the scene change under it still lands correctly, so the worst case
  // degrades to a visible hard cut, never to a stuck or blank Program.
  return asset && asset.kind === "video" ? asset.src : null;
}

/**
 * Composites a Take's scene transition.
 *
 * Program has *already* committed to the incoming scene (see
 * `sceneTransition.ts`), so this renders that scene normally and, while a
 * transition is in flight, paints the outgoing scene back on top of it. How
 * the two are combined depends on the type:
 *
 *   * dissolve / dip to clear — opacity on the outgoing layer
 *   * wipes — both layers fully opaque, complementary mask gradients
 *   * stinger — a hard swap at `cutAt` under a full-frame clip
 *
 * A consumer that never runs this component — or drops the transition field
 * entirely — still shows the correct final frame, it just cuts instead.
 *
 * Every consumer derives its own frame from `startedAt` against the wall
 * clock, so the Program window, the multiviewer and the sidecar-served
 * renderer OBS reads all reconstruct the same mid-mix frame with no
 * synchronisation between them.
 */
export function TransitionCompositor({ transition, ...props }: TransitionCompositorProps) {
  const active = isTransitionCurrent(transition ?? null, props.programSceneId ?? null);
  const mix = active && transition ? transitionMix(transition, Date.now()) : null;
  const running = mix !== null && !mix.done;

  // Drive frames only for as long as the mix is actually moving. Once it
  // settles the ticker stops and the outgoing scene unmounts, which also
  // releases any WebGL contexts its set3d layers held — rendering two scenes
  // is the real cost of a transition, and it must not outlive one.
  useAnimationTicker(running);

  if (!running || !transition || !mix) {
    return <DocumentRenderer {...props} />;
  }

  const wipe: WipeGeometry | null = mix.wipe;
  const stingerSrc =
    mix.stingerElapsedSec !== null ? resolveStinger(props.project?.assets, transition.stingerAssetId) : null;

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          opacity: mix.toOpacity,
          ...(wipe ? maskStyle(wipeMaskGradient(wipe, true)) : null),
        }}
      >
        <DocumentRenderer {...props} />
      </div>
      {mix.fromOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: mix.fromOpacity,
            pointerEvents: "none",
            ...(wipe ? maskStyle(wipeMaskGradient(wipe, false)) : null),
          }}
        >
          <DocumentRenderer
            {...props}
            sceneId={transition.fromSceneId}
            // The outgoing scene's own playback, snapshotted before cut()
            // pruned it — without this its timelined layers would render as
            // off-air and pop rather than transition.
            layerPlayback={transition.fromLayerPlayback}
            // Never let the scene on its way out keep making sound.
            audible={false}
          />
        </div>
      )}
      {stingerSrc && mix.stingerElapsedSec !== null && (
        // Above both scenes: the clip's whole job is to cover the cut.
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <StingerOverlay src={stingerSrc} elapsedSec={mix.stingerElapsedSec} />
        </div>
      )}
    </div>
  );
}
