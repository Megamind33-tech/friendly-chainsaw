import { useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { RenderSettingsApplier } from "@/components/set3d/Set3dRenderer";
import { SetEnvironmentView, SetNodesView } from "@/components/set3d/SetNodes";
import { AR_CENTER } from "@/ar-engine/nodeUtils";
import {
  completeArSnapshot,
  failArSnapshot,
  subscribeArSnapshotStudio,
  type ArSnapshotJob,
} from "./arTemplateSnapshotQueue";

const CAPTURE_PX = 128;

function SnapshotCapture({ job }: { job: ArSnapshotJob }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (job.layer.props.kind !== "set3d") {
      failArSnapshot(job.id);
      return;
    }
    let cancelled = false;
    invalidate();
    const timers = [0, 120, 350, 700].map((ms) =>
      window.setTimeout(() => {
        if (cancelled) return;
        invalidate();
        if (ms === 700) {
          try {
            completeArSnapshot(job.id, gl.domElement.toDataURL("image/png"));
          } catch {
            failArSnapshot(job.id);
          }
        }
      }, ms),
    );
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [job.id, job.layer, gl, invalidate]);

  if (job.layer.props.kind !== "set3d") return null;
  const { nodes, environment, render } = job.layer.props;

  return (
    <>
      <ThumbInvalidate />
      <RenderSettingsApplier exposure={render.exposure} shadows={false} />
      <SetEnvironmentView environment={environment} render={render} assets={job.assets} />
      <SetNodesView
        nodes={nodes}
        ctx={{
          interactive: false,
          audible: false,
          assets: job.assets,
          render,
          activeCameraId: null,
          project: null,
          programSceneId: null,
          previewSceneId: null,
          confidenceDepth: 0,
          playback: null,
          arHidden: new Set(),
        }}
      />
    </>
  );
}

function ThumbInvalidate() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
  }, [invalidate]);
  return null;
}

/** Hidden singleton renderer — serializes all AR template thumbnail captures. */
export function ArTemplateSnapshotStudio() {
  const [job, setJob] = useState<ArSnapshotJob | null>(null);

  useEffect(() => subscribeArSnapshotStudio(setJob), []);

  if (!job) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed overflow-hidden opacity-0"
      style={{ left: -9999, top: 0, width: CAPTURE_PX, height: CAPTURE_PX }}
    >
      <Canvas
        key={job.id}
        frameloop="demand"
        dpr={1}
        shadows={false}
        camera={{ position: [0, AR_CENTER.y, 4.2], fov: 50, near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "low-power" }}
        style={{ width: CAPTURE_PX, height: CAPTURE_PX }}
      >
        <SnapshotCapture job={job} />
      </Canvas>
    </div>
  );
}
