import { useEffect, useState } from "react";
import ControlRoomView from "./views/ControlRoomView";
import ProgramView from "./views/ProgramView";
import PreviewView from "./views/PreviewView";

/**
 * Hash-based view selection: each Tauri window loads the same SPA at a
 * fixed url (see src-tauri/tauri.conf.json). Hash never touches the
 * server/asset-protocol, so this works identically in dev and in the
 * packaged app without needing history-fallback routing.
 */
function resolveView(hash: string): "control-room" | "program" | "preview" {
  if (hash.startsWith("#/program")) return "program";
  if (hash.startsWith("#/preview")) return "preview";
  return "control-room";
}

function App() {
  const [view, setView] = useState(() => resolveView(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setView(resolveView(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (view === "program") return <ProgramView />;
  if (view === "preview") return <PreviewView />;
  return <ControlRoomView />;
}

export default App;
