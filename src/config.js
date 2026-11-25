// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'be-a-dragon-ball' // slug registered on bloxity.io
export const GAME_TITLE = 'Bowling Roll'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
// The safe zone (src/safezone/, map in SAFE_ZONE.md): a green studded hub walled on three
// sides, the desert lane to the north (-Z). Spawn in the middle facing the shop row.
export const SPAWN = { x: 0, y: 0.05, z: 2 }
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)

export const SAFE_ZONE = {
  hub: { minX: -60, maxX: 60, minZ: -40, maxZ: 50 }, // the green safe area (inner faces of the walls)
  desertEnd: -118, // z of the far wall of the sand
  wall: { height: 16, thick: 4 },
  tile: 8, // m per stud texture tile (UV unit of every studded surface)
  colors: {
    grass: '#3fd13a',
    sand: '#f3d36d',
    wall: '#d8a35e',
    carpet: '#e3141b',
    base: '#cfc8f2',
    baseTrim: '#1fe6ff',
    pillar: '#ff8cc6', // bubblegum pink (sky light + tone mapping wash paler pinks out to lilac)
    cap: '#ffffff',
    board: '#3d7ff2',
    boardDark: '#2453c7',
    emptyPlot: '#a8d8ff',
  },
  laneExit: { x: 0, width: 7, textZ: -23 }, // SAFE ZONE text runs along the hub edge here
  // Shop row on the green, just inside the sand edge. pad = ring pad colour, r = pad radius.
  shops: [
    { id: 'sell', title: 'Sell', x: -50, z: -31, pad: '#ff5fb1', r: 3.2, note: 'Sell your fighters here' },
    { id: 'spin', title: 'Dragon Spin', x: -37, z: -31, pad: '#7dff5a', r: 4.6, note: 'Free spin every 15 minutes' },
    { id: 'balls', title: 'Dragon Ball Shop', x: -23, z: -31, pad: '#ff9a2a', r: 3.4, note: 'Buy Dragon Balls for more luck' },
    { id: 'treadmill', title: 'Treadmill Shop', x: 17, z: -31, pad: '#33f1ff', r: 4.2, note: 'Faster treadmills, more Speed' },
    { id: 'cash', title: 'Cash Shop', x: 29, z: -31, pad: '#b44dff', r: 5, note: 'Everything here costs $ only' },
    { id: 'skins', title: 'Base Skins', x: 40.5, z: -31, pad: '#d8ff4a', r: 3.6, note: 'Equip base skins here' },
    { id: 'fuse', title: 'Fuse Machine', x: 50, z: -30, pad: '#8f6bff', r: 3, padAt: 6.2, note: 'Fuse 4 fighters into a stronger one' }, // padAt: m in front of the machine
  ],
  // Boards on the side walls (side: 1 = east wall facing west, -1 = west wall facing east).
  boards: [
    { id: 'money', side: 1, z: -20, title: 'Top Money', header: 'Most Money', titleColor: '#b7ff3d', unit: '$', suffix: '' },
    { id: 'speed', side: 1, z: -2, title: 'Top Speed', header: 'Most Speed', titleColor: '#39d7ff', unit: '', suffix: ' Speed' },
    { id: 'rebirth', side: -1, z: -24, title: 'Top Rebirth', header: 'Most Rebirth', titleColor: '#ffe14a', unit: '', suffix: ' Rebirths' },
    { id: 'playtime', side: -1, z: -2, title: 'Top Playtime', header: 'Most Time Played', titleColor: '#ffffff', unit: '', suffix: '' },
  ],
  updateScreen: { side: 1, z: -11, nextUpdateHours: 70 }, // between Top Money and Top Speed
  statue: { side: -1, z: -13 }, // Claim Free Reward statue on the west wall
  orbPack: { x: 54, z: 5, price: '$25M' },
  suggestions: { x: 56, z: 11.5 },
  eventBuilding: { x: -40, z: -66, minutes: 4 },
  // Player bases along the south side, entrances facing north.
  bases: {
    frontZ: 16,
    width: 18,
    depth: 26,
    floorHeight: 7, // m between floors
    slotsPerSide: 5,
    fill: 0, // other players' fighters are the real ones relayed by the server (safezone/remotebases.js)
    // One plot per player of a room (backend ROOM_MAX_CLIENTS = 5): the server assigns each player one by
    // index. Every plot is the same one-floor base; its owner card / fighters come from the roster.
    plots: [
      { x: -38, level: 1 },
      { x: -19, level: 1 },
      { x: 0, level: 1 },
      { x: 19, level: 1 },
      { x: 38, level: 1 },
    ],
  },
}
// Fighter rarities: label colour, income range (per second) and whether they get an aura.
// The array order fixes the roster's names (roster.js seeds by it), so it stays as it is; the
// value order is the lane's zone order (RARITY_ORDER below): each zone's fighters earn ~5x the
// zone before. Balanced with the progression sim (BALANCE.md).
export const RARITIES = [
  { name: 'Common', color: '#d7dde6', income: [500, 2000] },
  { name: 'Uncommon', color: '#5bff6a', income: [2500, 1e4] },
  { name: 'Rare', color: '#3fa2ff', income: [12500, 5e4] },
  { name: 'Epic', color: '#c35bff', income: [62500, 2.5e5] },
  { name: 'Legendary', color: '#ffd23a', income: [3e5, 1.25e6], aura: true },
  { name: 'Mythical', color: '#ff4a4a', income: [1.5e6, 6e6], aura: true },
  { name: 'Secret', color: '#ffffff', income: [8e6, 3e7], aura: true, outline: '#000000' },
  { name: 'Heavenly', color: '#ff7ad9', income: [1e9, 4e9], aura: true },
  { name: 'Eternal', color: '#ff8a1f', income: [4e7, 1.5e8], aura: true },
  { name: 'Celestial', color: '#7af0ff', income: [5e9, 2e10], aura: true },
]
RARITIES.push({ name: 'Divine', color: '#fff27a', income: [2e8, 8e8], aura: true }, { name: 'Primal', color: '#9cff4a', income: [2.5e10, 1e11], aura: true })

