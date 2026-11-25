import {
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  OctahedronGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three'
import { BALLS, SAFE_ZONE, SPIN } from '../config.js'
import { ballTexture } from '../balls.js'
import { M, S, box, boxC, cyl, cylC, cone, ball, mesh, bakeInto, solid, groundDecal, decalMaterial, deg } from './kit.js'
import { strokeText } from './text.js'
import { buildFighter, fighterLook } from './fighters.js'
import { mulberry32 } from '../textures.js'
import { taperTube } from './tube.js'
import { bake } from '../bake.js'

// The shop row and the other set pieces of the safe zone (screenshots 2-4,
// 7, 8, 15-19): Sell stall, Dragon Spin wheel with its coiled serpent, the Orb
// Dragon Ball Shop, Treadmill Shop kiosk, Cash Shop pagoda, Base Skins tower, Fuse
// Machine, the Claim Free Reward statue, Suggestions booth and the Orb Pack
// display. Static parts of each are baked; the few moving parts (wheel,
// crystal, orbs, pads) stay separate and are animated by `update`.

const Z = SAFE_ZONE
const byId = Object.fromEntries(Z.shops.map((s) => [s.id, s]))

let ringTex = null
function ringTexture() {
  if (ringTex) return ringTex
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,0.28)')
  g.addColorStop(0.74, 'rgba(255,255,255,0.42)')
  g.addColorStop(0.8, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.92, 'rgba(255,255,255,1)')
  g.addColorStop(0.97, 'rgba(255,255,255,0.5)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(128, 128, 128, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(128, 128, 78, 0, Math.PI * 2)
  ctx.stroke()
  ringTex = new CanvasTexture(c)
  ringTex.colorSpace = SRGBColorSpace
  return ringTex
}

export function buildStalls(scene, signs, labels) {
  const anim = { pads: [], spinners: [], bobbers: [], wheel: null, sparkles: [], steam: [], crystals: [] }
  const pad = (shop, x = shop.x, z = shop.z) => {
    if (!shop.r) return
    const mat = decalMaterial(ringTexture(), { color: shop.pad })
    const m = groundDecal(scene, mat, shop.r * 2, shop.r * 2, x, 0, z)
    anim.pads.push({ shop, x, z, r: shop.r, mesh: m, mat, heat: 0 })
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      anim.sparkles.push({ x: x + Math.cos(a) * shop.r * 0.9, y: 0.4, z: z + Math.sin(a) * shop.r * 0.9, sx: shop.r * 0.35, sy: 0.2, sz: shop.r * 0.35, color: shop.pad })
    }
  }
  const title = (shop, y, color, px = 80) => labels.add([{ t: shop.title, px, color, outline: '#14103a', ow: 16 }], shop.x, y, shop.z, 1.7)

  // --- Sell stall ---
  {
    const s = byId.sell
    const g = new Group()
    g.position.set(s.x, 0, s.z - 2.5)
    sellStall(g, signs)
    bakeInto(scene, g)
    solid(3.6, 2, 2.8, s.x, 2, s.z - 2.5)
    pad(s, s.x, s.z + 2.2)
    const sellText = signs.plane(scene, 3.2, 1.2, 240, 90, (ctx, w, h) => strokeText(ctx, 'Sell', w / 2, h / 2, 70, '#ffffff', { outline: '#a0115f', ow: 12 }), s.x, 0.04, s.z + 2.2, 0, -Math.PI / 2)
    sellText.renderOrder = 2 // always over its pad ring
    title(s, 5.4, '#ff5fb1')
  }
  // --- Dragon Spin ---
  {
    const s = byId.spin
    const g = new Group()
    g.position.set(s.x, 0, s.z - 1)
    dragonBase(g)
    bakeInto(scene, g)
    anim.wheel = dragonWheel(scene, s.x, s.z - 1)
    solid(3.4, 3, 2.4, s.x, 3, s.z - 1)
    pad(s, s.x, s.z + 2.6)
    title(s, 14.6, '#7dff5a')
  }
  // --- Dragon Ball Shop ---
  {
    const s = byId.balls
    const g = new Group()
    g.position.set(s.x, 0, s.z - 1.2)
    dragonBallShop(g, signs)
    bakeInto(scene, g)
    solid(3.5, 0.75, 0.75, s.x, 0.75, s.z + 0.9) // counter
    solid(1.5, 2.2, 1.5, s.x, 2.2, s.z - 1.8) // pedestal
    for (const [px, pz] of [[-3.7, -3.7], [3.7, -3.7], [-3.7, 1.4], [3.7, 1.4]]) solid(0.4, 3.2, 0.4, s.x + px, 3.2, s.z - 1.2 + pz)
    // The big Dragon Ball floats over the pedestal, turning slowly (animated like the crystals).
    const big = new Mesh(new SphereGeometry(1.9, 40, 28), new MeshPhysicalMaterial({ map: ballTexture(BALLS[1].look), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }))
    big.position.set(s.x, 7.2, s.z - 1.8)
    big.castShadow = true
    scene.add(big)
    anim.crystals.push({ mesh: big, y: 7.2 })
    anim.sparkles.push({ x: s.x, y: 7.2, z: s.z - 1.8, sx: 2.2, sy: 2.2, sz: 2.2, color: '#ffb04a' })
    pad(s, s.x, s.z + 4.4)
    title(s, 10.4, '#ff9a2a')
  }
  // --- Treadmill Shop kiosk ---
  {
    const s = byId.treadmill
    const g = new Group()
    g.position.set(s.x, 0, s.z)
    treadmillKiosk(g)
    bakeInto(scene, g)
    solid(2.6, 2, 2.6, s.x, 2, s.z)
    const crystal = new Mesh(new OctahedronGeometry(0.8, 0), M('#c06bff', { rough: 0.15, emissive: '#9b3bff', ei: 1.4, flat: true }))
    crystal.position.set(s.x, 4.2, s.z)
    crystal.scale.set(0.8, 1.25, 0.8)
    scene.add(crystal)
    anim.crystals.push({ mesh: crystal, y: 4.2 })
    anim.sparkles.push({ x: s.x, y: 4.3, z: s.z, sx: 1, sy: 0.6, sz: 1, color: '#d18bff' })
    pad(s)
    title(s, 6.6, '#33f1ff')
  }
  // --- Cash Shop pagoda ---
  {
    const s = byId.cash
    const g = new Group()
    g.position.set(s.x, 0, s.z)
    pagoda(g, signs)
    bakeInto(scene, g)
    solid(3.4, 3, 3.4, s.x, 3, s.z - 0.4)
    pad(s)
    title(s, 9.6, '#d36bff')
  }
  // --- Base Skins tower ---
  {
    const s = byId.skins
    const g = new Group()
    g.position.set(s.x, 0, s.z)
    skinsTower(g)
    bakeInto(scene, g)
    solid(2.2, 6, 2.2, s.x, 6, s.z)
    pad(s)
    labels.add(
      [
        { t: 'Base Skins', px: 72, color: '#ffe14a', outline: '#14103a', ow: 14 },
        { t: 'Equip Base Skins Here!', px: 34, color: '#ffffff', outline: '#14103a', ow: 8 },
      ],
      s.x,
      12.8,
      s.z,
      2.1,
    )
  }
  // --- Fuse Machine ---
  {
    const s = byId.fuse
    const g = new Group()
    g.position.set(s.x, 0, s.z)
    g.rotation.y = deg(-12)
    const steam = fuseMachine(g, signs)
    bakeInto(scene, g)
    solid(5, 2.2, 3, s.x, 2.2, s.z, deg(-12))
    const c = Math.cos(deg(-12))
    const sn = Math.sin(deg(-12))
    for (const [lx, ly, lz] of steam) anim.steam.push({ x: s.x + lx * c + lz * sn, y: ly, z: s.z - lx * sn + lz * c })
    title(s, 8.2, '#8f6bff', 84)
    pad(s, s.x + Math.sin(deg(-12)) * s.padAt, s.z + Math.cos(deg(-12)) * s.padAt) // in front of the machine
  }
  extras(scene, signs, labels, anim)
  return anim
}

