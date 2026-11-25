import { M, S, box, cyl, cone, ball, solidLocal, deg } from '../safezone/kit.js'
import { neon } from '../propkit.js'

// Theme dressing for a guardian's base (house.js), one look per zone (ZONES[i].props):
// the desert tomb, the jungle hut, the ice hall, the crystal vault, the golden temple, the
// magma forge, the oni shrine, the marble temple, the cloud palace, the sakura pagoda, the
// star observatory and the overgrown ruin. Everything is added to the base's group before
// it is baked, so the dressing costs a few merged meshes, not one draw per prop.
// Returns where the torches burn (local x, y, z) and the colours of their flames and aura.
//
// Local frame (house.js): x across the front (-W/2..W/2), z from the back (-D/2) to the open
// front (+D/2), y up. The front corners outside the base hold the torches.

export const DECO = {
  desert: { flame: '#ff9a2a', aura: '#ffe2a0' },
  jungle: { flame: '#ffa03a', aura: '#b8ff7a' },
  ice: { flame: '#7af0ff', aura: '#ffffff' },
  crystal: { flame: '#d06aff', aura: '#e6b0ff' },
  gold: { flame: '#ffd23a', aura: '#fff2a0' },
  lava: { flame: '#ff6a1a', aura: '#ff9a3a' },
  spikes: { flame: '#ff3a3a', aura: '#ff6a6a' },
  marble: { flame: '#9ad8ff', aura: '#ffffff' },
  rainbow: { flame: '#ff7ad9', aura: '#fff3a6' },
  sakura: { flame: '#ffb0d4', aura: '#ffc6e2' },
  space: { flame: '#7af0ff', aura: '#ffffff' },
  ruins: { flame: '#9cff4a', aura: '#c8ff9a' },
}