// --- The lane (lane/, layout in LANE.md) ------------------------------------------------
// Stepping off the green onto the sand turns the player into a winged orb. The
// lane runs north (-Z) through 12 zones; each has a guardian asleep in its base.
// The guardian wakes when the orb comes near: an orb whose Speed stat is at
// least the zone's recommended speed outruns it, a slower one is caught,
// carried into the base and hatched into a fighter of the zone's rarity, which
// then has to run back to the safe zone before the angry guardian catches it.
export const LANE = {
  startSpeed: 10, // Speed stat a new player starts with (treadmills raise it later)
  // Speed stat -> m/s: base + perDecade * log10(1 + stat / 1000), capped.
  speedCurve: { base: 8, perDecade: 6, max: 46 },
  corridor: { width: 64, length: 90, wallHeight: 14 }, // zones after the desert
  cullDistance: 380, // m: zone set pieces further than this are hidden
  ball: { radius: 0.85, accel: 15, decel: 4.5, airAccel: 6, turnSpeed: 9, jumpSpeed: 7 },
  character: { speed: 14, accel: 70, scale: 0.85 }, // the hatched fighter runs at sprint speed
  guardian: {
    height: 4.8, // m at scale 1
    wakeRange: 46, // m from its seat at which an orb in its zone wakes it
    wakeTime: 1.0, // s to stand up and roar
    reach: 2.7, // m from the guardian's centre that counts as a catch
    slowChase: 1.6, // x the orb's top speed when the orb is too slow (it gets caught)
    fastChase: 0.82, // x the orb's top speed when the orb is fast enough (it escapes)
    huntSpeed: 11, // m/s chasing a hatched fighter (the fighter runs at 14)
    angryTime: 0.9, // s of stamping rage after it wakes, before the hunt starts
    wakeDelay: 3, // s it sleeps on after the fighter hatched (the head start)
    rouseTime: 2.2, // s to stir, notice ("!"), stand up and roar
    walkSpeed: 6.5, // m/s carrying / going home
    leash: 16, // m past its zone's ends it keeps chasing
  },
  luckMax: 0.5, // luck multiplier grows from x1.0 at a zone's start to x1.5 at its end
  wrongWayTime: 5, // s of running away from the safe zone while hunted before the tongue gets you
  hatchTime: 1.9, // s from the orb touching the slot to the fighter appearing
  mutationChance: 0.12,
  hotbarSlots: 10, // keys 1-9 then 0 (the rest go to the Backpack)
}

// Your base's slots (base/mybase.js): hold E to place the fighter in your hands on an
// empty slot; it earns income/s into the slot's green pad, stepping on the pad collects it.
export const BASE = {
  slots: 10, // ground floor of a level 1 base: 5 per side
  placeHold: 5, // s to hold E (or the prompt) to place a fighter
  pickupHold: 1, // s to hold E to pick a placed fighter up (or swap it with the held one)
  promptRange: 2.6, // m from a slot / upgrade sign at which its prompt shows
  upgradeCost: 15, // upgrade price = income/s * upgradeCost * upgradeGrowth^(level-1)
  upgradeGrowth: 1.8,
  levelIncome: 0.5, // + this share of base income per level above 1
  cashMulti: 1, // the base's cash multiplier (rebirths raise it later)
  offlineMaxHours: 12, // offline earnings pile up on the pads for at most this long (backend OFFLINE_MAX_SECONDS)
}

// Your base's entrance boards (base/board.js): the control board's four buttons and the Base
// Upgrade sign are clicked with the free mouse cursor (Esc releases it) or tapped on touch.
// Everything is bought with $ (never premium currency).
export const BASE_BOARD = {
  reach: 34, // m from the player to a board at which its buttons react
  autoCollect: { price: 2e7, interval: 1 }, // one-time unlock, then an ON/OFF toggle; s between sweeps
  upgradeMax: { price: 1e9 }, // one-time unlock of Upgrade Max All
  maxUpgrades: 2000, // safety cap on upgrades bought by one Upgrade Max All click
  // Base Upgrade: 5 steps, each adds multiStep to the base's Cash Multi (x1 -> x3.5). Spread over
  // the run: ~9 min, ~25 min, ~45 min, ~1.3 h, ~2.3 h of normal play (BALANCE.md).
  upgrade: { prices: [2.5e7, 3e10, 6e12, 3.7e14, 3.4e15], multiStep: 0.5 },
}

