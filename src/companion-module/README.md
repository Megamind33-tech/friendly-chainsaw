# Companion module — Broadcast Graphics Engine

Phase 7 delivery: a Bitfocus Companion module that drives the Broadcast
Graphics Engine (BGE) Control Room over HTTP + SSE.

## Install

1. Have Bitfocus Companion 3.5+ installed.
2. Copy this whole `companion-module/` directory into Companion's user
   modules folder (Companion → Settings → "Developer" → "Reload dev
   modules" after copying).
   * macOS: `~/Documents/Companion/modules/`
   * Windows: `%USERPROFILE%\Documents\Companion\modules\`
   * Linux: `~/.config/companion/modules/`
3. `cd` in and `npm install` once.
4. In Companion: Connections → Add → search for "Broadcast Graphics
   Engine" → set host + port (default `127.0.0.1:4977`).

## Actions

| Action ID         | What it does                                     |
|-------------------|--------------------------------------------------|
| `take`            | Cut preview to program                           |
| `arm`             | Arm a scene in preview (needs `sceneId`)         |
| `play_in`         | Play a layer's In animation (needs `layerId`)    |
| `play_out`        | Play a layer's Out animation (needs `layerId`)   |
| `take_item`       | Take a rundown item to air (needs `itemId`)      |
| `next_item`       | Advance to the next rundown item                 |
| `previous_item`   | Go back to the previous rundown item             |
| `play_schedule`   | Start the rundown ticker                         |
| `pause_schedule`  | Pause the rundown ticker                         |
| `stop_schedule`   | Stop the rundown ticker                          |
| `start_record`    | Start recording (optional filename + codec)      |
| `stop_record`     | Stop recording                                   |
| `ping`            | Connectivity test — expects pong                 |

## Feedbacks

| Feedback ID         | Lights when                       |
|---------------------|-----------------------------------|
| `on_air`            | Any scene is on program           |
| `recording_active`  | FFmpeg record is running          |
| `schedule_playing`  | Rundown ticker is running         |
| `ndi_streaming`     | NDI sender is active              |

## Variables

All variables update live off the `/control/state/stream` SSE channel:

`$(bge:program_scene_id)`, `$(bge:preview_scene_id)`, `$(bge:on_air)`,
`$(bge:current_item_title)`, `$(bge:next_item_title)`,
`$(bge:current_item_progress)`, `$(bge:current_item_duration)`,
`$(bge:is_schedule_playing)`, `$(bge:recording_active)`,
`$(bge:ndi_streaming)`, `$(bge:ndi_connections)`, `$(bge:scene_count)`,
`$(bge:layer_count)`.

## Presets

Six starter buttons ship in the "Playout" and "Record" categories: **Take**,
**Next**, **Previous**, **Play schedule**, **Pause schedule**, and
**Start / stop record** (two-step press).

## Protocol reference

Full protocol in [`../../docs/PHASE7_DESIGN.md`](../../docs/PHASE7_DESIGN.md).
This module doesn't do anything the design doesn't specify — a
`curl -X POST` reproduction is one of the accepted testing paths.
