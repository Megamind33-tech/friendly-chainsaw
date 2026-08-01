import { DocumentRenderer, type DocumentRendererProps } from "./DocumentRenderer";
import { useAnimationTicker } from "@/document/timelineEngine";
import {
  isTransitionCurrent,
  transitionMix,
  type SceneTransition,
} from "@/document/sceneTransition";

export interface TransitionCompositorProps extends DocumentRendererProps {
  /** In-flight transition from the envelope, or null. */
  transition?: SceneTransition | null;
}

/**
 * Composites a Take's scene transition.
 *
 * Program has *already* committed to the incoming scene (see
 * `sceneTransition.ts`), so this renders that scene normally and, while a
 * transition is in flight, paints the outgoing scene back on top of it at a
 * falling opacity. That ordering is deliberate: the incoming scene is the
 * truth, and the outgoing one is a temporary overlay that peels away. A
 * consumer that never runs this component — or drops the transition field
 * entirely — still shows the correct final frame, it just cuts instead of
 * mixing.
 *
 * Every consumer derives its own frame from `startedAt` against the wall
 * clock, so the Program window, the Preview window and the sidecar-served
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
  // is the real cost of a dissolve, and it must not outlive the transition.
  useAnimationTicker(running);

  if (!running || !transition || !mix) {
    return <DocumentRenderer {...props} />;
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ opacity: mix.toOpacity }}>
        <DocumentRenderer {...props} />
      </div>
      {mix.fromOpacity > 0 && (
        <div style={{ position: "absolute", inset: 0, opacity: mix.fromOpacity, pointerEvents: "none" }}>
          <DocumentRenderer
            {...props}
            sceneId={transition.fromSceneId}
            // The outgoing scene's own playback, snapshotted before cut()
            // pruned it — without this its timelined layers would render as
            // off-air and pop rather than dissolve.
            layerPlayback={transition.fromLayerPlayback}
            // Never let the scene on its way out keep making sound.
            audible={false}
          />
        </div>
      )}
    </div>
  );
}
