import { setTouchMove } from '../input.js'
import { setDucked } from '../audio/core.js'
import { short } from '../safezone/text.js'

// Window shell shared by every window in src/ui/: a full-screen layer (blocks the world's mouse
// and touch input while open; a tap outside the panel closes it), the panel with its coloured
// header (icon, title, red X) and a scrolling body. One window is open at a time; Esc closes it
// before the portal menu sees the key, and while one is open the movement keys do nothing.

export function el(tag, cls, html) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}

// A button that acts on click (works for mouse, touch and pen; no hover needed).
export function button(cls, html, fn) {
  const b = el('button', cls, html)
  b.type = 'button'
  b.addEventListener('click', (e) => {
    e.stopPropagation()
    fn?.(b, e)
  })
  return b
}

export const money = (n) => `$${short(Math.floor(n))}`
export const big = (n) => short(Math.floor(n))
// 1234 s -> "20:34", 7322 s -> "02:02:02".
export function clock(s, hours = false) {
  s = Math.max(0, Math.ceil(s))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n) => String(n).padStart(2, '0')
  return hours || h ? `${p(h)}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`
}

const windows = new Map()
let current = null

export function openWindow(id) {
  const w = windows.get(id)
  if (!w) return
  if (current && current !== w) closeWindow()
  if (document.pointerLockElement) document.exitPointerLock?.()
  setTouchMove(0, 0)
  current = w
  w.layer.classList.add('open')
  setDucked(true)
  w.onOpen?.()
}

export function closeWindow() {
  if (!current) return
  const w = current
  current = null
  w.layer.classList.remove('open')
  setDucked(false)
  w.onClose?.()
}

export const isOpen = (id) => (id ? current?.id === id : !!current)
export const toggleWindow = (id) => (isOpen(id) ? closeWindow() : openWindow(id))

// Esc closes the open window; WASD etc. are swallowed while one is open (capture phase, so the
// game's own key handler never sees them).
window.addEventListener(
  'keydown',
  (e) => {
    if (!current) return
    if (e.code === 'Escape') closeWindow()
    if (e.code !== 'Tab') {
      e.stopImmediatePropagation()
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    }
  },
  true,
)

// createWindow({ id, title, icon, theme, width }) -> { layer, panel, head, body, onOpen, onClose }
export function createWindow({ id, title, icon = '', theme = '', width = 1100 }) {
  const layer = el('div', `uiw-layer uiw-${id}`)
  const panel = el('div', `uiw ${theme}`)
  panel.style.setProperty('--w', `${width}px`)
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', title)
  const head = el('div', 'uiw-head')
  const ic = el('div', 'uiw-icon', icon)
  const t = el('div', 'uiw-title', title)
  const extra = el('div', 'uiw-extra')
  const x = button('uiw-x', '<svg viewBox="0 0 24 24"><path d="M5 5 L19 19 M19 5 L5 19"/></svg>', closeWindow)
  x.setAttribute('aria-label', 'Close')
  head.append(ic, t, extra, x)
  const body = el('div', 'uiw-body')
  panel.append(head, body)
  layer.appendChild(panel)
  // A tap on the dimmed area (not the panel) closes the window.
  layer.addEventListener('pointerdown', (e) => {
    if (e.target === layer) {
      e.preventDefault()
      closeWindow()
    }
  })
  document.body.appendChild(layer)
  const w = { id, layer, panel, head, title: t, extra, body }
  windows.set(id, w)
  return w
}
