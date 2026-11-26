import { detCos, detSin } from './constants.js';
/**
 * Bizarro Melee Complete Stage Collection — ALL 29 Super Smash Bros. Melee VS Stages
 * (+ Sagging Bag Yard for Home-Run Derby + Break the Targets Lab = 31 total playable arenas!)
 *
 * Every stage features genuinely distinct Melee-inspired terrain, slopes, ceilings, walls,
 * architectural 3D shapes, and signature interactive gimmicks:
 *   - slope: vertical delta across width (yAtX = y + t * slope)
 *   - shape: architectural 3D style ('citadel','starship','skyscraper','castle','cruise',
 *            'mountain','vehicle','balloon','island','cavern','treehouse','street','lcd','pipe')
 *   - walkOff: true on walk-off street edges (no ledge grab, extends toward blastzone)
 *   - breakable: true on breakable Brinstar bridge
 *   - vanishing: true on Yoshi disappearing clouds
 *   - diving: true on Great Bay diving turtle
 *   - transformations: live Critter Arena (Pokemon Stadium) terrain morphs
 *   - warpPipes: interactive teleporter pipes (Corporate Kingdom)
 *   - barrelCannon: oscillating recovery cannon under chasm (Kongo Jungle / 64)
 *   - hotFloorY: scorching high-speed road underneath (Mute City / Big Blue)
 *   - riverFlow: rushing rapid river current below (Jungle Japes)
 *   - seesaw: weight-reactive linked platform pair (Corporate Kingdom)
 *
 * Coordinates are Y-up (center X = 0, main deck Y = 0, Y > 0 up, Y < 0 below deck).
 */