// Bar: [a, b] colours of the zone's segment on the top progress bar (or 'rainbow').
// floor / wall / trim: the corridor; house: wall, pillar colours; guardian: name + look.
export const ZONES = [
  { name: 'Common', rarity: 'Common', rec: 2700, bar: ['#c8c8c8', '#eeeeee'], floor: '#f3d36d', wall: '#d8a35e', trim: '#c98f4c', props: 'desert', house: ['#ff9a1f', '#ffc83a'], guardian: { name: 'Mummy Warrior', wrap: '#eef4ff', wrap2: '#b9cbe8', eye: '#ff3030', angry: '#ff2a1a' } },
  { name: 'Uncommon', rarity: 'Uncommon', rec: 8000, bar: ['#2fd25a', '#6cf08a'], floor: '#5fcf4a', wall: '#2f8a3a', trim: '#246b2c', props: 'jungle', house: ['#2bb04a', '#a6ff5a'], guardian: { name: 'Jungle Brute', wrap: '#8ed36a', wrap2: '#4f8f3a', eye: '#fff04a', angry: '#ff3a1a', horns: false } },
  { name: 'Rare', rarity: 'Rare', rec: 25000, bar: ['#1f86ff', '#5fb8ff'], floor: '#cfefff', wall: '#5fb8ff', trim: '#2f7fd8', props: 'ice', house: ['#3f9bff', '#c8f4ff'], guardian: { name: 'Frost Giant', wrap: '#d8f6ff', wrap2: '#7fc8f0', eye: '#2af0ff', angry: '#ff2a3a' } },
  { name: 'Epic', rarity: 'Epic', rec: 80000, bar: ['#7b3fe0', '#a774ff'], floor: '#b79cff', wall: '#5a2fb0', trim: '#3f1f86', props: 'crystal', house: ['#7b3fe0', '#d6a6ff'], guardian: { name: 'Void Golem', wrap: '#8a63d6', wrap2: '#4a2c8a', eye: '#ff5af0', angry: '#ff2a6a', horns: true } },
  { name: 'Legendary', rarity: 'Legendary', rec: 250000, bar: ['#ffd23a', '#fff08a'], floor: '#ffe68a', wall: '#e0a81f', trim: '#b8840f', props: 'gold', house: ['#ffc21f', '#fff3a6'], guardian: { name: 'Golden Pharaoh', wrap: '#ffe27a', wrap2: '#c8962a', eye: '#3affff', angry: '#ff3a1a', crown: true } },
  { name: 'Mythical', rarity: 'Mythical', rec: 800000, bar: ['#ff7a1a', '#ffa64a'], floor: '#4a3a3a', wall: '#2a2020', trim: '#ff6a1a', props: 'lava', house: ['#ff6a1a', '#ffb04a'], guardian: { name: 'Magma Ogre', wrap: '#5a3a30', wrap2: '#ff7a2a', eye: '#ffd23a', angry: '#ff2a00', horns: true } },
  { name: 'Secret', rarity: 'Secret', rec: 2.5e6, bar: ['#c4141b', '#e8343a'], floor: '#3a1418', wall: '#8a1018', trim: '#e3141b', props: 'spikes', house: ['#c4141b', '#ff6a6a'], guardian: { name: 'Crimson Oni', wrap: '#d8343a', wrap2: '#7a1018', eye: '#ffffff', angry: '#ff0000', horns: true } },
  { name: 'Eternal', rarity: 'Eternal', rec: 8e6, bar: ['#f4f4f4', '#9a9a9a'], floor: '#eeeef4', wall: '#b8b8c8', trim: '#8a8aa0', props: 'marble', house: ['#d8d8e8', '#ffffff'], guardian: { name: 'Silver Sentinel', wrap: '#e8ecf4', wrap2: '#9aa0b8', eye: '#4ab8ff', angry: '#ff2a3a', crown: true } },
  { name: 'Divine', rarity: 'Divine', rec: 2.5e7, bar: 'rainbow', floor: '#fff8e8', wall: '#ff8ad8', trim: '#8ad8ff', props: 'rainbow', house: ['#ff5fb1', '#5fe0ff'], guardian: { name: 'Prism Titan', wrap: '#ffffff', wrap2: '#ffb0f0', eye: '#7a3aff', angry: '#ff2a8a', crown: true } },
  { name: 'Heavenly', rarity: 'Heavenly', rec: 8e7, bar: ['#ffc2dc', '#ffe2ee'], floor: '#ffe0ec', wall: '#ff9ac8', trim: '#e86aa8', props: 'sakura', house: ['#ff8ac0', '#ffffff'], guardian: { name: 'Sakura Ronin', wrap: '#ffd0e4', wrap2: '#e870a8', eye: '#ff2a8a', angry: '#ff1a4a', horns: false } },
  { name: 'Celestial', rarity: 'Celestial', rec: 2.5e8, bar: ['#1fb8ff', '#7af0ff'], floor: '#1a2a5a', wall: '#0f1a40', trim: '#7af0ff', props: 'space', house: ['#1f6bff', '#7af0ff'], guardian: { name: 'Sky Warden', wrap: '#9ae8ff', wrap2: '#2f6bd8', eye: '#ffffff', angry: '#ff3a3a', crown: true } },
  { name: 'Primal', rarity: 'Primal', rec: 8e8, bar: ['#2bb04a', '#ffd23a'], floor: '#8a9a5a', wall: '#5a6a3a', trim: '#ffd23a', props: 'ruins', house: ['#6a8a3a', '#ffd23a'], guardian: { name: 'Elder Colossus', wrap: '#b8c88a', wrap2: '#6a7a3a', eye: '#9cff4a', angry: '#ff3a1a', horns: true, crown: true } },
]
// Rarities from worst to best = the lane's zone order (Fuse tiers, Backpack sort). Backend
// FUSE_RARITIES and boxity-catalog RANK use the same order.
export const RARITY_ORDER = ZONES.map((z) => z.rarity)

