import { BoxGeometry, DoubleSide, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial } from 'three'
import { createEmitter } from '../particles.js'
import { neon } from '../propkit.js'
import { smoke } from '../fx.js'
import { sfx, spatial } from '../audio/index.js'
import { M, S, box, cyl, cone, ball, solid, deg } from '../safezone/kit.js'

// Extra life for the desert (zone 0, the Common zone; its ground, pyramids and cacti are
// built by safezone/ground.js): an avenue of obelisks with fire bowls along the lane,
// striped sandstone mounds, a palm oasis, a beast's bleached ribcage, a ruined hieroglyph
// wall, drifting sand, heat shimmer sparkles, tumbleweeds rolling across, vultures circling
// overhead and dust devils wandering the dunes. Static parts go into `g` (baked by the
// caller); moving parts are returned with update(dt, elapsed, playerPos).
//
// Spots avoid: the lane carpet (|x| < 4), the Mummy Warrior's base (x 12..36, z -48..-80),
// the event building (-40, -66), the pyramids and the opening to the corridors (z < -112).

export function dressDesert(g, scene, emitters) {
  const sand = S('#e8b860', { rough: 0.8 })
  const sand2 = S('#c8903a', { rough: 0.8 })
  const gold = M('#ffcf3a', { rough: 0.3, metal: 0.2 })
  const lapis = M('#2047c8', { rough: 0.4 })
  const turq = M('#2fd0c0', { rough: 0.4 })
  const fireTops = []

  // Avenue of obelisks either side of the lane, each with a fire bowl.
  for (const z of [-58, -86, -106]) {
    for (const s of [-1, 1]) {
      const x = s * 7.5
      box(g, sand2, 1.8, 0.7, 1.8, x, 0, z)
      box(g, sand, 1.1, 5.6, 1.1, x, 0.7, z)
      for (let i = 0; i < 3; i++) box(g, i % 2 ? lapis : gold, 1.16, 0.16, 1.16, x, 1.8 + i * 1.3, z)
      // Glyph tiles on the lane-facing side.
      for (let i = 0; i < 4; i++) box(g, [lapis, turq, gold, turq][i], 0.4, 0.4, 0.06, x - s * 0.58, 2.3 + i * 0.9, z, Math.PI / 2)
      cyl(g, gold, 0.75, 0.4, 0.5, x, 6.3, z, 10)
      cyl(g, neon('#ff8a2a', 2.8), 0.6, 0.6, 0.06, x, 6.76, z, 10)
      solid(0.9, 3.4, 0.9, x, 3.4, z)
      fireTops.push({ x, y: 6.9, z, sx: 0.3, sy: 0.05, sz: 0.3 })
    }
  }
  emitters.push(createEmitter(scene, { boxes: fireTops, count: fireTops.length * 30, life: 0.75, velocity: [0, 2.4, 0], spread: [0.35, 0.6, 0.35], size: 0.6, grow: 0.15, color: '#ff8a2a', intensity: 2.6, seed: 81 }))
  emitters.push(createEmitter(scene, { boxes: fireTops.map((b) => ({ ...b, y: b.y + 0.8, sy: 0.4 })), count: fireTops.length * 8, life: 1.5, velocity: [0, 2.6, 0], spread: [0.6, 0.8, 0.6], size: 0.12, sprite: 'sparkle', color: '#ffe0a0', intensity: 3, twinkle: 9, seed: 82 }))

  // Striped sandstone mounds: rings of slabs stepping in, orange and rust bands, cut open
  // on one side like a crescent.
  const bands = [S('#ff9a2a', { rough: 0.8 }), S('#e0661a', { rough: 0.8 })]
  const mound = (cx, cz, r0, ry) => {
    for (let layer = 0; layer < 5; layer++) {
      const r = r0 - layer * (r0 / 5.5)
      const n = 14
      for (let i = 0; i < n; i++) {
        const a = ry + (i / n) * Math.PI * 1.45
        box(g, bands[layer % 2], (r * Math.PI * 2) / n + 0.25, 0.75, 1.4, cx + Math.cos(a) * r, layer * 0.75, cz + Math.sin(a) * r, -a + Math.PI / 2)
      }
    }
    solid(r0 * 0.7, 1.9, r0 * 0.7, cx, 1.9, cz)
  }
  mound(-34, -86, 4.2, deg(30))
  mound(52, -90, 3.6, deg(200))
  mound(-52, -50, 3.4, deg(-40))
  mound(48, -48, 3.0, deg(120))

  // Palm oasis in the north-west corner: a pool, a sand rim, palms and reeds.
  const ox = -48
  const oz = -104
  cyl(g, S('#f0d080', { rough: 0.85 }), 6.2, 6.6, 0.18, ox, 0, oz, 28)
  cyl(g, M('#1fa8ff', { rough: 0.08, metal: 0.2 }), 5.2, 5.2, 0.1, ox, 0.12, oz, 28)
  cyl(g, M('#7ae0ff', { rough: 0.05, metal: 0.1 }), 3.2, 3.2, 0.1, ox + 0.6, 0.14, oz - 0.4, 24)
  const trunk = M('#8a5a2a', { rough: 0.85 })
  const frond = M('#2fb83a', { rough: 0.7 })
  const frond2 = M('#5bd84a', { rough: 0.7 })
  const palm = (x, z, h, lean) => {
    let px = x
    let py = 0
    for (let i = 0; i < 6; i++) {
      box(g, i % 2 ? trunk : M('#a8743a', { rough: 0.85 }), 0.6 - i * 0.04, h / 6 + 0.05, 0.6 - i * 0.04, px, py, z, 0, 0, lean)
      px -= Math.sin(lean) * (h / 6)
      py += Math.cos(lean) * (h / 6)
    }
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2
      box(g, k % 2 ? frond : frond2, 3.2, 0.12, 0.7, px + Math.cos(a) * 1.4, py - 0.2, z + Math.sin(a) * 1.4, -a, 0, -0.45)
    }
    for (let k = 0; k < 3; k++) ball(g, M('#6a3a1a', { rough: 0.6 }), 0.22, px + Math.cos(k * 2) * 0.3, py - 0.35, z + Math.sin(k * 2) * 0.3, 8, 6)
    solid(0.35, h / 2, 0.35, x, h / 2, z)
  }
  palm(ox - 4.6, oz - 3, 7.5, deg(12))
  palm(ox + 4.4, oz - 3.6, 6.5, deg(-14))
  palm(ox - 1, oz + 5, 8, deg(6))
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    box(g, M('#4a9a2a', { rough: 0.8 }), 0.08, 1 + (i % 3) * 0.4, 0.08, ox + Math.cos(a) * 5.4, 0.1, oz + Math.sin(a) * 5.4, 0, 0, (i % 2 ? 1 : -1) * 0.15)
  }
  emitters.push(createEmitter(scene, { boxes: [{ x: ox, y: 0.3, z: oz, sx: 3.6, sy: 0.05, sz: 3.6 }], count: 40, life: 2, velocity: [0, 0.05, 0], spread: [0, 0, 0], size: 0.22, sprite: 'sparkle', color: '#ffffff', intensity: 2.4, twinkle: 7, seed: 83 }))

  // A great beast's bleached skeleton half buried in the sand.
  const bone = M('#f2ead2', { rough: 0.5 })
  const bx = -30
  const bz = -100
  box(g, bone, 0.5, 0.5, 9, bx, 0, bz, deg(20))
  for (let i = 0; i < 7; i++) {
    const t = i - 3
    const x = bx + Math.sin(deg(20)) * t * 1.1
    const z = bz + Math.cos(deg(20)) * t * 1.1
    const h = 3.2 - Math.abs(t) * 0.3
    for (const s of [-1, 1]) {
      box(g, bone, 0.3, h, 0.3, x + Math.cos(deg(20)) * s * 1.1, 0, z - Math.sin(deg(20)) * s * 1.1, deg(20), 0, s * -0.35)
    }
  }
  // Its skull: a long snout and two horns.
  const sx = bx + Math.sin(deg(20)) * 5.6
  const sz = bz + Math.cos(deg(20)) * 5.6
  box(g, bone, 1.6, 1.3, 2.4, sx, 0, sz, deg(20), deg(-10))
  box(g, M('#2a2018'), 0.35, 0.3, 0.1, sx - 0.35, 0.8, sz + 1.1, deg(20))
  box(g, M('#2a2018'), 0.35, 0.3, 0.1, sx + 0.35, 0.8, sz + 1.25, deg(20))
  for (const s of [-1, 1]) cone(g, bone, 0.18, 1.4, sx + s * 1.0, 1.6, sz - 0.4, 6, deg(20), 0, s * -0.8)
  solid(1.2, 1.6, 4.5, bx, 1.6, bz, deg(20))

  // A ruined hieroglyph wall with a toppled block.
  const wx = 46
  const wz = -113
  box(g, sand, 9, 3.6, 1.2, wx, 0, wz)
  box(g, sand2, 3.4, 1.6, 1.2, wx + 2.5, 3.6, wz)
  box(g, sand, 1.8, 1.2, 1.2, wx - 3.6, 0, wz + 2.4, deg(30), deg(8))
  const glyph = [lapis, gold, turq, gold, lapis]
  for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) if ((i + r) % 3 !== 2) box(g, glyph[(i + r) % 5], 0.6, 0.6, 0.06, wx - 3.6 + i * 1.2, 0.5 + r * 1.0, wz + 0.63)
  solid(4.5, 1.8, 0.6, wx, 1.8, wz)

  // Drifting sand low over the dunes and a few heat-shimmer sparkles.
  emitters.push(createEmitter(scene, { boxes: [{ x: 0, y: 0.5, z: -79, sx: 56, sy: 0.4, sz: 36 }], count: 260, life: 5, velocity: [2.6, 0.25, 0.4], spread: [0.8, 0.2, 0.4], size: 0.14, color: '#f4dca0', intensity: 0.9, opacity: 0.8, seed: 84 }))
  emitters.push(createEmitter(scene, { boxes: [{ x: 0, y: 1.5, z: -79, sx: 56, sy: 1.2, sz: 36 }], count: 70, life: 3, velocity: [0, 0.4, 0], spread: [0.2, 0.2, 0.2], size: 0.18, sprite: 'sparkle', color: '#fff2c0', intensity: 2, twinkle: 6, seed: 85 }))

  // --- Moving parts ---------------------------------------------------------------------
  const live = new Group()
  scene.add(live)

  // Tumbleweeds: a twiggy ball (solid core + wire shell) rolling east with hops, wrapping round.
  const weedGeo = new IcosahedronGeometry(0.75, 1)
  const coreGeo = new IcosahedronGeometry(0.55, 0)
  const weedMat = new MeshStandardMaterial({ color: '#b08a4a', roughness: 1, wireframe: true })
  const coreMat = new MeshStandardMaterial({ color: '#8a6a34', roughness: 1, flatShading: true })
  const weeds = []
  for (const [x, z, sp] of [[-40, -52, 3.2], [-10, -78, 4.2], [20, -96, 3.6], [-30, -112, 2.8]]) {
    const w = new Group()
    w.add(new Mesh(coreGeo, coreMat))
    w.add(new Mesh(weedGeo, weedMat))
    w.children[0].castShadow = true
    live.add(w)
    weeds.push({ w, x, z, sp, ph: Math.random() * 6 })
  }

  // Vultures circling high over the sand.
  const birdMat = new MeshStandardMaterial({ color: '#2a2024', roughness: 0.8, side: DoubleSide })
  const headMat = new MeshStandardMaterial({ color: '#e07a6a', roughness: 0.7 })
  const unit = new BoxGeometry(1, 1, 1)
  const birds = []
  for (let i = 0; i < 3; i++) {
    const b = new Group()
    const body = new Mesh(unit, birdMat)
    body.scale.set(0.5, 0.4, 1.4)
    const head = new Mesh(unit, headMat)
    head.scale.set(0.22, 0.22, 0.3)
    head.position.set(0, 0.1, 0.85)
    b.add(body, head)
    const wings = [-1, 1].map((s) => {
      const p = new Group()
      p.position.set(s * 0.22, 0.05, 0)
      const w = new Mesh(unit, birdMat)
      w.scale.set(2.2, 0.06, 0.8)
      w.position.set(s * 1.1, 0, 0)
      p.add(w)
      b.add(p)
      return { p, s }
    })
    const tail = new Mesh(unit, birdMat)
    tail.scale.set(0.7, 0.05, 0.6)
    tail.position.set(0, 0, -0.9)
    b.add(tail)
    live.add(b)
    birds.push({ b, wings, r: 18 + i * 7, h: 22 + i * 3, w: 0.18 + i * 0.04, a: i * 2.1, cx: -6 + i * 8, cz: -80 - i * 6, flap: 0 })
  }

  // Dust devils: two wandering whirls of sand.
  const devils = [
    { x: -20, z: -70, vx: 1.6, vz: -0.8, acc: 0 },
    { x: 30, z: -100, vx: -1.2, vz: 1.0, acc: 0 },
  ]
  let cawIn = 6

  return {
    group: live,
    update(dt, elapsed, p) {
      for (const t of weeds) {
        t.x += t.sp * dt
        if (t.x > 58) t.x = -58
        const hop = Math.abs(Math.sin(elapsed * 2.2 + t.ph)) * 0.9
        t.w.position.set(t.x, 0.75 + hop, t.z + Math.sin(elapsed * 0.5 + t.ph) * 2)
        t.w.rotation.z -= (t.sp / 0.75) * dt
        t.w.rotation.x += 0.4 * dt
      }
      for (const b of birds) {
        b.a += b.w * dt
        const x = b.cx + Math.cos(b.a) * b.r
        const z = b.cz + Math.sin(b.a) * b.r
        b.b.position.set(x, b.h + Math.sin(elapsed * 0.7 + b.r) * 1.2, z)
        b.b.rotation.set(0, -b.a, 0.35) // heading along the circle, banked into the turn
        // Glide, with a few flaps now and then.
        const flapping = Math.sin(elapsed * 0.4 + b.r) > 0.6
        b.flap += dt * (flapping ? 9 : 0)
        const ang = flapping ? Math.sin(b.flap) * 0.6 : 0.08
        for (const w of b.wings) w.p.rotation.z = w.s * ang
      }
      for (const d of devils) {
        d.x += d.vx * dt
        d.z += d.vz * dt
        if (d.x < -54 || d.x > 54) d.vx *= -1
        if (d.z > -46 || d.z < -112) d.vz *= -1
        if (Math.abs(d.x) < 6) d.x += Math.sign(d.vx || 1) * 0.1 // keep crossing the lane quickly
        const near = Math.hypot(d.x - p.x, d.z - p.z) < 90
        if (!near) continue
        d.acc += dt * 45
        while (d.acc >= 1) {
          d.acc -= 1
          const a = Math.random() * Math.PI * 2
          const r = 0.4 + Math.random() * 1.2
          smoke({ x: d.x + Math.cos(a) * r, y: 0.2 + Math.random() * 0.5, z: d.z + Math.sin(a) * r, vx: 0, vy: 2.2 + Math.random() * 1.6, vz: 0, color: '#ecd59a', alpha: 0.4, size: 0.5, size1: 1.6 + Math.random(), life: 1.6, swirl: 5, pull: -0.35, cx: d.x, cz: d.z, fadeOut: 0.6 })
        }
      }
      // A distant vulture cry now and then.
      if ((cawIn -= dt) <= 0) {
        cawIn = 9 + Math.random() * 10
        const b = birds[Math.floor(Math.random() * birds.length)]
        const s = spatial(b.b.position.x, b.b.position.z, 40)
        sfx.vultureCry?.(s.gain, s.pan)
      }
    },
  }
}

