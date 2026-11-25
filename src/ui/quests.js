import { QUESTS, RARITIES } from '../config.js'
import { state } from '../state.js'
import { rosterPick } from '../roster.js'
import { toast } from '../toast.js'
import { button, clock, createWindow, el, isOpen, money } from './shell.js'
import { claimQuests, onView, rerollQuest, serverNow, view } from './server.js'
import { grant } from './rewards.js'
import { cashNeeded } from './rebirth.js'

// Daily Quests: three quests a UTC day (backend quests.ts), each with a progress bar and one
// free Reroll while unfinished, and a side card with today's reward fighter: Claim once all three
// are done, OR "Skip For $" (QUESTS.skipCost x the rebirth cash requirement; the reference sold
// the skip for gems).

const ICON = '<svg viewBox="0 0 64 64"><path d="M14 14 h30 q8 0 8 8 v26 q0 8 -8 8 h-30 q8 0 8 -8 v-26 q0 -8 -8 -8Z" fill="#ffe0a0" stroke="#7a4a10" stroke-width="4"/><ellipse cx="14" cy="20" rx="7" ry="6" fill="#f2c470" stroke="#7a4a10" stroke-width="4"/><path d="M30 26 h14 M30 34 h14 M30 42 h10" stroke="#c87a20" stroke-width="3" stroke-linecap="round"/><path d="M40 6 l10 10 l-24 24" stroke="#ff3a3a" stroke-width="6" stroke-linecap="round"/></svg>'
const SCROLL = '<svg viewBox="0 0 64 64"><path d="M18 12 h28 q8 0 8 8 v26 q0 8 -8 8 h-28 q8 0 8 -8 v-26 q0 -8 -8 -8Z" fill="#ffd8a0" stroke="#7a4a10" stroke-width="5"/><path d="M40 4 l10 10 l-24 24" stroke="#ff3a3a" stroke-width="6" stroke-linecap="round"/></svg>'

const rarityOf = (name) => RARITIES.find((r) => r.name === name) ?? RARITIES[0]
export const rewardFor = (day) => QUESTS.rewards[((day % QUESTS.rewards.length) + QUESTS.rewards.length) % QUESTS.rewards.length]
export const questSkipPrice = () => Math.round(cashNeeded() * QUESTS.skipCost)
export const questsReady = () => !!view.quests && !view.quests.claimed && view.quests.list.every((q) => q.n >= q.goal)

export function createQuests({ hud, portraits }) {
  const w = createWindow({ id: 'quests', title: 'Daily Quests', icon: ICON, width: 680 })
  const wrap = el('div', 'qs-wrap')
  w.layer.insertBefore(wrap, w.panel)
  const side = el('div', 'qs-side ol')
  wrap.append(w.panel, side)
  const reset = el('div', 'qs-reset ol', `<span style="width:1.6em;height:1.6em;display:inline-block">${SCROLL}</span>Quests reset in: <b>--:--:--</b>`)
  const list = el('div', 'qs-list')
  w.body.append(reset, list)

  const rows = [0, 1, 2].map((i) => {
    const row = el('div', 'qs-item')
    const top = el('div', 'qs-top')
    const t = el('div', 't ol')
    const rr = button('ui-btn', 'Reroll', () => reroll(i))
    top.append(t, rr)
    const bar = el('div', 'qs-bar', '<i></i><span class="ol"></span>')
    row.append(top, bar)
    list.appendChild(row)
    return { row, t, rr, bar }
  })

  const card = el('div', 'qs-card')
  const cmu = el('div', 'mu ol', 'Default')
  const cimg = el('img', 'portrait')
  cimg.alt = ''
  const cra = el('div', 'ra ol')
  const cnm = el('div', 'nm ol')
  card.append(cmu, cimg, cra, cnm)
  const blurb = el('p', '', 'Complete all 3 quests to receive this OP character!')
  const claimBtn = button('ui-btn', 'Claim', () => claim(false))
  const or = el('div', 'or', 'OR')
  const skipBtn = button('ui-btn cream', 'Skip For $0', () => claim(true))
  side.append(card, blurb, claimBtn, or, skipBtn)

  let busy = false
  async function reroll(i) {
    if (busy) return
    busy = true
    const r = await rerollQuest(i)
    busy = false
    if (!r.ok && r.reason !== 'locked') toast('Could not reroll', 'Try again in a moment', '#ff8a6a')
    refresh()
  }
  async function claim(skip) {
    const v = view.quests
    if (busy || !v || v.claimed) return
    if (!skip && !questsReady()) return toast('Not done yet', 'Complete all 3 quests first', '#ffb08a')
    const price = questSkipPrice()
    if (skip && state.money < price) return toast('Not enough cash', `Skipping costs ${money(price)}`, '#ff8a6a')
    busy = true
    const r = await claimQuests(skip)
    busy = false
    if (r.ok) {
      if (skip) {
        state.money -= price
        hud.moneyPop?.()
      }
      grant(rewardFor(v.day), hud)
    } else if (r.reason !== 'locked') toast('Could not claim', 'Try again in a moment', '#ff8a6a')
    refresh()
  }

  function refresh() {
    const v = view.quests
    rows.forEach((r, i) => {
      const q = v?.list[i]
      r.row.style.display = q ? '' : 'none'
      if (!q) return
      const done = q.n >= q.goal
      r.t.textContent = QUESTS.text[q.kind]?.replace('{n}', q.goal) ?? q.kind
      r.rr.style.display = done || q.rerolled || v.claimed ? 'none' : ''
      r.bar.firstChild.style.width = `${Math.min(1, q.n / q.goal) * 100}%`
      r.bar.lastChild.textContent = done ? 'Completed!' : `${q.n}/${q.goal}`
    })
    if (!v) {
      list.dataset.loading = '1'
      return
    }
    const reward = rewardFor(v.day)
    const entry = rosterPick(reward.fighter, reward.pick ?? 0)
    const r = rarityOf(entry.rarity)
    cra.textContent = entry.rarity
    cra.style.color = r.color
    cnm.textContent = entry.name
    portraits.into(cimg, `default.${entry.key}`, entry.look, 'color', null)
    claimBtn.textContent = v.claimed ? 'Claimed!' : 'Claim'
    claimBtn.classList.toggle('off', !questsReady())
    skipBtn.textContent = `Skip For ${money(questSkipPrice())}`
    skipBtn.style.display = v.claimed ? 'none' : ''
    or.style.display = v.claimed ? 'none' : ''
  }
  onView((what) => (what === 'quests' || what === 'all') && refresh())
  w.onOpen = () => {
    side.style.display = ''
    refresh()
  }
  w.onClose = () => {}

  let tick = 0
  return {
    update(dt) {
      tick -= dt
      if (tick > 0 || !isOpen('quests')) return
      tick = 0.5
      const left = view.quests ? (view.quests.nextAt - serverNow()) / 1000 : 0
      reset.querySelector('b').textContent = view.quests ? clock(left, true) : '--:--:--'
      refresh()
    },
  }
}