// Mutations, in Index tab order. id: save/Index key; multi: income multiplier; weight: roll odds
// (roster.js rollMutation, after LANE.mutationChance); tab: the Index tab's two colours.
export const MUTATIONS = [
  { id: 'golden', name: 'Golden', color: '#ffd23a', multi: 1.5, weight: 30, tab: ['#fff4a8', '#e8b820'] },
  { id: 'ice', name: 'Ice', color: '#8fe9ff', multi: 2, weight: 22, tab: ['#e8fbff', '#7fd8f0'] },
  { id: 'shadow', name: 'Shadow', color: '#b48cff', multi: 2.5, weight: 15, tab: ['#c9a6ff', '#8a4ae8'] },
  { id: 'jade', name: 'Jade', color: '#8dff5a', multi: 3, weight: 12, tab: ['#d8ff9a', '#6ad83a'] },
  { id: 'candy', name: 'Candy', color: '#ff8ad8', multi: 3.5, weight: 9, tab: ['#ffd0f0', '#f07ac8'] },
  { id: 'lava', name: 'Lava', color: '#ff6a2a', multi: 4, weight: 6, tab: ['#ffc46a', '#f08a1a'] },
  { id: 'crimson', name: 'Crimson', color: '#ff4a4a', multi: 5, weight: 3, tab: ['#ff8a8a', '#e0303a'] },
  { id: 'lightning', name: 'Lightning', color: '#bfeaff', multi: 6, weight: 1.8, tab: ['#ffffff', '#a8d8f0'] },
  { id: 'destruction', name: 'Destruction', color: '#9a5aff', multi: 8, weight: 0.9, tab: ['#7a3ae0', '#3a147a'] },
  { id: 'mastered', name: 'Mastered Aura', color: '#e8ecff', multi: 12, weight: 0.3, tab: ['#ffffff', '#c8c8e8'] },
]

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character', 'player']
export const START_MODE = 'character'

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 8, // m/s
  sprintSpeed: 14, // m/s with Shift held
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 8.5, // m/s
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.45, // m autostep
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -6, // sank this far: respawn
}
export const PLAYER_DIMS = { radius: 0.75, height: 1.8 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0 }
export const FOG = { near: 170, far: 650 }
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#1576f0',
    horizon: '#a9e2ff',
    sunColor: '#fff4de',
    // Sun + hemi + env together keep the pale sand (#eed39c) near its own tan;
    // much more and ACES washes it (and the props) out to grey-white.
    sunIntensity: 2.4,
    sunElevation: 55, // degrees above the horizon
    sunAzimuth: 35, // degrees, 0 = from +Z
    hemiSky: '#e4f2ff',
    hemiGround: '#d8c39a',
    hemiIntensity: 0.8,
    envIntensity: 0.45,
    lampIntensity: 0,
    stars: 0,
    exposure: 0.95,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.55,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a1a22',
    hemiIntensity: 0.35,
    envIntensity: 0.25,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.15,
  },
}
export const LIGHT = {
  shadowRange: 40, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: neon rails, waterfall, VIP gate, particles. Sunlit sand
// stays under the threshold.
export const BLOOM = { strength: 0.6, radius: 0.35, threshold: 2.0 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.1,
  far: 1200,
  startPitch: 0.14, // radians above the horizon (low chase cam)
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 12.4, // resting boom length, m
  minDistance: 2.5, // wheel in past this enters player mode
  maxDistance: 26,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 1.2, // look-at point as a fraction of player height
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 6, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
}

// --- Audio (audio/) ---------------------------------------------------------------
// Everything is synthesised. The master chain is glue compressor -> brick-wall limiter, every
// one-shot is throttled per name and counted against a voice budget, and loops change level
// with smoothed ramps only, so overlapping sounds never clip, click or pile up.
export const AUDIO = {
  volume: 0.8,
  buses: { ui: 0.8, sfx: 0.9, amb: 0.55, engine: 0.5 },
  duck: 0.45, // world level while a menu window is open
  maxVoices: 40,
  maxVoicesTouch: 20,
  latency: 0.04,
  latencyTouch: 0.07,
  lead: 0.02,
  reverb: { seconds: 1.6, preDelay: 0.012, early: [[17, 0.45], [29, 0.32], [43, 0.25], [67, 0.18], [91, 0.1]], decay: 1.2, tail: 0.16, darken: 1.8, send: 0.8 },
  // Safe zone sound world (audio/ambience.js): wind bed level, the Fuse Machine hum and Dragon
  // Spin ticks (level + distance in m at which they are at half level), footstep stride (m).
  ambience: { wind: 0.16, hum: 0.22, humNear: 9, tick: 0.5, tickNear: 10, fountain: 0.05 },
  footstepStride: 1.35,
  // Background music (audio/music.js): bus level, bus lowpass (Hz: keeps it warm, never shrill),
  // polyphony cap, tempo per mood (bpm) and a level trim per mood.
  music: { level: 0.32, lowpass: 2600, maxVoices: 26, tempo: { safe: 76, lane: 92, hatch: 60, chase: 128 }, moodLevel: { safe: 0.9, lane: 1, hatch: 0.8, chase: 1 } },
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
  master_volume: { def: '80', type: 'number', min: 0, max: 100 },
  music_volume: { def: '80', type: 'number', min: 0, max: 100 },
}

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  // Holding a hatched fighter in front of the chest (hotbar item selected).
  carry: {
    ArmL1: { x: deg(-62), z: deg(-14) },
    ArmR1: { x: deg(-62), z: deg(14) },
    ArmL2: { x: deg(38) },
    ArmR2: { x: deg(38) },
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
}

export const FONT_FAMILY = 'Fredoka'

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}

