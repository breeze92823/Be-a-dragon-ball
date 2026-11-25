import { DodecahedronGeometry, Group, IcosahedronGeometry, Sprite, SpriteMaterial } from 'three'
import { LANE, SAFE_ZONE, ZONES } from '../config.js'
import { mulberry32 } from '../textures.js'
import { createEmitter } from '../particles.js'
import { neon } from '../propkit.js'
import { M, S, box, cyl, cone, ball, mesh, bakeInto, solid, deg } from '../safezone/kit.js'
import { SignAtlas, DynLabel, strokeText, short } from '../safezone/text.js'
import { buildHouse } from './house.js'
import { dressDesert, zoneExtras } from './desert.js'

// The lane north of the safe zone (map: LANE.md). Zone 0 (Common) is the
// desert the safe zone already built; zones 1..11 are walled corridors, each
// with its own floor, walls, scenery, ambient particles and a guardian base
// beside the red carpet. Every zone has a gate arch at its start and a floating
// "<Zone> Zone / Recommended: <speed>" sign. Each zone's set piece is baked to a
// few meshes and hidden when the player is far away.

const Z = SAFE_ZONE
const C = LANE.corridor

// Zone extents along -Z.
export function zoneBounds(i) {
  if (i === 0) return { start: Z.hub.minZ, end: Z.desertEnd }
  const start = Z.desertEnd - (i - 1) * C.length
  return { start, end: start - C.length }
}
export const LANE_END = zoneBounds(ZONES.length - 1).end

// Zone index at z (-1 = safe zone, beyond the end = last zone).
export function zoneAt(z) {
  if (z >= Z.hub.minZ) return -1
  if (z > Z.desertEnd) return 0
  return Math.min(ZONES.length - 1, 1 + Math.floor((Z.desertEnd - z) / C.length))
}

export function buildLane(scene) {
  const signs = new SignAtlas(2048)
  const zones = []
  ZONES.forEach((zone, i) => zones.push(buildZone(scene, signs, zone, i)))
  // End wall behind the last zone.
  const g = new Group()
  const WT = Z.wall.thick
  box(g, S(ZONES[ZONES.length - 1].wall, { rough: 0.7 }), C.width + WT * 2, C.wallHeight + 1, WT, 0, -1, LANE_END - WT / 2)
  solid(C.width / 2 + WT, (C.wallHeight + 1) / 2, WT / 2, 0, C.wallHeight / 2 - 0.5, LANE_END - WT / 2)
  bakeInto(scene, g, true)
  return { zones }
}