export const STAGES = [
  // 1. Battlefield — Tournament Tri-Platform Standard
  {
    id: 'arguefield', name: 'Arguefield', parodyOf: 'Battlefield', category: 'tourney',
    tagline: 'Floating twilight ruins where people debate tier lists forever.',
    theme: 'twilight',
    props: [{ mesh: 'Prop_RuinPillar', x: -340, y: -155, z: -180, s: 70 }, { mesh: 'Prop_RuinPillar', x: 340, y: -155, z: -180, s: 70 }, { mesh: 'Prop_RuneRing', x: 0, y: 420, z: -520, s: 90 }],
    palette: { skyTop: '#0e1430', skyMid: '#24295c', skyBottom: '#5a3b6e', accent: '#7ce8ff', deckTop: '#9aa8c7', deckBody: '#353e59', deckTrim: '#5fd4ff', platColor: '#c4d2f0' },
    blastzones: { left: -1200, right: 1200, top: 920, bottom: -680 },
    cameraBounds: { left: -900, right: 900, top: 680, bottom: -400 },
    spawns: [{ x: -240, y: 80, facing: 1 }, { x: 240, y: 80, facing: -1 }, { x: -100, y: 240, facing: 1 }, { x: 100, y: 240, facing: -1 }],
    respawnPoint: { x: 0, y: 310 },
    solid: [{ x: -420, y: 0, w: 840, h: 165, ledges: true, shape: 'citadel' }],
    platforms: [{ id: 'left', x: -345, y: 155, w: 200 }, { id: 'right', x: 145, y: 155, w: 200 }, { id: 'top', x: -105, y: 310, w: 210 }],
  },

  // 2. Final Destination — Pure Flat Cosmic Stage
  {
    id: 'final-obligation', name: 'Final Obligation', parodyOf: 'Final Destination', category: 'tourney',
    tagline: 'No items, Faux only, zero excuses, infinite cosmic spreadsheets.',
    theme: 'cosmos',
    props: [{ mesh: 'Prop_CosmicCrystal', x: -520, y: 140, z: -320, s: 85 }, { mesh: 'Prop_CosmicCrystal', x: 520, y: 140, z: -320, s: 85 }, { mesh: 'Prop_RuneRing', x: 0, y: 280, z: -480, s: 110 }],
    palette: { skyTop: '#070414', skyMid: '#1a0c38', skyBottom: '#3e185e', accent: '#ff52b8', deckTop: '#e6d8ff', deckBody: '#271747', deckTrim: '#ff66cc', platColor: '#ff9ce6' },
    blastzones: { left: -1280, right: 1280, top: 960, bottom: -700 },
    cameraBounds: { left: -940, right: 940, top: 700, bottom: -400 },
    spawns: [{ x: -280, y: 80, facing: 1 }, { x: 280, y: 80, facing: -1 }, { x: -120, y: 80, facing: 1 }, { x: 120, y: 80, facing: -1 }],
    respawnPoint: { x: 0, y: 290 },
    solid: [{ x: -480, y: 0, w: 960, h: 145, ledges: true, shape: 'starship' }],
    platforms: [],
  },

  // 3. Yoshi's Story — Tight Sloped Craft Dome + Orbiting Scandall Cloud
  {
    id: 'randalls-tax-shelter', name: "Scandall's Tax Shelter", parodyOf: "Yoshi's Story", category: 'tourney',
    tagline: 'Tight blastzones, sloped grass hills & an offshore cloud named Scandall.',
    theme: 'craft',
    props: [{ mesh: 'Prop_Tree', x: -280, y: 40, z: -220, s: 85 }, { mesh: 'Prop_Tree', x: 290, y: 30, z: -260, s: 75 }, { mesh: 'Prop_CraftCloud', x: -40, y: 260, z: -340, s: 80 }, { mesh: 'Prop_CraftCloud', x: 220, y: 310, z: -400, s: 60 }],
    palette: { skyTop: '#49a6ff', skyMid: '#8ad4ff', skyBottom: '#fff3c4', accent: '#ff8a3d', deckTop: '#7be06c', deckBody: '#a8643a', deckTrim: '#ffdf6b', platColor: '#ffe07a' },
    blastzones: { left: -980, right: 980, top: 780, bottom: -560 },
    cameraBounds: { left: -780, right: 780, top: 580, bottom: -340 },
    spawns: [{ x: -210, y: 80, facing: 1 }, { x: 210, y: 80, facing: -1 }, { x: -90, y: 210, facing: 1 }, { x: 90, y: 210, facing: -1 }],
    respawnPoint: { x: 0, y: 270 },
    solid: [
      { x: -345, y: -16, w: 135, h: 210, ledges: true, slope: 22, shape: 'island' },
      { x: -215, y: 6, w: 430, h: 215, ledges: false, shape: 'island' },
      { x: 210, y: 6, w: 135, h: 210, ledges: true, slope: -22, shape: 'island' },
    ],
    platforms: [
      { id: 'left', x: -315, y: 130, w: 175, slope: 10 },
      { id: 'right', x: 140, y: 140, w: 175, slope: -10 },
      { id: 'top', x: -90, y: 268, w: 180 },
      { id: 'scandall', x: 360, y: -30, w: 125, cloud: true, update(f) { const a = (f / 1200) * Math.PI * 2; return { x: detCos(a) * 435 - 62, y: -32 + detSin(a * 2) * 52 }; } },
    ],
  },

  // 4. Fountain of Dreams — Independent Sinking/Rising Fountain Platforms
  {
    id: 'puddle-of-insomnia', name: 'Puddle of Insomnia', parodyOf: 'Fountain of Dreams', category: 'tourney',
    tagline: '3 AM glistening water with fountain platforms that sink completely into the deck.',
    theme: 'fountain',
    props: [{ mesh: 'Prop_Fountain', x: 0, y: 12, z: -230, s: 105 }, { mesh: 'Prop_CosmicCrystal', x: -420, y: 120, z: -280, s: 70 }, { mesh: 'Prop_CosmicCrystal', x: 420, y: 120, z: -280, s: 70 }],
    palette: { skyTop: '#080e24', skyMid: '#182b57', skyBottom: '#3c255e', accent: '#82f7ff', deckTop: '#d7e6ff', deckBody: '#2b3a66', deckTrim: '#9af5ff', platColor: '#aeeeff' },
    blastzones: { left: -1140, right: 1140, top: 880, bottom: -640 },
    cameraBounds: { left: -860, right: 860, top: 640, bottom: -380 },
    spawns: [{ x: -220, y: 80, facing: 1 }, { x: 220, y: 80, facing: -1 }, { x: -95, y: 250, facing: 1 }, { x: 95, y: 250, facing: -1 }],
    respawnPoint: { x: 0, y: 310 },
    solid: [{ x: -395, y: 0, w: 790, h: 175, ledges: true, shape: 'citadel' }],
    platforms: [
      { id: 'left', x: -335, y: 110, w: 175, update(f) { const s = detSin(f * 0.014); return { x: -335, y: Math.max(-6, 86 + s * 112) }; } },
      { id: 'right', x: 160, y: 150, w: 175, update(f) { const s = detCos(f * 0.012 + 0.9); return { x: 160, y: Math.max(-6, 86 + s * 112) }; } },
      { id: 'top', x: -95, y: 298, w: 190 },
    ],
  },

  // 5. Dream Land 64 — Massive Blastzones + Whispy HOA Wind Gusts
  {
    id: 'nightmare-suburb', name: 'Nightmare Suburb', parodyOf: 'Dream Land 64', category: 'tourney',
    tagline: 'Enormous HOA lawn with tall platforms and an angry leafblower tree.',
    theme: 'suburb',
    props: [{ mesh: 'Prop_Tree', x: 0, y: 80, z: -220, s: 125 }],
    palette: { skyTop: '#2474c9', skyMid: '#68b4f7', skyBottom: '#d9f2ff', accent: '#ffe159', deckTop: '#64d45d', deckBody: '#7a5233', deckTrim: '#e5ff70', platColor: '#e7c07b' },
    blastzones: { left: -1380, right: 1380, top: 1020, bottom: -740 },
    cameraBounds: { left: -980, right: 980, top: 720, bottom: -420 },
    spawns: [{ x: -260, y: 80, facing: 1 }, { x: 260, y: 80, facing: -1 }, { x: -115, y: 250, facing: 1 }, { x: 115, y: 250, facing: -1 }],
    respawnPoint: { x: 0, y: 330 },
    solid: [{ x: -455, y: 0, w: 910, h: 185, ledges: true, shape: 'island' }],
    platforms: [{ id: 'left', x: -385, y: 180, w: 215 }, { id: 'right', x: 170, y: 180, w: 215 }, { id: 'top', x: -110, y: 340, w: 220 }],
    wind(f) { const c = f % 720; return (c > 520 && c < 680) ? (Math.floor(f / 720) % 2 === 0 ? 1 : -1) * 0.48 : 0; },
  },

  // 6. Pokémon Stadium — LIVE 5-FORM TERRAIN TRANSFORMATIONS!
  {
    id: 'critter-arena', name: 'Critter Arena', parodyOf: 'Pokémon Stadium', category: 'tourney',
    tagline: 'Live transforming stadium: morphs between Normal, Fire Pit, Rock Quarry, Water Mill & Grass!',
    theme: 'stadium',
    props: [{ mesh: 'Prop_Jumbotron', x: 0, y: 168, z: -560, s: 46 }, { mesh: 'Prop_Floodlight', x: -440, y: 60, z: -210, s: 90 }, { mesh: 'Prop_Floodlight', x: 440, y: 60, z: -210, s: 90 }],
    palette: { skyTop: '#101c33', skyMid: '#1e3a5f', skyBottom: '#2d6a6b', accent: '#59ff9e', deckTop: '#56c77a', deckBody: '#2b3847', deckTrim: '#63ffa8', platColor: '#dbe8f5' },
    blastzones: { left: -1260, right: 1260, top: 900, bottom: -660 },
    cameraBounds: { left: -920, right: 920, top: 660, bottom: -380 },
    spawns: [{ x: -290, y: 80, facing: 1 }, { x: 290, y: 80, facing: -1 }, { x: -130, y: 80, facing: 1 }, { x: 130, y: 80, facing: -1 }],
    respawnPoint: { x: 0, y: 310 },
    solid: [{ x: -495, y: 0, w: 990, h: 145, ledges: true, shape: 'stadium' }],
    platforms: [{ id: 'left', x: -340, y: 155, w: 205 }, { id: 'right', x: 135, y: 155, w: 205 }],
    transformations: [
      {
        id: 'normal', name: 'NORMAL STADIUM', accent: '#59ff9e',
        solid: [{ x: -495, y: 0, w: 990, h: 145, ledges: true, shape: 'stadium' }],
        platforms: [{ id: 'left', x: -340, y: 155, w: 205 }, { id: 'right', x: 135, y: 155, w: 205 }],
      },
      {
        id: 'fire', name: 'FIRE PIT', accent: '#ff6b35',
        solid: [
          { x: -495, y: 0, w: 390, h: 145, ledges: true, shape: 'cavern' },
          { x: -105, y: 0, w: 220, h: 145, ledges: false, slope: 75, shape: 'cavern' },
          { x: 115, y: 75, w: 380, h: 220, ledges: true, slope: -35, shape: 'cavern' },
        ],
        platforms: [
          { id: 'fire-tree-1', x: -360, y: 165, w: 185 },
          { id: 'fire-tree-2', x: -270, y: 290, w: 170 },
          { id: 'fire-ridge', x: 210, y: 210, w: 190 },
        ],
      },
      {
        id: 'rock', name: 'ROCK QUARRY', accent: '#d6a25c',
        solid: [
          { x: -495, y: 0, w: 690, h: 145, ledges: true, shape: 'mountain' },
          { x: 195, y: 235, w: 210, h: 380, ledges: true, shape: 'mountain' },
          { x: 405, y: 75, w: 110, h: 220, ledges: true, slope: -40, shape: 'mountain' },
        ],
        platforms: [
          { id: 'rock-pit', x: -410, y: 130, w: 175 },
          { id: 'rock-mid', x: -110, y: 185, w: 215, slope: 28 },
          { id: 'rock-peak', x: 175, y: 345, w: 230 },
        ],
      },
      {
        id: 'water', name: 'WATER MILL', accent: '#38f5ff',
        solid: [
          { x: -495, y: 0, w: 410, h: 145, ledges: true, slope: -20, shape: 'island' },
          { x: -85, y: -20, w: 220, h: 125, ledges: false, shape: 'island' },
          { x: 135, y: 40, w: 360, h: 185, ledges: true, shape: 'treehouse' },
        ],
        platforms: [
          { id: 'mill-wheel', x: -90, y: 130, w: 170, update(f) { return { x: -90 + detCos(f * 0.03) * 55, y: 145 + detSin(f * 0.03) * 55 }; } },
          { id: 'mill-roof', x: 175, y: 215, w: 230, slope: 24 },
          { id: 'dock-l', x: -415, y: 140, w: 195 },
        ],
      },
      {
        id: 'grass', name: 'GRASS CLEARING', accent: '#7be06c',
        solid: [
          { x: -495, y: 48, w: 320, h: 190, ledges: true, slope: -48, shape: 'island' },
          { x: -175, y: 0, w: 350, h: 145, ledges: false, shape: 'island' },
          { x: 175, y: 0, w: 320, h: 190, ledges: true, slope: 48, shape: 'island' },
        ],
        platforms: [
          { id: 'moss-l', x: -420, y: 195, w: 190 },
          { id: 'moss-c', x: -115, y: 145, w: 230 },
          { id: 'moss-r', x: 230, y: 195, w: 190 },
        ],
      },
    ],
  },

  // 7. Princess Peach's Castle — Pyramid Castle Roof + Sloped Eaves + Roving Balcony + HOA Rocket
  {
    id: 'foreclosed-castle', name: 'Foreclosed Castle', parodyOf: "Princess Peach's Castle", category: 'hazard',
    tagline: 'Sloped pyramid castle roof, floating side triangle ledges, roving balcony & HOA fine rocket.',
    theme: 'suburb', hazard: 'fineRocket',
    props: [{ mesh: 'Prop_CastleTurret', x: -390, y: 45, z: -220, s: 95 }, { mesh: 'Prop_CastleTurret', x: 390, y: 45, z: -220, s: 95 }],
    palette: { skyTop: '#3b82f6', skyMid: '#93c5fd', skyBottom: '#fef3c7', accent: '#f43f5e', deckTop: '#f8fafc', deckBody: '#dc2626', deckTrim: '#facc15', platColor: '#fca5a5' },
    blastzones: { left: -1260, right: 1260, top: 940, bottom: -660 },
    cameraBounds: { left: -920, right: 920, top: 700, bottom: -380 },
    spawns: [{ x: -290, y: 90, facing: 1 }, { x: 290, y: 90, facing: -1 }, { x: -90, y: 210, facing: 1 }, { x: 90, y: 210, facing: -1 }],
    respawnPoint: { x: 0, y: 340 },
    solid: [
      { x: -470, y: 0, w: 280, h: 165, ledges: true, shape: 'castle' },
      { x: -190, y: 0, w: 190, h: 245, ledges: false, slope: 92, shape: 'castle' },
      { x: 0, y: 92, w: 190, h: 245, ledges: false, slope: -92, shape: 'castle' },
      { x: 190, y: 0, w: 280, h: 165, ledges: true, shape: 'castle' },
    ],
    platforms: [
      { id: 'tri-l', x: -610, y: 115, w: 155, slope: 28 },
      { id: 'tri-r', x: 455, y: 143, w: 155, slope: -28 },
      { id: 'balcony', x: -115, y: 265, w: 230, update(f) { return { x: -115 + detSin(f * 0.019) * 210, y: 265 }; } },
    ],
  },

  // 8. Rainbow Cruise — Multi-Deck Flying Cruise Ship + Stern Wall Cabin + Magic Carpets
  {
    id: 'rainbow-highway', name: 'Rainbow Highway Robbery', parodyOf: 'Rainbow Cruise', category: 'moving',
    tagline: 'Multi-deck sky cruiser with wall-jumpable stern cabin, mast perch & drifting magic carpets.',
    theme: 'craft',
    props: [{ mesh: 'Prop_CastleTurret', x: -460, y: 100, z: -260, s: 85 }, { mesh: 'Prop_Balloon', x: 440, y: 230, z: -280, s: 75 }],
    palette: { skyTop: '#2563eb', skyMid: '#60a5fa', skyBottom: '#fbcfe8', accent: '#fde047', deckTop: '#fbbf24', deckBody: '#92400e', deckTrim: '#f472b6', platColor: '#a78bfa' },
    blastzones: { left: -1340, right: 1340, top: 960, bottom: -680 },
    cameraBounds: { left: -980, right: 980, top: 700, bottom: -400 },
    spawns: [{ x: -240, y: 90, facing: 1 }, { x: 250, y: 180, facing: -1 }, { x: -40, y: 90, facing: 1 }, { x: 40, y: 290, facing: -1 }],
    respawnPoint: { x: 0, y: 340 },
    solid: [
      { x: -450, y: 24, w: 190, h: 135, ledges: true, slope: -24, shape: 'cruise' },
      { x: -260, y: 0, w: 420, h: 130, ledges: false, shape: 'cruise' },
      { x: 160, y: 115, w: 250, h: 245, ledges: true, shape: 'cruise' },
    ],
    platforms: [
      { id: 'carpet-l', x: -580, y: 130, w: 170, update(f) { return { x: -560 + detSin(f * 0.021) * 75, y: 130 + detCos(f * 0.026) * 65 }; } },
      { id: 'carpet-r', x: 410, y: 190, w: 170, update(f) { return { x: 410 - detSin(f * 0.021) * 75, y: 190 + detSin(f * 0.026) * 65 }; } },
      { id: 'mast-mid', x: -135, y: 175, w: 210 },
      { id: 'mast-top', x: -95, y: 315, w: 170 },
    ],
  },

  // 9. Mushroom Kingdom — Split Brick Canyon + Interactive WARP PIPES + Weight-Reactive Seesaw
  {
    id: 'corporate-kingdom', name: 'Corporate Kingdom', parodyOf: 'Mushroom Kingdom', category: 'moving',
    tagline: 'Retro brick canyon with working Warp Pipes (crouch to teleport!) & weight-reactive seesaws.',
    theme: 'suburb',
    props: [{ mesh: 'Prop_WarpPipe', x: -395, y: 36, z: -68, s: 55 }, { mesh: 'Prop_WarpPipe', x: 395, y: 36, z: -68, s: 55 }],
    palette: { skyTop: '#3b82f6', skyMid: '#60a5fa', skyBottom: '#bae6fd', accent: '#22c55e', deckTop: '#d97706', deckBody: '#92400e', deckTrim: '#fde047', platColor: '#f59e0b' },
    blastzones: { left: -1260, right: 1260, top: 920, bottom: -640 },
    cameraBounds: { left: -940, right: 940, top: 680, bottom: -380 },
    spawns: [{ x: -260, y: 90, facing: 1 }, { x: 260, y: 90, facing: -1 }, { x: -80, y: 285, facing: 1 }, { x: 80, y: 285, facing: -1 }],
    respawnPoint: { x: 0, y: 320 },
    warpPipes: [
      { id: 'pipe-l', x: -395, y: 0, targetId: 'pipe-r' },
      { id: 'pipe-r', x: 395, y: 0, targetId: 'pipe-l' },
    ],
    seesaw: { leftId: 'seesaw-l', rightId: 'seesaw-r', baseY: 150, maxOffset: 85 },
    solid: [
      { x: -530, y: 0, w: 430, h: 155, ledges: true, shape: 'pipe' },
      { x: 100, y: 0, w: 430, h: 155, ledges: true, shape: 'pipe' },
      { x: -135, y: 235, w: 270, h: 42, ledges: false, shape: 'pipe' },
    ],
    platforms: [
      { id: 'seesaw-l', x: -345, y: 150, w: 180 },
      { id: 'seesaw-r', x: 165, y: 150, w: 180 },
      { id: 'brick-l', x: -500, y: 155, w: 130 },
      { id: 'brick-r', x: 370, y: 155, w: 130 },
    ],
  },

  // 10. Mushroom Kingdom II — Stepped Desert Waterfall + Bobbing Log Bridge + Side Pyramids
  {
    id: 'corporate-kingdom-2', name: 'Corporate Kingdom II', parodyOf: 'Mushroom Kingdom II', category: 'hazard',
    tagline: 'Stepped canyon ruins flanking a deep waterfall chasm with bobbing logs & HOA rockets.',
    theme: 'craft', hazard: 'fineRocket',
    props: [{ mesh: 'Prop_WarpPipe', x: -470, y: 80, z: -210, s: 80 }, { mesh: 'Prop_Tree', x: 470, y: 70, z: -220, s: 90 }],
    palette: { skyTop: '#1d4ed8', skyMid: '#38bdf8', skyBottom: '#e0f2fe', accent: '#f43f5e', deckTop: '#ef4444', deckBody: '#7f1d1d', deckTrim: '#facc15', platColor: '#fbbf24' },
    blastzones: { left: -1280, right: 1280, top: 920, bottom: -640 },
    cameraBounds: { left: -940, right: 940, top: 680, bottom: -380 },
    spawns: [{ x: -310, y: 90, facing: 1 }, { x: 310, y: 90, facing: -1 }, { x: -460, y: 150, facing: 1 }, { x: 460, y: 150, facing: -1 }],
    respawnPoint: { x: 0, y: 310 },
    solid: [
      { x: -580, y: 65, w: 200, h: 215, ledges: true, shape: 'pipe' },
      { x: -380, y: 0, w: 255, h: 150, ledges: true, shape: 'pipe' },
      { x: 125, y: 0, w: 255, h: 150, ledges: true, shape: 'pipe' },
      { x: 380, y: 65, w: 200, h: 215, ledges: true, shape: 'pipe' },
    ],
    platforms: [
      { id: 'log-1', x: -110, y: 12, w: 100, update(f) { return { x: -110, y: -10 + detSin(f * 0.045) * 42 }; } },
      { id: 'log-2', x: 10, y: -12, w: 100, update(f) { return { x: 10, y: -10 + detCos(f * 0.045) * 42 }; } },
      { id: 'high-l', x: -470, y: 205, w: 185 },
      { id: 'high-r', x: 285, y: 205, w: 185 },
    ],
  },

  // 11. Kongo Jungle (Melee) — Twin Waterfall Cliffs + Elevated Tiki Roof + BARREL CANNON!
  {
    id: 'tropic-condo-falls', name: 'Tropic Condo Falls', parodyOf: 'Kongo Jungle', category: 'moving',
    tagline: 'Twin jungle rock cliffs with a swaying log roof & a rescue Barrel Cannon below the chasm!',
    theme: 'craft',
    props: [{ mesh: 'Prop_Tree', x: -450, y: 70, z: -210, s: 100 }, { mesh: 'Prop_Tree', x: 450, y: 70, z: -210, s: 100 }],
    palette: { skyTop: '#0f4c5c', skyMid: '#2a9d8f', skyBottom: '#e9c46a', accent: '#f4a261', deckTop: '#d4a373', deckBody: '#6f4e37', deckTrim: '#e9c46a', platColor: '#faedcd' },
    blastzones: { left: -1300, right: 1300, top: 940, bottom: -680 },
    cameraBounds: { left: -940, right: 940, top: 700, bottom: -400 },
    spawns: [{ x: -290, y: 90, facing: 1 }, { x: 290, y: 90, facing: -1 }, { x: -100, y: 250, facing: 1 }, { x: 100, y: 250, facing: -1 }],
    respawnPoint: { x: 0, y: 330 },
    barrelCannon: { y: -165, minX: -270, maxX: 270, speed: 0.025, radius: 48, launchVy: 29 },
    solid: [
      { x: -520, y: 36, w: 380, h: 175, ledges: true, slope: -36, shape: 'treehouse' },
      { x: 140, y: 0, w: 380, h: 175, ledges: true, slope: 36, shape: 'treehouse' },
    ],
    platforms: [
      { id: 'bridge-mid', x: -145, y: 12, w: 290 },
      { id: 'tiki-l', x: -415, y: 165, w: 205 },
      { id: 'tiki-r', x: 210, y: 165, w: 205 },
      { id: 'sway', x: -120, y: 285, w: 240, update(f) { return { x: -120 + detSin(f * 0.024) * 175, y: 285 }; } },
    ],
  },

  // 12. Jungle Japes — Raised Cranky's Hut + Twin Riverbanks + RUSHING RAPID RIVER!
  {
    id: 'jungle-japes-hoa', name: 'Jungle Japes HOA', parodyOf: 'Jungle Japes', category: 'moving',
    tagline: 'Treehouse porch & twin outer banks over a raging river that sweeps low fighters away!',
    theme: 'craft',
    props: [{ mesh: 'Prop_Tree', x: 0, y: 65, z: -240, s: 130 }],
    palette: { skyTop: '#14532d', skyMid: '#15803d', skyBottom: '#86efac', accent: '#fde047', deckTop: '#a16207', deckBody: '#451a03', deckTrim: '#facc15', platColor: '#d97706' },
    blastzones: { left: -1280, right: 1280, top: 920, bottom: -620 },
    cameraBounds: { left: -940, right: 940, top: 680, bottom: -360 },
    spawns: [{ x: -160, y: 100, facing: 1 }, { x: 160, y: 100, facing: -1 }, { x: -460, y: 90, facing: 1 }, { x: 460, y: 90, facing: -1 }],
    respawnPoint: { x: 0, y: 340 },
    riverFlow: { y: -55, vx: 3.1 },
    solid: [
      { x: -245, y: 24, w: 490, h: 115, ledges: true, shape: 'treehouse' },
      { x: -585, y: -15, w: 215, h: 120, ledges: true, slope: 22, shape: 'treehouse' },
      { x: 370, y: 7, w: 215, h: 120, ledges: true, slope: -22, shape: 'treehouse' },
    ],
    platforms: [
      { id: 'hut-roof', x: -215, y: 205, w: 430 },
      { id: 'hut-peak', x: -105, y: 330, w: 210 },
    ],
  },

  // 13. Hyrule Temple — MASSIVE 3-TIER CITADEL WITH SOLID-CEILING FIGHT CLUB CAVE!
  {
    id: 'lowrule-temple', name: 'Lowrule Temple', parodyOf: 'Hyrule Temple', category: 'huge',
    tagline: 'Sprawling 3-tier stone citadel featuring the notorious enclosed Fight Club cave!',
    theme: 'twilight',
    props: [{ mesh: 'Prop_RuinPillar', x: -520, y: 240, z: -240, s: 90 }, { mesh: 'Prop_RuinPillar', x: 520, y: 150, z: -240, s: 85 }, { mesh: 'Prop_Torch', x: -200, y: -40, z: -180, s: 55 }, { mesh: 'Prop_Torch', x: 180, y: 20, z: -200, s: 50 },
      { mesh: 'Prop_MossRock', x: -330, y: -112, z: -240, s: 73 }, { mesh: 'Prop_MossRock', x: 440, y: -95, z: -270, s: 91 }],
    palette: { skyTop: '#1d3c6a', skyMid: '#4f7cac', skyBottom: '#c0d6df', accent: '#ffdf4d', deckTop: '#d6ccc2', deckBody: '#6c584c', deckTrim: '#e6ccb2', platColor: '#ede0d4' },
    blastzones: { left: -1680, right: 1680, top: 1140, bottom: -880 },
    cameraBounds: { left: -1200, right: 1200, top: 820, bottom: -600 },
    spawns: [{ x: -480, y: 220, facing: 1 }, { x: 460, y: 170, facing: -1 }, { x: -160, y: -155, facing: 1 }, { x: 160, y: -155, facing: -1 }],
    respawnPoint: { x: 0, y: 380 },
    solid: [
      // Left upper citadel spire + sloped promenade
      { x: -720, y: 190, w: 280, h: 140, ledges: true, shape: 'citadel' },
      { x: -440, y: 145, w: 290, h: 115, ledges: false, slope: -45, shape: 'citadel' },
      // Solid roof over the Fight Club cave (players can wall/ceiling-tech inside!)
      { x: -150, y: 100, w: 410, h: 85, ledges: false, shape: 'citadel' },
      // Right ruined terrace
      { x: 260, y: 100, w: 420, h: 135, ledges: true, slope: 32, shape: 'citadel' },
      // Fight Club cave left wall pillar & lower arena floor
      { x: -395, y: -10, w: 68, h: 215, ledges: false, shape: 'citadel' },
      { x: -395, y: -225, w: 660, h: 125, ledges: true, shape: 'citadel' },
      // Lower-right floating ruin island
      { x: 375, y: -265, w: 245, h: 100, ledges: true, shape: 'citadel' },
    ],
    platforms: [
      { id: 'spire-top', x: -660, y: 330, w: 210 },
      { id: 'mid-arch', x: -105, y: 255, w: 220 },
      { id: 'right-ruin', x: 400, y: 265, w: 210 },
      { id: 'cave-ledge', x: -160, y: -92, w: 250 },
    ],
  },

  // 14. Great Bay — Multi-Story Lab Pier + DIVING GIANT TURTLE BUOY!
  {
    id: 'great-bay-marina', name: 'Great Bay Marina', parodyOf: 'Great Bay', category: 'moving',
    tagline: '2-story marina lab pier on the left & a giant turtle buoy that periodically dives underwater!',
    theme: 'fountain',
    props: [{ mesh: 'Prop_IceSpire', x: -480, y: 80, z: -240, s: 90 }, { mesh: 'Prop_Floodlight', x: 380, y: 60, z: -240, s: 85 }],
    palette: { skyTop: '#0284c7', skyMid: '#38bdf8', skyBottom: '#bae6fd', accent: '#fde047', deckTop: '#e2e8f0', deckBody: '#475569', deckTrim: '#38bdf8', platColor: '#67e8f9' },
    blastzones: { left: -1300, right: 1300, top: 940, bottom: -640 },
    cameraBounds: { left: -960, right: 960, top: 700, bottom: -380 },
    spawns: [{ x: -310, y: 120, facing: 1 }, { x: 40, y: 90, facing: -1 }, { x: -320, y: 240, facing: 1 }, { x: 320, y: 90, facing: -1 }],
    respawnPoint: { x: -80, y: 320 },
    solid: [
      { x: -560, y: 55, w: 320, h: 210, ledges: true, shape: 'street' },
      { x: -240, y: 0, w: 390, h: 155, ledges: true, slope: -18, shape: 'treehouse' },
    ],
    platforms: [
      { id: 'lab-mid', x: -500, y: 175, w: 230 },
      { id: 'lab-roof', x: -450, y: 295, w: 190 },
      {
        id: 'turtle', x: 245, y: 15, w: 240, cloud: true, diving: true,
        update(f) {
          const cycle = f % 720;
          let y = 12 + detSin(f * 0.04) * 14;
          if (cycle > 480 && cycle < 640) {
            const t = detSin(((cycle - 480) / 160) * Math.PI);
            y = 12 - t * 220;
          }
          return { x: 245, y };
        },
      },
      { id: 'buoy', x: -80, y: 210, w: 180, update(f) { return { x: -80 + detSin(f * 0.02) * 85, y: 210 }; } },
    ],
  },

  // 15. Yoshi's Island (Melee) — Stepped Pastel Mountain + VANISHING CLOUD PLATFORMS!
  {
    id: 'yoshis-tax-island', name: "Broshee's Tax Island", parodyOf: "Yoshi's Island", category: 'moving',
    tagline: 'Sloped pastel mountain flanked by disappearing clouds that poof away under your feet!',
    theme: 'craft',
    props: [{ mesh: 'Prop_Tree', x: -340, y: 50, z: -220, s: 95 }, { mesh: 'Prop_Balloon', x: 340, y: 210, z: -260, s: 75 }],
    palette: { skyTop: '#38bdf8', skyMid: '#7dd3fc', skyBottom: '#fef9c3', accent: '#f97316', deckTop: '#4ade80', deckBody: '#9a5b32', deckTrim: '#fde047', platColor: '#fef08a' },
    blastzones: { left: -1260, right: 1260, top: 920, bottom: -640 },
    cameraBounds: { left: -920, right: 920, top: 680, bottom: -380 },
    spawns: [{ x: -240, y: 90, facing: 1 }, { x: 240, y: 90, facing: -1 }, { x: -80, y: 220, facing: 1 }, { x: 80, y: 220, facing: -1 }],
    respawnPoint: { x: 0, y: 310 },
    solid: [
      { x: -420, y: -15, w: 220, h: 165, ledges: true, slope: 55, shape: 'island' },
      { x: -200, y: 40, w: 400, h: 220, ledges: false, shape: 'island' },
      { x: 200, y: 40, w: 220, h: 165, ledges: true, slope: -55, shape: 'island' },
    ],
    platforms: [
      { id: 'cloud-l', x: -600, y: 48, w: 155, cloud: true, vanishing: true },
      { id: 'cloud-r', x: 445, y: 48, w: 155, cloud: true, vanishing: true },
      { id: 'hill-mid', x: -145, y: 185, w: 290 },
      { id: 'cloud-top', x: -90, y: 305, w: 180, cloud: true, vanishing: true },
    ],
  },

  // 16. Green Greens — 3 Split Grass Islands + Deep Gaps + Grumpy Oak Wind
  {
    id: 'green-greens-suburb', name: 'Green Greens HOA', parodyOf: 'Green Greens', category: 'hazard',
    tagline: 'Three split HOA islands with deep ambush pits & a giant grumpy oak blasting wind.',
    theme: 'suburb',
    props: [{ mesh: 'Prop_Tree', x: 0, y: 45, z: -130, s: 135 }],
    palette: { skyTop: '#1d4ed8', skyMid: '#60a5fa', skyBottom: '#dcfce7', accent: '#facc15', deckTop: '#4ade80', deckBody: '#854d0e', deckTrim: '#bef264', platColor: '#fde047' },
    blastzones: { left: -1240, right: 1240, top: 920, bottom: -640 },
    cameraBounds: { left: -920, right: 920, top: 680, bottom: -380 },
    spawns: [{ x: -340, y: 80, facing: 1 }, { x: 340, y: 80, facing: -1 }, { x: -60, y: 90, facing: 1 }, { x: 60, y: 90, facing: -1 }],
    respawnPoint: { x: 0, y: 320 },
    solid: [
      { x: -555, y: 18, w: 320, h: 160, ledges: true, slope: -18, shape: 'island' },
      { x: -135, y: -12, w: 270, h: 140, ledges: true, shape: 'island' },
      { x: 235, y: 0, w: 320, h: 160, ledges: true, slope: 18, shape: 'island' },
    ],
    platforms: [
      { id: 'branch-l', x: -455, y: 160, w: 205 },
      { id: 'branch-r', x: 250, y: 160, w: 205 },
      { id: 'canopy', x: -125, y: 270, w: 250 },
    ],
    wind(f) { const c = f % 540; return (c > 360 && c < 490) ? (Math.floor(f / 540) % 2 === 0 ? 1 : -1) * 0.58 : 0; },
  },

  // 17. Corneria — Iconic Great Fox Starship Silhouette (Sloped Nose, Lower Wing, Bridge, Tall Tail Fin)
  {
    id: 'corn-area', name: 'Corn-Area Starship', parodyOf: 'Corneria', category: 'hazard',
    tagline: 'Sloped starship bow, raised cockpit bridge, towering tail fin & dual laser cannons!',
    theme: 'cosmos', hazard: 'starshipLaser',
    props: [{ mesh: 'Prop_StarshipPod', x: -390, y: -35, z: -165, s: 95 }, { mesh: 'Prop_StarshipPod', x: 290, y: 115, z: -230, s: 85 }, { mesh: 'Prop_Arwing', x: -180, y: 340, z: -420, s: 70 }],
    palette: { skyTop: '#0d1b3e', skyMid: '#1f4b8c', skyBottom: '#78b8f0', accent: '#38f5ff', deckTop: '#cbd5e1', deckBody: '#475569', deckTrim: '#38bdf8', platColor: '#94a3b8' },
    blastzones: { left: -1360, right: 1360, top: 960, bottom: -680 },
    cameraBounds: { left: -980, right: 980, top: 720, bottom: -400 },
    spawns: [{ x: -340, y: 90, facing: 1 }, { x: 240, y: 190, facing: -1 }, { x: -80, y: 90, facing: 1 }, { x: 110, y: 90, facing: -1 }],
    respawnPoint: { x: 0, y: 340 },
    solid: [
      // Sloped forward nose cone
      { x: -580, y: -42, w: 250, h: 110, ledges: true, slope: 42, shape: 'starship' },
      // Main starship hull deck
      { x: -330, y: 0, w: 495, h: 125, ledges: false, shape: 'starship' },
      // Raised stern laser-bridge superstructure (wall-jumpable front wall!)
      { x: 165, y: 112, w: 295, h: 235, ledges: true, shape: 'starship' },
    ],
    platforms: [
      { id: 'cannon-nose', x: -550, y: 105, w: 175, slope: 18 },
      { id: 'wing-mid', x: -160, y: 135, w: 195 },
      { id: 'tail-fin', x: 255, y: 295, w: 185, slope: 22 },
    ],
  },

  // 18. Venom — Massive Twin Starship Hulls + Deep Central Cockpit Well + Upper Wing Catwalks
  {
    id: 'venom-barge', name: 'Venom Cargo Barge', parodyOf: 'Venom', category: 'huge',
    tagline: 'Colossal twin starship wings converging around a deep central cockpit trench.',
    theme: 'cosmos', hazard: 'starshipLaser',
    props: [{ mesh: 'Prop_StarshipPod', x: -460, y: 145, z: -200, s: 105 }, { mesh: 'Prop_StarshipPod', x: 460, y: 145, z: -200, s: 105 }, { mesh: 'Prop_Arwing', x: 240, y: 380, z: -460, s: 80 }],
    palette: { skyTop: '#1f0a1d', skyMid: '#581c3a', skyBottom: '#c2410c', accent: '#fb923c', deckTop: '#94a3b8', deckBody: '#334155', deckTrim: '#f97316', platColor: '#cbd5e1' },
    blastzones: { left: -1480, right: 1480, top: 1020, bottom: -740 },
    cameraBounds: { left: -1080, right: 1080, top: 740, bottom: -440 },
    spawns: [{ x: -400, y: 160, facing: 1 }, { x: 400, y: 160, facing: -1 }, { x: -120, y: 10, facing: 1 }, { x: 120, y: 10, facing: -1 }],
    respawnPoint: { x: 0, y: 360 },
    solid: [
      { x: -640, y: 115, w: 360, h: 130, ledges: true, slope: -45, shape: 'starship' },
      { x: -280, y: -70, w: 560, h: 115, ledges: false, shape: 'starship' },
      { x: 280, y: 70, w: 360, h: 130, ledges: true, slope: 45, shape: 'starship' },
    ],
    platforms: [
      { id: 'wing-l', x: -535, y: 245, w: 230, slope: -20 },
      { id: 'wing-r', x: 305, y: 225, w: 230, slope: 20 },
      { id: 'cockpit-low', x: -150, y: 75, w: 300 },
      { id: 'cockpit-high', x: -115, y: 215, w: 230 },
    ],
  },

  // 19. Brinstar — Split Organic Cavern + BREAKABLE CENTER BRIDGE + Rising Neon Acid!
  {
    id: 'acid-vat-basement', name: 'Acid Vat Basement', parodyOf: 'Brinstar', category: 'hazard',
    tagline: 'Split organic cavern with a BREAKABLE center bridge over rising neon-soda acid!',
    theme: 'acid', hazard: 'risingAcid',
    props: [{ mesh: 'Prop_AcidPipe', x: -390, y: -90, z: -200, s: 80 }, { mesh: 'Prop_AcidPipe', x: 390, y: -90, z: -200, s: 80 }],
    palette: { skyTop: '#16081c', skyMid: '#3a1130', skyBottom: '#691c2b', accent: '#80ff44', deckTop: '#c46d5e', deckBody: '#4a212a', deckTrim: '#9eff42', platColor: '#e08b6e' },
    blastzones: { left: -1260, right: 1260, top: 940, bottom: -640 },
    cameraBounds: { left: -920, right: 920, top: 680, bottom: -380 },
    spawns: [{ x: -280, y: 110, facing: 1 }, { x: 280, y: 110, facing: -1 }, { x: -80, y: 230, facing: 1 }, { x: 80, y: 230, facing: -1 }],
    respawnPoint: { x: 0, y: 320 },
    solid: [
      { x: -495, y: 24, w: 385, h: 155, ledges: true, slope: -24, shape: 'cavern' },
      { id: 'acid-bridge', x: -110, y: 0, w: 220, h: 52, ledges: false, breakable: true, maxHp: 30, respawnFrames: 480, shape: 'cavern' },
      { x: 110, y: 0, w: 385, h: 155, ledges: true, slope: 24, shape: 'cavern' },
    ],
    platforms: [
      { id: 'crag-l', x: -420, y: 168, w: 190, slope: -16 },
      { id: 'crag-r', x: 230, y: 152, w: 190, slope: 16 },
      { id: 'top', x: -115, y: 305, w: 230 },
    ],
  },

  // 20. Brinstar Depths — Giant Sloped Magma Boulder + Orbiting Satellite Cliff Slabs!
  {
    id: 'acid-vat-depths', name: 'Acid Vat Depths', parodyOf: 'Brinstar Depths', category: 'moving',
    tagline: 'Sloped volcanic boulder island surrounded by orbiting satellite cliff ledges & rising magma.',
    theme: 'acid', hazard: 'risingAcid',
    props: [{ mesh: 'Prop_AcidPipe', x: -460, y: 60, z: -240, s: 95 }, { mesh: 'Prop_AcidPipe', x: 460, y: 60, z: -240, s: 95 },
      { mesh: 'Prop_Catwalk', x: -270, y: 20, z: -250, s: 96 }, { mesh: 'Prop_Catwalk', x: 270, y: 20, z: -250, s: 96 }],
    palette: { skyTop: '#1c050d', skyMid: '#4c0519', skyBottom: '#9f1239', accent: '#fb923c', deckTop: '#a8a29e', deckBody: '#44403c', deckTrim: '#f97316', platColor: '#fbbf24' },
    blastzones: { left: -1260, right: 1260, top: 940, bottom: -640 },
    cameraBounds: { left: -920, right: 920, top: 680, bottom: -380 },
    spawns: [{ x: -190, y: 110, facing: 1 }, { x: 190, y: 110, facing: -1 }, { x: -90, y: 250, facing: 1 }, { x: 90, y: 250, facing: -1 }],
    respawnPoint: { x: 0, y: 320 },
    solid: [
      { x: -330, y: -20, w: 330, h: 235, ledges: true, slope: 52, shape: 'cavern' },
      { x: 0, y: 32, w: 330, h: 235, ledges: true, slope: -52, shape: 'cavern' },
    ],
    platforms: [
      { id: 'orb-1', x: -480, y: 130, w: 180, update(f) { const a = f * 0.015; return { x: detCos(a) * 430 - 90, y: 145 + detSin(a) * 155 }; } },
      { id: 'orb-2', x: 300, y: 130, w: 180, update(f) { const a = f * 0.015 + Math.PI; return { x: detCos(a) * 430 - 90, y: 145 + detSin(a) * 155 }; } },
      { id: 'orb-3', x: -90, y: 280, w: 170, update(f) { const a = f * 0.015 + Math.PI * 0.5; return { x: detCos(a) * 430 - 85, y: 145 + detSin(a) * 155 }; } },
    ],
  },

  // 21. Onett — WALK-OFF Suburban Street + 2-Story Drugstore & Burger Shop + Pizza Van!
  {
    id: 'onett-strip-mall', name: 'Onett Strip Mall', parodyOf: 'Onett', category: 'hazard',
    tagline: 'Walk-off street flanked by a 2-story Drugstore, Burger Shop terrace & reckless Pizza Van!',
    theme: 'suburb', hazard: 'pizzaVan',
    props: [{ mesh: 'Prop_Skyscraper', x: -500, y: 80, z: -220, s: 85 }, { mesh: 'Prop_Tree', x: 500, y: 50, z: -200, s: 95 }],
    palette: { skyTop: '#2563eb', skyMid: '#60a5fa', skyBottom: '#fde68a', accent: '#fb923c', deckTop: '#64748b', deckBody: '#334155', deckTrim: '#facc15', platColor: '#f97316' },
    blastzones: { left: -1240, right: 1240, top: 920, bottom: -560 },
    cameraBounds: { left: -940, right: 940, top: 680, bottom: -260 },
    spawns: [{ x: -340, y: 80, facing: 1 }, { x: 340, y: 80, facing: -1 }, { x: -450, y: 190, facing: 1 }, { x: 450, y: 190, facing: -1 }],
    respawnPoint: { x: 0, y: 320 },
    solid: [
      // Continuous walk-off suburban street!
      { x: -1240, y: 0, w: 2480, h: 120, ledges: false, walkOff: true, shape: 'street' },
    ],
    platforms: [
      // Left 2-story Drugstore awnings & sloped roof
      { id: 'drug-awning', x: -640, y: 132, w: 280 },
      { id: 'drug-roof', x: -610, y: 268, w: 255, slope: -20 },
      // Center street sign perch
      { id: 'sign-mid', x: -110, y: 185, w: 220 },
      // Right 2-story Burger Shop terrace & marquee
      { id: 'burger-low', x: 250, y: 132, w: 300 },
      { id: 'burger-top', x: 320, y: 268, w: 245, slope: 20 },
    ],
  },

  // 22. Fourside — 4 STAGGERED SKYSCRAPERS + DEEP WALL-JUMP ALLEY CHASM + SLIPPERY UFO!
  {
    id: 'fiveside-skyscrapers', name: 'Fiveside Skyscrapers', parodyOf: 'Fourside', category: 'moving',
    tagline: 'Four staggered midnight skyscrapers, a wall-jump alley chasm, crane & hovering UFO!',
    theme: 'fountain',
    props: [{ mesh: 'Prop_Skyscraper', x: -560, y: 120, z: -260, s: 105 }, { mesh: 'Prop_Skyscraper', x: 560, y: 160, z: -260, s: 115 }, { mesh: 'Prop_Skyscraper', x: 0, y: 40, z: -520, s: 140 }],
    palette: { skyTop: '#050817', skyMid: '#121d42', skyBottom: '#2d2859', accent: '#ff52b8', deckTop: '#94a3b8', deckBody: '#1e293b', deckTrim: '#facc15', platColor: '#ff70a6' },
    blastzones: { left: -1380, right: 1380, top: 1020, bottom: -700 },
    cameraBounds: { left: -1000, right: 1000, top: 760, bottom: -420 },
    spawns: [{ x: -490, y: 80, facing: 1 }, { x: 470, y: 245, facing: -1 }, { x: -200, y: 215, facing: 1 }, { x: 180, y: 125, facing: -1 }],
    respawnPoint: { x: -220, y: 390 },
    solid: [
      // Short left condo
      { x: -640, y: -10, w: 270, h: 380, ledges: true, shape: 'skyscraper' },
      // Tall center-left tower (forms wall-jump alley with center-right!)
      { x: -340, y: 135, w: 240, h: 520, ledges: true, shape: 'skyscraper' },
      // Mid center-right tower (gap from -100 to +70 is a real Melee wall-jump pit!)
      { x: 70, y: 45, w: 240, h: 430, ledges: true, shape: 'skyscraper' },
      // Towering right penthouse
      { x: 355, y: 175, w: 280, h: 560, ledges: true, shape: 'skyscraper' },
    ],
    platforms: [
      { id: 'ufo', x: -105, y: 225, w: 195, cloud: true, update(f) { return { x: -105 + detSin(f * 0.019) * 85, y: 235 + detCos(f * 0.031) * 42 }; } },
      { id: 'crane', x: -570, y: 195, w: 205 },
      { id: 'helipad', x: 105, y: 295, w: 185 },
    ],
  },

  // 23. Mute City — Floating Speedway Over SCORCHING HOT TRACK + Surging Hover-Cars!
  {
    id: 'loud-suburb-highway', name: 'Loud Suburb Highway', parodyOf: 'Mute City', category: 'moving',
    tagline: 'Floating raceway over a scorching hot neon highway — touch the track and you get blasted sky-high!',
    theme: 'stadium',
    props: [{ mesh: 'Prop_NeonArch', x: 0, y: 130, z: -250, s: 115 }, { mesh: 'Prop_Skyscraper', x: -640, y: 20, z: -480, s: 120 }],
    palette: { skyTop: '#07081a', skyMid: '#18144a', skyBottom: '#591b6b', accent: '#ffdd33', deckTop: '#334155', deckBody: '#0f172a', deckTrim: '#ffdd33', platColor: '#38f5ff' },
    blastzones: { left: -1300, right: 1300, top: 940, bottom: -620 },
    cameraBounds: { left: -940, right: 940, top: 680, bottom: -320 },
    spawns: [{ x: -220, y: 100, facing: 1 }, { x: 220, y: 100, facing: -1 }, { x: -90, y: 240, facing: 1 }, { x: 90, y: 240, facing: -1 }],
    respawnPoint: { x: 0, y: 320 },
    hotFloorY: -105,
    solid: [
      { x: -395, y: 18, w: 790, h: 95, ledges: true, shape: 'vehicle' },
    ],
    platforms: [
      { id: 'car-l', x: -490, y: 120, w: 195, shape: 'vehicle', update(f) { return { x: -450 + detSin(f * 0.028) * 140, y: 120 }; } },
      { id: 'car-r', x: 295, y: 165, w: 195, shape: 'vehicle', update(f) { return { x: 255 - detSin(f * 0.028) * 140, y: 165 }; } },
      { id: 'gantry', x: -120, y: 295, w: 240 },
    ],
  },

  // 24. Big Blue — TRUE 4-HOVER-VAN RACING CONVOY (NO STATIC FLOOR!) OVER HOT ASPHALT!
  {
    id: 'big-blue-commute', name: 'Big Blue Commute', parodyOf: 'Big Blue', category: 'moving',
    tagline: 'Zero static ground! Leap across 4 surging rush-hour hover-vans over scorching highway asphalt!',
    theme: 'stadium',
    props: [{ mesh: 'Prop_NeonArch', x: -380, y: 110, z: -260, s: 105 }, { mesh: 'Prop_NeonArch', x: 380, y: 110, z: -260, s: 105 }, { mesh: 'Prop_Skyscraper', x: 0, y: -20, z: -560, s: 130 }],
    palette: { skyTop: '#020617', skyMid: '#0c4a6e', skyBottom: '#0284c7', accent: '#38f5ff', deckTop: '#0ea5e9', deckBody: '#1e3a8a', deckTrim: '#fde047', platColor: '#ff4b72' },
    blastzones: { left: -1280, right: 1280, top: 900, bottom: -560 },
    cameraBounds: { left: -940, right: 940, top: 660, bottom: -280 },
    spawns: [{ x: -240, y: 145, facing: 1 }, { x: 240, y: 220, facing: -1 }, { x: -40, y: 300, facing: 1 }, { x: 40, y: 120, facing: -1 }],
    respawnPoint: { x: 0, y: 340 },
    hotFloorY: -100,
    solid: [
      { id: 'bus-lead', x: -160, y: 18, w: 340, h: 74, ledges: true, shape: 'vehicle', update(f) { return { x: -170 + detSin(f * 0.017) * 155, y: 18 + detSin(f * 0.04) * 10 }; } },
      { id: 'van-left', x: -530, y: 95, w: 245, h: 64, ledges: true, shape: 'vehicle', update(f) { return { x: -500 + detCos(f * 0.024) * 120, y: 95 + detSin(f * 0.033) * 24 }; } },
      { id: 'van-right', x: 280, y: 135, w: 255, h: 64, ledges: true, shape: 'vehicle', update(f) { return { x: 260 - detCos(f * 0.022) * 135, y: 135 + detCos(f * 0.03) * 26 }; } },
    ],
    platforms: [
      { id: 'hover-top', x: -115, y: 265, w: 230, shape: 'vehicle', update(f) { return { x: -115 + detSin(f * 0.029 + 1.2) * 210, y: 265 }; } },
      { id: 'hover-low', x: -290, y: 185, w: 190, shape: 'vehicle', update(f) { return { x: -240 + detSin(f * 0.035) * 185, y: 185 }; } },
    ],
  },

  // 25. Poké Floats — TRUE 5-BALLOON SKY PARADE (ZERO STATIC GROUND!)
  {
    id: 'critter-floats', name: 'Critter Parade Floats', parodyOf: 'Poké Floats', category: 'moving',
    tagline: 'No floor at all! Bounce across 5 giant drifting Thanksgiving balloons soaring above the clouds!',
    theme: 'craft',
    props: [{ mesh: 'Prop_Balloon', x: -460, y: 140, z: -260, s: 105 }, { mesh: 'Prop_Balloon', x: 460, y: 200, z: -260, s: 105 }],
    palette: { skyTop: '#312e81', skyMid: '#6366f1', skyBottom: '#f472b6', accent: '#fde047', deckTop: '#f472b6', deckBody: '#9d174d', deckTrim: '#fde047', platColor: '#67e8f9' },
    blastzones: { left: -1340, right: 1340, top: 980, bottom: -640 },
    cameraBounds: { left: -960, right: 960, top: 720, bottom: -380 },
    spawns: [{ x: -160, y: 120, facing: 1 }, { x: 160, y: 120, facing: -1 }, { x: -380, y: 270, facing: 1 }, { x: 380, y: 270, facing: -1 }],
    respawnPoint: { x: 0, y: 360 },
    solid: [
      { id: 'blimp-main', x: -230, y: 10, w: 460, h: 115, ledges: true, shape: 'balloon', update(f) { return { x: -230 + detSin(f * 0.013) * 130, y: 10 + detSin(f * 0.025) * 42 }; } },
      { id: 'blimp-l', x: -560, y: 135, w: 230, h: 90, ledges: true, shape: 'balloon', update(f) { return { x: -540 + detCos(f * 0.018) * 115, y: 135 + detSin(f * 0.028) * 68 }; } },
      { id: 'blimp-r', x: 330, y: 155, w: 230, h: 90, ledges: true, shape: 'balloon', update(f) { return { x: 310 - detCos(f * 0.019) * 115, y: 155 + detCos(f * 0.026) * 68 }; } },
    ],
    platforms: [
      { id: 'float-top', x: -130, y: 315, w: 260, cloud: true, shape: 'balloon', update(f) { return { x: -130 + detSin(f * 0.016 + 0.8) * 195, y: 315 + detCos(f * 0.022) * 38 }; } },
      { id: 'float-low', x: -115, y: -260, w: 230, cloud: true, shape: 'balloon', update(f) { return { x: -115 + detCos(f * 0.02) * 240, y: -260 + detSin(f * 0.03) * 24 }; } },
    ],
  },

  // 26. Icicle Mountain — TALL 5-TIER VERTICAL ALPINE MOUNTAIN WITH SLANTED ICE CLIFFS!
  {
    id: 'slush-summit', name: 'Slush Summit', parodyOf: 'Icicle Mountain', category: 'hazard',
    tagline: 'Tall multi-tiered alpine glacier with slanted ice ledges, cliff walls & slippery low traction!',
    theme: 'fountain', iceTraction: 0.42,
    props: [{ mesh: 'Prop_IceSpire', x: -410, y: 140, z: -230, s: 100 }, { mesh: 'Prop_IceSpire', x: 410, y: 140, z: -230, s: 100 }],
    palette: { skyTop: '#0b2545', skyMid: '#3a7ca5', skyBottom: '#d9ecf2', accent: '#67e8f9', deckTop: '#e0f7ff', deckBody: '#477998', deckTrim: '#38bdf8', platColor: '#bae6fd' },
    blastzones: { left: -1260, right: 1260, top: 1080, bottom: -680 },
    cameraBounds: { left: -920, right: 920, top: 820, bottom: -380 },
    spawns: [{ x: -380, y: 120, facing: 1 }, { x: 380, y: 145, facing: -1 }, { x: -220, y: 330, facing: 1 }, { x: 210, y: 390, facing: -1 }],
    respawnPoint: { x: 0, y: 480 },
    solid: [
      { x: -460, y: 0, w: 500, h: 165, ledges: true, slope: 35, shape: 'mountain' },
      { x: 40, y: 55, w: 420, h: 220, ledges: true, slope: -25, shape: 'mountain' },
      { x: -340, y: 245, w: 260, h: 90, ledges: true, slope: 28, shape: 'mountain' },
      { x: 90, y: 330, w: 270, h: 90, ledges: true, slope: -28, shape: 'mountain' },
    ],
    platforms: [
      { id: 'ice-1', x: -450, y: 145, w: 185, slope: 18 },
      { id: 'ice-2', x: 190, y: 185, w: 195, slope: -18 },
      { id: 'ice-3', x: -120, y: 425, w: 240 },
    ],
  },

  // 27. Flat-Screen Calculator — Multi-Tier Retro LCD Cabinet with Asymmetric Scaffolding
  {
    id: 'flat-screen-calc', name: 'Flat-Screen Calculator', parodyOf: 'Flat Zone', category: 'tourney',
    tagline: 'Retro monochrome LCD cabinet with asymmetric handheld scaffolding & crisp sightlines.',
    theme: 'lcd', props: [],
    palette: { skyTop: '#7f8c72', skyMid: '#98a688', skyBottom: '#aebc9d', accent: '#1e241b', deckTop: '#262e22', deckBody: '#181e15', deckTrim: '#404d3a', platColor: '#2c3528' },
    blastzones: { left: -1080, right: 1080, top: 840, bottom: -560 },
    cameraBounds: { left: -820, right: 820, top: 640, bottom: -340 },
    spawns: [{ x: -240, y: 80, facing: 1 }, { x: 240, y: 80, facing: -1 }, { x: -100, y: 240, facing: 1 }, { x: 100, y: 240, facing: -1 }],
    respawnPoint: { x: 0, y: 310 },
    solid: [
      { x: -465, y: 0, w: 930, h: 115, ledges: true, shape: 'lcd' },
    ],
    platforms: [
      { id: 'lcd-1', x: -425, y: 115, w: 235 },
      { id: 'lcd-2', x: 140, y: 145, w: 285 },
      { id: 'lcd-3', x: -250, y: 235, w: 240 },
      { id: 'lcd-4', x: 65, y: 275, w: 225 },
      { id: 'lcd-5', x: -380, y: 345, w: 185 },
    ],
  },

  // 28. Kongo Jungle 64 (Past) — Floating Log Deck + Slanted Perches + Bottom BARREL CANNON!
  {
    id: 'retro-jungle-64', name: 'Retro Condo 64', parodyOf: 'Kongo Jungle 64', category: 'past',
    tagline: 'Nostalgic 1999 floating jungle deck with slanted treetop perches & bottom Barrel Cannon!',
    theme: 'craft',
    props: [{ mesh: 'Prop_Tree', x: -450, y: 30, z: -220, s: 105 }, { mesh: 'Prop_Tree', x: 450, y: 30, z: -220, s: 105 }],
    palette: { skyTop: '#166534', skyMid: '#22c55e', skyBottom: '#fef08a', accent: '#f97316', deckTop: '#b45309', deckBody: '#78350f', deckTrim: '#facc15', platColor: '#fde68a' },
    blastzones: { left: -1340, right: 1340, top: 960, bottom: -680 },
    cameraBounds: { left: -960, right: 960, top: 700, bottom: -400 },
    spawns: [{ x: -220, y: 80, facing: 1 }, { x: 220, y: 80, facing: -1 }, { x: -90, y: 240, facing: 1 }, { x: 90, y: 240, facing: -1 }],
    respawnPoint: { x: 0, y: 320 },
    barrelCannon: { y: -170, minX: -320, maxX: 320, speed: 0.022, radius: 48, launchVy: 30 },
    solid: [{ x: -415, y: 0, w: 830, h: 155, ledges: true, shape: 'treehouse' }],
    platforms: [
      { id: 'p64-l', x: -480, y: 155, w: 225, slope: 28 },
      { id: 'p64-r', x: 255, y: 183, w: 225, slope: -28 },
      { id: 'p64-top', x: -120, y: 310, w: 240 },
    ],
  },

  // 29. Yoshi's Island 64 (Past) — Stepped 1999 Sky Plateau + Disappearing Side Clouds!
  {
    id: 'retro-tax-island-64', name: 'Retro Tax Island 64', parodyOf: "Yoshi's Island 64", category: 'past',
    tagline: 'Bright 1999 stepped plateau with disappearing checkered clouds & high center bridge!',
    theme: 'craft',
    props: [{ mesh: 'Prop_Tree', x: 0, y: 50, z: -250, s: 115 }],
    palette: { skyTop: '#0ea5e9', skyMid: '#7dd3fc', skyBottom: '#ffffff', accent: '#ef4444', deckTop: '#22c55e', deckBody: '#b45309', deckTrim: '#ef4444', platColor: '#ffffff' },
    blastzones: { left: -1260, right: 1260, top: 920, bottom: -660 },
    cameraBounds: { left: -920, right: 920, top: 680, bottom: -380 },
    spawns: [{ x: -240, y: 80, facing: 1 }, { x: 240, y: 80, facing: -1 }, { x: -100, y: 240, facing: 1 }, { x: 100, y: 240, facing: -1 }],
    respawnPoint: { x: 0, y: 310 },
    solid: [
      { x: -445, y: 0, w: 245, h: 155, ledges: true, slope: 32, shape: 'island' },
      { x: -200, y: 32, w: 400, h: 185, ledges: false, shape: 'island' },
      { x: 200, y: 32, w: 245, h: 155, ledges: true, slope: -32, shape: 'island' },
    ],
    platforms: [
      { id: 'y64-l', x: -610, y: 60, w: 155, cloud: true, vanishing: true },
      { id: 'y64-r', x: 455, y: 60, w: 155, cloud: true, vanishing: true },
      { id: 'y64-mid', x: -175, y: 175, w: 350 },
      { id: 'y64-top', x: -100, y: 300, w: 200 },
    ],
  },
];

