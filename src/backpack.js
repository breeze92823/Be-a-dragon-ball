import './backpack.css'
import { BACKPACK, LANE, MUTATIONS, RARITIES } from './config.js'
import { onReservedAreas } from './bloxity.js'
import { onKey } from './input.js'
import { changed, onState, state } from './state.js'
import { short } from './safezone/text.js'
import { createIconRenderer } from './hud/icon.js'
import { toast } from './toast.js'
import * as snd from './audio/treadmill.js'

// The Backpack: the bag button (top-left, just outside the Bloxity toolbar the platform
// reserves) opens a panel over the hotbar listing every fighter you own beyond the 10 hotbar
// slots (keys 1-9, 0). While it is open the hotbar shows all 10 slots (empty ones too):
//  - tap a fighter in the panel: it moves to the first empty hotbar slot, or swaps with the
//    fighter you are holding (else the last slot) when the hotbar is full
//  - drag a fighter from the panel onto a hotbar slot: it goes exactly there (swapping)
//  - tap a hotbar fighter: it goes back into the Backpack
//  - Search filters by name, rarity or mutation
// B or ` toggles it. Everything lives in state.inventory / state.backpack (saved on the server).

const BAG_SVG =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M22 16v-4a10 10 0 0 1 20 0v4" fill="none" stroke="#0b1a3a" stroke-width="5" stroke-linecap="round"/><path d="M12 28a12 12 0 0 1 12-12h16a12 12 0 0 1 12 12v24a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6Z" fill="#f2f4fa" stroke="#0b1a3a" stroke-width="4"/><path d="M18 38h28v10a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4Z" fill="#c9cfe0" stroke="#0b1a3a" stroke-width="3.5"/><path d="M30 38v6h4v-6" fill="#0b1a3a"/></svg>'

