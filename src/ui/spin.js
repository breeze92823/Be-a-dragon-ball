import { SPIN } from '../config.js'
import { changed, state } from '../state.js'
import { toast } from '../toast.js'
import { sfx } from '../audio/index.js'
import { button, clock, createWindow, el, isOpen, money } from './shell.js'
import { buySpins, canWatchAd, onView, serverNow, spinWheel, view, watchAdForSpin } from './server.js'
import { cashNeeded } from './rebirth.js'
import { describe, grant, ICON } from './rewards.js'

// Dragon Spin (the wheel with the serpent; step on its pad): SPIN.wedges round a wheel with their
// odds. Spin (n) uses a spin: the server (backend spin.ts) picks the wedge, the wheel turns
// SPIN.turns times and settles on it, then the prize is granted. One free spin every 15 minutes
// (server clock, up to SPIN.cap); the two side buttons sell 3 / 6 spins for $ (never premium
// currency), priced from the current rebirth cash requirement.

const N = SPIN.wedges.length
const STEP = 360 / N
const WHEEL_ICON = '<svg viewBox="0 0 64 64"><circle cx="32" cy="34" r="26" fill="#2f8a3a" stroke="#0b1a14" stroke-width="4"/><path d="M32 34 L32 8 M32 34 L54 47 M32 34 L10 47" stroke="#0b1a14" stroke-width="3"/><circle cx="32" cy="34" r="6" fill="#fff" stroke="#0b1a14" stroke-width="3"/><path d="M26 2 h12 l-6 10Z" fill="#4fe05a" stroke="#0b1a14" stroke-width="2"/></svg>'

const FIGHTER = '<svg viewBox="0 0 64 64"><g stroke="#0b1a14" stroke-width="3" stroke-linejoin="round"><path d="M20 14 L26 2 L30 12 L36 0 L40 12 L46 4 L44 18Z" fill="#ffe14a"/><rect x="22" y="12" width="20" height="18" rx="4" fill="#f2c79a"/><path d="M16 32 h32 l4 18 h-40Z" fill="#ff7a1a"/><rect x="26" y="32" width="12" height="18" fill="#1f5ed8"/><path d="M18 50 h12 v12 h-12Z M34 50 h12 v12 h-12Z" fill="#1f5ed8"/></g></svg>'

function wedgeSvg() {
  const R = 100
  const parts = []
  SPIN.wedges.forEach((w, i) => {
    // Wedge i is centred at i * STEP degrees clockwise from the top.
    const a0 = ((i - 0.5) * STEP - 90) * (Math.PI / 180)
    const a1 = ((i + 0.5) * STEP - 90) * (Math.PI / 180)
    const p = (a, r) => `${(R + Math.cos(a) * r).toFixed(2)} ${(R + Math.sin(a) * r).toFixed(2)}`
    parts.push(`<path d="M${R} ${R} L${p(a0, 96)} A96 96 0 0 1 ${p(a1, 96)}Z" fill="${SPIN.colors[i % SPIN.colors.length]}" stroke="#0b1a14" stroke-width="2"/>`)
  })
  return `<svg viewBox="0 0 200 200" class="sp-svg"><circle cx="100" cy="100" r="99" fill="#0b1a14"/>${parts.join('')}<circle cx="100" cy="100" r="97" fill="none" stroke="#7a9a6a" stroke-width="2"/></svg>`
}

