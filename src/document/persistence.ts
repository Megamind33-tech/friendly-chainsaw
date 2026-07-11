import { getOpenProjectId, setOpenProjectId, sqliteProjectRepository } from "@/adapters/sqliteStudioRepository";
import { tauriRenderEnvelopeTransport } from "@/adapters/tauriRenderTransport";
import { useDocStore } from "./store";
import { useDataStore, buildDataValues } from "./dataSources";
import { resolveElements } from "./bindings";
import type { LayerPlayback } from "./playbackState";
import type { CameraMove, CameraOrbit } from "./cameraMoves";
import type { ArFocus } from "./arFocus";
import { projectSchema, programStateSchema } from "./schema";
import { createDefaultProject } from "./factory";
import { upgradeProjectArAnimations } from "@/ar-engine/arPrep";
import { evaluateVisibilityRule } from "@/ar-engine/visibility";
import { formatBindingValue } from "@/ar-system/binding/format";
import { assembleRenderEnvelope, type RenderEnvelope } from "./renderEnvelope";
import { CURRENT_SCHEMA_VERSION, type Project, type ID, type SetNode } from "./types";
import { compactProjectThumbnails } from "@/components/set3d/assetImport";
import { loadExternalConnectorSettings } from "./externalConnector";
import { useBroadcastStore } from "@/broadcast/broadcastStore";

const AUTOSAVE_DEBOUNCE_MS = 700;
/**
 * Much faster than content's 700ms — losing on-air state briefly to a
 * debounce is a real broadcast issue, unlike losing a keystroke. Kept
 * separate from `dirty`/scheduleSave entirely so a Take/Cut never gets
 * coalesced behind an in-flight content edit's debounce.
 */
const PROGRAM_STATE_DEBOUNCE_MS = 150;

/** @deprecated Use RenderEnvelope from renderEnvelope.ts. */
export interface ProgramEnvelope {
  project: Project;
  programSceneId: ID | null;
  previewSceneId: ID | null;
  layerPlayback: Record<ID, LayerPlayback>;
  /** Transient camera motion state (smooth takes / orbits / PVW camera
   * rehearsal) — same shared-timestamp contract as layerPlayback: each
   * window reconstructs the mid-flight pose from `Date.now() - startedAt`. */
  cameraMoves: Record<ID, CameraMove>;
  cameraOrbits: Record<ID, CameraOrbit>;
  cameraPreview: Record<ID, ID>;
  /** Live AR focus/isolate per layer (see arFocus.ts) — same transient
   * show-command contract as layerPlayback. */
  arFocus: Record<ID, ArFocus>;
}

/** No prior schema versions exist yet — this is where future up-migrations plug in. */
function migrateProjectDoc(doc: unknown, fromVersion: number): Project {
  if (fromVersion !== CURRENT_SCHEMA_VERSION) {
    console.warn(`project schema_version ${fromVersion} has no migration path; loading as-is`);
  }
  const parsed = projectSchema.safeParse(doc);
  if (!parsed.success) {
    console.error("project failed schema validation, falling back to a new default project", parsed.error);
    return createDefaultProject();
  }
  const project = parsed.data as Project;
  if (!project.arBuilderAssets) project.arBuilderAssets = [];
  return project;
}

/**
 * Bakes live data-source values into every bound field before the document
 * ever leaves the Control Room. Program/Preview windows and the Rust
 * sidecar only ever poll/render this pushed snapshot (see ProgramView.tsx,
 * PreviewView.tsx, lib.rs's /program) — none of them touch useDataStore
 * directly — so resolving once, here, is what makes bound fields show live
 * data everywhere without duplicating the binding engine in three places.
 */
/** Bakes live values into set3d text nodes for the output push, mirroring
 * SetNodes' applyTextBinding semantics exactly. Bindings are STRIPPED from
 * the baked copy: the Program/Preview windows run their own applyTextBinding
 * against their own (default-valued) data store, which would otherwise
 * overwrite the live value we just baked. The Control Room editor keeps the
 * original bound nodes and resolves live locally. */
