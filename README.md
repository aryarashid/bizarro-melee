# Bizarro Melee

Offline-first 3D WebGL (with 2D fallback) browser platform fighter built for [dpad.games](https://dpad.games) and local play.

## Highlights

- **26 Playable Bizarro Fighters** with illustrated portraits, 4 alternate costumes, Blender-sculpted 3D models (`web/assets/models/`), authentic knockback, hitlag (including 1.5x electric victim hitlag), DI/SDI, short-hop/full-hop, L-canceling, wavedashing, ledge options, and character-specific specials (360° midair Fire-Faux/Fire-Toucan/PK-Rocket charge-launch, 2-stage Quick-Zip, Illusion/Phantasm with shorten, chargeable Missiles/Misfire, storable Giant Punch, Power Punch turnaround, 360° Vanish/Teleport, Parasol Float).
- **29 Distinct Bizarro Stages + 2 Special Arenas** with slopes, moving decks, interactive gimmicks (Critter Arena 5-form shifts, Big Blue hover convoy, Critter Floats parade, Lowrule Temple cave, Corporate Kingdom warp pipes & seesaws, Acid Vat breakable bridge, Onett Pizza Van, vanishing clouds, barrel cannons).
- **Full Game Mode Suite**: VS Stock, VS Time (with 300% Sudden Death), Team Battle, Classic Arcade (5 rounds + 300 HP stamina boss Master Mitt), 8 Bizarro Event Matches, Break the Targets, Home-Run Derby, Multi-Man Brawl (25 Unpaid Interns), Training Lab, and 3D Victory Podium.
- **Controller, Keyboard & Touch**: Full 60Hz gamepad menu navigation and combat across Xbox, PlayStation (including macOS DualSense split-axis HID), Nintendo Switch, GameCube adapters, and 8BitDo Ultimate 2 Wireless (`2dc8:6012`), plus responsive C-Stick, keyboard parity, and mobile touch controls.
- **100% Offline**: Zero external network requests; ships as a self-contained `dist/bizarro-melee-dpad.zip` package.

## Local Play

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory web
```

Open `http://127.0.0.1:4173/`.

## Build & Verify

```bash
# Build dpad.games ZIP package (outputs dist/bizarro-melee-dpad.zip)
python3 scripts/build-dpad.py

# Run full unit, simulation, and Playwright cross-origin sandbox verification
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/verify-dpad.mjs /tmp/bizarro-proof
```
