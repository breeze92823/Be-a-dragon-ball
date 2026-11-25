import { AdditiveBlending, CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three'
import './treadmill.css'
import { SAFE_ZONE, TREADMILL as T } from './config.js'
import { bake } from './bake.js'
import { M, S, box, boxC, cylC, deg } from './safezone/kit.js'
import { roundRect, short, strokeText } from './safezone/text.js'
import { player, placePlayer, resetPlayer, setFrozen, isFrozen } from './player.js'
import { syncYawToPlayer } from './camera.js'
import { inputState, onKey } from './input.js'
import { segmentClear } from './physics.js'
import { addSpeed, equippedTreadmill, state, trainMulti } from './state.js'
import { flash, glow, puff, smoke } from './fx.js'
import { toast } from './toast.js'
import * as snd from './audio/treadmill.js'

// The Treadmill: the HUD's Treadmill button (or T) drops a treadmill right where you stand
// in the safe zone, you hop on and run automatically, gaining Speed every TREADMILL.every s
// ("+100" pops over your head, shoes fly into the Speed counter; now and then a power stride
// gives +1000). TAP!! (the round button, or a click / tap on the world) adds a bonus each
// press. Moving or jumping steps off; the button again (or T) stows it.
//
// The machine: a lilac studded deck with raised side rails and neon strips, a scrolling
// chevron belt over rollers, a front tower with handlebars and an angled console whose
// screen shows your Speed. The static frame is baked to a few meshes; the belt, rollers,
// screen, neon and the ground ring are the animated parts.
//
// While running the player is frozen on the belt (player.setFrozen) and given a velocity
// along the belt, so the animator runs, the footsteps play and the camera's speed framing
// kicks in, without the body going anywhere.

// Colours: the equipped treadmill's (Treadmill Shop) over TREADMILL.colors; buildModel() reads C.
let C = { ...T.colors }
const D = T.deckHeight
const HUB = SAFE_ZONE.hub
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeOutBack = (t) => {
  const c = 2.2
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}
const R = (a, b) => a + Math.random() * (b - a)

const SHOE_SVG =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M4 44 18 14 30 20 36 30 58 38Q64 46 56 54H8Z" fill="url(#tmShoeG)" stroke="#0b2a6a" stroke-width="5" stroke-linejoin="round"/><path d="M8 54h48" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/><path d="M22 26l6 3M19 32l7 3" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/><defs><linearGradient id="tmShoeG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ae6ff"/><stop offset="1" stop-color="#1f8bff"/></linearGradient></defs></svg>'
const HAND_SVG =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M24 34V12a5 5 0 0 1 10 0v16l3-1a5 5 0 0 1 6 3l1-.3a5 5 0 0 1 6 3.4l.4-.1a5 5 0 0 1 6 4.3V48c0 8-6 14-14 14H38c-5 0-8-2-11-6L15 42a5 5 0 0 1 7-7Z" fill="#ffffff" stroke="#0b2a6a" stroke-width="4" stroke-linejoin="round"/><path d="M34 34v8M42 34v8M50 37v6" stroke="#0b2a6a" stroke-width="3" stroke-linecap="round"/></svg>'

// --- Textures ------------------------------------------------------------------------------
function beltTexture() {
  const w = 128
  const h = 256
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  ctx.fillStyle = C.belt
  ctx.fillRect(0, 0, w, h)
  // Rubber grain: faint cross ribs.
  for (let y = 0; y < h; y += 8) {
    ctx.fillStyle = y % 16 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'
    ctx.fillRect(0, y, w, 2)
  }
  // Two chevrons pointing up the canvas (= toward the back of the machine on the belt).
  ctx.lineJoin = 'miter'
  for (const cy of [h * 0.3, h * 0.8]) {
    ctx.beginPath()
    ctx.moveTo(w * 0.14, cy + 34)
    ctx.lineTo(w * 0.5, cy - 20)
    ctx.lineTo(w * 0.86, cy + 34)
    ctx.lineTo(w * 0.86, cy + 62)
    ctx.lineTo(w * 0.5, cy + 8)
    ctx.lineTo(w * 0.14, cy + 62)
    ctx.closePath()
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.save()
    ctx.translate(3, 4)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = C.chevron
    ctx.fill()
  }
  // Darker rubber at the edges, where the rails shade it.
  const g = ctx.createLinearGradient(0, 0, w, 0)
  g.addColorStop(0, 'rgba(0,0,0,0.35)')
  g.addColorStop(0.12, 'rgba(0,0,0,0)')
  g.addColorStop(0.88, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(1, 2.4)
  t.anisotropy = 8
  return t
}

function ringTexture() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  const m = s / 2
  const g = ctx.createRadialGradient(m, m, s * 0.18, m, m, m)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.62, 'rgba(255,255,255,0.05)')
  g.addColorStop(0.8, 'rgba(255,255,255,0.75)')
  g.addColorStop(0.86, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.92, 'rgba(255,255,255,0.3)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  // Dashes round the ring, so its slow spin reads.
  ctx.translate(m, m)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  for (let i = 0; i < 16; i++) {
    ctx.rotate((Math.PI * 2) / 16)
    ctx.fillRect(s * 0.4, -3, s * 0.07, 6)
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

// Console screen: "SPEED" and your Speed stat, repainted on every tick.
function makeScreen() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 112
  const ctx = c.getContext('2d')
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  let shown = ''
  return {
    tex,
    paint(value, beat) {
      const text = short(Math.floor(value))
      const key = text + '|' + (beat % 8)
      if (key === shown) return
      shown = key
      ctx.clearRect(0, 0, 256, 112)
      ctx.fillStyle = '#071433'
      roundRect(ctx, 2, 2, 252, 108, 16)
      ctx.fill()
      ctx.strokeStyle = C.screen
      ctx.lineWidth = 4
      ctx.stroke()
      strokeText(ctx, 'SPEED', 128, 26, 22, C.screen, { outline: '#071433', ow: 4 })
      strokeText(ctx, text, 128, 66, 44, '#ffffff', { outline: '#0b2a6a', ow: 6 })
      // Little running bar: 8 cells, one lit per tick.
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i <= beat % 8 ? '#7dff5a' : 'rgba(125,255,90,0.18)'
        ctx.fillRect(40 + i * 22, 94, 16, 8)
      }
      tex.needsUpdate = true
    },
  }
}

// --- Model ---------------------------------------------------------------------------------
// Local frame: +Z = forward (the console), the belt top moves toward -Z. Feet at y = D.
function buildModel() {
  C = { ...T.colors, ...equippedTreadmill().colors }
  const root = new Group()
  const frame = new Group()
  const body = S(C.body, { rough: 0.45 })
  const dark = S(C.bodyDark, { rough: 0.5 })
  const trim = S(C.trim, { rough: 0.4 })
  const bed = M('#2c2840', { rough: 0.8 })
  const steel = M('#d9dbe8', { rough: 0.3, metal: 0.6 })
  const grip = M('#23222e', { rough: 0.9 })

  box(frame, dark, 2.0, 0.2, 3.7, 0, 0.06, 0) // plinth
  for (const x of [-0.82, 0.82]) for (const z of [-1.62, 1.62]) cylC(frame, grip, 0.13, 0.15, 0.08, x, 0.04, z, 12) // feet
  box(frame, bed, 1.3, 0.3, 3.3, 0, 0.27, 0) // under the belt
  for (const s of [-1, 1]) {
    box(frame, body, 0.36, 0.6, 3.4, s * 0.82, 0.25, 0) // side rails
    box(frame, trim, 0.4, 0.07, 3.44, s * 0.82, 0.85, 0) // rail caps
    box(frame, dark, 0.2, 0.22, 0.2, s * 0.82, 0.92, -1.6) // rear rail stops
  }
  box(frame, dark, 1.32, 0.4, 0.24, 0, 0.12, -1.74) // rear roller housing (below the belt)
  // Front tower.
  box(frame, dark, 2.1, 0.92, 0.72, 0, 0.06, 1.96)
  box(frame, trim, 2.16, 0.08, 0.78, 0, 0.98, 1.96)
  for (const s of [-1, 1]) {
    box(frame, body, 0.32, 1.0, 0.34, s * 0.82, 1.04, 1.96) // uprights
    // Side handrails: post up from the rail, rail forward to the upright.
    cylC(frame, steel, 0.045, 0.045, 0.52, s * 0.82, 1.17, 0.55, 10)
    cylC(frame, steel, 0.045, 0.045, 1.3, s * 0.82, 1.42, 1.18, 10, 0, deg(90))
    cylC(frame, grip, 0.06, 0.06, 0.5, s * 0.82, 1.42, 1.05, 10, 0, deg(90))
  }
  cylC(frame, steel, 0.05, 0.05, 1.64, 0, 1.62, 1.72, 12, 0, 0, deg(90)) // handlebar
  for (const s of [-1, 1]) cylC(frame, grip, 0.066, 0.066, 0.34, s * 0.5, 1.62, 1.72, 12, 0, 0, deg(90))
  // Console (tilted toward the runner).
  const con = new Group()
  con.position.set(0, 2.12, 1.86)
  con.rotation.x = deg(-30)
  frame.add(con)
  boxC(con, body, 2.0, 0.4, 0.8, 0, 0, 0)
  boxC(con, trim, 2.06, 0.06, 0.86, 0, -0.2, 0)

  const baked = bake(frame, true)
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  root.add(baked)

  // --- Animated parts ---
  const beltTex = beltTexture()
  const belt = new Mesh(new PlaneGeometry(1.26, 3.24), new MeshStandardMaterial({ map: beltTex, roughness: 0.85 }))
  belt.rotation.x = -Math.PI / 2
  belt.position.set(0, D, 0)
  belt.receiveShadow = true
  root.add(belt)

  // Rollers at both ends, striped so their spin shows.
  const rollers = []
  for (const z of [-1.62, 1.6]) {
    const r = new Group()
    r.position.set(0, D - 0.1, z)
    cylC(r, steel, 0.11, 0.11, 1.28, 0, 0, 0, 16, 0, 0, deg(90))
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      boxC(r, grip, 1.3, 0.03, 0.05, 0, Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0, a)
    }
    root.add(r)
    rollers.push(r)
  }

  // Neon strips along the rails + console buttons (pulse on every tick).
  const neonMat = new MeshBasicMaterial({ color: C.neon, toneMapped: false })
  for (const s of [-1, 1]) {
    boxC(root, neonMat, 0.03, 0.07, 3.0, s * 1.02, 0.6, 0)
    boxC(root, neonMat, 0.03, 0.06, 0.6, s * 1.08, 0.6, 1.96) // tower sides
  }
  const btns = ['#ff4a5a', '#ffd23a', '#7dff5a'].map((col) => new MeshBasicMaterial({ color: col, toneMapped: false }))
  btns.forEach((m, i) => cylC(con2(root, con), m, 0.07, 0.07, 0.05, 0.78, 0.2, -0.22 + i * 0.2, 12))

  // Screen on the console's face.
  const screen = makeScreen()
  const screenMat = new MeshBasicMaterial({ map: screen.tex, toneMapped: false })
  const sm = new Mesh(new PlaneGeometry(1.15, 0.5), screenMat)
  sm.rotation.set(-Math.PI / 2, 0, Math.PI)
  sm.position.set(-0.12, 0.215, 0)
  con2(root, con).add(sm)

  // Ground ring.
  const ringMat = new MeshBasicMaterial({ map: ringTexture(), color: C.neon, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false })
  const ring = new Mesh(new PlaneGeometry(1, 1), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.035
  ring.renderOrder = 1

  root.traverse((o) => {
    if (o.isMesh && o.material !== ringMat) o.castShadow = true
  })
  return { root, beltTex, rollers, neonMat, btns, screen, screenMat, ring, ringMat }
}

// The console's animated parts live in a twin of the (baked) console frame on the root.
const twins = new WeakMap()
function con2(root, con) {
  let g = twins.get(con)
  if (!g) {
    g = new Group()
    g.position.copy(con.position)
    g.rotation.copy(con.rotation)
    root.add(g)
    twins.set(con, g)
  }
  return g
}

// --- Screen-space popups (+100, flying shoes, TAP!!) ----------------------------------------
function makeOverlay() {
  const layer = document.createElement('div')
  layer.className = 'tm-layer'
  document.body.appendChild(layer)

  const tapBtn = document.createElement('button')
  tapBtn.type = 'button'
  tapBtn.className = 'tm-tap'
  tapBtn.setAttribute('aria-label', 'Tap to train faster')
  tapBtn.innerHTML = `<span class="tm-tap-timer"></span><span class="tm-tap-ring"></span><span class="tm-tap-hand">${HAND_SVG}</span><span class="tm-tap-text">TAP!!</span><span class="tm-tap-x">x2</span>`
  layer.appendChild(tapBtn)

  const pool = []
  const take = (cls) => {
    let e = pool.find((p) => p.className === cls && !p.isConnected)
    if (!e) {
      e = document.createElement('div')
      e.className = cls
      pool.push(e)
    }
    return e
  }
  return { layer, tapBtn, take, live: () => layer.childElementCount }
}

// --- The system ------------------------------------------------------------------------------
export function createTreadmill(scene, { hud, camera, renderer }) {
  let m = buildModel()
  let built = equippedTreadmill().id
  const overlay = makeOverlay()
  const canvas = renderer?.domElement ?? null

  let phase = 'off' // off | spawning | running | stowing
  let t = 0 // s in this phase
  let spool = 0 // 0..1 motor / belt speed
  let tick = 0
  let beat = 0
  let streak = 0
  let pulse = 0 // 0..1 tick flash
  let tapPulse = 0
  let lastTap = -1
  let armed = false // move keys were released after starting (holding W does not throw you off at once)
  let motor = null
  let streakT = 0
  // TAP!! bubble: hidden until a random moment, then up for T.tap.life s.
  let tapOn = false
  let tapLeft = 0
  let tapMult = 2
  let tapGap = 0 // s until the next bubble shows
  const tapOff = { x: 0, y: 0 } // where it floats relative to the runner (px), rolled per bubble
  const tapX = overlay.tapBtn.querySelector('.tm-tap-x')
  const at = { x: 0, y: 0, z: 0, yaw: 0, fx: 0, fz: 1, rx: 1, rz: 0 }
  const head = new Vector3()
  const tmp = new Vector3()

  const setActive = (on) => {
    document.querySelector('.hud-mb-treadmill')?.classList.toggle('tm-active', on) // the HUD's menu button glows
  }

  const range = ([a, b]) => a + Math.random() * (b - a)
  // Weighted pick: higher multipliers have a small weight, so they are rare.
  function rollTier() {
    const tiers = T.tap.tiers
    let r = Math.random() * tiers.reduce((n, t) => n + t.w, 0)
    for (const t of tiers) if ((r -= t.w) < 0) return t.m
    return tiers[0].m
  }
  function showTap() {
    tapMult = rollTier()
    tapOn = true
    tapLeft = T.tap.life
    tapOff.x = R(-45, 45)
    tapOff.y = R(-55, 35)
    const b = overlay.tapBtn
    b.className = `tm-tap t${tapMult}`
    tapX.textContent = `x${tapMult}`
    b.style.setProperty('--p', 1)
    void b.offsetWidth // restart the pop-in
    b.classList.add('on')
    snd.tapAppear(tapMult)
    flash(at.x, at.y + D + 1.8, at.z, tapMult >= 4 ? '#ffd23a' : '#7af0ff', 14 + tapMult * 6, 3 + tapMult)
  }
  function hideTap(nextGap = range(T.tap.gap)) {
    if (tapOn) overlay.tapBtn.classList.remove('on', 'hit')
    tapOn = false
    tapGap = nextGap
  }

  // --- Where am I on screen ---
  function toScreen(x, y, z) {
    tmp.set(x, y, z).project(camera)
    const r = canvas?.getBoundingClientRect() ?? { left: 0, top: 0, width: innerWidth, height: innerHeight }
    return { x: r.left + (tmp.x * 0.5 + 0.5) * r.width, y: r.top + (-tmp.y * 0.5 + 0.5) * r.height, behind: tmp.z > 1 }
  }

  // --- Can a treadmill go here? ---
  function blocked() {
    const p = player.position
    for (const h of [0.45, 1.5]) {
      const y = p.y + h
      const probes = [
        [at.fx * 2.45, at.fz * 2.45],
        [-at.fx * 2.05, -at.fz * 2.05],
        [at.rx * 1.15, at.rz * 1.15],
        [-at.rx * 1.15, -at.rz * 1.15],
        [at.fx * 2.3 + at.rx * 1.1, at.fz * 2.3 + at.rz * 1.1],
        [at.fx * 2.3 - at.rx * 1.1, at.fz * 2.3 - at.rz * 1.1],
      ]
      for (const [dx, dz] of probes) if (segmentClear(p.x, y, p.z, p.x + dx, y, p.z + dz) < 0.999) return true
    }
    return false
  }

  function start() {
    // A new treadmill was equipped since the last run: rebuild the machine in its colours.
    if (equippedTreadmill().id !== built && phase === 'off') {
      built = equippedTreadmill().id
      m = buildModel()
    }
    const p = player.position
    const inHub = p.x > HUB.minX + 3 && p.x < HUB.maxX - 3 && p.z > HUB.minZ + 3 && p.z < HUB.maxZ - 3
    if (!inHub) {
      snd.deny()
      return toast('Treadmills only work in the Safe Zone', 'Head back to the green area to train', '#ff8a6a')
    }
    if (isFrozen() || !player.grounded || p.y > 0.6) {
      snd.deny()
      return toast('Stand on the ground to train', '', '#ff8a6a')
    }
    at.yaw = player.facing
    at.fx = Math.sin(at.yaw)
    at.fz = Math.cos(at.yaw)
    at.rx = -at.fz // side vector (forward x up)
    at.rz = at.fx
    if (blocked()) {
      snd.deny()
      return toast('Not enough room here', 'Move to an open spot and try again', '#ff8a6a')
    }
    at.x = p.x
    at.y = p.y
    at.z = p.z
    m.root.position.set(at.x, at.y, at.z)
    m.root.rotation.y = at.yaw
    m.root.scale.setScalar(0.001)
    m.ring.position.set(at.x, at.y + 0.035, at.z)
    scene.add(m.root, m.ring)
    setFrozen(true)
    phase = 'spawning'
    t = 0
    spool = 0
    tick = 0
    streak = 0
    armed = false
    setActive(true)
    hideTap(range(T.tap.first))
    snd.deploy()
    flash(at.x, at.y + 0.6, at.z, C.neon, 50, 6)
    puff(at.x, at.y + 0.2, at.z, 1.2, '#efeaff')
    m.screen.paint(state.speed, 0)
  }

  function stop() {
    if (phase !== 'spawning' && phase !== 'running') return
    phase = 'stowing'
    t = 0
    setActive(false)
    hideTap()
    motor?.stop()
    motor = null
    snd.stow()
    // Hop off the back of the belt.
    const bx = at.x - at.fx * 2.4
    const bz = at.z - at.fz * 2.4
    const jump = inputState.jump
    setFrozen(false)
    resetPlayer({ x: bx, y: at.y + 0.05, z: bz }, at.yaw)
    syncYawToPlayer()
    inputState.jump = jump // a jump that ended the run still jumps
    puff(at.x, at.y + 0.5, at.z, 1.3, '#efeaff')
  }

  const toggle = () => {
    if (phase === 'off') start()
    else if (phase !== 'stowing') stop()
  }
  hud?.onMenu?.('treadmill', toggle)
  onKey('KeyT', toggle)

  // --- Gains ---
  function popup(amount, kind, mult = 1) {
    const s = toScreen(head.x, head.y, head.z)
    if (s.behind || overlay.live() > 60) return
    const e = overlay.take('tm-pop')
    e.classList.remove('crit', 'tapped', 't3', 't4', 't5')
    if (kind) e.classList.add(kind)
    if (kind === 'tapped' && mult > 2) e.classList.add(`t${mult}`)
    e.innerHTML = `${SHOE_SVG}<span>+${short(amount)}</span>`
    const x = s.x + R(-70, 70)
    const y = s.y + R(-30, 20)
    e.style.left = `${x}px`
    e.style.top = `${y}px`
    overlay.layer.appendChild(e)
    e.getAnimations().forEach((a) => a.cancel())
    e.style.animation = 'none'
    void e.offsetWidth
    e.style.animation = ''
    setTimeout(() => e.remove(), kind === 'crit' ? 1300 : 950)
    flyShoes(x, y - 10, kind === 'crit' ? 5 : kind === 'tapped' ? Math.min(6, 1 + mult) : 1)
  }

  function flyShoes(x0, y0, n) {
    const target = hud?.speedTarget?.()
    if (!target) return void hud?.speedPop?.()
    const tx = target.x + Math.min(target.w, target.h) * 0.5
    const ty = target.y + target.h * 0.5
    for (let i = 0; i < n; i++) {
      const e = overlay.take('tm-fly')
      e.innerHTML = SHOE_SVG
      e.style.left = `${x0}px`
      e.style.top = `${y0}px`
      overlay.layer.appendChild(e)
      const dx = tx - x0
      const dy = ty - y0
      const lift = R(60, 140)
      const side = R(-50, 50)
      const frames = []
      for (let k = 0; k <= 10; k++) {
        const u = k / 10
        const ease = u * u * (3 - 2 * u)
        const arc = Math.sin(u * Math.PI)
        frames.push({
          transform: `translate(${dx * ease + side * arc}px, ${dy * ease - lift * arc}px) scale(${1.15 - 0.5 * u}) rotate(${-20 * u}deg)`,
          opacity: u > 0.92 ? 1 - (u - 0.92) / 0.08 : 1,
        })
      }
      const a = e.animate(frames, { duration: 650 + i * 70, delay: 120 + i * 55, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' })
      a.onfinish = () => {
        e.remove()
        hud?.speedPop?.()
        snd.collect()
      }
    }
  }

  function gainBurst(color, n, power) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = R(1.5, 4) * power
      glow({ x: at.x + Math.cos(a) * 0.3, y: at.y + D + R(0.1, 1.6), z: at.z + Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vy: R(1, 4) * power, vz: Math.sin(a) * sp, color: Math.random() < 0.35 ? '#ffffff' : color, size: R(0.18, 0.36), size1: 0.03, life: R(0.45, 0.85), gravity: 4, drag: 2 })
    }
  }

  function gain(kind, mult = 1) {
    const crit = kind === 'crit'
    const tap = kind === 'tapped'
    const amount = Math.round(equippedTreadmill().gain * trainMulti() * (crit ? T.critMulti : tap ? mult : 1))
    addSpeed(amount)
    beat++
    pulse = 1
    m.screen.paint(state.speed, beat)
    popup(amount, kind, mult)
    if (crit) {
      snd.crit()
      gainBurst('#ffd23a', 40, 1.4)
      flash(at.x, at.y + D + 1.2, at.z, '#ffd23a', 40, 6)
    } else if (tap) {
      snd.tap(mult)
      gainBurst(mult >= 4 ? '#ffd23a' : '#7af0ff', 10 + mult * 4, 1 + mult * 0.15)
    } else {
      snd.gain(streak++)
      gainBurst(C.neon, 8, 0.8)
    }
    streakT = T.every + 0.6 // the rising-note streak survives one cooldown
  }

  // TAP!!: the round button, or a click / tap on the game world, while running.
  function onTap(e) {
    if (phase !== 'running' || !tapOn) return
    const now = performance.now() / 1000
    if (now - lastTap < T.tapCooldown) return
    lastTap = now
    tapPulse = 1
    overlay.tapBtn.classList.remove('hit')
    void overlay.tapBtn.offsetWidth
    overlay.tapBtn.classList.add('hit')
    gain('tapped', tapMult)
    e?.preventDefault?.()
  }
  overlay.tapBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    onTap(e)
  })
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (phase !== 'running') return
      const onWorld = e.target === canvas || e.target?.classList?.contains('touch-right')
      if (onWorld && (e.button === 0 || e.pointerType !== 'mouse')) onTap()
    },
    true,
  )

  // --- Per frame ---
  function update(dt, elapsed) {
    if (phase === 'off') return
    t += dt
    pulse = Math.max(0, pulse - dt * 3)
    tapPulse = Math.max(0, tapPulse - dt * 4)

    // Spawn / stow scale.
    let sxz = 1
    let sy = 1
    if (phase === 'spawning') {
      const k = clamp01(t / T.spawnTime)
      sxz = Math.max(0.001, easeOutBack(k))
      sy = Math.max(0.001, easeOutBack(clamp01((t - 0.06) / T.spawnTime)))
      if (k >= 1 && sy >= 0.999) {
        phase = 'running'
        t = 0
        motor = snd.motor()
      }
    } else if (phase === 'stowing') {
      const k = clamp01(t / T.stowTime)
      sxz = 1 + 0.12 * Math.sin(k * Math.PI) - k
      sy = 1 - k * k
      if (k >= 1) {
        phase = 'off'
        m.root.removeFromParent()
        m.ring.removeFromParent()
        return
      }
    }
    m.root.scale.set(Math.max(0.001, sxz), Math.max(0.001, sy), Math.max(0.001, sxz))

    // Motor spools up while running, down otherwise.
    spool += ((phase === 'running' ? 1 : 0) - spool) * Math.min(1, dt * (phase === 'running' ? 2.2 : 6))
    if (motor) motor.set(spool)
    else if (phase === 'running') motor = snd.motor() // audio may start late (first gesture)

    // Belt + rollers.
    const beltRate = T.beltSpeed * spool
    m.beltTex.offset.y -= beltRate * dt
    for (const r of m.rollers) r.rotation.x -= beltRate * dt * 9
    // Neon, screen glow and the ground ring breathe, and flash on every tick.
    const glowK = 1.1 + 0.25 * Math.sin(elapsed * 5) + pulse * 2.2
    m.neonMat.color.set(C.neon).multiplyScalar(glowK)
    m.btns[0].color.set('#ff4a5a').multiplyScalar(0.8 + (beat % 3 === 0 ? 1.4 : 0.2))
    m.btns[1].color.set('#ffd23a').multiplyScalar(0.8 + (beat % 3 === 1 ? 1.4 : 0.2))
    m.btns[2].color.set('#7dff5a').multiplyScalar(0.8 + (beat % 3 === 2 ? 1.4 : 0.2))
    m.screenMat.color.setScalar(1 + pulse * 0.6)
    const ringS = (4.6 + pulse * 1.2 + tapPulse * 0.8) * Math.max(0.001, sxz)
    m.ring.scale.set(ringS, ringS, 1)
    m.ring.rotation.z = elapsed * 0.6
    m.ringMat.opacity = (0.35 + 0.15 * Math.sin(elapsed * 4) + pulse * 0.5) * clamp01(sy)

    if (phase === 'stowing') return

    // Player rides the deck (rising with it while it pops up), running along the belt.
    placePlayer(at.x, at.y + D * Math.min(1, sy), at.z)
    player.facing = at.yaw
    const run = T.runSpeed * spool
    player.velocity.x = at.fx * run
    player.velocity.z = at.fz * run
    head.set(at.x, at.y + D + 2.25, at.z)

    // TAP!! button floats beside the runner (on narrow screens on the right, clear of the
    // left-hand HUD cards).
    const sideK = innerWidth < 640 ? 1 : -1
    const s = toScreen(at.x + at.rx * 0.9 * sideK, at.y + D + 1.3, at.z + at.rz * 0.9 * sideK)
    const pad = 56
    overlay.tapBtn.style.left = `${Math.min(innerWidth - pad, Math.max(pad, s.x + 70 * sideK + tapOff.x))}px`
    overlay.tapBtn.style.top = `${Math.min(innerHeight - pad * 2.4, Math.max(pad * 1.6, s.y + tapOff.y))}px`

    if (phase !== 'running') return

    // Off the machine: move keys / stick (once released after starting) or jump.
    const mv = Math.hypot(inputState.move.x, inputState.move.z)
    if (mv < 0.1) armed = true
    if ((armed && mv > 0.35) || inputState.jump || !isFrozen()) return stop()

    // TAP!! bubble: a random moment, 5 s, gone; then a random quiet spell before the next.
    if (tapOn) {
      tapLeft -= dt
      overlay.tapBtn.style.setProperty('--p', Math.max(0, tapLeft / T.tap.life).toFixed(3))
      if (tapLeft <= 0) hideTap()
    } else if (spool > 0.6) {
      tapGap -= dt
      if (tapGap <= 0) showTap()
    }

    // Speed ticks.
    tick += dt
    streakT -= dt
    if (streakT <= 0) streak = 0
    if (tick >= T.every && spool > 0.6) {
      tick -= T.every
      gain(Math.random() < T.critChance ? 'crit' : '')
    }

    // Wind streaks past the runner and dust off the rear roller.
    if (Math.random() < dt * 26) {
      const side = R(-0.7, 0.7)
      glow({ x: at.x + at.rx * side + at.fx * 0.8, y: at.y + D + R(0.3, 1.8), z: at.z + at.rz * side + at.fz * 0.8, vx: -at.fx * R(7, 11), vy: 0, vz: -at.fz * R(7, 11), color: Math.random() < 0.5 ? '#ffffff' : '#bff6ff', size: R(0.08, 0.16), size1: 0.02, life: R(0.18, 0.3), alpha: 0.7, drag: 0.5 })
    }
    if (Math.random() < dt * 5) {
      smoke({ x: at.x - at.fx * 1.9 + at.rx * R(-0.5, 0.5), y: at.y + 0.35, z: at.z - at.fz * 1.9 + at.rz * R(-0.5, 0.5), vx: -at.fx * R(0.8, 1.8), vy: R(0.2, 0.7), vz: -at.fz * R(0.8, 1.8), color: '#efeaff', alpha: 0.35, size: R(0.3, 0.5), size1: R(0.9, 1.3), life: R(0.6, 1), drag: 2, fadeIn: 0.05, fadeOut: 0.7 })
    }
  }

  return {
    update,
    toggle,
    stop,
    get running() {
      return phase === 'running' || phase === 'spawning'
    },
  }
}
