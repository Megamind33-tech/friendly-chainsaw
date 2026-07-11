import { useEffect, useMemo, useState } from "react";
import { useDocStore } from "@/document/store";
import { type SportId } from "@/document/dataSources";
import { GraphicPreview } from "./GraphicPreview";
import type { Layer } from "@/document/types";
import { FULLSCREEN_TEMPLATES } from "@/sports/fullscreens";
import { LOWER_THIRDS } from "@/sports/lowerThirds";
import { createSoccerScorebug } from "@/sports/soccer";
import { createBasketballScorebug } from "@/sports/basketball";
import { createFootballScorebug } from "@/sports/football";
import { createBaseballScorebug } from "@/sports/baseball";
import { createHockeyScorebug } from "@/sports/hockey";
import { createTennisScorebug } from "@/sports/tennis";
import { createVolleyballScorebug } from "@/sports/volleyball";
import { createRugbyScorebug } from "@/sports/rugby";
import { createTickerLayer } from "@/document/ticker";
import { createModernScorebug } from "@/sports/scorebugModern";
import { createFormationBoard, createPlayerCard, FORMATIONS } from "@/sports/squads";
import { createMapBoard } from "@/graphics/maps";
import { GENRE_CATEGORIES } from "@/genres";
import { BRANDING_TEMPLATES } from "@/graphics/brandingKit";
import { cloneLayerWithNewIds } from "@/document/factory";
import { useUserTemplates } from "@/document/userTemplates";
import { BroadcastCard, BroadcastSectionTitle, BroadcastTab, BroadcastTabBar } from "@/components/ui/broadcast";

/**
 * The graphics template library — cards, never dropdowns. Every card's
 * preview is a REAL render: the template's actual elements resolved against
 * the live data sources and drawn through the same renderNodes pipeline the
 * program output uses, at thumbnail scale. What you click is exactly what
 * you get, already showing your current data.
 */

const SPORTS: { id: SportId; label: string; scorebug: () => Layer }[] = [
  { id: "soccer", label: "Soccer", scorebug: createSoccerScorebug },
  { id: "basketball", label: "Basketball", scorebug: createBasketballScorebug },
  { id: "football", label: "Football", scorebug: createFootballScorebug },
  { id: "baseball", label: "Baseball", scorebug: createBaseballScorebug },
  { id: "hockey", label: "Hockey", scorebug: createHockeyScorebug },
  { id: "tennis", label: "Tennis", scorebug: createTennisScorebug },
  { id: "volleyball", label: "Volleyball", scorebug: createVolleyballScorebug },
  { id: "rugby", label: "Rugby", scorebug: createRugbyScorebug },
];

interface Card {
  id: string;
  label: string;
  note: string;
  preview: Layer;
  create: () => Layer;
}

const CATEGORIES: { id: string; label: string }[] = [
  { id: "sports", label: "Sports" },
  ...GENRE_CATEGORIES.map((g) => ({ id: g.id, label: g.label })),
  { id: "maps", label: "Maps" },
  { id: "branding", label: "Branding" },
];

