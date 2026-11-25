import { PLAYTIME } from '../config.js'
import { toast } from '../toast.js'
import { button, clock, createWindow, el, isOpen } from './shell.js'
import { claimPlaytime, onView, playSecs, view } from './server.js'
import { describe, grant, rewardPic } from './rewards.js'

// Playtime Rewards (Rewards button): nine rewards in a 3 x 3 grid that unlock after so long
// online today (server clock: backend playtime.ts). Each card: picture, name, and a green
// button showing "Claim!" or the time left; claimed ones dim.

const ICON = '<svg viewBox="0 0 64 64"><rect x="10" y="26" width="44" height="30" rx="3" fill="#6a3af0" stroke="#2a0a6a" stroke-width="4"/><rect x="6" y="18" width="52" height="12" rx="3" fill="#8a5aff" stroke="#2a0a6a" stroke-width="4"/><rect x="28" y="18" width="8" height="38" fill="#ffd23a" stroke="#7a5a00" stroke-width="2"/><path d="M32 18 q-14 -16 -18 -4 q4 6 18 4 q14 2 18 -4 q-4 -12 -18 4Z" fill="#ffd23a" stroke="#7a5a00" stroke-width="3"/></svg>'

export function createPlaytime({ hud, portraits }) {
  const w = createWindow({ id: 'playtime', title: 'Playtime Rewards', icon: ICON, theme: 'playtime', width: 1100 })
  const grid = el('div', 'pt-grid')
  w.body.appendChild(grid)
  const cards = PLAYTIME.rewards.map((reward, i) => {
    const d = describe(reward)
    const card = el('div', 'pt-card rays')
    const pic = el('div', 'pic')
    pic.appendChild(rewardPic(reward, portraits))
    const name = el('div', `pt-name ol${d.label.length > 11 ? ' long' : ''}`)
    if (reward.op) name.appendChild(el('span', 'op-tag', 'OP!'))
    name.appendChild(document.createTextNode(reward.cash ? 'Cash' : d.label))
    const btn = button('ui-btn', 'Claim!', () => claim(i, btn))
    card.append(pic, name, btn)
    grid.appendChild(card)
    return { card, btn, reward }
  })

  let busy = false
  async function claim(i, btn) {
    if (busy || !view.playtime) return
    const left = PLAYTIME.unlocks[i] - playSecs()
    if (view.playtime.claimed.includes(i) || left > 0) return
    busy = true
    btn.textContent = '...'
    const r = await claimPlaytime(i)
    busy = false
    if (r.ok) grant(PLAYTIME.rewards[i], hud)
    else if (r.reason !== 'locked') toast('Could not claim', 'Try again in a moment', '#ff8a6a')
    refresh()
  }

  // Claimable now? (for the HUD's red "!")
  const anyReady = () => !!view.playtime && PLAYTIME.unlocks.some((u, i) => !view.playtime.claimed.includes(i) && playSecs() >= u)

  function refresh() {
    const v = view.playtime
    const secs = playSecs()
    cards.forEach(({ card, btn }, i) => {
      const claimed = !!v?.claimed.includes(i)
      const left = PLAYTIME.unlocks[i] - secs
      card.classList.toggle('claimed', claimed)
      btn.classList.toggle('wait', !v || claimed || left > 0)
      btn.classList.toggle('grey', claimed)
      const text = !v ? '...' : claimed ? 'Claimed' : left > 0 ? clock(left) : 'Claim!'
      if (btn.textContent !== text && !(busy && btn.textContent === '...')) btn.textContent = text
    })
  }
  onView((what) => (what === 'playtime' || what === 'all') && refresh())
  w.onOpen = refresh

  let tick = 0
  return {
    anyReady,
    update(dt) {
      tick -= dt
      if (tick > 0) return
      tick = 0.25
      if (isOpen('playtime')) refresh()
    },
  }
}