export function resolveSetNodes(nodes: SetNode[], values: Record<string, string>): SetNode[] {
  return nodes.map((original) => {
    // Data-driven visibility bakes into plain `visible` (rule stripped) so
    // Program/Preview — which run against their own default-valued data
    // stores — honor the CONTROL ROOM's live data, not their own.
    let node = original;
    if (node.visibilityRule) {
      node = { ...node, visible: node.visible && evaluateVisibilityRule(node.visibilityRule, values), visibilityRule: undefined };
    }
    if (node.kind === "group") return { ...node, children: resolveSetNodes(node.children, values) };
    if (node.kind === "text3d" && node.bindings?.length) {
      const binding = node.bindings.find((b) => b.targetPath === "text") ?? node.bindings[0];
      const raw = values[binding.source];
      const resolved =
        raw !== undefined && raw !== ""
          ? formatBindingValue(raw, binding.format)
          : (binding.fallback ?? node.text);
      return { ...node, text: String(resolved), bindings: undefined };
    }
    if (node.kind === "primitive" && node.bindings?.length) {
      const binding = node.bindings.find((b) => b.targetPath === "textureUrl");
      if (binding) {
        const raw = values[binding.source];
        const resolved = raw !== undefined ? String(raw).trim() : String(binding.fallback ?? "");
        return {
          ...node,
          bindings: [{ targetPath: "textureUrl", source: "__baked__", fallback: resolved }],
        };
      }
    }
    return node;
  });
}

export function resolveProjectForOutput(project: Project): Project {
  const state = useDocStore.getState();
  const values = buildDataValues(useDataStore.getState());
  const hold = state.verseDataHold;
  const merged = hold
    ? { ...values, "event.verseText": hold.verseText, "event.verseRef": hold.verseRef }
    : values;
  return {
    ...project,
    scenes: project.scenes.map((scene) => ({
      ...scene,
      layers: scene.layers.map((layer) => {
        if (layer.props.kind === "gfx2d") {
          return { ...layer, props: { ...layer.props, elements: resolveElements(layer.props.elements, merged) } };
        }
        if (layer.props.kind === "set3d") {
          return { ...layer, props: { ...layer.props, nodes: resolveSetNodes(layer.props.nodes, merged) } };
        }
        return layer;
      }),
    })),
  };
}

async function pushProgramDocument(project: Project, programSceneId: ID | null, previewSceneId: ID | null): Promise<void> {
  const state = useDocStore.getState();
  const envelope: RenderEnvelope = assembleRenderEnvelope({
    project,
    programSceneId,
    previewSceneId,
    layerPlayback: state.layerPlayback,
    cameraMoves: state.cameraMoves,
    cameraOrbits: state.cameraOrbits,
    cameraPreview: state.cameraPreview,
    arFocus: state.arFocus,
    verseDataHold: state.verseDataHold,
    dataValues: buildDataValues(useDataStore.getState()),
  });
  try {
    await tauriRenderEnvelopeTransport.publish(envelope);
  } catch (err) {
    console.error("failed to push program document", err);
  }
}

async function insertProject(project: Project): Promise<void> {
  await sqliteProjectRepository.insert(project);
  await setOpenProjectId(project.id);
}

async function saveProject(project: Project): Promise<void> {
  await sqliteProjectRepository.save(project);
  useDocStore.getState().markSaved();
  const { programSceneId, previewSceneId } = useDocStore.getState();
  await pushProgramDocument(project, programSceneId, previewSceneId);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(project: Project): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveProject(project).catch((err) => console.error("autosave failed", err));
  }, AUTOSAVE_DEBOUNCE_MS);
}

async function saveProgramState(projectId: ID, programSceneId: ID | null, previewSceneId: ID | null): Promise<void> {
  await sqliteProjectRepository.saveProgramState(projectId, { programSceneId, previewSceneId });
}

let programStateTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProgramStateSave(projectId: ID, programSceneId: ID | null, previewSceneId: ID | null): void {
  if (programStateTimer) clearTimeout(programStateTimer);
  programStateTimer = setTimeout(() => {
    saveProgramState(projectId, programSceneId, previewSceneId).catch((err) =>
      console.error("program-state autosave failed", err),
    );
  }, PROGRAM_STATE_DEBOUNCE_MS);
}

let initialized = false;
let initPromise: Promise<void> | null = null;