// --- Sell stall -----------------------------------------------------------------------
function sellStall(g, signs) {
  const blue = S('#2f6bff', { rough: 0.45 })
  const red = S('#e3262e', { rough: 0.5 })
  const white = S('#ffffff', { rough: 0.45 })
  box(g, S('#dfe6ff', { rough: 0.6 }), 7.2, 0.3, 5.2, 0, 0, 0)
  for (const [x, z] of [[-3.3, -2.3], [3.3, -2.3], [-3.3, 2.3], [3.3, 2.3]]) {
    box(g, blue, 0.4, 3.8, 0.4, x, 0.3, z)
    box(g, white, 0.5, 0.3, 0.5, x, 1.6, z)
  }
  box(g, blue, 6.2, 3.4, 0.3, 0, 0.3, -2.2) // back wall
  box(g, red, 6.2, 1.2, 1.1, 0, 0.3, 1.7) // counter
  box(g, white, 6.6, 0.16, 1.4, 0, 1.5, 1.7) // counter top
  signs.plane(g, 4.2, 0.9, 336, 72, (ctx, w, h) => {
    strokeText(ctx, '$ SELL $', w / 2, h / 2, 54, '#ffe14a', { outline: '#6a0710', ow: 10 })
  }, 0, 0.95, 2.27)
  // Goods on the counter: cash stacks + a coin pile.
  const cash = M('#4fd35a', { rough: 0.6 })
  const band = M('#f6f0c8', { rough: 0.6 })
  for (let i = 0; i < 3; i++) {
    box(g, cash, 0.7, 0.3, 0.4, -2 + i * 0.8, 1.66, 1.6 + (i % 2) * 0.1)
    box(g, band, 0.16, 0.32, 0.42, -2 + i * 0.8, 1.66, 1.6 + (i % 2) * 0.1)
  }
  const gold = M('#ffd23a', { rough: 0.3, metal: 0.2 })
  cyl(g, gold, 0.5, 0.65, 0.25, 1.8, 1.66, 1.7, 16)
  cyl(g, gold, 0.3, 0.45, 0.22, 1.8, 1.91, 1.7, 16)
  // Vendor behind the counter.
  buildFighter(g, { gi: '#2f6bff', pants: '#20283c', hair: '#111318', skin: '#f2c79a', belt: '#e3262e', boots: '#20283c', style: 3, stance: 1 }, 0, 0.3, -0.6, 0, 0.95)
  // Striped awning: strips tilted down toward the front, scalloped valance.
  const colors = [red, white, blue]
  const strips = 9
  const w = 7.6 / strips
  for (let i = 0; i < strips; i++) {
    const x = -3.8 + w * (i + 0.5)
    boxC(g, colors[i % 3], w, 0.14, 6.0, x, 4.45, 0.1, 0, deg(10))
    cylC(g, colors[i % 3], w / 2, w / 2, 0.14, x, 3.88, 3.08, 12, 0, deg(10) + Math.PI / 2)
  }
  box(g, white, 7.8, 0.3, 0.5, 0, 4.85, -2.75) // ridge
}

