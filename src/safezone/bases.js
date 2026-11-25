import { Color, ExtrudeGeometry, Group, Shape } from 'three'
import { BASE_SKINS, SAFE_ZONE, RARITIES } from '../config.js'
import { mulberry32 } from '../textures.js'
import { M, S, box, boxC, mesh, bakeInto, solidLocal, solidRamp, deg } from './kit.js'
import { strokeText, roundRect, short } from './text.js'
import { buildFighter, fighterLook, fighterLabel, rollRarity } from './fighters.js'

// Player bases (screenshots 1, 7-14). Each plot is 20 x 30 m with its entrance
// facing the hub. A base has 1-4 stacked floors on pink pillars; each floor has
// a red carpet down the middle and 5 slot pedestals per side (cyan rims), with
// an orange upgrade sign and a green collect pad per slot. Switchback stairs
// behind the base climb from floor to floor in two lanes (so a flight never
// runs under the next one). Your own base also has the Base Upgrade sign, the
// control board and the floating house marker. Level 0 = an empty plot.
//
// Local frame: x across (-10..10), z from the entrance (0) to the back (30);
// world = (plot.x + x, y, frontZ + z).

const B = SAFE_ZONE.bases
const C = SAFE_ZONE.colors
const HW = B.width / 2
const D = B.depth
const FH = B.floorHeight
const floorY = (k) => 0.4 + k * FH
const SLOT_X = HW - 3.4 // slot pedestal centres, either side of the carpet
const slotZ = (i) => 3.6 + (i * (D - 7.2)) / (B.slotsPerSide - 1)
const PAD_X = 2.6 // collect pads, between the carpet (|x| < 2) and the signs
const SIGN_X = 3.35 // upgrade signs, leaning back toward the pedestals
const LANDING_W = 3
const STEP_RUN = B.width - 2 * LANDING_W // stair flight between the two landings

export function buildBases(scene, signs, labels) {
  const out = { auras: [], collectPads: [], houseIcons: [], homeZone: null, mySlots: [] }
  B.plots.forEach((plot, pi) => buildBase(scene, signs, labels, plot, pi, out))
  return out
}

