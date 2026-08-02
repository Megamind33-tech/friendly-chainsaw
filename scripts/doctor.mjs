/**
 * Preflight check for `bun run tauri dev`.
 *
 * `tauri dev` compiles the whole Rust dependency tree before it can tell you
 * that a linker is missing — so a five-second prerequisite mistake costs ten
 * minutes to discover. This checks everything that has to be true first, and
 * names the exact fix for whatever is not.
 *
 * Run: `bun run doctor`
 */
import { execSync } from "node:child_process";
import net from "node:net";
import { existsSync } from "node:fs";
import { platform } from "node:os";

const OK = "\x1b[32m  ok  \x1b[0m";
const WARN = "\x1b[33m warn \x1b[0m";
const FAIL = "\x1b[31m fail \x1b[0m";

let failures = 0;
let warnings = 0;

function report(state, label, detail) {
  console.log(`${state} ${label}${detail ? `\n         ${detail}` : ""}`);
  if (state === FAIL) failures++;
  if (state === WARN) warnings++;
}

function version(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n")[0];
  } catch {
    return null;
  }
}

function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.setTimeout(700);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

const os = platform();
console.log(`\nBroadcast Graphics Engine — preflight (${os})\n`);

// --- Toolchain --------------------------------------------------------------

const node = version("node --version");
report(node ? OK : FAIL, `Node ${node ?? ""}`, node ? "" : "Install Node 20+ from https://nodejs.org");

const bun = version("bun --version");
report(
  bun ? OK : WARN,
  `Bun ${bun ?? "(not found)"}`,
  bun ? "" : "npm install -g bun  —  or use npm/pnpm instead; bun is not required",
);

const cargo = version("cargo --version");
report(
  cargo ? OK : FAIL,
  `Rust ${cargo ?? "(not found)"}`,
  cargo ? "" : "Install from https://rustup.rs — the desktop app cannot build without it",
);

// --- Platform build prerequisites -------------------------------------------
//
// These are the ones that fail AFTER a long compile, which is exactly why they
// are worth checking up front.

if (os === "win32") {
  // Tauri links with MSVC. Without the C++ workload the failure is a
  // "linker `link.exe` not found" at the very end of the build.
  const hasLink = version("where link.exe") || version("where cl.exe");
  report(
    hasLink ? OK : FAIL,
    "MSVC build tools",
    hasLink
      ? ""
      : "Install Visual Studio Build Tools with the 'Desktop development with C++' workload:\n         https://visualstudio.microsoft.com/visual-cpp-build-tools/\n         (a plain `where link.exe` outside a Developer Prompt can miss it — if the build works, ignore this)",
  );

  // WebView2 is present on Windows 11 and most patched Windows 10.
  const webview2 =
    existsSync("C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\Application") ||
    existsSync("C:\\Program Files\\Microsoft\\EdgeWebView\\Application");
  report(
    webview2 ? OK : WARN,
    "WebView2 runtime",
    webview2 ? "" : "Not detected. Windows 11 ships it; otherwise install the Evergreen runtime:\n         https://developer.microsoft.com/microsoft-edge/webview2/",
  );
} else if (os === "darwin") {
  const xcode = version("xcode-select -p");
  report(xcode ? OK : FAIL, "Xcode command line tools", xcode ? "" : "xcode-select --install");
} else {
  // Tauri on Linux needs the GTK/WebKit stack; cargo fails at gdk-sys without it.
  const pkg = version("pkg-config --modversion gtk+-3.0");
  report(
    pkg ? OK : FAIL,
    `GTK 3 ${pkg ?? "(not found)"}`,
    pkg
      ? ""
      : "sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev",
  );
  const webkit = version("pkg-config --modversion webkit2gtk-4.1");
  report(webkit ? OK : FAIL, `WebKit2GTK ${webkit ?? "(not found)"}`, webkit ? "" : "See the GTK line above.");
}

// --- Project state ----------------------------------------------------------

report(
  existsSync("node_modules") ? OK : FAIL,
  "Dependencies installed",
  existsSync("node_modules") ? "" : "bun install",
);

// --- Ports ------------------------------------------------------------------
//
// A stale process holding either port is the single most common reason a
// relaunch looks fine but behaves oddly — the app reuses someone else's server.

for (const [port, what] of [
  [1423, "Vite dev server"],
  [4977, "output sidecar"],
  [9222, "WebView2 debug"],
]) {
  const busy = await portBusy(port);
  report(
    busy ? WARN : OK,
    `Port ${port} (${what}) ${busy ? "IN USE" : "free"}`,
    busy
      ? os === "win32"
        ? "A previous run may still be alive. Run: npm.cmd run dev:clean"
        : `Find it with: lsof -i :${port}`
      : "",
  );
}

// --- Summary ----------------------------------------------------------------

console.log("");
if (failures > 0) {
  console.log(`\x1b[31m${failures} blocking problem(s)\x1b[0m — fix these before \`bun run tauri dev\`.`);
  process.exit(1);
}
if (warnings > 0) {
  console.log(`\x1b[33m${warnings} warning(s)\x1b[0m — \`bun run tauri dev\` should still work.`);
} else {
  console.log("\x1b[32mAll clear\x1b[0m — run: bun run tauri dev");
}
console.log("");
