import { BoxGeometry, CanvasTexture, Color, ConeGeometry, Group, Mesh, MeshStandardMaterial, Object3D, RepeatWrapping, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three'
import { LANE } from '../config.js'
import { dust, glow, smoke } from '../fx.js'
import { sfx, spatial } from '../audio/index.js'
import { buildGiant } from './giants.js'

// A zone's guardian: a blocky giant (its look per zone comes from giants.js),
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

let alertTexture = null
function alertTex() {
  if (alertTexture) return alertTexture
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 80
  const ctx = c.getContext('2d')
  ctx.font = '700 72px Fredoka, "Arial Black", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 12
  ctx.strokeStyle = '#5a0008'
  ctx.strokeText('!', 32, 44)
  const g = ctx.createLinearGradient(0, 10, 0, 76)
  g.addColorStop(0, '#ffe14a')
  g.addColorStop(1, '#ff3a1a')
  ctx.fillStyle = g
  ctx.fillText('!', 32, 44)
  alertTexture = new CanvasTexture(c)
  alertTexture.colorSpace = SRGBColorSpace
  return alertTexture
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

    // --- Body: each zone has its own giant (giants.js) on the shared rig ---
    // Its skin materials are its own: they tint red when it rages.
    const root = new Group()
    this.root = root
    root.scale.setScalar(this.scale)
    scene.add(root)
    const rig = buildGiant(root, zone, index)
    this.rig = rig
    this.eyeMat = rig.eyeMat
    this.tintable = rig.tintable
    this.baseColors = this.tintable.map((m) => m.color.clone())
    this.baseEmissive = this.tintable.map((m) => m.emissive.clone())
    this.angryColor = new Color(look.angry)
    this.hips = rig.hips
    this.spine = rig.spine
    this.neck = rig.neck
    this.legs = rig.legs
    this.arms = rig.arms
    this.eyes = rig.eyes // open (glowing) / closed (thin) by scaling
    this.brows = rig.brows
    this.mouth = rig.mouth

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
    this.mouthK = 0 // 0..1 jaw open (yawn, roar)
    this.napAfter = false // after placing an orb: nap on the bench (the hatch starts once asleep)
    this.dozeFor = 0
    // "!" over its head when it notices the fighter is gone.
    this.eatFlags = {}
    this.jawK = 0 // 0..1+ monstrous jaw open (the maw, built on first use)
    this.eyeFlare = 0 // 0..1 eyes burning red
    this.cheeks = 0 // 0..1 cheek bulge while chewing
    this.bulge = 0 // 0..1 a swallowed lump rolling from throat to belly
    this.tipAt = new Vector3()
    this.hitAt = new Vector3()
    this.tongueExt = 0
    this.alert = new Sprite(new SpriteMaterial({ map: alertTex(), transparent: true, depthWrite: false }))
    this.alert.visible = false
    this.alertT = 1
    scene.add(this.alert)
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
    // Each giant's own flourish on top (giants.js fx.roar).
    const time = this.clock ?? 0
    switch (this.rig?.roarStyle) {
      case 'chestbeat': {
        // Alternating fists pounding the chest.
        const beat = Math.sin(time * 16)
        for (let i = 0; i < 2; i++) {
          const hit = Math.max(0, i ? -beat : beat)
          t.armX[i] = -1.25 * k - hit * 0.35
          t.armZ[i] = (i ? -0.55 : 0.55) * k
          t.elbow[i] = -1.9 * k
        }
        t.spineX = -0.15 * k
        break
      }
      case 'flex':
        // Double biceps over its head.
        t.armX[0] = t.armX[1] = -0.2 * k
        t.armZ[0] = 1.55 * k
        t.armZ[1] = -1.55 * k
        t.elbow[0] = t.elbow[1] = -1.7 * k + Math.sin(time * 9) * 0.08
        break
      case 'stomp': {
        // Fists down, stamping one foot then the other.
        const st = Math.max(0, Math.sin(time * 7))
        const side = Math.sin(time * 3.5) > 0 ? 0 : 1
        t.armX[0] = t.armX[1] = -0.3 * k
        t.armZ[0] = 0.7 * k
        t.armZ[1] = -0.7 * k
        t.elbow[0] = t.elbow[1] = -1.4 * k
        t.leg[side] = -0.7 * st * k
        t.knee[side] = 1.1 * st * k
        break
      }
      case 'draw':
        // One hand to the sword hilt at the left hip, the other thrown forward.
        t.armX[1] = -0.5 * k
        t.armZ[1] = 0.35 * k
        t.elbow[1] = -1.6 * k
        t.armX[0] = -1.5 * k
        t.armZ[0] = 0.2 * k
        t.elbow[0] = -0.2 * k
        t.spineY = 0.35 * k
        break
    }
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
  // Job done: stands over the slot slapping the dust off its palms (forearms swing in and out).
  dustHands(time) {
    const t = this.base()
    const clap = Math.sin(time * 15)
    t.spineX = 0.18
    t.neckX = 0.3 // looking down at the orb
    t.armX[0] = t.armX[1] = -0.75
    t.armZ[0] = -0.12 - clap * 0.22
    t.armZ[1] = 0.12 + clap * 0.22
    t.elbow[0] = t.elbow[1] = -1.05
    t.hipsY = STAND_HIPS - 0.05
  }
  // Seated on the bench, arms stretched high, leaning back: a huge yawn (k 0..1 in, 1..0 out).
  yawn(k, time) {
    this.seated(time)
    const t = this.target
    t.spineX = lerp(t.spineX, -0.22, k)
    t.neckX = lerp(t.neckX, -0.55, k)
    t.neckY = 0
    t.armX[0] = t.armX[1] = lerp(-0.78, -2.75, k)
    t.armZ[0] = lerp(-0.06, 0.55, k)
    t.armZ[1] = lerp(0.06, -0.55, k)
    t.elbow[0] = t.elbow[1] = lerp(-0.85, -0.35, k)
  }
  // Seated, half awake: head comes up and turns side to side, sniffing.
  stir(k, time) {
    this.seated(time)
    const t = this.target
    t.neckX = lerp(t.neckX, 0.0, k)
    t.neckY = Math.sin(time * 3.2) * 0.4 * k
    t.spineX = lerp(t.spineX, 0.12, k)
    t.armZ[0] = -0.06 + 0.12 * k // shoulders rise
    t.armZ[1] = 0.06 - 0.12 * k
  }
  // From seated (k = 0) to standing (k = 1), pushing off its knees, leaning forward halfway.
  standUp(k) {
    const t = this.base()
    const e = k * k * (3 - 2 * k)
    t.hipsY = lerp(1.42, STAND_HIPS, e)
    t.leg[0] = t.leg[1] = lerp(-1.42, 0, e)
    t.knee[0] = t.knee[1] = lerp(1.38, 0.05, e)
    t.spineX = 0.75 * Math.sin(Math.PI * Math.min(1, k * 1.15)) + 0.05
    t.neckX = -0.25 * e
    t.armX[0] = t.armX[1] = lerp(-0.9, -0.25, e)
    t.armZ[0] = 0.2 * e
    t.armZ[1] = -0.2 * e
    t.elbow[0] = t.elbow[1] = lerp(-0.6, -0.8, e)
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
  // The fighter hatched while it napped: it sleeps on for `delay` s, then stirs, notices
  // ("!"), gets up, roars and hunts `target`.
  huntAfter(target, delay = G.wakeDelay) {
    this.chaseTarget = target
    this.napAfter = false
    this.pos.x = this.house.seat.x // (normally already there, asleep)
    this.pos.z = this.house.seat.z
    this.yaw = this.house.frontYaw
    this.dozeFor = delay
    this.setState('doze')
  }
  hunt(target) {
    this.chaseTarget = target
    this.setState('angry')
  }
  // The fighter keeps running the wrong way: lash out with the tongue (events 'tongueHit',
  // 'swallowed'; tongueTip is where the caught fighter is while it is reeled in).
  tongueAttack(target) {
    this.chaseTarget = target
    this.tongueHit = this.swallowed = false
    this.eatFlags = {}
    this.setState('tongue')
  }
  get tongueTip() {
    return this.tipAt
  }
  giveUp() {
    if (this.state === 'doze') {
      this.setState('sleep') // nothing to chase any more: it just sleeps on
      return
    }
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
    // Slow motion while the tongue sticks to the fighter.
    if (this.state === 'tongue' && this.t > 1.15 && this.t < 1.45) dt *= 0.3
    this.t += dt
    this.clock = elapsed
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
          this.napAfter = true // job done: back to the bench for a nap
          event = 'placed'
        }
        if (this.t > 1.05) this.setState(this.napAfter ? 'settle' : 'stepback')
        break
      }
      case 'settle': {
        // Straightens up and slaps the dust off its palms (three claps), then heads for the bench.
        this.dustHands(elapsed)
        rate = 14
        if (Math.floor(this.t * 2.4) !== Math.floor((this.t - dt) * 2.4) && this.t < 1.2) {
          const s = spatial(this.pos.x, this.pos.z, 14)
          sfx.clap(s.gain, s.pan)
          this.root.updateMatrixWorld(true)
          const h = this.arms[0].hand.getWorldPosition(_v1)
          dust(h.x, h.z, '#f4ead2', 0.5)
        }
        if (this.t > 1.25) this.setState('return')
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
          this.rig.step(this, this.pos.x, this.pos.z, true, s)
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
      case 'tongue': {
        // The fighter ran the wrong way. A slow, menacing lean with burning eyes, the jaw
        // creaking open with drool; the tongue lashes out (slow-motion on the hit), reels the
        // fighter to its lips where it struggles, then CHOMP: crunching, cheeks bulging,
        // crumbs flying, a gulp that rolls down its throat, a belly-patting laugh, a gassy
        // burp, a lick of the lips and a long glare at you.
        const t = this.t
        const tgt = this.chaseTarget
        this.mouth.getWorldPosition(_v1) // mouth (world)
        const fwdX = Math.sin(this.yaw)
        const fwdZ = Math.cos(this.yaw)
        const lips = _v2.set(_v1.x + fwdX * 0.9 * this.scale, _v1.y - 0.1, _v1.z + fwdZ * 0.9 * this.scale)
        const once = (key, fn) => {
          if (!this.eatFlags[key]) {
            this.eatFlags[key] = true
            fn()
          }
        }
        const spot = (near) => spatial(this.pos.x, this.pos.z, near)
        rate = 14
        if (t < 0.9) {
          // Wind-up: leans in slowly, head low and cocked, eyes flaring, jaw creaking open.
          const k = t / 0.9
          this.idle(elapsed)
          this.target.spineX = 0.1 + 0.3 * k
          this.target.neckX = 0.25 - 0.45 * k
          this.target.neckY = Math.sin(t * 3) * 0.15
          this.target.armX[0] = this.target.armX[1] = -0.5 * k
          this.target.armZ[0] = 0.5 * k
          this.target.armZ[1] = -0.5 * k
          this.target.elbow[0] = this.target.elbow[1] = -1.4 * k // claws up
          this.jawK = 0.65 * k
          this.eyeFlare = k
          this.faceYaw(Math.atan2(tgt.x - this.pos.x, tgt.z - this.pos.z), dt, 8)
          once('growl', () => {
            const s = spot(30)
            sfx.growl(Math.max(0.6, s.gain), s.pan)
          })
          if (Math.random() < dt * 14) smoke({ x: lips.x, y: lips.y - 0.2, z: lips.z, vy: -0.5, color: '#e8f4ff', alpha: 0.85, size: 0.14, size1: 0.08, life: 0.9, gravity: 9 }) // drool
          this.tongueExt = 0
          rate = 6
        } else if (t < 1.15) {
          // Lash out: the tip flies to wherever the fighter is now.
          once('shoot', () => sfx.tongueShoot())
          const k = (t - 0.9) / 0.25
          this.tongueExt = 1 - (1 - k) * (1 - k) * (1 - k)
          this.tipAt.set(tgt.x, (tgt.y ?? 0) + 1.2, tgt.z)
          this.target.spineX = 0.45 // lunges into it
          this.target.neckX = 0.1
          this.jawK = 1
          rate = 20
        } else if (t < 1.45) {
          // Stuck on (time slows here, see update()): a wet slap, the tongue quivers.
          if (!this.tongueHit) {
            this.tongueHit = true
            this.hitAt.copy(this.tipAt)
            event = 'tongueHit'
            sfx.splat()
            this.shake = 0.5
            for (let i = 0; i < 24; i++) {
              const a = Math.random() * TAU
              smoke({ x: this.tipAt.x, y: this.tipAt.y, z: this.tipAt.z, vx: Math.cos(a) * 3, vy: Math.random() * 3, vz: Math.sin(a) * 3, color: '#ff7aa8', alpha: 0.85, size: 0.28, size1: 0.05, life: 0.6, gravity: 9 })
            }
          }
          this.tongueExt = 1
          this.jawK = 1
        } else if (t < 2.1) {
          // Reel in to the lips.
          once('slurp', () => sfx.slurp())
          const k = (t - 1.45) / 0.65
          const e = k * k * (3 - 2 * k)
          this.tipAt.lerpVectors(this.hitAt, lips, e)
          this.tongueExt = 1
          this.target.spineX = -0.2 - e * 0.1
          this.target.neckX = -0.1
          this.jawK = 1
        } else if (t < 2.6) {
          // Held at its lips, struggling; the jaw yawns as wide as it goes.
          once('squirm', () => sfx.struggle())
          this.tipAt.set(lips.x + Math.sin(t * 40) * 0.12, lips.y + Math.sin(t * 33) * 0.1, lips.z + Math.cos(t * 37) * 0.12)
          this.tongueExt = 0.999
          this.jawK = 1.15
          this.target.spineX = -0.1
          this.target.neckX = -0.3
          this.eyeFlare = 1
        } else if (t < 4.1) {
          // CHOMP, then chewing: jaw working, cheeks bulging, crunches and crumbs.
          if (!this.swallowed) {
            this.swallowed = true
            this.tongueExt = 0
            event = 'swallowed'
            const s = spot(24)
            sfx.crunch(Math.max(0.7, s.gain), s.pan, true)
            this.shake = 0.7
            this.crumbs(lips, 30)
          }
          const c = Math.sin((t - 2.6) * 21)
          this.jawK = Math.max(0, c) * 0.55
          this.cheeks = Math.abs(c)
          this.idle(elapsed)
          this.target.neckX = 0.12 + Math.max(0, c) * 0.08
          this.target.spineX = 0.08
          this.target.hipsY += Math.abs(c) * 0.04
          this.target.armX[0] = -0.5
          this.target.armZ[0] = -0.3
          this.target.elbow[0] = -1.5 // one hand on the belly
          this.target.armX[1] = -0.2
          this.target.elbow[1] = -0.4
          this.awake = 0.55 // eyes half shut, relishing it
          this.eyeFlare = 0.3
          if (Math.floor((t - 2.6) * 3.34) !== Math.floor((t - dt - 2.6) * 3.34)) {
            const s = spot(22)
            sfx.crunch(s.gain, s.pan)
            this.crumbs(lips, 10)
          }
        } else if (t < 4.6) {
          // The gulp: head thrown back, a bulge rolls down the throat into the belly.
          once('gulp', () => {
            sfx.gulp()
            this.shake = 0.45
          })
          const k = (t - 4.1) / 0.5
          this.jawK = 0
          this.cheeks = 0
          this.idle(elapsed)
          this.target.neckX = -0.55 * Math.sin(Math.PI * k)
          this.bulge = k // throat -> belly
          this.awake = 0.4
        } else if (t < 5.5) {
          // Belly pats and a deep laugh.
          once('laugh', () => {
            const s = spot(26)
            sfx.laugh(Math.max(0.6, s.gain), s.pan)
          })
          const k = t - 4.6
          this.bulge = 1
          this.idle(elapsed)
          this.target.spineX = -0.18
          this.target.neckX = -0.3
          this.target.armX[0] = this.target.armX[1] = -0.45
          this.target.armZ[0] = -0.4
          this.target.armZ[1] = 0.4
          this.target.elbow[0] = this.target.elbow[1] = -1.3 + Math.abs(Math.sin(k * 14)) * 0.45 // pat pat
          this.target.hipsY += Math.abs(Math.sin(k * 10.5)) * 0.08
          this.jawK = 0.25 + Math.abs(Math.sin(k * 10.5)) * 0.45 // "HO! HO! HO!"
          this.awake = 0.7
          rate = 18
        } else if (t < 6.0) {
          // A huge burp: head back, gas and a few of the fighter's sparkles.
          once('burp', () => {
            const s = spot(26)
            sfx.burp(Math.max(0.7, s.gain), s.pan)
            this.shake = 0.4
            for (let i = 0; i < 28; i++) {
              const a = Math.random() * TAU
              smoke({ x: lips.x, y: lips.y, z: lips.z, vx: fwdX * 3 + Math.cos(a) * 1.4, vy: 0.6 + Math.random() * 1.2, vz: fwdZ * 3 + Math.sin(a) * 1.4, color: Math.random() < 0.5 ? '#b8e890' : '#d8f0b8', alpha: 0.55, size: 0.5, size1: 2.2, life: 1.3, drag: 1.8 })
            }
            for (let i = 0; i < 16; i++) glow({ x: lips.x, y: lips.y, z: lips.z, vx: fwdX * 2 + (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, vz: fwdZ * 2 + (Math.random() - 0.5) * 3, color: '#fff2a0', size: 0.3, size1: 0.03, life: 0.9, gravity: 2 })
          })
          this.idle(elapsed)
          this.target.neckX = -0.5
          this.target.spineX = -0.2
          this.jawK = 1
          this.bulge = Math.max(0, 1 - (t - 5.5) * 2)
        } else if (t < 6.6) {
          // Licks its lips (the tongue sweeps round the mouth).
          const k = (t - 6.0) / 0.6
          this.idle(elapsed)
          this.jawK = 0.45
          this.tongueExt = Math.sin(Math.PI * k)
          const side = Math.cos(k * TAU * 1.5) * 0.7 * this.scale
          this.tipAt.set(lips.x + Math.cos(this.yaw) * side, lips.y + 0.1, lips.z - Math.sin(this.yaw) * side)
          if (k > 0.8) once('smack', () => sfx.smack())
        } else if (t < 7.4) {
          // A long glare at you, eyes burning, leaning in.
          this.tongueExt = 0
          this.idle(elapsed)
          this.target.spineX = 0.25
          this.target.neckX = 0.1
          this.target.armZ[0] = 0.45
          this.target.armZ[1] = -0.45
          this.target.elbow[0] = this.target.elbow[1] = -1.6
          this.jawK = 0.15
          this.eyeFlare = 1
          this.awake = 1
          once('glare', () => {
            const s = spot(26)
            sfx.growl(Math.max(0.5, s.gain) * 0.7, s.pan)
          })
          rate = 5
        } else {
          this.eatFlags = {}
          this.tongueHit = this.swallowed = false
          this.eyeFlare = 0
          this.bulge = 0
          this.cheeks = 0
          this.setState('return')
        }
        this.drawTongue(_v1, elapsed)
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
        // Walk the last step onto the seat, turn round and sit; after a job, a big yawn and
        // stretch before nodding off.
        const s = this.house.seat
        const dx = s.x - this.pos.x
        const dz = s.z - this.pos.z
        this.pos.x += dx * (1 - Math.exp(-5 * dt))
        this.pos.z += dz * (1 - Math.exp(-5 * dt))
        this.faceYaw(this.house.frontYaw, dt, 6)
        const nap = this.napAfter
        const end = nap ? 3.2 : 1.3
        if (this.t < 0.3) this.idle(elapsed)
        else if (!nap || this.t < 1.0) this.seated(elapsed)
        else if (this.t < 2.4) {
          // Yawn: arms up over 0.4 s, hold, back down.
          const k = Math.min(1, (this.t - 1.0) / 0.4) * Math.min(1, (2.4 - this.t) / 0.4)
          this.yawn(k, elapsed)
          this.mouthK = k
          if (!this.yawned) {
            this.yawned = true
            const sp2 = spatial(this.pos.x, this.pos.z, 14)
            sfx.yawn(sp2.gain, sp2.pan)
          }
        } else {
          // Nodding off: the head drops in two little jerks.
          this.seated(elapsed)
          this.target.neckX += Math.max(0, Math.sin((this.t - 2.4) * 7)) * 0.18
          this.awake = Math.max(0, this.awake - dt * 1.5)
        }
        rate = this.t < 1.0 ? 5 : 7
        if (this.t > end) {
          this.yawned = false
          this.setState('sleep')
          if (nap) {
            this.napAfter = false
            event = 'asleep'
          }
        }
        break
      }
      case 'doze': {
        // Still asleep while the fighter sneaks off (Z's, snoring), for dozeFor s.
        this.seated(elapsed)
        rate = 4
        this.awake = Math.max(0, this.awake - dt * 2)
        if (this.t >= this.dozeFor) this.setState('rouse')
        break
      }
      case 'rouse': {
        // 0-0.7 stirs and sniffs, 0.7 eyes snap open ("!"), 0.8-1.6 gets up turning to the
        // fighter, 1.6-2.2 roars and turns red, then the stamping rage and the hunt.
        const t = this.t
        const tx = this.chaseTarget?.x ?? this.pos.x
        const tz = this.chaseTarget?.z ?? this.pos.z
        if (t < 0.7) {
          this.stir(Math.min(1, t / 0.4), elapsed)
          this.awake = 0.25 + Math.sin(t * 9) * 0.1 // squinting
          rate = 6
        } else if (t < 0.8) {
          // Startle: a jolt upright.
          this.stir(1, elapsed)
          this.target.spineX = -0.2
          this.target.neckX = -0.3
          this.target.hipsY += 0.25
          this.awake = 1
          rate = 22
        } else if (t < 1.6) {
          this.standUp((t - 0.8) / 0.8)
          this.faceYaw(Math.atan2(tx - this.pos.x, tz - this.pos.z), dt, 3)
          rate = 10
        } else {
          this.roar(Math.min(1, (t - 1.6) / 0.15))
          this.mouthK = 1
          this.rage = Math.min(1, this.rage + dt * 2.5)
          this.faceYaw(Math.atan2(tx - this.pos.x, tz - this.pos.z), dt, 5)
          rate = 12
        }
        if (t >= 0.7 && !this.startled) {
          this.startled = true
          this.popAlert()
          const s = spatial(this.pos.x, this.pos.z, 20)
          sfx.startle(s.gain, s.pan)
          this.shake = 0.25 * s.gain
        }
        if (t >= 1.6 && !this.roared) {
          this.roared = true
          const s = spatial(this.pos.x, this.pos.z, 26)
          sfx.roar(s.gain, s.pan, true)
          this.shake = Math.max(this.shake, 0.6 * s.gain)
          for (let i = 0; i < 26; i++) {
            const a = Math.random() * TAU
            glow({ x: this.pos.x, y: 3.5, z: this.pos.z, vx: Math.cos(a) * 6, vy: Math.random() * 3, vz: Math.sin(a) * 6, color: '#ff4a2a', size: 0.5, size1: 0.05, life: 0.7, drag: 2.5 })
          }
        }
        if (t >= G.rouseTime) {
          this.startled = false
          this.roared = true // the rage below doesn't roar again
          this.setState('angry')
        }
        break
      }
    }
    if (sp !== 'angry' && sp !== 'hunt' && sp !== 'snatch' && sp !== 'giveup' && sp !== 'rouse') this.rage = Math.max(0, this.rage - dt * 0.6)
    if (sp !== 'sleep' && sp !== 'sitdown' && sp !== 'doze' && sp !== 'rouse') this.awake = Math.min(1, this.awake + dt * 3)
    if (this.state !== 'tongue' && this.tongue) this.tongue.visible = false
    this.mouth.scale.y = 0.06 + this.mouthK * 0.26
    this.mouthK = Math.max(0, this.mouthK - dt * 3)
    this.updateAlert(dt)

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
        dust(fx, fz, this.rig.fx.dust, sp === 'chase' || sp === 'hunt' ? 1.1 : 0.7)
        if (!listenerFar) this.rig.step(this, fx, fz, sp === 'chase' || sp === 'hunt', s)
        this.shake = Math.max(this.shake, (sp === 'chase' || sp === 'hunt' ? 0.22 : 0.1) * s.gain)
      }
    }
    this.lastPhase = this.phase
    if (this.phase > TAU * 1000) this.phase -= TAU * 1000

    // Head tracking: while it is after you, its head turns to keep you in sight.
    if (this.chaseTarget && (sp === 'chase' || sp === 'hunt' || sp === 'angry' || (sp === 'rouse' && this.t > 0.7) || sp === 'wake')) {
      const want = Math.atan2(this.chaseTarget.x - this.pos.x, this.chaseTarget.z - this.pos.z)
      const diff = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw))
      this.target.neckY = clamp(diff - this.target.spineY, -0.9, 0.9)
    }
    this.blendPose(dt, rate)
    this.applyPose()
    // Height: on the base's platform inside, on the ground outside.
    const wantY = this.house.inside(this.pos.x, this.pos.z) ? this.house.y : 0
    this.pos.y += (wantY - this.pos.y) * (1 - Math.exp(-10 * dt))
    this.placeRoot()

    // Eyes + rage tint.
    const eo = this.awake
    for (const e of this.eyes) e.scale.y = 0.02 + eo * 0.11 + this.rage * 0.04
    this.eyeMat.emissive.set(this.rage > 0.3 || this.eyeFlare > 0.3 ? '#ff1a1a' : this.zone.guardian.eye)
    this.eyeMat.emissiveIntensity = eo * (2.5 + this.rage * 3) + this.eyeFlare * 7
    if (this.state !== 'tongue') this.eyeFlare = Math.max(0, this.eyeFlare - dt * 2)
    this.updateMaw(dt)
    for (let i = 0; i < this.tintable.length; i++) {
      const m = this.tintable[i]
      m.color.copy(this.baseColors[i]).lerp(this.angryColor, this.rage * 0.75)
      m.emissive.copy(this.baseEmissive[i]).lerp(this.angryColor, this.rage * 0.35)
    }
    // Danglers, spinners, glows, ambient particles, breath, roar burst (giants.js).
    this.rig.tick(dt, elapsed, this, listenerFar)
    this.brows[0].rotation.z = 0.15 + this.rage * 0.35
    this.brows[1].rotation.z = -0.15 - this.rage * 0.35
    if (sp === 'wake' || sp === 'angry') this.mouthK = 0.7
    if (this.rage > 0.5 && Math.random() < dt * 30) {
      glow({ x: this.pos.x + (Math.random() - 0.5) * 2.4, y: Math.random() * 4.5, z: this.pos.z + (Math.random() - 0.5) * 2.4, vy: 1.6, color: '#ff3a1a', size: 0.5, size1: 0.1, life: 0.7 })
    }

    // Sleep Z's.
    const sleeping = (this.state === 'sleep' || this.state === 'doze') && !listenerFar
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

  // The tongue: a chain of glossy pink segments along an arcing, wobbling curve from the
  // mouth to the tip (extension tongueExt 0..1), with a fat sticky blob at the end.
  // The maw: a hinged lower jaw with teeth top and bottom over a dark red throat, built on
  // the mouth's own parent so it sits right on whatever head this giant has. Hidden while shut.
  updateMaw(dt) {
    const want = this.jawK
    if (!this.maw && want < 0.02) return
    if (!this.maw) {
      const g = new Group()
      g.position.copy(this.mouth.position)
      g.position.z += 0.02
      this.mouth.parent.add(g)
      const inside = new Mesh(box1, new MeshStandardMaterial({ color: '#3a0010', emissive: '#4a0010', emissiveIntensity: 0.6, roughness: 0.6 }))
      inside.scale.set(0.62, 0.5, 0.05)
      inside.position.set(0, -0.12, 0)
      g.add(inside)
      const tooth = new ConeGeometry(0.05, 0.16, 4)
      const toothMat = new MeshStandardMaterial({ color: '#fff8e8', roughness: 0.3 })
      for (let i = 0; i < 6; i++) {
        const t = new Mesh(tooth, toothMat)
        t.position.set(-0.25 + i * 0.1, 0.06, 0.04)
        t.rotation.x = Math.PI // pointing down
        g.add(t)
      }
      const jaw = new Group()
      jaw.position.set(0, 0.0, -0.02)
      g.add(jaw)
      const jawBox = new Mesh(box1, this.tintable[0] ?? toothMat)
      jawBox.scale.set(0.7, 0.16, 0.34)
      jawBox.position.set(0, -0.08, 0.14)
      jawBox.castShadow = true
      jaw.add(jawBox)
      for (let i = 0; i < 6; i++) {
        const t = new Mesh(tooth, toothMat)
        t.position.set(-0.25 + i * 0.1, 0.02, 0.27)
        jaw.add(t)
      }
      this.maw = { g, jaw, inside }
      this.jawNow = 0
    }
    // Snaps shut fast, opens with a little weight.
    const k = want > this.jawNow ? 10 : 22
    this.jawNow += (want - this.jawNow) * (1 - Math.exp(-k * dt))
    const m = this.maw
    m.g.visible = this.jawNow > 0.03
    m.jaw.position.y = -0.5 * this.jawNow
    m.jaw.rotation.x = 0.55 * this.jawNow
    m.inside.scale.y = 0.05 + this.jawNow * 0.55
    m.inside.position.y = -0.04 - this.jawNow * 0.28
    // Cheeks puff while chewing; the swallowed lump swells the chest then the belly.
    const ch = 1 + this.cheeks * 0.14
    this.neck.scale.set(ch, 1 + this.cheeks * 0.05, ch)
    const chest = 1 + Math.max(0, 1 - Math.abs(this.bulge - 0.3) * 4) * 0.12
    const belly = 1 + Math.max(0, Math.min(1, (this.bulge - 0.5) * 3)) * 0.14
    this.spine.scale.set(chest, 1, chest)
    this.hips.scale.set(belly, 1, belly)
  }

  // Bits flying out of a chewing mouth.
  crumbs(at, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU
      const sp = 1.5 + Math.random() * 3
      smoke({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 3, vz: Math.sin(a) * sp, color: ['#ffd8b0', '#f2c79a', '#ffffff', '#ff7aa8'][i % 4], alpha: 0.95, size: 0.16, size1: 0.1, life: 0.8, gravity: 14, fadeIn: 0, fadeOut: 0.3 })
      if (i % 3 === 0) glow({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 2, vz: Math.sin(a) * sp, color: '#fff2a0', size: 0.25, size1: 0.02, life: 0.6, gravity: 6 })
    }
  }

  drawTongue(mouth, time) {
    if (!this.tongue) {
      const g = new Group()
      const mat = new MeshStandardMaterial({ color: '#ff5a8a', roughness: 0.25, emissive: '#5a0a20', emissiveIntensity: 0.4 })
      const tipMat = new MeshStandardMaterial({ color: '#ff3a6a', roughness: 0.2 })
      this.tongueSegs = []
      for (let i = 0; i < 16; i++) {
        const m = new Mesh(box1, mat)
        m.castShadow = true
        g.add(m)
        this.tongueSegs.push(m)
      }
      this.tongueTipMesh = new Mesh(box1, tipMat)
      this.tongueTipMesh.scale.set(0.75, 0.55, 0.75)
      g.add(this.tongueTipMesh)
      g.visible = false
      this.root.parent.add(g)
      this.tongue = g
    }
    const ext = this.tongueExt
    if (ext <= 0.001) {
      this.tongue.visible = false
      return
    }
    this.tongue.visible = true
    const tip = _v3.lerpVectors(mouth, this.tipAt, ext)
    const len = mouth.distanceTo(tip)
    const n = this.tongueSegs.length
    const arc = Math.min(2.5, len * 0.12) // sags up then down like a whip
    const wob = this.state === 'tongue' && this.t > 0.9 && this.t < 1.05 ? 0.35 : 0.12
    let px = mouth.x
    let py = mouth.y
    let pz = mouth.z
    for (let i = 0; i < n; i++) {
      const u = (i + 1) / n
      const x = mouth.x + (tip.x - mouth.x) * u + Math.sin(u * 9 + time * 30) * wob * (1 - u) * u * 4
      const y = mouth.y + (tip.y - mouth.y) * u + Math.sin(u * Math.PI) * arc
      const z = mouth.z + (tip.z - mouth.z) * u + Math.cos(u * 7 + time * 26) * wob * (1 - u) * u * 4
      const m = this.tongueSegs[i]
      const dx = x - px
      const dy = y - py
      const dz = z - pz
      const sl = Math.hypot(dx, dy, dz) + 0.05
      m.position.set((x + px) / 2, (y + py) / 2, (z + pz) / 2)
      m.lookAt(x, y, z)
      const w = 0.42 - u * 0.12
      m.scale.set(w, w * 0.55, sl)
      px = x
      py = y
      pz = z
    }
    this.tongueTipMesh.position.set(px, py, pz)
    this.tongueTipMesh.rotation.y = time * 6
  }

  popAlert() {
    this.alertT = 0
    this.alert.visible = true
  }
  updateAlert(dt) {
    if (!this.alert.visible) return
    this.alertT += dt
    const t = this.alertT
    if (t > 1.6) {
      this.alert.visible = false
      return
    }
    // Pops with an overshoot, wobbles, then floats up and fades.
    const pop = t < 0.18 ? (t / 0.18) * 1.35 : 1.35 - Math.min(0.35, (t - 0.18) * 2)
    this.neck.getWorldPosition(_v1)
    this.alert.position.set(_v1.x, _v1.y + 2.2 * this.scale + Math.max(0, t - 1) * 1.2, _v1.z)
    this.alert.scale.set(1.3 * pop, 1.6 * pop, 1)
    this.alert.material.rotation = Math.sin(t * 22) * 0.18 * Math.max(0, 1 - t * 2)
    this.alert.material.opacity = t > 1.1 ? 1 - (t - 1.1) / 0.5 : 1
  }

  setVisible(on) {
    this.root.visible = on
    if (!on) this.alert.visible = false
    if (!on) for (const z of this.zs) z.sprite.visible = false
  }
}

const _v1 = new Vector3()
const _v2 = new Vector3()
const _v3 = new Vector3()

// Dark smoke + red sparks for a guardian snatching a fighter back.
export function snatchFx(x, y, z) {
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * TAU
    smoke({ x, y: y + Math.random() * 2, z, vx: Math.cos(a) * 2, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 2, color: '#2a1030', alpha: 0.8, size: 0.8, size1: 2.2, life: 0.9, drag: 2 })
  }
}