// --- Dragon Spin --------------------------------------------------------------------------
function dragonBase(g) {
  const stone = S('#2e9b3c', { rough: 0.7 })
  const stoneDark = S('#22792e', { rough: 0.75 })
  cyl(g, stoneDark, 3.6, 3.9, 0.7, 0, 0, 0, 28)
  cyl(g, stone, 3.0, 3.3, 0.6, 0, 0.7, 0, 28)
  // Gold stand holding the wheel.
  const gold = M('#ffcc33', { rough: 0.28, metal: 0.2 })
  for (const s of [-1, 1]) box(g, gold, 0.4, 3.4, 0.6, s * 1.2, 1.3, -0.5, 0, 0, s * deg(-12))
  box(g, gold, 1.6, 0.5, 1.2, 0, 1.3, -0.5)

  // The serpent: a tapering body coiling round the mound, up behind the wheel,
  // over its top, with the head looking down at the player.
  const pts = []
  for (let i = 0; i <= 10; i++) {
    const a = deg(60) + (i / 10) * deg(300)
    pts.push(new Vector3(Math.cos(a) * 3.55, 0.9 + i * 0.12, Math.sin(a) * 3.55))
  }
  // Up behind the wheel's right side, arching over the top; the neck comes forward so the head
  // hangs above the pointer looking down at whoever walks up.
  pts.push(new Vector3(2.9, 2.6, -1.8), new Vector3(3.6, 4.8, -1.6), new Vector3(3.5, 7.4, -1.4), new Vector3(2.4, 9.4, -1.3), new Vector3(0.9, 10.6, -0.9), new Vector3(-0.7, 11.1, 0.1), new Vector3(-1.9, 11.0, 1.3))
  const curve = new CatmullRomCurve3(pts)
  const body = S('#3fbf3a', { rough: 0.5 })
  const belly = M('#d9f56a', { rough: 0.55 })
  const radius = (t) => (t < 0.12 ? 0.12 + (t / 0.12) * 0.42 : 0.54 + Math.sin(t * Math.PI) * 0.12)
  mesh(g, taperTube(curve, 160, 12, radius), body)
  mesh(g, taperTube(curve, 160, 8, (t) => radius(t) * 0.82, new Vector3(0, -0.22, 0)), belly)
  // Orange back fins along the body.
  const fin = M('#ff8a1f', { rough: 0.5 })
  const finGeo = new ConeGeometry(0.16, 0.6, 4)
  const up = new Vector3(0, 1, 0)
  const q = new Quaternion()
  for (let i = 4; i < 46; i++) {
    const t = i / 48
    const p = curve.getPointAt(t)
    const tan = curve.getTangentAt(t)
    const out = new Vector3(p.x, 0, p.z).normalize().multiplyScalar(0.6).add(new Vector3(0, 1, 0)).normalize()
    const side = out.sub(tan.clone().multiplyScalar(out.dot(tan))).normalize()
    const m = new Mesh(finGeo, fin)
    const r = radius(t)
    m.position.copy(p).addScaledVector(side, r + 0.2)
    m.quaternion.copy(q.setFromUnitVectors(up, side))
    m.scale.setScalar(0.7 + r)
    g.add(m)
  }
  // Head.
  const head = new Group()
  head.position.copy(curve.getPointAt(1))
  head.rotation.set(deg(18), deg(18), 0)
  head.scale.setScalar(2.2)
  g.add(head)
  const green = body
  boxC(head, green, 1.3, 1.0, 1.3, 0, 0.1, 0) // skull
  boxC(head, green, 1.0, 0.6, 1.4, 0, -0.05, 1.1) // snout
  boxC(head, M('#2c9a2c', { rough: 0.5 }), 0.9, 0.3, 1.2, 0, -0.5, 0.9, 0, deg(14)) // jaw (open)
  boxC(head, M('#b3152a', { rough: 0.6 }), 0.8, 0.12, 1.0, 0, -0.32, 0.85, 0, deg(7)) // mouth
  const tooth = M('#ffffff', { rough: 0.3 })
  for (const s of [-1, 1]) {
    cone(head, tooth, 0.07, 0.24, s * 0.35, -0.38, 1.6, 6, 0, Math.PI)
    ball(head, M('#ff2a2a', { rough: 0.2, emissive: '#ff1010', ei: 1.2 }), 0.15, s * 0.42, 0.38, 0.55, 12, 8) // eyes
    boxC(head, M('#1d5e22'), 0.42, 0.12, 0.3, s * 0.4, 0.58, 0.5, 0, 0, s * deg(-18)) // brows
    cone(head, M('#ffd23a', { rough: 0.3, metal: 0.2 }), 0.12, 0.9, s * 0.4, 0.75, -0.45, 8, 0, deg(-55), s * deg(-15)) // horns
    cylC(head, M('#ffe88a', { rough: 0.4 }), 0.03, 0.05, 1.6, s * 0.75, -0.15, 1.3, 6, 0, deg(80), s * deg(55)) // whiskers
    box(head, green, 0.16, 0.35, 0.16, s * 0.3, 0.2, 1.65) // nostrils ridge
  }
  // Mane spikes behind the head.
  for (let i = 0; i < 5; i++) cone(head, fin, 0.14, 0.7, (i - 2) * 0.25, 0.55, -0.7, 5, 0, deg(-60))
}