export const HOMERUN_STAGE = {
  id: 'sandbag-yard', name: 'Sagging Bag Yard', parodyOf: 'Home-Run Contest', category: 'special',
  tagline: '10 seconds to rack up percent, grab the Home-Run Plunger, and launch Sagging Bag!',
  theme: 'stadium',
  props: [{ mesh: 'Prop_Floodlight', x: -320, y: 80, z: -220, s: 100 }],
  palette: { skyTop: '#1b3c73', skyMid: '#3d79c4', skyBottom: '#f2b880', accent: '#ffdb4d', deckTop: '#6dd169', deckBody: '#4d5d73', deckTrim: '#fff08a', platColor: '#ffffff' },
  blastzones: { left: -1200, right: 45000, top: 6500, bottom: -500 },
  cameraBounds: { left: -900, right: 43000, top: 4500, bottom: -300 },
  spawns: [{ x: -120, y: 60, facing: 1 }, { x: 110, y: 60, facing: -1 }],
  respawnPoint: { x: 0, y: 180 },
  solid: [{ x: -450, y: 0, w: 40000, h: 140, ledges: false, shape: 'stadium' }],
  platforms: [],
  barrierX: 280,
};

export const TARGET_STAGE = {
  id: 'target-lab', name: 'Break the Targets Lab', parodyOf: 'Target Test', category: 'special',
  tagline: 'Smash all 10 floating Bizarro targets as fast as humanly possible!',
  theme: 'cosmos',
  props: [{ mesh: 'Prop_CosmicCrystal', x: -480, y: 180, z: -260, s: 80 }, { mesh: 'Prop_CosmicCrystal', x: 480, y: 180, z: -260, s: 80 }],
  palette: { skyTop: '#0b1026', skyMid: '#18244f', skyBottom: '#2d3f75', accent: '#ff4b72', deckTop: '#94a3b8', deckBody: '#1e293b', deckTrim: '#ff4b72', platColor: '#38f5ff' },
  blastzones: { left: -1250, right: 1250, top: 960, bottom: -680 },
  cameraBounds: { left: -920, right: 920, top: 700, bottom: -400 },
  spawns: [{ x: 0, y: 60, facing: 1 }],
  respawnPoint: { x: 0, y: 240 },
  solid: [{ x: -460, y: 0, w: 920, h: 130, ledges: true, shape: 'starship' }],
  platforms: [{ id: 't1', x: -380, y: 165, w: 200 }, { id: 't2', x: 180, y: 165, w: 200 }, { id: 't3', x: -110, y: 315, w: 220 }],
  targets: [
    { id: 'tg1', x: -280, y: 65, r: 28 }, { id: 'tg2', x: 280, y: 65, r: 28 },
    { id: 'tg3', x: -320, y: 240, r: 28 }, { id: 'tg4', x: 320, y: 240, r: 28 },
    { id: 'tg5', x: 0, y: 390, r: 28 }, { id: 'tg6', x: -540, y: 120, r: 30 },
    { id: 'tg7', x: 540, y: 120, r: 30 }, { id: 'tg8', x: -200, y: 455, r: 28, moveX: 70, speed: 0.04 },
    { id: 'tg9', x: 200, y: 455, r: 28, moveX: -70, speed: 0.04 }, { id: 'tg10', x: 610, y: -48, r: 30, moveX: 50, speed: 0.03 },
  ],
};

