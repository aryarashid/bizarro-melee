# Bizarro Melee — Architecture & Module Reference

Bizarro Melee is a standalone, offline-first 3D WebGL (with full 2D Canvas fallback) platform fighter built with native ES modules (`web/js/main.js`) for `dpad.games`. It requires zero external network requests, zero runtime build step, and works inside strict cross-origin CSP/sandbox iframes.

## Coordinate System & Fixed Timestep
- Simulation runs at a fixed `60 Hz` (`DT = 1 / 60`) in **Y-up** world coordinates (`x = 0` stage center, `y = 0` top surface of main deck, `y > 0` above stage, `y < 0` below stage).
- Simulation RNG (`match.rng`) is seeded per match (`createMatch({ seed })`) so identical inputs produce bit-identical state across peers.
- Both renderers (`render3d.js` Three.js WebGL and `render.js` 2D Canvas) read the immutable simulation frame without mutating physics state.

## Core Modules (`web/js/`)

1. **`constants.js`** — Fixed-timestep constants (`TICK_RATE`, `DT`, `MELEE`), knockback formula (`computeMeleeKnockback`), enums (`STATE`, `MOVE`, `MODE`, `ITEM_FREQUENCY`), port colors, and physics tuning.
2. **`roster.js`** — 28 playable Bizarro fighters (each with 4 costume palettes, archetype proportions, multi-region sweet/sourspot normals, and signature specials) plus 3 mode NPCs (`SAGGING_BAG`, `MASTER_MITT`, `BIZARRO_INTERN`).
3. **`stages.js`** — 29 VS stages across Tourney, Moving, Hazards, Huge, and Past 64 categories, plus `HOMERUN_STAGE`, `TARGET_STAGE`, dynamic platform resolver (`resolveStagePlatforms`), and hazards.
4. **`items.js`** — 18 Bizarro items (thrown, battering, shooting, healing, explosives) with spawn/use/collision definitions.
5. **`events.js`** — 8 handcrafted Bizarro Event Matches with custom rules, giant modifiers, starting percents, and clear tracking.
6. **`physics.js`** — Deterministic 60 Hz platform-fighter engine (`createMatch`, `stepMatch`, `resetTrainingMatch`, `spawnItemNow`, `triggerSuddenDeath`, `getFighterHurtbox`). Implements short/full hop, dash-dance, wavedash/waveland, L-cancel, light/hard/power-shield, shield drop, grabs/throws, DI/SDI/ASDI, tech rolls, edge cancels, B-reverses, reflectors, counters, sweet/sourspot hitboxes, Master Mitt multi-attack 2-phase boss, Home-Run Derby, Break the Targets, Multi-Man Brawl, and Sudden Death.
7. **`ai.js`** — Level 1–9 CPU ladder (`computeCpuInput`) with monotonic difficulty scaling, stage-aware recovery and reconnect navigation, defensive teching/shielding, and reactive 2-phase Master Mitt AI.
8. **`input.js`** — Unified `InputManager` supporting P1/P2 keyboards (including P1/P2 C-Stick), Standard/Nintendo/GameCube/8BitDo HID/DualSense HID gamepads (with analog light-shield triggers and split Right Stick Y detection), multi-touch controls (stick, A, B, Jump, SH, C-Smash, Shield, Grab), and full keyboard + gamepad menu navigation (`pollMenu`).
9. **`render3d.js` & `textures3d.js`** — Three.js WebGL 3D renderer with Blender GLB character/item/weapon/stage-prop meshes (`web/assets/models/*.glb`), 3/4 combat stance, archetype normal poses, smash anticipation cues, decoupled portrait-safe camera & fog, dramatic KO zoom/flash (respecting `flashEnabled` and `reducedMotion`), and 3D Victory Podium.
10. **`render.js` & `fx.js`** — Full 2D Canvas fallback renderer, shared dynamic camera (`Camera2D`), VFX particle/spark/ring system, hitbox/hurtbox debug overlay, recognizable vector item icons, and 2D Victory Podium.
11. **`portraits.js` & `stage-art.js`** — Illustrated character portrait atlas + costume tinting and 3D stage thumbnail atlas (`web/assets/portraits/*.jpg`, `web/assets/stages/*.jpg`).
12. **`audio.js`** — Pure Web Audio procedural SFX & low-pass filtered stage-mapped 32-bar battle music (`setMusic(track, stageId)`, `setPaused(bool)`).
13. **`dpad-sdk.js`** — Safe `dpad.games` v2 / legacy `Z2H` bridge (guarded saves, stats, achievements, leaderboards, lobbies, P2P) plus deterministic lockstep online session (`createOnlineSession`, `packOnlineInput`, `unpackOnlineInput`, `computeMatchChecksum`) with reliable `cfg`/`ack` handshake, 3-frame input delay, 4-frame redundant resend, and per-second state checksum verification.
14. **`main.js`** — Application shell, screen router, attract mode, HUD (`setStableText` zero-churn updates), Pause + Training controls, Settings (including Screen Shake, Hit Flash, Reduced Motion), Controller Config & live tester, and `window.__BIZARRO_MELEE__` verification hook.

## Packaging & Verification
- `scripts/build-dpad.py` builds the reproducible `dist/bizarro-melee-dpad.zip` package from the runtime allowlist.
- `scripts/verify-dpad.mjs` runs headless unit, physics, AI ladder monotonicity, frame-data snapshot, Home-Run/Multi-Man, controller mapping, and 10%-packet-loss online lockstep tests, followed by cross-origin CSP/sandbox Playwright checks across desktop and mobile viewports.
