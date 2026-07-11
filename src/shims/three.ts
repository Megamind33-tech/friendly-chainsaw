/** Re-export the real three.js build, plus MRT compat for realism-effects@1.1.2. */
import { setConsoleFunction, WebGLRenderTarget } from "three-original";

export * from "three-original";

const THREE_CONSOLE_NOISE = [
  /THREE\.Clock:/,
  /THREE\.WebGLProgram: Program Info Log/,
  /THREE\.WebGLRenderer: Context Lost/,
  /Too many active WebGL contexts/,
  /PCFSoftShadowMap/,
  /X4122:.*cannot be represented accurately/,
];

/** R3F / drei still hit r185 deprecations — filter dev-console noise until upstream updates. */
setConsoleFunction((type, message, ...params) => {
  const msg = String(message);
  if (
    type === "warn" &&
    (msg.includes("Clock:") ||
      msg.includes("PCFSoftShadowMap") ||
      msg.includes("Program Info Log") ||
      msg.includes("Context Lost") ||
      msg.includes("Too many active WebGL"))
  ) {
    return;
  }
  if (type === "log") console.log(msg, ...params);
  else if (type === "warn") console.warn(msg, ...params);
  else console.error(msg, ...params);
});

/** Pre-bundled drei/R3F can bypass setConsoleFunction — catch the same noise on console.warn. */
export function installThreeConsoleFilter(): void {
  if (import.meta.env.PROD || (globalThis as { __threeConsoleFilter?: boolean }).__threeConsoleFilter) return;
  (globalThis as { __threeConsoleFilter?: boolean }).__threeConsoleFilter = true;
  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const text = args.map((a) => String(a)).join(" ");
    if (THREE_CONSOLE_NOISE.some((re) => re.test(text))) return;
    origWarn(...args);
  };
}

installThreeConsoleFilter();

type RenderTargetOptions = NonNullable<ConstructorParameters<typeof WebGLRenderTarget>[2]>;

/** Removed in Three r172+; realism-effects still constructs `new WebGLMultipleRenderTargets(w,h,count)`. */
export class WebGLMultipleRenderTargets extends WebGLRenderTarget {
  isWebGLMultipleRenderTargets = true;

  constructor(width: number, height: number, count: number, options?: RenderTargetOptions) {
    super(width, height, { ...options, count });
  }
}

Object.defineProperty(WebGLMultipleRenderTargets.prototype, "texture", {
  get(this: WebGLRenderTarget) {
    return this.textures;
  },
});