export function dressHouse(g, zone, frame, dims, carpetLen) {
  const { W, D, H, F } = dims
  const kind = DECO[zone.props] ? zone.props : 'desert'
  const torches = []
  const [wallColor, trimColor] = zone.house
  const trim = S(trimColor, { rough: 0.5 })
  const flameCore = neon(DECO[kind].flame, 2.8)
  const front = D / 2
  const tx = W / 2 + 1.2 // torches just outside the front corners
  const tz = front + 1.4

  // A brazier: post, bowl, a glowing coal bed (the GPU flames rise from it).
  const brazier = (x, z, post, bowl, h = 2.4) => {
    box(g, post, 0.9, 0.3, 0.9, x, 0, z)
    box(g, post, 0.4, h, 0.4, x, 0.3, z)
    cyl(g, bowl, 0.7, 0.35, 0.5, x, h + 0.3, z, 10)
    cyl(g, flameCore, 0.5, 0.5, 0.06, x, h + 0.74, z, 10)
    solidLocal(frame, 0.9, h + 0.8, 0.9, x, 0, z)
    torches.push({ x, y: h + 0.85, z })
  }
  // Throne back behind the bench (the guardian sleeps against it), with a glowing emblem.
  const throne = (mat, emblem) => {
    box(g, mat, 5.6, 3.6, 0.3, 0, F + 1.16, -D / 2 + 0.95)
    box(g, trim, 6.0, 0.4, 0.4, 0, F + 4.76, -D / 2 + 0.95)
    if (emblem) cyl(g, emblem, 0.7, 0.7, 0.06, 0, F + 3.6, -D / 2 + 1.1, 20, 0, Math.PI / 2)
  }

  switch (kind) {
    case 'desert': {
      // Sandstone tomb: hieroglyph bands, obelisks, urns, a sun-disk throne, crenellated roof.
      const sand = S('#e8b860', { rough: 0.8 })
      const sand2 = S('#c8903a', { rough: 0.8 })
      const lapis = M('#2047c8', { rough: 0.4 })
      const gold = M('#ffcf3a', { rough: 0.3, metal: 0.6 })
      const turq = M('#2fd0c0', { rough: 0.4 })
      for (const s of [-1, 1]) {
        // Obelisk + brazier at each front corner.
        box(g, sand2, 1.6, 0.6, 1.6, s * (tx + 1.6), 0, tz - 0.6)
        box(g, sand, 1.0, 6.5, 1.0, s * (tx + 1.6), 0.6, tz - 0.6)
        cone(g, gold, 0.72, 1.2, s * (tx + 1.6), 7.7, tz - 0.6, 4, Math.PI / 4)
        for (let i = 0; i < 4; i++) box(g, i % 2 ? lapis : gold, 1.04, 0.12, 1.04, s * (tx + 1.6), 1.6 + i * 1.2, tz - 0.6)
        solidLocal(frame, 1.6, 7.2, 1.6, s * (tx + 1.6), 0, tz - 0.6)
        brazier(s * tx, tz + 1.2, sand2, gold)
        // Urns by the door.
        cyl(g, sand2, 0.35, 0.5, 0.9, s * (W / 2 - 2), F, front + 0.2, 10)
        cyl(g, turq, 0.3, 0.35, 0.25, s * (W / 2 - 2), F + 0.9, front + 0.2, 10)
      }
      // Hieroglyph band round the outside walls (blue / gold / turquoise tiles, proud of the wall).
      const glyph = [lapis, gold, turq, gold]
      for (let i = 0; i < 14; i++) box(g, glyph[i % 4], 0.6, 0.5 + (i % 3) * 0.15, 0.08, -W / 2 + 1.6 + i * 0.98, 6.6, -D / 2 - 0.05)
      for (const s of [-1, 1]) for (let i = 0; i < 9; i++) box(g, glyph[(i + 1) % 4], 0.08, 0.5 + (i % 3) * 0.15, 0.6, s * (W / 2 + 0.05), 6.6, -D / 2 + 1 + i * 1.1)
      // Crenellations along the roof edge.
      for (let i = 0; i < 9; i++) box(g, sand, 1.0, 0.7, 0.9, -W / 2 + 0.4 + i * 1.9, H + 0.7, front + 0.2)
      for (const s of [-1, 1]) for (let i = 0; i < 6; i++) box(g, sand, 0.9, 0.7, 1.0, s * (W / 2 + 0.2), H + 0.7, -D / 2 + 0.3 + i * 2.1)
      // Sun disk + wings on the roof over the banner.
      cyl(g, gold, 1.1, 1.1, 0.2, 0, H + 1.6, front + 0.1, 20, 0, Math.PI / 2)
      for (const s of [-1, 1]) box(g, lapis, 2.4, 0.45, 0.16, s * 1.9, H + 1.45, front + 0.1, 0, 0, s * -0.12)
      throne(sand2, neon('#ffd23a', 2.4))
      break
    }
    case 'jungle': {
      // Hut on stilts: thatched roof, log posts, hanging vines, skull totems.
      const thatch = S('#c8a050', { rough: 0.9 })
      const thatch2 = S('#a8803a', { rough: 0.9 })
      const log = M('#6a3a1a', { rough: 0.9 })
      const vine = M('#2d8a2a', { rough: 0.8 })
      const leaf = M('#3fbf3a', { rough: 0.7 })
      const bone = M('#f2ead2', { rough: 0.5 })
      for (const s of [-1, 1]) box(g, thatch, W / 2 + 1.6, 0.6, D + 2.4, s * (W / 4 + 0.4), H + 0.9 + 1.1, 0, 0, 0, s * -0.28)
      box(g, thatch2, 1.4, 0.7, D + 2.6, 0, H + 3.0, 0)
      for (const s of [-1, 1]) cyl(g, log, 0.55, 0.6, H - F, s * (W / 2 - 0.45), F, front - 0.5, 10)
      for (let i = 0; i < 14; i++) {
        const x = -W / 2 + 0.6 + i * 1.15
        const len = 0.8 + ((i * 37) % 7) * 0.25
        box(g, vine, 0.08, len, 0.08, x, H - len, front + 0.7)
        if (i % 3 === 0) box(g, leaf, 0.3, 0.12, 0.2, x, H - len, front + 0.75)
      }
      for (const s of [-1, 1]) {
        box(g, log, 0.3, 3.2, 0.3, s * (tx + 1.7), 0, tz - 0.4)
        ball(g, bone, 0.4, s * (tx + 1.7), 3.5, tz - 0.4, 10, 8)
        box(g, M('#1a1410'), 0.12, 0.12, 0.05, s * (tx + 1.7) - 0.14, 3.55, tz - 0.02)
        box(g, M('#1a1410'), 0.12, 0.12, 0.05, s * (tx + 1.7) + 0.14, 3.55, tz - 0.02)
        for (let k = 0; k < 4; k++) box(g, leaf, 0.7, 0.1, 0.25, s * (tx + 1.7), 2.6, tz - 0.4, (k / 4) * Math.PI, 0.5)
        solidLocal(frame, 0.6, 3.8, 0.6, s * (tx + 1.7), 0, tz - 0.4)
        brazier(s * tx, tz + 1.2, log, M('#4a3a2a', { rough: 0.8 }), 1.8)
        // Bushes against the walls.
        ball(g, leaf, 1.1, s * (W / 2 + 0.9), 0.6, -1, 10, 8)
        ball(g, vine, 0.8, s * (W / 2 + 0.7), 0.5, 1.5, 10, 8)
      }
      throne(log, neon('#9cff4a', 2.2))
      break
    }
    case 'ice': {
      // Ice hall: a snow-capped roof, icicles, crystal clusters, frosted throne.
      const snow = S('#ffffff', { rough: 0.9 })
      const ice = M('#aef0ff', { rough: 0.08, metal: 0.1, flat: true, emissive: '#2ab8ff', ei: 0.4 })
      const iceDark = M('#5fb8ff', { rough: 0.1, flat: true })
      box(g, snow, W + 1.8, 0.6, D + 1.8, 0, H + 0.62, 0)
      for (let i = 0; i < 6; i++) box(g, snow, 1.6 + (i % 2), 0.4, 1.4, -W / 2 + 1.5 + i * 2.6, H + 1.2, (i % 2) - 1)
      for (let i = 0; i < 22; i++) {
        const x = -W / 2 - 0.5 + i * ((W + 1) / 21)
        const len = 0.5 + ((i * 53) % 9) * 0.12
        cone(g, ice, 0.14, len, x, H - len / 2 - 0.1, front + 0.75, 5, 0, Math.PI)
      }
      const cluster = (x, z, s) => {
        cone(g, ice, 0.7 * s, 3.2 * s, x, 1.6 * s, z, 6, 0, deg(4))
        cone(g, iceDark, 0.5 * s, 2.2 * s, x + 0.7 * s, 1.0 * s, z + 0.3 * s, 6, 0, deg(-18), deg(-20))
        cone(g, ice, 0.4 * s, 1.8 * s, x - 0.7 * s, 0.8 * s, z - 0.2 * s, 6, 0, deg(16), deg(22))
      }
      for (const s of [-1, 1]) {
        cluster(s * (tx + 1.8), tz - 0.8, 1.2)
        solidLocal(frame, 1.6, 3.6, 1.6, s * (tx + 1.8), 0, tz - 0.8)
        brazier(s * tx, tz + 1.2, iceDark, ice)
        cluster(s * (W / 2 - 1.2), H + 0.9, 0.6)
      }
      throne(iceDark, neon('#7af0ff', 2.4))
      break
    }
    case 'crystal': {
      // Crystal vault: amethyst clusters on the roof and by the door, a glowing rune frieze.
      const cr = M('#e0a8ff', { rough: 0.1, flat: true, emissive: '#9a3aff', ei: 0.9 })
      const cr2 = M('#7b3fe0', { rough: 0.15, flat: true })
      const stone = S('#3a2468', { rough: 0.8 })
      const rune = neon('#e06aff', 2.6)
      const cluster = (x, y, z, s) => {
        cone(g, cr, 0.6 * s, 3 * s, x, y + 1.5 * s, z, 6)
        cone(g, cr2, 0.45 * s, 2 * s, x + 0.6 * s, y + 0.8 * s, z + 0.2 * s, 6, 0, deg(-15), deg(-25))
        cone(g, cr, 0.35 * s, 1.6 * s, x - 0.6 * s, y + 0.7 * s, z - 0.2 * s, 6, 0, deg(15), deg(25))
      }
      for (const s of [-1, 1]) {
        cluster(s * (W / 2 - 0.4), H + 0.4, front, 0.9)
        cluster(s * (W / 2 - 0.4), H + 0.4, -D / 2 + 0.6, 0.7)
        box(g, stone, 1.6, 0.6, 1.6, s * (tx + 1.7), 0, tz - 0.6)
        cluster(s * (tx + 1.7), 0.6, tz - 0.6, 1.1)
        solidLocal(frame, 1.6, 3.6, 1.6, s * (tx + 1.7), 0, tz - 0.6)
        brazier(s * tx, tz + 1.2, stone, cr2)
      }
      for (let i = 0; i < 10; i++) box(g, rune, 0.5, 0.12, 0.06, -W / 2 + 1.8 + i * 1.38, H - 2.05, front + 0.03, 0, 0, (i % 2 ? 1 : -1) * 0.6)
      throne(stone, rune)
      break
    }
    case 'gold': {
      // Golden temple: obelisks with gold caps, coin hoards, a sun disk, a gold-leaf throne.
      const goldM = M('#ffd23a', { rough: 0.22, metal: 0.2 })
      const sand = S('#f6e0a0', { rough: 0.7 })
      const lapis = M('#1d3fb8', { rough: 0.35 })
      const coin = M('#ffcf3a', { rough: 0.3, metal: 0.2 })
      for (const s of [-1, 1]) {
        box(g, sand, 1.8, 0.6, 1.8, s * (tx + 1.7), 0, tz - 0.6)
        box(g, goldM, 1.1, 7.2, 1.1, s * (tx + 1.7), 0.6, tz - 0.6)
        cone(g, goldM, 0.8, 1.3, s * (tx + 1.7), 8.45, tz - 0.6, 4, Math.PI / 4)
        box(g, lapis, 1.14, 0.3, 1.14, s * (tx + 1.7), 5.5, tz - 0.6)
        solidLocal(frame, 1.8, 7.8, 1.8, s * (tx + 1.7), 0, tz - 0.6)
        brazier(s * tx, tz + 1.2, goldM, lapis)
        // Coin hoards by the door.
        for (let c = 0; c < 6; c++) cyl(g, coin, 0.45, 0.45, 0.12, s * (W / 2 - 1.6) + (c % 2) * 0.3, F + c * 0.13, front - 0.2, 14)
        ball(g, coin, 0.7, s * (W / 2 - 2.8), F, front - 0.3, 12, 8)
      }
      cyl(g, goldM, 1.3, 1.3, 0.2, 0, H + 1.8, front + 0.1, 24, 0, Math.PI / 2)
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        box(g, goldM, 0.16, 0.8, 0.12, Math.cos(a) * 1.8, H + 1.8 + Math.sin(a) * 1.8, front + 0.1, 0, 0, a - Math.PI / 2)
      }
      throne(goldM, neon('#5affff', 2.4))
      break
    }
    case 'lava': {
      // Magma forge: basalt spikes on the roof, a glowing lava channel, an anvil, skulls.
      const basalt = M('#2a1d1a', { rough: 0.85, flat: true })
      const hot = neon('#ff6a1a', 2.6)
      for (let i = 0; i < 8; i++) cone(g, basalt, 0.4, 1.4 + (i % 3) * 0.4, -W / 2 + 1 + i * 2, H + 1.2, front + 0.2, 5, 0, deg(-12))
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) cone(g, basalt, 0.4, 1.2 + (i % 2) * 0.4, s * (W / 2 + 0.2), H + 1.1, -D / 2 + 1 + i * 3, 5, 0, 0, deg(s * -14))
      // Lava channels either side of the carpet, out to the lane.
      if (carpetLen > 0) {
        for (const s of [-1, 1]) {
          box(g, basalt, 0.9, 0.12, carpetLen, s * 2.3, 0, front + 1.4 + carpetLen / 2)
          box(g, hot, 0.5, 0.06, carpetLen - 0.2, s * 2.3, 0.12, front + 1.4 + carpetLen / 2)
        }
      }
      for (const s of [-1, 1]) {
        box(g, basalt, 1.4, 0.8, 1.0, s * (tx + 1.7), 0, tz - 0.6)
        box(g, basalt, 2.0, 0.4, 1.0, s * (tx + 1.7), 0.8, tz - 0.6) // anvil top
        solidLocal(frame, 2.0, 1.2, 1.0, s * (tx + 1.7), 0, tz - 0.6)
        brazier(s * tx, tz + 1.2, basalt, M('#4a3028', { rough: 0.8 }))
        ball(g, M('#e8dcc8', { rough: 0.5 }), 0.35, s * (W / 2 - 1.5), F + 0.3, front - 0.3, 10, 8)
      }
      throne(basalt, hot)
      break
    }
    case 'spikes': {
      // Oni shrine: a heavy curved-eave roof, red lanterns, a torii gate over the carpet.
      const red = S('#c4141b', { rough: 0.5 })
      const black = M('#1a1014', { rough: 0.6 })
      const lantern = neon('#ff3a2a', 2.4)
      box(g, black, W + 3.2, 0.5, D + 3.2, 0, H + 0.7, 0)
      box(g, red, W + 1.4, 0.9, D + 1.4, 0, H + 1.2, 0)
      box(g, black, W - 2, 0.7, D - 2, 0, H + 2.1, 0)
      // Upturned corner eaves.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, black, 1.6, 0.4, 0.5, sx * (W / 2 + 1.2), H + 1.0, sz * (D / 2 + 1.2), sx * sz * Math.PI / 4, 0, sx * 0.5)
      for (let i = 0; i < 4; i++) {
        const x = -W / 2 + 2.4 + i * ((W - 4.8) / 3)
        box(g, black, 0.06, 0.8, 0.06, x, H - 0.8, front + 1.2)
        ball(g, lantern, 0.38, x, H - 1.25, front + 1.2, 10, 8)
        cyl(g, black, 0.2, 0.2, 0.12, x, H - 1.7, front + 1.2, 8)
      }
      if (carpetLen > 2) {
        const z = front + 1.4 + carpetLen * 0.55
        for (const s of [-1, 1]) {
          cyl(g, red, 0.32, 0.38, 6.2, s * 2.6, 0, z, 12)
          box(g, black, 0.9, 0.4, 0.9, s * 2.6, 0, z)
          solidLocal(frame, 0.8, 6.2, 0.8, s * 2.6, 0, z)
        }
        box(g, red, 7.4, 0.45, 0.5, 0, 5.0, z)
        box(g, black, 8.6, 0.5, 0.8, 0, 6.2, z)
        box(g, red, 0.4, 1.0, 0.3, 0, 5.3, z)
      }
      for (const s of [-1, 1]) brazier(s * tx, tz + 1.2, black, red)
      throne(red, lantern)
      break
    }
    case 'marble': {
      // Marble temple: fluted columns, a pediment over the front, statues on plinths.
      const marble = M('#f2f2f8', { rough: 0.35 })
      const marble2 = M('#c8c8d8', { rough: 0.4 })
      const goldM = M('#ffcf3a', { rough: 0.3, metal: 0.2 })
      // Columns at the ends only, so the banner stays readable.
      for (const x of [-7.55, -5.5, 5.5, 7.55]) {
        cyl(g, marble, 0.45, 0.5, H - F - 0.4, x, F + 0.2, front + 1.0, 14)
        box(g, marble2, 1.3, 0.2, 1.3, x, F, front + 1.0)
        box(g, marble2, 1.3, 0.3, 1.3, x, H - 0.3, front + 1.0)
      }
      // Pediment: two sloped slabs and a base beam (triangle over the front).
      box(g, marble2, W + 1.6, 0.5, 1.6, 0, H + 0.6, front + 0.6)
      for (const s of [-1, 1]) box(g, marble, W / 2 + 1.4, 0.45, 1.5, s * (W / 4 + 0.3), H + 1.8, front + 0.6, 0, 0, s * -0.24)
      cyl(g, goldM, 0.6, 0.6, 0.12, 0, H + 1.7, front + 1.4, 16, 0, Math.PI / 2)
      for (const s of [-1, 1]) {
        // Statue: plinth + a figure holding a spear.
        box(g, marble2, 1.6, 1.4, 1.6, s * (tx + 1.8), 0, tz - 0.6)
        box(g, marble, 0.6, 1.4, 0.4, s * (tx + 1.8), 1.4, tz - 0.6)
        box(g, marble, 0.8, 1.0, 0.5, s * (tx + 1.8), 2.8, tz - 0.6)
        ball(g, marble, 0.32, s * (tx + 1.8), 4.15, tz - 0.6, 10, 8)
        box(g, goldM, 0.08, 3.4, 0.08, s * (tx + 1.8) + s * 0.5, 1.6, tz - 0.4)
        cone(g, goldM, 0.14, 0.4, s * (tx + 1.8) + s * 0.5, 5.2, tz - 0.4, 4)
        solidLocal(frame, 1.6, 4.5, 1.6, s * (tx + 1.8), 0, tz - 0.6)
        brazier(s * tx, tz + 1.2, marble2, goldM)
      }
      throne(marble, neon('#4ab8ff', 2.4))
      break
    }
    case 'rainbow': {
      // Cloud palace: a rainbow over the roof, cloud puffs, star lights.
      const cloud = S('#ffffff', { rough: 0.9 })
      const cols = ['#ff4a4a', '#ff9a1f', '#ffe14a', '#5bff6a', '#3fa2ff', '#a35bff']
      cols.forEach((c, b) => {
        const r = 8.4 - b * 0.55
        for (let a = 0; a <= 16; a++) {
          const t = (a / 16) * Math.PI
          box(g, M(c, { rough: 0.5 }), 0.62, 0.62, 0.7, Math.cos(t) * r, H + 0.4 + Math.sin(t) * r * 0.45, -1, 0, 0, t)
        }
      })
      for (const s of [-1, 1]) {
        for (const [dx, dy, r] of [[0, 0, 1.4], [1.2, 0.3, 1.1], [-1.1, 0.2, 1.0]]) ball(g, cloud, r, s * (W / 2 - 1) + dx, H + 0.9 + dy, front - 0.5, 12, 8)
        for (const [dx, dy, r] of [[0, 0, 1.3], [1.1, -0.2, 0.9]]) ball(g, cloud, r, s * (tx + 1.7) + dx, 1 + dy, tz - 0.6, 12, 8)
        solidLocal(frame, 2.4, 2, 2.2, s * (tx + 1.7), 0, tz - 0.6)
        brazier(s * tx, tz + 1.2, cloud, M('#ffd6f6', { rough: 0.3 }))
        for (let i = 0; i < 3; i++) cone(g, neon(cols[(i * 2 + (s > 0 ? 1 : 0)) % 6], 2.4), 0.25, 0.5, s * (W / 2 + 0.3), 3 + i * 1.6, front - 2 - i * 2, 4)
      }
      throne(cloud, neon('#fff3a6', 2.6))
      break
    }
    case 'sakura': {
      // Pagoda: two curved roof tiers, paper lanterns, a stone lantern and a blossom tree.
      const roof = M('#5a2440', { rough: 0.5 })
      const pink = S('#ff8ac0', { rough: 0.6 })
      const wood = M('#7a3a2a', { rough: 0.8 })
      const stone = M('#9a9aa8', { rough: 0.8 })
      const paper = neon('#ffe0ee', 2.0)
      box(g, roof, W + 3, 0.5, D + 3, 0, H + 0.7, 0)
      box(g, pink, W - 1, 1.4, D - 1, 0, H + 1.2, 0)
      box(g, roof, W + 1, 0.45, D + 1, 0, H + 2.6, 0)
      box(g, roof, W - 5, 1.0, D - 5, 0, H + 3.0, 0)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        box(g, roof, 1.6, 0.35, 0.5, sx * (W / 2 + 1.1), H + 0.95, sz * (D / 2 + 1.1), sx * sz * Math.PI / 4, 0, sx * 0.5)
        box(g, roof, 1.2, 0.3, 0.4, sx * (W / 2 + 0.2), H + 2.85, sz * (D / 2 + 0.2), sx * sz * Math.PI / 4, 0, sx * 0.5)
      }
      for (let i = 0; i < 4; i++) {
        const x = -W / 2 + 2.4 + i * ((W - 4.8) / 3)
        box(g, wood, 0.05, 0.7, 0.05, x, H - 0.7, front + 1.3)
        box(g, paper, 0.55, 0.75, 0.55, x, H - 1.45, front + 1.3)
        box(g, wood, 0.6, 0.08, 0.6, x, H - 1.5, front + 1.3)
      }
      for (const s of [-1, 1]) {
        // Stone lantern (toro).
        box(g, stone, 1.0, 0.3, 1.0, s * (tx + 1.7), 0, tz - 0.6)
        box(g, stone, 0.35, 1.4, 0.35, s * (tx + 1.7), 0.3, tz - 0.6)
        box(g, paper, 0.7, 0.6, 0.7, s * (tx + 1.7), 1.7, tz - 0.6)
        cone(g, stone, 0.75, 0.6, s * (tx + 1.7), 2.6, tz - 0.6, 4, Math.PI / 4)
        solidLocal(frame, 1.0, 2.9, 1.0, s * (tx + 1.7), 0, tz - 0.6)
        brazier(s * tx, tz + 1.2, wood, stone, 1.6)
      }
      // A blossom tree beside the base.
      const bx = -(W / 2 + 2.6)
      box(g, wood, 0.7, 4, 0.7, bx, 0, -1.5, 0, 0, 0.1)
      for (const [dx, dy, dz, r] of [[0, 4.6, -1.5, 1.6], [1.2, 4.2, -0.6, 1.1], [-1, 4.3, -2.4, 1.2], [0.3, 5.6, -1.8, 1.0]]) ball(g, pink, r, bx + dx, dy, dz, 12, 8)
      solidLocal(frame, 0.8, 4, 0.8, bx, 0, -1.5)
      throne(roof, neon('#ff8ac0', 2.4))
      break
    }
    case 'space': {
      // Star observatory: a glass dome, a dish and a blinking mast, ringed plinths.
      const hull = M('#2a3a7a', { rough: 0.4, metal: 0.5 })
      const glass = M('#9ae8ff', { rough: 0.05, opacity: 0.35 })
      const seam = neon('#7af0ff', 2.6)
      ball(g, glass, 3.2, 0, H + 0.5, -0.5, 24, 12)
      box(g, hull, 7.4, 0.4, 7.4, 0, H + 0.6, -0.5)
      cyl(g, hull, 0.15, 0.15, 4, W / 2 - 1.5, H + 0.6, -D / 2 + 1.2, 8)
      ball(g, neon('#ff3a3a', 3), 0.3, W / 2 - 1.5, H + 4.8, -D / 2 + 1.2, 10, 8)
      cyl(g, hull, 1.3, 0.2, 0.5, -(W / 2 - 1.6), H + 1.2, -D / 2 + 1.6, 16, 0, deg(-30))
      box(g, seam, W + 1.4, 0.08, 0.08, 0, H + 0.7, front + 0.66)
      for (const s of [-1, 1]) {
        box(g, hull, 1.6, 0.8, 1.6, s * (tx + 1.7), 0, tz - 0.6)
        ball(g, neon(s > 0 ? '#ff7ad9' : '#ffd23a', 2.4), 0.7, s * (tx + 1.7), 2.0, tz - 0.6, 14, 10)
        cyl(g, seam, 1.1, 1.1, 0.06, s * (tx + 1.7), 2.0, tz - 0.6, 24, 0, deg(20))
        solidLocal(frame, 1.6, 2.8, 1.6, s * (tx + 1.7), 0, tz - 0.6)
        brazier(s * tx, tz + 1.2, hull, M('#1a2a5a', { rough: 0.4, metal: 0.5 }))
      }
      throne(hull, seam)
      break
    }
    case 'ruins': {
      // Overgrown ruin: moss on the roof, vines, broken columns and a giant stone head.
      const stone = S('#9a9a7a', { rough: 0.9 })
      const stone2 = M('#7a7a5a', { rough: 0.9, flat: true })
      const moss = M('#4f8a2a', { rough: 0.9 })
      const vine = M('#2d6b2a', { rough: 0.8 })
      const rune = neon('#9cff4a', 2.4)
      box(g, moss, W + 1.3, 0.12, D + 1.3, 0, H + 0.7, 0)
      for (let i = 0; i < 7; i++) box(g, moss, 1.4 + (i % 3) * 0.6, 0.2, 1.2, -W / 2 + 1.5 + i * 2.2, H + 0.82, (i % 3) - 1.5)
      for (let i = 0; i < 12; i++) {
        const x = -W / 2 + 0.8 + i * 1.3
        const len = 1 + ((i * 41) % 7) * 0.35
        box(g, vine, 0.1, len, 0.1, x, H - len, front + 0.7)
      }
      for (const s of [-1, 1]) {
        // Broken column + toppled drum.
        cyl(g, stone2, 0.6, 0.7, 2.4 + (s > 0 ? 1.2 : 0), s * (tx + 1.8), 0, tz - 0.6, 10)
        cyl(g, stone2, 0.6, 0.6, 1.0, s * (tx + 3.0), 0.6, tz + 0.6, 10, 0.4, Math.PI / 2)
        solidLocal(frame, 1.4, 3.6, 1.4, s * (tx + 1.8), 0, tz - 0.6)
        brazier(s * tx, tz + 1.2, stone2, stone)
      }
      // Colossal stone head half sunk beside the base, glowing eyes.
      const hx = W / 2 + 3
      box(g, stone, 3.2, 3.0, 3.0, hx, 0, -2, deg(-10))
      box(g, stone2, 3.4, 0.6, 3.2, hx, 3.0, -2, deg(-10))
      box(g, stone2, 0.8, 1.0, 0.5, hx - 0.25, 1.2, -0.4, deg(-10))
      for (const d of [-0.7, 0.7]) box(g, rune, 0.5, 0.25, 0.1, hx + d * Math.cos(deg(-10)) - 0.3, 2.0, -0.45 - d * Math.sin(deg(-10)), deg(-10))
      box(g, moss, 3.3, 0.14, 3.1, hx, 3.6, -2, deg(-10))
      solidLocal(frame, 3.2, 3.6, 3.0, hx, 0, -2, deg(-10))
      throne(stone2, rune)
      break
    }
  }
  return { torches, flame: DECO[kind].flame, aura: DECO[kind].aura, kind }
}
