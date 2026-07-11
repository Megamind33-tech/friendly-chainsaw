/** Interrupt a busy page and print the JS stack — CDP Debugger.pause. */
const PORT = process.env.CDP_PORT ?? "9222";

async function main() {
  const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) as {
    type: string;
    url: string;
    title: string;
    webSocketDebuggerUrl?: string;
  }[];
  const page = pages.find((p) => p.type === "page" && p.url.includes(process.argv[2] ?? "1423"));
  if (!page?.webSocketDebuggerUrl) throw new Error("page not found");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise<void>((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error("ws failed"));
  });
  let id = 0;
  const send = (method: string, params?: unknown) => ws.send(JSON.stringify({ id: ++id, method, params }));
  const done = new Promise<void>((resolve) => {
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as {
        method?: string;
        params?: { callFrames?: { functionName: string; url: string; location: { lineNumber: number } }[] };
      };
      if (msg.method === "Debugger.paused") {
        const frames = msg.params?.callFrames ?? [];
        console.log("PAUSED — top frames:");
        for (const f of frames.slice(0, 25)) {
          console.log(`  ${f.functionName || "(anon)"}  ${f.url.split("/").slice(-2).join("/")}:${f.location.lineNumber}`);
        }
        send("Debugger.resume");
        setTimeout(() => {
          ws.close();
          resolve();
        }, 300);
      }
    };
  });
  send("Debugger.enable");
  send("Debugger.pause");
  await Promise.race([done, new Promise((r) => setTimeout(r, 20000))]);
  ws.close();
}

main().catch((e) => {
  console.error("cdp-stack failed:", e);
  process.exit(1);
});
