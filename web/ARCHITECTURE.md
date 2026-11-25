# Bizarro Melee — Shared Module Architecture & Contracts

All browser game files live in `web/` using native ES modules (`<script type="module" src="js/main.js"></script>`), zero external network requests, zero build step, full `dpad.games` CSP/sandbox compatibility.

## Coordinate System
- Simulation uses **Y-up** world coordinates (`x = 0` stage center, `y = 0` top surface of main deck, `y > 0` above stage, `y < 0` below stage).
- `render.js` flips Y when drawing (`canvasY = -worldY`).

## Existing Foundation Modules (already written)
1. `web/js/constants.js` — `TICK_RATE`, `DT`, `MELEE`, `computeMeleeKnockback`, `STATE`, `MOVE`, `MODE`, `PLAYER_COLORS`, `PORT_LABELS`, `GAME_VERSION`.
2. `web/js/stages.js` — `STAGES` (6 stages), `HOMERUN_STAGE`, `getStageById(id)`, `resolveStagePlatforms(stage, frame)`.
3. `web/js/roster.js` — `ROSTER` (26 Bizarro fighters), `SAGGING_BAG`, `MASTER_MITT`, `getFighterById(id)`.

## Modules Owned by Codex (`physics.js`, `ai.js`, `input.js`, `dpad-sdk.js`)

### 1. `web/js/input.js`
Exports:
- `createEmptyInput()` -> `{ moveX: 0, moveY: 0, jump: false, jumpPressed: false, attack: false, attackPressed: false, special: false, specialPressed: false, shield: false, shieldPressed: false, grab: false, grabPressed: false, tauntPressed: false, cStickX: 0, cStickY: 0, pausePressed: false }`
- `class InputManager`:
  - `constructor(options = {})` (accepts optional `touchContainer` element or attaches to window)
  - `attach(rootEl)` / `detach()`
  - `poll(portCount = 4)` -> returns array of input frames (one per port 0..3), computing `Pressed` edge triggers cleanly once per simulation tick.
  - Supports:
    - Keyboard P1: WASD (or Arrows when single-player) + J/Z Attack, K/X Special, W/Space/I/Up Jump, L/Shift/C Shield, U/E/V Grab, T/Q Taunt, Escape/Enter Pause.
    - Keyboard P2 (local 2P): Arrows + Numpad/Comma/Period/Slash (or `.` Attack, `/` Special, `'` Shield, `;` Grab, `RightShift` Jump).
    - Standard Gamepad API (`navigator.getGamepads()` polling up to 4 controllers; GameCube/Xbox/PS standard mapping, deadzone 0.22, analog stick + right C-stick smash inputs).
    - Multi-touch controls helper API: `setTouchState(patch)` and `getInputMode()` (`'keyboard' | 'gamepad' | 'touch'`) + `clearHolds()` (called on pause/resize/orientation change!).
    - Tracks `activeMode` so UI can hide touch controls on keyboard/gamepad and restore on touch.

### 2. `web/js/physics.js`
Exports:
- `createMatch(config)`:
  - `config`: `{ mode, stageId, stocks = 4, timeSeconds = 300, players: [{ port, fighterId, paletteIndex = 0, isCpu = false, cpuLevel = 5, name, team = null }], hitboxesVisible = false, classicRound = 1 }`
  - Returns mutable `match` state object:
    ```js
    {
      mode, stage, frame, status: 'intro' | 'playing' | 'paused' | 'ended',
      introTimer, endTimer, timeLeftFrames,
      hitstopFrames, screenShake, screenFlash,
      platforms, // resolved current frame platforms
      fighters: [FighterState, ...],
      projectiles: [ProjectileState, ...],
      events: [], // cleared each tick, consumed by render.js & audio.js
      winnerPort: null,
      homerun: { distanceFt: 0, maxDistanceFt: 0, barrierBroken: false, launched: false },
      stats: { totalKOs: 0 },
    }
    ```
  - Each `FighterState` has:
    - `port, name, fighterId, def (from getFighterById), paletteIndex, palette, isCpu, cpuLevel, team`
    - `x, y, vx, vy, kbVx, kbVy, facing (1|-1), grounded, onPlatformId`
    - `state (STATE.*), stateFrame, prevState`
    - `percent, stocks, kos, falls, damageDealt, wavedashCount, lCancelCount, maxCombo, comboCount, comboTimer`
    - `jumpsUsed, fastFalling, hitlag, hitstun, invulnFrames, ledgeCooldown, ledgeId, ledgeSide`
    - `shieldHp, shieldBroken, lCancelTimer, techTimer, chargeFrames, judgeNum`
    - `moveKey (MOVE.*|null), moveData, moveFrame, hitTargets (Set)`
    - `grabbedBy (port|null), grabbing (port|null), pummelTimer`
    - `staleQueue (array of move keys), staleMultipliers`
    - `lastHitBy (port|null), lastHitTimer, animPhase, squashX, squashY`
    - `activeHitboxes` (array of `{ x, y, r, damage, sweetspot }` updated every tick for Training hitbox overlay!)
    - `hurtbox` (`{ x, y, w, h }`)