function buildBase(scene, signs, labels, plot, index, out) {
  const g = new Group()
  g.position.set(plot.x, 0, B.frontZ)
  const frame = { x: plot.x, z: B.frontZ, yaw: 0 }
  const rand = mulberry32(1000 + index * 97)

  if (!plot.level) {
    // Empty plot: pale blue checker slab just above the grass, bevelled white rim.
    box(g, S(C.emptyPlot, { rough: 0.5 }), B.width - 0.6, 0.08, D - 0.6, 0, 0, D / 2)
    box(g, S('#e8f6ff', { rough: 0.5 }), B.width, 0.05, D, 0, 0, D / 2)
    bakeInto(scene, g, false)
    return
  }

  const lav = S(C.base, { rough: 0.55 })
  const lavLight = S('#e2ddff', { rough: 0.5 })
  // Self-lit so the rims glow like neon strips. Your base gets its own instance (Base Skins recolour it).
  const trim = M(C.baseTrim, { rough: 0.3, emissive: C.baseTrim, ei: 1.3, ...(plot.mine && { mine: 1 }) })
  const pink = S(C.pillar, { rough: 0.5 })
  const white = S(C.cap, { rough: 0.45 })
  const carpet = S(C.carpet, { rough: 0.95 })
  const orange = M('#ff7a1a', { rough: 0.45 })
  const green = M('#3fe04a', { rough: 0.45 })
  const floors = plot.level

  for (let k = 0; k < floors; k++) {
    const y = floorY(k)
    // Slab (ground floor sits on the grass; upper floors are 0.6 m plates).
    const thick = k === 0 ? 0.4 : 0.6
    box(g, lav, B.width, thick, D, 0, y - thick, D / 2)
    solidLocal(frame, B.width, thick, D, 0, y - thick, D / 2)
    // Cyan rim, outside the slab edges (front/back full width + corners, sides between).
    box(g, trim, B.width + 0.6, 0.26, 0.3, 0, y - 0.11, -0.15)
    box(g, trim, B.width + 0.6, 0.26, 0.3, 0, y - 0.11, D + 0.15)
    for (const s of [-1, 1]) box(g, trim, 0.3, 0.26, D, s * (HW + 0.15), y - 0.11, D / 2)
    // Carpet down the middle.
    box(g, carpet, 4, 0.05, D - 1.2, 0, y, D / 2)
    // Side walls (pink, lavender inset panels on the inside) and the back wall with a stair gap.
    for (const s of [-1, 1]) {
      box(g, pink, 0.6, 1.1, D, s * (HW - 0.3), y, D / 2)
      box(g, white, 0.72, 0.16, D, s * (HW - 0.3), y + 1.1, D / 2)
      for (let i = 0; i < 5; i++) box(g, lavLight, 0.04, 0.6, D / 5 - 1.3, s * (HW - 0.62), y + 0.25, D / 10 + (i * D) / 5)
      solidLocal(frame, 0.6, 1.3, D, s * (HW - 0.3), y, D / 2)
    }
    // Back wall runs between the side walls' inner faces, leaving a gap at this floor's
    // stair landing (none on a one-floor base). Its white top sits 2 cm lower than the
    // side walls' so the two tops never share a plane where they meet.
    const gapSide = floors === 1 ? 0 : k % 2 === 0 ? -1 : 1
    const inner = HW - 0.6
    const a = gapSide < 0 ? -HW + LANDING_W : -inner
    const b = gapSide > 0 ? HW - LANDING_W : inner
    box(g, pink, b - a, 1.1, 0.6, (a + b) / 2, y, D - 0.3)
    box(g, white, b - a, 0.14, 0.72, (a + b) / 2, y + 1.1, D - 0.3)
    solidLocal(frame, b - a, 1.3, 0.6, (a + b) / 2, y, D - 0.3)
    if (k > 0) {
      // Upper floors get a front railing with a white top so nobody walks off the edge.
      box(g, pink, inner * 2, 1.1, 0.5, 0, y, 0.25)
      box(g, white, inner * 2, 0.14, 0.62, 0, y + 1.1, 0.25)
      solidLocal(frame, B.width - 1.2, 1.3, 0.5, 0, y, 0.25)
    }

    // Slots.
    for (const side of [-1, 1]) {
      for (let i = 0; i < B.slotsPerSide; i++) {
        const sx = side * SLOT_X
        const sz = slotZ(i)
        const live = plot.mine && k === 0 // your ground floor: slots driven by base/mybase.js
        buildSlot(g, signs, { lav, lavLight, trim, orange, green }, sx, y, sz, side, k, i, rand, live)
        solidLocal(frame, 3.2, 0.42, 3.2, sx, y, sz)
        if (live) {
          out.mySlots.push({ i: out.mySlots.length, x: plot.x + sx, y, z: B.frontZ + sz, side, padX: plot.x + side * PAD_X, signX: plot.x + side * SIGN_X, faceYaw: side < 0 ? Math.PI / 2 : -Math.PI / 2 })
          continue
        }
        const filled = !plot.mine && rand() < B.fill
        if (!filled) continue
        const ri = rollRarity(rand, k * 0.35 + (plot.mine ? -0.6 : 0))
        buildFighter(g, fighterLook(rand), sx, y + 0.42, sz, side < 0 ? Math.PI / 2 : -Math.PI / 2, 1)
        const lab = fighterLabel(rand, ri)
        labels.add(lab.lines, plot.x + sx, y + 3.5, B.frontZ + sz, lab.lines.length * 0.42)
        if (RARITIES[ri].aura) out.auras.push({ x: plot.x + sx, y: y + 1.2, z: B.frontZ + sz, color: RARITIES[ri].color })
        if (plot.mine) out.collectPads.push({ x: plot.x + side * PAD_X, y, z: B.frontZ + sz })
      }
    }

    // Stairs up to the next floor (behind the back wall).
    if (k < floors - 1) buildFlight(g, frame, { pink, white }, k)
  }
  // Landings for every floor (stair heads), behind the back edge.
  for (let k = 0; k < floors; k++) {
    if (floors === 1) break
    const y = floorY(k)
    const sideX = (k % 2 === 0 ? -1 : 1) * (HW - LANDING_W / 2)
    const thick = k === 0 ? 0.4 : 0.5
    box(g, lav, LANDING_W, thick, 6, sideX, y - thick, D + 3)
    box(g, trim, LANDING_W + 0.3, 0.26, 0.3, sideX, y - 0.11, D + 6.15)
    solidLocal(frame, LANDING_W, thick, 6, sideX, y - thick, D + 3)
    // Guard wall on the outer end of the landing.
    const s = k % 2 === 0 ? -1 : 1
    box(g, pink, 0.5, 1.1, 6, s * (HW - 0.25), y, D + 3)
    solidLocal(frame, 0.5, 1.3, 6, s * (HW - 0.25), y, D + 3)
  }

  // Pillars: corners and mid-sides, through every floor, rising above the top one.
  const topY = floorY(floors - 1) + 4.2
  for (const px of [-1, 1]) {
    for (const pz of [0.3, D / 2, D - 0.3]) {
      const x = px * (HW + 0.25)
      box(g, pink, 1.3, topY, 1.3, x, 0, pz)
      for (let k = 0; k < floors; k++) box(g, white, 1.5, 0.35, 1.5, x, floorY(k) + 1.4, pz) // white band
      box(g, white, 1.8, 1.8, 1.8, x, topY, pz) // cap
      solidLocal(frame, 1.3, topY, 1.3, x, 0, pz)
    }
  }
  // Pink overhead beams between the pillars at each upper floor (the "stacked shelves" look).
  for (let k = 1; k < floors; k++) {
    const y = floorY(k) - 0.6
    for (const px of [-1, 1]) box(g, pink, 0.8, 0.5, D, px * (HW + 0.25), y - 0.5, D / 2)
  }

  buildEntrance(scene, g, signs, labels, plot, frame, out)
  if (plot.mine) {
    // World matrices of the two board panels (taken before baking flattens the groups).
    g.updateMatrixWorld(true)
    for (const k of ['upgrade', 'controls']) out.boards[k].matrix = out.boards[k].panel.matrixWorld.clone()
  }
  const baked = bakeInto(scene, g, true)
  if (plot.mine) out.skin = makeSkinner(baked, trim)
}