export function TemplatesPanel() {
  const project = useDocStore((s) => s.project);
  const activeSceneId = useDocStore((s) => s.activeSceneId);
  const addPrebuiltLayer = useDocStore((s) => s.addPrebuiltLayer);
  const groupElements = useDocStore((s) => s.groupElements);
  const [category, setCategory] = useState<string>("sports");
  const [sportId, setSportId] = useState<SportId>("soccer");
  const userTemplates = useUserTemplates((s) => s.templates);
  const loadUserTemplates = useUserTemplates((s) => s.load);
  const removeUserTemplate = useUserTemplates((s) => s.remove);

  useEffect(() => {
    loadUserTemplates().catch((err) => console.error("failed to load user templates", err));
  }, [loadUserTemplates]);

  const scene = project?.scenes.find((s) => s.id === activeSceneId) ?? project?.scenes[0];
  const sport = SPORTS.find((s) => s.id === sportId)!;

  // Preview instances are rebuilt only when the category/sport changes;
  // clicking a card calls create() AGAIN so the inserted layer gets fresh ids.
  const cards = useMemo<Card[]>(() => {
    if (category === "branding") {
      return BRANDING_TEMPLATES.map((t) => ({ id: t.id, label: t.label, note: t.note, preview: t.create(), create: t.create }));
    }
    if (category === "maps") {
      return [
        {
          id: "map-board",
          label: "Map Board",
          note: "full-screen · drop in your map artwork",
          preview: createMapBoard(),
          create: createMapBoard,
        },
      ];
    }
    if (category !== "sports") {
      const genre = GENRE_CATEGORIES.find((g) => g.id === category);
      return (genre?.templates ?? []).map((t) => ({
        id: t.id,
        label: t.label,
        note: t.note,
        preview: t.create(),
        create: t.create,
      }));
    }
    return [
      ...LOWER_THIRDS.map((t) => ({
        id: t.id,
        label: t.label,
        note: t.id === "l3-sports" ? "lower third · live score" : "lower third · news",
        preview: t.create(sport.id, sport.label),
        create: () => t.create(sport.id, sport.label),
      })),
      ...FULLSCREEN_TEMPLATES.map((t) => ({
        id: t.id,
        label: t.label,
        note: "full-screen · animated",
        preview: t.create(sport.id, sport.label),
        create: () => t.create(sport.id, sport.label),
      })),
      {
        id: "scorebug-modern",
        label: "Corner Scorebug",
        note: "modern bug · animated",
        preview: createModernScorebug(sport.id, sport.label),
        create: () => createModernScorebug(sport.id, sport.label),
      },
      { id: "scorebug", label: "Classic Scorebug", note: "lower band · animated", preview: sport.scorebug(), create: sport.scorebug },
      { id: "ticker", label: "News Ticker", note: "scrolling band", preview: createTickerLayer(), create: createTickerLayer },
      // Squad package (src/sports/squads.ts) — bound to the live `squad.*`
      // feed (Data Sources panel), one card per formation, plus the player
      // spotlight lower third.
      ...FORMATIONS.map((f) => ({
        id: `squad-${f.id}`,
        label: `Squad Board ${f.label}`,
        note: "full-screen · formation lineup",
        preview: createFormationBoard(f.id),
        create: () => createFormationBoard(f.id),
      })),
      {
        id: "player-card",
        label: "Player Spotlight",
        note: "lower third · headshot slot",
        preview: createPlayerCard(),
        create: createPlayerCard,
      },
    ];
  }, [category, sport]);

  if (!project || !scene) {
    return <div className="p-3 font-mono text-xs text-text-muted">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2 text-xs">
      {userTemplates.length > 0 && (
        <div className="space-y-1 border-b border-border-subtle pb-2">
          <BroadcastSectionTitle>My Templates</BroadcastSectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {userTemplates.map((t) => (
              <div key={t.id} className="group relative">
                <BroadcastCard
                  onClick={() => addPrebuiltLayer(scene.id, cloneLayerWithNewIds(t.layer))}
                  title={`Insert "${t.name}" into ${scene.name}`}
                  className="w-full"
                >
                  <GraphicPreview layer={t.layer} />
                  <div className="mt-1 truncate font-mono text-[10px] text-text-muted-alt group-hover:text-text-bright">
                    {t.name}
                  </div>
                </BroadcastCard>
                <button
                  onClick={() => void removeUserTemplate(t.id)}
                  title="Delete saved template"
                  className="absolute right-0.5 top-0.5 rounded bg-bg-deepest/90 px-1 py-0.5 font-mono text-[8px] text-text-muted opacity-0 hover:text-live-red group-hover:opacity-100"
                >
                  del
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <BroadcastTabBar>
        {CATEGORIES.map((c) => (
          <BroadcastTab key={c.id} active={c.id === category} onClick={() => setCategory(c.id)}>
            {c.label}
          </BroadcastTab>
        ))}
      </BroadcastTabBar>

      {category === "sports" && (
        <div className="flex flex-wrap gap-0 border-b border-border-subtle">
          {SPORTS.map((s) => (
            <BroadcastTab key={s.id} active={s.id === sportId} onClick={() => setSportId(s.id)}>
              {s.label}
            </BroadcastTab>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {cards.map((card) => (
          <BroadcastCard
            key={card.id}
            onClick={() => {
              const layer = card.create();
              const layerId = addPrebuiltLayer(scene.id, layer);
              if (layer.props.kind === "gfx2d" && layer.props.elements.length > 1) {
                groupElements(scene.id, layerId, layer.props.elements.map((el) => el.id));
              }
            }}
            title={`Insert ${card.label} into ${scene.name}`}
          >
            <GraphicPreview layer={card.preview} />
            <div className="mt-1 truncate font-mono text-[10px] text-text-muted-alt">{card.label}</div>
            <div className="truncate font-mono text-[8px] text-text-muted">{card.note}</div>
          </BroadcastCard>
        ))}
      </div>
    </div>
  );
}
