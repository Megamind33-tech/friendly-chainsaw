/**
 * Tiny CDP driver for live in-app verification (the project's established
 * technique for this unregistered dev build — see PLAN.md Phase 5 notes).
 *
 * Usage: bun scripts/cdp-eval.ts "<page title/url substring>" "<expression>"
 *        bun scripts/cdp-eval.ts "<page substring>" @path/to/script.js
 *        bun scripts/cdp-eval.ts --list
 *
 * Connects to the WebView2 remote-debugging port (CDP_PORT, default 9223,
 * 127.0.0.1 — never localhost, which resolves IPv6 first while the debug
 * server binds v4 only) and runs Runtime.evaluate with awaitPromise.
 */
const PORT = process.env.CDP_PORT ?? "9223";

interface CdpPage {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl?: string;
}

async function listPages(): Promise<CdpPage[]> {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`);
  if (!res.ok) throw new Error(`CDP /json HTTP ${res.status}`);
  return (await res.json()) as CdpPage[];
}

async function evaluate(page: CdpPage, expression: string): Promise<unknown> {
  if (!page.webSocketDebuggerUrl) throw new Error(`page ${page.title} has no debugger URL`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(new Error(`WS connect failed: ${String(e)}`));
  });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("evaluate timeout (45s)")), 45_000);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as {
          id?: number;
          result?: { result?: { value?: unknown; description?: string; type?: string }; exceptionDetails?: unknown };
        };
        if (msg.id === 1) {
          clearTimeout(timer);
          if (msg.result?.exceptionDetails) reject(new Error(`page exception: ${JSON.stringify(msg.result.exceptionDetails).slice(0, 800)}`));
          else resolve(msg.result?.result?.value ?? msg.result?.result?.description ?? null);
        }
      };
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    });
  } finally {
    ws.close();
  }
}

async function main() {
  const [filter, exprArg] = process.argv.slice(2);
  const pages = await listPages();
  if (!filter || filter === "--list") {
    for (const p of pages) console.log(`${p.type}  ${p.title}  ${p.url}`);
    return;
  }
  const page = pages.find(
    (p) => p.type === "page" && (p.title.toLowerCase().includes(filter.toLowerCase()) || p.url.toLowerCase().includes(filter.toLowerCase())),
  );
  if (!page) {
    console.error(`no page matching "${filter}" — available:`);
    for (const p of pages) console.error(`  ${p.type}  ${p.title}  ${p.url}`);
    process.exit(1);
  }
  let expression = exprArg ?? "1";
  if (expression.startsWith("@")) {
    expression = await Bun.file(expression.slice(1)).text();
  }
  const value = await evaluate(page, expression);
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

main().catch((err) => {
  console.error("cdp-eval FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
