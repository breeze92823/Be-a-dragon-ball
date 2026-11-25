import { DodecahedronGeometry, Group } from 'three'
import { SAFE_ZONE } from '../config.js'
import { mulberry32 } from '../textures.js'
import { M, S, box, cyl, cylC, mesh, bakeInto, solid, deg } from './kit.js'
import { strokeText, DynLabel } from './text.js'

// The ground of the safe zone: the green studded hub, the desert (the lane
// area, filled in later) to the north, the tan studded walls, the SAFE ZONE
// marking on the hub edge, the red carpet out to the lane, and the desert
// dressing seen behind the shop row (stepped pyramids, cacti, logs, rocks, the
// orange event building with its countdown).

const Z = SAFE_ZONE
const C = Z.colors

export function buildGround(scene, signs) {
  const { minX, maxX, minZ, maxZ } = Z.hub
  const { height: WH, thick: WT } = Z.wall
  const g = new Group()

  // --- Floors (tops at y = 0; they meet edge to edge, never overlap) ---
  const hubW = maxX - minX
  const hubD = maxZ - minZ
  box(g, S(C.grass, { rough: 0.6 }), hubW, 1, hubD, (minX + maxX) / 2, -1, (minZ + maxZ) / 2)
  const desD = minZ - Z.desertEnd
  box(g, S(C.sand, { rough: 0.85 }), hubW, 1, desD, (minX + maxX) / 2, -1, (minZ + Z.desertEnd) / 2)
  solid(hubW / 2 + WT, 0.5, (maxZ - Z.desertEnd) / 2 + WT, 0, -0.5, (maxZ + Z.desertEnd) / 2)

  // --- Walls: tan studded blocks with a capping lip that overhangs both faces ---
  const wall = S(C.wall, { rough: 0.7 })
  const lip = S('#c98f4c', { rough: 0.7 })
  // Cross walls (south, desert end) butt into the side walls; their lip stops at the side
  // walls' lip instead of overlapping it, so the two lip tops never share a plane.
  const wallRun = (w, d, x, z, cross = false) => {
    box(g, wall, w, WH + 1, d, x, -1, z)
    box(g, lip, cross ? w - 0.5 : w + 0.5, 0.7, d + 0.5, x, WH, z)
    solid(w / 2, (WH + 1) / 2, d / 2, x, WH / 2 - 0.5, z)
  }
  const fullD = maxZ - Z.desertEnd + WT * 2
  const midZ = (maxZ + Z.desertEnd) / 2
  wallRun(WT, fullD, maxX + WT / 2, midZ)
  wallRun(WT, fullD, minX - WT / 2, midZ)
  wallRun(hubW, WT, 0, maxZ + WT / 2, true) // south (ends tucked inside the side walls)
  wallRun(hubW, WT, 0, Z.desertEnd - WT / 2, true) // far end of the desert
  // Low sand bank where the green meets the sand (reads as the hub's edge).
  for (const s of [-1, 1]) {
    const len = hubW / 2 - Z.laneExit.width / 2 - 1
    box(g, S('#e7c65a', { rough: 0.85 }), len, 0.18, 0.9, s * (Z.laneExit.width / 2 + 1 + len / 2), 0, minZ - 0.45)
  }

  // --- Red carpet out of the hub, down the lane ---
  const lane = Z.laneExit
  box(g, S(C.carpet, { rough: 0.9 }), lane.width, 0.06, minZ - Z.desertEnd, lane.x, 0, (minZ + Z.desertEnd) / 2)
  for (const s of [-1, 1]) box(g, M('#ffd23a', { rough: 0.35, metal: 0.4 }), 0.22, 0.1, minZ - Z.desertEnd, lane.x + s * (lane.width / 2 + 0.11), 0, (minZ + Z.desertEnd) / 2)
  // Red carpet strip in the sand along the shops (screenshots 2, 3, 17).
  box(g, S(C.carpet, { rough: 0.9 }), hubW - 30, 0.05, 4, 0, 0, minZ - 5)

  // --- SAFE ZONE text painted across the hub edge, a shield at each end ---
  signs.plane(g, 30, 5.2, 1500, 260, paintSafeZone, lane.x, 0.03, lane.textZ, 0, -Math.PI / 2)

  // --- Desert dressing ---
  const rand = mulberry32(77)
  const pyramid = (x, z, base, layers, ry) => {
    const a = S('#f3c94e', { rough: 0.8 })
    const b = S('#e29a33', { rough: 0.8 })
    for (let i = 0; i < layers; i++) {
      const w = base - i * (base / layers) * 0.95
      box(g, i % 2 ? b : a, w, 1.6, w, x, i * 1.6, z, ry)
      solid(w / 2, 0.8, w / 2, x, i * 1.6 + 0.8, z, ry)
    }
  }
  pyramid(34, -92, 16, 7, deg(10))
  pyramid(58, -70, 10, 5, deg(-20))
  pyramid(-18, -112, 13, 6, deg(32))
  pyramid(18, -122, 9, 4, 0)

  const cactus = (x, z, h, ry) => {
    const green = S('#33b23a', { rough: 0.65 })
    const tip = S('#5bdc4a', { rough: 0.65 })
    box(g, green, 1.1, h, 1.1, x, 0, z, ry)
    box(g, tip, 1.2, 0.3, 1.2, x, h, z, ry)
    const c = Math.cos(ry)
    const sn = Math.sin(ry)
    for (const [side, at, up] of [[-1, h * 0.38, h * 0.3], [1, h * 0.55, h * 0.25]]) {
      const ox = side * 1.1
      box(g, green, 1.2, 0.8, 0.8, x + c * ox * 0.75, at, z - sn * ox * 0.75, ry)
      box(g, green, 0.8, up, 0.8, x + c * ox * 1.2, at, z - sn * ox * 1.2, ry)
      box(g, tip, 0.9, 0.2, 0.9, x + c * ox * 1.2, at + up, z - sn * ox * 1.2, ry)
    }
    solid(0.6, h / 2, 0.6, x, h / 2, z)
  }
  for (let i = 0; i < 16; i++) {
    const x = (rand() * 2 - 1) * 62
    const z = Z.hub.minZ - 14 - rand() * 70
    if (Math.abs(x - lane.x) < 9) continue
    if (Math.hypot(x - Z.eventBuilding.x, z - Z.eventBuilding.z) < 13) continue
    cactus(x, z, 3.5 + rand() * 3, rand() * Math.PI)
  }

  const bark = M('#a35a26', { rough: 0.9 })
  const wood = M('#e9b26a', { rough: 0.8 })
  const ring = M('#c98a46', { rough: 0.8 })
  const log = (x, z, len, r, ry) => {
    const lg = new Group()
    lg.position.set(x, r * 0.9, z)
    lg.rotation.y = ry
    g.add(lg)
    cylC(lg, bark, r, r, len, 0, 0, 0, 14, 0, 0, Math.PI / 2)
    for (const s of [-1, 1]) {
      cylC(lg, wood, r * 0.92, r * 0.92, 0.06, s * (len / 2 + 0.03), 0, 0, 14, 0, 0, Math.PI / 2)
      cylC(lg, ring, r * 0.5, r * 0.5, 0.02, s * (len / 2 + 0.07), 0, 0, 14, 0, 0, Math.PI / 2)
    }
    solid(len / 2, r, r, x, r * 0.9, z, ry)
  }
  log(-7, -66, 5, 1, deg(80))
  log(9, -64, 4, 0.9, deg(-10))
  log(24, -70, 4.5, 0.95, deg(35))
  log(-28, -66, 4, 0.9, deg(70))
  log(44, -68, 3.6, 0.85, deg(-50))

  const rockGeo = new DodecahedronGeometry(1, 0)
  const rock = M('#8b9cc9', { rough: 0.85, flat: true })
  for (let i = 0; i < 14; i++) {
    const x = (rand() * 2 - 1) * 64
    const z = Z.hub.minZ - 10 - rand() * 70
    if (Math.abs(x - lane.x) < 7) continue
    const s = 0.8 + rand() * 1.6
    const r = mesh(g, rockGeo, rock, x, s * 0.3, z, rand() * 6, rand() * 6)
    r.scale.set(s * 1.4, s * 0.8, s * 1.1)
  }

  // --- Event building (orange two-storey frame with a countdown sign on top) ---
  const ev = Z.eventBuilding
  const orange = S('#ff9a1f', { rough: 0.55 })
  const tan = S('#f6d08a', { rough: 0.7 })
  const glass = M('#9fe3ff', { rough: 0.05, opacity: 0.45 })
  const W = 18
  const D = 12
  const H = 6
  const eg = new Group()
  eg.position.set(ev.x, 0, ev.z)
  g.add(eg)
  for (let f = 0; f < 2; f++) {
    const y = f * H
    box(eg, tan, W - 1, 0.5, D - 1, 0, y, 0) // floor
    box(eg, orange, W + 0.4, 0.8, D + 0.4, 0, y + H - 0.8, 0) // beam band
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(eg, orange, 1, H - 0.8, 1, (px * W) / 2, y, (pz * D) / 2)
    box(eg, tan, W - 1, H - 0.8, 0.5, 0, y, -D / 2 + 0.3) // back wall
    for (const s of [-1, 1]) box(eg, tan, 0.5, H - 0.8, D - 1, (s * (W - 1)) / 2 + s * -0.25, y, 0)
    // Front: glass panes between orange mullions.
    for (let i = 0; i < 3; i++) {
      const cx = -W / 3 + (i * W) / 3
      box(eg, glass, W / 3 - 1, H - 2.4, 0.12, cx, y + 1.2, D / 2 - 0.2)
      box(eg, orange, 0.4, H - 0.8, 0.5, cx + W / 6, y, D / 2 - 0.2)
    }
    box(eg, orange, W, 0.5, 0.6, 0, y + 0.6, D / 2 - 0.2) // sill
  }
  box(eg, orange, W + 1.2, 0.6, D + 1.2, 0, H * 2, 0) // roof slab
  solid(W / 2, H, D / 2, ev.x, H, ev.z)
  // Sign board on the roof.
  const signBlue = S('#2f6bff', { rough: 0.5 })
  box(eg, signBlue, 14, 4.4, 0.8, 0, H * 2 + 1.4, 0)
  for (const s of [-1, 1]) box(eg, orange, 0.6, 2, 0.6, s * 5, H * 2 + 0.6, 0)
  const countdown = new DynLabel(512, 160, 3.6, (ctx, w, h, text) => {
    strokeText(ctx, 'EVENT IN', w / 2, 50, 54, ['#ff6a6a', '#d01c2c'], { outline: '#ffffff', ow: 10 })
    strokeText(ctx, text, w / 2, 118, 62, '#ffffff', { outline: '#0b1a3a', ow: 12 })
  })
  const face = countdown.plane(11.5, 3.6)
  face.position.set(ev.x, H * 2 + 3.6, ev.z + 0.45)
  scene.add(face)

  bakeInto(scene, g, true)

  let remaining = ev.minutes * 60
  let shown = -1
  return {
    update(dt) {
      remaining -= dt
      if (remaining < 0) remaining += ev.minutes * 60
      const s = Math.ceil(remaining)
      if (s !== shown) {
        shown = s
        countdown.set(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
      }
    },
  }
}

// SAFE ZONE in chunky white letters with a navy drop and a cyan shield at each end.
function paintSafeZone(ctx, w, h) {
  const shield = (cx) => {
    ctx.save()
    ctx.translate(cx, h / 2)
    ctx.beginPath()
    ctx.moveTo(0, -96)
    ctx.bezierCurveTo(52, -86, 84, -76, 92, -70)
    ctx.bezierCurveTo(92, 10, 60, 70, 0, 104)
    ctx.bezierCurveTo(-60, 70, -92, 10, -92, -70)
    ctx.bezierCurveTo(-84, -76, -52, -86, 0, -96)
    ctx.closePath()
    ctx.lineWidth = 16
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    const gr = ctx.createLinearGradient(-90, -90, 90, 100)
    gr.addColorStop(0, '#7af4ff')
    gr.addColorStop(1, '#14a9e8')
    ctx.fillStyle = gr
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(0, -70)
    ctx.lineTo(0, 76)
    ctx.moveTo(-64, -44)
    ctx.lineTo(0, -44)
    ctx.lineWidth = 10
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.stroke()
    ctx.restore()
  }
  shield(110)
  shield(w - 110)
  for (let i = 10; i > 0; i -= 2) strokeText(ctx, 'SAFE ZONE', w / 2, h / 2 + i, 190, '#0b1a3a', { outline: '#0b1a3a', ow: 26 })
  strokeText(ctx, 'SAFE ZONE', w / 2, h / 2, 190, '#ffffff', { outline: '#0b1a3a', ow: 26 })
}