const rarityColor = (name) => RARITIES.find((r) => r.name === name)?.color ?? '#ffffff'
const rarityRank = (name) => RARITIES.findIndex((r) => r.name === name)
const mutationColor = (name) => MUTATIONS.find((m) => m.name === name)?.color ?? '#ffffff'
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function createBackpack({ hud, renderer }) {
  const icon = renderer ? createIconRenderer(renderer) : null

  // --- Bag button ---
  const bag = document.createElement('button')
  bag.type = 'button'
  bag.className = 'bp-bag'
  bag.setAttribute('aria-label', 'Backpack')
  bag.title = 'Backpack (B)'
  bag.innerHTML = `${BAG_SVG}<i class="bp-count"></i>`
  document.body.appendChild(bag)
  const bagCount = bag.querySelector('.bp-count')

  // --- Panel ---
  const panel = document.createElement('div')
  panel.className = 'bp-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'Backpack')
  panel.innerHTML = `
    <div class="bp-head">
      <span class="bp-title">Backpack <b class="bp-n"></b></span>
      <input class="bp-search" type="search" placeholder="Search" aria-label="Search the Backpack" autocomplete="off" spellcheck="false">
      <button type="button" class="bp-close" aria-label="Close the Backpack">&times;</button>
    </div>
    <div class="bp-grid"></div>
    <div class="bp-empty"></div>`
  document.body.appendChild(panel)
  const grid = panel.querySelector('.bp-grid')
  const empty = panel.querySelector('.bp-empty')
  const search = panel.querySelector('.bp-search')
  const countEl = panel.querySelector('.bp-n')

  let open = false
  let query = ''

  // --- Placement: top-left, outside the Bloxity toolbar + chat ---
  let reserved = []
  function placeBag() {
    const safeL = 8
    const size = bag.offsetWidth || 56
    const toolbar = reserved.find((a) => a.id === 'toolbar')
    const top = document.querySelector('.hud-top')?.getBoundingClientRect()
    let x = safeL
    let y = 8
    if (toolbar) {
      const right = toolbar.left + toolbar.width + 8
      const roomUntil = top && top.width ? top.left - 8 : innerWidth - 8
      if (right + size <= roomUntil && toolbar.width < innerWidth * 0.6) {
        x = right
        y = toolbar.top + Math.max(0, (toolbar.height - size) / 2)
      } else {
        // No room beside it: just under the reserved column (toolbar + chat feed).
        y = Math.max(...reserved.filter((a) => a.left < safeL + size).map((a) => a.top + a.height), 0) + 8
      }
    }
    bag.style.left = `max(env(safe-area-inset-left, 0px), ${x}px)`
    bag.style.top = `max(env(safe-area-inset-top, 0px), ${y}px)`
  }
  onReservedAreas((areas) => {
    reserved = areas
    placeBag()
  })
  addEventListener('resize', () => {
    placeBag()
    placePanel()
  })
  requestAnimationFrame(placeBag) // after the HUD has laid out

  function placePanel() {
    if (!open) return
    const r = hud?.hotbarRect?.()
    const bottom = r && r.h ? innerHeight - r.y + 10 : 110
    panel.style.bottom = `${bottom}px`
    let w = Math.min(innerWidth - 16, Math.max(r?.w ?? 0, Math.min(760, innerWidth * 0.9)))
    // Stay clear of the right-hand menu grid when that still leaves a usable panel.
    const menu = document.querySelector('.hud-menu')?.getBoundingClientRect()
    if (menu && menu.width) {
      const clear = 2 * (menu.left - innerWidth / 2 - 10)
      if (clear >= 320) w = Math.min(w, clear)
    }
    panel.style.width = `${w}px`
    panel.style.maxHeight = `${Math.max(150, Math.min(innerHeight * 0.48, innerHeight - bottom - 70))}px`
  }

  // --- Moving fighters ---
  function fixSelected(removed) {
    if (state.selected === removed) state.selected = -1
    else if (state.selected > removed) state.selected--
  }
  // Backpack fighter `id` -> hotbar slot `slot` (-1 = first empty, else swap with held / last).
  function toHotbar(id, slot = -1) {
    const bi = state.backpack.findIndex((f) => f.id === id)
    if (bi < 0) return
    const f = state.backpack[bi]
    const inv = state.inventory
    if (slot < 0) slot = inv.length < LANE.hotbarSlots ? inv.length : state.selected >= 0 ? state.selected : LANE.hotbarSlots - 1
    slot = Math.min(slot, LANE.hotbarSlots - 1)
    if (slot >= inv.length) {
      state.backpack.splice(bi, 1)
      inv.push(f)
    } else {
      state.backpack[bi] = inv[slot] // swap
      inv[slot] = f
    }
    snd.collect()
    changed()
  }
  // Hotbar slot -> front of the Backpack.
  function toBackpack(i) {
    const f = state.inventory[i]
    if (!f) return false
    if (state.backpack.length >= BACKPACK.max) {
      toast('Backpack full', `It holds ${BACKPACK.max} fighters`, '#ff8a6a')
      snd.deny()
      return true
    }
    state.inventory.splice(i, 1)
    fixSelected(i)
    state.backpack.unshift(f)
    snd.collect()
    changed()
    return true
  }
  // Only a click / tap on a hotbar slot sends it back (number keys still select as usual).
  let slotPressAt = -1e9
  addEventListener('pointerdown', (e) => e.target?.closest?.('.hb-slot') && (slotPressAt = performance.now()), true)
  hud?.onHotbarTap?.((i) => (open && performance.now() - slotPressAt < 800 ? toBackpack(i) : false))

  // --- Render ---
  let shownKey = ''
  function render() {
    const n = state.backpack.length
    bagCount.textContent = n ? (n > 99 ? '99+' : String(n)) : ''
    bagCount.style.display = n ? '' : 'none'
    if (!open) return
    const key = state.backpack.map((f) => f.id).join(',') + '|' + query
    if (key === shownKey) return
    shownKey = key
    countEl.textContent = `${n}/${BACKPACK.max}`
    const q = query.trim().toLowerCase()
    const list = state.backpack
      .filter((f) => !q || f.name.toLowerCase().includes(q) || f.rarity.toLowerCase().includes(q) || (f.mutation ?? '').toLowerCase().includes(q))
      .slice()
      .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || b.income - a.income)
    grid.innerHTML = ''
    for (const f of list) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'bp-item'
      b.dataset.id = f.id
      b.style.setProperty('--rar', rarityColor(f.rarity))
      b.title = `${f.name} (${f.mutation ? f.mutation + ' ' : ''}${f.rarity}) +$${short(f.income)}/s`
      b.innerHTML =
        (icon ? `<img alt="" src="${icon(f)}" draggable="false">` : '') +
        (f.mutation ? `<i class="bp-mut" style="color:${mutationColor(f.mutation)}">${esc(f.mutation)}</i>` : '') +
        `<i class="bp-name">${esc(f.name)}</i><i class="bp-inc">+$${short(f.income)}/s</i>`
      wireDrag(b, f)
      grid.appendChild(b)
    }
    empty.textContent = !n ? 'Your Backpack is empty. Fighters beyond your 10 hotbar slots wait here.' : list.length ? '' : `Nothing matches "${query.trim()}"`
    empty.style.display = empty.textContent ? '' : 'none'
  }
  onState(() => {
    render()
    if (open) requestAnimationFrame(placePanel)
  })

  // Tap = to the hotbar; drag onto a hotbar slot = exactly there.
  function wireDrag(b, f) {
    let id = null
    let sx = 0
    let sy = 0
    let ghost = null
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      id = e.pointerId
      sx = e.clientX
      sy = e.clientY
      try {
        b.setPointerCapture(id)
      } catch {
        // The drag still works without capture.
      }
    })
    b.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return
      if (!ghost && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) {
        ghost = b.cloneNode(true)
        ghost.classList.add('bp-ghost')
        document.body.appendChild(ghost)
        b.classList.add('dragging')
      }
      if (ghost) {
        ghost.style.left = `${e.clientX}px`
        ghost.style.top = `${e.clientY}px`
        const over = hud?.hotbarSlotAt?.(e.clientX, e.clientY) ?? -1
        document.querySelectorAll('.hb-slot.bp-over').forEach((s) => s.classList.remove('bp-over'))
        if (over >= 0) document.querySelector(`.hb-slot[data-slot="${over}"]`)?.classList.add('bp-over')
      }
    })
    const end = (e, cancel) => {
      if (e.pointerId !== id) return
      id = null
      b.classList.remove('dragging')
      document.querySelectorAll('.hb-slot.bp-over').forEach((s) => s.classList.remove('bp-over'))
      if (ghost) {
        ghost.remove()
        ghost = null
        const slot = cancel ? -1 : hud?.hotbarSlotAt?.(e.clientX, e.clientY) ?? -1
        if (slot >= 0) toHotbar(f.id, slot)
      } else if (!cancel) toHotbar(f.id)
    }
    b.addEventListener('pointerup', (e) => end(e, false))
    b.addEventListener('pointercancel', (e) => end(e, true))
  }

  // --- Open / close ---
  function setOpen(on) {
    if (on === open) return
    open = on
    hud?.setBackpackOpen?.(on)
    bag.classList.toggle('on', on)
    panel.classList.toggle('show', on)
    document.body.classList.toggle('backpack-open', on)
    if (on) {
      shownKey = ''
      render()
      requestAnimationFrame(placePanel)
      snd.bagOpen()
    } else {
      search.blur()
      snd.bagClose()
    }
  }
  const toggle = () => setOpen(!open)
  bag.addEventListener('click', toggle)
  panel.querySelector('.bp-close').addEventListener('click', () => setOpen(false))
  search.addEventListener('input', () => {
    query = search.value.slice(0, 32)
    render()
  })
  // Typing in the search box must not move the player or fire hotkeys.
  for (const type of ['keydown', 'keyup']) search.addEventListener(type, (e) => e.stopPropagation())
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false)
  })
  onKey('KeyB', toggle)
  onKey('Backquote', toggle)

  render()
  return { toggle, setOpen, get open() {
    return open
  } }
}
