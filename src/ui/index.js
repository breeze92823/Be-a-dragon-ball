import './ui.css'
import { BOOSTS } from '../config.js'
import { changed, luckBoosted, onGameEvent, speedBoosted, state } from '../state.js'
import { OVERHEAD_LAYER } from '../safezone/text.js'
import { toast } from '../toast.js'
import { sfx } from '../audio/index.js'
import { button, clock, el, money, openWindow, toggleWindow } from './shell.js'
import { createPortraits } from './portrait.js'
import { pollServer, questEvent, view } from './server.js'
import { discover, ICON } from './rewards.js'
import { createPlaytime } from './playtime.js'
import { createIndex } from './indexwin.js'
import { createRebirth, cashNeeded } from './rebirth.js'
import { createQuests, questsReady } from './quests.js'
import { CALENDAR, createDaily, dailyReady } from './daily.js'
import { createSettings, GEAR } from './settings.js'

// The windows (src/ui/): Playtime Rewards, Index, Rebirth, Daily Quests, Daily Rewards and
// Settings, opened from the HUD's menu grid (hud.onMenu) and two corner buttons (calendar, gear);
// the x2 Speed button on the left edge and the x2 Luck badge. Also: Index discoveries (every
// fighter you own or hatch), Daily Quests events, the red "!" alerts and total playtime.
// Rules that need a trusted clock (playtime, daily, quests) run on the server: ui/server.js.

export function initUi({ hud, renderer, camera, applySetting, portalQuality }) {
  camera.layers.enable(OVERHEAD_LAYER)
  const portraits = createPortraits(renderer)
  const ctx = { hud, portraits }
  const parts = [
    createPlaytime(ctx),
    createIndex(ctx),
    createRebirth(ctx),
    createQuests(ctx),
    createDaily(ctx),
    createSettings({ camera, applySetting, portalQuality }),
  ]
  const [playtime] = parts

  hud.onMenu('index', () => openWindow('index'))
  hud.onMenu('rebirth', () => openWindow('rebirth'))
  hud.onMenu('quests', () => openWindow('quests'))
  hud.onMenu('rewards', () => openWindow('playtime'))

  // --- Corner buttons: Daily Rewards (calendar) + Settings (gear) ---
  const corner = el('div', 'ui-corner')
  const cal = button('ui-cb', CALENDAR(1), () => toggleWindow('daily'))
  cal.setAttribute('aria-label', 'Daily Rewards')
  const gear = button('ui-cb', GEAR, () => toggleWindow('settings'))
  gear.setAttribute('aria-label', 'Settings')
  corner.append(cal, gear)
  document.body.appendChild(corner)

  // --- x2 Speed (left edge): bought with $, never gems ---
  const boostPrice = () => Math.max(BOOSTS.speed.minPrice, Math.round(cashNeeded() * BOOSTS.speed.price))
  const boost = button('ui-boost ol', '<b>x2 Speed</b><small></small>', () => {
    if (speedBoosted()) return toast('x2 Speed is active', `${clock((state.speedBoostUntil - Date.now()) / 1000)} left`, '#6ab8ff')
    const price = boostPrice()
    if (state.money < price) return toast('Not enough cash', `x2 Speed costs ${money(price)}`, '#ff8a6a')
    state.money -= price
    state.speedBoostUntil = Date.now() + BOOSTS.speed.minutes * 60_000
    changed()
    hud.moneyPop?.()
    hud.speedPop?.()
    toast('x2 Speed!', `Double Speed for ${BOOSTS.speed.minutes} minutes`, '#6ab8ff')
    sfx.sparkle?.(0)
  })
  document.body.appendChild(boost)
  const luck = el('div', 'ui-luck ol', `${ICON.clover}<span></span>`)
  document.body.appendChild(luck)

  // --- Game events: Index discoveries + Daily Quests ---
  onGameEvent((kind, data) => {
    if (kind === 'hatch' && data) {
      if (discover(data)) toast('New Index entry!', `${data.mutation ?? 'Default'} ${data.name}`, '#ffe14a')
      questEvent('hatch', 1)
      if (data.mutation) questEvent('mutated', 1)
    } else if (kind === 'sell') questEvent('sell', Math.max(1, Math.floor(data) || 1))
  })
  // Everything you own counts as discovered (fighters from before the Index, rewards, the save).
  function scanOwned() {
    let found = false
    const all = [...state.inventory, ...state.backpack, ...state.slots.map((s) => s.fighter)]
    for (const f of all) if (f && f.name && discover(f)) found = true
    return found
  }

  // On touch screens the corner buttons go under the HUD's menu grid (or left of it when the
  // screen is too short: the jump cluster is below), measured so they never cover it.
  let placed = ''
  function placeCorner() {
    const menu = document.querySelector('.hud-menu')
    const touch = document.body.classList.contains('touch-ui') || innerWidth <= 700 // narrow: the top bar fills the top row
    const r = menu?.getBoundingClientRect()
    const key = touch && r ?`${r.left}|${r.top}|${r.right}|${r.bottom}|${innerWidth}|${innerHeight}` : 'css'
    if (key === placed) return
    placed = key
    for (const e of [corner, luck]) e.style.top = e.style.right = ''
    corner.style.flexDirection = ''
    if (key === 'css' || !r.width) return
    const below = r.bottom + 120 < innerHeight * 0.62
    if (below) {
      corner.style.top = `${r.bottom + 10}px`
      corner.style.right = `${innerWidth - r.right}px`
      luck.style.top = `${r.bottom + 72}px`
      luck.style.right = `${innerWidth - r.right}px`
    } else {
      corner.style.flexDirection = 'column'
      corner.style.top = `${r.top}px`
      corner.style.right = `${innerWidth - r.left + 8}px`
      luck.style.top = `${r.bottom + 8}px`
      luck.style.right = `${innerWidth - r.right}px`
    }
  }

  let slow = 0
  let lastCal = ''
  return {
    update(dt) {
      pollServer(dt)
      portraits.pump()
      for (const p of parts) p.update(dt)
      if (!document.hidden) state.playtime += dt
      slow -= dt
      if (slow > 0) return
      slow = 0.5
      placeCorner()
      scanOwned()
      // Alerts.
      hud.setAlert?.('rewards', playtime.anyReady())
      hud.setAlert?.('quests', questsReady())
      const calKey = `${view.daily?.unlocked ?? 1}|${dailyReady()}`
      if (calKey !== lastCal) {
        lastCal = calKey
        cal.innerHTML = CALENDAR(Math.max(1, view.daily?.unlocked ?? 1)) + (dailyReady() ? '<i class="alert">!</i>' : '')
      }
      // Boost button + luck badge.
      const now = Date.now()
      const on = speedBoosted()
      boost.classList.toggle('on', on)
      boost.lastChild.textContent = on ? `ACTIVE ${clock((state.speedBoostUntil - now) / 1000)}` : `ONLY ${money(boostPrice())}`
      const lucky = luckBoosted()
      luck.classList.toggle('on', lucky)
      if (lucky) luck.lastChild.textContent = `2x Luck! ${clock((state.luckBoostUntil - now) / 1000)}`
    },
  }
}
