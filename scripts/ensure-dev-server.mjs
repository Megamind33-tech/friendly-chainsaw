/**
 * Tauri beforeDevCommand hook — start Vite only if the dev port is free.
 * Port is fixed at 1423 (must match src-tauri/tauri.conf.json devUrl).
 */
import { spawn } from "node:child_process";
import net from "node:net";

const DEV_PORT = 1423;

async function devServerReachable() {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    try {
      const res = await fetch(`http://${host}:${DEV_PORT}/`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      // try next host
    }
  }
  return false;
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

if (await devServerReachable()) {
  console.log(`[ensure-dev-server] already running on port ${DEV_PORT}`);
  process.exit(0);
}

if (await portInUse(DEV_PORT)) {
  console.log(`[ensure-dev-server] port ${DEV_PORT} is busy — reusing existing Vite`);
  process.exit(0);
}

console.log(`[ensure-dev-server] starting Vite on port ${DEV_PORT}...`);
const child = spawn("bun", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, VITE_DEV_PORT: String(DEV_PORT) },
});

child.on("exit", (code) => process.exit(code ?? 1));