function dragonWheel(scene, x, z) {
  const wheel = new Group()
  wheel.position.set(x, 5.0, z - 0.2)
  scene.add(wheel)
  const spin = new Group()
  wheel.add(spin)
  const disc = new Mesh(new CylinderGeometry(3.1, 3.1, 0.4, 40), M('#1b2a5c', { rough: 0.5 }))
  disc.rotation.x = Math.PI / 2
  spin.add(disc)
  const faceTex = new CanvasTexture(paintWheel())
  faceTex.colorSpace = SRGBColorSpace
  faceTex.anisotropy = 4
  const face = new Mesh(new CircleGeometry(2.95, 48), new MeshBasicMaterial({ map: faceTex, toneMapped: false }))
  face.position.z = 0.23
  spin.add(face)
  const gold = M('#ffcc33', { rough: 0.28, metal: 0.2 })
  const rim = new Mesh(new TorusGeometry(3.1, 0.2, 10, 48), gold)
  spin.add(rim)
  const pegGeo = new SphereGeometry(0.13, 10, 8)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const p = new Mesh(pegGeo, gold)
    p.position.set(Math.cos(a) * 2.82, Math.sin(a) * 2.82, 0.32)
    spin.add(p)
  }
  const hub = new Mesh(new SphereGeometry(0.5, 20, 14), M('#ffffff', { rough: 0.3 }))
  hub.position.z = 0.25
  hub.scale.z = 0.6
  spin.add(hub)
  const hubDot = new Mesh(new SphereGeometry(0.22, 14, 10), M('#ff8a1f', { rough: 0.3, emissive: '#ff6a00', ei: 0.5 }))
  hubDot.position.z = 0.48
  spin.add(hubDot)
  // Bake the turning part (disc, face, rim, 16 pegs, hub) into a few meshes.
  wheel.remove(spin)
  const baked = bake(spin, true)
  const spinner = new Group()
  spinner.add(baked)
  wheel.add(spinner)
  // Pointer (fixed) at the top.
  const pointer = new Mesh(new ConeGeometry(0.35, 0.9, 4), M('#ff2a3a', { rough: 0.35 }))
  pointer.position.set(0, 3.35, 0.4)
  pointer.rotation.z = Math.PI
  wheel.add(pointer)
  wheel.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
  // Idle: a slow drift, with a full spin every ~14 s (ticks on each peg).
  let speed = 0.25
  let timer = 6
  let lastPeg = 0
  return {
    group: wheel,
    position: wheel.position,
    onTick: null,
    update(dt) {
      timer -= dt
      if (timer <= 0) {
        timer = 12 + Math.random() * 6
        speed = 7 + Math.random() * 3
      }
      speed += (0.25 - speed) * Math.min(1, dt * 0.55)
      spinner.rotation.z -= speed * dt
      const peg = Math.floor(-spinner.rotation.z / ((Math.PI * 2) / 16))
      if (peg !== lastPeg) {
        lastPeg = peg
        this.onTick?.(Math.min(1, speed / 8))
      }
    },
  }
}

function paintWheel() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const ctx = c.getContext('2d')
  const prizes = SPIN.wedges.map((w) => w.label)
  const colors = prizes.map((_, i) => SPIN.colors[i % SPIN.colors.length])
  const n = colors.length
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    ctx.fillStyle = colors[i]
    ctx.beginPath()
    ctx.moveTo(256, 256)
    ctx.arc(256, 256, 256, a0, a1)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 6
    ctx.stroke()
    ctx.save()
    ctx.translate(256, 256)
    ctx.rotate((a0 + a1) / 2)
    strokeText(ctx, prizes[i], 160, 0, 34, '#ffffff', { outline: '#14103a', ow: 8, maxW: 150 })
    ctx.restore()
  }
  return c
}

