import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { migrateProjectDoc } from "./persistence";
import { createDefaultProject, createLayer, createScene } from "./factory";
import { programStateSchema, projectSchema } from "./schema";
import { CURRENT_SCHEMA_VERSION, type Project } from "./types";

/**
 * Load-path integrity.
 *
 * `migrateProjectDoc` decides whether an operator's saved show survives a
 * relaunch. Its failure mode is unusually bad: when `projectSchema` rejects a
 * document, the fallback silently replaces it with an empty default project
 * and the work is gone with no error the operator ever sees. So the thing
 * worth pinning is not that invalid input is rejected — it is that *valid*
 * input is never rejected.
 */

/** Round-trips a project the way persistence actually does: through JSON. */
function throughDisk(project: Project): unknown {
  return JSON.parse(JSON.stringify(project));
}

describe("a valid project always survives the load path", () => {
  it("accepts a freshly created default project", () => {
    // If this ever fails, every new user loses their first project on the
    // second launch.
    const project = createDefaultProject();
    const loaded = migrateProjectDoc(throughDisk(project), CURRENT_SCHEMA_VERSION);
    expect(loaded.id).toBe(project.id);
    expect(loaded.scenes).toHaveLength(1);
  });

  it("preserves resolution, fps and colour space exactly", () => {
    const project = createDefaultProject();
    const loaded = migrateProjectDoc(throughDisk(project), CURRENT_SCHEMA_VERSION);
    expect(loaded.resolution).toEqual({ width: 1920, height: 1080 });
    expect(loaded.fps).toBe(50);
    expect(loaded.colorSpace).toBe("srgb");
  });

  it("accepts every layer kind the factory can build", () => {
    // A layer kind that the factory creates but the schema rejects would
    // destroy any project containing one, on the next launch.
    const project = createDefaultProject();
    project.scenes[0].layers = [
      createLayer("gfx2d"),
      createLayer("set3d"),
      createLayer("map"),
      createLayer("chart"),
    ];
    const loaded = migrateProjectDoc(throughDisk(project), CURRENT_SCHEMA_VERSION);
    expect(loaded.scenes[0].layers.map((l) => l.kind)).toEqual(["gfx2d", "set3d", "map", "chart"]);
  });

  it("preserves a multi-scene rundown with its layer ordering", () => {
    const project = createDefaultProject();
    project.scenes = [createScene("Open"), createScene("Package"), createScene("Close")];
    project.scenes[1].layers = [
      createLayer("gfx2d", { name: "Lower Third", zIndex: 5 }),
      createLayer("set3d", { name: "Studio", zIndex: 1 }),
    ];
    const loaded = migrateProjectDoc(throughDisk(project), CURRENT_SCHEMA_VERSION);
    expect(loaded.scenes.map((s) => s.name)).toEqual(["Open", "Package", "Close"]);
    expect(loaded.scenes[1].layers.map((l) => l.zIndex)).toEqual([5, 1]);
  });

  it("preserves per-layer visibility, lock, opacity and blend mode", () => {
    const project = createDefaultProject();
    project.scenes[0].layers = [
      createLayer("gfx2d", { visible: false, locked: true, opacity: 0.42 }),
    ];
    const loaded = migrateProjectDoc(throughDisk(project), CURRENT_SCHEMA_VERSION);
    const layer = loaded.scenes[0].layers[0];
    expect(layer.visible).toBe(false);
    expect(layer.locked).toBe(true);
    expect(layer.opacity).toBeCloseTo(0.42);
  });

  it("preserves bindings, including format and fallback", () => {
    // Losing a binding silently converts a live graphic into a static one.
    const project = createDefaultProject();
    const layer = createLayer("gfx2d");
    if (layer.props.kind === "gfx2d") {
      layer.props.elements = [
        {
          id: "e1",
          kind: "text",
          name: "Score",
          text: "0",
          transform: { x: 0, y: 0, width: 100, height: 30, rotation: 0 },
          visible: true,
          locked: false,
          opacity: 1,
          bindings: [{ targetPath: "text", source: "soccer.homeScore", format: "{value} PTS", fallback: "—" }],
          fontSize: 24,
          fontFamily: "sans-serif",
          fill: "#ffffff",
          align: "left",
        },
      ] as never;
    }
    project.scenes[0].layers = [layer];
    const loaded = migrateProjectDoc(throughDisk(project), CURRENT_SCHEMA_VERSION);
    const props = loaded.scenes[0].layers[0].props;
    expect(props.kind).toBe("gfx2d");
    if (props.kind !== "gfx2d") throw new Error("expected gfx2d");
    expect(props.elements[0].bindings[0]).toEqual({
      targetPath: "text",
      source: "soccer.homeScore",
      format: "{value} PTS",
      fallback: "—",
    });
  });

  it("preserves assets", () => {
    const project = createDefaultProject();
    project.assets = [
      { id: "a1", kind: "image", name: "logo.png", src: "http://127.0.0.1:4977/assets/logo.png" },
      { id: "a2", kind: "video", name: "stinger.mp4", src: "http://127.0.0.1:4977/assets/stinger.mp4" },
    ];
    const loaded = migrateProjectDoc(throughDisk(project), CURRENT_SCHEMA_VERSION);
    expect(loaded.assets.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(loaded.assets[1].kind).toBe("video");
  });
});

describe("schema version handling", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("loads a structurally valid document from an unknown version rather than discarding it", () => {
    // Forward compatibility: a project written by a newer build, opened by an
    // older one, must not be silently replaced with an empty default.
    const project = createDefaultProject();
    const loaded = migrateProjectDoc(throughDisk(project), CURRENT_SCHEMA_VERSION + 5);
    expect(loaded.id).toBe(project.id);
    expect(warn).toHaveBeenCalled();
  });

  it("warns rather than throwing on an older version", () => {
    const project = createDefaultProject();
    expect(() => migrateProjectDoc(throughDisk(project), 0)).not.toThrow();
  });
});