function buildZone(scene, signs, zone, i) {
  const { start, end } = zoneBounds(i)
  const mid = (start + end) / 2
  const len = start - end
  const g = new Group()
  const rand = mulberry32(4000 + i * 131)
  const halfW = i === 0 ? Z.hub.maxX : C.width / 2
  const WT = Z.wall.thick
  const emitters = []

  if (i > 0) {
    // Floor, side walls with a lip, lane carpet with gold edges.
    box(g, S(zone.floor, { rough: 0.75 }), C.width, 1, len, 0, -1, mid)
    solid(halfW + WT, 0.5, len / 2, 0, -0.5, mid)
    for (const s of [-1, 1]) {
      box(g, S(zone.wall, { rough: 0.7 }), WT, C.wallHeight + 1, len, s * (halfW + WT / 2), -1, mid)
      box(g, S(zone.trim, { rough: 0.6 }), WT + 0.5, 0.7, len - 0.02, s * (halfW + WT / 2), C.wallHeight, mid)
      solid(WT / 2, (C.wallHeight + 1) / 2, len / 2, s * (halfW + WT / 2), C.wallHeight / 2 - 0.5, mid)
      // Pilasters every 15 m (stick out of the wall face).
      for (let k = 0; k <= len / 15; k++) box(g, S(zone.trim, { rough: 0.6 }), 0.8, C.wallHeight - 0.2, 1.4, s * (halfW - 0.4), 0, start - k * 15)
    }
    box(g, S(SAFE_ZONE.colors.carpet, { rough: 0.9 }), 7, 0.06, len, 0, 0, mid)
    for (const s of [-1, 1]) box(g, M('#ffd23a', { rough: 0.35, metal: 0.2 }), 0.22, 0.1, len, s * 3.61, 0, mid)
    // Gate arch at the zone start: two pillars and a beam in the zone's colours.
    const [ca, cb] = Array.isArray(zone.bar) ? zone.bar : ['#ff5fb1', '#5fe0ff']
    for (const s of [-1, 1]) {
      box(g, S(ca, { rough: 0.5 }), 2, 10, 2, s * 9, 0, start - 1.5)
      box(g, S(cb, { rough: 0.5 }), 2.6, 0.8, 2.6, s * 9, 10, start - 1.5)
      solid(1, 5, 1, s * 9, 5, start - 1.5)
    }
    box(g, S(ca, { rough: 0.5 }), 20.6, 1.4, 1.6, 0, 10.8, start - 1.5)
    box(g, neon(cb, 2.6), 20, 0.25, 1.7, 0, 10.6, start - 1.5)
    // Threshold band across the floor.
    box(g, S(cb, { rough: 0.5 }), C.width - 0.2, 0.04, 1.2, 0, 0, start - 0.6)
  }

  // Guardian base beside the lane (zone 0: east of the desert lane, off the shop strip).
  const side = i === 0 ? 1 : i % 2 ? -1 : 1
  const houseX = i === 0 ? 24 : side * (halfW - 7)
  const houseZ = i === 0 ? -64 : mid - 8
  const frame = { x: houseX, z: houseZ, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 }
  const front = Math.abs(houseX) - 5.5 - 1.4 // |x| of the step's outer edge
  const house = buildHouse(scene, signs, zone, frame, front - 3.6)
  emitters.push(...house.emitters)

  // Scenery (the desert's ground, pyramids and cacti come from safezone/ground.js; desert.js adds
  // its obelisks, oasis, mounds and the moving tumbleweeds, vultures and dust devils).
  let live = null
  if (i > 0) {
    dressZone(g, zone, rand, { start, end, halfW, house: { x: houseX, z: houseZ }, emitters, scene })
    zoneExtras(scene, zone, { start, end, halfW }, emitters)
  } else live = dressDesert(g, scene, emitters)

  // Floating zone sign over the lane.
  const label = new DynLabel(900, 220, 5.2, (ctx, w, h) => paintZoneSign(ctx, w, h, zone))
  label.set(zone.name)
  label.sprite.position.set(0, 9.5, start - (i === 0 ? 20 : 12))
  scene.add(label.sprite)

  const baked = bakeInto(scene, g, true)
  return { index: i, zone, start, end, mid, house, baked, label: label.sprite, emitters, live: live?.group ?? null, update: live?.update ?? null }
}

// "<Zone> Zone" + "Recommended : <shoe> 2.7K Speed".
function paintZoneSign(ctx, w, h, zone) {
  const bar = Array.isArray(zone.bar) ? zone.bar : ['#ff7ad9', '#7af0ff']
  strokeText(ctx, `${zone.name} Zone`, w / 2, 70, 92, ['#ffffff', '#e6ecff'], { outline: '#2a2a3a', ow: 16, maxW: w - 20 })
  const txt = `${short(zone.rec)} Speed`
  ctx.font = '700 56px Fredoka, "Arial Black", sans-serif'
  const tw = ctx.measureText(txt).width
  const lead = 'Recommended :'
  const lw = ctx.measureText(lead).width
  const total = lw + 20 + 64 + 12 + tw
  let x = w / 2 - total / 2
  strokeText(ctx, lead, x + lw / 2, 168, 52, '#ffffff', { outline: '#1a1a2a', ow: 12 })
  x += lw + 20
  paintShoe(ctx, x, 136, 64)
  x += 64 + 12
  strokeText(ctx, txt, x + tw / 2, 168, 56, [bar[1], '#2aa8ff'], { outline: '#0b2a6a', ow: 12 })
}

