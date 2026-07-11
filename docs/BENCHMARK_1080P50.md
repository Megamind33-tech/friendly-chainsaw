# 1080p50 Broadcast Benchmark

Run the production renderer on the weakest supported Windows machine.

1. Launch the packaged renderer through the normal output route: `http://127.0.0.1:4977/program?benchmark=1`.
2. Exercise every camera, AR graphic, video wall, ticker, take, and source-loss fallback for a representative show duration.
3. In DevTools, record `window.chaseRendererBenchmark.snapshot()` at the end of the run.
4. Record GPU dedicated-memory peak from Windows Task Manager or GPUView alongside the browser result. WebView2 does not expose trustworthy VRAM to JavaScript, so `vramMb` is deliberately `null` rather than fabricated.
5. Measure glass-to-glass latency with a flash-frame or clap test at the final OBS/vMix/NDI destination.

Acceptance for the current 1080p50 target: renderer p95 at or below 16 ms, p99 at or below 20 ms, zero sustained dropped frames, and at least 20% GPU-frame-time headroom. Do not enable a Spout or native-libobs path until this baseline shows Browser Source/NDI latency is outside the production requirement.

Capture the machine CPU, GPU, RAM, VRAM, driver version, Windows version, quality tier, resolution, FPS, colour path, output adapter, average/p95/p99, dropped frames, JS heap, GPU dedicated memory, soak duration, and end-to-end latency in the show record.
