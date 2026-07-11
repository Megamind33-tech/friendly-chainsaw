/** Dump buffered console messages/exceptions from a page via CDP —
 * Runtime.enable replays buffered entries to a newly attached client. */
const PORT = process.env.CDP_PORT ?? "9222";

async function main() {
  const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) as {
    type: string;
    url: string;
    webSocketDebuggerUrl?: string;
  }[];
  const page = pages.find((p) => p.type === "page" && p.url.includes(process.argv[2] ?? "1423"));
  if (!page?.webSocketDebuggerUrl) throw new Error("page not found");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise<void>((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error("ws failed"));
  });
  const lines: string[] = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data)) as {
      method?: string;
      params?: {
        args?: { value?: unknown; description?: string }[];
        type?: string;
        exceptionDetails?: { text?: string; exception?: { description?: string } };
        stackTrace?: { callFrames?: { functionName: string; url: string; lineNumber: number }[] };
      };
    };
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = (msg.params?.args ?? [])
        .map((a) => (typeof a.value === "string" ? a.value : (a.description ?? JSON.stringify(a.value))))
        .join(" ");
      const top = msg.params?.stackTrace?.callFrames?.slice(0, 4).map((f) => `${f.functionName}@${f.url.split("/").pop()}:${f.lineNumber}`) ?? [];
      lines.push(`[${msg.params?.type}] ${text.slice(0, 1200)}\n    ${top.join("  ")}`);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      lines.push(`[exception] ${msg.params?.exceptionDetails?.exception?.description?.slice(0, 1200) ?? msg.params?.exceptionDetails?.text}`);
    }
  };
  ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
  await new Promise((r) => setTimeout(r, 4000));
  const filter = process.argv[3];
  for (const l of lines) {
    if (!filter || l.toLowerCase().includes(filter.toLowerCase())) console.log(l + "\n");
  }
  console.log(`(${lines.length} total console entries)`);
  ws.close();
}

main().catch((e) => {
  console.error("cdp-console failed:", e);
  process.exit(1);
});