// --- Game server (net.js) ---------------------------------------------------------
// Progress is saved only there. url = a fixed server (normally empty: on Bloxity the SDK
// resolves a pod); devUrl is tried by `npm run dev` (the backend's `npm start`).
export const NET = {
  url: import.meta.env.VITE_SERVER_URL || '',
  devUrl: 'ws://localhost:2567',
  room: 'world',
  retry: 3, // s before the first reconnect attempt, doubling up to retryMax
  retryMax: 60,
  rejoin: 2, // s after a dropped room before rejoining
}

// --- Treadmill (treadmill.js): the HUD's Treadmill button drops one under you in the safe zone
// and you run on it, gaining Speed every `every` s (TAP!! adds `tap` x the gain per tap).
export const TREADMILL = {
  gain: 100, // Speed per stride tick
  every: 2, // s between Speed gains (the cooldown on each +100)
  critChance: 0.07, // chance a tick is a power stride
  critMulti: 10, // x gain on a power stride (+1000)
  // TAP!! bubble: pops up near the runner at random moments, stays `life` s (a draining ring),
  // then disappears. While it is up every tap gives gain x its multiplier. The multiplier is
  // rolled per bubble by weight, so x2 is common and x5 is rare.
  tap: {
    life: 5, // s the bubble stays
    first: [1.5, 3], // s from starting the treadmill to the first bubble
    gap: [5, 12], // s of quiet between one bubble going and the next showing
    tiers: [
      { m: 2, w: 60 },
      { m: 3, w: 25 },
      { m: 4, w: 11 },
      { m: 5, w: 4 },
    ],
  },
  tapCooldown: 0.12, // s between counted taps
  runSpeed: 12.5, // m/s the legs animate at (belt speed)
  beltSpeed: 3.2, // belt texture repeats per s
  deckHeight: 0.62, // m from the floor to the belt top
  spawnTime: 0.5, // s for the treadmill to pop up
  stowTime: 0.35,
  colors: { body: '#c9b8ff', bodyDark: '#a493e8', trim: '#6f5bd6', belt: '#4a4d5c', chevron: '#e9ecf5', neon: '#57f0ff', screen: '#38e0ff' },
}

// --- Backpack (backpack.js): the bag button opens the fighter inventory over the hotbar.
export const BACKPACK = {
  max: 300, // fighters it holds (backend BACKPACK_MAX)
}

// --- Windows (src/ui/): Index, Rebirth, Playtime Rewards, Daily Quests, Daily Rewards, Settings ---
// Nothing here is sold for premium currency: every Skip / boost the reference sold for gems costs $.
// Roster (roster.js): INDEX.perRarity fighters per RARITIES entry (162 in all), named from the
// syllables below (original names, fixed by a seed). Collecting INDEX.rewardAt fighters of one
// mutation unlocks that mutation's base skin ("<Mutation> Base").
export const INDEX = {
  perRarity: [16, 16, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11],
  seed: 1337,
  rewardAt: 20,
  first: ['Ka', 'Ze', 'Ro', 'Ta', 'Ve', 'Go', 'Shi', 'Bra', 'Ni', 'Ko', 'Yu', 'Rai', 'Se', 'O', 'Fe', 'Ju', 'Ma', 'Te', 'Ry', 'Ha', 'Do', 'Lu', 'Ken', 'Sa', 'Vol', 'Gri', 'Pa', 'Za', 'Bu', 'Ki', 'To', 'Ga', 'Mi', 'Ra', 'Nu', 'Ji'],
  last: ['iro', 'nbu', 'kka', 'mo', 'ltra', 'rin', 'ro', 'kk', 'mbo', 'da', 'zan', 'ko', 'nji', 'zuru', 'nn', 'ssa', 'ku', 'run', 'ta', 'tan', 'za', 'rak', 'bi', 'shi', 'ga', 'ji', 'ppa', 'ndo', 'ren', 'gon'],
  // Titles for the rarer fighters (from Epic up), and numbered units ("Unit 17").
  titles: ['King', 'Captain', 'Elder', 'Young', 'Dark', 'Super', 'Grand', 'Lord', 'Kid', 'Master', 'Prime', 'Ultra', 'General', 'Sky', 'Iron'],
  numbered: ['Unit', 'Gamma', 'Model', 'Cyber'],
}

// Rebirth: needs cash and Speed, resets both, raises the money multiplier (state.moneyMulti())
// and the treadmill training multiplier (state.trainMulti()), so the Speed you lose comes back
// faster each time. First one around minute 12 of normal play, then every 5-30 min (BALANCE.md).
export const REBIRTH = {
  cash: 5e6, // $ needed for the first rebirth, x cashGrowth for each after it
  cashGrowth: 7,
  speed: 25000, // Speed needed for the first rebirth, x speedGrowth for each after it
  speedGrowth: 2.2,
  multiStep: 0.5, // money x1.0 -> x1.5 -> x2.0 ...
  speedStep: 0.25, // treadmill Speed gain x1.0 -> x1.25 -> x1.5 ...
  skipCost: 3, // Skip! (rebirth without the reset or the Speed requirement) costs this x the cash requirement, in $
}

