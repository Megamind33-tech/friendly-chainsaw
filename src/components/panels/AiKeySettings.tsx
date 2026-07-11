import { useEffect, useState } from "react";
import { getAiSettingsStatus, setOpenAiApiKey, clearOpenAiApiKey, type AiSettingsStatus } from "@/document/aiSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Key, ShieldCheck, Eye, EyeOff, Settings2 } from "lucide-react";

/**
 * OpenAI API key configuration for AI image generation. The key is
 * write-only from here: `setOpenAiApiKey` sends it once to be stored in a
 * Rust-only settings file next to the assets dir, and this component never
 * receives it back — only a `configured` boolean. The actual OpenAI call
 * happens entirely server-side (the axum sidecar), so the key never sits in
 * the web layer beyond the single save request.
 */
export function AiKeySettings() {
  const [status, setStatus] = useState<AiSettingsStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    getAiSettingsStatus()
      .then((s) => {
        setStatus(s);
        setModelInput(s.model ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await setOpenAiApiKey(keyInput, modelInput.trim() || undefined);
      setKeyInput("");
      setOpen(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    setError(null);
    try {
      await clearOpenAiApiKey();
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5 rounded border border-border-subtle bg-bg-panel p-2">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 text-left">
        <Settings2 className="h-3 w-3 text-text-muted" />
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">AI Image (OpenAI)</span>
        <span className="ml-auto flex items-center gap-1 font-mono text-[9px]">
          {status?.configured ? (
            <span className="flex items-center gap-1 text-accent-blue-bright">
              <ShieldCheck className="h-3 w-3" /> key configured
            </span>
          ) : (
            <span className="text-live-amber">no key set</span>
          )}
        </span>
      </button>

      {open && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-1">
            <Key className="h-3 w-3 shrink-0 text-text-muted" />
            <Input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={status?.configured ? "•••••••••••••• (replace)" : "sk-..."}
              className="h-7 flex-1 border-border-subtle bg-bg-surface font-mono text-[10px] text-text-muted-alt"
            />
            <button onClick={() => setShowKey((v) => !v)} className="shrink-0 text-text-muted hover:text-accent-blue-bright" title={showKey ? "Hide" : "Show"}>
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <Input
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            placeholder="model override (optional, default gpt-image-2)"
            className="h-7 border-border-subtle bg-bg-surface font-mono text-[10px] text-text-muted-alt"
          />
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" disabled={saving || !keyInput.trim()} onClick={save} className="flex-1 border-border-subtle bg-bg-surface text-[10px] text-text-muted-alt">
              Save key
            </Button>
            <Button size="sm" variant="outline" disabled={saving || !status?.configured} onClick={clear} className="border-border-subtle bg-bg-surface text-[10px] text-live-red">
              Clear
            </Button>
          </div>
          <p className="font-mono text-[9px] leading-relaxed text-text-muted">
            Stored locally in a Rust-only settings file (never in the document or browser storage) and used only by
            the sidecar's own OpenAI calls. Never re-displayed once saved.
          </p>
        </div>
      )}

      {error && <div className="font-mono text-[10px] text-live-red">{error}</div>}
    </div>
  );
}