// Little running shoe (also used by the HUD as an SVG twin).
export function paintShoe(ctx, x, y, s) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s / 64, s / 64)
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(4, 44)
  ctx.lineTo(18, 14)
  ctx.lineTo(30, 20)
  ctx.lineTo(36, 30)
  ctx.lineTo(58, 38)
  ctx.quadraticCurveTo(64, 46, 56, 54)
  ctx.lineTo(8, 54)
  ctx.closePath()
  ctx.lineWidth = 8
  ctx.strokeStyle = '#0b2a6a'
  ctx.stroke()
  const g = ctx.createLinearGradient(0, 14, 0, 54)
  g.addColorStop(0, '#7fe0ff')
  g.addColorStop(1, '#1f8bff')
  ctx.fillStyle = g
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(6, 48, 52, 6)
  ctx.restore()
}

// --- Scenery per theme -------------------------------------------------------------------------
const rockGeo = new DodecahedronGeometry(1, 0)
const gemGeo = new IcosahedronGeometry(1, 0)

function dressZone(g, zone, rand, o) {
  const { start, end, halfW, house, emitters, scene } = o
  const spots = []
  for (let k = 0; k < 60 && spots.length < 18; k++) {
    const x = (rand() * 2 - 1) * (halfW - 4)
    const z = end + 6 + rand() * (start - end - 12)
    if (Math.abs(x) < 9) continue
    if (Math.abs(x - house.x) < 13 && Math.abs(z - house.z) < 11) continue
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 6)) continue
    spots.push({ x, z, r: rand(), ry: rand() * Math.PI * 2 })
  }
  const t = zone.props
  const add = (fn) => spots.forEach((s, k) => fn(s, k))
  if (t === 'jungle' || t === 'sakura') {
    const trunk = S('#7a4a26', { rough: 0.85 })
    const leaf = S(t === 'sakura' ? '#ffb0d4' : '#2fa83a', { rough: 0.7 })
    const leaf2 = S(t === 'sakura' ? '#ff8ac0' : '#5bd84a', { rough: 0.7 })
    add((s) => {
      const h = 4 + s.r * 3
      box(g, trunk, 1, h, 1, s.x, 0, s.z, s.ry)
      box(g, leaf, 5, 2.2, 5, s.x, h, s.z, s.ry)
      box(g, leaf2, 3.6, 1.8, 3.6, s.x, h + 2.2, s.z, s.ry + 0.4)
      box(g, leaf, 2, 1.2, 2, s.x, h + 4, s.z, s.ry)
      solid(0.5, h / 2, 0.5, s.x, h / 2, s.z, s.ry)
    })
    if (t === 'sakura') emitters.push(createEmitter(scene, { boxes: [{ x: 0, y: 9, z: (start + end) / 2, sx: halfW - 4, sy: 3, sz: (start - end) / 2 - 4 }], count: 160, life: 6, velocity: [0.6, -1.2, 0.3], spread: [0.6, 0.3, 0.6], size: 0.32, color: '#ffc6e2', intensity: 1.2, seed: 70 }))
  } else if (t === 'ice' || t === 'crystal') {
    const a = M(t === 'ice' ? '#bdefff' : '#b07aff', { rough: 0.1, metal: 0.1, flat: true })
    const b = M(t === 'ice' ? '#7fd8ff' : '#7b3fe0', { rough: 0.15, flat: true })
    const glowM = neon(t === 'ice' ? '#7af0ff' : '#e06aff', 2.4)
    add((s, k) => {
      const h = 3 + s.r * 4
      cone(g, k % 3 ? a : b, 1.1, h, s.x, h / 2, s.z, 6, s.ry, deg(6), 0)
      cone(g, a, 0.7, h * 0.6, s.x + 1.2, h * 0.3, s.z + 0.5, 6, s.ry, deg(-20), deg(-18))
      cone(g, b, 0.6, h * 0.5, s.x - 1.1, h * 0.25, s.z - 0.4, 6, s.ry, deg(16), deg(22))
      if (k % 4 === 0) mesh(g, gemGeo, glowM, s.x, h + 1.4, s.z).scale.setScalar(0.5)
      solid(1, h / 2, 1, s.x, h / 2, s.z)
    })
    emitters.push(createEmitter(scene, { boxes: [{ x: 0, y: 6, z: (start + end) / 2, sx: halfW - 4, sy: 5, sz: (start - end) / 2 - 4 }], count: 180, life: 5, velocity: [0, t === 'ice' ? -1 : 0.6, 0], spread: [0.4, 0.2, 0.4], size: 0.18, sprite: t === 'ice' ? 'dot' : 'sparkle', color: t === 'ice' ? '#ffffff' : '#e6b0ff', intensity: 1.6, twinkle: 4, seed: 71 }))
  } else if (t === 'gold' || t === 'ruins' || t === 'marble') {
    const stone = S(t === 'gold' ? '#ffcf3a' : t === 'marble' ? '#f2f2f8' : '#9a9a7a', { rough: t === 'gold' ? 0.35 : 0.7, metal: t === 'gold' ? 0.4 : 0 })
    const cap = S(t === 'gold' ? '#fff08a' : t === 'marble' ? '#c8c8d8' : '#6a7a3a', { rough: 0.5 })
    add((s, k) => {
      const h = 4 + s.r * 5
      const broken = k % 3 === 0
      const hh = broken ? h * 0.5 : h
      if (t === 'marble') cyl(g, stone, 0.8, 0.9, hh, s.x, 0.6, s.z, 14)
      else box(g, stone, 1.6, hh, 1.6, s.x, 0.6, s.z, s.ry)
      box(g, cap, 2.4, 0.6, 2.4, s.x, 0, s.z, s.ry)
      if (!broken) box(g, cap, 2.2, 0.6, 2.2, s.x, hh + 0.6, s.z, s.ry)
      else box(g, stone, 1.4, 1.2, 1.4, s.x + 1.6, 0, s.z + 0.5, s.ry + 0.6, deg(12)) // toppled chunk
      if (t === 'gold' && k % 2) {
        for (let c = 0; c < 4; c++) cyl(g, M('#ffd23a', { rough: 0.3, metal: 0.7 }), 0.5, 0.5, 0.14, s.x - 2, c * 0.15, s.z + 1.6, 16)
      }
      solid(1, hh / 2 + 0.3, 1, s.x, hh / 2 + 0.3, s.z, s.ry)
    })
    if (t === 'gold') emitters.push(createEmitter(scene, { boxes: [{ x: 0, y: 4, z: (start + end) / 2, sx: halfW - 4, sy: 3, sz: (start - end) / 2 - 4 }], count: 120, life: 3, velocity: [0, 0.8, 0], spread: [0.2, 0.3, 0.2], size: 0.22, sprite: 'sparkle', color: '#ffe36a', intensity: 2.2, twinkle: 6, seed: 72 }))
  } else if (t === 'lava' || t === 'spikes') {
    const rock = M(t === 'lava' ? '#3a2a28' : '#4a1018', { rough: 0.85, flat: true })
    const hot = neon(t === 'lava' ? '#ff6a1a' : '#ff2a3a', 2.2)
    add((s, k) => {
      const h = 3 + s.r * 5
      cone(g, rock, 1.6, h, s.x, h / 2, s.z, 5, s.ry)
      cone(g, rock, 0.9, h * 0.6, s.x + 1.6, h * 0.3, s.z + 0.6, 5, s.ry, 0, deg(-14))
      if (k % 2 === 0) {
        const pool = cyl(g, hot, 1.8, 1.8, 0.06, s.x - 2.4, 0.01, s.z - 1, 18)
        pool.scale.set(1, 1, 0.7)
      }
      solid(1.2, h / 2, 1.2, s.x, h / 2, s.z)
    })
    emitters.push(createEmitter(scene, { boxes: [{ x: 0, y: 0.5, z: (start + end) / 2, sx: halfW - 4, sy: 0.3, sz: (start - end) / 2 - 4 }], count: 160, life: 3.2, velocity: [0, 2.4, 0], spread: [0.5, 0.8, 0.5], size: 0.2, sprite: 'sparkle', color: t === 'lava' ? '#ff8a2a' : '#ff3a4a', intensity: 2.6, twinkle: 8, seed: 73 }))
  } else if (t === 'rainbow') {
    const cols = ['#ff4a4a', '#ff9a1f', '#ffe14a', '#5bff6a', '#3fa2ff', '#a35bff']
    add((s, k) => {
      if (k % 2) {
        // Cloud puff.
        const w = S('#ffffff', { rough: 0.9 })
        ball(g, w, 1.6, s.x, 1.2, s.z)
        ball(g, w, 1.2, s.x + 1.6, 1, s.z + 0.3)
        ball(g, w, 1.1, s.x - 1.5, 0.9, s.z - 0.2)
        solid(2.4, 1, 1.4, s.x, 1, s.z)
        return
      }
      // Rainbow arch: six coloured bands of boxes along a half circle.
      cols.forEach((c, b) => {
        const r = 4.6 - b * 0.55
        for (let a = 0; a <= 12; a++) {
          const t2 = (a / 12) * Math.PI
          box(g, M(c, { rough: 0.5 }), 0.62, 0.62, 0.7, s.x + Math.cos(t2) * r, Math.sin(t2) * r, s.z, 0, 0, t2)
        }
      })
      solid(0.6, 1, 0.6, s.x - 4.3, 1, s.z)
      solid(0.6, 1, 0.6, s.x + 4.3, 1, s.z)
    })
  } else if (t === 'space') {
    const planetCols = ['#ff7ad9', '#7af0ff', '#ffd23a', '#a35bff']
    add((s, k) => {
      const h = 3 + s.r * 4
      box(g, S('#2a3a7a', { rough: 0.5 }), 1.4, h, 1.4, s.x, 0, s.z, s.ry)
      mesh(g, gemGeo, neon(planetCols[k % 4], 2.2), s.x, h + 1.4, s.z).scale.setScalar(0.9 + s.r * 0.6)
      solid(0.7, h / 2, 0.7, s.x, h / 2, s.z, s.ry)
    })
    emitters.push(createEmitter(scene, { boxes: [{ x: 0, y: 8, z: (start + end) / 2, sx: halfW - 2, sy: 6, sz: (start - end) / 2 - 2 }], count: 220, life: 4, velocity: [0, 0.1, 0], spread: [0.1, 0.1, 0.1], size: 0.25, sprite: 'sparkle', color: '#ffffff', intensity: 2.4, twinkle: 5, seed: 74 }))
  }
  // A few rocks everywhere.
  const rock = M(zone.trim, { rough: 0.85, flat: true })
  for (let k = 0; k < 8; k++) {
    const x = (rand() * 2 - 1) * (halfW - 4)
    const z = end + 4 + rand() * (start - end - 8)
    if (Math.abs(x) < 6 || (Math.abs(x - house.x) < 12 && Math.abs(z - house.z) < 10)) continue
    const s = 0.6 + rand() * 1.2
    mesh(g, rockGeo, rock, x, s * 0.3, z, rand() * 6, rand() * 6).scale.set(s * 1.4, s * 0.8, s * 1.1)
  }
}