// Timed boosts. x2 Speed is bought with $ on the left-edge button (price = this share of the
// current rebirth cash requirement, at least minPrice); x2 Luck comes from the Daily Rewards.
export const BOOSTS = {
  speed: { multi: 2, minutes: 15, price: 0.1, minPrice: 50000 },
  luck: { multi: 2 },
  money: { multi: 2 }, // x2 Money (a Dragon Spin prize): base income
}

// Playtime Rewards: unlocks = seconds online today (backend PLAYTIME_UNLOCKS, same length).
// cash is multiplied by the money multiplier; fighter = a roster fighter of that rarity (pick = which one).
export const PLAYTIME = {
  unlocks: [30, 90, 180, 300, 600, 1200, 1800, 2400, 3000],
  rewards: [
    { cash: 5000 },
    { fighter: 'Uncommon', pick: 2 },
    { fighter: 'Rare', pick: 5 },
    { cash: 25000 },
    { fighter: 'Epic', pick: 1 },
    { fighter: 'Legendary', pick: 3 },
    { cash: 150000 },
    { fighter: 'Mythical', pick: 0, op: true },
    { fighter: 'Secret', pick: 2, op: true },
  ],
}

// Daily Rewards: one more day unlocks each UTC day (backend daily.ts, DAILY_DAYS = 7).
// bg = the card's gradient.
export const DAILY = {
  days: [
    { cash: 25000, bg: ['#6ce06a', '#2a9a3a'] },
    { fighter: 'Rare', pick: 8, bg: ['#7ff0ff', '#1fa8f0'] },
    { fighter: 'Epic', pick: 6, bg: ['#ff7af0', '#b03ae8'] },
    { boost: 'luck', minutes: 10, label: 'x2 Luck (10 Mins)', bg: ['#ff6af0', '#a03af0'] },
    { fighter: 'Legendary', pick: 6, bg: ['#fff27a', '#ffb01f'] },
    { fighter: 'Mythical', pick: 4, bg: ['#f4f4f8', '#9aa0b0'] },
    { fighter: 'Secret', pick: 6, op: true, bg: 'rainbow' },
  ],
}

// Daily Quests (backend quests.ts QUEST_KINDS). The reward fighter rotates by UTC day; skipping
// the quests costs skipCost x the current rebirth cash requirement in $.
export const QUESTS = {
  text: { hatch: 'Hatch {n} Characters', mutated: 'Hatch {n} Mutated Characters', sell: 'Sell {n} Characters', play: 'Play for {n} Minutes' },
  rewards: [
    { fighter: 'Uncommon', pick: 9 },
    { fighter: 'Rare', pick: 11 },
    { fighter: 'Epic', pick: 9 },
    { fighter: 'Rare', pick: 13 },
    { fighter: 'Legendary', pick: 9 },
    { fighter: 'Epic', pick: 12 },
    { fighter: 'Legendary', pick: 11 },
  ],
  skipCost: 0.25,
}

// Settings window defaults (saved with the progress).
export const GAME_SETTINGS = { lowGfx: false, noVfx: false, muteMusic: false, names: true }

// --- Shops + machines in the safe zone (src/ui/ shop windows, opened by stepping on a pad) ------
// Everything here is bought with $ only (never premium currency).

// Fuse Machine (ui/fuse.js; backend fuse.ts FUSE_* must match): FUSE.inputs fighters go in, one
// comes out after a timer. Result tier = the inputs' average rarity (rounded) + a step rolled by
// weight, capped at the top rarity; a mutation with mutationChance (four alike pass theirs on).
// Timer = seconds[0] + seconds[1] x the base tier.
export const FUSE = {
  inputs: 4,
  steps: [
    { step: 0, weight: 60 },
    { step: 1, weight: 32 },
    { step: 2, weight: 8 },
  ],
  mutationChance: 0.25,
  seconds: [20, 20],
}

// Base Skins (ui/skins.js): Default + one per mutation, unlocked in the Index (INDEX.rewardAt of
// that mutation -> state.indexClaimed). The colours repaint your base: floor slab, inset panels,
// pillars + walls, carpet, the glowing rims and the white caps.
export const BASE_SKINS = [
  { id: '', name: 'Default', floor: '#cfc8f2', inset: '#e2ddff', pillar: '#ff8cc6', carpet: '#e3141b', trim: '#1fe6ff', cap: '#ffffff' },
  { id: 'golden', name: 'Golden', floor: '#ffe58a', inset: '#fff3c4', pillar: '#e8b820', carpet: '#b8780b', trim: '#fff27a', cap: '#fffbe8' },
  { id: 'ice', name: 'Ice', floor: '#d8f6ff', inset: '#f0fcff', pillar: '#7fd8f0', carpet: '#2f9be0', trim: '#bff8ff', cap: '#ffffff' },
  { id: 'shadow', name: 'Shadow', floor: '#6a4aa8', inset: '#8a6ac8', pillar: '#3a1a6a', carpet: '#1a0a3a', trim: '#b48cff', cap: '#d8c8ff' },
  { id: 'jade', name: 'Jade', floor: '#9ae68a', inset: '#c8ffb8', pillar: '#2f9a3a', carpet: '#1f6a2a', trim: '#8dff5a', cap: '#eaffe0' },
  { id: 'candy', name: 'Candy', floor: '#ffd0f0', inset: '#ffe8f8', pillar: '#ff7ac8', carpet: '#ff3a9a', trim: '#ffb0e8', cap: '#ffffff' },
  { id: 'lava', name: 'Lava', floor: '#5a3a30', inset: '#7a4a38', pillar: '#ff6a1a', carpet: '#2a1410', trim: '#ffb04a', cap: '#ffd08a' },
  { id: 'crimson', name: 'Crimson', floor: '#e8a0a0', inset: '#f8c8c8', pillar: '#c4141b', carpet: '#6a0a10', trim: '#ff4a4a', cap: '#ffe0e0' },
  { id: 'lightning', name: 'Lightning', floor: '#e8f4ff', inset: '#ffffff', pillar: '#5ab8ff', carpet: '#1a3a8a', trim: '#bfeaff', cap: '#fff27a' },
  { id: 'destruction', name: 'Destruction', floor: '#4a2a7a', inset: '#6a3aa0', pillar: '#2a0a5a', carpet: '#9a5aff', trim: '#d07aff', cap: '#c8a8ff' },
  { id: 'mastered', name: 'Mastered Aura', floor: '#f0f2ff', inset: '#ffffff', pillar: '#c8c8e8', carpet: '#8a8ab0', trim: '#e8ecff', cap: '#ffffff' },
]

