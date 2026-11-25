import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../textures.js'
import { neon } from '../propkit.js'
import { glow, smoke, shockwave } from '../fx.js'
import { sfx, spatial } from '../audio/index.js'

// The guardians' bodies. Every zone's giant shares one skeleton (same joints and
// limb lengths, so every pose in guardian.js fits all of them) but has its own
// build, skin, costume, glowing bits, loose parts that swing (danglers), parts
// that orbit (spinners), ambient particles, footstep layer, roar style and voice.
// The look is picked by the zone's scenery theme (ZONES[i].props).
//
// Draw calls: every static part on a joint is merged into ONE mesh per material
// (Kit.finish), so a richly dressed giant costs ~25-35 draws instead of one per
// box. Only parts that move on their own (eyes, brows, mouth, danglers,
// spinners, flames) stay separate.

export const STAND_HIPS = 2.29
const TAU = Math.PI * 2
const R = (a, b) => a + Math.random() * (b - a)

// --- Canvas skins (256 px, one per giant) -------------------------------------------------
function canvas(size = 256) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return [c, c.getContext('2d')]
}
function tex(c) {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

// Overlapping bandage strips with seams, highlights and frayed nicks.
function bandage(a, b, seed) {
  const S = 256
  const [c, ctx] = canvas(S)
  const rand = mulberry32(seed)
  ctx.fillStyle = b
  ctx.fillRect(0, 0, S, S)
  const ca = new Color(a)
  const cb = new Color(b)
  let y = -10
  while (y < S + 10) {
    const h = 9 + rand() * 14
    const tilt = (rand() - 0.5) * 10
    const mix = rand()
    ctx.fillStyle = '#' + ca.clone().lerp(cb, mix * mix * 0.8).getHexString()
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(S, y + tilt)
    ctx.lineTo(S, y + tilt + h)
    ctx.lineTo(0, y + h)
    ctx.fill()
    ctx.strokeStyle = 'rgba(20,20,40,0.55)'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(0, y + h)
    ctx.lineTo(S, y + tilt + h)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    ctx.moveTo(0, y + 1)
    ctx.lineTo(S, y + tilt + 1)
    ctx.stroke()
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = 'rgba(30,30,60,0.25)'
      ctx.fillRect(rand() * S, y + rand() * h, 6 + rand() * 10, 1.5)
    }
    // Old stains.
    if (rand() < 0.3) {
      ctx.fillStyle = 'rgba(150,120,60,0.18)'
      ctx.beginPath()
      ctx.arc(rand() * S, y + h / 2, 4 + rand() * 10, 0, TAU)
      ctx.fill()
    }
    y += h - 1
  }
  return tex(c)
}

// Mottled skin / fur / moss / stone: soft blotches of `spots` colours + fine speckle.
function mottle(base, spots, seed, { blobs = 70, r0 = 6, r1 = 26, speck = 900, speckA = 0.18, alpha = 0.35 } = {}) {
  const S = 256
  const [c, ctx] = canvas(S)
  const rand = mulberry32(seed)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, S, S)
  for (let i = 0; i < blobs; i++) {
    const x = rand() * S
    const y = rand() * S
    const r = r0 + rand() * (r1 - r0)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const col = new Color(spots[Math.floor(rand() * spots.length)])
    g.addColorStop(0, `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${alpha})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    // Draw wrapped so the texture tiles.
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) if (Math.abs(x + ox - S / 2) < S / 2 + r && Math.abs(y + oy - S / 2) < S / 2 + r) ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2)
  }
  for (let i = 0; i < speck; i++) {
    ctx.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${speckA})` : `rgba(255,255,255,${speckA * 0.7})`
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 1.5, 1 + rand() * 1.5)
  }
  return [c, ctx]
}

// Branching cracks; `glowing` paints them as bright lines on black (an emissive map).
function crackLines(ctx, S, seed, color, width, n = 16) {
  const rand = mulberry32(seed)
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let i = 0; i < n; i++) {
    let x = rand() * S
    let y = rand() * S
    let a = rand() * TAU
    ctx.lineWidth = width * (0.5 + rand())
    ctx.beginPath()
    ctx.moveTo(x, y)
    const steps = 6 + Math.floor(rand() * 8)
    for (let k = 0; k < steps; k++) {
      a += (rand() - 0.5) * 1.4
      x += Math.cos(a) * (8 + rand() * 12)
      y += Math.sin(a) * (8 + rand() * 12)
      ctx.lineTo(x, y)
      if (rand() < 0.2) {
        // Short branch.
        ctx.moveTo(x, y)
        ctx.lineTo(x + Math.cos(a + 1.2) * 10, y + Math.sin(a + 1.2) * 10)
        ctx.moveTo(x, y)
      }
    }
    ctx.stroke()
  }
}

function stripes(a, b, seed, { n = 8, wave = 0, tiger = false } = {}) {
  const S = 256
  const [c, ctx] = canvas(S)
  const rand = mulberry32(seed)
  ctx.fillStyle = a
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = b
  const step = S / n
  for (let i = 0; i < n; i++) {
    const y = i * step
    ctx.beginPath()
    if (tiger) {
      // Tapered, wavy tiger stripes.
      const x0 = rand() * S * 0.3
      ctx.moveTo(x0, y)
      for (let x = x0; x <= S; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 6 + (x - x0) * 0.04)
      for (let x = S; x >= x0; x -= 16) ctx.lineTo(x, y + step * 0.42 + Math.sin(x * 0.05 + i) * 6 - (x - x0) * 0.06)
    } else {
      ctx.moveTo(0, y)
      for (let x = 0; x <= S; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05) * wave)
      for (let x = S; x >= 0; x -= 16) ctx.lineTo(x, y + step / 2 + Math.sin(x * 0.05) * wave)
    }
    ctx.closePath()
    ctx.fill()
  }
  return tex(c)
}

function petals(base, petal, seed) {
  const [c, ctx] = mottle(base, ['#ffffff', petal], seed, { blobs: 20, alpha: 0.2, speck: 200, speckA: 0.06 })
  const rand = mulberry32(seed + 1)
  for (let i = 0; i < 22; i++) {
    const x = rand() * 256
    const y = rand() * 256
    const r = 5 + rand() * 6
    ctx.fillStyle = petal
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + rand() * 0.2
      ctx.beginPath()
      ctx.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, r * 0.5, a, 0, TAU)
      ctx.fill()
    }
    ctx.fillStyle = '#fff4a0'
    ctx.beginPath()
    ctx.arc(x, y, r * 0.35, 0, TAU)
    ctx.fill()
  }
  // Wave pattern near the hem.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 3
  for (let x = 0; x < 256; x += 32) {
    ctx.beginPath()
    ctx.arc(x + 16, 250, 14, Math.PI, TAU)
    ctx.stroke()
  }
  return tex(c)
}

function starfield(base, seed) {
  const [c, ctx] = mottle(base, ['#3a1a8a', '#0a3a8a', '#000010'], seed, { blobs: 30, r0: 20, r1: 60, alpha: 0.45, speck: 0 })
  const rand = mulberry32(seed + 2)
  for (let i = 0; i < 160; i++) {
    const x = rand() * 256
    const y = rand() * 256
    const r = rand() < 0.9 ? 0.6 + rand() : 1.6 + rand() * 1.4
    ctx.fillStyle = rand() < 0.2 ? '#9af0ff' : '#ffffff'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
  }
  return tex(c)
}

