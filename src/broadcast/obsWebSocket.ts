/**
 * Minimal OBS WebSocket v5 client (obs-websocket 5.x protocol).
 * Connects from the Control Room to automate Browser Source setup.
 */

export type ObsConnectionState = "disconnected" | "connecting" | "connected" | "error";

export interface ObsClientConfig {
  host: string;
  port: number;
  password?: string;
}

interface ObsHello {
  obsWebSocketVersion: string;
  rpcVersion: number;
  authentication?: { challenge: string; salt: string };
}

async function sha256Base64(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function buildObsAuth(password: string, salt: string, challenge: string): Promise<string> {
  const secret = await sha256Base64(password + salt);
  return sha256Base64(secret + challenge);
}

export class ObsWebSocketClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private counter = 0;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((e: Error) => void) | null = null;
  private identified = false;

  get isConnected(): boolean {
    return this.identified && this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(config: ObsClientConfig): Promise<void> {
    this.disconnect();
    this.identified = false;

    return new Promise((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      const url = `ws://${config.host}:${config.port}`;
      const ws = new WebSocket(url);
      this.ws = ws;

      const timeout = setTimeout(() => {
        reject(new Error("OBS connection timed out — is OBS running with WebSocket server enabled?"));
        ws.close();
      }, 8000);

      ws.onopen = () => {
        clearTimeout(timeout);
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("OBS WebSocket connection failed"));
      };

      ws.onclose = () => {
        this.identified = false;
        for (const [, p] of this.pending) p.reject(new Error("OBS connection closed"));
        this.pending.clear();
      };

      ws.onmessage = async (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { op: number; d?: Record<string, unknown> };
          await this.handleMessage(msg, config);
        } catch (err) {
          this.connectReject?.(err instanceof Error ? err : new Error(String(err)));
          this.connectReject = null;
        }
      };
    });
  }

  private async handleMessage(msg: { op: number; d?: Record<string, unknown> }, config: ObsClientConfig): Promise<void> {
    const d = msg.d ?? {};

    if (msg.op === 0) {
      const hello = d as unknown as ObsHello;
      const identify: Record<string, unknown> = { rpcVersion: hello.rpcVersion ?? 1 };
      if (hello.authentication && config.password) {
        identify.authentication = await buildObsAuth(
          config.password,
          hello.authentication.salt,
          hello.authentication.challenge,
        );
      } else if (hello.authentication && !config.password) {
        this.connectReject?.(new Error("OBS requires a WebSocket password — set it in OBS → Tools → WebSocket Server Settings"));
        this.connectReject = null;
        this.ws?.close();
        return;
      }
      this.ws?.send(JSON.stringify({ op: 1, d: identify }));
      return;
    }

    if (msg.op === 2) {
      this.identified = true;
      this.connectResolve?.();
      this.connectResolve = null;
      return;
    }

    if (msg.op === 7) {
      const requestId = d.requestId as string | undefined;
      const status = d.requestStatus as { result: boolean; code?: number; comment?: string } | undefined;
      const pending = requestId ? this.pending.get(requestId) : undefined;
      if (!pending) return;
      this.pending.delete(requestId!);
      if (status?.result) {
        pending.resolve(d.responseData ?? {});
      } else {
        pending.reject(new Error(status?.comment ?? `OBS request failed (${status?.code ?? "unknown"})`));
      }
    }
  }

  request<T = Record<string, unknown>>(requestType: string, requestData: Record<string, unknown> = {}): Promise<T> {
    if (!this.isConnected || !this.ws) {
      return Promise.reject(new Error("Not connected to OBS"));
    }
    const requestId = `chase-${++this.counter}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      this.ws!.send(
        JSON.stringify({
          op: 6,
          d: { requestType, requestId, requestData },
        }),
      );
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error(`OBS request timed out: ${requestType}`));
        }
      }, 10000);
    });
  }

  disconnect(): void {
    this.identified = false;
    this.ws?.close();
    this.ws = null;
    for (const [, p] of this.pending) p.reject(new Error("Disconnected"));
    this.pending.clear();
  }
}
