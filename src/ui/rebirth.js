import { LANE, REBIRTH } from '../config.js'
import { changed, moneyMulti, state } from '../state.js'
import { toast } from '../toast.js'
import { sfx } from '../audio/index.js'
import { big, button, createWindow, el, isOpen, money } from './shell.js'

// Rebirth: current vs next money multiplier, the cash + Speed requirements as bars, and the
// two ways through: Rebirth (needs both, resets cash and Speed) or Skip! (no Speed needed, no
// reset; costs REBIRTH.skipCost x the cash requirement in $ - the reference sold it for gems).

const ICON = '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#f4f4f8" stroke="#1d2a44" stroke-width="4"/><path d="M14 30 a18 18 0 0 1 32 -10 l4 -6 l2 18 l-17 -4 l6 -3 a12 12 0 0 0 -21 6Z" fill="#ff3a5a" stroke="#5a0a1a" stroke-width="3" stroke-linejoin="round"/><path d="M50 34 a18 18 0 0 1 -32 10 l-4 6 l-2 -18 l17 4 l-6 3 a12 12 0 0 0 21 -6Z" fill="#c8d0e8" stroke="#1d2a44" stroke-width="3" stroke-linejoin="round"/></svg>'
const CASH = '<svg viewBox="0 0 64 48"><g stroke="#0b3a14" stroke-width="3" stroke-linejoin="round"><path d="M6 20 L40 6 L60 22 L26 38Z" fill="#3fa84a"/><path d="M6 20 L6 28 L26 46 L26 38Z" fill="#2a7a34"/><path d="M26 38 L60 22 L60 30 L26 46Z" fill="#1f6a2a"/><path d="M18 15 L52 29" stroke="#ffd23a" stroke-width="7"/></g></svg>'

export const cashNeeded = (n = state.rebirths) => REBIRTH.cash * Math.pow(REBIRTH.cashGrowth, n)
export const speedNeeded = (n = state.rebirths) => REBIRTH.speed * Math.pow(REBIRTH.speedGrowth, n)
export const skipPrice = () => cashNeeded() * REBIRTH.skipCost
export const canRebirth = () => state.money >= cashNeeded() && state.speed >= speedNeeded()

export function createRebirth({ hud }) {
  const w = createWindow({ id: 'rebirth', title: 'Rebirth : 0', icon: ICON, theme: 'rebirth', width: 820 })
  const row = el('div', 'rb-row')
  const cur = el('div', 'rb-col')
  const next = el('div', 'rb-col')
  const arrow = el('div', 'rb-arrow', '<svg viewBox="0 0 24 30"><path d="M2 2 L22 15 L2 28Z"/></svg>')
  row.append(cur, arrow, next)
  const box = el('div', 'rb-box')
  const warn = el('div', 'rb-warn', 'Warning: Rebirth resets both Speed &amp; Cash')
  const cashBar = el('div', 'rb-bar', '<i></i><span class="ol"></span>')
  const speedBar = el('div', 'rb-bar', '<i></i><span class="ol"></span>')
  box.append(warn, cashBar, speedBar)
  const actions = el('div', 'rb-actions')
  const go = button('ui-btn dark-red', 'Rebirth', rebirth)
  const skip = button('ui-btn gold rb-skip', 'Skip!<small>Keep Your Stats(No Reset)</small><span class="price-tag"></span>', skipIt)
  actions.append(go, el('div', 'rb-or ol', 'OR'), skip)
  w.body.append(row, box, actions)

  const multiBox = (label, k) => `<h3 class="ol">${label}</h3><div class="rb-multi ol">${CASH}x${k.toFixed(1)} Money</div>`

  function refresh() {
    const n = state.rebirths
    w.title.textContent = `Rebirth : ${n}`
    cur.innerHTML = multiBox(`Rebirth ${n} (Current)`, moneyMulti())
    next.innerHTML = multiBox(`Rebirth ${n + 1}`, moneyMulti() + REBIRTH.multiStep)
    const c = cashNeeded()
    const s = speedNeeded()
    cashBar.firstChild.style.width = `${Math.min(1, state.money / c) * 100}%`
    cashBar.lastChild.textContent = `Cash: ${money(state.money)} / ${money(c)}`
    speedBar.firstChild.style.width = `${Math.min(1, state.speed / s) * 100}%`
    speedBar.lastChild.textContent = `Speed: ${big(state.speed)} / ${big(s)}`
    go.className = `ui-btn ${canRebirth() ? 'red' : 'dark-red'}`
    skip.querySelector('.price-tag').textContent = money(skipPrice())
    skip.classList.toggle('off', state.money < skipPrice())
  }

  function done(how) {
    state.rebirths++
    changed()
    hud.moneyPop?.()
    toast(`Rebirth ${state.rebirths}!`, `${how} Money is now x${moneyMulti().toFixed(1)}`, '#ff5a6a')
    sfx.sparkle?.(0)
    refresh()
  }
  function rebirth() {
    if (!canRebirth()) {
      const lack = state.money < cashNeeded() ? `${money(cashNeeded() - state.money)} more cash` : `${big(speedNeeded() - state.speed)} more Speed`
      return toast('Not ready to rebirth', `You need ${lack}`, '#ff8a6a')
    }
    state.money = 0
    state.speed = LANE.startSpeed
    hud.speedPop?.()
    done('Cash and Speed were reset.')
  }
  function skipIt() {
    const price = skipPrice()
    if (state.money < price) return toast('Not enough cash', `Skip costs ${money(price)}`, '#ff8a6a')
    state.money -= price
    done('Stats kept.')
  }

  w.onOpen = refresh
  let tick = 0
  return {
    update(dt) {
      tick -= dt
      if (tick > 0 || !isOpen('rebirth')) return
      tick = 0.25
      refresh()
    },
  }
}