// Ambient particles a corridor zone gets on top of its scenery's own (fireflies in the
// jungle and the ruins, falling leaves, marble motes, rainbow sparkles).
export function zoneExtras(scene, zone, b, emitters) {
  const box2 = (y, sy, extra = {}) => [{ x: 0, y, z: (b.start + b.end) / 2, sx: b.halfW - 3, sy, sz: (b.start - b.end) / 2 - 3, ...extra }]
  switch (zone.props) {
    case 'jungle':
      emitters.push(createEmitter(scene, { boxes: box2(2.5, 2), count: 90, life: 4, velocity: [0, 0.2, 0], spread: [0.5, 0.3, 0.5], size: 0.16, sprite: 'sparkle', color: '#d8ff6a', intensity: 2.6, twinkle: 3, seed: 91 }))
      emitters.push(createEmitter(scene, { boxes: box2(9, 1.5), count: 80, life: 6, velocity: [0.4, -1.2, 0.2], spread: [0.6, 0.3, 0.6], size: 0.3, color: '#4fcf3a', intensity: 0.9, seed: 92 }))
      break
    case 'ruins':
      emitters.push(createEmitter(scene, { boxes: box2(2.5, 2), count: 90, life: 4, velocity: [0, 0.2, 0], spread: [0.5, 0.3, 0.5], size: 0.16, sprite: 'sparkle', color: '#b8ff4a', intensity: 2.6, twinkle: 3, seed: 93 }))
      break
    case 'marble':
      emitters.push(createEmitter(scene, { boxes: box2(6, 5), count: 120, life: 6, velocity: [0.2, -0.4, 0], spread: [0.3, 0.2, 0.3], size: 0.2, color: '#ffffff', intensity: 1.4, seed: 94 }))
      break
    case 'rainbow': {
      const cols = ['#ff4a4a', '#ff9a1f', '#ffe14a', '#5bff6a', '#3fa2ff', '#a35bff']
      const boxes = cols.map((c) => box2(5, 4, { color: c })[0])
      emitters.push(createEmitter(scene, { boxes, count: 180, life: 3, velocity: [0, 0.5, 0], spread: [0.3, 0.3, 0.3], size: 0.22, sprite: 'sparkle', intensity: 2.4, twinkle: 6, seed: 95 }))
      break
    }
    case 'ice':
      emitters.push(createEmitter(scene, { boxes: box2(0.6, 0.4), count: 120, life: 5, velocity: [1.2, 0.1, 0], spread: [0.5, 0.1, 0.3], size: 0.5, grow: 1.6, color: '#e8f8ff', intensity: 0.5, opacity: 0.5, seed: 96 }))
      break
    case 'lava':
      emitters.push(createEmitter(scene, { boxes: box2(6, 5), count: 80, life: 4, velocity: [0, 1.2, 0], spread: [0.4, 0.4, 0.4], size: 0.1, sprite: 'sparkle', color: '#ffd23a', intensity: 3, twinkle: 10, seed: 97 }))
      break
    case 'spikes':
      emitters.push(createEmitter(scene, { boxes: box2(4, 3), count: 100, life: 5, velocity: [0.3, 0.5, 0], spread: [0.4, 0.3, 0.4], size: 0.24, color: '#ff2a3a', intensity: 1.6, seed: 98 }))
      break
    case 'gold':
      emitters.push(createEmitter(scene, { boxes: box2(8, 3), count: 80, life: 5, velocity: [0, -1.4, 0], spread: [0.3, 0.3, 0.3], size: 0.2, sprite: 'sparkle', color: '#fff08a', intensity: 2.4, twinkle: 8, seed: 99 }))
      break
    case 'crystal':
    case 'space':
    case 'sakura':
      emitters.push(createEmitter(scene, { boxes: box2(3, 2.5), count: 70, life: 4, velocity: [0, 0.3, 0], spread: [0.3, 0.2, 0.3], size: 0.2, sprite: 'sparkle', color: zone.props === 'sakura' ? '#ffffff' : zone.props === 'space' ? '#7af0ff' : '#ff9af0', intensity: 2.4, twinkle: 5, seed: 100 }))
      break
  }
}
