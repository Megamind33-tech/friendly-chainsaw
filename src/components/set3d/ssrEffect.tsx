import { useContext, useEffect, useLayoutEffect, useMemo } from "react";
import { EffectComposerContext } from "@react-three/postprocessing";
import { SSREffect, VelocityDepthNormalPass } from "realism-effects";

/** Conservative SSR budget for broadcast sets — half-res trace, modest steps.
 * High tier + explicit `ssr.enabled` only; see REALISM_PIPELINE.md §3.4. */
const SSR_OPTIONS = {
  resolutionScale: 1,
  steps: 20,
  refineSteps: 6,
  distance: 12,
  blend: 0.65,
  denoiseIterations: 2,
} as const;

/** realism-effects SSR pass wired into @react-three/postprocessing's composer.
 * VelocityDepthNormalPass must mount on the composer before the EffectPass
 * that hosts SSREffect — same integration pattern as the library's examples. */
export function SsrRealismEffect() {
  const ctx = useContext(EffectComposerContext);
  if (!ctx) return null;
  const { scene, camera, composer } = ctx;

  const velocityPass = useMemo(() => new VelocityDepthNormalPass(scene, camera), [scene, camera]);

  useLayoutEffect(() => {
    composer.addPass(velocityPass);
    return () => {
      composer.removePass(velocityPass);
      velocityPass.dispose();
    };
  }, [composer, velocityPass]);

  const ssrEffect = useMemo(
    () => new SSREffect(scene, camera, velocityPass, SSR_OPTIONS),
    [scene, camera, velocityPass],
  );

  useEffect(() => () => ssrEffect.dispose(), [ssrEffect]);

  return <primitive object={ssrEffect} />;
}