// --- Dragon Ball Shop -------------------------------------------------------------------------
// A round studded stage with an orange counter in front (sign + display balls in every colour of
// the shop's catalog), a gold pedestal behind it that the big Dragon Ball floats over (animated
// separately), and four orange pillars topped with gold stars.
function starShape(r) {
  const sh = new Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    if (i) sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    else sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  sh.closePath()
  return sh
}
function dragonBallShop(g, signs) {
  const navy = S('#1d2a6b', { rough: 0.5 })
  const white = S('#f4f6ff', { rough: 0.45 })
  const orange = S('#ff8a1f', { rough: 0.45 })
  const orangeDark = S('#e0560a', { rough: 0.5 })
  const red = M('#e8141b', { rough: 0.4 })
  const gold = M('#ffcc33', { rough: 0.25, metal: 0.3 })
  // Stage: navy base, white top (smaller and higher: no shared faces).
  cyl(g, navy, 4.7, 4.9, 0.35, 0, 0, 0, 40)
  cyl(g, white, 4.4, 4.4, 0.2, 0, 0.35, 0, 40)
  // Counter across the front, red stripe, white top.
  box(g, orange, 7.0, 1.3, 1.5, 0, 0.55, 2.1)
  box(g, red, 7.06, 0.24, 1.56, 0, 1.2, 2.1)
  box(g, white, 7.3, 0.16, 1.8, 0, 1.85, 2.1)
  signs.plane(g, 4.6, 0.7, 460, 70, (ctx, w, h) => strokeText(ctx, 'DRAGON BALL SHOP', w / 2, h / 2, 46, '#ffe14a', { outline: '#7a1a00', ow: 9, maxW: w - 12 }), 0, 0.9, 2.87)
  // Display balls on little gold cups along the counter, one per catalog colour.
  const shown = BALLS.slice(0, 6)
  shown.forEach((b, i) => {
    const x = -2.9 + (i * 5.8) / (shown.length - 1)
    cyl(g, gold, 0.3, 0.22, 0.14, x, 2.01, 2.0, 14)
    ball(g, M(b.look.base, { rough: 0.25 }), 0.36, x, 2.5, 2.0, 18, 12)
    cylC(g, M(b.look.star, { rough: 0.4 }), 0.1, 0.1, 0.04, x, 2.52, 2.37, 5, 0, Math.PI / 2) // a star dot facing out
  })
  // Pedestal the big ball floats over: stepped gold + orange column with a cup on top.
  cyl(g, orangeDark, 1.7, 1.9, 0.6, 0, 0.55, -0.6, 28)
  cyl(g, orange, 1.1, 1.35, 3.0, 0, 1.15, -0.6, 28)
  cyl(g, gold, 1.45, 1.2, 0.35, 0, 4.15, -0.6, 28)
  for (let k = 0; k < 3; k++) cyl(g, red, 1.16 - k * 0.04, 1.16 - k * 0.04, 0.14, 0, 1.6 + k * 0.85, -0.6, 28) // red bands
  // Pillars with gold stars on top.
  const starGeo = new ExtrudeGeometry(starShape(0.55), { depth: 0.18, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 })
  starGeo.center()
  for (const [x, z] of [[-3.7, -3.7], [3.7, -3.7], [-3.7, 1.4], [3.7, 1.4]]) {
    cyl(g, orange, 0.34, 0.4, 6.0, x, 0.55, z, 16)
    cyl(g, white, 0.48, 0.48, 0.22, x, 0.55, z, 16)
    cyl(g, white, 0.44, 0.44, 0.22, x, 6.55, z, 16)
    mesh(g, starGeo, gold, x, 7.45, z)
  }
  // Curved banner arch between the back pillars.
  box(g, orangeDark, 7.8, 0.5, 0.5, 0, 6.3, -3.7)
  box(g, red, 7.9, 0.16, 0.56, 0, 6.8, -3.7)
}

// --- Treadmill Shop kiosk ------------------------------------------------------------------
function treadmillKiosk(g) {
  const navy = M('#1d2a6b', { rough: 0.4 })
  const blue = S('#3a62e0', { rough: 0.4 })
  const gold = M('#ffcc33', { rough: 0.25, metal: 0.2 })
  cyl(g, navy, 2.6, 2.8, 0.5, 0, 0, 0, 32)
  cyl(g, blue, 1.8, 2.05, 2.6, 0, 0.5, 0, 32)
  cyl(g, gold, 2.12, 2.12, 0.22, 0, 0.5, 0, 32)
  cyl(g, gold, 1.9, 1.9, 0.22, 0, 2.95, 0, 32)
  cyl(g, navy, 1.85, 1.85, 0.3, 0, 3.1, 0, 32)
  const dome = ball(g, M('#9ff4ff', { rough: 0.05, opacity: 0.32 }), 1.7, 0, 3.4, 0, 28, 16)
  dome.scale.set(1, 1.05, 1)
  // Golden fins sweeping up around the body.
  const fin = new Shape()
  fin.moveTo(0, 0)
  fin.quadraticCurveTo(1.4, 0.6, 1.5, 3.6)
  fin.quadraticCurveTo(0.9, 2.0, 0, 1.6)
  fin.closePath()
  const finGeo = new ExtrudeGeometry(fin, { depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 })
  for (let i = 0; i < 4; i++) {
    const a = deg(45) + (i / 4) * Math.PI * 2
    const m = mesh(g, finGeo, gold, Math.sin(a) * 1.85, 1.2, Math.cos(a) * 1.85, a - Math.PI / 2)
    m.rotation.order = 'YXZ'
  }
  // Display treadmill on the front step.
  const t = new Group()
  t.position.set(0, 0.5, 2.25)
  t.scale.setScalar(0.75)
  g.add(t)
  box(t, M('#2b2f3a', { rough: 0.5 }), 1.2, 0.3, 2.0, 0, 0, 0)
  box(t, M('#111318', { rough: 0.8 }), 1.0, 0.06, 1.8, 0, 0.3, 0)
  for (const s of [-1, 1]) box(t, M('#c9cde0', { metal: 0.5, rough: 0.3 }), 0.1, 1.4, 0.1, s * 0.55, 0.3, -0.85)
  box(t, M('#c9cde0', { metal: 0.5, rough: 0.3 }), 1.2, 0.1, 0.1, 0, 1.7, -0.85)
  box(t, M('#3fd0ff', { rough: 0.3, emissive: '#1fb0ff', ei: 0.8 }), 0.7, 0.4, 0.12, 0, 1.55, -0.78, 0, deg(-25))
}

