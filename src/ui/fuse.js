import { FUSE, MUTATIONS, RARITIES, RARITY_ORDER } from '../config.js'
import { addFighter, allFighters, removeFighters, state } from '../state.js'
import { indexKey, makeFighter, mutationOf, rosterFor } from '../roster.js'
import { toast } from '../toast.js'
import { sfx } from '../audio/index.js'
import { button, clock, createWindow, el, isOpen, money } from './shell.js'
import { fuseClaim, fuseStart, onView, serverNow, view } from './server.js'
import { fuseInputs, fuseSeconds, baseTier, outcomes } from './fuserules.js'
import { discover } from './rewards.js'

// Fuse Machine (the purple machine at the end of the shop row; step on its pad). Pick FUSE.inputs
// fighters from your hotbar / Backpack (ADD on a slot, or ADD 4 for your weakest ones): the
// Possible Outcomes show the rarities the result can be and their odds, the bottom line the
// fusion time. FUSE! sends them to the server (backend fuse.ts), which rolls the result and starts
// the timer; the fighters leave your inventory. When the timer is done, CLAIM! gives the result
// (a roster fighter of the rolled rarity, maybe mutated) into the hotbar.

const ICON = '<svg viewBox="0 0 64 64"><rect x="6" y="20" width="52" height="34" rx="6" fill="#6a3cff" stroke="#14103a" stroke-width="4"/><rect x="14" y="8" width="12" height="16" rx="3" fill="#eef0ff" stroke="#14103a" stroke-width="3"/><rect x="38" y="4" width="12" height="20" rx="3" fill="#eef0ff" stroke="#14103a" stroke-width="3"/><circle cx="22" cy="38" r="7" fill="#ffe14a" stroke="#14103a" stroke-width="3"/><circle cx="42" cy="38" r="7" fill="#4fe05a" stroke="#14103a" stroke-width="3"/></svg>'
const PLUS = '<svg viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/></svg>'
const rarityOf = (name) => RARITIES.find((r) => r.name === name) ?? RARITIES[0]
const rarityRank = (name) => RARITY_ORDER.indexOf(name)
const pct = (c) => `${Math.round(c * 1000) / 10}%`