async function initPersistenceOnce(): Promise<void> {
  await loadExternalConnectorSettings();
  await useBroadcastStore.getState().loadSettings();
  const openProjectId = await getOpenProjectId();

  let project: Project;
  let persistedProgramState: { programSceneId: ID | null; previewSceneId: ID | null } | null = null;

  if (openProjectId) {
    const stored = await sqliteProjectRepository.load(openProjectId);
    if (stored) {
      project = migrateProjectDoc(stored.project, stored.schemaVersion);
      if (stored.program) {
        const parsed = programStateSchema.safeParse(JSON.parse(stored.program));
        if (parsed.success) persistedProgramState = parsed.data;
        else console.warn("stored program state failed validation, ignoring", parsed.error);
      }
    } else {
      project = createDefaultProject();
      await insertProject(project);
    }
  } else {
    project = createDefaultProject();
    await insertProject(project);
  }

  // Scrub oversized inline thumbnails left over from older imports before
  // the project enters the store — keeps JSON lean without a re-import.
  const thumbnailsCompacted = await compactProjectThumbnails(project.assets);

  const upgraded = upgradeProjectArAnimations(project);
  const arAnimationsUpgraded = JSON.stringify(project) !== JSON.stringify(upgraded);

  useDocStore.getState().loadProject(upgraded);
  // The initial load is not a user action — it must not be undoable.
  useDocStore.temporal.getState().clear();

  if (persistedProgramState) {
    useDocStore.getState().hydrateProgramState(persistedProgramState);
  }

  if (thumbnailsCompacted || arAnimationsUpgraded) {
    useDocStore.setState((state) => {
      state.dirty = true;
    });
  }

  const { programSceneId, previewSceneId } = useDocStore.getState();
  await pushProgramDocument(project, programSceneId, previewSceneId);

  useDocStore.subscribe((state) => {
    if (state.dirty && state.project) scheduleSave(state.project);
  });

  // Data-source edits (mock feed values, the ticking clock) aren't part of
  // `project`/`dirty` at all, so they'd never otherwise trigger a push —
  // re-push immediately (no debounce) whenever they change so a bound
  // field's new value reaches Program/Preview/OBS without an unrelated
  // content edit to piggyback on.
  useDataStore.subscribe(() => {
    const { project } = useDocStore.getState();
    if (!project) return;
    const { programSceneId, previewSceneId } = useDocStore.getState();
    pushProgramDocument(project, programSceneId, previewSceneId).catch((err) =>
      console.error("failed to push program document after data-source change", err),
    );
  });

  let lastProgramSceneId = programSceneId;
  let lastPreviewSceneId = previewSceneId;
  useDocStore.subscribe((state) => {
    if (!state.project) return;
    if (state.programSceneId === lastProgramSceneId && state.previewSceneId === lastPreviewSceneId) return;
    lastProgramSceneId = state.programSceneId;
    lastPreviewSceneId = state.previewSceneId;
    scheduleProgramStateSave(state.project.id, state.programSceneId, state.previewSceneId);
    // Re-push immediately (not on the debounce above) so Program/OBS see a
    // Take/Cut with no perceptible delay.
    pushProgramDocument(state.project, state.programSceneId, state.previewSceneId).catch((err) =>
      console.error("failed to push program state change", err),
    );
  });

  // Same immediacy requirement as scene cuts: a Play In/Out command must
  // reach Program/Preview right away, not wait behind the content debounce.
  let lastLayerPlayback = useDocStore.getState().layerPlayback;
  useDocStore.subscribe((state) => {
    if (!state.project || state.layerPlayback === lastLayerPlayback) return;
    lastLayerPlayback = state.layerPlayback;
    pushProgramDocument(state.project, state.programSceneId, state.previewSceneId).catch((err) =>
      console.error("failed to push program document after playback change", err),
    );
  });

  // Camera takes/orbits/PVW rehearsal are live show commands too — push
  // immediately, exactly like layerPlayback above.
  let lastCameraMoves = useDocStore.getState().cameraMoves;
  let lastCameraOrbits = useDocStore.getState().cameraOrbits;
  let lastCameraPreview = useDocStore.getState().cameraPreview;
  let lastArFocus = useDocStore.getState().arFocus;
  useDocStore.subscribe((state) => {
    if (!state.project) return;
    if (
      state.cameraMoves === lastCameraMoves &&
      state.cameraOrbits === lastCameraOrbits &&
      state.cameraPreview === lastCameraPreview &&
      state.arFocus === lastArFocus
    ) {
      return;
    }
    lastCameraMoves = state.cameraMoves;
    lastCameraOrbits = state.cameraOrbits;
    lastCameraPreview = state.cameraPreview;
    lastArFocus = state.arFocus;
    pushProgramDocument(state.project, state.programSceneId, state.previewSceneId).catch((err) =>
      console.error("failed to push program document after camera motion change", err),
    );
  });
}

/** Call once on Control Room mount. Loads the last-open project, or creates one. */
export function initPersistence(): Promise<void> {
  if (initialized) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = initPersistenceOnce()
    .then(() => {
      initialized = true;
    })
    .catch((err) => {
      initPromise = null;
      initialized = false;
      throw err;
    });

  return initPromise;
}
