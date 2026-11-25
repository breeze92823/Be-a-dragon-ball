import { DAILY } from '../config.js'
import { toast } from '../toast.js'
import { button, createWindow, el } from './shell.js'
import { claimDaily, onView, view } from './server.js'
import { describe, grant, ICON as RICON, rewardPic } from './rewards.js'

// Daily Rewards (calendar button): a 7-day calendar on the server's UTC clock (backend daily.ts):
// one more day unlocks each new day you play; unlocked days stay claimable. Six cards in two rows
// plus a big Day 7 card (OP!) on the right. States: claimed (dim + green check), ready ("Claim!",
// tap the card), locked ("Not Ready!").

export const CALENDAR = (n = 7) =>
  `<svg viewBox="0 0 64 64"><rect x="6" y="10" width="52" height="48" rx="8" fill="#fff" stroke="#1d2a5a" stroke-width="4"/><path d="M6 18 a8 8 0 0 1 8 -8 h36 a8 8 0 0 1 8 8 v8 h-52Z" fill="#3a8aff" stroke="#1d2a5a" stroke-width="4"/><rect x="16" y="4" width="6" height="12" rx="3" fill="#1d2a5a"/><rect x="42" y="4" width="6" height="12" rx="3" fill="#1d2a5a"/><text x="32" y="52" text-anchor="middle" font-family="Fredoka, Arial Black, sans-serif" font-weight="700" font-size="26" fill="#1d2a5a">${n}</text></svg>`

export const dailyReady = () => !!view.daily && Array.from({ length: view.daily.unlocked }, (_, i) => i).some((i) => !view.daily.claimed.includes(i))

export function createDaily({ hud, portraits }) {
  const w = createWindow({ id: 'daily', title: 'Daily Rewards', icon: CALENDAR(7), theme: 'daily', width: 1040 })
  const grid = el('div', 'dr-grid')
  w.body.appendChild(grid)

  const cards = DAILY.days.map((reward, i) => {
    const big = i === DAILY.days.length - 1
    const card = button(`dr-card${big ? ' big' : ''}${reward.bg === 'rainbow' ? ' rainbow' : ''}`, '', () => claim(i))
    if (reward.bg !== 'rainbow') {
      card.style.setProperty('--a', reward.bg[0])
      card.style.setProperty('--b', reward.bg[1])
    }
    const d = describe(reward)
    const pic = el('div', 'pic')
    pic.appendChild(rewardPic(reward, portraits))
    const lbl = el('div', `lbl ol${reward.boost ? ' small' : ''}`, d.label)
    const state = el('div', 'state ol')
    const check = el('div', 'check', RICON.check)
    card.append(el('div', 'day ol', `Day ${i + 1}`), pic, lbl, state, check)
    if (reward.op) card.appendChild(el('div', 'op-tag', 'OP!'))
    grid.appendChild(card)
    return { card, state, check, lbl, reward }
  })

  let busy = false
  async function claim(i) {
    const v = view.daily
    if (busy || !v || i >= v.unlocked || v.claimed.includes(i)) return
    busy = true
    const r = await claimDaily(i)
    busy = false
    if (r.ok) grant(DAILY.days[i], hud)
    else if (r.reason !== 'locked') toast('Could not claim', 'Try again in a moment', '#ff8a6a')
    refresh()
  }

  function refresh() {
    const v = view.daily
    cards.forEach(({ card, state, check, lbl, reward }, i) => {
      const claimed = !!v?.claimed.includes(i)
      const ready = !!v && i < v.unlocked && !claimed
      card.classList.toggle('claimed', claimed)
      card.classList.toggle('ready', ready)
      check.style.display = claimed ? '' : 'none'
      state.style.display = claimed ? 'none' : ''
      state.className = `state ol ${ready ? 'claim' : 'not'}`
      state.textContent = !v ? '...' : ready ? 'Claim!' : 'Not Ready!'
      if (reward.cash) lbl.textContent = describe(reward).label
    })
  }
  onView((what) => (what === 'daily' || what === 'all') && refresh())
  w.onOpen = refresh
  return { update() {} }
}
