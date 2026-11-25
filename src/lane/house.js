import { Group } from 'three'
import { M, S, box, bakeInto, solidLocal } from '../safezone/kit.js'
import { strokeText, roundRect } from '../safezone/text.js'

// A guardian's base (screenshots 5-14): a raised studded platform, walls with
// big white-framed windows on three sides, an open front toward the lane, a
// roof with ceiling light boxes, a red banner with "<Guardian>'s Base", a row
// of slot pedestals (purple-grey) with green pads in front, the guardian's
// bench at the back and a red carpet out to the lane.
//
// Local frame: x across the front (-W/2..W/2), z from the back (-D/2) to the
// open front (+D/2), y up from the ground. Placed at frame { x, z, yaw }.

export const HOUSE = { W: 16, D: 11, H: 8.6, floor: 0.4 } // tall enough for a guardian holding an orb overhead
const { W, D, H, floor: F } = HOUSE
const SLOT_XS = [-6, -3, 0, 3, 6]
const SLOT_Z = D / 2 - 3.6
const PAD_Z = D / 2 - 1.5
const SEAT_Z = -D / 2 + 2.0

export function buildHouse(scene, signs, zone, frame, carpetLen) {
  const g = new Group()
  g.position.set(frame.x, 0, frame.z)
  g.rotation.y = frame.yaw
  const [wallColor, pillarColor] = zone.house
  const wall = S(wallColor, { rough: 0.6 })
  const pillar = S(pillarColor, { rough: 0.55 })
  const floorM = S('#ffd25a', { rough: 0.6 })
  const step = S('#a9a3d6', { rough: 0.55 })
  const white = M('#ffffff', { rough: 0.4 })
  const dark = M('#3a2f6a', { rough: 0.6 })
  const light = M('#ffffff', { emissive: '#fff6e0', ei: 1.6 })
  const red = S('#e3141b', { rough: 0.6 })
  const slotM = S('#bdb7e6', { rough: 0.5 })
  const slotTop = M('#dcd8ff', { rough: 0.45 })
  const green = M('#2fe04a', { rough: 0.4, emissive: '#1fb83a', ei: 0.35 })
  const carpet = S('#e3141b', { rough: 0.9 })
  const wood = S('#a35a26', { rough: 0.8 })

  // Platform + front step.
  box(g, floorM, W, F, D, 0, 0, 0)
  solidLocal(frame, W, F, D, 0, 0, 0)
  box(g, step, W - 3, 0.2, 1.4, 0, 0, D / 2 + 0.7)
  solidLocal(frame, W - 3, 0.2, 1.4, 0, 0, D / 2 + 0.7)

  // Walls with windows. A wall run along local x at depth z (rotated for the sides).
  const wallRun = (parent, len, z, windows) => {
    const T = 0.8
    const y0 = 2.2
    const y1 = 6.2
    box(parent, wall, len, y0 - F, T, 0, F, z)
    box(parent, wall, len, H - y1, T, 0, y1, z)
    let x = -len / 2
    for (const [a, b] of windows) {
      box(parent, wall, a - x, y1 - y0, T, (x + a) / 2, y0, z)
      // White frame proud of both faces (deeper than the wall).
      box(parent, white, b - a + 0.5, 0.25, T + 0.3, (a + b) / 2, y0 - 0.12, z)
      box(parent, white, b - a + 0.5, 0.25, T + 0.3, (a + b) / 2, y1 - 0.13, z)
      for (const e of [a, b]) box(parent, white, 0.25, y1 - y0, T + 0.3, e, y0, z)
      box(parent, white, 0.16, y1 - y0, T + 0.2, (a + b) / 2, y0, z) // mullion
      x = b
    }
    box(parent, wall, len / 2 - x, y1 - y0, T, (x + len / 2) / 2, y0, z)
  }
  wallRun(g, W - 1.6, -D / 2 + 0.4, [[-6.4, -1.4], [1.4, 6.4]])
  solidLocal(frame, W, H, 0.8, 0, 0, -D / 2 + 0.4)
  for (const s of [-1, 1]) {
    const side = new Group()
    side.position.set(s * (W / 2 - 0.4), 0, 0)
    side.rotation.y = Math.PI / 2
    g.add(side)
    wallRun(side, D, 0, [[-2.6, 1.6]])
    solidLocal(frame, 0.8, H, D, s * (W / 2 - 0.4), 0, 0)
  }
  // Front pillars + header beam with the banner.
  for (const s of [-1, 1]) {
    box(g, pillar, 1.3, H - F, 1.3, s * (W / 2 - 0.45), F, D / 2 - 0.5)
    solidLocal(frame, 1.3, H, 1.3, s * (W / 2 - 0.45), 0, D / 2 - 0.5)
  }
  box(g, wall, W - 2.6, 1.7, 1.0, 0, H - 1.7, D / 2 - 0.5)
  box(g, red, W - 3.4, 1.4, 0.3, 0, H - 1.55, D / 2 + 0.1)
  signs.plane(g, W - 3.8, 1.25, 900, 92, (ctx, w, h) => paintBanner(ctx, w, h, `${zone.guardian.name}'s Base`), 0, H - 0.85, D / 2 + 0.28, 0, 0, `banner${zone.guardian.name}`)

  // Roof: slab with a white lip, ceiling light boxes underneath.
  box(g, wall, W + 1.2, 0.7, D + 1.2, 0, H, 0)
  solidLocal(frame, W + 1.2, 0.7, D + 1.2, 0, H, 0) // keeps the chase camera under the roof
  box(g, white, W + 1.6, 0.32, D + 1.6, 0, H - 0.08, 0)
  for (const x of [-4.5, 0, 4.5]) {
    for (const z of [-2, 2]) {
      box(g, dark, 2.6, 0.32, 1.1, x, H - 0.32, z)
      box(g, light, 2.1, 0.06, 0.6, x, H - 0.38, z)
    }
  }

  // Slots: pedestal row + green pad row.
  for (const x of SLOT_XS) {
    box(g, slotM, 2.1, 0.3, 2.1, x, F, SLOT_Z)
    box(g, slotTop, 1.7, 0.06, 1.7, x, F + 0.3, SLOT_Z)
    solidLocal(frame, 2.1, F + 0.36, 2.1, x, 0, SLOT_Z)
    box(g, green, 1.0, 0.1, 1.0, x, F, PAD_Z)
  }
  // Guardian's bench at the back.
  box(g, wood, 5, 1.0, 1.8, 0, F, SEAT_Z - 0.9)
  box(g, S('#c97a3a', { rough: 0.8 }), 5.3, 0.16, 2.0, 0, F + 1.0, SEAT_Z - 0.9)
  solidLocal(frame, 5, 1.16, 1.8, 0, F, SEAT_Z - 0.9)

  // Carpet out to the lane.
  if (carpetLen > 0) box(g, carpet, 3.2, 0.05, carpetLen, 0, 0, D / 2 + 1.4 + carpetLen / 2)

  bakeInto(scene, g, true)

  // --- Gameplay points (world space) ---
  const c = Math.cos(frame.yaw)
  const s = Math.sin(frame.yaw)
  const toWorld = (x, z) => ({ x: frame.x + x * c + z * s, z: frame.z - x * s + z * c })
  const toLocal = (wx, wz) => {
    const dx = wx - frame.x
    const dz = wz - frame.z
    return { x: dx * c - dz * s, z: dx * s + dz * c }
  }
  const seat = toWorld(0, SEAT_Z + 0.15)
  return {
    frame,
    y: F,
    frontYaw: frame.yaw,
    toWorld,
    toLocal,
    seat,
    seatFront: toWorld(0, SEAT_Z + 1.6),
    door: toWorld(0, D / 2 + 2.2),
    centre: toWorld(0, 0),
    slots: SLOT_XS.map((x) => ({ ...toWorld(x, SLOT_Z), y: F + 0.36, stand: toWorld(x, SLOT_Z + 2.0), pad: toWorld(x, PAD_Z) })),
    inside(wx, wz) {
      const l = toLocal(wx, wz)
      return Math.abs(l.x) < W / 2 && l.z > -D / 2 && l.z < D / 2 + 0.2
    },
  }
}

function paintBanner(ctx, w, h, text) {
  ctx.fillStyle = '#d0101a'
  roundRect(ctx, 2, 2, w - 4, h - 4, 12)
  ctx.fill()
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.transform(1, 0, -0.18, 1, 0, 0) // italic slant
  strokeText(ctx, text, 0, 2, 66, ['#ffffff', '#ffe6e6'], { outline: '#5a0008', ow: 12, maxW: w - 60 })
  ctx.restore()
}
