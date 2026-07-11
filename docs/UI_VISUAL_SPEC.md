# UI Visual Spec — Broadcast Console Chrome

**Scope:** looks only — no feature, store, or schema changes.

**Reference:** charcoal field (`#222228`) + bottom accent stripe (`#1a0a2e` → `#3d2660` active).

---

## 1. Principles

| Rule | Detail |
|---|---|
| **One palette** | All panels use `:root` tokens in `index.css` — no ad-hoc hex in panels. |
| **Stripe = brand** | Active tabs, section headers, and cards use a **2px bottom stripe** in `--stripe-accent`, not blue pills or generic shadcn defaults. |
| **No decorative icons** | Lucide icons are **forbidden** for navigation, categories, asset kinds, and tree rows. Use **mono text labels** or **2–3 letter kind badges**. |
| **Functional icons only** | Trash, eye/hide, undo/redo may stay as minimal glyphs where space is &lt; 24px — prefer text (`del`, `×`) when possible. |
| **Square thumbs** | Every thumbnail slot is **48×48** (assets) or **56×56** (graphic previews). Never 16:9 bars or full-width rectangles. |
| **Dense grids** | Template/asset grids: **3–4 columns**, gap `8px`, card padding `6px`. |

---

## 2. Tokens (`index.css`)

| Token | Value | Use |
|---|---|---|
| `--bg-deepest` | `#141418` | Thumb well, viewport backdrop |
| `--bg-base` | `#1a1a20` | App shell |
| `--bg-panel` | `#222228` | Panel body (reference charcoal) |
| `--bg-surface` | `#2a2a32` | Raised controls, inputs |
| `--stripe-accent` | `#1a0a2e` | Idle stripe / section rule |
| `--stripe-active` | `#3d2660` | Selected tab / active card stripe |
| `--text-muted` | `#6e6e7e` | Labels, section titles |
| `--text-muted-alt` | `#a8a8b8` | Body copy |
| `--text-bright` | `#d8d8e4` | Active / primary text |
| `--border-subtle` | `#33333c` | 1px borders |
| `--live-red` | `#cc0000` | ON AIR only (unchanged) |

Blue (`--accent-blue`) is **demoted** to link/focus ring only — not tab fills or hover borders.

---

## 3. Shared components (`src/components/ui/broadcast.tsx`)

| Component | Role |
|---|---|
| `ThumbSlot` | Fixed square image well (`48` or `56` px). |
| `BroadcastSectionTitle` | Mono 9px uppercase + bottom stripe. |
| `BroadcastTab` / `BroadcastTabBar` | Text-only horizontal tabs; active = stripe + bright text. |
| `BroadcastCard` | Panel card: charcoal bg, 1px border, stripe on hover/active. |
| `KindBadge` | 2–3 char mono badge replacing tree/list icons. |
| `BroadcastToolBtn` | Toolbar text button (gizmo, import, etc.). |

---

## 4. Panel rollout (priority)

| Panel | Changes |
|---|---|
| `PersistentShell` | Workspace switcher: **text only**, stripe active state. |
| `GraphicPreview` | **56×56 square** crop; neutral charcoal well. |
| `TemplatesPanel` | `BroadcastCard`, 3-col grid, no `+` icon. |
| `AssetBrowserPanel` | Text tabs (no tab icons); `ThumbSlot` 48px; text import buttons. |
| `ImagePickerDialog` | 4-col square grid; text `Ref` / `Import` buttons. |
| `VirtualSetPanel` | Text palette (`BOX`, `SPH`, …); studio templates as text cards. |
| `LayersPanel` | `KindBadge` instead of Lucide per row. |
| `SetInspector` | `BroadcastSectionTitle` for sections. |

---

## 5. Thumbnail sizes (locked)

```
ASSET_THUMB_PX     = 48   // images, models, video, fonts
PREVIEW_THUMB_PX   = 56   // GraphicPreview, template cards
MAX_GRID_COLS      = 4    // pickers
TEMPLATE_GRID_COLS = 3    // templates library
```

---

## 6. Anti-patterns (reject in review)

- Icon grids for categories (Lucide `Newspaper`, `Trophy`, …)
- `hover:border-accent-blue` as primary affordance
- Graphic preview wider than tall
- Full-width thumbnail strips
- shadcn default `primary` blue buttons for navigation