// --- Cash Shop pagoda --------------------------------------------------------------------------
function pagoda(g, signs) {
  const roof = S('#ff8a1f', { rough: 0.5 })
  const roofDark = S('#e0661a', { rough: 0.5 })
  const wall = S('#9a5a34', { rough: 0.7 })
  const wood = M('#6b3a1e', { rough: 0.7 })
  const cream = S('#f6dca8', { rough: 0.7 })
  box(g, S('#c9a36b', { rough: 0.8 }), 7.4, 0.4, 7.4, 0, 0, 0) // platform
  // Ground floor.
  box(g, cream, 5.6, 3.0, 5.6, 0, 0.4, 0)
  for (const [x, z] of [[-2.9, -2.9], [2.9, -2.9], [-2.9, 2.9], [2.9, 2.9]]) box(g, wood, 0.5, 3.2, 0.5, x, 0.4, z)
  for (const s of [-1, 1]) {
    box(g, wood, 1.3, 2.1, 0.12, s * 1.2, 0.4, 2.86) // doors
    box(g, M('#ffd23a', { rough: 0.3, metal: 0.2 }), 0.1, 0.1, 0.06, s * 0.7, 1.4, 2.95)
    box(g, wood, 0.12, 1.0, 1.2, s * 2.86, 1.5, 0) // side windows
    box(g, M('#ffe7a8', { rough: 0.4, emissive: '#ffb84a', ei: 0.35 }), 0.06, 0.8, 1.0, s * 2.94, 1.6, 0)
  }
  box(g, wood, 5.9, 0.3, 5.9, 0, 3.3, 0) // beam
  // First roof: four-sided, with an upturned lip.
  const r1 = cone(g, roof, 5.2, 1.8, 0, 4.5, 0, 4, deg(45))
  r1.scale.set(1, 1, 1)
  box(g, roofDark, 7.6, 0.25, 7.6, 0, 3.55, 0)
  // Second storey.
  box(g, cream, 3.4, 2.0, 3.4, 0, 4.6, 0)
  for (const [x, z] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) box(g, wood, 0.35, 2.1, 0.35, x, 4.6, z)
  box(g, M('#ffe7a8', { rough: 0.4, emissive: '#ffb84a', ei: 0.35 }), 1.4, 0.9, 0.08, 0, 5.2, 1.74)
  box(g, roofDark, 5.0, 0.22, 5.0, 0, 6.6, 0)
  cone(g, roof, 3.6, 2.2, 0, 7.92, 0, 4, deg(45))
  cyl(g, M('#ffd23a', { rough: 0.25, metal: 0.2 }), 0.12, 0.12, 0.8, 0, 8.9, 0, 8)
  ball(g, M('#ffd23a', { rough: 0.25, metal: 0.2 }), 0.28, 0, 9.85, 0, 14, 10)
  // Sign over the doors.
  box(g, M('#b31e2e', { rough: 0.5 }), 3.4, 0.7, 0.2, 0, 2.6, 2.95)
  signs.plane(g, 3.2, 0.6, 256, 48, (ctx, w, h) => strokeText(ctx, '$ CASH $', w / 2, h / 2, 40, '#ffe14a', { outline: '#4a0710', ow: 7 }), 0, 2.95, 3.07)
}

// --- Base Skins tower ------------------------------------------------------------------------
function skinsTower(g) {
  const lav = S('#dcd6ff', { rough: 0.5 })
  const pink = M('#ff8fd0', { rough: 0.45 })
  const white = M('#ffffff', { rough: 0.45 })
  const trim = M('#2fe3ff', { rough: 0.3, emissive: '#2fe3ff', ei: 0.4 })
  const tiers = 6
  for (let i = 0; i < tiers; i++) {
    const y = 0.2 + i * 2
    box(g, lav, 3.8, 0.2, 3.8, 0, y, 0)
    box(g, trim, 4.0, 0.12, 4.0, 0, y - 0.1, 0)
    // Sample skin on each shelf: a mini carpet + two pedestals in that skin's colours.
    const skin = [['#e3262e', '#ffa6dd'], ['#3fa2ff', '#ffffff'], ['#ffd23a', '#ff8a1f'], ['#4fe05a', '#1d2a44'], ['#a35bff', '#ffd23a'], ['#ff5fb1', '#7af0ff']][i]
    box(g, M(skin[0], { rough: 0.6 }), 0.9, 0.06, 3.0, 0, y + 0.2, 0)
    for (const s of [-1, 1]) box(g, M(skin[1], { rough: 0.5 }), 0.9, 0.3, 0.9, s * 1.1, y + 0.2, 0.4)
  }
  // Striped corner poles (pink/white segments).
  for (const [x, z] of [[-1.85, -1.85], [1.85, -1.85], [-1.85, 1.85], [1.85, 1.85]]) {
    for (let k = 0; k < 12; k++) cyl(g, k % 2 ? pink : white, 0.14, 0.14, 1.0, x, k * 1.0, z, 10)
    ball(g, white, 0.22, x, 12.1, z, 12, 8)
  }
  // Ladder up the back.
  for (const s of [-1, 1]) box(g, pink, 0.12, 12, 0.12, s * 0.5, 0, -2.05)
  for (let k = 0; k < 24; k++) box(g, white, 1.0, 0.08, 0.1, 0, 0.3 + k * 0.5, -2.05)
}

