import { Raycaster, Vector2 } from 'three'
import { BASE_BOARD } from '../config.js'
import { DynLabel, paintLines, roundRect, short, strokeText } from '../safezone/text.js'
import { addMoney, baseMulti, changed, onState, state } from '../state.js'
import { isLocked } from '../input.js'
import { sfx } from '../audio/index.js'
import { confettiBurst, flash } from '../fx.js'

// Your base's entrance boards, live and clickable. The control board's four buttons
// (Auto Collect / Upgrade All / Place Best / Upgrade Max All) and the Base Upgrade sign
// react to the free mouse cursor (hover highlight, click) and to touch taps; while the
// cursor is captured (pointer lock) a click keeps turning the camera as before (Esc frees
// the cursor). Each button has its own states:
//   Auto Collect     LOCKED ($ price) -> ON / OFF toggle
//   Upgrade All      ready ($ cost of one pass) / can't afford / no fighters
//   Place Best       ready (n moves) / nothing better to place
//   Upgrade Max All  LOCKED ($ price) -> ready / can't afford / no fighters
//   Base Upgrade     step n/5 ($ price, Cash Multi x -> x) -> MAXED
// All prices are $ (never premium currency).

const CW = 1104 // control board canvas
const CH = 400
const UW = 960 // Base Upgrade canvas
const UH = 320
const PAD = 32
const BW = (CW - PAD * 3) / 2
const BH = (CH - PAD * 3) / 2
const BUTTONS = [
  { id: 'auto', x: PAD, y: PAD },
  { id: 'all', x: PAD * 2 + BW, y: PAD },
  { id: 'best', x: PAD, y: PAD * 2 + BH },
  { id: 'max', x: PAD * 2 + BW, y: PAD * 2 + BH },
]
const UP_BTN = { id: 'base', x: 70, y: 126, w: UW - 140, h: 140 }
const TAP_MOVE = 12 // px a touch may drift and still count as a tap
const TAP_TIME = 450 // ms

