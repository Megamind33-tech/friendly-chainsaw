import "@/shims/three";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

/**
 * Root error boundary — a render crash anywhere in the tree must NEVER
 * black out the whole window (hit twice live: a bad env-map file, then a
 * missing import in one panel — both times the app showed nothing and
 * looked dead while its module-level code kept running). Broadcast software
 * fails visibly and recoverably: show what broke, offer reload.
 */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("root error boundary caught:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: "#0a0e1c",
          color: "#c8d2e8",
          fontFamily: "monospace",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: "#e05555" }}>
          RENDERER ERROR — the engine is still running
        </div>
        <div style={{ fontSize: 11, maxWidth: 640, opacity: 0.85, whiteSpace: "pre-wrap" }}>
          {this.state.error.message}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8,
            padding: "8px 20px",
            fontFamily: "monospace",
            fontSize: 12,
            fontWeight: 700,
            color: "#9ed8ff",
            background: "transparent",
            border: "1px solid #2a6fb0",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          RELOAD WINDOW
        </button>
        <div style={{ fontSize: 10, opacity: 0.5 }}>
          Your project is safe — it autosaves to disk and reloads on relaunch.
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
);