// --- Fuse Machine ------------------------------------------------------------------------------
// Returns local positions of its chimneys (steam emitters).
function fuseMachine(g, signs) {
  const purple = S('#6a3cff', { rough: 0.45 })
  const purpleDark = S('#4a22c9', { rough: 0.5 })
  const navy = M('#20195c', { rough: 0.5 })
  const tank = M('#eef0ff', { rough: 0.3 })
  const tankCap = M('#3a3f55', { rough: 0.4 })
  // Main body and a stepped deck.
  box(g, purpleDark, 10.4, 0.5, 6.4, 0, 0, 0)
  box(g, purple, 9.6, 2.6, 5.6, 0, 0.5, 0)
  box(g, purpleDark, 9.9, 0.3, 5.9, 0, 3.1, 0)
  box(g, purple, 4.6, 1.1, 3.0, -1.2, 3.4, -0.6) // control deck
  // Front vent grille.
  for (let i = 0; i < 9; i++) box(g, navy, 3.4, 0.14, 0.1, -2.6, 0.9 + i * 0.22, 2.83)
  box(g, purpleDark, 3.8, 2.3, 0.08, -2.6, 0.75, 2.8)
  // Output hatch with a glowing rainbow strip.
  box(g, navy, 2.8, 1.8, 0.2, 2.4, 0.9, 2.82)
  const rainbow = ['#ff3b4a', '#ff9a1f', '#ffe14a', '#4fe05a', '#2fd6ff', '#a35bff']
  rainbow.forEach((c, i) => box(g, M(c, { rough: 0.3, emissive: c, ei: 0.9 }), 0.36, 0.36, 0.12, 1.5 + i * 0.38, 2.15, 2.96))
  box(g, M('#ff2a2a', { rough: 0.3, emissive: '#ff1010', ei: 1.0 }), 0.7, 0.5, 0.12, 4.3, 1.4, 2.96)
  box(g, M('#3fe04a', { rough: 0.3, emissive: '#20d030', ei: 1.0 }), 0.9, 0.7, 0.12, 2.4, 1.0, 2.96)
  // Console: buttons on a tilted panel.
  const panel = new Group()
  panel.position.set(-1.2, 4.5, 0.9)
  panel.rotation.x = deg(-30)
  g.add(panel)
  boxC(panel, navy, 4.0, 0.2, 1.4, 0, 0, 0)
  rainbow.forEach((c, i) => cyl(panel, M(c, { rough: 0.3, emissive: c, ei: 0.7 }), 0.18, 0.2, 0.12, -1.5 + i * 0.6, 0.1, 0, 14))
  // Tanks: tall white cylinders with dark caps, pipes between them.
  const chimneys = []
  const tanks = [[2.2, -1.6, 2.6], [3.8, -1.6, 2.0], [2.2, 0.6, 1.6], [3.8, 0.6, 2.2], [-3.9, -1.5, 1.8]]
  for (const [x, z, h] of tanks) {
    cyl(g, tank, 0.62, 0.66, h, x, 3.4, z, 20)
    cyl(g, tankCap, 0.68, 0.68, 0.2, x, 3.4 + h, z, 20)
    cyl(g, tankCap, 0.25, 0.3, 0.5, x, 3.6 + h, z, 12)
    cyl(g, purpleDark, 0.7, 0.7, 0.16, x, 3.4 + h * 0.5, z, 20) // band
    chimneys.push([x, 4.2 + h, z])
  }
  const pipe = M('#c9cde0', { rough: 0.3, metal: 0.6 })
  cylC(g, pipe, 0.14, 0.14, 1.6, 3.0, 4.6, -1.6, 10, 0, 0, Math.PI / 2)
  cylC(g, pipe, 0.14, 0.14, 2.2, 3.0, 4.2, -0.5, 10, 0, Math.PI / 2, 0)
  cylC(g, pipe, 0.14, 0.14, 4.6, -1.0, 3.7, -2.4, 10, 0, 0, Math.PI / 2)
  // Side input funnels.
  for (const s of [-1, 1]) {
    cyl(g, tank, 0.9, 0.5, 0.8, s * 5.2, 2.2, 0.8, 16)
    cylC(g, pipe, 0.18, 0.18, 0.7, s * 4.9, 2.0, 0.8, 10, 0, 0, Math.PI / 2)
  }
  signs.plane(g, 3.4, 0.8, 300, 70, (ctx, w, h) => strokeText(ctx, 'FUSE', w / 2, h / 2, 54, '#ffffff', { outline: '#20195c', ow: 10 }), -2.6, 2.6, 2.92) // in front of the grille slats (2.88)
  return chimneys
}

