import { BoxGeometry, CanvasTexture, Color, ConeGeometry, Group, Mesh, MeshStandardMaterial, Object3D, RepeatWrapping, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three'
import { LANE } from '../config.js'
import { mulberry32 } from '../textures.js'
import { dust, glow, smoke } from '../fx.js'
import { sfx, spatial } from '../audio/index.js'

// A zone's guardian: a blocky giant wrapped in bandages (colours per zone),
// built on a small rig (hips, spine, neck, shoulders, elbows, hips, knees) and
// animated procedurally. It sleeps seated in its base with Z's drifting up,
// wakes with a roar when an orb comes near, chases it with long strides, grabs
// it, carries it overhead back into the base, sets it on a slot, then rages
// (turns red) and hunts the fighter that hatched. Everything it does is driven
// from lane/index.js through wake / chase / carryTo / rage / hunt / giveUp;
// update() returns the events ('caught', 'placed', 'caughtFighter').

const G = LANE.guardian
const TAU = Math.PI * 2
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const MODEL_H = 5.3 // model units tall at scale 1 (scaled to G.height)
const STAND_HIPS = 2.29

function bandageTexture(a, b, seed) {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')
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
    const col = ca.clone().lerp(cb, mix * mix * 0.8)
    // Each strip: slanted band with a dark seam under it and a light edge on top.
    ctx.fillStyle = '#' + col.getHexString()
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
    // Frayed nicks.
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = 'rgba(30,30,60,0.25)'
      ctx.fillRect(rand() * S, y + rand() * h, 6 + rand() * 10, 1.5)
    }
    y += h - 1
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

let zTexture = null
function zTex() {
  if (zTexture) return zTexture
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  ctx.font = '700 56px Fredoka, "Arial Black", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 8
  ctx.strokeStyle = '#1b2a6a'
  ctx.strokeText('Z', 32, 34)
  ctx.fillStyle = '#ffffff'
  ctx.fillText('Z', 32, 34)
  zTexture = new CanvasTexture(c)
  zTexture.colorSpace = SRGBColorSpace
  return zTexture
}

const box1 = new BoxGeometry(1, 1, 1)

export class Guardian {
  // zone: ZONES entry; house: { toWorld(x, z), seat, door, slots: [{x,y,z,stand:{x,z}}], frontYaw, inside(x, z), y }
  constructor(scene, zone, house, index) {
    this.zone = zone
    this.house = house
    this.name = zone.guardian.name
    const look = zone.guardian
    this.scale = G.height / MODEL_H

    // --- Materials (own per guardian: they tint red when it rages) ---
    const tex = bandageTexture(look.wrap, look.wrap2, 900 + index * 17)
    this.wrapMat = new MeshStandardMaterial({ map: tex, roughness: 0.85 })
    this.wrapMat2 = new MeshStandardMaterial({ map: tex, roughness: 0.85, color: '#d8d8e0' }) // slightly darker limbs
    this.faceMat = new MeshStandardMaterial({ color: new Color(look.wrap2).multiplyScalar(0.55), roughness: 0.9 })
    this.eyeMat = new MeshStandardMaterial({ color: '#111', emissive: look.eye, emissiveIntensity: 0 })
    this.darkMat = new MeshStandardMaterial({ color: '#1a1420', roughness: 0.6 })
    this.goldMat = new MeshStandardMaterial({ color: '#ffd23a', roughness: 0.3, metalness: 0.6 })
    this.hornMat = new MeshStandardMaterial({ color: '#f4ead2', roughness: 0.5 })
    this.tintable = [this.wrapMat, this.wrapMat2, this.faceMat]
    this.baseColors = this.tintable.map((m) => m.color.clone())
    this.angryColor = new Color(look.angry)

    // --- Rig ---
    const root = new Group()
    this.root = root
    root.scale.setScalar(this.scale)
    scene.add(root)
    const part = (parent, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new Mesh(box1, mat)
      m.scale.set(w, h, d)
      m.position.set(x, y, z)
      m.rotation.set(rx, ry, rz)
      m.castShadow = true
      parent.add(m)
      return m
    }
    const pivot = (parent, x, y, z) => {
      const p = new Group()
      p.position.set(x, y, z)
      parent.add(p)
      return p
    }
    const W = this.wrapMat
    const W2 = this.wrapMat2

    this.hips = pivot(root, 0, STAND_HIPS, 0)
    part(this.hips, W2, 1.5, 0.62, 0.92, 0, 0, 0)
    part(this.hips, W, 1.56, 0.22, 0.98, 0, 0.22, 0) // belt wrap (sticks out past the pelvis)
    // Loincloth flap front and back.
    part(this.hips, W2, 0.7, 0.7, 0.08, 0, -0.45, 0.48, 0.12)
    part(this.hips, W2, 0.8, 0.6, 0.08, 0, -0.4, -0.48, -0.12)

    this.legs = []
    for (const s of [1, -1]) {
      const hip = pivot(this.hips, s * 0.45, -0.15, 0)
      part(hip, W, 0.72, 1.02, 0.76, 0, -0.5, 0)
      const knee = pivot(hip, 0, -1.0, 0)
      part(knee, W2, 0.64, 0.96, 0.7, 0, -0.46, 0)
      part(knee, W, 0.7, 0.18, 0.76, 0, -0.08, 0) // knee wrap
      part(knee, this.faceMat, 0.74, 0.24, 1.04, 0, -1.02, 0.14) // foot
      this.legs.push({ hip, knee, side: s })
    }

    this.spine = pivot(this.hips, 0, 0.22, 0)
    part(this.spine, W2, 1.38, 0.82, 0.86, 0, 0.42, 0) // belly
    part(this.spine, W, 1.84, 1.02, 1.06, 0, 1.22, 0) // chest
    part(this.spine, W2, 1.0, 0.5, 0.2, 0, 1.25, 0.55) // chest strap
    part(this.spine, W, 0.3, 1.3, 1.1, 0.5, 1.05, 0, 0, 0, 0.5) // diagonal sash
    this.neck = pivot(this.spine, 0, 1.76, 0)
    part(this.neck, W2, 0.55, 0.3, 0.55, 0, 0.1, 0)
    const head = pivot(this.neck, 0, 0.2, 0)
    part(head, W, 1.06, 1.04, 1.0, 0, 0.52, 0)
    part(head, this.faceMat, 0.8, 0.42, 0.06, 0, 0.56, 0.5) // shadowed face slit
    // Eyes: open (glowing) / closed (thin, dark) by scaling.
    this.eyes = [part(head, this.eyeMat, 0.2, 0.13, 0.06, -0.2, 0.6, 0.53), part(head, this.eyeMat, 0.2, 0.13, 0.06, 0.2, 0.6, 0.53)]
    this.brows = [part(head, W, 0.32, 0.1, 0.1, -0.22, 0.78, 0.5, 0, 0, 0.15), part(head, W, 0.32, 0.1, 0.1, 0.22, 0.78, 0.5, 0, 0, -0.15)]
    this.mouth = part(head, this.darkMat, 0.36, 0.06, 0.06, 0, 0.3, 0.52)
    // A loose bandage end hanging off the side of the head.
    part(head, W, 0.14, 0.7, 0.06, 0.48, 0.2, -0.2, 0.1, 0, -0.18)
    if (look.horns) {
      for (const s of [-1, 1]) {
        const h = new Mesh(new ConeGeometry(0.16, 0.7, 6), this.hornMat)
        h.position.set(s * 0.42, 1.2, 0)
        h.rotation.z = -s * 0.5
        h.castShadow = true
        head.add(h)
      }
    }
    if (look.crown) {
      part(head, this.goldMat, 1.12, 0.22, 1.06, 0, 1.1, 0)
      for (let i = 0; i < 5; i++) part(head, this.goldMat, 0.16, 0.3, 0.16, -0.4 + i * 0.2, 1.3, 0.5)
    }

    this.arms = []
    for (const s of [1, -1]) {
      const shoulder = pivot(this.spine, s * 1.1, 1.52, 0)
      part(shoulder, W, 0.8, 0.44, 0.82, 0, -0.04, 0) // shoulder wrap
      part(shoulder, W2, 0.62, 1.1, 0.62, 0, -0.55, 0)
      const elbow = pivot(shoulder, 0, -1.08, 0)
      part(elbow, W, 0.56, 0.96, 0.56, 0, -0.46, 0)
      part(elbow, W2, 0.62, 0.16, 0.62, 0, -0.84, 0) // wrist wrap
      part(elbow, this.faceMat, 0.68, 0.5, 0.64, 0, -1.12, 0.02) // hand
      const hand = new Object3D()
      hand.position.set(0, -1.2, 0.05)
      elbow.add(hand)
      this.arms.push({ shoulder, elbow, hand, side: s })
    }

    // --- Sleep Z's (3 recycled sprites) ---
    this.zs = []
    for (let i = 0; i < 3; i++) {
      const z = new Sprite(new SpriteMaterial({ map: zTex(), transparent: true, depthWrite: false }))
      z.visible = false
      scene.add(z)
      this.zs.push({ sprite: z, t: i / 3 })
    }

    // --- Pose state ---
    const P = () => ({ hipsY: STAND_HIPS, spineX: 0, spineY: 0, spineZ: 0, neckX: 0, neckY: 0, armX: [0, 0], armZ: [0, 0], elbow: [0, 0], leg: [0, 0], knee: [0, 0], rootTilt: 0 })
    this.pose = P()
    this.target = P()
    this.seated()
    this.copyPose(this.target, this.pose)

    this.pos = { x: house.seat.x, y: house.y, z: house.seat.z }
    this.yaw = house.frontYaw
    this.state = 'sleep'
    this.t = 0 // time in state
    this.phase = 0 // stride phase
    this.lastPhase = 0
    this.rage = 0 // 0..1 red tint
    this.awake = 0 // 0..1 eyes open
    this.path = []
    this.speed = 0
    this.chaseTarget = null // { x, z } object read every frame
    this.chaseSpeed = 0
    this.slot = null
    this.holding = false
    this.shake = 0 // camera shake this guardian asks for (read by the lane)
    this.applyPose()
    this.placeRoot()
  }

  copyPose(from, to) {
    for (const k in from) {
      if (Array.isArray(from[k])) {
        to[k][0] = from[k][0]
        to[k][1] = from[k][1]
      } else to[k] = from[k]
    }
  }

  // --- Pose writers (into this.target) ---------------------------------------------------
  base() {
    const t = this.target
    t.hipsY = STAND_HIPS
    t.spineX = t.spineY = t.spineZ = t.neckX = t.neckY = t.rootTilt = 0
    t.armX[0] = t.armX[1] = 0
    t.armZ[0] = 0.12
    t.armZ[1] = -0.12
    t.elbow[0] = t.elbow[1] = -0.2
    t.leg[0] = t.leg[1] = 0
    t.knee[0] = t.knee[1] = 0
    return t
  }
  seated(time = 0) {
    const t = this.base()
    const breath = Math.sin(time * 1.4)
    t.hipsY = 1.42
    t.leg[0] = t.leg[1] = -1.42
    t.knee[0] = t.knee[1] = 1.38
    t.spineX = 0.32 + breath * 0.035
    t.neckX = 0.5 + breath * 0.04
    t.neckY = 0.12
    t.armX[0] = t.armX[1] = -0.78
    t.armZ[0] = -0.06
    t.armZ[1] = 0.06
    t.elbow[0] = t.elbow[1] = -0.85 - breath * 0.03
  }
  idle(time) {
    const t = this.base()
    const b = Math.sin(time * 2)
    t.spineX = 0.08 + b * 0.02
    t.hipsY = STAND_HIPS - 0.03 + b * 0.02
  }
  roar(k) {
    const t = this.base()
    t.spineX = -0.28 * k
    t.neckX = -0.55 * k
    t.armX[0] = t.armX[1] = -0.55 * k
    t.armZ[0] = 1.15 * k
    t.armZ[1] = -1.15 * k
    t.elbow[0] = t.elbow[1] = -0.6 * k
    t.leg[0] = -0.12 * k
    t.leg[1] = 0.12 * k
    t.hipsY = STAND_HIPS - 0.18 * k
    t.knee[0] = t.knee[1] = 0.25 * k
  }
  stride(amp, armMode) {
    const t = this.base()
    const ph = this.phase
    const sw = Math.sin(ph)
    const knee = (p) => {
      const r = Math.sin(p - 1.1)
      return r > 0 ? r * r : 0
    }
    t.leg[0] = -sw * 0.78 * amp
    t.leg[1] = sw * 0.78 * amp
    t.knee[0] = knee(ph + Math.PI) * 1.25 * amp + 0.1
    t.knee[1] = knee(ph) * 1.25 * amp + 0.1
    t.hipsY = STAND_HIPS - 0.08 - Math.abs(Math.cos(ph)) * 0.16 * amp
    t.spineX = 0.18 * amp
    t.spineY = sw * 0.12 * amp
    t.spineZ = Math.sin(ph * 2) * 0.03
    t.neckX = -0.12 * amp
    if (armMode === 'reach') {
      t.armX[0] = -1.25 + sw * 0.25
      t.armX[1] = -1.25 - sw * 0.25
      t.armZ[0] = 0.12
      t.armZ[1] = -0.12
      t.elbow[0] = t.elbow[1] = -0.25
    } else if (armMode === 'overhead') {
      t.armX[0] = t.armX[1] = -2.85
      t.armZ[0] = 0.2
      t.armZ[1] = -0.2
      t.elbow[0] = t.elbow[1] = -0.45
      t.spineX = 0.02
      t.neckX = -0.25
    } else {
      t.armX[0] = sw * 0.85 * amp
      t.armX[1] = -sw * 0.85 * amp
      t.elbow[0] = t.elbow[1] = -0.55 * amp - 0.2
    }
  }
  grab(k) {
    const t = this.base()
    t.spineX = 0.55 * k
    t.neckX = 0.1
    t.armX[0] = t.armX[1] = -1.5 * k
    t.armZ[0] = 0.25 * (1 - k)
    t.armZ[1] = -0.25 * (1 - k)
    t.elbow[0] = t.elbow[1] = -0.15
    t.leg[0] = t.leg[1] = -0.5 * k
    t.knee[0] = t.knee[1] = 0.85 * k
    t.hipsY = STAND_HIPS - 0.45 * k
  }
  lift(k) {
    // From the grab crouch to holding the orb high overhead.
    const t = this.base()
    t.armX[0] = t.armX[1] = lerp(-1.5, -2.85, k)
    t.armZ[0] = 0.2
    t.armZ[1] = -0.2
    t.elbow[0] = t.elbow[1] = lerp(-0.15, -0.45, k)
    t.spineX = lerp(0.5, 0.0, k)
    t.neckX = -0.25 * k
    t.hipsY = STAND_HIPS - 0.4 * (1 - k)
    t.leg[0] = t.leg[1] = -0.45 * (1 - k)
    t.knee[0] = t.knee[1] = 0.8 * (1 - k)
  }
  place(k) {
    // Bend at the hips and knees, arms bringing the orb down onto the slot.
    const t = this.base()
    t.spineX = 0.78 * k
    t.neckX = 0.25 * k
    t.armX[0] = t.armX[1] = lerp(-2.85, -1.05, k)
    t.armZ[0] = 0.18
    t.armZ[1] = -0.18
    t.elbow[0] = t.elbow[1] = lerp(-0.45, -0.25, k)
    t.leg[0] = t.leg[1] = -0.55 * k
    t.knee[0] = t.knee[1] = 0.95 * k
    t.hipsY = STAND_HIPS - 0.55 * k
  }
  angry(time) {
    // Fists clenched, shoulders hunched, stamping in place (shakes the ground).
    const t = this.base()
    const st = Math.max(0, Math.sin(time * 9))
    const side = Math.sin(time * 4.5) > 0 ? 0 : 1
    t.spineX = 0.22 + Math.sin(time * 18) * 0.03
    t.neckX = 0.15
    t.armX[0] = t.armX[1] = -0.35
    t.armZ[0] = 0.5
    t.armZ[1] = -0.5
    t.elbow[0] = t.elbow[1] = -1.6 + Math.sin(time * 18) * 0.08
    t.leg[side] = -0.55 * st
    t.knee[side] = 0.9 * st
    t.hipsY = STAND_HIPS - 0.15
  }
  shakeFist(time) {
    const t = this.base()
    t.spineX = 0.05
    t.armX[0] = -2.5 + Math.sin(time * 14) * 0.25
    t.armZ[0] = 0.25
    t.elbow[0] = -1.1 + Math.sin(time * 14) * 0.2
    t.armX[1] = -0.3
    t.armZ[1] = -0.7
    t.elbow[1] = -1.9 // hand on hip
    t.neckX = -0.15
  }

  applyPose() {
    const p = this.pose
    this.hips.position.y = p.hipsY
    this.spine.rotation.set(p.spineX, p.spineY, p.spineZ)
    this.neck.rotation.set(p.neckX, p.neckY, 0)
    for (let i = 0; i < 2; i++) {
      const a = this.arms[i]
      a.shoulder.rotation.set(p.armX[i], 0, p.armZ[i])
      a.elbow.rotation.set(p.elbow[i], 0, 0)
      const l = this.legs[i]
      l.hip.rotation.set(p.leg[i], 0, 0)
      l.knee.rotation.set(p.knee[i], 0, 0)
    }
  }

  blendPose(dt, rate) {
    const k = 1 - Math.exp(-rate * dt)
    const p = this.pose
    const t = this.target
    for (const key in t) {
      if (Array.isArray(t[key])) {
        p[key][0] += (t[key][0] - p[key][0]) * k
        p[key][1] += (t[key][1] - p[key][1]) * k
      } else p[key] += (t[key] - p[key]) * k
    }
  }

  placeRoot() {
    this.root.position.set(this.pos.x, this.pos.y, this.pos.z)
    this.root.rotation.y = this.yaw
  }

  // World position of the point between the hands (where a held orb sits).
  holdPoint(out) {
    this.root.updateMatrixWorld(true)
    const a = this.arms[0].hand.getWorldPosition(_v1)
    const b = this.arms[1].hand.getWorldPosition(_v2)
    out.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    // Push it a little forward of the palms so the orb sits in them, not inside them.
    out.x += Math.sin(this.yaw) * 0.35
    out.z += Math.cos(this.yaw) * 0.35
    return out
  }

  // --- Commands ---------------------------------------------------------------------------
  get busy() {
    return this.state !== 'sleep' && this.state !== 'return' && this.state !== 'sitdown' && this.state !== 'giveup'
  }
  get asleep() {
    return this.state === 'sleep'
  }
  wake(target, speed) {
    this.chaseTarget = target
    this.chaseSpeed = speed
    if (this.state === 'sleep' || this.state === 'sitdown') this.setState('wake')
    else if (this.state === 'return' || this.state === 'giveup') this.setState('chase')
  }
  // After a catch: where to put the orb (the grab -> lift -> carry -> place chain runs by itself).
  carryTo(slot) {
    this.slot = slot
    this.holding = true
  }
  hunt(target) {
    this.chaseTarget = target
    this.setState('angry')
  }
  giveUp() {
    if (this.state === 'sleep' || this.state === 'return' || this.state === 'sitdown' || this.state === 'giveup') return
    this.holding = false
    this.setState('giveup')
  }
  reset() {
    this.holding = false
    this.pos.x = this.house.seat.x
    this.pos.z = this.house.seat.z
    this.pos.y = this.house.y
    this.yaw = this.house.frontYaw
    this.rage = 0
    this.setState('sleep')
  }
  setState(s) {
    this.state = s
    this.t = 0
    if (s === 'return') {
      this.path = this.routeTo(this.house.seatFront)
    } else if (s === 'carry') {
      this.path = this.routeTo(this.slot.stand)
    }
  }
  // Waypoints from here to a point, going through the door when crossing the base's front.
  routeTo(p) {
    const hereIn = this.house.inside(this.pos.x, this.pos.z)
    const thereIn = this.house.inside(p.x, p.z)
    if (hereIn !== thereIn) return [this.house.door, p]
    return [p]
  }

  // Walks along this.path at `speed`; returns true when it ends.
  walk(dt, speed) {
    if (!this.path.length) return true
    const p = this.path[0]
    const dx = p.x - this.pos.x
    const dz = p.z - this.pos.z
    const d = Math.hypot(dx, dz)
    if (d < 0.25) {
      this.path.shift()
      return this.path.length === 0
    }
    this.moveDir(dx / d, dz / d, Math.min(d, speed * dt), dt)
    return false
  }
  moveDir(nx, nz, step, dt) {
    this.pos.x += nx * step
    this.pos.z += nz * step
    const want = Math.atan2(nx, nz)
    const diff = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw))
    this.yaw += diff * (1 - Math.exp(-10 * dt))
    this.phase += (step / (2.9 * this.scale)) * Math.PI
  }
  faceYaw(want, dt, rate = 7) {
    const diff = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw))
    this.yaw += diff * (1 - Math.exp(-rate * dt))
  }

  // --- Frame ---------------------------------------------------------------------------------
  update(dt, elapsed, listenerFar) {
    this.t += dt
    this.shake = 0
    let event = null
    let rate = 9
    const sp = this.state
    const moving0 = this.phase
    switch (sp) {
      case 'sleep':
        this.seated(elapsed)
        rate = 4
        this.awake += (0 - this.awake) * (1 - Math.exp(-4 * dt))
        break
      case 'wake': {
        // Stand up (0..45%), then roar.
        const k = this.t / G.wakeTime
        if (k < 0.45) {
          this.idle(elapsed)
          rate = 6
        } else {
          this.roar(Math.min(1, (k - 0.45) / 0.2))
          rate = 10
          if (!this.roared) {
            this.roared = true
            const s = spatial(this.pos.x, this.pos.z, 22)
            sfx.roar(s.gain, s.pan)
            this.shake = 0.5 * s.gain
          }
        }
        this.awake = Math.min(1, this.awake + dt * 4)
        if (this.chaseTarget) this.faceYaw(Math.atan2(this.chaseTarget.x - this.pos.x, this.chaseTarget.z - this.pos.z), dt, 4)
        if (k >= 1) {
          this.roared = false
          this.setState('chase')
        }
        break
      }
      case 'chase': {
        const tx = this.chaseTarget.x
        const tz = this.chaseTarget.z
        let gx = tx
        let gz = tz
        // Leave the base through its open front before cutting across.
        if (this.house.inside(this.pos.x, this.pos.z) && !this.house.inside(tx, tz)) {
          gx = this.house.door.x
          gz = this.house.door.z
        }
        const dx = gx - this.pos.x
        const dz = gz - this.pos.z
        const d = Math.hypot(dx, dz)
        const reachD = Math.hypot(tx - this.pos.x, tz - this.pos.z)
        if (reachD < G.reach) {
          event = 'caught'
          this.holding = true
          this.setState('grabbing')
          break
        }
        const accel = Math.min(1, this.t / 0.5) // gets up to speed
        if (d > 0.01) this.moveDir(dx / d, dz / d, Math.min(d, this.chaseSpeed * accel * dt), dt)
        this.stride(1, 'reach')
        rate = 16
        break
      }
      case 'grabbing': {
        // Reach down and close the hands round the orb (orb flies into them meanwhile).
        const k = Math.min(1, this.t / 0.35)
        this.grab(k)
        rate = 14
        if (this.t > 0.35) this.setState('lift')
        break
      }
      case 'lift': {
        const k = Math.min(1, this.t / 0.5)
        this.lift(k)
        rate = 12
        if (this.t > 0.55) this.setState('carry')
        break
      }
      case 'grab': // (unused alias: carryTo() after an instant catch)
        this.setState('carry')
        break
      case 'carry': {
        const done = this.walk(dt, G.walkSpeed)
        this.stride(0.6, 'overhead')
        rate = 12
        if (done) this.setState('place')
        break
      }
      case 'place': {
        // Face the slot (toward the back wall), then lower the orb onto it.
        this.faceYaw(this.house.frontYaw + Math.PI, dt, 9)
        const k = clamp((this.t - 0.2) / 0.6, 0, 1)
        this.place(k)
        rate = 10
        if (this.t >= 0.8 && this.holding) {
          this.holding = false
          event = 'placed'
        }
        if (this.t > 1.05) this.setState('stepback')
        break
      }
      case 'stepback': {
        // Straighten up and back off half a step from the slot.
        this.idle(elapsed)
        // Side-step off the slot (away from the cinematic camera, which sits to the base's +x side).
        const y = this.house.frontYaw
        if (this.t < 0.5) this.moveDir(-Math.cos(y), Math.sin(y), 5 * dt, dt * 0.01)
        this.faceYaw(y + Math.PI * 0.75, dt, 6)
        rate = 8
        break
      }
      case 'angry': {
        this.angry(elapsed)
        rate = 18
        this.rage = Math.min(1, this.rage + dt * 3)
        if (this.chaseTarget) this.faceYaw(Math.atan2(this.chaseTarget.x - this.pos.x, this.chaseTarget.z - this.pos.z), dt, 6)
        if (this.t > 0.15 && Math.floor(this.t * 4.5) !== Math.floor((this.t - dt) * 4.5)) {
          const s = spatial(this.pos.x, this.pos.z, 25)
          sfx.giantStep(s.gain, s.pan)
          dust(this.pos.x, this.pos.z, this.zone.floor, 1.2)
          this.shake = 0.35 * s.gain
        }
        if (this.t > 0.2 && !this.roared) {
          this.roared = true
          const s = spatial(this.pos.x, this.pos.z, 25)
          sfx.roar(s.gain, s.pan, true)
        }
        if (this.t >= G.angryTime) {
          this.roared = false
          this.setState('hunt')
        }
        break
      }
      case 'hunt': {
        const tx = this.chaseTarget.x
        const tz = this.chaseTarget.z
        let gx = tx
        let gz = tz
        if (this.house.inside(this.pos.x, this.pos.z) && !this.house.inside(tx, tz)) {
          gx = this.house.door.x
          gz = this.house.door.z
        }
        const reachD = Math.hypot(tx - this.pos.x, tz - this.pos.z)
        if (reachD < G.reach) {
          event = 'caughtFighter'
          this.setState('snatch')
          break
        }
        const dx = gx - this.pos.x
        const dz = gz - this.pos.z
        const d = Math.hypot(dx, dz)
        const accel = Math.min(1, this.t / 0.4)
        if (d > 0.01) this.moveDir(dx / d, dz / d, Math.min(d, G.huntSpeed * accel * dt), dt)
        this.stride(1, 'reach')
        rate = 16
        break
      }
      case 'snatch': {
        this.grab(Math.min(1, this.t / 0.3))
        rate = 14
        if (this.t > 0.9) this.setState('giveup')
        break
      }
      case 'giveup': {
        this.shakeFist(elapsed)
        rate = 10
        if (this.t > 1.6) this.setState('return')
        break
      }
      case 'return': {
        const done = this.walk(dt, G.walkSpeed)
        this.stride(0.55, 'swing')
        rate = 12
        if (done) this.setState('sitdown')
        break
      }
      case 'sitdown': {
        // Walk the last step onto the seat, turn round and sit.
        const s = this.house.seat
        const dx = s.x - this.pos.x
        const dz = s.z - this.pos.z
        this.pos.x += dx * (1 - Math.exp(-5 * dt))
        this.pos.z += dz * (1 - Math.exp(-5 * dt))
        this.faceYaw(this.house.frontYaw, dt, 6)
        if (this.t < 0.3) this.idle(elapsed)
        else this.seated(elapsed)
        rate = 5
        if (this.t > 1.3) this.setState('sleep')
        break
      }
    }
    if (sp !== 'angry' && sp !== 'hunt' && sp !== 'snatch' && sp !== 'giveup') this.rage = Math.max(0, this.rage - dt * 0.6)
    if (sp !== 'sleep' && sp !== 'sitdown') this.awake = Math.min(1, this.awake + dt * 3)

    // Footfalls: dust + a heavy thud + a little camera shake when near.
    const moved = this.phase !== moving0
    if (moved) {
      const before = Math.floor(this.lastPhase / Math.PI)
      const after = Math.floor(this.phase / Math.PI)
      if (after !== before) {
        const s = spatial(this.pos.x, this.pos.z, 20)
        sfx.giantStep(s.gain * (sp === 'carry' || sp === 'return' ? 0.6 : 1), s.pan)
        const foot = this.legs[after % 2]
        const fx = this.pos.x + Math.cos(this.yaw) * foot.side * 0.45 * this.scale
        const fz = this.pos.z - Math.sin(this.yaw) * foot.side * 0.45 * this.scale
        dust(fx, fz, this.zone.props === 'desert' ? '#ecd59a' : '#e8e0d0', sp === 'chase' || sp === 'hunt' ? 1.1 : 0.7)
        this.shake = Math.max(this.shake, (sp === 'chase' || sp === 'hunt' ? 0.22 : 0.1) * s.gain)
      }
    }
    this.lastPhase = this.phase
    if (this.phase > TAU * 1000) this.phase -= TAU * 1000

    this.blendPose(dt, rate)
    this.applyPose()
    // Height: on the base's platform inside, on the ground outside.
    const wantY = this.house.inside(this.pos.x, this.pos.z) ? this.house.y : 0
    this.pos.y += (wantY - this.pos.y) * (1 - Math.exp(-10 * dt))
    this.placeRoot()

    // Eyes + rage tint.
    const eo = this.awake
    for (const e of this.eyes) e.scale.y = 0.02 + eo * 0.11 + this.rage * 0.04
    this.eyeMat.emissive.set(this.rage > 0.3 ? '#ff1a1a' : this.zone.guardian.eye)
    this.eyeMat.emissiveIntensity = eo * (2.5 + this.rage * 3)
    for (let i = 0; i < this.tintable.length; i++) {
      const m = this.tintable[i]
      m.color.copy(this.baseColors[i]).lerp(this.angryColor, this.rage * 0.75)
      m.emissive.copy(this.angryColor).multiplyScalar(this.rage * 0.35)
    }
    this.brows[0].rotation.z = 0.15 + this.rage * 0.35
    this.brows[1].rotation.z = -0.15 - this.rage * 0.35
    this.mouth.scale.y = 0.06 + (sp === 'wake' || this.state === 'angry' ? 0.18 : 0)
    if (this.rage > 0.5 && Math.random() < dt * 30) {
      glow({ x: this.pos.x + (Math.random() - 0.5) * 2.4, y: Math.random() * 4.5, z: this.pos.z + (Math.random() - 0.5) * 2.4, vy: 1.6, color: '#ff3a1a', size: 0.5, size1: 0.1, life: 0.7 })
    }

    // Sleep Z's.
    const sleeping = this.state === 'sleep' && !listenerFar
    for (const z of this.zs) {
      z.sprite.visible = sleeping
      if (!sleeping) continue
      z.t = (z.t + dt * 0.33) % 1
      this.neck.getWorldPosition(_v1)
      const k = z.t
      z.sprite.position.set(_v1.x + Math.sin(k * 5 + this.yaw) * 0.5 + 0.4, _v1.y + 1.0 + k * 2.6, _v1.z + Math.cos(k * 4) * 0.4)
      const sc = 0.35 + k * 0.6
      z.sprite.scale.set(sc, sc, 1)
      z.sprite.material.opacity = Math.min(1, k * 5) * (1 - k)
    }
    // Snores while sleeping (only nearby).
    if (sleeping) {
      this.snoreIn = (this.snoreIn ?? 2) - dt
      if (this.snoreIn <= 0) {
        this.snoreIn = 3.2
        const s = spatial(this.pos.x, this.pos.z, 12)
        sfx.snore(s.gain, s.pan)
      }
    }
    return event
  }

  setVisible(on) {
    this.root.visible = on
    if (!on) for (const z of this.zs) z.sprite.visible = false
  }
}

const _v1 = new Vector3()
const _v2 = new Vector3()

// Dark smoke + red sparks for a guardian snatching a fighter back.
export function snatchFx(x, y, z) {
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * TAU
    smoke({ x, y: y + Math.random() * 2, z, vx: Math.cos(a) * 2, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 2, color: '#2a1030', alpha: 0.8, size: 0.8, size1: 2.2, life: 0.9, drag: 2 })
  }
}