// Treadmill Shop (ui/treadmills.js): the equipped treadmill sets the Speed gained per stride
// (the starter's gain is TREADMILL.gain; x state.trainMulti() after rebirths) and the machine's
// colours. Prices in $; bg = card gradient. Gains and prices are fitted to the progression sim:
// a new one every 1-2 min at the start, every ~30-60 min near the last zone (BALANCE.md).
export const TREADMILLS = [
  { id: '', name: 'Training Treadmill', gain: 100, price: 0, colors: { body: '#c9b8ff', bodyDark: '#a493e8', trim: '#6f5bd6', neon: '#57f0ff' }, bg: ['#dfe3ee', '#9aa2b8'] },
  { id: 'meadow', name: 'Meadow Treadmill', gain: 160, price: 5e3, colors: { body: '#7ee06a', bodyDark: '#3fae3a', trim: '#1f7a2a', neon: '#c8ff5a' }, bg: ['#c8ffb0', '#5fcf4a'] },
  { id: 'grape', name: 'Grape Treadmill', gain: 220, price: 9e4, colors: { body: '#c86aff', bodyDark: '#9a3ae8', trim: '#5a1aa8', neon: '#ff7af0' }, bg: ['#ecb8ff', '#a84ae8'] },
  { id: 'sunrise', name: 'Sunrise Treadmill', gain: 290, price: 8e5, colors: { body: '#ffc84a', bodyDark: '#f09a1a', trim: '#b8600a', neon: '#fff27a' }, bg: ['#fff0b0', '#ffb84a'] },
  { id: 'coral', name: 'Coral Treadmill', gain: 370, price: 2.8e6, colors: { body: '#ff8a7a', bodyDark: '#e85a4a', trim: '#a82a2a', neon: '#ffd0a0' }, bg: ['#ffd0c8', '#ff7a6a'] },
  { id: 'frost', name: 'Frostbite Treadmill', gain: 480, price: 8e6, colors: { body: '#bff0ff', bodyDark: '#7fc8f0', trim: '#2f7fd8', neon: '#e8ffff' }, bg: ['#e8fbff', '#7fd0f0'] },
  { id: 'gilded', name: 'Gilded Treadmill', gain: 630, price: 4.5e7, colors: { body: '#ffe27a', bodyDark: '#d8a81f', trim: '#8a6a0a', neon: '#fff8c0' }, bg: ['#fff4b8', '#e8b820'] },
  { id: 'candy', name: 'Candy Treadmill', gain: 820, price: 5.7e8, colors: { body: '#ffb0e0', bodyDark: '#ff7ac8', trim: '#e83a9a', neon: '#ffffff' }, bg: ['#ffe0f4', '#ff8ad0'] },
  { id: 'inferno', name: 'Inferno Treadmill', gain: 1100, price: 8.5e9, colors: { body: '#ff4a3a', bodyDark: '#c41a1a', trim: '#6a0a0a', neon: '#ffb04a' }, bg: ['#ff9a8a', '#d8202a'] },
  { id: 'cloud', name: 'Cloud Rider Treadmill', gain: 1400, price: 3.1e11, colors: { body: '#fff4c0', bodyDark: '#ffd86a', trim: '#4ab8ff', neon: '#bfeaff' }, bg: ['#fffbe0', '#ffe27a'] },
  { id: 'thunder', name: 'Thunder Treadmill', gain: 1800, price: 6.4e12, colors: { body: '#5a7aff', bodyDark: '#2a3ad8', trim: '#fff27a', neon: '#fff27a' }, bg: ['#b8c8ff', '#3a5ae8'] },
  { id: 'abyss', name: 'Abyss Treadmill', gain: 2300, price: 1.1e14, colors: { body: '#1f6a8a', bodyDark: '#0f3a5a', trim: '#2affd8', neon: '#2affd8' }, bg: ['#8ad8e8', '#1f6a8a'] },
  { id: 'ravager', name: 'Ravager Treadmill', gain: 3000, price: 1.5e15, colors: { body: '#6a3ab8', bodyDark: '#2a1a5a', trim: '#ff3af0', neon: '#ff7af0' }, bg: ['#c8a8ff', '#4a2a8a'] },
  { id: 'divine', name: 'Divine Treadmill', gain: 6600, price: 5.2e15, colors: { body: '#ff6a7a', bodyDark: '#c4203a', trim: '#ffd23a', neon: '#ffe14a' }, bg: ['#ffb0b8', '#c4303a'] },
  { id: 'elixir', name: 'Elixir Treadmill', gain: 12000, price: 4.5e16, colors: { body: '#3a5a4a', bodyDark: '#1f3a2a', trim: '#8dff5a', neon: '#8dff5a' }, bg: ['#a8d8b8', '#2f6a4a'] },
  { id: 'cosmic', name: 'Cosmic Treadmill', gain: 16000, price: 2.4e17, colors: { body: '#2a2a6a', bodyDark: '#14143a', trim: '#7af0ff', neon: '#c8a8ff' }, bg: ['#9a9af0', '#2a2a7a'] },
  { id: 'primal', name: 'Primal Treadmill', gain: 28000, price: 4.2e17, colors: { body: '#9cff4a', bodyDark: '#5aa82a', trim: '#ffd23a', neon: '#ffffff' }, bg: ['#e0ffb8', '#7ad83a'] },
]