// --- Statue, Suggestions booth, Orb Pack display ------------------------------------------------------
function extras(scene, signs, labels, anim) {
  // Claim Free Reward statue on the west wall.
  {
    const st = Z.statue
    const x = Z.hub.minX + 4
    const g = new Group()
    g.position.set(x, 0, st.z)
    g.rotation.y = Math.PI / 2
    const stone = S('#e6e9f2', { rough: 0.7 })
    const stoneDark = S('#b8bfd3', { rough: 0.7 })
    box(g, stoneDark, 4.2, 0.5, 4.2, 0, 0, 0)
    box(g, stone, 3.4, 1.4, 3.4, 0, 0.5, 0)
    box(g, M('#ffd23a', { rough: 0.3, metal: 0.2 }), 3.6, 0.2, 3.6, 0, 1.9, 0)
    const jade = M('#3fbf5a', { rough: 0.35, metal: 0.1 })
    buildFighter(g, { gi: '#000', pants: '#000', hair: '#000', skin: '#000', belt: '#000', boots: '#000', style: 1, stance: 2, cape: true }, 0, 2.1, 0, 0, 1.9, jade)
    bakeInto(scene, g)
    solid(2.1, 4, 2.1, x, 4, st.z)
    labels.add(
      [
        { t: 'Claim Free Reward', px: 64, color: '#7dff5a', outline: '#0b1a3a', ow: 12 },
        { t: 'Like the game + Favorite', px: 32, color: '#ffffff', outline: '#0b1a3a', ow: 8 },
      ],
      x + 0.5,
      8.2,
      st.z,
      1.9,
    )
    anim.sparkles.push({ x: x + 0.5, y: 4.5, z: st.z, sx: 1.4, sy: 2.2, sz: 1.4, color: '#9dff8a' })
    anim.freeReward = { x: x + 3, z: st.z, r: 3.2 }
  }
  // Suggestions booth.
  {
    const s = Z.suggestions
    const g = new Group()
    g.position.set(s.x, 0, s.z)
    g.rotation.y = -Math.PI / 2
    const maroon = S('#8a2b3a', { rough: 0.6 })
    const pink = S('#ff8fd0', { rough: 0.5 })
    box(g, maroon, 4.4, 1.2, 2.2, 0, 0, 0.6)
    box(g, S('#f6dca8'), 4.6, 0.14, 2.4, 0, 1.2, 0.6)
    for (const sx of [-2.1, 2.1]) box(g, pink, 0.3, 3.4, 0.3, sx, 0, -0.5)
    box(g, pink, 4.8, 0.3, 3.2, 0, 3.4, 0.1)
    box(g, M('#ffffff'), 4.2, 0.9, 0.16, 0, 3.7, 1.4)
    signs.plane(g, 4.0, 0.8, 320, 64, (ctx, w, h) => strokeText(ctx, 'Suggestions', w / 2, h / 2, 46, '#ffe14a', { outline: '#4a1530', ow: 8 }), 0, 4.15, 1.5)
    buildFighter(g, fighterLook(mulberry32(404)), 0, 0, -0.4, 0, 0.85)
    bakeInto(scene, g)
    solid(1.4, 1.8, 2.5, s.x, 1.8, s.z)
  }
  // Orb Pack display: stepped white plinth, three winged orbs bobbing above it.
  {
    const o = Z.orbPack
    const g = new Group()
    g.position.set(o.x, 0, o.z)
    g.rotation.y = -Math.PI / 2
    box(g, S('#e6e9f2'), 4.4, 0.4, 3.0, 0, 0, 0)
    box(g, S('#ffffff'), 3.4, 0.5, 2.2, 0, 0.4, 0)
    box(g, M('#3fe04a', { rough: 0.4 }), 3.6, 0.12, 2.4, 0, 0.9, 0)
    bakeInto(scene, g)
    solid(1.5, 0.5, 2.2, o.x, 0.5, o.z)
    const orbs = new Group()
    orbs.position.set(o.x, 2.4, o.z)
    scene.add(orbs)
    const colors = ['#ff3b3b', '#ffcf2a', '#1d2a7a']
    colors.forEach((c, i) => {
      const orb = new Group()
      orb.position.set(0, i === 1 ? 0.5 : 0, (i - 1) * 1.6)
      orbs.add(orb)
      const tex = new CanvasTexture(paintOrb(c, i + 3))
      tex.colorSpace = SRGBColorSpace
      const sphere = new Mesh(new SphereGeometry(0.62, 28, 18), M('#ffffff', { rough: 0.12 }).clone())
      sphere.material.map = tex
      sphere.material.emissive.set(c)
      sphere.material.emissiveIntensity = 0.25
      sphere.castShadow = true
      orb.add(sphere)
      for (const s of [-1, 1]) {
        const wing = new Mesh(wingGeo(), M('#ffffff', { rough: 0.4 }))
        wing.position.set(0, 0.15, s * 0.55)
        wing.rotation.set(0, s > 0 ? 0 : Math.PI, deg(10))
        wing.rotation.y += -Math.PI / 2
        orb.add(wing)
      }
      anim.bobbers.push({ obj: orb, base: orb.position.y, phase: i * 1.7 })
    })
    labels.add(
      [
        { t: o.price, px: 48, color: '#7dff5a', outline: '#0b1a3a', ow: 10 },
        { t: 'Dragon Ball Pack', px: 50, color: '#ff4a4a', outline: '#0b1a3a', ow: 12 },
        { t: 'BEST SELLING!', px: 26, color: '#ffffff', outline: '#0b1a3a', ow: 6 },
      ],
      o.x,
      4.3,
      o.z,
      1.7,
    )
    anim.sparkles.push({ x: o.x, y: 2.8, z: o.z, sx: 0.8, sy: 1, sz: 2, color: '#fff2a0' })
    anim.orbPack = { x: o.x - 2.2, z: o.z, r: 2.4 }
  }
}

let wingShape = null
function wingGeo() {
  if (wingShape) return wingShape
  const s = new Shape()
  s.moveTo(0, 0)
  s.quadraticCurveTo(0.5, 0.7, 1.2, 0.8)
  s.lineTo(1.0, 0.55)
  s.lineTo(1.25, 0.45)
  s.lineTo(0.95, 0.25)
  s.lineTo(1.1, 0.1)
  s.quadraticCurveTo(0.5, -0.1, 0, 0)
  wingShape = new ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false })
  return wingShape
}

function paintOrb(color, stars) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const ctx = c.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 256, 128)
  const g = ctx.createLinearGradient(0, 0, 0, 128)
  g.addColorStop(0, 'rgba(255,255,255,0.35)')
  g.addColorStop(0.5, 'rgba(255,255,255,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.25)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 128)
  ctx.fillStyle = color === '#ffcf2a' ? '#e0261e' : '#ffd23a'
  for (let i = 0; i < stars; i++) {
    const x = 64 + (i % 3) * 22 - 22
    const y = 50 + Math.floor(i / 3) * 24
    ctx.beginPath()
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 4 : 10
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    }
    ctx.fill()
  }
  return c
}