// Base Skins: the baked base keeps each surface's colour as vertex colours, so a skin is a
// recolour of the vertices that carry one of the Default palette's colours (floor, inset panels,
// pillars + walls, carpet, white caps) plus the rims' own material. setSkin(skin) applies one.
function makeSkinner(root, trim) {
  const def = BASE_SKINS[0]
  const roles = ['floor', 'inset', 'pillar', 'carpet', 'cap']
  const ref = roles.map((r) => new Color(def[r]))
  const targets = [] // { attr, lists: [indices per role] }
  root.traverse((o) => {
    const attr = o.isMesh && o.geometry.attributes.color
    if (!attr) return
    const lists = roles.map(() => [])
    for (let i = 0; i < attr.count; i++) {
      const r = attr.getX(i)
      const g = attr.getY(i)
      const b = attr.getZ(i)
      const k = ref.findIndex((c) => Math.abs(c.r - r) + Math.abs(c.g - g) + Math.abs(c.b - b) < 1e-4)
      if (k >= 0) lists[k].push(i)
    }
    if (lists.some((l) => l.length)) targets.push({ attr, lists })
  })
  const col = new Color()
  return {
    setSkin(skin) {
      roles.forEach((role, k) => {
        col.set(skin[role] ?? def[role])
        for (const t of targets) for (const i of t.lists[k]) t.attr.setXYZ(i, col.r, col.g, col.b)
      })
      for (const t of targets) t.attr.needsUpdate = true
      trim.color.set(skin.trim ?? def.trim)
      trim.emissive.set(skin.trim ?? def.trim)
    },
  }
}

