import { INDEX, MUTATIONS, RARITIES } from '../config.js'
import { changed, state } from '../state.js'
import { ROSTER } from '../roster.js'
import { toast } from '../toast.js'
import { sfx } from '../audio/index.js'
import { button, createWindow, el, isOpen, money } from './shell.js'

// Index: every roster fighter (162) once per mutation tab (Default + MUTATIONS). A card shows
// "???" and a black silhouette until a fighter of that name + mutation has been owned, then its
// name and portrait (gold for Golden, lit in the mutation's colour otherwise); income/s and
// rarity always show. The header counts the tab's discoveries; on a mutation tab the banner
// tracks INDEX.rewardAt discoveries, which unlock that mutation's base skin (state.indexClaimed).

const ICON = '<svg viewBox="0 0 64 64"><path d="M14 8 h34 a4 4 0 0 1 4 4 v40 a4 4 0 0 1 -4 4 h-34Z" fill="#2f8bff" stroke="#0b2a6a" stroke-width="4"/><path d="M14 8 v48 a6 6 0 0 1 -6 -6 v-36 a6 6 0 0 1 6 -6Z" fill="#1d5fd0" stroke="#0b2a6a" stroke-width="4"/><path d="M22 18 h22 M22 26 h18" stroke="#bfe6ff" stroke-width="4" stroke-linecap="round"/><path d="M40 50 v10 l4 -3 l4 3 v-10" fill="#ff4a6a" stroke="#0b2a6a" stroke-width="3"/></svg>'
const TABS = [{ id: 'default', name: 'Default', color: '#ffffff', multi: 1, tab: ['#f4f4f8', '#b8bcc8'] }, ...MUTATIONS]
const rarityOf = (name) => RARITIES.find((r) => r.name === name) ?? RARITIES[0]
export const countFor = (tabId) => ROSTER.reduce((n, e) => n + (state.discovered.has(`${tabId}.${e.key}`) ? 1 : 0), 0)

export function createIndex({ portraits }) {
  const w = createWindow({ id: 'index', title: 'Index', icon: ICON, width: 900 })
  // Tabs sit outside the panel, on its left (above it on phones).
  const wrap = el('div', 'ix-wrap')
  const tabs = el('div', 'ix-tabs')
  w.layer.insertBefore(wrap, w.panel)
  wrap.append(tabs, w.panel)
  const stats = el('div', 'ix-stats ol')
  w.extra.appendChild(stats)
  const grid = el('div', 'ix-grid')
  const goal = el('div', 'ix-goal ol')
  w.body.append(grid, goal)

  let tab = TABS[0]
  const tabButtons = TABS.map((t) => {
    const b = button(`ix-tab${t.name.length > 10 ? ' small' : ''}`, t.name, () => select(t))
    b.style.setProperty('--a', t.tab[0])
    b.style.setProperty('--b', t.tab[1])
    tabs.appendChild(b)
    return b
  })

  // Portraits load as cards scroll into view.
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        seen.unobserve(e.target)
        const { key, look, mode, mut } = e.target._portrait
        portraits.into(e.target, key, look, mode, mut)
      }
    },
    { root: w.body, rootMargin: '120px' },
  )

  const cards = ROSTER.map((entry) => {
    const card = el('div', 'ix-card rays')
    const img = el('img', 'portrait')
    img.alt = ''
    const nm = el('div', 'nm ol')
    const inc = el('div', 'inc ol')
    const mu = el('div', 'mu ol')
    const ra = el('div', 'ra ol', entry.rarity)
    const r = rarityOf(entry.rarity)
    ra.style.color = r.color
    if (r.outline) ra.style.webkitTextStrokeColor = r.outline
    card.append(img, nm, inc, mu, ra)
    grid.appendChild(card)
    return { entry, card, img, nm, inc, mu }
  })

  function fill() {
    const mut = tab.id === 'default' ? null : tab
    let found = 0
    for (const c of cards) {
      const key = `${tab.id}.${c.entry.key}`
      const has = state.discovered.has(key)
      if (has) found++
      c.card.classList.toggle('found', has)
      c.nm.textContent = has ? c.entry.name : '???'
      c.inc.textContent = `${money(c.entry.income * (mut?.multi ?? 1))}/s`
      c.mu.textContent = tab.name
      c.mu.style.color = tab.color
      const p = has ? { key, look: c.entry.look, mode: 'color', mut } : { key: `sil.${c.entry.key}`, look: c.entry.look, mode: 'silhouette', mut: null }
      if (c.img.dataset.key !== p.key) {
        c.img.removeAttribute('src')
        c.img.dataset.key = ''
        c.img._portrait = p
        seen.observe(c.img)
      }
    }
    const pct = Math.floor((found / ROSTER.length) * 100)
    stats.innerHTML = `<span class="pct">${pct}% Complete</span>${found} / ${ROSTER.length} Discovered`
    goal.style.display = mut ? '' : 'none'
    if (mut) {
      const n = Math.min(INDEX.rewardAt, found)
      const done = state.indexClaimed.includes(mut.id)
      goal.innerHTML = `${done ? `${mut.name} Base unlocked!` : `Collect <span style="color:${mut.color}">${INDEX.rewardAt} ${mut.name}</span> Characters to Unlock ${mut.name} Base`}<div class="ix-bar"><i style="width:${(n / INDEX.rewardAt) * 100}%"></i><span>${n}/${INDEX.rewardAt}</span></div>`
    }
  }

  function select(t) {
    tab = t
    tabButtons.forEach((b, i) => b.classList.toggle('on', TABS[i] === t))
    w.body.scrollTop = 0
    fill()
  }
  w.onOpen = () => select(tab)
  select(tab)

  // Base skins unlock as soon as a mutation reaches INDEX.rewardAt discoveries.
  function checkRewards() {
    for (const m of MUTATIONS) {
      if (state.indexClaimed.includes(m.id) || countFor(m.id) < INDEX.rewardAt) continue
      state.indexClaimed = [...state.indexClaimed, m.id]
      changed()
      toast(`${m.name} Base unlocked!`, `You collected ${INDEX.rewardAt} ${m.name} characters`, m.color)
      sfx.sparkle?.(0)
    }
  }

  let lastSize = -1
  return {
    update() {
      const size = state.discovered.size
      if (size === lastSize) return
      lastSize = size
      checkRewards()
      if (isOpen('index')) fill()
    },
  }
}
