/**
 * Type declarations for vite-alias-only module names (see vite.config.ts):
 *
 * - `three-original` maps to the REAL three.js build (the bare `three`
 *   specifier resolves to src/shims/three.ts at runtime so realism-effects
 *   gets its removed WebGLMultipleRenderTargets back). For TypeScript the
 *   real package's types are exactly right.
 * - `realism-effects` ships no types at all (plain .cjs dist).
 */
declare module "three-original" {
  export * from "three";
}

declare module "realism-effects";