function buildSlot(g, signs, mats, sx, y, sz, side, floor, i, rand, live = false) {
  const { lav, lavLight, trim, orange, green } = mats
  // Pedestal: plinth + top, with a glowing cyan frame standing proud of the top.
  box(g, lav, 3.8, 0.12, 3.8, sx, y, sz)
  box(g, lavLight, 3.2, 0.3, 3.2, sx, y + 0.12, sz)
  for (const s of [-1, 1]) {
    box(g, trim, 3.6, 0.34, 0.2, sx, y + 0.12, sz + s * 1.7)
    box(g, trim, 0.2, 0.34, 3.2, sx + s * 1.7, y + 0.12, sz)
  }
  // Upgrade sign: an orange board leaning back, facing the carpet.
  const level = 1 + floor * 2 + Math.floor(rand() * 4)
  const price = short(Math.round(5400 * Math.pow(2.6, level - 1 + floor * 1.5)))
  const sg = new Group()
  sg.position.set(side * SIGN_X, y, sz)
  sg.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2 // face the carpet
  g.add(sg)
  const board = new Group()
  board.position.set(0, 0.28, 0)
  board.rotation.x = deg(-55)
  sg.add(board)
  box(board, orange, 3.0, 1.1, 0.16, 0, 0, 0)
  box(board, M('#c94a0c'), 3.2, 0.12, 0.2, 0, -0.06, 0)
  if (!live) signs.plane(board, 2.9, 1.0, 290, 100, (ctx, w, h) => paintUpgrade(ctx, w, h, price, level), 0, 0.55, 0.1, 0, 0, `up${price}${level}`)
  box(sg, M('#c94a0c'), 3.0, 0.22, 0.5, 0, 0, -0.05) // foot
  // Collect pad on the floor between the sign and the carpet.
  const cash = short(Math.round(1e6 * Math.pow(3, floor) * (1 + rand() * 4)))
  box(g, green, 1.05, 0.12, 3.0, side * PAD_X, y, sz)
  box(g, M('#1f9a2c'), 1.15, 0.06, 3.1, side * PAD_X, y, sz)
  if (!live) signs.plane(g, 0.95, 2.6, 80, 220, (ctx, w, h) => paintPad(ctx, w, h, cash), side * PAD_X, y + 0.15, sz, side < 0 ? 0 : Math.PI, -Math.PI / 2, `pad${cash}${side}`)
}

// Flight k climbs from floor k's landing to floor k+1's, in lane k % 2.
function buildFlight(g, frame, { pink, white }, k) {
  const y0 = floorY(k)
  const y1 = floorY(k + 1)
  const steps = 18
  const run = STEP_RUN / steps
  const rise = (y1 - y0) / steps
  const dir = k % 2 === 0 ? 1 : -1 // even flights climb toward +x
  const laneZ = D + (k % 2 === 0 ? 1.5 : 4.5)
  const startX = -dir * (STEP_RUN / 2)
  for (let i = 0; i < steps; i++) {
    const x = startX + dir * (i + 0.5) * run
    const top = y0 + (i + 1) * rise
    box(g, i % 2 ? pink : white, run, rise + 0.35, 2.6, x, top - rise - 0.35, laneZ)
  }
  // Stringers + handrail along both sides of the flight.
  const len = Math.hypot(STEP_RUN, y1 - y0)
  const pitch = Math.atan2(y1 - y0, STEP_RUN) * dir
  const midY = (y0 + y1) / 2
  for (const s of [-1, 1]) {
    const z = laneZ + s * 1.4
    const st = new Group()
    st.position.set(0, midY, z)
    st.rotation.z = pitch
    g.add(st)
    box(st, pink, len, 0.5, 0.2, 0, -0.45, 0)
    box(st, white, len, 0.14, 0.14, 0, 0.95, 0)
    for (let p = -3; p <= 3; p++) box(st, pink, 0.12, 0.95, 0.12, (p * len) / 7, 0, 0, 0, 0, -pitch)
  }
  // The walk surface runs through the middle of each step's rise (feet never sink a whole step).
  solidRamp(frame, startX, y0 + rise / 2, -startX, y1 + rise / 2, laneZ, 2.6)
}