function plates(base, seam, seed) {
  const [c, ctx] = mottle(base, ['#ffffff', '#8a90a8'], seed, { blobs: 30, r0: 20, r1: 50, alpha: 0.18, speck: 500, speckA: 0.08 })
  // Brushed streaks.
  const rand = mulberry32(seed + 3)
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.05 + rand() * 0.08})`
    ctx.fillRect(0, rand() * 256, 256, 1)
  }
  ctx.strokeStyle = seam
  ctx.lineWidth = 3
  ctx.strokeRect(6, 6, 244, 116)
  ctx.strokeRect(6, 134, 244, 116)
  ctx.fillStyle = seam
  for (const y of [16, 112, 144, 240]) for (const x of [16, 128, 240]) {
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, TAU)
    ctx.fill()
  }
  return tex(c)
}

// --- Builder: rig pivots + merged parts ----------------------------------------------------
const BOX = new BoxGeometry(1, 1, 1)
const geoCache = new Map()
const cachedGeo = (key, make) => geoCache.get(key) ?? (geoCache.set(key, make()), geoCache.get(key))
const coneGeo = (seg) => cachedGeo(`k${seg}`, () => new ConeGeometry(1, 1, seg))
const cylGeo = (t, seg) => cachedGeo(`c${t}|${seg}`, () => new CylinderGeometry(t, 1, 1, seg))
const sphereGeo = (seg) => cachedGeo(`s${seg}`, () => new SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.7))))
const gemGeo = () => cachedGeo('gem', () => new OctahedronGeometry(1, 0))
const torusGeo = (t) => cachedGeo(`t${t}`, () => new TorusGeometry(1, t, 6, 24))

const _m = new Matrix4()
const _p = new Vector3()
const _q = new Quaternion()
const _e = new Euler()
const _s = new Vector3()
const _v = new Vector3()

class Kit {
  constructor() {
    this.buckets = new Map()
    this.danglers = []
    this.spinners = []
    this.pulses = []
    this.flickers = []
  }
  pivot(parent, x, y, z) {
    const p = new Group()
    p.position.set(x, y, z)
    parent.add(p)
    return p
  }
  add(p, mat, geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz))
    let g = geo.clone().applyMatrix4(_m)
    if (g.index) {
      const n = g.toNonIndexed()
      g.dispose()
      g = n
    }
    const key = p.uuid + mat.uuid
    let b = this.buckets.get(key)
    if (!b) this.buckets.set(key, (b = { p, mat, geos: [] }))
    b.geos.push(g)
  }
  box(p, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
    this.add(p, mat, BOX, x, y, z, rx, ry, rz, w, h, d)
  }
  cone(p, mat, r, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 6) {
    this.add(p, mat, coneGeo(seg), x, y, z, rx, ry, rz, r, h, r)
  }
  cyl(p, mat, rt, rb, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 10) {
    const t = Math.round((rt / rb) * 20) / 20
    this.add(p, mat, cylGeo(t, seg), x, y, z, rx, ry, rz, rb, h, rb)
  }
  ball(p, mat, r, x, y, z, sx = 1, sy = 1, sz = 1, seg = 8) {
    this.add(p, mat, sphereGeo(seg), x, y, z, 0, 0, 0, r * sx, r * sy, r * sz)
  }
  gem(p, mat, r, x, y, z, rx = 0, ry = 0, rz = 0, sy = 1.6) {
    this.add(p, mat, gemGeo(), x, y, z, rx, ry, rz, r, r * sy, r)
  }
  ring(p, mat, r, t, x, y, z, rx = 0, ry = 0, rz = 0) {
    this.add(p, mat, torusGeo(t), x, y, z, rx, ry, rz, r, r, r)
  }
  // A separate mesh (for parts guardian.js scales or turns itself). Unit box scaled to w/h/d.
  solo(p, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, geo = BOX, shadow = false) {
    const m = new Mesh(geo, mat)
    m.scale.set(w, h, d)
    m.position.set(x, y, z)
    m.rotation.set(rx, ry, rz)
    m.castShadow = shadow
    p.add(m)
    return m
  }
  // Loose part that swings on a spring: lags behind motion, sways while idle.
  // axis: 'x' (fore/aft), 'z' (sideways), 'y' (flap, wings). lean: swing per m/s.
  dangle(parent, x, y, z, { axis = 'x', base = 0, amp = 0.06, freq = 1.6, lean = 0.05, stiff = 40, damp = 5 } = {}) {
    const p = this.pivot(parent, x, y, z)
    p.rotation[axis] = base
    this.danglers.push({ p, axis, base, amp, freq, lean, stiff, damp, a: base, v: 0, ph: Math.random() * TAU })
    return p
  }
  spin(parent, x, y, z, { speed = 1, bob = 0, bobF = 1.5, axis = 'y' } = {}) {
    const p = this.pivot(parent, x, y, z)
    this.spinners.push({ p, speed, bob, bobF, axis, y0: y, ph: Math.random() * TAU })
    return p
  }
  pulse(mat, amp = 0.35, f = 2.2) {
    this.pulses.push({ mat, base: mat.emissiveIntensity, amp, f, ph: Math.random() * TAU })
    return mat
  }
  flicker(obj, f = 14) {
    this.flickers.push({ obj, sy: obj.scale.y, sx: obj.scale.x, f, ph: Math.random() * 100 })
    return obj
  }
  finish() {
    for (const b of this.buckets.values()) {
      const geo = mergeGeometries(b.geos, false)
      for (const g of b.geos) g.dispose()
      const m = new Mesh(geo, b.mat)
      m.castShadow = !b.mat.transparent
      b.p.add(m)
    }
    this.buckets.clear()
  }
}

const std = (color, o = {}) => new MeshStandardMaterial({ color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, flatShading: !!o.flat, map: o.map ?? null, side: o.double ? DoubleSide : 0, ...(o.emissive ? { emissive: o.emissive, emissiveIntensity: o.ei ?? 1 } : {}) })
const glowM = (color, ei = 2.4) => new MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: ei, roughness: 0.6 })
const flameM = (color) => neon(color, 3, { transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false })

// --- Shared skeleton with per-giant proportions --------------------------------------------
// o: chest (width), arm, hand, leg (thickness) multipliers. m: skin, skin2, foot, hand materials.
function body(k, root, m, o = {}) {
  const cw = o.chest ?? 1
  const aw = o.arm ?? 1
  const hw = o.hand ?? 1
  const lw = o.leg ?? 1
  const hips = k.pivot(root, 0, STAND_HIPS, 0)
  k.box(hips, m.pelvis ?? m.skin2, 1.5 * Math.max(1, cw * 0.9), 0.62, 0.92, 0, 0, 0)
  const legs = []
  for (const s of [1, -1]) {
    const hip = k.pivot(hips, s * 0.45 * Math.max(1, lw * 0.95), -0.15, 0)
    k.box(hip, m.thigh ?? m.skin, 0.72 * lw, 1.02, 0.76 * lw, 0, -0.5, 0)
    const knee = k.pivot(hip, 0, -1.0, 0)
    k.box(knee, m.shin ?? m.skin2, 0.64 * lw, 0.96, 0.7 * lw, 0, -0.46, 0)
    k.box(knee, m.foot, 0.74 * Math.max(1, lw * 0.9), 0.24, 1.04, 0, -1.02, 0.14)
    legs.push({ hip, knee, side: s })
  }
  const spine = k.pivot(hips, 0, 0.22, 0)
  k.box(spine, m.belly ?? m.skin2, 1.38 * cw, 0.82, 0.86, 0, 0.42, 0)
  k.box(spine, m.skin, 1.84 * cw, 1.02, 1.06, 0, 1.22, 0)
  const neck = k.pivot(spine, 0, 1.76, 0)
  k.box(neck, m.neck ?? m.skin2, 0.55, 0.3, 0.55, 0, 0.1, 0)
  const head = k.pivot(neck, 0, 0.2, 0)
  if (!o.noHead) k.box(head, m.head ?? m.skin, 1.06, 1.04, 1.0, 0, 0.52, 0)
  const arms = []
  const sx = 1.1 + (cw - 1) * 0.92
  for (const s of [1, -1]) {
    const shoulder = k.pivot(spine, s * sx, 1.52, 0)
    k.box(shoulder, m.upper ?? m.skin2, 0.62 * aw, 1.1, 0.62 * aw, 0, -0.55, 0)
    const elbow = k.pivot(shoulder, 0, -1.08, 0)
    k.box(elbow, m.fore ?? m.skin, 0.56 * aw, 0.96, 0.56 * aw, 0, -0.46, 0)
    k.box(elbow, m.hand, 0.68 * hw, 0.5 * hw, 0.64 * hw, 0, -1.08 - 0.04 * hw, 0.02)
    const hand = new Object3D()
    hand.position.set(0, -1.2, 0.05)
    elbow.add(hand)
    arms.push({ shoulder, elbow, hand, side: s })
  }
  return { hips, spine, neck, head, legs, arms }
}

// Eyes / brows / mouth (separate meshes guardian.js animates). Unit boxes scaled.
function face(k, rig, mats, o = {}) {
  const y = o.eyeY ?? 0.6
  const sp = o.eyeSpread ?? 0.2
  const z = o.z ?? 0.53
  rig.eyes = [-1, 1].map((s) => k.solo(rig.head, mats.eye, o.eyeW ?? 0.2, 0.13, 0.06, s * sp, y, z))
  rig.brows = [-1, 1].map((s) => k.solo(rig.head, mats.brow, o.browW ?? 0.32, o.browH ?? 0.1, 0.1, s * (sp + 0.02), y + 0.18, z - 0.03, 0, 0, -s * 0.15))
  rig.mouth = k.solo(rig.head, mats.mouth, o.mouthW ?? 0.36, 0.06, 0.06, 0, o.mouthY ?? 0.3, z - 0.01 + (o.mouthZ ?? 0))
}

// --- The twelve giants ---------------------------------------------------------------------
// Each returns { tint: [materials that turn red in a rage], fx: {...} } after dressing the rig.
const GIANTS = {
  // Common: the Mummy Warrior. Bandages, a gold-and-lapis collar, a glowing scarab,
  // trailing bandage ends that flutter as it runs.
  desert(k, rig, look, seed) {
    const t = bandage(look.wrap, look.wrap2, seed)
    const W = std('#ffffff', { map: t, rough: 0.85 })
    const W2 = std('#d8d8e0', { map: t, rough: 0.85 })
    const faceM = std(new Color(look.wrap2).multiplyScalar(0.45), { rough: 0.9 })
    const gold = std('#ffcf3a', { rough: 0.3, metal: 0.3 })
    const lapis = std('#2047c8', { rough: 0.35, metal: 0.2 })
    const turq = std('#2fd0c0', { rough: 0.35 })
    const scarab = k.pulse(glowM('#3affd0', 2.2), 0.4, 2)
    Object.assign(rig, body(k, rig.root, { skin: W, skin2: W2, foot: faceM, hand: faceM }))
    const { hips, spine, head } = rig
    k.box(hips, W, 1.56, 0.22, 0.98, 0, 0.22, 0) // belt wrap
    k.box(hips, gold, 1.6, 0.1, 1.02, 0, 0.3, 0)
    const front = k.dangle(hips, 0, -0.15, 0.49, { amp: 0.05, lean: 0.06 })
    k.box(front, W2, 0.7, 0.75, 0.08, 0, -0.38, 0)
    k.box(front, gold, 0.74, 0.08, 0.1, 0, -0.74, 0)
    const back = k.dangle(hips, 0, -0.15, -0.49, { amp: 0.05, lean: -0.06 })
    k.box(back, W2, 0.8, 0.65, 0.08, 0, -0.33, 0)
    // Broad collar: gold, lapis and turquoise bands over the chest.
    k.box(spine, gold, 1.62, 0.14, 0.72, 0, 1.76, 0.05)
    k.box(spine, lapis, 1.5, 0.14, 0.1, 0, 1.6, 0.56)
    k.box(spine, turq, 1.36, 0.12, 0.1, 0, 1.47, 0.57)
    k.box(spine, gold, 1.2, 0.12, 0.1, 0, 1.35, 0.58)
    k.gem(spine, scarab, 0.17, 0, 1.08, 0.58, Math.PI / 2, 0, 0, 1.3)
    k.box(spine, gold, 0.42, 0.06, 0.08, 0, 1.08, 0.6) // scarab wings
    k.box(spine, W, 0.3, 1.3, 1.1, 0.5, 1.05, 0, 0, 0, 0.5) // diagonal sash
    // Head: face slit, wraps, a loose end.
    k.box(head, faceM, 0.8, 0.42, 0.06, 0, 0.56, 0.5)
    k.box(head, W2, 1.1, 0.14, 1.04, 0, 0.92, 0, 0, 0, 0.06)
    k.box(head, W2, 1.1, 0.12, 1.04, 0, 0.2, 0, 0, 0, -0.05)
    const tail = k.dangle(head, 0.5, 0.5, -0.3, { axis: 'z', base: -0.2, amp: 0.15, freq: 2.4, lean: 0 })
    k.box(tail, W, 0.14, 0.9, 0.06, 0, -0.45, 0)
    for (const a of rig.arms) {
      k.box(a.elbow, gold, 0.66, 0.2, 0.66, 0, -0.84, 0)
      k.box(a.elbow, lapis, 0.68, 0.06, 0.68, 0, -0.84, 0)
      const strip = k.dangle(a.elbow, 0, -0.5, -0.29, { amp: 0.25, freq: 3, lean: 0.12 })
      k.box(strip, W, 0.18, 1.0, 0.04, 0, -0.5, 0)
    }
    for (const l of rig.legs) k.box(l.knee, W, 0.7, 0.18, 0.76, 0, -0.08, 0)
    face(k, rig, { eye: rig.eyeMat, brow: W, mouth: rig.darkMat })
    return { tint: [W, W2, faceM], fx: { aura: 'sand', step: 'sand', voice: 'mummy', roar: 'default', dust: '#ecd59a' } }
  },

  // Uncommon: the Jungle Brute. Gorilla shoulders, mossy hide, tusks, war paint, a
  // bone necklace and a leaf skirt; beats its chest when it roars.
  jungle(k, rig, look, seed) {
    const [c1] = mottle('#4f8a32', ['#2f5a1e', '#7fbf4a', '#3a6a28'], seed, { alpha: 0.5 })
    const skin = std('#ffffff', { map: tex(c1), rough: 0.9 })
    const skin2 = std('#c8d8c0', { map: skin.map, rough: 0.9 })
    const [c2] = mottle('#2b2418', ['#4a3a22', '#141008'], seed + 1, { blobs: 90, r0: 3, r1: 10, alpha: 0.6, speck: 1500, speckA: 0.3 })
    const fur = std('#ffffff', { map: tex(c2), rough: 1 })
    const leaf = std('#3fbf3a', { rough: 0.6 })
    const leaf2 = std('#2a8a2a', { rough: 0.6 })
    const bone = std('#f2ead2', { rough: 0.5 })
    const vine = std('#2d6b2a', { rough: 0.8 })
    const paint = std('#ffcf3a', { rough: 0.5 })
    const wood = std('#7a4a26', { rough: 0.8 })
    Object.assign(rig, body(k, rig.root, { skin, skin2, foot: fur, hand: fur, pelvis: fur }, { chest: 1.2, arm: 1.25, hand: 1.4, leg: 1.08 }))
    const { hips, spine, head } = rig
    // Hunched brow, heavy jaw, tusks, little ears, moss on the scalp.
    k.box(head, fur, 1.12, 0.24, 0.34, 0, 0.82, 0.38)
    k.box(head, skin2, 0.92, 0.32, 0.34, 0, 0.2, 0.42)
    for (const s of [-1, 1]) {
      k.cone(head, bone, 0.07, 0.34, s * 0.32, 0.46, 0.58, 0, 0, s * 0.25, 5)
      k.box(head, skin2, 0.14, 0.26, 0.2, s * 0.58, 0.6, 0)
      k.box(head, paint, 0.06, 0.32, 0.04, s * 0.32, 0.5, 0.52) // war paint under the eyes
    }
    k.box(head, fur, 1.0, 0.24, 0.9, 0, 1.08, -0.04)
    k.ball(head, leaf2, 0.22, 0.22, 1.2, 0.1, 1, 0.6, 1)
    k.ball(head, leaf, 0.18, -0.25, 1.2, -0.15, 1, 0.6, 1)
    // Shoulder fur humps and chest.
    for (const a of rig.arms) {
      k.box(a.shoulder, fur, 0.98, 0.6, 0.96, 0, 0.05, 0, 0, 0, a.side * -0.15)
      k.box(a.elbow, wood, 0.74, 0.16, 0.74, 0, -0.82, 0)
      k.box(a.elbow, wood, 0.74, 0.12, 0.74, 0, -0.62, 0)
      const v = k.dangle(a.elbow, 0, -0.3, -0.3, { amp: 0.2, freq: 2.6, lean: 0.1 })
      k.box(v, vine, 0.08, 0.7, 0.08, 0, -0.35, 0)
      k.box(v, leaf, 0.22, 0.12, 0.04, 0, -0.66, 0.04)
    }
    k.box(spine, fur, 2.2, 0.36, 1.1, 0, 1.6, -0.05)
    for (let i = 0; i < 3; i++) k.box(spine, paint, 0.9 - i * 0.2, 0.07, 0.06, 0, 1.38 - i * 0.16, 0.56)
    k.box(spine, vine, 0.14, 1.6, 1.16, 0.2, 1.0, 0, 0, 0, 0.7)
    for (let i = 0; i < 9; i++) {
      const a = -0.9 + (i / 8) * 1.8
      k.cone(spine, bone, 0.07, 0.26, Math.sin(a) * 0.75, 1.62 - Math.cos(a) * 0.2, 0.6, Math.PI, 0, 0, 4)
    }
    k.ball(spine, bone, 0.14, 0, 1.38, 0.6, 1.2, 1, 0.8) // skull pendant
    // Leaf skirt (front + back swing).
    k.box(hips, vine, 1.6, 0.14, 1.0, 0, 0.26, 0)
    for (const [z, lean] of [[0.5, 0.07], [-0.5, -0.07]]) {
      const d = k.dangle(hips, 0, -0.1, z, { amp: 0.05, lean })
      for (let i = 0; i < 5; i++) k.box(d, i % 2 ? leaf : leaf2, 0.3, 0.8, 0.05, -0.6 + i * 0.3, -0.38, 0, 0, 0, (i - 2) * 0.12)
    }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.box(hips, i % 2 ? leaf : leaf2, 0.05, 0.7, 0.3, s * 0.78, -0.4, -0.3 + i * 0.3, 0, 0, s * 0.15)
    face(k, rig, { eye: rig.eyeMat, brow: fur, mouth: rig.darkMat }, { mouthY: 0.22, mouthZ: 0.2, mouthW: 0.5 })
    return { tint: [skin, skin2], fx: { aura: 'leaf', step: 'leaf', voice: 'brute', roar: 'chestbeat', dust: '#8a6a3a' } }
  },

  // Rare: the Frost Giant. Pale blue hide, a white fur mantle, ice spikes growing from its
  // shoulders and back, an icicle beard; frosty breath puffs from its mouth.
  ice(k, rig, look, seed) {
    const [c1] = mottle('#a8dcff', ['#ffffff', '#6ab0e8', '#d8f4ff'], seed, { alpha: 0.45 })
    crackLines(c1.getContext('2d'), 256, seed, 'rgba(255,255,255,0.5)', 1.2, 10)
    const skin = std('#ffffff', { map: tex(c1), rough: 0.6 })
    const skin2 = std('#c8e4f8', { map: skin.map, rough: 0.6 })
    const [c2] = mottle('#f4f8ff', ['#c8d8f0', '#ffffff'], seed + 1, { blobs: 120, r0: 3, r1: 8, alpha: 0.6, speck: 1200, speckA: 0.15 })
    const fur = std('#ffffff', { map: tex(c2), rough: 1 })
    const ice = std('#aef0ff', { rough: 0.08, metal: 0.1, flat: true, emissive: '#2ab8ff', ei: 0.45 })
    const iceGlow = k.pulse(glowM('#7af0ff', 1.8), 0.3, 1.4)
    const leather = std('#34466e', { rough: 0.8 })
    Object.assign(rig, body(k, rig.root, { skin, skin2, foot: fur, hand: skin2, pelvis: leather }, { chest: 1.12, arm: 1.12, hand: 1.18, leg: 1.05 }))
    const { hips, spine, head } = rig
    k.box(spine, fur, 2.5, 0.5, 1.36, 0, 1.68, 0)
    k.box(spine, fur, 2.2, 0.3, 1.2, 0, 1.4, 0.02)
    k.box(spine, leather, 0.22, 1.5, 1.14, -0.35, 0.95, 0, 0, 0, -0.55)
    k.gem(spine, iceGlow, 0.16, 0, 1.25, 0.6, 0, 0, 0, 1.2)
    // Back spikes.
    for (let i = 0; i < 4; i++) k.gem(spine, ice, 0.2 + i * 0.03, (i % 2 ? 0.35 : -0.35) * (i < 2 ? 1 : 0.5), 1.7 - i * 0.3, -0.62, -0.7, 0, (i % 2 ? -0.3 : 0.3), 2.4)
    for (const a of rig.arms) {
      k.gem(a.shoulder, ice, 0.26, a.side * 0.2, 0.42, 0, 0, 0, -a.side * 0.5, 2.6)
      k.gem(a.shoulder, ice, 0.18, a.side * 0.38, 0.3, -0.25, -0.4, 0, -a.side * 0.9, 2.2)
      k.box(a.shoulder, fur, 0.9, 0.36, 0.9, 0, -0.02, 0)
      k.box(a.elbow, fur, 0.7, 0.24, 0.7, 0, -0.78, 0)
    }
    // Fur loincloth + boot tops.
    k.box(hips, fur, 1.62, 0.3, 1.02, 0, 0.2, 0)
    const lc = k.dangle(hips, 0, -0.1, 0.5, { amp: 0.04, lean: 0.06 })
    k.box(lc, fur, 0.8, 0.8, 0.1, 0, -0.4, 0)
    for (const l of rig.legs) k.box(l.knee, fur, 0.78, 0.36, 0.82, 0, -0.62, 0)
    // Icicle beard + ice crown + bushy white brows.
    for (let i = 0; i < 7; i++) {
      const x = -0.36 + i * 0.12
      k.cone(head, ice, 0.07, 0.3 + (1 - Math.abs(x) * 2) * 0.3, x, 0.04 - (1 - Math.abs(x) * 2) * 0.12, 0.47, Math.PI, 0, 0, 5)
    }
    k.box(head, fur, 1.0, 0.16, 0.2, 0, 0.18, 0.46)
    for (let i = 0; i < 5; i++) k.gem(head, ice, 0.1 + (i === 2 ? 0.06 : 0), -0.4 + i * 0.2, 1.18 + (i === 2 ? 0.1 : 0), 0.1, 0, 0, (i - 2) * -0.2, 2.6)
    k.box(head, fur, 1.1, 0.2, 1.04, 0, 1.0, 0)
    face(k, rig, { eye: rig.eyeMat, brow: fur, mouth: rig.darkMat }, { browH: 0.16 })
    return { tint: [skin, skin2], fx: { aura: 'frost', step: 'ice', voice: 'frost', roar: 'default', breath: '#e8f8ff', dust: '#ffffff' } }
  },

  // Epic: the Void Golem. Cracked violet stone with glowing seams, a pulsing core, a
  // crystal spine and three shards orbiting its head.
  crystal(k, rig, look, seed) {
    const [c1] = mottle('#4a2c8a', ['#2a1660', '#6a4ab0'], seed, { alpha: 0.5 })
    crackLines(c1.getContext('2d'), 256, seed, '#160a30', 2.4)
    const rock = std('#ffffff', { map: tex(c1), rough: 0.9, flat: true })
    const rock2 = std('#b8a8d8', { map: rock.map, rough: 0.9, flat: true })
    const seam = k.pulse(glowM('#c44dff', 2.6), 0.45, 2.6)
    const core = k.pulse(glowM('#ff6af0', 3.2), 0.5, 3.2)
    const crystal = std('#e6b4ff', { rough: 0.12, flat: true, emissive: '#9a3aff', ei: 0.9 })
    Object.assign(rig, body(k, rig.root, { skin: rock, skin2: rock2, foot: rock2, hand: rock }, { chest: 1.22, arm: 1.18, hand: 1.45, leg: 1.1 }))
    const { hips, spine, head } = rig
    // Boulder plates (rotated so the silhouette is lumpy).
    k.box(spine, rock2, 1.0, 0.7, 0.4, -0.45, 1.3, 0.45, 0.2, 0.3, 0.2)
    k.box(spine, rock, 0.9, 0.6, 0.4, 0.5, 1.1, 0.44, -0.15, -0.25, -0.2)
    k.box(spine, rock2, 1.6, 0.7, 0.5, 0, 1.4, -0.5, -0.2, 0, 0.1)
    k.gem(spine, core, 0.26, 0, 1.2, 0.6, 0, 0.6, 0, 1.2)
    for (const [x, y, rz, h] of [[0.3, 1.5, 0.6, 0.7], [-0.32, 1.0, -0.5, 0.8], [0.45, 0.6, -0.2, 0.6], [-0.2, 0.45, 0.3, 0.5]]) k.box(spine, seam, 0.06, h, 0.05, x, y, 0.56, 0, 0, rz)
    for (let i = 0; i < 5; i++) k.gem(spine, crystal, 0.18 + (i % 3) * 0.05, -0.5 + i * 0.25, 1.65 + (i % 2) * 0.15, -0.55, -0.5, 0, (i - 2) * -0.25, 2.6)
    for (const a of rig.arms) {
      k.box(a.shoulder, rock, 0.95, 0.7, 0.95, a.side * 0.05, 0.05, 0, 0.2, 0.3, a.side * -0.2)
      k.gem(a.shoulder, crystal, 0.18, a.side * 0.25, 0.5, 0, 0, 0, -a.side * 0.4, 2.4)
      k.box(a.elbow, rock2, 0.95, 0.75, 0.92, 0, -1.1, 0.02, 0.25, 0.2, 0.1) // boulder fist
      k.box(a.elbow, seam, 0.05, 0.7, 0.05, 0, -0.45, 0.3)
    }
    for (const l of rig.legs) {
      k.box(l.knee, rock, 0.78, 0.4, 0.82, 0, -0.05, 0.02, 0.2, 0.2, 0)
      k.box(l.hip, seam, 0.05, 0.7, 0.05, 0, -0.5, 0.39)
    }
    k.box(hips, rock2, 1.7, 0.4, 1.0, 0, 0.1, 0, 0.05, 0.1, 0.04)
    // Head: a rough block with a brow ridge; shards orbiting above.
    k.box(head, rock2, 1.16, 0.3, 0.4, 0, 0.84, 0.32, 0.1, 0, 0.05)
    k.box(head, rock, 0.9, 0.3, 0.9, 0.05, 1.1, -0.05, 0.2, 0.3, 0.1)
    const orbit = k.spin(head, 0, 1.55, 0, { speed: 1.4, bob: 0.08 })
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU
      k.gem(orbit, i === 0 ? core : crystal, 0.16, Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95, 0.3, a, 0.4, 2)
    }
    face(k, rig, { eye: rig.eyeMat, brow: rock2, mouth: seam }, { mouthW: 0.5 })
    return { tint: [rock, rock2], fx: { aura: 'void', step: 'void', voice: 'golem', roar: 'flex', dust: '#8a6ac8' } }
  },

  // Legendary: the Golden Pharaoh. Gilded skin, a striped headdress with lappets, a cobra
  // on the brow, a ceremonial beard, broad collar, white kilt and an ankh pendant.
  gold(k, rig, look, seed) {
    const [c1] = mottle('#f2c24a', ['#fff0a0', '#c8902a'], seed, { alpha: 0.3, speckA: 0.06 })
    const skin = std('#ffffff', { map: tex(c1), rough: 0.35, metal: 0.15, emissive: '#5a3a00', ei: 0.25 })
    const skin2 = std('#f0e2c8', { map: skin.map, rough: 0.35, metal: 0.15, emissive: '#5a3a00', ei: 0.2 })
    const gold = std('#ffd23a', { rough: 0.25, metal: 0.3 })
    const lapis = std('#1d3fb8', { rough: 0.35, metal: 0.2 })
    const turq = std('#2fd0c0', { rough: 0.35 })
    const linen = std('#f6f0de', { rough: 0.8 })
    const nemes = std('#ffffff', { map: stripes('#ffcf3a', '#1d3fb8', seed, { n: 9 }), rough: 0.4, metal: 0.3 })
    const ankh = k.pulse(glowM('#5affff', 2.4), 0.35, 1.8)
    Object.assign(rig, body(k, rig.root, { skin, skin2, foot: gold, hand: skin, pelvis: linen }, { chest: 1.06 }))
    const { hips, spine, head } = rig
    // Nemes headdress: cap, lappets down the front, tail at the back, brow band, cobra.
    k.box(head, nemes, 1.18, 0.5, 1.12, 0, 0.92, -0.02)
    k.box(head, gold, 1.2, 0.12, 1.14, 0, 0.72, 0)
    for (const s of [-1, 1]) {
      k.box(head, nemes, 0.18, 0.9, 0.98, s * 0.62, 0.42, -0.04)
      k.box(head, nemes, 0.4, 1.1, 0.16, s * 0.6, -0.42, 0.32)
    }
    k.box(head, nemes, 0.5, 0.9, 0.2, 0, 0.2, -0.62, -0.25)
    k.box(head, gold, 0.1, 0.3, 0.1, 0, 0.86, 0.6)
    k.ball(head, gold, 0.1, 0, 1.02, 0.6, 1, 1.3, 0.8)
    k.gem(head, ankh, 0.05, 0, 1.06, 0.66, 0, 0, 0, 1)
    // Ceremonial beard.
    k.box(head, lapis, 0.18, 0.56, 0.18, 0, 0.02, 0.44)
    for (let i = 0; i < 4; i++) k.box(head, gold, 0.2, 0.05, 0.2, 0, -0.18 + i * 0.13, 0.44)
    // Broad collar.
    k.box(spine, gold, 1.7, 0.16, 0.74, 0, 1.76, 0.04)
    k.box(spine, lapis, 1.6, 0.13, 0.1, 0, 1.6, 0.57)
    k.box(spine, turq, 1.46, 0.12, 0.1, 0, 1.47, 0.58)
    k.box(spine, gold, 1.3, 0.12, 0.1, 0, 1.35, 0.59)
    // Ankh pendant.
    k.box(spine, ankh, 0.07, 0.36, 0.05, 0, 0.96, 0.58)
    k.box(spine, ankh, 0.24, 0.07, 0.05, 0, 1.08, 0.58)
    k.ring(spine, ankh, 0.09, 0.3, 0, 1.22, 0.58)
    // Kilt with a gold belt and a striped apron.
    k.box(hips, linen, 1.62, 0.7, 1.02, 0, -0.18, 0)
    k.box(hips, gold, 1.66, 0.16, 1.06, 0, 0.24, 0)
    const apron = k.dangle(hips, 0, 0.1, 0.53, { amp: 0.04, lean: 0.05 })
    k.box(apron, nemes, 0.5, 0.95, 0.06, 0, -0.48, 0)
    for (const a of rig.arms) {
      k.box(a.shoulder, gold, 0.7, 0.16, 0.7, 0, -0.5, 0)
      k.box(a.elbow, gold, 0.64, 0.3, 0.64, 0, -0.8, 0)
      k.box(a.elbow, lapis, 0.66, 0.07, 0.66, 0, -0.8, 0)
    }
    for (const l of rig.legs) k.box(l.knee, gold, 0.68, 0.14, 0.74, 0, -0.84, 0)
    face(k, rig, { eye: rig.eyeMat, brow: lapis, mouth: rig.darkMat })
    return { tint: [skin, skin2], fx: { aura: 'gold', step: 'gold', voice: 'pharaoh', roar: 'flex', dust: '#ffe68a' } }
  },

  // Mythical: the Magma Ogre. Basalt hide whose cracks glow with lava, a crown of
  // flickering flames, curved horns, embers rising off it and smoke from its mouth.
  lava(k, rig, look, seed) {
    const [c1] = mottle('#2e211d', ['#1a1210', '#4a3028'], seed, { alpha: 0.5 })
    crackLines(c1.getContext('2d'), 256, seed, '#ff5a10', 3)
    const [c2, x2] = canvas()
    x2.fillStyle = '#000000'
    x2.fillRect(0, 0, 256, 256)
    crackLines(x2, 256, seed, '#ffffff', 3)
    const glowMap = tex(c2)
    const basalt = new MeshStandardMaterial({ map: tex(c1), emissiveMap: glowMap, emissive: '#ff6a1a', emissiveIntensity: 2.2, roughness: 0.9 })
    const basalt2 = new MeshStandardMaterial({ map: basalt.map, emissiveMap: glowMap, emissive: '#ff4a10', emissiveIntensity: 1.6, roughness: 0.9, color: '#c8b8b0' })
    k.pulse(basalt, 0.35, 1.7)
    k.pulse(basalt2, 0.35, 1.9)
    const horn = std('#1a1210', { rough: 0.5 })
    const hornTip = std('#f0e0c8', { rough: 0.5 })
    const core = k.pulse(glowM('#ffb03a', 3.2), 0.4, 2.4)
    const fire = flameM('#ff7a1a')
    const fire2 = flameM('#ffd23a')
    Object.assign(rig, body(k, rig.root, { skin: basalt, skin2: basalt2, foot: horn, hand: basalt2, pelvis: horn }, { chest: 1.26, arm: 1.22, hand: 1.35, leg: 1.12 }))
    const { hips, spine, head } = rig
    for (const s of [-1, 1]) {
      // Curved horns: three segments sweeping out and up.
      k.cone(head, horn, 0.2, 0.5, s * 0.62, 0.95, 0, 0, 0, -s * 1.2, 6)
      k.cone(head, horn, 0.15, 0.45, s * 0.92, 1.18, 0, 0, 0, -s * 0.5, 6)
      k.cone(head, hornTip, 0.09, 0.32, s * 1.02, 1.5, 0, 0, 0, s * 0.15, 6)
      k.cone(head, hornTip, 0.08, 0.28, s * 0.26, 0.4, 0.56, 0, 0, 0, 5) // tusks
    }
    k.box(head, basalt2, 1.12, 0.22, 0.3, 0, 0.82, 0.38)
    for (let i = 0; i < 5; i++) {
      const f = k.pivot(head, -0.36 + i * 0.18, 1.04, (i % 2) * 0.12 - 0.05)
      k.solo(f, i % 2 ? fire2 : fire, 0.16, 0.5 + (i === 2 ? 0.25 : 0), 0.16, 0, 0.25, 0, 0, 0, 0, coneGeo(6))
      k.flicker(f, 12 + i * 3)
    }
    k.gem(spine, core, 0.28, 0, 1.22, 0.58, 0, 0.6, 0, 1)
    for (const a of rig.arms) {
      for (let i = 0; i < 3; i++) k.cone(a.shoulder, horn, 0.12, 0.42, a.side * (0.1 + i * 0.12), 0.32 - i * 0.05, -0.2 + i * 0.2, 0, 0, -a.side * (0.3 + i * 0.2), 5)
      k.box(a.shoulder, basalt2, 0.92, 0.5, 0.9, 0, 0.0, 0, 0, 0.2, 0)
      k.box(a.elbow, horn, 0.66, 0.2, 0.66, 0, -0.8, 0)
    }
    k.box(hips, horn, 1.7, 0.2, 1.06, 0, 0.24, 0)
    for (let i = 0; i < 6; i++) k.cone(hips, hornTip, 0.08, 0.24, -0.65 + i * 0.26, 0.1, 0.55, Math.PI, 0, 0, 4)
    const lc = k.dangle(hips, 0, -0.05, 0.52, { amp: 0.04, lean: 0.05 })
    k.box(lc, horn, 0.7, 0.7, 0.08, 0, -0.35, 0)
    face(k, rig, { eye: rig.eyeMat, brow: horn, mouth: core }, { mouthW: 0.5, mouthY: 0.26 })
    return { tint: [basalt, basalt2], fx: { aura: 'ember', step: 'lava', voice: 'magma', roar: 'flex', breath: '#3a2a28', dust: '#5a4a48' } }
  },

  // Secret: the Crimson Oni. Red hide, a wild white mane, great horns, fangs, a
  // tiger-stripe loincloth, prayer beads and a studded club slung on its back.
  spikes(k, rig, look, seed) {
    const [c1] = mottle('#d0303a', ['#a01820', '#ff5a5a'], seed, { alpha: 0.45 })
    const skin = std('#ffffff', { map: tex(c1), rough: 0.6 })
    const skin2 = std('#d8c0c0', { map: skin.map, rough: 0.6 })
    const [c2] = mottle('#f4f4f4', ['#c8c8d0', '#ffffff'], seed + 1, { blobs: 80, r0: 3, r1: 9, alpha: 0.6 })
    const hair = std('#ffffff', { map: tex(c2), rough: 0.9 })
    const horn = std('#f4e6c8', { rough: 0.45 })
    const tiger = std('#ffffff', { map: stripes('#ffb81f', '#1a1210', seed, { n: 7, tiger: true }), rough: 0.7 })
    const iron = std('#4a4e5a', { rough: 0.35, metal: 0.8 })
    const club = std('#2a1a14', { rough: 0.7 })
    const bead = std('#3a2218', { rough: 0.4 })
    const gold = std('#ffcf3a', { rough: 0.3, metal: 0.3 })
    Object.assign(rig, body(k, rig.root, { skin, skin2, foot: skin2, hand: skin, pelvis: tiger }, { chest: 1.14, arm: 1.16, hand: 1.22 }))
    const { hips, spine, head } = rig
    // Mane: spikes radiating behind and above, a back lock that swings.
    for (let i = 0; i < 9; i++) {
      const a = -1.2 + (i / 8) * 2.4
      k.cone(head, hair, 0.2, 0.7, Math.sin(a) * 0.55, 0.95 + Math.cos(a) * 0.25, -0.25, -0.7, 0, -a * 0.8, 5)
    }
    k.box(head, hair, 1.12, 0.3, 1.04, 0, 1.0, -0.04)
    const lock = k.dangle(head, 0, 0.7, -0.5, { base: 0.25, amp: 0.1, freq: 2, lean: 0.06 })
    for (let i = 0; i < 4; i++) k.cone(lock, hair, 0.16, 0.9, -0.36 + i * 0.24, -0.4, 0, Math.PI, 0, (i - 1.5) * 0.15, 5)
    for (const s of [-1, 1]) {
      k.cone(head, horn, 0.17, 0.75, s * 0.36, 1.45, 0.1, -0.2, 0, -s * 0.35, 6)
      k.cone(head, horn, 0.06, 0.2, s * 0.22, 0.24, 0.55, Math.PI, 0, 0, 4) // fangs
      k.box(head, skin2, 0.12, 0.3, 0.24, s * 0.58, 0.6, 0) // pointed ears
    }
    k.box(head, skin2, 0.9, 0.18, 0.2, 0, 0.82, 0.44, -0.2) // furrowed brow
    // Prayer beads across the chest, tiger cloth, bracers.
    for (let i = 0; i < 13; i++) {
      const a = (i / 12) * Math.PI
      k.ball(spine, i === 6 ? gold : bead, i === 6 ? 0.13 : 0.1, Math.cos(a) * 0.82, 1.7 - Math.sin(a) * 0.55, 0.56)
    }
    k.box(hips, tiger, 1.62, 0.36, 1.02, 0, 0.18, 0)
    const flap = k.dangle(hips, 0, -0.1, 0.52, { amp: 0.05, lean: 0.06 })
    k.box(flap, tiger, 0.8, 0.8, 0.08, 0, -0.4, 0)
    k.box(hips, club, 1.66, 0.1, 1.06, 0, 0.36, 0)
    for (const a of rig.arms) {
      k.box(a.elbow, iron, 0.66, 0.42, 0.66, 0, -0.7, 0)
      for (let i = 0; i < 3; i++) k.cone(a.elbow, iron, 0.06, 0.18, a.side * 0.35, -0.6 - i * 0.12, 0, 0, 0, -a.side * Math.PI / 2, 4)
    }
    // Kanabo club slung across the back.
    const back = k.pivot(spine, 0, 1.1, -0.62)
    k.cyl(back, club, 0.2, 0.1, 2.8, 0, 0, 0, 0, 0, 0.75, 8)
    k.box(back, gold, 0.24, 0.08, 0.24, -0.5, -0.55, 0, 0, 0, 0.75)
    for (let i = 0; i < 8; i++) {
      const t = 0.15 + (i / 7) * 0.8
      const ang = (i * 2.1) % TAU
      k.cone(back, iron, 0.05, 0.16, -Math.sin(0.75) * (t * 1.4) + Math.cos(ang) * 0.02, Math.cos(0.75) * (t * 1.4), Math.sin(ang) * 0.17, ang, 0, 0.75, 4)
    }
    face(k, rig, { eye: rig.eyeMat, brow: hair, mouth: rig.darkMat }, { browH: 0.14, mouthW: 0.5 })
    return { tint: [skin, skin2], fx: { aura: 'oni', step: 'thud', voice: 'oni', roar: 'stomp', dust: '#5a1a20' } }
  },

  // Eternal: the Silver Sentinel. Riveted silver armour, a crested helm with a glowing
  // visor, pauldrons, a round shield on its back and a long blue cape.
  marble(k, rig, look, seed) {
    const steel = std('#ffffff', { map: plates('#d8dce8', '#5a6078', seed), rough: 0.35, metal: 0.5 })
    const steel2 = std('#c8ccd8', { map: steel.map, rough: 0.4, metal: 0.5 })
    const gold = std('#ffcf3a', { rough: 0.25, metal: 0.3 })
    const cape = std('#2447c8', { rough: 0.7, double: true })
    const plume = std('#e3141b', { rough: 0.8 })
    const visor = k.pulse(glowM('#4ab8ff', 2.6), 0.25, 1.6)
    const leather = std('#3a2a20', { rough: 0.8 })
    Object.assign(rig, body(k, rig.root, { skin: steel, skin2: steel2, foot: steel2, hand: steel2, pelvis: leather }, { chest: 1.1, arm: 1.06, hand: 1.08 }))
    const { hips, spine, head } = rig
    // Helm: dome, cheek guards, nasal, crest.
    k.box(head, steel2, 1.18, 0.46, 1.1, 0, 0.88, 0)
    for (const s of [-1, 1]) k.box(head, steel2, 0.12, 0.8, 1.04, s * 0.56, 0.42, 0)
    k.box(head, steel2, 1.14, 0.3, 0.16, 0, 0.3, 0.5)
    k.box(head, gold, 0.1, 0.42, 0.1, 0, 0.62, 0.56)
    k.box(head, visor, 0.8, 0.07, 0.04, 0, 0.6, 0.52)
    k.box(head, gold, 0.16, 0.14, 1.14, 0, 1.13, 0)
    for (let i = 0; i < 7; i++) k.box(head, plume, 0.14, 0.3 + Math.sin((i / 6) * Math.PI) * 0.25, 0.18, 0, 1.2, 0.5 - i * 0.17, -0.3 + i * 0.12)
    // Breastplate emblem, belt, tassets.
    k.box(spine, steel2, 1.7, 0.9, 0.12, 0, 1.15, 0.56)
    k.gem(spine, visor, 0.14, 0, 1.25, 0.64, Math.PI / 2, 0, 0, 1.4)
    k.ring(spine, gold, 0.24, 0.16, 0, 1.25, 0.63)
    k.box(hips, gold, 1.62, 0.14, 1.04, 0, 0.28, 0)
    for (const s of [-1, 0, 1]) k.box(hips, steel2, 0.5, 0.6, 0.1, s * 0.52, -0.25, 0.5, 0.1)
    for (const a of rig.arms) {
      k.box(a.shoulder, steel2, 1.0, 0.5, 0.98, a.side * 0.08, 0.06, 0)
      k.box(a.shoulder, steel, 0.94, 0.3, 0.92, a.side * 0.12, -0.24, 0)
      k.box(a.shoulder, gold, 1.04, 0.07, 1.02, a.side * 0.08, 0.32, 0)
      k.box(a.elbow, steel2, 0.68, 0.5, 0.68, 0, -0.72, 0)
    }
    for (const l of rig.legs) {
      k.box(l.knee, steel2, 0.74, 0.34, 0.24, 0, -0.05, 0.3)
      k.box(l.knee, gold, 0.3, 0.1, 0.1, 0, -0.05, 0.43)
    }
    // Shield on the back, cape below it.
    const sh = k.pivot(spine, 0, 1.15, -0.6)
    k.cyl(sh, steel2, 0.75, 0.75, 0.12, 0, 0, 0, Math.PI / 2, 0, 0, 18)
    k.ring(sh, gold, 0.75, 0.07, 0, 0, -0.07)
    k.gem(sh, visor, 0.16, 0, 0, -0.1, Math.PI / 2, 0, 0, 1)
    const cp = k.dangle(spine, 0, 1.7, -0.75, { base: 0.08, amp: 0.05, freq: 1.3, lean: 0.035 })
    k.box(cp, cape, 1.7, 2.6, 0.06, 0, -1.3, 0)
    k.box(cp, gold, 1.72, 0.08, 0.08, 0, -2.58, 0)
    face(k, rig, { eye: rig.eyeMat, brow: steel2, mouth: rig.darkMat }, { z: 0.54, mouthZ: 0.06, mouthY: 0.32 })
    return { tint: [cape, plume], fx: { aura: 'silver', step: 'metal', voice: 'sentinel', roar: 'flex', dust: '#d8d8e8' } }
  },

  // Divine: the Prism Titan. Faceted white crystal, a row of rainbow gems, a floating
  // halo, prism shards circling it and crystal wings that slowly beat.
  rainbow(k, rig, look, seed) {
    const crys = std('#ffffff', { rough: 0.15, metal: 0.1, flat: true, emissive: '#ffd0f0', ei: 0.25 })
    const crys2 = std('#ffd6f6', { rough: 0.15, metal: 0.1, flat: true, emissive: '#d0e0ff', ei: 0.2 })
    const halo = k.pulse(glowM('#fff3a6', 3), 0.3, 2)
    const cols = ['#ff4a4a', '#ff9a1f', '#ffe14a', '#5bff6a', '#3fa2ff', '#a35bff'].map((c) => k.pulse(glowM(c, 2.6), 0.3, 1.5 + Math.random()))
    const wing = std('#ffffff', { rough: 0.2, flat: true, emissive: '#c8e8ff', ei: 0.35, double: true })
    Object.assign(rig, body(k, rig.root, { skin: crys, skin2: crys2, foot: crys2, hand: crys }, { chest: 1.02 }))
    const { hips, spine, head } = rig
    cols.forEach((m, i) => k.gem(spine, m, 0.13, -0.62 + i * 0.25, 1.35 + Math.sin((i / 5) * Math.PI) * 0.15, 0.58, 0, 0, 0, 1.4))
    k.gem(spine, halo, 0.24, 0, 0.9, 0.56, 0, 0.6, 0, 1.4)
    for (const a of rig.arms) {
      k.gem(a.shoulder, crys2, 0.5, a.side * 0.12, 0.1, 0, 0, 0.6, 0, 0.9)
      k.gem(a.elbow, crys, 0.36, 0, -0.75, 0, 0, 0.6, 0, 1.1)
    }
    for (const l of rig.legs) k.gem(l.knee, crys2, 0.38, 0, -0.05, 0.1, 0, 0.6, 0, 0.9)
    k.gem(hips, crys2, 0.85, 0, -0.1, 0, 0, 0.78, 0, 0.5)
    for (let i = 0; i < 5; i++) k.gem(head, cols[i], 0.08, -0.36 + i * 0.18, 1.12 + (i === 2 ? 0.12 : 0), 0.3, 0, 0, 0, 2.6)
    const hp = k.spin(head, 0, 1.55, 0, { speed: 0.8, bob: 0.06 })
    k.ring(hp, halo, 0.55, 0.12, 0, 0, 0, Math.PI / 2)
    const orbit = k.spin(rig.root, 0, 3.6, 0, { speed: -0.7, bob: 0.2, bobF: 1 })
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU
      k.gem(orbit, cols[(i * 2) % 6], 0.2, Math.cos(a) * 2.1, (i % 2) * 0.4, Math.sin(a) * 2.1, 0, a, 0, 2)
    }
    for (const s of [-1, 1]) {
      const w = k.dangle(spine, s * 0.4, 1.5, -0.55, { axis: 'y', base: s * 0.5, amp: 0.25, freq: 1.8, lean: 0 })
      for (let i = 0; i < 4; i++) k.box(w, wing, 1.6 - i * 0.25, 0.32, 0.05, s * (0.8 - i * 0.05), 0.4 - i * 0.36, -0.05 * i, 0, 0, s * (0.35 + i * 0.12))
    }
    face(k, rig, { eye: rig.eyeMat, brow: crys2, mouth: rig.darkMat })
    return { tint: [crys, crys2, wing], fx: { aura: 'prism', step: 'prism', voice: 'prism', roar: 'flex', dust: '#ffffff' } }
  },

  // Heavenly: the Sakura Ronin. A petal-print robe with wide sleeves, dark hakama, a straw
  // hat, a lacquered half mask, a long ponytail and a katana it reaches for when it roars.
  sakura(k, rig, look, seed) {
    const robe = std('#ffffff', { map: petals('#ffd6e8', '#ff7ab4', seed), rough: 0.7 })
    const [c2] = mottle('#5a2440', ['#3a1428', '#7a3458'], seed + 1, { alpha: 0.4 })
    const hakama = std('#ffffff', { map: tex(c2), rough: 0.85 })
    const skin = std('#f4d2c4', { rough: 0.6 })
    const obi = std('#2a1a2a', { rough: 0.6 })
    const straw = std('#ffffff', { map: stripes('#e8c078', '#c89848', seed, { n: 16 }), rough: 0.9 })
    const mask = std('#9a1a2a', { rough: 0.3, metal: 0.2 })
    const black = std('#151018', { rough: 0.4 })
    const gold = std('#ffcf3a', { rough: 0.3, metal: 0.3 })
    const hilt = std('#6a1a2a', { rough: 0.7 })
    const hairM = std('#1a1420', { rough: 0.6 })
    Object.assign(rig, body(k, rig.root, { skin: robe, skin2: robe, foot: straw, hand: skin, pelvis: hakama, thigh: hakama, shin: hakama, upper: robe, fore: skin, head: skin, belly: robe }, { chest: 1.02, leg: 1.25, arm: 1.0 }))
    const { hips, spine, head } = rig
    k.box(spine, robe, 1.5, 0.95, 0.9, 0, 0.42, 0)
    // V collar + obi.
    for (const s of [-1, 1]) k.box(spine, std('#ffffff', { rough: 0.6 }), 0.14, 1.1, 0.08, s * 0.22, 1.2, 0.56, 0, 0, s * 0.35)
    k.box(spine, obi, 1.46, 0.4, 0.94, 0, 0.12, 0)
    k.box(spine, gold, 1.48, 0.06, 0.96, 0, 0.3, 0)
    // Wide sleeves that swing.
    for (const a of rig.arms) {
      const sl = k.dangle(a.shoulder, 0, -0.5, 0, { amp: 0.06, lean: 0.06 })
      k.box(sl, robe, 0.9, 1.3, 0.9, 0, -0.4, -0.05)
    }
    // Hakama pleats.
    const pl = k.dangle(hips, 0, -0.1, 0.5, { amp: 0.04, lean: 0.05 })
    for (let i = 0; i < 5; i++) k.box(pl, hakama, 0.3, 1.5, 0.06, -0.6 + i * 0.3, -0.75, (i % 2) * 0.03)
    // Hat, mask, ponytail.
    k.cone(head, straw, 1.0, 0.45, 0, 1.28, 0, 0, 0, 0, 14)
    k.cyl(head, obi, 0.56, 0.56, 0.1, 0, 1.06, 0, 0, 0, 0, 14)
    k.box(head, mask, 0.9, 0.36, 0.12, 0, 0.26, 0.5)
    for (const s of [-1, 1]) k.cone(head, std('#ffffff', { rough: 0.4 }), 0.04, 0.12, s * 0.16, 0.12, 0.57, Math.PI, 0, 0, 4)
    const tail = k.dangle(head, 0, 0.8, -0.5, { base: 0.35, amp: 0.12, freq: 2.2, lean: 0.08 })
    k.box(tail, hairM, 0.16, 1.4, 0.16, 0, -0.7, 0)
    k.box(tail, gold, 0.2, 0.1, 0.2, 0, -0.05, 0)
    // Katana + wakizashi at the left hip.
    const sw = k.pivot(hips, -0.75, 0.1, 0.2)
    k.box(sw, black, 0.12, 0.12, 2.4, 0, 0, -0.6, 0.35, 0.1)
    k.box(sw, gold, 0.3, 0.3, 0.05, 0, 0.26, 0.6, 0.35, 0.1)
    k.box(sw, hilt, 0.1, 0.1, 0.7, 0, 0.42, 1.0, 0.35, 0.1)
    k.box(sw, black, 0.1, 0.1, 1.4, 0.18, 0.05, -0.2, 0.45, 0.15)
    for (const l of rig.legs) k.box(l.knee, black, 0.7, 0.06, 0.86, 0, -0.86, 0.1)
    face(k, rig, { eye: rig.eyeMat, brow: hairM, mouth: black }, { mouthY: 0.27, mouthZ: 0.06 })
    return { tint: [robe, hakama], fx: { aura: 'petal', step: 'petal', voice: 'ronin', roar: 'draw', dust: '#ffd0e4' } }
  },

  // Celestial: the Sky Warden. Night-sky armour scattered with stars, glowing cyan seams,
  // a domed helm, ringed pauldrons, a starry cape and three little planets in orbit.
  space(k, rig, look, seed) {
    const armor = std('#ffffff', { map: starfield('#1a2a6a', seed), rough: 0.35, metal: 0.5 })
    const armor2 = std('#a8b0d8', { map: armor.map, rough: 0.35, metal: 0.5 })
    const seam = k.pulse(glowM('#7af0ff', 2.6), 0.35, 2)
    const gold = std('#ffd23a', { rough: 0.25, metal: 0.3 })
    const cape = std('#ffffff', { map: starfield('#1b1f5a', seed + 7), rough: 0.6, double: true })
    const planets = ['#ff7ad9', '#ffd23a', '#7af0ff'].map((c) => k.pulse(glowM(c, 2.2), 0.25, 1.2))
    Object.assign(rig, body(k, rig.root, { skin: armor, skin2: armor2, foot: armor2, hand: armor2 }, { chest: 1.1, arm: 1.05, hand: 1.1 }))
    const { hips, spine, head } = rig
    k.ball(head, armor2, 0.62, 0, 0.62, -0.02, 1, 1, 1, 12)
    k.box(head, seam, 0.86, 0.06, 0.05, 0, 0.78, 0.52)
    for (const s of [-1, 1]) k.box(head, gold, 0.1, 0.5, 0.36, s * 0.58, 1.0, -0.1, -0.3, 0, -s * 0.3)
    k.box(head, gold, 0.12, 0.5, 0.12, 0, 1.25, 0)
    k.gem(head, seam, 0.07, 0, 1.55, 0, 0, 0, 0, 1.5)
    // Seams + emblem.
    k.gem(spine, seam, 0.2, 0, 1.25, 0.6, Math.PI / 2, 0, Math.PI / 4, 1)
    k.ring(spine, gold, 0.3, 0.12, 0, 1.25, 0.58)
    for (const s of [-1, 1]) k.box(spine, seam, 0.05, 1.1, 0.05, s * 0.6, 1.1, 0.55)
    k.box(hips, seam, 1.56, 0.05, 0.05, 0, 0.2, 0.49)
    for (const a of rig.arms) {
      k.box(a.shoulder, armor2, 0.96, 0.5, 0.94, a.side * 0.06, 0.05, 0)
      k.ring(a.shoulder, gold, 0.6, 0.06, a.side * 0.06, -0.15, 0, Math.PI / 2)
      k.box(a.elbow, seam, 0.04, 0.7, 0.04, 0, -0.45, 0.29)
      k.box(a.elbow, gold, 0.62, 0.12, 0.62, 0, -0.8, 0)
    }
    for (const l of rig.legs) k.box(l.hip, seam, 0.04, 0.8, 0.04, 0, -0.5, 0.39)
    const orbit = k.spin(head, 0, 1.6, 0, { speed: 1.1, bob: 0.05 })
    planets.forEach((m, i) => {
      const a = (i / 3) * TAU
      k.ball(orbit, m, 0.14 + i * 0.04, Math.cos(a) * (0.85 + i * 0.12), 0, Math.sin(a) * (0.85 + i * 0.12))
    })
    k.ring(orbit, seam, 1.0, 0.015, 0, 0, 0, Math.PI / 2)
    const cp = k.dangle(spine, 0, 1.75, -0.6, { base: 0.08, amp: 0.05, freq: 1.2, lean: 0.035 })
    k.box(cp, cape, 1.9, 2.7, 0.05, 0, -1.35, 0)
    k.box(cp, seam, 1.92, 0.05, 0.07, 0, -2.68, 0)
    face(k, rig, { eye: rig.eyeMat, brow: armor2, mouth: seam }, { z: 0.6, mouthZ: 0.02 })
    return { tint: [armor, armor2], fx: { aura: 'star', step: 'tech', voice: 'warden', roar: 'flex', dust: '#7af0ff' } }
  },

  // Primal: the Elder Colossus. Mossy carved stone with glowing green runes, a crown of
  // standing stones, a little tree growing on one shoulder and vines hanging off it.
  ruins(k, rig, look, seed) {
    const [c1] = mottle('#9aa07a', ['#5f8a3a', '#6a6a58', '#b8b89a'], seed, { alpha: 0.5 })
    crackLines(c1.getContext('2d'), 256, seed, 'rgba(40,40,30,0.7)', 1.6, 12)
    const stone = std('#ffffff', { map: tex(c1), rough: 0.95, flat: true })
    const stone2 = std('#c0c0a8', { map: stone.map, rough: 0.95, flat: true })
    const moss = std('#4f8a2a', { rough: 0.9 })
    const rune = k.pulse(glowM('#9cff4a', 2.4), 0.45, 1.5)
    const bark = std('#6a4a2a', { rough: 0.9 })
    const leaf = std('#3fa83a', { rough: 0.7 })
    const leaf2 = std('#7ad84a', { rough: 0.7 })
    Object.assign(rig, body(k, rig.root, { skin: stone, skin2: stone2, foot: stone2, hand: stone }, { chest: 1.3, arm: 1.26, hand: 1.45, leg: 1.16 }))
    const { hips, spine, head } = rig
    // Crown of standing stones, mossy brow, vine beard.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU
      k.box(head, stone2, 0.2, 0.36 + (i % 2) * 0.16, 0.2, Math.cos(a) * 0.4, 1.12, Math.sin(a) * 0.4, 0, a, 0.1)
    }
    k.box(head, moss, 1.1, 0.08, 1.04, 0, 1.05, 0)
    k.box(head, stone2, 1.14, 0.26, 0.36, 0, 0.84, 0.36)
    for (let i = 0; i < 4; i++) {
      const v = k.dangle(head, -0.3 + i * 0.2, 0.2, 0.48, { amp: 0.08, freq: 1.5 + i * 0.3, lean: 0.05 })
      k.box(v, moss, 0.08, 0.4 + (i % 2) * 0.2, 0.08, 0, -0.25, 0)
    }
    // Runes on the chest + arms, mossy tops.
    for (const [x, y, rz] of [[0, 1.3, 0], [-0.4, 1.05, 0.5], [0.4, 1.05, -0.5], [0, 0.85, Math.PI / 2]]) k.box(spine, rune, 0.07, 0.5, 0.05, x, y, 0.56, 0, 0, rz)
    k.ring(spine, rune, 0.24, 0.12, 0, 1.3, 0.56)
    k.box(spine, moss, 2.3, 0.1, 1.08, 0, 1.75, 0)
    k.box(spine, stone2, 1.5, 0.8, 0.5, 0, 1.3, -0.5, 0.1, 0.1, 0.05)
    for (const a of rig.arms) {
      k.box(a.shoulder, stone, 1.05, 0.7, 1.05, a.side * 0.05, 0.05, 0, 0.15, 0.2, a.side * -0.15)
      k.box(a.shoulder, moss, 1.06, 0.08, 1.06, a.side * 0.05, 0.42, 0, 0, 0.2, a.side * -0.15)
      k.box(a.elbow, rune, 0.05, 0.6, 0.05, 0, -0.5, 0.3)
      k.box(a.elbow, stone2, 1.0, 0.8, 0.95, 0, -1.12, 0.02, 0.2, 0.25, 0.1)
      const v = k.dangle(a.elbow, a.side * 0.2, -0.3, -0.3, { amp: 0.2, freq: 2, lean: 0.1 })
      k.box(v, moss, 0.08, 0.9, 0.08, 0, -0.45, 0)
    }
    // A little tree on the right shoulder.
    const sh = rig.arms[1].shoulder
    k.box(sh, bark, 0.16, 0.9, 0.16, 0, 0.4, 0, 0, 0, 0.15)
    k.box(sh, leaf, 0.8, 0.4, 0.8, -0.1, 0.95, 0)
    k.box(sh, leaf2, 0.5, 0.32, 0.5, -0.15, 1.25, 0.05, 0, 0.5)
    for (const l of rig.legs) {
      k.box(l.knee, stone, 0.82, 0.4, 0.86, 0, -0.05, 0.02, 0.15, 0.2, 0)
      k.box(l.hip, rune, 0.05, 0.6, 0.05, 0, -0.5, 0.42)
    }
    k.box(hips, moss, 1.74, 0.16, 1.04, 0, 0.3, 0)
    face(k, rig, { eye: rig.eyeMat, brow: stone2, mouth: rig.darkMat }, { mouthW: 0.5 })
    return { tint: [stone, stone2], fx: { aura: 'moss', step: 'stone', voice: 'colossus', roar: 'flex', dust: '#9a9a7a' } }
  },
}

// --- Per-frame behaviour -------------------------------------------------------------------
const PETAL = ['#ffc6e2', '#ff9ac8', '#ffffff']
const RAINBOW = ['#ff4a4a', '#ff9a1f', '#ffe14a', '#5bff6a', '#3fa2ff', '#a35bff']

// Builds the giant for `zone` onto `root` (a Group the guardian scales and places).
// Returns the rig + behaviour: { hips, spine, neck, head, legs, arms, eyes, brows, mouth,
// eyeMat, tintable, fx, tick(dt, elapsed, g, far), step(g, x, z, hard, s), roarStyle }.
export function buildGiant(root, zone, index) {
  const look = zone.guardian
  const kind = GIANTS[zone.props] ? zone.props : 'desert'
  const k = new Kit()
  const rig = {
    root,
    eyeMat: new MeshStandardMaterial({ color: '#111', emissive: look.eye, emissiveIntensity: 0 }),
    darkMat: new MeshStandardMaterial({ color: '#1a1420', roughness: 0.6 }),
  }
  const out = GIANTS[kind](k, rig, look, 900 + index * 17)
  k.finish()
  rig.kind = kind
  rig.tintable = out.tint
  rig.fx = out.fx
  rig.roarStyle = out.fx.roar
  const state = { px: 0, pz: 0, yaw: 0, init: false, aura: 0, breath: R(1, 3), idle: R(3, 6), roared: false }

  rig.tick = (dt, elapsed, g, far) => {
    // Motion of the body this frame (drives the danglers).
    const vx = state.init ? (g.pos.x - state.px) / Math.max(dt, 1e-3) : 0
    const vz = state.init ? (g.pos.z - state.pz) / Math.max(dt, 1e-3) : 0
    const fwd = vx * Math.sin(g.yaw) + vz * Math.cos(g.yaw)
    const turn = state.init ? Math.atan2(Math.sin(g.yaw - state.yaw), Math.cos(g.yaw - state.yaw)) / Math.max(dt, 1e-3) : 0
    state.px = g.pos.x
    state.pz = g.pos.z
    state.yaw = g.yaw
    state.init = true
    const speed = Math.min(14, Math.abs(fwd))
    for (const d of k.danglers) {
      const want = d.base + d.lean * speed + Math.sin(elapsed * d.freq * (1 + speed * 0.12) + d.ph) * d.amp * (1 + speed * 0.15) + (d.axis === 'z' ? turn * 0.04 : 0)
      d.v += (want - d.a) * d.stiff * dt
      d.v *= Math.exp(-d.damp * dt)
      d.a += d.v * dt
      d.p.rotation[d.axis] = d.a
    }
    for (const s of k.spinners) {
      s.p.rotation[s.axis] += s.speed * dt
      if (s.bob) s.p.position.y = s.y0 + Math.sin(elapsed * s.bobF + s.ph) * s.bob
    }
    for (const p of k.pulses) p.mat.emissiveIntensity = p.base * (1 + p.amp * Math.sin(elapsed * p.f + p.ph)) * (1 + g.rage * 0.6)
    for (const f of k.flickers) {
      const n = Math.sin(elapsed * f.f + f.ph) * 0.5 + Math.sin(elapsed * f.f * 2.3 + f.ph * 1.7) * 0.5
      f.obj.scale.set(f.sx * (1 + n * 0.12), f.sy * (1 + n * 0.3 + g.rage * 0.4), f.sx * (1 + n * 0.12))
    }

    // Roar effects: the first frame of each roar (guardian.js sets g.roared when it roars).
    if (g.roared && !state.roared) roarFx(rig, g)
    state.roared = !!g.roared
    if (far) return

    // Ambient particles around the body (only near the camera).
    aura(rig, g, dt, state, elapsed)
    // Breath puffs (frost, smoke) from the mouth.
    if (out.fx.breath && (state.breath -= dt) <= 0) {
      state.breath = g.asleep ? R(2.6, 3.4) : R(1.2, 2)
      rig.head.getWorldPosition(_v)
      const fx = Math.sin(g.yaw)
      const fz = Math.cos(g.yaw)
      for (let i = 0; i < 6; i++) smoke({ x: _v.x + fx * 0.6, y: _v.y + 0.25, z: _v.z + fz * 0.6, vx: fx * R(0.8, 1.6) + R(-0.2, 0.2), vy: R(0.1, 0.5), vz: fz * R(0.8, 1.6) + R(-0.2, 0.2), color: out.fx.breath, alpha: 0.45, size: 0.3, size1: 1.1, life: R(0.9, 1.4), drag: 1.5 })
    }
    // Idle sound now and then (rustle, crackle, hum, clink...).
    if ((state.idle -= dt) <= 0) {
      state.idle = R(4, 8)
      const s = spatial(g.pos.x, g.pos.z, 14)
      sfx.giantIdle?.(out.fx.voice, s.gain, s.pan)
    }
  }

  // Themed layer on top of a footfall's dust + thud.
  rig.step = (g, x, z, hard, s) => {
    const k2 = hard ? 1 : 0.6
    sfx.giantStepLayer?.(out.fx.step, s.gain * k2, s.pan)
    const n = Math.round(10 * k2)
    switch (out.fx.step) {
      case 'ice':
        for (let i = 0; i < n; i++) glow({ x: x + R(-0.6, 0.6), y: 0.2, z: z + R(-0.6, 0.6), vx: R(-2, 2), vy: R(1.5, 4), vz: R(-2, 2), color: '#e8fbff', size: R(0.15, 0.3), size1: 0.03, life: R(0.5, 0.9), gravity: 7, drag: 1.5 })
        break
      case 'lava':
        for (let i = 0; i < n * 1.5; i++) glow({ x: x + R(-0.6, 0.6), y: 0.2, z: z + R(-0.6, 0.6), vx: R(-2.5, 2.5), vy: R(2, 6), vz: R(-2.5, 2.5), color: Math.random() < 0.5 ? '#ff7a1a' : '#ffd23a', size: R(0.15, 0.32), size1: 0.04, life: R(0.5, 1.1), gravity: 9, drag: 1 })
        glow({ x, y: 0.15, z, color: '#ff6a1a', size: 2.2, size1: 3, life: 0.5, alpha: 0.6, fadeIn: 0 })
        break
      case 'void':
      case 'tech':
      case 'prism':
      case 'gold':
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU
          const col = out.fx.step === 'prism' ? RAINBOW[i % 6] : out.fx.step === 'gold' ? '#ffe36a' : out.fx.step === 'tech' ? '#7af0ff' : '#d06aff'
          glow({ x: x + Math.cos(a) * 0.5, y: 0.15, z: z + Math.sin(a) * 0.5, vx: Math.cos(a) * 3, vy: R(0.3, 1.2), vz: Math.sin(a) * 3, color: col, size: 0.25, size1: 0.03, life: R(0.4, 0.7), drag: 3 })
        }
        break
      case 'petal':
      case 'leaf':
        for (let i = 0; i < n * 0.6; i++) smoke({ x: x + R(-0.5, 0.5), y: 0.3, z: z + R(-0.5, 0.5), vx: R(-1.5, 1.5), vy: R(1.5, 3), vz: R(-1.5, 1.5), color: out.fx.step === 'petal' ? PETAL[i % 3] : i % 2 ? '#3fbf3a' : '#7ad84a', alpha: 0.95, size: 0.18, size1: 0.14, life: R(0.9, 1.4), gravity: 3, drag: 2 })
        break
    }
    if (hard) shockwave(x, 0.06, z, out.fx.dust, 2.6 * k2, 0.45)
  }
  return rig
}

// The ambient particles each giant gives off.
function aura(rig, g, dt, st, elapsed) {
  const kind = rig.fx.aura
  const rate = { sand: 6, leaf: 3, frost: 10, void: 14, gold: 12, ember: 26, oni: 10, silver: 5, prism: 14, petal: 8, star: 12, moss: 4 }[kind] ?? 0
  st.aura += dt * rate * (1 + g.rage)
  const x0 = g.pos.x
  const z0 = g.pos.z
  const H = 4.8
  while (st.aura >= 1) {
    st.aura -= 1
    const x = x0 + R(-1.4, 1.4)
    const z = z0 + R(-1.4, 1.4)
    const y = g.pos.y + R(0.4, H)
    switch (kind) {
      case 'sand':
        smoke({ x, y: g.pos.y + R(0.2, 2), z, vx: R(-0.6, 0.6), vy: R(0.1, 0.5), vz: R(-0.6, 0.6), color: '#e8d4a0', alpha: 0.35, size: 0.25, size1: 0.6, life: R(1, 1.8), drag: 1 })
        break
      case 'leaf':
        smoke({ x, y: g.pos.y + H, z, vx: R(-0.5, 0.5), vy: R(-0.6, -0.2), vz: R(-0.5, 0.5), color: Math.random() < 0.5 ? '#3fbf3a' : '#7ad84a', alpha: 0.95, size: 0.16, size1: 0.12, life: R(1.6, 2.4), drag: 0.5, swirl: R(-2, 2), cx: x0, cz: z0 })
        break
      case 'frost':
        glow({ x, y, z, vx: R(-0.2, 0.2), vy: R(-0.4, 0.2), vz: R(-0.2, 0.2), color: '#e8fbff', size: R(0.08, 0.18), size1: 0.02, life: R(0.8, 1.4) })
        break
      case 'void':
        glow({ x, y: g.pos.y + R(0, 2), z, vx: 0, vy: R(0.8, 1.8), vz: 0, color: Math.random() < 0.6 ? '#c44dff' : '#ff6af0', size: R(0.12, 0.26), size1: 0.02, life: R(0.9, 1.6), swirl: 1.5, cx: x0, cz: z0 })
        break
      case 'gold':
        glow({ x, y, z, vx: 0, vy: R(0.1, 0.5), vz: 0, color: Math.random() < 0.7 ? '#ffe36a' : '#ffffff', size: R(0.1, 0.24), size1: 0.02, life: R(0.6, 1.2) })
        break
      case 'ember':
        glow({ x, y: g.pos.y + R(0.5, H), z, vx: R(-0.4, 0.4), vy: R(1.5, 3.5), vz: R(-0.4, 0.4), color: Math.random() < 0.6 ? '#ff7a1a' : '#ffd23a', size: R(0.1, 0.22), size1: 0.02, life: R(0.8, 1.5), drag: 0.5 })
        if (Math.random() < 0.15) smoke({ x, y: g.pos.y + H, z, vx: 0, vy: R(0.6, 1.2), vz: 0, color: '#2a2020', alpha: 0.35, size: 0.6, size1: 1.8, life: 1.8 })
        break
      case 'oni':
        smoke({ x, y: g.pos.y + R(0, 1), z, vx: 0, vy: R(0.6, 1.4), vz: 0, color: '#8a0a14', alpha: 0.3, size: 0.5, size1: 1.4, life: R(1, 1.6), swirl: 1, cx: x0, cz: z0 })
        break
      case 'silver':
        glow({ x, y, z, vx: 0, vy: R(0.2, 0.6), vz: 0, color: '#9ad8ff', size: R(0.08, 0.16), size1: 0.02, life: R(0.8, 1.4) })
        break
      case 'prism':
        glow({ x: x0 + R(-2.2, 2.2), y, z: z0 + R(-2.2, 2.2), vx: 0, vy: R(0.2, 0.8), vz: 0, color: RAINBOW[Math.floor(Math.random() * 6)], size: R(0.12, 0.26), size1: 0.02, life: R(0.8, 1.4), swirl: 0.8, cx: x0, cz: z0 })
        break
      case 'petal':
        smoke({ x: x0 + R(-2.5, 2.5), y: g.pos.y + R(1, H + 1), z: z0 + R(-2.5, 2.5), vx: R(-0.4, 0.4), vy: R(-0.6, -0.2), vz: R(-0.4, 0.4), color: PETAL[Math.floor(Math.random() * 3)], alpha: 0.95, size: 0.16, size1: 0.12, life: R(1.6, 2.6), swirl: 1.6, cx: x0, cz: z0 })
        break
      case 'star':
        glow({ x: x0 + R(-1.8, 1.8), y: y + 0.5, z: z0 + R(-1.8, 1.8), vx: 0, vy: R(-0.1, 0.3), vz: 0, color: Math.random() < 0.6 ? '#ffffff' : '#7af0ff', size: R(0.1, 0.22), size1: 0.02, life: R(0.5, 1.1) })
        break
      case 'moss':
        smoke({ x, y, z, vx: R(-0.2, 0.2), vy: R(-1.5, -0.6), vz: R(-0.2, 0.2), color: Math.random() < 0.5 ? '#6a6a58' : '#5f8a3a', alpha: 0.9, size: 0.12, size1: 0.1, life: R(0.8, 1.2), gravity: 5 })
        break
    }
  }
}

// Roar: a shock ring, a blast of breath / sparks from the mouth, the giant's voice layer.
function roarFx(rig, g) {
  rig.head.getWorldPosition(_v)
  const fx = Math.sin(g.yaw)
  const fz = Math.cos(g.yaw)
  const col = { sand: '#e8d4a0', leaf: '#8aff6a', frost: '#e8fbff', void: '#d06aff', gold: '#ffe36a', ember: '#ff7a1a', oni: '#ff3a3a', silver: '#9ad8ff', prism: '#ffffff', petal: '#ffc6e2', star: '#7af0ff', moss: '#9cff4a' }[rig.fx.aura] ?? '#ffffff'
  shockwave(g.pos.x, g.pos.y + 0.08, g.pos.z, col, 7, 0.7)
  shockwave(_v.x, _v.y + 0.3, _v.z, col, 3.2, 0.45, true)
  for (let i = 0; i < 26; i++) {
    const sp = R(4, 9)
    const c = rig.fx.aura === 'prism' ? RAINBOW[i % 6] : col
    glow({ x: _v.x + fx * 0.6, y: _v.y + 0.3, z: _v.z + fz * 0.6, vx: fx * sp + R(-2, 2), vy: R(-1, 2.5), vz: fz * sp + R(-2, 2), color: c, size: R(0.25, 0.5), size1: 0.04, life: R(0.4, 0.8), drag: 3 })
  }
  for (let i = 0; i < 8; i++) smoke({ x: _v.x + fx * 0.8, y: _v.y + 0.3, z: _v.z + fz * 0.8, vx: fx * R(3, 6), vy: R(0, 1), vz: fz * R(3, 6), color: rig.fx.breath ?? '#ffffff', alpha: 0.3, size: 0.5, size1: 2.2, life: R(0.5, 0.9), drag: 3 })
  const s = spatial(g.pos.x, g.pos.z, 26)
  sfx.giantVoice?.(rig.fx.voice, s.gain, s.pan)
}