// Dragon Ball Shop (ui/balls.js): the equipped Dragon Ball is the ball you roll down the lane as,
// and multiplies your luck (mutation odds + hatch quality). Prices in $.
// look: base colour, shade, star colour, star count, optional pattern ('grid' | 'crack' | 'wings').
export const BALLS = [
  { id: '', name: 'Starter Dragon Ball', rarity: 'Common', luck: 1, price: 0, look: { base: '#5a5e6a', dark: '#24262e', star: '#ffffff', stars: 3 } },
  { id: 'lucky', name: 'Lucky Dragon Ball', rarity: 'Uncommon', luck: 2, price: 4e6, look: { base: '#ffa040', dark: '#e0560a', star: '#e8141b', stars: 3 } },
  { id: 'circuit', name: 'Circuit Dragon Ball', rarity: 'Rare', luck: 3, price: 3.4e8, look: { base: '#1f5a2a', dark: '#0a2a12', star: '#5aff6a', stars: 4, pattern: 'grid' } },
  { id: 'ember', name: 'Ember Dragon Ball', rarity: 'Epic', luck: 4, price: 2.9e10, look: { base: '#ff5a2a', dark: '#8a1a0a', star: '#ffe14a', stars: 4, pattern: 'crack' } },
  { id: 'frost', name: 'Frost Dragon Ball', rarity: 'Legendary', luck: 5, price: 1.3e12, look: { base: '#bff0ff', dark: '#4ab8e8', star: '#1f5ad8', stars: 5 } },
  { id: 'storm', name: 'Storm Dragon Ball', rarity: 'Mythical', luck: 6, price: 5e13, look: { base: '#6a7aff', dark: '#1a1f8a', star: '#fff27a', stars: 5, pattern: 'crack' } },
  { id: 'void', name: 'Void Dragon Ball', rarity: 'Secret', luck: 7, price: 5.9e14, look: { base: '#3a2a4a', dark: '#08040e', star: '#ff3af0', stars: 6 } },
  { id: 'chrome', name: 'Chrome Dragon Ball', rarity: 'Eternal', luck: 8, price: 3.5e15, look: { base: '#e8ecf4', dark: '#7a8098', star: '#e8141b', stars: 6, pattern: 'crack' } },
  { id: 'serpent', name: 'Serpent Dragon Ball', rarity: 'Heavenly', luck: 10, price: 1.2e16, look: { base: '#3a8a4a', dark: '#0f3a1a', star: '#ff2a2a', stars: 3, pattern: 'crack' } },
  { id: 'angelic', name: 'Angelic Dragon Ball', rarity: 'Celestial', luck: 11, price: 2.7e16, look: { base: '#ffffff', dark: '#c8d4ff', star: '#8aa8ff', stars: 7, pattern: 'wings' } },
]

// Dragon Spin (ui/spin.js; backend spin.ts SPIN_WEDGES: same ids, order and weights). One free spin
// every everyMs (server clock); packs of extra spins are sold for $ (price = share x the current
// rebirth cash requirement, at least min). prize: a ui/rewards.js reward.
export const SPIN = {
  wedges: [
    { id: 'cash', label: '$100K', weight: 30, prize: { cash: 100000 } },
    { id: 'luck', label: '2x Luck', weight: 10, prize: { boost: 'luck', minutes: 10, label: 'x2 Luck (10 Mins)' } },
    { id: 'epicFighter', label: 'Epic Fighter', weight: 5, prize: { fighter: 'Epic', pick: 3 } },
    { id: 'speed', label: '2x Speed', weight: 20, prize: { boost: 'speed', minutes: 10, label: 'x2 Speed (10 Mins)' } },
    { id: 'rareFighter', label: 'Rare Fighter', weight: 15, prize: { fighter: 'Rare', pick: 7 } },
    { id: 'money', label: '2x Money', weight: 20, prize: { boost: 'money', minutes: 10, label: 'x2 Money (10 Mins)' } },
  ],
  colors: ['#2f8a3a', '#1f6a2a'], // alternating wedge colours
  everyMs: 15 * 60 * 1000, // backend SPIN_EVERY_MS
  cap: 5,
  start: 1,
  packs: [
    { spins: 3, share: 0.04, min: 150000 },
    { spins: 6, share: 0.06, min: 250000, tag: 'MEGA DEAL' },
  ],
  turns: 5, // full turns before the wheel settles
  time: 4.2, // s the spin animation takes
}

// Sell stall (ui/sell.js): a fighter sells for income x seconds x the money multiplier.
export const SELL = { seconds: 30 }
