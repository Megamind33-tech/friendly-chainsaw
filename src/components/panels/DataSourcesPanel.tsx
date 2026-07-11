import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDataStore, FEED_IDS } from "@/document/dataSources";
import type { FeedId, SportId } from "@/document/dataSources";
import { FORMATIONS } from "@/sports/squads";
import { useDataPages } from "@/document/dataPages";
import type { DataPage } from "@/document/dataPages";
import { importCsvFile, parseCsvToValues, useExternalConnector } from "@/document/externalConnector";
import {
  dataHub,
  startElectionSimulator,
  stopElectionSimulator,
  isElectionSimulatorRunning,
  importElectionJsonFile,
  importElectionFlatValues,
  syncElectionToDataStore,
  ELECTION_SAMPLE_JSON,
} from "@/ar-system";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Play, Upload, Square, RefreshCw } from "lucide-react";

const SPORT_IDS: SportId[] = ["soccer", "basketball", "football", "baseball", "hockey", "tennis", "volleyball", "rugby"];
type LiveSourceId = SportId | FeedId;
const LIVE_SOURCE_IDS: LiveSourceId[] = [...FEED_IDS, ...SPORT_IDS];

/**
 * One saved Data Page — name (double-click to rename inline), a prominent
 * red APPLY "take" button (swaps every bound graphic on air to this data
 * set live, per persistence.ts's useDataStore subscription), and delete.
 */