export function getStageById(id) {
  if (id === HOMERUN_STAGE.id) return HOMERUN_STAGE;
  if (id === TARGET_STAGE.id) return TARGET_STAGE;
  return STAGES.find((s) => s.id === id) || STAGES[0];
}

export function getSurfaceY(surface, x) {
  if (!surface) return 0;
  const slope = surface.slope || 0;
  if (!slope || !surface.w) return surface.y;
  const t = Math.max(0, Math.min(1, (x - surface.x) / surface.w));
  return surface.y + t * slope;
}

const FORM_PERIOD = 1200;
const FORM_HALF_TRANSITION = 15;

export function getStageForm(stage, frame = 0) {
  if (!stage?.transformations?.length) return null;
  const idx = Math.floor(Math.max(0, frame) / FORM_PERIOD) % stage.transformations.length;
  const tick = Math.max(0, frame) % FORM_PERIOD;
  const changeIn = FORM_PERIOD - tick;
  const next = stage.transformations[(idx + 1) % stage.transformations.length];
  // The decks meet at one continuous flat surface before exchanging topology.
  const blend = Math.min(1, changeIn / FORM_HALF_TRANSITION, frame < FORM_PERIOD ? 1 : tick / FORM_HALF_TRANSITION);
  return { index: idx, ...stage.transformations[idx], blend, changeIn, nextForm: next.name };
}

export function resolveStageSolids(stage, frame = 0) {
  const form = getStageForm(stage, frame);
  return (form?.solid ?? stage?.solid ?? []).map((s, idx) => {
    const id = s.id || (idx === 0 ? 'main' : `solid-${idx}`);
    const deck = { ...s, ...s.update?.(frame), id };
    if (!form || form.blend === 1) return deck;
    return { ...deck, y: deck.y * form.blend, slope: (deck.slope || 0) * form.blend,
      h: 145 + (deck.h - 145) * form.blend };
  });
}

export function resolveStagePlatforms(stage, frame = 0) {
  const form = getStageForm(stage, frame);
  return (form?.platforms ?? stage?.platforms ?? []).map((p) => {
    const platform = p.update ? { ...p, ...p.update(frame) } : p;
    if (!form || form.blend === 1) return platform;
    return { ...platform, y: platform.y * form.blend, slope: (platform.slope || 0) * form.blend };
  });
}
