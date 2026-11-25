import { BASE_SKINS, INDEX, MUTATIONS } from '../config.js'
import { changed, state } from '../state.js'
import { toast } from '../toast.js'
import { sfx } from '../audio/index.js'
import { button, createWindow, el, isOpen } from './shell.js'

// Base Skins (the tower by the Fuse Machine; step on its pad): Default + one skin per mutation.
// A skin unlocks when the Index collects INDEX.rewardAt fighters of that mutation
// (state.indexClaimed); locked cards say what to collect. Equip repaints your base
// (safeZone.setBaseSkin -> bases.js) and is saved (state.baseSkin).

const HOUSE = '<svg viewBox="0 0 64 64"><path d="M6 30 L32 8 L58 30 L52 30 L52 56 L12 56 L12 30Z" fill="#ff5a8a" stroke="#5a0a2a" stroke-width="4" stroke-linejoin="round"/><path d="M26 56 V40 h12 V56" fill="#c42a5a" stroke="#5a0a2a" stroke-width="3"/></svg>'
const LOCK = '<svg viewBox="0 0 64 64"><path d="M18 30 V20 a14 14 0 0 1 28 0 V30" fill="none" stroke="#8a96b0" stroke-width="7" stroke-linecap="round"/><rect x="10" y="28" width="44" height="32" rx="8" fill="#ffc21f" stroke="#7a4a00" stroke-width="4"/><circle cx="32" cy="42" r="5" fill="#7a4a00"/><path d="M32 44 v8" stroke="#7a4a00" stroke-width="5" stroke-linecap="round"/></svg>'

// A little base in the skin's colours (the card picture).
function skinPic(s) {
  return `<svg viewBox="0 0 100 84"><rect x="6" y="56" width="88" height="14" rx="3" fill="${s.floor}" stroke="#14103a" stroke-width="3"/><rect x="4" y="66" width="92" height="6" rx="2" fill="${s.trim}"/><rect x="40" y="56" width="20" height="10" fill="${s.carpet}"/>${[10, 84].map((x) => `<rect x="${x - 5}" y="14" width="10" height="44" fill="${s.pillar}" stroke="#14103a" stroke-width="3"/><rect x="${x - 7}" y="8" width="14" height="9" fill="${s.cap}" stroke="#14103a" stroke-width="3"/>`).join('')}<rect x="14" y="30" width="72" height="8" fill="${s.pillar}" stroke="#14103a" stroke-width="2.5"/><rect x="20" y="40" width="60" height="14" rx="3" fill="${s.inset}" stroke="#14103a" stroke-width="2"/><circle cx="50" cy="22" r="9" fill="${s.trim}" stroke="#14103a" stroke-width="3"/></svg>`
}

export const skinUnlocked = (s) => !s.id || state.indexClaimed.includes(s.id)

export function createSkins({ safeZone }) {
  const w = createWindow({ id: 'skins', title: 'Base Skins!', icon: HOUSE, theme: 'skins', width: 960 })
  const grid = el('div', 'sk-grid')
  w.body.appendChild(grid)
  const cards = BASE_SKINS.map((s) => {
    const mu = MUTATIONS.find((m) => m.id === s.id)
    const card = el('div', 'sk-card')
    card.style.setProperty('--a', mu ? mu.tab[0] : '#ffc4ec')
    card.style.setProperty('--b', mu ? mu.tab[1] : '#e88ad0')
    const name = el('div', 'sk-name ol', s.name)
    const pic = el('div', 'sk-pic', skinPic(s))
    const lock = el('div', 'sk-lock', LOCK)
    const note = el('div', 'sk-note ol', mu ? `Unlock by collecting <span style="color:${mu.color}">${INDEX.rewardAt} ${mu.name}</span> Mutated Characters` : '')
    const btn = button('ui-btn sk-btn', 'Equip', () => equip(s))
    card.append(name, pic, lock, note, btn)
    grid.appendChild(card)
    return { s, card, btn }
  })

  function equip(s) {
    if (!skinUnlocked(s)) return toast(`${s.name} Base is locked`, `Collect ${INDEX.rewardAt} ${s.name} characters in the Index`, '#ff8a6a')
    if (state.baseSkin === s.id) return
    state.baseSkin = s.id
    changed()
    apply()
    toast(`${s.name} Base equipped!`, 'Your base got a new look', '#ff8ad8')
    sfx.sparkle?.(0)
    refresh()
  }

  function refresh() {
    for (const c of cards) {
      const open = skinUnlocked(c.s)
      const on = state.baseSkin === c.s.id
      c.card.classList.toggle('locked', !open)
      c.card.classList.toggle('on', on)
      c.btn.textContent = on ? 'Equipped' : 'Equip'
      c.btn.className = `ui-btn sk-btn${on ? ' on' : ''}`
    }
  }

  // Your base wears the saved skin (after the save loads, or a change).
  let applied = ''
  function apply() {
    const s = BASE_SKINS.find((x) => x.id === state.baseSkin && skinUnlocked(x)) ?? BASE_SKINS[0]
    applied = state.baseSkin
    safeZone?.setBaseSkin?.(s)
  }

  w.onOpen = refresh
  let lastClaimed = -1
  return {
    update() {
      if (state.baseSkin !== applied) apply()
      if (state.indexClaimed.length !== lastClaimed) {
        lastClaimed = state.indexClaimed.length
        if (isOpen('skins')) refresh()
      }
    },
  }
}