export function createBaseBoard(scene, boards, { camera, canvas, hud, myBase }) {
  if (!boards?.controls || !boards?.upgrade) return { update() {} }
  const toast = (a, b, c) => hud.toast?.(a, b, c)
  let hover = '' // button id under the cursor
  let pressed = '' // button id flashing after a click
  let pressT = 0
  let view = null // what the painters draw (rebuilt by refresh())

  // --- Faces: DynLabel planes on the baked panels ---
  const controls = new DynLabel(CW, CH, 1, (ctx, w, h) => paintControls(ctx, w, h, view))
  const upgrade = new DynLabel(UW, UH, 1, (ctx, w, h) => paintBaseUpgrade(ctx, w, h, view))
  const faces = []
  for (const [dl, b, kind] of [[controls, boards.controls, 'controls'], [upgrade, boards.upgrade, 'upgrade']]) {
    const m = dl.plane(b.w, b.h)
    m.position.set(0, 0, b.z)
    m.applyMatrix4(b.matrix)
    m.userData.kind = kind
    m.userData.w = kind === 'controls' ? CW : UW
    m.userData.h = kind === 'controls' ? CH : UH
    scene.add(m)
    faces.push(m)
  }

  // --- State -> view ---
  const upPrices = BASE_BOARD.upgrade.prices
  function refresh() {
    const st = myBase.boardStats()
    const m = state.money
    const fmt = (x) => +x.toFixed(2)
    const step = state.baseLevel
    view = {
      auto: !state.autoCollect
        ? { s: 'locked', sub: `$${short(BASE_BOARD.autoCollect.price)}`, can: m >= BASE_BOARD.autoCollect.price }
        : { s: state.autoCollectOn ? 'on' : 'off', sub: state.autoCollectOn ? 'ON' : 'OFF' },
      all: !st.filled ? { s: 'disabled', sub: 'No fighters' } : { s: m >= st.cheapest ? 'ready' : 'poor', sub: `$${short(st.upCost)}` },
      best: st.better ? { s: 'ready', sub: `${st.better} to place` } : { s: 'disabled', sub: 'All best placed' },
      max: !state.upgradeMax
        ? { s: 'locked', sub: `$${short(BASE_BOARD.upgradeMax.price)}`, can: m >= BASE_BOARD.upgradeMax.price }
        : !st.filled ? { s: 'disabled', sub: 'No fighters' } : { s: m >= st.cheapest ? 'ready' : 'poor', sub: 'Max out' },
      base: step >= upPrices.length
        ? { s: 'maxed', step, of: upPrices.length, multi: fmt(baseMulti()) }
        : { s: m >= upPrices[step] ? 'ready' : 'poor', price: upPrices[step], step, of: upPrices.length, multi: fmt(baseMulti()), next: fmt(baseMulti() + BASE_BOARD.upgrade.multiStep) },
      hover,
      pressed: pressT > 0 ? pressed : '',
    }
    const key = JSON.stringify(view)
    controls.set(key)
    upgrade.set(key)
  }
  let dirty = true
  onState(() => (dirty = true))

  // --- Actions ---
  function buy(price, what) {
    if (state.money < price) {
      sfx.denied()
      toast('Not enough cash', `${what} costs $${short(price)}`, '#ff6a5a')
      return false
    }
    addMoney(-price)
    return true
  }
  function celebrate(face) {
    const p = face.position
    flash(p.x, p.y, p.z, '#ffe14a', 50, 5)
    confettiBurst(p.x, p.y + 1, p.z, 40, 6)
  }
  function press(id) {
    const face = faces[id === 'base' ? 1 : 0]
    pressed = id
    pressT = 0.18
    dirty = true
    if (id === 'auto') {
      if (!state.autoCollect) {
        if (!buy(BASE_BOARD.autoCollect.price, 'Auto Collect')) return
        state.autoCollect = true
        state.autoCollectOn = true
        changed()
        sfx.upgrade()
        celebrate(face)
        toast('Auto Collect unlocked!', 'Your pads empty into your cash by themselves', '#7dff5a')
        return
      }
      state.autoCollectOn = !state.autoCollectOn
      changed()
      sfx.select(state.autoCollectOn)
      toast(`Auto Collect ${state.autoCollectOn ? 'ON' : 'OFF'}`, '', state.autoCollectOn ? '#7dff5a' : '#ffb03a')
      return
    }
    if (id === 'all' || id === 'max') {
      if (id === 'max' && !state.upgradeMax) {
        if (!buy(BASE_BOARD.upgradeMax.price, 'Upgrade Max All')) return
        state.upgradeMax = true
        changed()
        sfx.upgrade()
        celebrate(face)
        toast('Upgrade Max All unlocked!', 'Click it to spend your cash on slot upgrades', '#c99bff')
        return
      }
      const st = myBase.boardStats()
      if (!st.filled) return deny('No fighters placed', 'Place fighters on your slots first')
      const spent = state.money
      const n = id === 'all' ? myBase.upgradeAll() : myBase.upgradeMaxAll()
      if (!n) return deny('Not enough cash', `The cheapest upgrade costs $${short(st.cheapest)}`)
      toast(`${n} upgrade${n > 1 ? 's' : ''} bought`, `-$${short(spent - state.money)}`, '#ffe14a')
      return
    }
    if (id === 'best') {
      const n = myBase.placeBest()
      if (!n) return deny('Nothing to place', 'Your best fighters are already on your slots')
      toast(`Placed ${n} fighter${n > 1 ? 's' : ''}`, 'Your best fighters are earning now', '#7dff5a')
      return
    }
    if (id === 'base') {
      const step = state.baseLevel
      if (step >= upPrices.length) return deny('Base fully upgraded', `Cash Multi x${baseMulti()}`)
      if (!buy(upPrices[step], 'The next Base Upgrade')) return
      state.baseLevel++
      changed()
      sfx.upgrade()
      celebrate(face)
      toast(`Base Upgrade ${state.baseLevel}/${upPrices.length}`, `Cash Multi x${+baseMulti().toFixed(2)}`, '#5ff2ff')
    }
  }
  function deny(title, sub) {
    sfx.denied()
    toast(title, sub, '#ff8a6a')
  }

  // --- Hit testing ---
  const ray = new Raycaster()
  const ndc = new Vector2()
  let active = false // you are in human form and close enough to your boards
  function hit(clientX, clientY) {
    if (!active) return ''
    const r = canvas.getBoundingClientRect()
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    ray.far = 80
    const h = ray.intersectObjects(faces, false)[0]
    if (!h?.uv) return ''
    const { kind, w, h: hh } = h.object.userData
    const px = h.uv.x * w
    const py = (1 - h.uv.y) * hh
    if (kind === 'upgrade') return inside(px, py, UP_BTN.x, UP_BTN.y, UP_BTN.w, UP_BTN.h) ? 'base' : ''
    return BUTTONS.find((b) => inside(px, py, b.x, b.y, BW, BH))?.id ?? ''
  }
  const inside = (px, py, x, y, w, h) => px >= x && px <= x + w && py >= y && py <= y + h

  // Mouse with a free cursor: hover highlight + pointer cursor, click acts (and does not grab
  // the cursor, input.js's window listener never sees it).
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || isLocked()) return
    const id = hit(e.clientX, e.clientY)
    if (id !== hover) {
      hover = id
      canvas.style.cursor = id ? 'pointer' : ''
      dirty = true
    }
  })
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || isLocked()) return
    const id = hit(e.clientX, e.clientY)
    if (!id) return
    e.stopPropagation()
    press(id)
  })
  // Touch: a short tap anywhere on the world (the touch zones cover the canvas).
  const taps = new Map()
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse') return
      taps.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), world: e.target === canvas || e.target.classList?.contains('touch-zone') })
    },
    { capture: true },
  )
  window.addEventListener(
    'pointerup',
    (e) => {
      const t = taps.get(e.pointerId)
      taps.delete(e.pointerId)
      if (!t?.world || taps.size) return // a second finger = pinch, not a tap
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_MOVE || performance.now() - t.t > TAP_TIME) return
      const id = hit(e.clientX, e.clientY)
      if (id) press(id)
    },
    { capture: true },
  )
  window.addEventListener('pointercancel', (e) => taps.delete(e.pointerId), { capture: true })
  document.addEventListener('pointerlockchange', () => {
    if (isLocked() && hover) {
      hover = ''
      canvas.style.cursor = ''
      dirty = true
    }
  })

  let refreshIn = 0
  return {
    update(dt, p, form) {
      const near = faces.some((f) => Math.hypot(p.x - f.position.x, p.z - f.position.z) < BASE_BOARD.reach)
      active = form === 'human' && near
      if (!active && hover) {
        hover = ''
        canvas.style.cursor = ''
        dirty = true
      }
      if (pressT > 0) {
        pressT -= dt
        if (pressT <= 0) dirty = true
      }
      // Money changes every frame while pads fill; repaint at most 5x a second.
      refreshIn -= dt
      if (dirty || (near && refreshIn <= 0)) {
        refreshIn = 0.2
        dirty = false
        refresh()
      }
    },
  }
}