- `stepMatch(match, inputsByPort)`:
  - Advances simulation by exactly 1 tick (1/60s).
  - Clears `match.events = []` at start of tick and pushes structured events:
    - `{ type: 'hit', x, y, damage, kb, sweetspot, meteor, attackerPort, victimPort, moveKey }`
    - `{ type: 'shieldHit', x, y, port, damage }`
    - `{ type: 'shieldBreak', x, y, port }`
    - `{ type: 'ko', x, y, port, killerPort, dir: 'left'|'right'|'top'|'bottom', star: boolean, sweetspot: boolean }`
    - `{ type: 'wavedash', x, y, port, dir }`
    - `{ type: 'lCancel', x, y, port }`
    - `{ type: 'jump', x, y, port, doubleJump }`
    - `{ type: 'land', x, y, port }`
    - `{ type: 'ledgeGrab', x, y, port }`
    - `{ type: 'shine', x, y, port }`
    - `{ type: 'taunt', x, y, port, text }`
    - `{ type: 'projectile', x, y, style, port }`
    - `{ type: 'judge', x, y, port, num }`
    - `{ type: 'go' }` / `{ type: 'game' }`
  - Implements authentic Melee physics: exact `computeMeleeKnockback`, dash-dancing, short/full hop, wavedashing/wavelanding, L-canceling, shielding/rolling/spotdodging, grabs/throws, ledges, DI, teching, projectiles, reflectors, counters, Rest, Judge 1-9, Home-Run Derby distance & barrier break, Classic mode Master Mitt battle!
- `getFighterHurtbox(f)` -> `{ x, y, w, h }`

### 3. `web/js/ai.js`
Exports:
- `computeCpuInput(match, fighter)` -> returns an input object matching `createEmptyInput()`.
  - Handles recovery back to stage/ledge when offstage, avoiding blastzones, chasing opponents, comboing, edgeguarding, shielding/dodging incoming attacks, using character specials, wavedashing at level >= 7, and special Master Mitt boss patterns!