export function createSpin({ hud }) {
  const w = createWindow({ id: 'spin', title: 'Dragon Spin', icon: WHEEL_ICON, theme: 'spin', width: 720 })
  const stage = el('div', 'sp-stage')
  const pointer = el('div', 'sp-pointer')
  const wheel = el('div', 'sp-wheel', wedgeSvg())
  // Labels + icons over each wedge (HTML, so they use the game font).
  const pct = (wt) => `${Math.round((wt / SPIN.wedges.reduce((n, x) => n + x.weight, 0)) * 100)}%`
  SPIN.wedges.forEach((wd, i) => {
    const d = describe(wd.prize)
    const lab = el('div', 'sp-lab')
    lab.style.setProperty('--r', `${i * STEP}deg`)
    lab.innerHTML = `<b class="ol">${wd.label}</b><i>${d.entry ? FIGHTER : d.icon || ICON.cash}</i><small class="ol">(${pct(wd.weight)})</small>`
    wheel.appendChild(lab)
  })
  wheel.appendChild(el('div', 'sp-hub'))
  stage.append(wheel, pointer)
  const row = el('div', 'sp-row')
  const packBtns = SPIN.packs.map((p, k) => {
    const wrap = el('div', 'sp-pack')
    if (p.tag) wrap.appendChild(el('div', 'sp-tag ol', p.tag))
    const b = button(`ui-btn sp-buy${k ? ' mega' : ''}`, '', () => buy(k))
    wrap.append(b, el('div', 'sp-sub ol', `+${p.spins} Spins!`))
    return { wrap, b }
  })
  const spinWrap = el('div', 'sp-pack')
  const spinBtn = button('ui-btn sp-go', 'Spin (0)', go)
  const next = el('div', 'sp-sub ol', '')
  spinWrap.append(spinBtn, next)
  row.append(packBtns[0].wrap, spinWrap, packBtns[1].wrap)
  // Rewarded ad: +1 spin (only where Boxity serves ads; the server verifies the ad's token).
  const adBtn = button('ui-btn sp-ad', 'Watch an ad: +1 Spin', async () => {
    adBtn.classList.add('off')
    const r = await watchAdForSpin()
    if (r?.ok) toast('+1 Spin!', 'Thanks for watching', '#7dff5a')
    else if (r?.reason && !['skipped', 'disabled'].includes(r.reason)) toast('No ad right now', 'Try again later', '#ff8a6a')
    refresh()
  })
  w.body.append(stage, row, adBtn)

  let angle = 0
  let spinning = false
  const price = (p) => Math.max(p.min, Math.round(cashNeeded() * p.share))

  function refresh() {
    const s = view.spins
    spinBtn.textContent = `Spin (${s?.spins ?? 0})`
    spinBtn.classList.toggle('off', spinning || !s?.spins)
    const left = s ? (s.nextAt - serverNow()) / 1000 : 0
    adBtn.style.display = canWatchAd() ? '' : 'none'
    adBtn.classList.toggle('off', !canWatchAd())
    next.textContent = !s ? 'Loading...' : left > 0 ? `Free spin in ${clock(left)}` : 'Free spin ready!'
    SPIN.packs.forEach((p, k) => {
      packBtns[k].b.textContent = money(price(p))
      packBtns[k].b.classList.toggle('off', state.money < price(p))
    })
  }

  function buy(k) {
    const p = SPIN.packs[k]
    const cost = price(p)
    if (state.money < cost) return toast('Not enough cash', `${p.spins} spins cost ${money(cost)}`, '#ff8a6a')
    state.money -= cost
    changed()
    hud.moneyPop?.()
    buySpins(k)
    toast(`+${p.spins} Spins!`, 'Bought with cash', '#7dff5a')
    sfx.coins?.(5, 0)
  }

  async function go() {
    if (spinning) return
    if (!view.spins?.spins) return toast('No spins left', 'A free spin comes every 15 minutes', '#ff8a6a')
    spinning = true
    refresh()
    const r = await spinWheel()
    if (!r?.ok) {
      spinning = false
      refresh()
      return toast('Could not spin', r?.reason === 'none' ? 'No spins left' : 'Try again in a moment', '#ff8a6a')
    }
    const i = Math.max(0, SPIN.wedges.findIndex((wd) => wd.id === r.id))
    // Land wedge i under the pointer (top), a little off-centre, after SPIN.turns full turns.
    const jitter = (Math.random() - 0.5) * STEP * 0.6
    const target = 360 * SPIN.turns - i * STEP + jitter
    angle = angle - (angle % 360) + target
    wheel.style.transition = `transform ${SPIN.time}s cubic-bezier(0.12, 0.62, 0.08, 1)`
    wheel.style.transform = `rotate(${angle}deg)`
    // Ticks while it turns.
    let n = 0
    const ticker = setInterval(() => sfx.wheelTick?.(1 - n++ / 40, 0.5, 0), 90)
    setTimeout(() => clearInterval(ticker), SPIN.time * 900)
    setTimeout(() => {
      spinning = false
      grant(SPIN.wedges[i].prize, hud)
      refresh()
    }, SPIN.time * 1000 + 150)
  }

  w.onOpen = refresh
  onView((what) => (what === 'spins' || what === 'all') && isOpen('spin') && refresh())
  let tick = 0
  return {
    ready: () => (view.spins?.spins ?? 0) > 0,
    update(dt) {
      tick -= dt
      if (tick > 0 || !isOpen('spin')) return
      tick = 0.5
      refresh()
    },
  }
}