export function createFuse({ hud, portraits }) {
  const w = createWindow({ id: 'fuse', title: 'Fuse Machine', icon: ICON, theme: 'fuse', width: 860 })
  const lead = el('div', 'fu-lead ol', `Use ${FUSE.inputs} Fighters To Fuse`)
  const row = el('div', 'fu-slots')
  const slots = Array.from({ length: FUSE.inputs }, (_, i) => {
    const box = el('div', 'fu-slot')
    const card = el('div', 'fu-card rays')
    const img = el('img', 'portrait')
    img.alt = ''
    const nm = el('div', 'fu-nm ol')
    const ra = el('div', 'fu-ra ol')
    card.append(img, nm, ra)
    const add = button('ui-btn fu-add', 'ADD', () => (picked[i] ? unpick(i) : openPicker(i)))
    box.append(card, add)
    row.appendChild(box)
    return { box, card, img, nm, ra, add }
  })
  const outTitle = el('div', 'fu-out-title ol', 'POSSIBLE OUTCOMES:')
  const outRow = el('div', 'fu-outs')
  const outs = Array.from({ length: 3 }, () => {
    const o = el('div', 'fu-out')
    o.innerHTML = '<b class="ol">???</b><span class="ol">?%</span>'
    outRow.appendChild(o)
    return o
  })
  const foot = el('div', 'fu-foot')
  const timeEl = el('div', 'fu-time ol', 'Fusion Time (--)')
  const go = button('ui-btn fu-go', 'ADD 4', act)
  foot.append(timeEl, go)
  // The fighter picker (over the window body).
  const picker = el('div', 'fu-picker')
  const pickHead = el('div', 'fu-pick-head ol')
  const pickClose = button('ui-btn red fu-pick-x', 'Back', () => closePicker())
  const pickGrid = el('div', 'fu-pick-grid')
  picker.append(el('div', 'fu-pick-top', ''), pickGrid)
  picker.firstChild.append(pickHead, pickClose)
  w.body.append(lead, row, outTitle, outRow, foot, picker)

  const picked = Array(FUSE.inputs).fill(null) // fighter objects
  let pickFor = -1
  let busy = false

  function fusing() {
    return view.fuse?.fusing ?? null
  }

  function fill(s, f) {
    if (!f) {
      s.card.classList.add('empty')
      s.img.removeAttribute('src')
      s.img.dataset.key = ''
      s.nm.textContent = ''
      s.ra.textContent = ''
      return
    }
    s.card.classList.remove('empty')
    const mu = mutationOf(f.mutation)
    if (f.look) portraits.into(s.img, indexKey(f), f.look, 'color', mu)
    else {
      s.img.removeAttribute('src')
      s.img.dataset.key = ''
    }
    s.nm.textContent = f.name ?? (mu ? mu.name : '')
    const r = rarityOf(f.rarity)
    s.ra.textContent = f.rarity
    s.ra.style.color = r.color
  }

  function refresh() {
    const job = fusing()
    const now = serverNow()
    // Slots: the job's inputs while fusing, else your picks.
    slots.forEach((s, i) => {
      if (job) {
        const inp = job.inputs[i]
        fill(s, inp ? { rarity: inp.rarity, mutation: inp.mutation } : null) // no look: rarity + mutation only
        s.add.textContent = 'IN USE'
        s.add.classList.add('off')
      } else {
        fill(s, picked[i])
        s.add.textContent = picked[i] ? 'REMOVE' : 'ADD'
        s.add.className = `ui-btn fu-add${picked[i] ? ' red' : ''}`
      }
    })
    // Outcomes.
    const inputs = job ? job.inputs : picked.every(Boolean) ? fuseInputs(picked) : null
    const list = inputs ? job?.outcomes ?? outcomes(inputs) : []
    outs.forEach((o, i) => {
      const e = list[i]
      o.style.display = !inputs || e ? '' : 'none'
      o.firstChild.textContent = e ? e.rarity : '???'
      o.firstChild.style.color = e ? rarityOf(e.rarity).color : ''
      o.lastChild.textContent = e ? pct(e.chance) : '?%'
    })
    // Timer + main button.
    if (job) {
      const left = (job.readyAt - now) / 1000
      timeEl.textContent = left > 0 ? `Fusion Time (${clock(left)})` : 'Fusion Done!'
      go.textContent = left > 0 ? 'FUSING...' : 'CLAIM!'
      go.className = `ui-btn fu-go ${left > 0 ? 'off' : 'gold'}`
    } else {
      timeEl.textContent = inputs ? `Fusion Time (${clock(fuseSeconds(baseTier(inputs)))})` : 'Fusion Time (--)'
      const full = picked.every(Boolean)
      go.textContent = full ? 'FUSE!' : `ADD ${FUSE.inputs - picked.filter(Boolean).length}`
      go.className = `ui-btn fu-go${full ? ' gold' : ''}`
    }
  }

  // Fighters you carry that are not picked yet, weakest first.
  function available() {
    const taken = new Set(picked.filter(Boolean).map((f) => f.id))
    return allFighters()
      .filter((f) => !taken.has(f.id))
      .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) || a.income - b.income)
  }

  function openPicker(i) {
    if (fusing()) return
    const list = available()
    if (!list.length) return toast('No fighters to add', 'Catch fighters on the lane first', '#ff8a6a')
    pickFor = i
    pickHead.textContent = `Pick a fighter for slot ${i + 1}`
    pickGrid.replaceChildren()
    for (const f of list) {
      const b = button('fu-pick rays', '', () => {
        picked[pickFor] = f
        closePicker()
        sfx.padEnter?.(0)
        refresh()
      })
      const img = el('img', 'portrait')
      img.alt = ''
      if (f.look) portraits.into(img, indexKey(f), f.look, 'color', mutationOf(f.mutation))
      const r = rarityOf(f.rarity)
      const mu = mutationOf(f.mutation)
      b.append(img, el('div', 'nm ol', f.name), el('div', 'inc ol', `${money(f.income)}/s`), el('div', 'ra ol', `${mu ? `<span style="color:${mu.color}">${mu.name}</span> ` : ''}<span style="color:${r.color}">${f.rarity}</span>`))
      pickGrid.appendChild(b)
    }
    picker.classList.add('open')
  }
  function closePicker() {
    picker.classList.remove('open')
    pickFor = -1
  }
  function unpick(i) {
    if (fusing()) return
    picked[i] = null
    refresh()
  }

  async function act() {
    if (busy) return
    const job = fusing()
    if (job) {
      if (serverNow() < job.readyAt) return toast('Still fusing...', `Ready in ${clock((job.readyAt - serverNow()) / 1000)}`, '#8f6bff')
      busy = true
      const r = await fuseClaim()
      busy = false
      if (!r?.ok) return toast('Could not claim yet', r?.reason === 'wait' ? 'The fusion is not done' : 'Try again in a moment', '#ff8a6a')
      const list = rosterFor(r.result.rarity)
      const entry = list[((r.result.pick % list.length) + list.length) % list.length]
      const mu = MUTATIONS.find((m) => m.id === r.result.mutation) ?? null
      const f = makeFighter(entry, state.nextId++, mu?.name ?? null)
      addFighter(f)
      discover(f)
      toast(`Fused: ${mu ? `${mu.name} ` : ''}${f.name}!`, `${f.rarity} fighter, ${money(f.income)}/s`, rarityOf(f.rarity).color)
      sfx.sparkle?.(0)
      hud.hatchPop?.()
      refresh()
      return
    }
    // Fill the empty slots with your weakest fighters.
    if (!picked.every(Boolean)) {
      const list = available()
      for (let i = 0; i < picked.length && list.length; i++) if (!picked[i]) picked[i] = list.shift()
      if (!picked.every(Boolean)) toast('Not enough fighters', `You need ${FUSE.inputs} fighters to fuse`, '#ff8a6a')
      refresh()
      return
    }
    // Still carried? (They may have been placed or sold meanwhile.)
    const carried = new Set(allFighters().map((f) => f.id))
    if (!picked.every((f) => carried.has(f.id))) {
      for (let i = 0; i < picked.length; i++) if (!carried.has(picked[i].id)) picked[i] = null
      refresh()
      return toast('A fighter is gone', 'Pick it again', '#ff8a6a')
    }
    busy = true
    const r = await fuseStart(fuseInputs(picked))
    busy = false
    if (!r?.ok) {
      const why = { busy: 'A fusion is already running', loading: 'Still loading your save', offline: 'Not connected', timeout: 'The server did not answer' }[r?.reason] ?? 'Try again in a moment'
      return toast('Could not start the fusion', why, '#ff8a6a')
    }
    removeFighters(picked.map((f) => f.id))
    picked.fill(null)
    toast('Fusion started!', 'Come back when the timer is done', '#8f6bff')
    sfx.steam?.(0.8, 0)
    refresh()
  }

  w.onOpen = () => {
    // Drop picks you no longer carry.
    const carried = new Set(allFighters().map((f) => f.id))
    for (let i = 0; i < picked.length; i++) if (picked[i] && !carried.has(picked[i].id)) picked[i] = null
    closePicker()
    refresh()
  }
  onView((what) => (what === 'fuse' || what === 'all') && isOpen('fuse') && refresh())

  let tick = 0
  let wasReady = false
  return {
    // True when a finished fusion waits to be claimed (red "!" on nothing yet; a toast once).
    ready: () => !!fusing() && serverNow() >= fusing().readyAt,
    update(dt) {
      tick -= dt
      if (tick > 0) return
      tick = 0.25
      const ready = this.ready()
      if (ready && !wasReady) toast('Fusion done!', 'Claim it at the Fuse Machine', '#8f6bff')
      wasReady = ready
      if (isOpen('fuse')) refresh()
    },
  }
}