### 4. `web/js/dpad-sdk.js`
Exports:
- `createDpadBridge()` -> singleton/factory with clean async methods that NEVER throw uncaught errors:
  - `init(onEvent)` -> detects `window.dpad` (v2) or legacy `window.Z2H`; calls `dpad.init({ p2p: { messageSize: 512 } })`, `dpad.loadProgress(1)`, `dpad.loadComplete()`, `dpad.requestStats()`. Returns `{ available, version, player }`.
  - `getPlayer()` -> `{ id, name, avatarUrl, language } | null` (plain text name only).
  - `loadSave(slot = 'default')` -> tries `dpad.saves.load` / `Z2H.saves.load`, falls back to guarded `localStorage` (`try/catch`), returns parsed object or null.
  - `saveData(obj, slot = 'default')` -> writes guarded `localStorage` AND throttled `dpad.saves.save` (never throws if storage denied or offline).
  - `recordMatchResult({ won, kos, wavedashes, sweetspotKo, classicCleared, classicScore, homerunFeet })` -> updates stats (`matches_won`, `kos_scored`, `wavedashes`, `classic_clears`, `homerun_best`), unlocks achievements (`first_ko`, `wavedash_pro`, `sweetspot_king`, `mitt_slayer`, `homerun_hero`), uploads leaderboard scores (`homerun-distance`, `classic-score`, `ko-total`), calls `storeStats()`.
  - `getLeaderboard(id, limit = 10)` -> wraps `dpad.listLeaderboardEntries`, falls back to local personal bests when offline.
  - Online 1v1 Multiplayer helpers (wrapping `dpad.createLobby`, `dpad.listAvailableLobbies`, `dpad.joinLobby`, `dpad.leaveLobby`, `dpad.getLobbyInviteLink`, `dpad.p2p`):
    - `createOnlineLobby(isPrivate)`
    - `findPublicLobby()`
    - `leaveOnlineLobby()`
    - `sendP2P(channel, payload, reliable)`
    - `getOnlineState()` -> `{ inLobby, lobbyId, isHost, inviteLink, peers, connected, statusText }`

## Modules Owned by Claude Code (`render.js`, `audio.js`, `css/game.css`, `index.html`, `main.js`)

### 5. `web/js/render.js`
Exports:
- `class GameRenderer`:
  - `constructor(canvas)`
  - `resize(width, height, dpr)`
  - `ingestEvents(events, match)` -> spawns hitsparks, dust puffs, KO beams, star KO flyers, shine hexagons, taunt speech bubbles, judge numbers, L-cancel flashes!
  - `render(match, options = {})` -> draws sky/parallax stage background, stage platforms & moving clouds/water reflections, ledges, dynamic Melee camera, all fighters (bespoke articulated procedural Bizarro art for every `rig.silhouette`, `hat`, `prop`, `cape`, `tail`, `eyes`, `buddy`), projectiles, weapon smear arcs, shields, particles, optional hitbox/hurtbox debug overlay (`options.showHitboxes`), and Home-Run distance markers!
  - `drawPortrait(canvas, fighterDef, paletteIndex)` -> draws crisp Bizarro character bust/portrait onto a small canvas for CSS tiles & HUD!

### 6. `web/js/audio.js`
Exports:
- `class SoundEngine`:
  - Pure Web Audio API (no external files), safe under autoplay policies (unlocks on first user gesture).
  - `unlock()`, `setMuted(bool)`, `isMuted()`, `setSfxVolume(0..1)`, `setMusicVolume(0..1)`
  - `playEvents(events)` -> plays punchy Melee-inspired hit impacts, sweetspot lightning crack, Shine blip, laser pew, wavedash slide, jump whoosh, shield block/break, KO explosion + crowd cheer, taunt chirp, Judge 9 ding!
  - `playUi(type)` -> `'move' | 'select' | 'back' | 'start' | 'ready' | 'go' | 'game'`
  - `setMusic(track)` -> `'none' | 'menu' | 'battle' | 'boss'` (original procedural arcade synth loop!)

### 7. `web/index.html`, `web/css/game.css`, `web/js/main.js`
- `web/index.html`: Clean `<head>` (so dpad injects `window.dpad` first), viewport meta, favicon `assets/icon.svg`, `css/game.css`, `<canvas id="game-canvas">`, crisp semantic overlays for Title, Character Select (all 26 Bizarro fighters), Stage Select, Online Lobby, In-Match HUD, Pause, Settings, Results, Leaderboards, and responsive Touch Controls.
- `web/js/main.js`: Wires `InputManager`, `createMatch`/`stepMatch`, `computeCpuInput`, `GameRenderer`, `SoundEngine`, `createDpadBridge()`.
  - Exposes `window.__BIZARRO_MELEE__` debug handle (`getState()`, `getMatch()`, `startQuickMatch()`, etc.) for automated verification.
  - Supports attract-mode live CPU vs CPU match behind Title Screen.
  - Handles `Escape` pause, visibility/orientation-change auto-pause + `input.clearHolds()`, zero `location.reload()`, zero external requests, and plain-text rendering of all player names.
