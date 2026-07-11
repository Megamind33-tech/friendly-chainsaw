# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Fresh Windows Dev Run

Use `npm.cmd run dev:fresh` for verification runs that must start from a genuinely fresh Tauri/WebView2 process. It runs `scripts/kill-dev.ps1` first, then launches `bun.exe run tauri dev`.

If you prefer Bun directly from PowerShell, use `bun.exe run dev:fresh`. The explicit `.exe` avoids Windows execution-policy failures from the npm-installed `bun.ps1` shim.

The cleanup script stops `broadcast-engine.exe`, Vite/Tauri listeners on the project dev ports, and app-scoped `msedgewebview2.exe` orphans. This matters on Windows because WebView2 renderer processes can outlive the Tauri host and keep stale page state alive.

CDP gotcha: the app's WebView2 debug port is fixed at `9222` in `src-tauri/tauri.conf.json`. If a stale renderer holds that port, a relaunch can look fresh while CDP attaches to the old page. After `npm.cmd run dev:fresh`, inspect CDP at `http://127.0.0.1:9222/json`; use `127.0.0.1`, not `localhost`, because the debug server binds IPv4.

Use `npm.cmd run dev:clean` when you only want the cleanup step without relaunching.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