// Entrance dressing: owner head-shot + label on every base; your base also gets
// the Base Upgrade sign, the control board and the floating house icon.
function buildEntrance(scene, g, signs, labels, plot, frame, out) {
  // Floating head-shot of the owner (blocky head with shades and hair).
  const hx = 4.2
  const hy = 3.2
  const hz = -2.2
  const head = new Group()
  head.position.set(hx, hy, hz)
  head.rotation.y = Math.PI // face the hub (-z)
  g.add(head)
  box(head, M('#ffd23a', { rough: 0.5 }), 1.4, 1.4, 1.4, 0, 0, 0)
  box(head, M('#2b2b30', { rough: 0.3 }), 1.2, 0.28, 0.1, 0, 0.82, 0.72)
  box(head, M('#7a3cff', { rough: 0.15, metal: 0.3 }), 0.5, 0.22, 0.06, -0.3, 0.82, 0.79)
  box(head, M('#7a3cff', { rough: 0.15, metal: 0.3 }), 0.5, 0.22, 0.06, 0.3, 0.82, 0.79)
  box(head, M('#d0461b', { rough: 0.6 }), 1.55, 0.5, 1.5, 0, 1.25, -0.05)
  box(head, M('#d0461b', { rough: 0.6 }), 0.5, 0.9, 1.4, 0.6, 0.9, -0.1, 0, 0, deg(-20))
  box(head, M('#1d2a44', { rough: 0.6 }), 1.8, 0.7, 1.1, 0, -0.75, -0.05)
  box(head, M('#9a4a3a'), 0.4, 0.07, 0.05, 0, 0.35, 0.72)
  if (!plot.mine) {
    labels.add(
      [
        { t: `@${plot.owner}`, px: 40, color: '#ffffff' },
        { t: `Cash Multi: x${plot.multi}`, px: 40, color: '#ffe14a' },
      ],
      plot.x + hx,
      hy - 2.3,
      B.frontZ + hz,
      0.95,
    )
    return
  }
  // Your base: the owner label (live Cash Multi) and both board faces are drawn by base/board.js.
  const boards = { label: { x: plot.x + hx, y: hy - 2.3, z: B.frontZ + hz } }
  out.boards = boards

  const pink = S(C.pillar, { rough: 0.5 })
  const white = S(C.cap, { rough: 0.45 })
  // Base Upgrade sign (left of the entrance): pink frame on two legs, panel tilted to the hub.
  const up = new Group()
  up.position.set(7.2, 0, -4.5)
  up.rotation.y = Math.PI + deg(12)
  g.add(up)
  for (const s of [-1, 1]) box(up, pink, 0.5, 1.4, 0.5, s * 2.8, 0, 0)
  const upPanel = tiltedPanel(up, 2.5)
  boxC(upPanel, pink, 6.6, 2.4, 0.4, 0, 0, 0)
  boxC(upPanel, white, 6.9, 0.2, 0.5, 0, 1.3, 0)
  boards.upgrade = { panel: upPanel, w: 6.0, h: 2.0, z: 0.23 }
  solidLocal(frame, 6.6, 3.6, 1, 7.2, 0, -4.5)
  // Control board (right of the entrance): Auto Collect / Upgrade All / Place Best / Upgrade Max All.
  const cb = new Group()
  cb.position.set(-7.2, 0, -4.5)
  cb.rotation.y = Math.PI + deg(-12)
  g.add(cb)
  for (const s of [-1, 1]) box(cb, pink, 0.5, 1.4, 0.5, s * 3.2, 0, 0)
  const cbPanel = tiltedPanel(cb, 2.7)
  boxC(cbPanel, pink, 7.4, 2.8, 0.4, 0, 0, 0)
  boxC(cbPanel, white, 7.7, 0.2, 0.5, 0, 1.5, 0)
  boards.controls = { panel: cbPanel, w: 6.9, h: 2.5, z: 0.23 }
  solidLocal(frame, 7.4, 4, 1, -7.2, 0, -4.5)

  // Floating house icon over the entrance (animated by the safe zone loop).
  const icon = buildHouseIcon()
  icon.scale.setScalar(1.7)
  icon.position.set(plot.x, floorY(plot.level - 1) + 11, B.frontZ - 1)
  icon.rotation.y = Math.PI // front faces the hub
  icon.userData.y = icon.position.y
  scene.add(icon)
  out.houseIcons.push(icon)
  out.homeZone = { x: plot.x, z: B.frontZ + D / 2, hw: HW, hd: D / 2 }
}