// --- Painters ---------------------------------------------------------------------------------
const STYLE = {
  auto: { top: '#3fd4ff', bot: '#1a8fd6', title: 'AUTO COLLECT' },
  all: { top: '#ffe14a', bot: '#f2a21a', title: 'UPGRADE ALL' },
  best: { top: '#5ae36a', bot: '#24a53a', title: 'PLACE BEST' },
  max: { top: '#a35bff', bot: '#6a2fd6', title: 'UPGRADE MAX ALL' },
}

function paintControls(ctx, w, h, v) {
  ctx.fillStyle = '#3c3f8f'
  roundRect(ctx, 6, 6, w - 12, h - 12, 34)
  ctx.fill()
  if (!v) return
  for (const b of BUTTONS) paintButton(ctx, b.x, b.y, BW, BH, b.id, v[b.id], v.hover === b.id, v.pressed === b.id)
}

function paintButton(ctx, x, y, bw, bh, id, st, hovered, pressed) {
  const S = STYLE[id]
  let top = S.top
  let bot = S.bot
  if (st.s === 'locked') [top, bot] = ['#4b5a78', '#2c3550']
  else if (st.s === 'off') [top, bot] = ['#8a8fa3', '#5a5f73']
  else if (st.s === 'disabled') [top, bot] = ['#6d7288', '#4a4f63']
  if (pressed) [top, bot] = ['#ffffff', top]
  ctx.save()
  if (pressed) {
    ctx.translate(x + bw / 2, y + bh / 2)
    ctx.scale(0.96, 0.96)
    ctx.translate(-(x + bw / 2), -(y + bh / 2))
  }
  // Drop shadow, then the face.
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  roundRect(ctx, x, y + 8, bw, bh, 26)
  ctx.fill()
  const gr = ctx.createLinearGradient(0, y, 0, y + bh)
  gr.addColorStop(0, top)
  gr.addColorStop(1, bot)
  ctx.fillStyle = gr
  roundRect(ctx, x, y, bw, bh, 26)
  ctx.fill()
  ctx.lineWidth = hovered ? 12 : 7
  ctx.strokeStyle = hovered ? '#ffffff' : 'rgba(0,0,0,0.35)'
  ctx.stroke()
  const dim = st.s === 'disabled' || st.s === 'poor'
  const ink = 'rgba(0,0,0,0.55)'
  const locked = st.s === 'locked'
  const tx = x + bw / 2 + (locked ? 34 : 0)
  strokeText(ctx, S.title, tx, y + bh * 0.38, 52, '#ffffff', { outline: ink, ow: 12, maxW: bw - (locked ? 120 : 50) })
  // Sub line: the price / state.
  let subCol = '#ffffff'
  if (locked) subCol = st.can ? '#7dff5a' : '#ff9a8a'
  else if (st.s === 'on') subCol = '#d8ffcf'
  else if (st.s === 'poor') subCol = '#ffd0c8'
  else if (dim) subCol = '#d8dbe6'
  if (st.s === 'on' || st.s === 'off') {
    // ON/OFF pill.
    const pw = 150
    const ph = 54
    const px = x + bw / 2 - pw / 2
    const py = y + bh * 0.72 - ph / 2
    ctx.fillStyle = st.s === 'on' ? '#1f9a2c' : '#a3342a'
    roundRect(ctx, px, py, pw, ph, ph / 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(st.s === 'on' ? px + pw - ph / 2 : px + ph / 2, py + ph / 2, ph / 2 - 7, 0, Math.PI * 2)
    ctx.fill()
    strokeText(ctx, st.sub, st.s === 'on' ? px + pw / 2 - 18 : px + pw / 2 + 18, py + ph / 2 + 2, 34, '#ffffff', { outline: ink, ow: 7 })
  } else {
    const label = locked ? `BUY ${st.sub}` : st.sub
    strokeText(ctx, label, tx, y + bh * 0.72, 40, subCol, { outline: ink, ow: 9, maxW: bw - (locked ? 120 : 50) })
  }
  if (locked) {
    // Padlock.
    const lx = x + 58
    const ly = y + bh / 2 + 10
    ctx.strokeStyle = '#ffb21f'
    ctx.lineWidth = 11
    ctx.beginPath()
    ctx.arc(lx, ly - 18, 20, Math.PI, 0)
    ctx.stroke()
    ctx.fillStyle = '#ffb21f'
    roundRect(ctx, lx - 30, ly - 18, 60, 50, 9)
    ctx.fill()
    ctx.fillStyle = '#7a4a00'
    ctx.beginPath()
    ctx.arc(lx, ly + 2, 7, 0, Math.PI * 2)
    ctx.fill()
  }
  if (dim) {
    ctx.fillStyle = 'rgba(30,32,60,0.28)'
    roundRect(ctx, x, y, bw, bh, 26)
    ctx.fill()
  }
  ctx.restore()
}

function paintBaseUpgrade(ctx, w, h, v) {
  ctx.fillStyle = '#3c3f8f'
  roundRect(ctx, 8, 8, w - 16, h - 16, 36)
  ctx.fill()
  ctx.fillStyle = '#5a5fc4'
  roundRect(ctx, 24, 24, w - 48, h - 48, 28)
  ctx.fill()
  strokeText(ctx, 'Base Upgrade', w / 2, 76, 84, '#ffffff', { outline: '#1d1f5a', ow: 18 })
  if (!v) return
  const st = v.base
  const { x, y, w: bw, h: bh } = UP_BTN
  const hovered = v.hover === 'base'
  const pressed = v.pressed === 'base'
  let [top, bot] = st.s === 'maxed' ? ['#7dff5a', '#24a53a'] : ['#5ff2ff', '#1fa8e8']
  if (pressed) [top, bot] = ['#ffffff', top]
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  roundRect(ctx, x, y + 8, bw, bh, 28)
  ctx.fill()
  const gr = ctx.createLinearGradient(0, y, 0, y + bh)
  gr.addColorStop(0, top)
  gr.addColorStop(1, bot)
  ctx.fillStyle = gr
  roundRect(ctx, x, y, bw, bh, 28)
  ctx.fill()
  ctx.lineWidth = hovered ? 12 : 7
  ctx.strokeStyle = hovered ? '#ffffff' : 'rgba(0,0,0,0.3)'
  ctx.stroke()
  // House glyph.
  const hx = x + 90
  const hy = y + bh / 2
  ctx.fillStyle = '#ff4b3a'
  ctx.beginPath()
  ctx.moveTo(hx, hy - 52)
  ctx.lineTo(hx + 52, hy - 8)
  ctx.lineTo(hx + 38, hy - 8)
  ctx.lineTo(hx + 38, hy + 46)
  ctx.lineTo(hx - 38, hy + 46)
  ctx.lineTo(hx - 38, hy - 8)
  ctx.lineTo(hx - 52, hy - 8)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, hx - 13, hy + 10, 26, 36, 6)
  ctx.fill()
  const ink = '#0b4a7a'
  const cx = x + bw / 2 + 70
  if (st.s === 'maxed') {
    strokeText(ctx, 'MAXED', cx, y + 48, 66, '#ffffff', { outline: '#0e5a17', ow: 15 })
    strokeText(ctx, `${st.of}/${st.of}  Cash Multi x${st.multi}`, cx, y + 106, 40, '#ffffff', { outline: '#0e5a17', ow: 9, maxW: bw - 220 })
  } else {
    strokeText(ctx, `$${short(st.price)}`, cx, y + 48, 66, st.s === 'poor' ? '#ffe0d8' : '#ffffff', { outline: ink, ow: 15, maxW: bw - 220 })
    strokeText(ctx, `${st.step}/${st.of}  Cash x${st.multi} > x${st.next}`, cx, y + 106, 40, '#ffffff', { outline: ink, ow: 9, maxW: bw - 220 })
  }
  // Step pips under the button.
  for (let i = 0; i < st.of; i++) {
    ctx.fillStyle = i < st.step ? '#ffe14a' : 'rgba(255,255,255,0.25)'
    roundRect(ctx, w / 2 - st.of * 22 + i * 44 + 4, h - 36, 36, 12, 6)
    ctx.fill()
  }
}