function DataPageRow({ page }: { page: DataPage }) {
  const applyPage = useDataPages((s) => s.applyPage);
  const renamePage = useDataPages((s) => s.renamePage);
  const deletePage = useDataPages((s) => s.deletePage);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(page.name);

  const commit = () => {
    setEditing(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== page.name) void renamePage(page.id, trimmed);
    else setName(page.name);
  };

  return (
    <div className="flex items-center gap-1 rounded border border-border-subtle bg-bg-panel px-2 py-1.5">
      {editing ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setName(page.name);
              setEditing(false);
            }
          }}
          className="h-7 flex-1 border-border-subtle bg-bg-surface font-mono text-[10px] text-text-muted-alt"
        />
      ) : (
        <div
          onDoubleClick={() => setEditing(true)}
          title="Double-click to rename"
          className="flex-1 truncate font-mono text-[11px] text-text-muted-alt"
        >
          {page.name}
        </div>
      )}
      <button
        onClick={() => applyPage(page.id)}
        title="Apply this page live"
        className="flex h-7 shrink-0 items-center gap-1 rounded border border-live-red bg-live-red/10 px-2 font-mono text-[10px] font-bold uppercase tracking-wide text-live-red hover:bg-live-red hover:text-white"
      >
        <Play className="h-3 w-3" /> Apply
      </button>
      <button onClick={() => void deletePage(page.id)} className="shrink-0 text-text-muted hover:text-live-red">
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * Phase 3/4's data source adapter UI. A "mock feed" (free-form key/values,
 * a stand-in for a real scoreboard/CMS/weather adapter), a genuinely live
 * system clock, and one live-editable scoreboard per sport (schema-fixed
 * keys, per CONVENTIONS.md — unlike the Mock Feed, sport keys can't be
 * renamed/removed since scorebugs bind to them by name). All feed the same
 * binding engine (bindings.ts). Edits here reach Program/Preview/OBS within
 * one push cycle (see persistence.ts's useDataStore subscription).
 */
export function DataSourcesPanel() {
  const mock = useDataStore((s) => s.mock);
  const brand = useDataStore((s) => s.brand);
  const clockTime = useDataStore((s) => s.clockTime);
  const setMockValue = useDataStore((s) => s.setMockValue);
  const renameMockKey = useDataStore((s) => s.renameMockKey);
  const removeMockKey = useDataStore((s) => s.removeMockKey);
  const setSportValue = useDataStore((s) => s.setSportValue);
  const setFeedValue = useDataStore((s) => s.setFeedValue);
  const setBrandValue = useDataStore((s) => s.setBrandValue);
  const ticker = useDataStore((s) => s.ticker);
  const setTickerValue = useDataStore((s) => s.setTickerValue);
  const sports = useDataStore((s) => s);
  const [newKey, setNewKey] = useState("");
  const [selectedSport, setSelectedSport] = useState<LiveSourceId>("soccer");
  const pages = useDataPages((s) => s.pages);
  const pagesLoaded = useDataPages((s) => s.loaded);
  const loadPages = useDataPages((s) => s.loadPages);
  const savePage = useDataPages((s) => s.savePage);
  const [newPageName, setNewPageName] = useState("");
  const csvInput = useRef<HTMLInputElement>(null);
  const [csvStatus, setCsvStatus] = useState<string | null>(null);
  const [electionStatus, setElectionStatus] = useState<string | null>(null);
  const [simRunning, setSimRunning] = useState(isElectionSimulatorRunning);
  const electionJsonInput = useRef<HTMLInputElement>(null);
  const electionCsvInput = useRef<HTMLInputElement>(null);
  const extEnabled = useExternalConnector((s) => s.enabled);
  const extUrl = useExternalConnector((s) => s.apiUrl);
  const extPoll = useExternalConnector((s) => s.pollIntervalSec);
  const extLastSync = useExternalConnector((s) => s.lastSyncAt);
  const extError = useExternalConnector((s) => s.lastError);
  const setExtEnabled = useExternalConnector((s) => s.setEnabled);
  const setExtUrl = useExternalConnector((s) => s.setApiUrl);
  const setExtPoll = useExternalConnector((s) => s.setPollIntervalSec);

  useEffect(() => {
    if (!pagesLoaded) void loadPages();
  }, [pagesLoaded, loadPages]);

  useSyncExternalStore(
    (cb) => dataHub.subscribe(cb),
    () => dataHub.getAllConnections(),
    () => dataHub.getAllConnections(),
  );
  const electionConn = dataHub.getConnection("election");
  const electionPacket = dataHub.getLastPacket("election");

  const sport = sports[selectedSport];
  const isFeed = (FEED_IDS as string[]).includes(selectedSport);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-2 text-xs">
      <div>
        <div className="mb-1 font-mono text-[10px] tracking-wide text-text-muted-alt">PAGES</div>
        <div className="mb-1.5 flex gap-1">
          <Input
            placeholder="new page name"
            value={newPageName}
            onChange={(e) => setNewPageName(e.target.value)}
            className="h-7 flex-1 border-border-subtle bg-bg-surface font-mono text-[10px] text-text-muted-alt"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1 border-border-subtle bg-bg-surface text-text-muted-alt"
            onClick={() => {
              const name = newPageName.trim();
              if (!name) return;
              void savePage(name);
              setNewPageName("");
            }}
          >
            <Plus className="h-3 w-3" /> Save page
          </Button>
        </div>
        <div className="space-y-1.5">
          {pages.map((page) => (
            <DataPageRow key={page.id} page={page} />
          ))}
          {pages.length === 0 && (
            <div className="rounded border border-border-subtle bg-bg-panel px-2 py-2 text-center font-mono text-[10px] text-text-muted">
              No pages saved yet.
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-1 font-mono text-[10px] tracking-wide text-text-muted-alt">CLOCK (live)</div>
        <div className="rounded border border-border-subtle bg-bg-panel px-2 py-1.5 font-mono text-text-muted-alt">
          clock.time = {clockTime}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-wide text-text-muted-alt">ELECTION DATA HUB</span>
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
              electionConn?.status === "live"
                ? "bg-live-red/15 text-live-red"
                : electionConn?.status === "stale"
                  ? "bg-live-amber/15 text-live-amber"
                  : electionConn?.status === "invalid"
                    ? "bg-live-red/10 text-live-red"
                    : "bg-bg-deepest text-text-muted"
            }`}
          >
            {electionConn?.status ?? "offline"}
          </span>
        </div>
        <div className="space-y-2 rounded border border-border-subtle bg-bg-panel p-2">
          <div className="font-mono text-[9px] text-text-muted">
            Validated election feed for AR candidate towers. Import JSON, CSV key/value rows, or run the live simulator.
          </div>
          {electionConn?.lastUpdateAt && (
            <div className="font-mono text-[9px] text-accent-blue-bright">
              Last update {new Date(electionConn.lastUpdateAt).toLocaleTimeString()}
              {electionConn.lastSequence !== null && ` · seq ${electionConn.lastSequence}`}
            </div>
          )}
          {electionConn?.lastError && (
            <div className="font-mono text-[9px] text-live-red">{electionConn.lastError}</div>
          )}
          {electionPacket?.validationErrors && (
            <div className="font-mono text-[9px] text-live-amber">
              {electionPacket.validationErrors.join("; ")}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => {
                if (simRunning) {
                  stopElectionSimulator();
                  setSimRunning(false);
                  setElectionStatus("Simulator stopped");
                } else {
                  startElectionSimulator(3000);
                  setSimRunning(true);
                  setElectionStatus("Simulator running (3s interval)");
                }
              }}
              className={`flex items-center gap-1 rounded border px-2 py-1 font-mono text-[9px] ${
                simRunning
                  ? "border-live-amber bg-live-amber/10 text-live-amber"
                  : "border-border-subtle text-text-muted-alt hover:border-stripe-active"
              }`}
            >
              {simRunning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {simRunning ? "Stop sim" : "Live sim"}
            </button>
            <button
              onClick={() => electionJsonInput.current?.click()}
              className="flex items-center gap-1 rounded border border-border-subtle px-2 py-1 font-mono text-[9px] text-text-muted-alt hover:border-stripe-active"
            >
              <Upload className="h-3 w-3" /> Import JSON
            </button>
            <button
              onClick={() => electionCsvInput.current?.click()}
              className="flex items-center gap-1 rounded border border-border-subtle px-2 py-1 font-mono text-[9px] text-text-muted-alt hover:border-stripe-active"
            >
              <Upload className="h-3 w-3" /> Import CSV
            </button>
            <button
              onClick={() => {
                syncElectionToDataStore(ELECTION_SAMPLE_JSON);
                setElectionStatus("Loaded sample election data");
              }}
              className="flex items-center gap-1 rounded border border-border-subtle px-2 py-1 font-mono text-[9px] text-text-muted-alt hover:border-stripe-active"
            >
              <RefreshCw className="h-3 w-3" /> Reset sample
            </button>
          </div>
          <input
            ref={electionJsonInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void importElectionJsonFile(file).then((r) => {
                setElectionStatus(r.ok ? `Imported ${file.name}` : r.error);
              });
              e.target.value = "";
            }}
          />
          <input
            ref={electionCsvInput}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void file.text().then((text) => {
                const values = parseCsvToValues(text);
                const electionKeys = Object.fromEntries(
                  Object.entries(values).filter(([k]) => k.startsWith("election.")),
                );
                if (Object.keys(electionKeys).length > 0) {
                  const r = importElectionFlatValues(electionKeys);
                  setElectionStatus(r.ok ? `Imported ${Object.keys(electionKeys).length} election keys` : r.error);
                } else {
                  const r = importElectionFlatValues(values);
                  setElectionStatus(r.ok ? `Imported ${Object.keys(values).length} keys as election` : r.error);
                }
              });
              e.target.value = "";
            }}
          />
          {electionStatus && <div className="font-mono text-[9px] text-accent-blue-bright">{electionStatus}</div>}
          <div className="font-mono text-[9px] text-text-muted">
            Candidates in feed: {sports.election.values.candidateCount ?? "—"}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1 font-mono text-[10px] tracking-wide text-text-muted-alt">BRAND KIT</div>
        <div className="space-y-1.5">
          {Object.entries(brand.values).map(([key, value]) => (
            <div key={key} className="flex items-center gap-1">
              <span className="w-24 shrink-0 truncate font-mono text-[10px] text-text-muted">brand.{key}</span>
              <input
                type="color"
                value={value}
                onChange={(e) => setBrandValue(key, e.target.value)}
                className="h-7 w-9 shrink-0 rounded border border-border-subtle bg-transparent"
              />
              <Input
                value={value}
                onChange={(e) => setBrandValue(key, e.target.value)}
                className="h-7 flex-1 border-border-subtle bg-bg-surface font-mono text-text-muted-alt"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 font-mono text-[10px] tracking-wide text-text-muted-alt">TICKER</div>
        <div className="space-y-1.5">
          {Object.entries(ticker.values).map(([key, value]) => (
            <div key={key} className="flex items-center gap-1">
              <span className="w-24 shrink-0 truncate font-mono text-[10px] text-text-muted">ticker.{key}</span>
              <Input
                value={value}
                onChange={(e) => setTickerValue(key, e.target.value)}
                className="h-7 flex-1 border-border-subtle bg-bg-surface font-mono text-text-muted-alt"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 font-mono text-[10px] tracking-wide text-text-muted-alt">MOCK FEED</div>
        <div className="space-y-1.5">
          {Object.entries(mock.values).map(([key, value]) => (
            <div key={key} className="flex items-center gap-1">
              <Input
                defaultValue={key}
                onBlur={(e) => {
                  if (e.target.value !== key) renameMockKey(key, e.target.value.trim());
                }}
                className="h-7 w-24 shrink-0 border-border-subtle bg-bg-surface font-mono text-[10px] text-text-muted"
              />
              <Input
                value={value}
                onChange={(e) => setMockValue(key, e.target.value)}
                className="h-7 flex-1 border-border-subtle bg-bg-surface font-mono text-text-muted-alt"
              />
              <button onClick={() => removeMockKey(key)} className="shrink-0 hover:text-live-red">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-wide text-text-muted-alt">LIVE SOURCE</span>
          <select
            value={selectedSport}
            onChange={(e) => setSelectedSport(e.target.value as LiveSourceId)}
            className="h-6 rounded border border-border-subtle bg-bg-surface px-1 font-mono text-[10px] text-text-muted-alt"
          >
            {LIVE_SOURCE_IDS.map((id) => (
              <option key={id} value={id}>
                {sports[id].name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          {selectedSport === "squad" && (
            <div className="flex items-center gap-1 rounded border border-border-subtle bg-bg-deepest px-2 py-1.5">
              <span className="w-24 shrink-0 font-mono text-[10px] text-text-muted">squad.formation</span>
              <select
                value={sport.values.formation ?? "4-3-3"}
                onChange={(e) => setFeedValue("squad", "formation", e.target.value)}
                className="h-7 flex-1 rounded border border-border-subtle bg-bg-surface px-1 font-mono text-[10px] text-text-muted-alt"
              >
                {FORMATIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {Object.entries(sport.values).map(([key, value]) => {
            if (selectedSport === "squad" && key === "formation") return null;
            return (
            <div key={key} className="flex items-center gap-1">
              <span className="w-24 shrink-0 truncate font-mono text-[10px] text-text-muted">
                {sport.id}.{key}
              </span>
              <Input
                value={value}
                onChange={(e) =>
                  isFeed
                    ? setFeedValue(selectedSport as FeedId, key, e.target.value)
                    : setSportValue(selectedSport as SportId, key, e.target.value)
                }
                className="h-7 flex-1 border-border-subtle bg-bg-surface font-mono text-text-muted-alt"
              />
            </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1 font-mono text-[10px] tracking-wide text-text-muted-alt">EXTERNAL DATA (API / EXCEL CSV)</div>
        <div className="space-y-2 rounded border border-border-subtle bg-bg-panel p-2">
          <div className="font-mono text-[9px] text-text-muted">
            Import a CSV exported from Excel (<code className="text-text-muted-alt">key,value</code> rows like <code className="text-text-muted-alt">squad.p8photo,https://…</code>) or poll a JSON API on an interval.
          </div>
          <Input
            placeholder="https://api.example.com/roster.json"
            value={extUrl}
            onChange={(e) => setExtUrl(e.target.value)}
            className="h-7 border-border-subtle bg-bg-surface font-mono text-[10px]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 font-mono text-[10px] text-text-muted-alt">
              <input type="checkbox" checked={extEnabled} onChange={(e) => setExtEnabled(e.target.checked)} />
              Poll API
            </label>
            <Input
              type="number"
              min={2}
              value={extPoll}
              onChange={(e) => setExtPoll(Number(e.target.value))}
              className="h-7 w-16 border-border-subtle bg-bg-surface font-mono text-[10px]"
              title="Poll interval (seconds)"
            />
            <span className="font-mono text-[9px] text-text-muted">sec</span>
            <button
              onClick={() => csvInput.current?.click()}
              className="flex items-center gap-1 rounded border border-border-subtle px-2 py-1 font-mono text-[9px] text-text-muted-alt hover:border-stripe-active"
            >
              <Upload className="h-3 w-3" /> Import CSV
            </button>
            <input
              ref={csvInput}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void importCsvFile(file)
                  .then((n) => setCsvStatus(`Imported ${n} keys from ${file.name}`))
                  .catch((err) => setCsvStatus(err instanceof Error ? err.message : String(err)));
                e.target.value = "";
              }}
            />
          </div>
          {extLastSync && (
            <div className="font-mono text-[9px] text-accent-blue-bright">API sync {new Date(extLastSync).toLocaleTimeString()}</div>
          )}
          {extError && <div className="font-mono text-[9px] text-live-red">{extError}</div>}
          {csvStatus && <div className="font-mono text-[9px] text-accent-blue-bright">{csvStatus}</div>}
        </div>
      </div>

      <div className="mt-auto flex gap-1 border-t border-border-subtle pt-2">
        <Input
          placeholder="new mock key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="h-7 flex-1 border-border-subtle bg-bg-surface font-mono text-[10px] text-text-muted-alt"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1 border-border-subtle bg-bg-surface text-text-muted-alt"
          onClick={() => {
            const key = newKey.trim();
            if (!key || key in mock.values) return;
            setMockValue(key, "");
            setNewKey("");
          }}
        >
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
    </div>
  );
}