// A sign panel leaning back 15 degrees, centred `y` m up its stand.
function tiltedPanel(parent, y) {
  const p = new Group()
  p.position.set(0, y, 0)
  p.rotation.x = deg(-15)
  parent.add(p)
  return p
}

function buildHouseIcon() {
  const s = new Shape()
  s.moveTo(-2.2, -2)
  s.lineTo(2.2, -2)
  s.lineTo(2.2, 0.9)
  s.lineTo(0, 2.9)
  s.lineTo(-2.2, 0.9)
  s.closePath()
  const door = new Shape()
  door.moveTo(-0.7, -2)
  door.lineTo(0.7, -2)
  door.lineTo(0.7, -0.2)
  door.absarc(0, -0.2, 0.7, 0, Math.PI, false)
  door.closePath()
  const front = new ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.16, bevelSegments: 3 })
  front.center()
  const doorGeo = new ExtrudeGeometry(door, { depth: 0.2, bevelEnabled: false })
  const outline = new ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.55, bevelSegments: 2 })
  outline.center()
  const g = new Group()
  mesh(g, outline, M('#2a62e0', { rough: 0.35, emissive: '#1d4fd6', ei: 0.45 }), 0, 0, -0.35)
  mesh(g, front, M('#3d8bff', { rough: 0.25, emissive: '#2a6bff', ei: 0.6 }))
  const d = mesh(g, doorGeo, M('#1752c9', { rough: 0.3 }), 0, -0.45, 0.42)
  d.scale.setScalar(0.95)
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
  return g
}

// --- Sign painters ------------------------------------------------------------------------
function paintUpgrade(ctx, w, h, price, level) {
  const gr = ctx.createLinearGradient(0, 0, 0, h)
  gr.addColorStop(0, '#ff9b3d')
  gr.addColorStop(1, '#ff6a12')
  ctx.fillStyle = gr
  roundRect(ctx, 2, 2, w - 4, h - 4, 14)
  ctx.fill()
  // Up-arrow badge.
  ctx.fillStyle = '#2a9dff'
  roundRect(ctx, 10, 18, 64, 64, 12)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(42, 28)
  ctx.lineTo(64, 52)
  ctx.lineTo(50, 52)
  ctx.lineTo(50, 72)
  ctx.lineTo(34, 72)
  ctx.lineTo(34, 52)
  ctx.lineTo(20, 52)
  ctx.closePath()
  ctx.fill()
  strokeText(ctx, `$${price}`, 180, 38, 46, '#ffffff', { outline: '#7a2a00', ow: 9, maxW: 190 })
  strokeText(ctx, `Level ${level} > Level ${level + 1}`, 180, 78, 24, '#ffffff', { outline: '#7a2a00', ow: 6, maxW: 190 })
}

function paintPad(ctx, w, h, cash) {
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.rotate(-Math.PI / 2)
  strokeText(ctx, `$${cash}`, 0, 0, 52, '#ffffff', { outline: '#0e5a17', ow: 10, maxW: h - 16 })
  ctx.restore()
}