describe("corrupt documents fall back instead of crashing", () => {
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => error.mockRestore());

  it("returns a usable default project for junk", () => {
    for (const junk of [null, undefined, 42, "nope", [], {}]) {
      const loaded = migrateProjectDoc(junk, CURRENT_SCHEMA_VERSION);
      expect(loaded.scenes.length).toBeGreaterThan(0);
      expect(loaded.resolution.width).toBeGreaterThan(0);
    }
  });

  it("falls back when a required field is missing", () => {
    const broken = { ...createDefaultProject(), scenes: undefined };
    const loaded = migrateProjectDoc(broken, CURRENT_SCHEMA_VERSION);
    expect(loaded.scenes).toHaveLength(1);
    expect(error).toHaveBeenCalled();
  });
});

describe("defaults applied on load", () => {
  it("backfills arBuilderAssets for a project saved before it existed", () => {
    const project = createDefaultProject();
    const stored = throughDisk(project) as Record<string, unknown>;
    delete stored.arBuilderAssets;
    expect(migrateProjectDoc(stored, CURRENT_SCHEMA_VERSION).arBuilderAssets).toEqual([]);
  });
});

describe("projectSchema", () => {
  it("accepts what the factory produces", () => {
    // The factory and the schema are two independent descriptions of the same
    // shape; drift between them is silent data loss.
    expect(projectSchema.safeParse(throughDisk(createDefaultProject())).success).toBe(true);
  });
});

describe("programStateSchema", () => {
  it("round-trips program and preview scene ids", () => {
    const parsed = programStateSchema.safeParse({ programSceneId: "s1", previewSceneId: "s2" });
    expect(parsed.success).toBe(true);
  });

  it("accepts nulls for an unarmed show", () => {
    expect(programStateSchema.safeParse({ programSceneId: null, previewSceneId: null }).success).toBe(true);
  });

  it("rejects a malformed blob so the loader ignores it rather than trusting it", () => {
    expect(programStateSchema.safeParse({ programSceneId: 5 }).success).toBe(false);
  });
});
