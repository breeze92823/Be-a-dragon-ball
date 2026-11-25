import './hud.css'
import { Vector3 } from 'three'
import { LANE, ZONES } from '../config.js'
import { short } from '../safezone/text.js'
import { toast } from '../toast.js'
import { held, onState, select, state } from '../state.js'
import { sfx } from '../audio/index.js'
import { createIconRenderer } from './icon.js'

// The game HUD (DOM over the canvas), laid out like the reference screens:
//  - bottom-left: money ($) and Speed counters (they count up and pop)
//  - top-centre: Shop / Base / Sell teleport buttons in the safe zone; on the lane
//    the zone progress bar (one segment per zone) with your marker, head and luck
//  - right: the menu buttons (Index, Shop, Rebirth, Quests, Rewards, Treadmill)
//  - bottom-centre: the speedometer while you are the orb, the hotbar otherwise
//  - "Run !!!" banner, the hatch message, a pulsing red vignette while hunted
//  - the interaction prompt ([E] Place ...) pinned next to what it acts on, with a
//    hold ring; it is a button too (touch: press and hold it)
// Everything is in relative units and stays clear of the Bloxity toolbar (top-left).

const ICONS = {
  cash: '<svg viewBox="0 0 64 48"><g stroke="#0b3a14" stroke-width="3" stroke-linejoin="round"><path d="M6 20 L40 6 L60 22 L26 38Z" fill="#3fa84a"/><path d="M6 20 L6 28 L26 46 L26 38Z" fill="#2a7a34"/><path d="M26 38 L60 22 L60 30 L26 46Z" fill="#1f6a2a"/><path d="M18 15 L52 29" stroke="#ffd23a" stroke-width="7"/></g><ellipse cx="33" cy="22" rx="6" ry="4" fill="#bff5a8"/></svg>',
  shoe: '<svg viewBox="0 0 64 56"><path d="M4 44 L18 12 L30 18 L36 28 L58 36 Q64 44 56 52 L8 52Z" fill="url(#shoeg)" stroke="#0b2a6a" stroke-width="5" stroke-linejoin="round"/><rect x="8" y="45" width="48" height="5" rx="2" fill="#fff"/><path d="M22 22 L30 26 M18 28 L28 32" stroke="#fff" stroke-width="3" stroke-linecap="round"/><defs><linearGradient id="shoeg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fe6ff"/><stop offset="1" stop-color="#1f8bff"/></linearGradient></defs></svg>',
  index: '<svg viewBox="0 0 64 64"><path d="M14 8 h34 a4 4 0 0 1 4 4 v40 a4 4 0 0 1 -4 4 h-34Z" fill="#2f8bff" stroke="#0b2a6a" stroke-width="4"/><path d="M14 8 v48 a6 6 0 0 1 -6 -6 v-36 a6 6 0 0 1 6 -6Z" fill="#1d5fd0" stroke="#0b2a6a" stroke-width="4"/><path d="M22 18 h22 M22 26 h18" stroke="#bfe6ff" stroke-width="4" stroke-linecap="round"/><path d="M40 50 v10 l4 -3 l4 3 v-10" fill="#ff4a6a" stroke="#0b2a6a" stroke-width="3"/></svg>',
  shop: '<svg viewBox="0 0 64 64"><path d="M20 24 Q32 4 44 24" fill="none" stroke="#7a1a1a" stroke-width="5"/><path d="M8 24 h48 l-6 30 h-36Z" fill="#ff3a3a" stroke="#5a0a0a" stroke-width="4" stroke-linejoin="round"/><path d="M8 24 h48 v6 h-48Z" fill="#ff7a7a" stroke="#5a0a0a" stroke-width="3"/><path d="M22 34 v14 M32 34 v14 M42 34 v14" stroke="#b81a1a" stroke-width="4" stroke-linecap="round"/></svg>',
  rebirth: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#f4f4f8" stroke="#1d2a44" stroke-width="4"/><path d="M14 30 a18 18 0 0 1 32 -10 l4 -6 l2 18 l-17 -4 l6 -3 a12 12 0 0 0 -21 6Z" fill="#ff3a5a" stroke="#5a0a1a" stroke-width="3" stroke-linejoin="round"/><path d="M50 34 a18 18 0 0 1 -32 10 l-4 6 l-2 -18 l17 4 l-6 3 a12 12 0 0 0 21 -6Z" fill="#c8d0e8" stroke="#1d2a44" stroke-width="3" stroke-linejoin="round"/></svg>',
  quests: '<svg viewBox="0 0 64 64"><path d="M14 14 h30 q8 0 8 8 v26 q0 8 -8 8 h-30 q8 0 8 -8 v-26 q0 -8 -8 -8Z" fill="#ffe0a0" stroke="#7a4a10" stroke-width="4"/><ellipse cx="14" cy="20" rx="7" ry="6" fill="#f2c470" stroke="#7a4a10" stroke-width="4"/><path d="M30 26 h14 M30 34 h14 M30 42 h10" stroke="#c87a20" stroke-width="3" stroke-linecap="round"/><path d="M40 6 l10 10 l-24 24" stroke="#ff3a3a" stroke-width="6" stroke-linecap="round"/></svg>',
  rewards: '<svg viewBox="0 0 64 64"><rect x="10" y="26" width="44" height="30" rx="3" fill="#6a3af0" stroke="#2a0a6a" stroke-width="4"/><rect x="6" y="18" width="52" height="12" rx="3" fill="#8a5aff" stroke="#2a0a6a" stroke-width="4"/><rect x="28" y="18" width="8" height="38" fill="#ffd23a" stroke="#7a5a00" stroke-width="2"/><path d="M32 18 q-14 -16 -18 -4 q4 6 18 4 q14 2 18 -4 q-4 -12 -18 4Z" fill="#ffd23a" stroke="#7a5a00" stroke-width="3"/></svg>',
  treadmill: '<svg viewBox="0 0 64 64"><path d="M6 46 L44 34 L58 40 L20 54Z" fill="#7a8aff" stroke="#1d2a6a" stroke-width="4" stroke-linejoin="round"/><path d="M10 44 L44 34" stroke="#c8d0ff" stroke-width="3"/><path d="M40 34 L44 12 M50 37 L52 14 M44 12 L52 14" stroke="#4a5ad8" stroke-width="5" stroke-linecap="round"/><rect x="40" y="8" width="16" height="8" rx="2" fill="#a8b4ff" stroke="#1d2a6a" stroke-width="3"/></svg>',
  clover: '<svg viewBox="0 0 32 32"><g fill="#3fd13a" stroke="#0b4a14" stroke-width="2"><circle cx="11" cy="11" r="6"/><circle cx="21" cy="11" r="6"/><circle cx="11" cy="20" r="6"/><circle cx="21" cy="20" r="6"/></g><path d="M16 18 q2 8 6 12" stroke="#0b4a14" stroke-width="3" fill="none"/></svg>',
  head: '<svg viewBox="0 0 64 64"><rect x="0" y="0" width="64" height="64" rx="10" fill="#8fd0ff"/><rect x="12" y="16" width="40" height="40" rx="6" fill="#f2c79a" stroke="#4a2a14" stroke-width="3"/><path d="M8 22 q4 -18 24 -18 q22 0 24 18 l-6 -4 l-4 6 l-6 -6 l-6 6 l-6 -6 l-6 6 l-4 -6Z" fill="#6a3a1c" stroke="#2a1408" stroke-width="3" stroke-linejoin="round"/><rect x="16" y="28" width="32" height="8" rx="3" fill="#2a1a3a"/><path d="M24 46 q8 6 16 0" stroke="#7a2a1a" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
}

