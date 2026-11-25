// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'bowling-roll' // slug registered on bloxity.io
export const GAME_TITLE = 'Bowling Roll'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
// The safe zone (src/safezone/, map in SAFE_ZONE.md): a green studded hub walled on three
// sides, the desert lane to the north (-Z). Spawn in the middle facing the shop row.
export const SPAWN = { x: 0, y: 0.05, z: 4 }
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)

export const SAFE_ZONE = {
  hub: { minX: -70, maxX: 70, minZ: -52, maxZ: 62 }, // the green safe area (inner faces of the walls)
  desertEnd: -132, // z of the far wall of the sand
  wall: { height: 16, thick: 4 },
  tile: 8, // m per stud texture tile (UV unit of every studded surface)
  colors: {
    grass: '#3fd13a',
    sand: '#f3d36d',
    wall: '#d8a35e',
    carpet: '#e3141b',
    base: '#cfc8f2',
    baseTrim: '#2fe3ff',
    pillar: '#ffa6dd',
    cap: '#ffffff',
    board: '#3d7ff2',
    boardDark: '#2453c7',
    emptyPlot: '#a8d8ff',
  },
  laneExit: { x: 0, width: 7, textZ: -45 }, // SAFE ZONE text runs along the hub edge here
  // Shop row on the green, just inside the sand edge. pad = ring pad colour, r = pad radius.
  shops: [
    { id: 'sell', title: 'Sell', x: -56, z: -42, pad: '#ff5fb1', r: 3.2, note: 'Sell your fighters here' },
    { id: 'spin', title: 'Dragon Spin', x: -40, z: -42, pad: '#7dff5a', r: 4.6, note: 'Free spin every 15 minutes' },
    { id: 'orbs', title: 'Orb Shop', x: -24, z: -42, pad: '#ffe14a', r: 5, note: 'Orb Shop opens soon' },
    { id: 'treadmill', title: 'Treadmill Shop', x: 20, z: -42, pad: '#33f1ff', r: 4.2, note: 'Treadmill Shop opens soon' },
    { id: 'cash', title: 'Cash Shop', x: 35, z: -42, pad: '#b44dff', r: 5, note: 'Everything here costs $ only' },
    { id: 'skins', title: 'Base Skins', x: 49, z: -42, pad: '#d8ff4a', r: 3.6, note: 'Equip base skins here' },
    { id: 'fuse', title: 'Fuse Machine', x: 60, z: -40, pad: '#8f6bff', r: 0, note: 'Fuse 3 fighters into a stronger one' },
  ],
  // Boards on the side walls (side: 1 = east wall facing west, -1 = west wall facing east).
  boards: [
    { id: 'money', side: 1, z: -26, title: 'Top Money', header: 'Most Money', titleColor: '#b7ff3d', unit: '$', suffix: '' },
    { id: 'speed', side: 1, z: -8, title: 'Top Speed', header: 'Most Speed', titleColor: '#39d7ff', unit: '', suffix: ' Speed' },
    { id: 'rebirth', side: -1, z: -30, title: 'Top Rebirth', header: 'Most Rebirth', titleColor: '#ffe14a', unit: '', suffix: ' Rebirths' },
    { id: 'playtime', side: -1, z: -6, title: 'Top Playtime', header: 'Most Time Played', titleColor: '#ffffff', unit: '', suffix: '' },
  ],
  updateScreen: { side: 1, z: -17, nextUpdateHours: 70 }, // between Top Money and Top Speed
  statue: { side: -1, z: -18 }, // Claim Free Reward statue on the west wall
  orbPack: { x: 61, z: 3, price: '$25M' },
  suggestions: { x: 63, z: 14 },
  eventBuilding: { x: -46, z: -78, minutes: 4 },
  // Player bases along the south side, entrances facing north. level 0 = empty plot.
  bases: {
    frontZ: 24,
    width: 20,
    depth: 30,
    floorHeight: 7, // m between floors
    slotsPerSide: 5,
    fill: 0.62, // share of slots with a fighter in other players' bases
    plots: [
      { x: -55, level: 4, owner: 'NovaBlitz', multi: 3 },
      { x: -33, level: 2, owner: 'Mochi_Flash', multi: 1.5 },
      { x: -11, level: 0 },
      { x: 11, level: 1, owner: 'You', mine: true, multi: 1 },
      { x: 33, level: 3, owner: 'PixelMonk', multi: 2 },
      { x: 55, level: 0 },
    ],
    upgrade: { price: '$500K', progress: '0/5' },
  },
}
// Fighter rarities: label colour, income range (per second) and whether they get an aura.
export const RARITIES = [
  { name: 'Common', color: '#d7dde6', income: [600, 2000] },
  { name: 'Uncommon', color: '#5bff6a', income: [3e3, 4e4] },
  { name: 'Rare', color: '#3fa2ff', income: [6e4, 9e5] },
  { name: 'Epic', color: '#c35bff', income: [2e6, 6e8] },
  { name: 'Legendary', color: '#ffd23a', income: [1e9, 2e10], aura: true },
  { name: 'Mythical', color: '#ff4a4a', income: [5e10, 9e11], aura: true },
  { name: 'Secret', color: '#ffffff', income: [1e12, 5e13], aura: true, outline: '#000000' },
  { name: 'Heavenly', color: '#ff7ad9', income: [1e14, 9e14], aura: true },
  { name: 'Eternal', color: '#ff8a1f', income: [1e15, 3e16], aura: true },
  { name: 'Celestial', color: '#7af0ff', income: [5e16, 6e17], aura: true },
]
export const MUTATIONS = [
  { name: 'Golden', color: '#ffd23a' },
  { name: 'Ice', color: '#8fe9ff' },
  { name: 'Lava', color: '#ff6a2a' },
  { name: 'Shadow', color: '#b48cff' },
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
  storageKey: 'be-a-dragon-ball.sound',
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
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
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
