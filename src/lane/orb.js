import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { LANE } from '../config.js'
import { glow } from '../fx.js'

// The winged orb the player turns into on the lane: a glossy deep-mauve sphere
// with white stars, on two blocky feathered wings. The sphere rolls with the
// ground speed (rotation about the axis across the motion); the wings stay
// upright, turn with the heading, beat (faster at speed, frantic when held),
// and a few sparkles stream off the back when it is moving.

const R = LANE.ball.radius

function starTexture() {
  const W = 512
  const H = 256
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  // Base: deep mauve with a soft vertical shading band (equirectangular map).
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#9a6a82')
  g.addColorStop(0.5, '#7a4a62')
  g.addColorStop(1, '#5e3550')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // Faint speckle so the gloss has something to catch.
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2)
  }
  const star = (cx, cy, r) => {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rr = i % 2 ? r * 0.45 : r
      ctx.lineTo(cx + Math.cos(a) * rr * 0.55, cy + Math.sin(a) * rr) // squashed x: equirect stretch near the face
    }
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(255,255,255,0.8)'
    ctx.shadowBlur = 6
    ctx.fill()
  }
  // Two clusters on opposite sides, so a star is always in view as it rolls.
  for (const ox of [0, W / 2]) {
    star(ox + 128, 112, 22)
    star(ox + 96, 150, 18)
    star(ox + 160, 152, 18)
    star(ox + 128, 186, 14)
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

// One wing: rows of blocky feathers fanning out from the shoulder (+X side; mirror for -X).
function buildWing(side, white, pink) {
  const wing = new Group()
  const feather = new BoxGeometry(1, 1, 1)
  const add = (m, w, h, d, x, y, z, rz, ry = 0) => {
    const f = new Mesh(feather, m)
    f.scale.set(w, h, d)
    f.position.set(side * x, y, z)
    f.rotation.set(0, side * ry, side * rz)
    f.castShadow = true
    wing.add(f)
  }
  // Arm bone of the wing (leading edge).
  add(white, 0.9, 0.22, 0.2, 0.42, 0.18, 0, 0.35)
  add(white, 0.7, 0.18, 0.18, 1.02, 0.5, -0.02, 0.62)
  // Primaries: long feathers fanning back and down from the tip.
  for (let i = 0; i < 6; i++) {
    const k = i / 5
    const len = 0.95 - k * 0.35
    add(i % 2 ? pink : white, 0.2, len, 0.07, 1.3 - k * 0.78, 0.55 - k * 0.3 - len * 0.35, -0.06 - k * 0.04, 0.25 + k * 0.45, -0.08)
  }
  // Coverts: a shorter, fluffier layer on top (slightly in front: no shared faces).
  for (let i = 0; i < 5; i++) {
    const k = i / 4
    add(pink, 0.24, 0.42, 0.09, 1.05 - k * 0.65, 0.35 - k * 0.12, 0.04, 0.4 + k * 0.4)
  }
  // Tufts at the root.
  add(white, 0.32, 0.3, 0.14, 0.32, 0.02, 0.06, 0.1)
  return wing
}

export function createOrb(scene) {
  const root = new Group() // at the orb's centre, never rotates
  root.visible = false
  scene.add(root)

  const ball = new Mesh(
    new SphereGeometry(R, 40, 28),
    new MeshPhysicalMaterial({ map: starTexture(), roughness: 0.28, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.3, sheenColor: 0xffc0e0 }),
  )
  ball.castShadow = true
  root.add(ball)

  const heading = new Group() // turns with the facing; carries the wings
  root.add(heading)
  const white = new MeshStandardMaterial({ color: '#fbf4fa', roughness: 0.85 })
  const pink = new MeshStandardMaterial({ color: '#f2d2e6', roughness: 0.85 })
  const wings = []
  for (const side of [-1, 1]) {
    const pivot = new Group()
    pivot.position.set(side * R * 0.78, R * 0.25, -R * 0.35)
    heading.add(pivot)
    const w = buildWing(side, white, pink)
    w.scale.setScalar(0.85)
    pivot.add(w)
    wings.push({ pivot, side })
  }

  const q = new Quaternion()
  const axis = new Vector3()
  let flap = 0
  let pop = 0 // 0..1 scale-in after a transform
  let trailAcc = 0
  let held = false

  return {
    root,
    show(on) {
      root.visible = on
      if (on) pop = 0
    },
    get visible() {
      return root.visible
    },
    setHeld(on) {
      held = on
    },
    // centre: world position; vel: {x, z} ground velocity; facing: yaw; speedK: 0..1 of top speed
    update(dt, centre, vel, facing, speedK) {
      if (!root.visible) return
      root.position.set(centre.x, centre.y, centre.z)
      pop = Math.min(1, pop + dt * 3.2)
      // Overshoot pop-in (easeOutBack).
      const s = pop >= 1 ? 1 : 1 + 2.4 * Math.pow(pop - 1, 3) + 1.4 * Math.pow(pop - 1, 2)
      root.scale.setScalar(Math.max(0.01, s))

      const v = Math.hypot(vel.x, vel.z)
      if (v > 0.01 && !held) {
        axis.set(vel.z, 0, -vel.x).normalize()
        q.setFromAxisAngle(axis, (v * dt) / R)
        ball.quaternion.premultiply(q)
      }
      if (held) {
        // Struggling in the guardian's hands: a nervous wobble.
        const t = performance.now() / 1000
        ball.rotation.z = Math.sin(t * 26) * 0.18
      }
      heading.rotation.y = facing
      // Wing beat: slow glide at rest, quicker at speed, frantic while held.
      const rate = held ? 15 : 4 + speedK * 7
      flap += dt * rate
      const amp = held ? 0.75 : 0.35 + speedK * 0.25
      const beat = Math.sin(flap)
      for (const w of wings) {
        w.pivot.rotation.z = w.side * (0.25 + beat * amp)
        w.pivot.rotation.y = -w.side * (0.35 + Math.cos(flap) * 0.12)
      }
      // Sparkle trail.
      if (speedK > 0.25 && !held) {
        trailAcc += dt * 40 * speedK
        while (trailAcc > 1) {
          trailAcc -= 1
          const back = Math.random() * 0.6
          glow({
            x: centre.x - (vel.x / (v || 1)) * (R + back) + (Math.random() - 0.5) * 0.6,
            y: centre.y + (Math.random() - 0.3) * 0.8,
            z: centre.z - (vel.z / (v || 1)) * (R + back) + (Math.random() - 0.5) * 0.6,
            vy: 0.6,
            color: Math.random() < 0.5 ? '#ffe9f6' : '#ffd6a0',
            size: 0.28,
            size1: 0.02,
            life: 0.6,
          })
        }
      }
      return beat
    },
  }
}