const MENU = [
  { id: 'index', label: 'Index' },
  { id: 'shop', label: 'Shop', badge: 'New!' },
  { id: 'rebirth', label: 'Rebirth' },
  { id: 'quests', label: 'Quests' },
  { id: 'rewards', label: 'Rewards', alert: true },
  { id: 'treadmill', label: 'Treadmill' },
]

function el(tag, cls, html) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}

function barBackground(bar) {
  if (bar === 'rainbow') return 'linear-gradient(90deg,#ff4a4a,#ff9a1f,#ffe14a,#5bff6a,#3fa2ff,#a35bff)'
  const [a, b] = bar
  return `conic-gradient(${a} 25%, ${b} 0 50%, ${a} 0 75%, ${b} 0) 0 0 / 10px 10px`
}

export function createHud({ renderer, onTeleport }) {
  const root = el('div', 'hud')
  document.body.appendChild(root)
  const icon = createIconRenderer(renderer)
  const menuHandlers = new Map()

  // --- Top: teleport buttons (safe zone) ---
  const top = el('div', 'hud-top')
  for (const [id, text] of [['shop', 'Shop'], ['base', 'Base'], ['sell', 'Sell']]) {
    const b = el('button', `hud-tp hud-tp-${id}`, `<span>${text}</span>`)
    b.addEventListener('click', () => {
      sfx.select(true)
      onTeleport?.(id)
    })
    top.appendChild(b)
  }
  root.appendChild(top)

  // --- Top: lane progress bar ---
  const laneEl = el('div', 'hud-lane')
  const bar = el('div', 'lane-bar')
  for (const z of ZONES) {
    const seg = el('div', 'lane-seg')
    seg.style.background = barBackground(z.bar)
    seg.title = `${z.name} Zone`
    bar.appendChild(seg)
  }
  const marker = el('div', 'lane-marker', `<div class="tri"></div><div class="head">${ICONS.head}</div><div class="luck">${ICONS.clover}<span>x1.0</span></div>`)
  bar.appendChild(marker)
  laneEl.appendChild(bar)
  root.appendChild(laneEl)
  const luckText = marker.querySelector('.luck span')

  // --- Banners ---
  const runEl = el('div', 'hud-run', '<span>Run !!!</span>')
  const hatchEl = el('div', 'hud-hatch')
  const vignette = el('div', 'hud-vignette')
  const flashEl = el('div', 'hud-flash')
  root.append(vignette, flashEl, runEl, hatchEl)

  // --- Stats ---
  const stats = el('div', 'hud-stats', `<div class="stat money">${ICONS.cash}<span>$0</span></div><div class="stat speed">${ICONS.shoe}<span>0</span></div>`)
  root.appendChild(stats)
  const moneyEl = stats.querySelector('.money')
  const moneyText = moneyEl.querySelector('span')
  const speedEl = stats.querySelector('.speed')
  const speedText = speedEl.querySelector('span')

  // --- Menu ---
  const menu = el('div', 'hud-menu')
  for (const m of MENU) {
    const b = el('button', `hud-mb hud-mb-${m.id}`, `${ICONS[m.id]}<span>${m.label}</span>${m.badge ? `<i class="badge">${m.badge}</i>` : ''}${m.alert ? '<i class="alert">!</i>' : ''}`)
    b.addEventListener('click', () => {
      sfx.select(true)
      const fn = menuHandlers.get(m.id)
      if (fn) fn()
      else toast(m.label, 'Coming soon!', '#ffe14a')
    })
    menu.appendChild(b)
  }
  root.appendChild(menu)

  // --- Speedometer ---
  const speedo = el(
    'div',
    'hud-speedo',
    `<svg viewBox="0 0 320 180">
      <defs>
        <linearGradient id="sg-arc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffcf3a"/><stop offset="0.5" stop-color="#ff9a1f"/><stop offset="0.62" stop-color="#3fa2ff"/><stop offset="1" stop-color="#1f4fd8"/></linearGradient>
        <pattern id="sg-stud" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#e4e4ee"/><rect x="3" y="3" width="12" height="12" rx="2" fill="none" stroke="#c8c8d8" stroke-width="2"/></pattern>
      </defs>
      <path d="M22 168 A138 138 0 0 1 298 168Z" fill="#1a1a2a"/>
      <path d="M34 168 A126 126 0 0 1 286 168" fill="none" stroke="url(#sg-arc)" stroke-width="22"/>
      <path d="M52 168 A108 108 0 0 1 268 168Z" fill="url(#sg-stud)" stroke="#1a1a2a" stroke-width="5"/>
      <g class="needle"><path d="M160 162 L160 172 L258 168Z" fill="#ff7a1a" stroke="#7a2a00" stroke-width="3" stroke-linejoin="round"/></g>
      <circle cx="160" cy="168" r="14" fill="#2a6bff" stroke="#ffffff" stroke-width="5"/>
    </svg>
    <div class="sp-val">0</div><div class="sp-min">0</div><div class="sp-max">0</div>`,
  )
  root.appendChild(speedo)
  const needle = speedo.querySelector('.needle')
  const spVal = speedo.querySelector('.sp-val')
  const spMax = speedo.querySelector('.sp-max')

  // --- Hotbar ---
  // Slots 1-9 then 0 (keys). Only filled slots show, unless the Backpack is open
  // (backpack.js), when all of them do so fighters can be dropped into empty ones.
  const hotbar = el('div', 'hud-hotbar')
  root.appendChild(hotbar)
  let backpackOpen = false
  let tapHandler = null
  const keyLabel = (i) => String((i + 1) % 10)
  function tap(i) {
    if (tapHandler?.(i)) return
    if (!state.inventory[i]) return
    select(i)
    sfx.select(state.selected === i)
  }
  function renderHotbar() {
    hotbar.innerHTML = ''
    const n = backpackOpen ? LANE.hotbarSlots : state.inventory.length
    for (let i = 0; i < n; i++) {
      const f = state.inventory[i]
      const b = el('button', `hb-slot${state.selected === i && f ? ' on' : ''}${f ? '' : ' empty'}`)
      b.dataset.slot = i
      b.innerHTML = f ? `<i class="num">${keyLabel(i)}</i><img alt="" src="${icon(f)}"><i class="nm">${f.name}</i>` : `<i class="num">${keyLabel(i)}</i>`
      if (f) b.title = `${f.name} (${f.rarity}) +$${short(f.income)}/s`
      b.addEventListener('click', () => tap(i))
      hotbar.appendChild(b)
    }
  }
  let invKey = ''
  onState(() => {
    const key = state.inventory.map((f) => f.id).join(',') + '|' + state.selected + '|' + backpackOpen
    if (key !== invKey) {
      invKey = key
      renderHotbar()
    }
  })
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.target instanceof HTMLInputElement) return
    if (!e.code.startsWith('Digit')) return
    const d = Number(e.code.slice(5))
    const i = d === 0 ? 9 : d - 1
    if (i < LANE.hotbarSlots && i < state.inventory.length) tap(i)
  })

  // --- Prompt ([E] Place) ---
  const promptEl = el('button', 'hud-prompt', `<span class="key"><svg viewBox="0 0 40 40"><circle class="ring-bg" cx="20" cy="20" r="17"/><circle class="ring" cx="20" cy="20" r="17"/></svg><b>E</b></span><span class="lbl"></span>`)
  root.appendChild(promptEl)
  const promptLbl = promptEl.querySelector('.lbl')
  const ring = promptEl.querySelector('.ring')
  const RING = 2 * Math.PI * 17
  ring.style.strokeDasharray = `${RING}`
  let prompt = null
  let progress = 0
  let keyDown = false
  let pointerDown = false
  let latched = false // after completing, wait for release
  let tickAt = 0
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && !e.repeat) keyDown = true
  })
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyE') keyDown = false
  })
  window.addEventListener('blur', () => {
    keyDown = pointerDown = false
  })
  promptEl.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    pointerDown = true
    promptEl.setPointerCapture?.(e.pointerId)
  })
  const up = () => {
    pointerDown = false
  }
  promptEl.addEventListener('pointerup', up)
  promptEl.addEventListener('pointercancel', up)

  // --- State -> counters ---
  let shownMoney = state.money
  let shownSpeed = state.speed
  const pulse = (e) => {
    e.classList.remove('pop')
    void e.offsetWidth
    e.classList.add('pop')
  }

  let laneOn = false
  let runOn = false
  let hatchTimer = 0
  let heartIn = 0
  let dangerK = 0
  const v = new Vector3()

  function rect(e) {
    const r = e.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }

  return {
    toast,
    onMenu(id, fn) {
      menuHandlers.set(id, fn)
    },
    // Red "!" on a menu button (ui/* drives 'rewards' and 'quests' from claimable state).
    setAlert(id, on) {
      const b = menu.querySelector(`.hud-mb-${id}`)
      if (!b) return
      let a = b.querySelector('.alert')
      if (on && !a) {
        a = el('i', 'alert', '!')
        b.appendChild(a)
      } else if (!on && a) a.remove()
    },
    // --- Hotbar hooks (backpack.js) ---
    setBackpackOpen(on) {
      backpackOpen = !!on
      root.classList.toggle('backpack-open', backpackOpen)
      invKey = ''
      renderHotbar()
    },
    onHotbarTap(fn) {
      tapHandler = fn
    },
    hotbarSlotAt(cx, cy) {
      for (const b of hotbar.children) {
        const r = b.getBoundingClientRect()
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return Number(b.dataset.slot)
      }
      return -1
    },
    hotbarRect: () => rect(hotbar),
    moneyPop: () => pulse(moneyEl),
    speedPop: () => pulse(speedEl),
    moneyTarget: () => rect(moneyEl.querySelector('svg')),
    speedTarget: () => rect(speedEl.querySelector('svg')),
    lane(on, progress = 0, luck = 1) {
      if (on !== laneOn) {
        laneOn = on
        root.classList.toggle('in-lane', on)
      }
      if (on) {
        marker.style.left = `${Math.min(100, Math.max(0, progress * 100))}%`
        const t = `x${luck.toFixed(1)}`
        if (luckText.textContent !== t) luckText.textContent = t
      }
    },
    speedo(on, value, max) {
      root.classList.toggle('orb', on)
      if (!on) return
      const k = max > 0 ? Math.min(1, value / max) : 0
      needle.setAttribute('transform', `rotate(${-180 + k * 180} 160 168)`)
      const t = short(Math.round(value))
      if (spVal.textContent !== t) spVal.textContent = t
      const m = short(max)
      if (spMax.textContent !== m) spMax.textContent = m
    },
    // 0..1 how close a chasing guardian is: vignette strength + heartbeat rate.
    danger(k) {
      dangerK = k
      root.style.setProperty('--danger', k.toFixed(3))
      root.classList.toggle('chased', k > 0.05)
    },
    run(on) {
      runOn = on
      root.classList.toggle('running', on)
      if (!on) {
        root.classList.remove('hatch-show')
        hatchTimer = 0
      }
    },
    hatched(what) {
      hatchEl.innerHTML = `<span>You hatched into a ${what}! RUN AWAY!</span>`
      root.classList.remove('hatch-show')
      void hatchEl.offsetWidth
      root.classList.add('hatch-show')
      hatchTimer = 3.6
    },
    flashScreen(color = '#ffffff') {
      flashEl.style.background = color
      flashEl.classList.remove('go')
      void flashEl.offsetWidth
      flashEl.classList.add('go')
    },
    prompt(p) {
      if ((p?.id ?? null) !== (prompt?.id ?? null)) {
        progress = 0
        latched = keyDown || pointerDown
      }
      prompt = p
    },
    update(dt, camera) {
      // Counters ease toward the real values.
      const mt = state.money
      shownMoney = Math.abs(mt - shownMoney) < 1 ? mt : shownMoney + (mt - shownMoney) * (1 - Math.exp(-8 * dt))
      const ms = `$${short(Math.floor(shownMoney))}`
      if (moneyText.textContent !== ms) moneyText.textContent = ms
      shownSpeed += (state.speed - shownSpeed) * (1 - Math.exp(-10 * dt))
      const ss = short(Math.round(shownSpeed))
      if (speedText.textContent !== ss) speedText.textContent = ss

      if (hatchTimer > 0) {
        hatchTimer -= dt
        if (hatchTimer <= 0) root.classList.remove('hatch-show')
      }
      if (runOn || dangerK > 0.3) {
        heartIn -= dt
        if (heartIn <= 0) {
          heartIn = 0.85 - dangerK * 0.45 // faster as it closes in
          sfx.heartbeat(0.5 + dangerK * 0.5)
        }
      }

      // Prompt placement + hold progress.
      if (!prompt) {
        promptEl.classList.remove('show')
        return
      }
      v.set(prompt.x, prompt.y, prompt.z).project(camera)
      if (v.z > 1) {
        promptEl.classList.remove('show')
        return
      }
      const x = (v.x * 0.5 + 0.5) * window.innerWidth
      const y = (-v.y * 0.5 + 0.5) * window.innerHeight
      promptEl.style.transform = `translate(${x}px, ${y}px) translate(-24px, -50%)`
      promptEl.classList.add('show')
      if (promptLbl.textContent !== prompt.label) promptLbl.textContent = prompt.label
      const down = keyDown || pointerDown
      if (!down) latched = false
      if (down && !latched) {
        if (!prompt.hold) {
          latched = true
          prompt.run()
          progress = 0
        } else {
          progress += dt / prompt.hold
          tickAt -= dt
          if (tickAt <= 0) {
            tickAt = 0.12
            sfx.promptTick(progress)
          }
          if (progress >= 1) {
            latched = true
            progress = 0
            prompt.run()
          }
        }
      } else progress = Math.max(0, progress - dt * 3)
      ring.style.strokeDashoffset = `${RING * (1 - progress)}`
      promptEl.classList.toggle('holding', progress > 0)
    },
    held,
  }
}
