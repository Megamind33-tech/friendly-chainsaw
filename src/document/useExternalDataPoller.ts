import { useEffect } from "react";
import { mergeExternalValues, useExternalConnector } from "@/document/externalConnector";
import { createHttpJsonDataConnector } from "@/adapters/httpDataConnector";

/** Polls a configured HTTP API and merges JSON into live data feeds. */
export function useExternalDataPoller() {
  const enabled = useExternalConnector((s) => s.enabled);
  const apiUrl = useExternalConnector((s) => s.apiUrl);
  const pollIntervalSec = useExternalConnector((s) => s.pollIntervalSec);
  const setLastSync = useExternalConnector((s) => s.setLastSync);

  useEffect(() => {
    const url = apiUrl.trim();
    if (!enabled || !url) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const values = await createHttpJsonDataConnector(url).fetch();
        if (cancelled) return;
        mergeExternalValues(values);
        setLastSync(Date.now(), null);
      } catch (err) {
        if (!cancelled) setLastSync(null, err instanceof Error ? err.message : String(err));
      }
    };

    void tick();
    const id = setInterval(() => void tick(), pollIntervalSec * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, apiUrl, pollIntervalSec, setLastSync]);
}
