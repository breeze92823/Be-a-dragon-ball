import { AUDIO, graphicsPreset } from '../config.js'
import { changed, state } from '../state.js'
import { A, onStart } from '../audio/core.js'
import { setParticleDensity } from '../particles.js'
import { OVERHEAD_LAYER } from '../safezone/text.js'
import { button, createWindow, el } from './shell.js'

// Settings (gear button): four On/Off toggles, saved with the progress (state.settings).
//  - Low Gfx Mode: renders with the Low graphics preset (back to the portal's choice when off)
//  - Disable All VFX: hides every GPU particle emitter (sparkles, auras, steam)
//  - Mute Music: silences the background ambience bed (the game's music bus); effects stay
//  - Overhead Name Toggle: shows/hides floating fighter + owner names (camera layer)

export const GEAR = '<svg viewBox="0 0 64 64"><path d="M28 4 h8 l2 8 a20 20 0 0 1 6 3 l7 -4 l6 6 l-4 7 a20 20 0 0 1 3 6 l8 2 v8 l-8 2 a20 20 0 0 1 -3 6 l4 7 l-6 6 l-7 -4 a20 20 0 0 1 -6 3 l-2 8 h-8 l-2 -8 a20 20 0 0 1 -6 -3 l-7 4 l-6 -6 l4 -7 a20 20 0 0 1 -3 -6 l-8 -2 v-8 l8 -2 a20 20 0 0 1 3 -6 l-4 -7 l6 -6 l7 4 a20 20 0 0 1 6 -3Z" fill="#5ab0ff" stroke="#0b2a6a" stroke-width="3" stroke-linejoin="round"/><circle cx="32" cy="32" r="10" fill="#dff0ff" stroke="#0b2a6a" stroke-width="3"/></svg>'
const ROWS = [
  { key: 'lowGfx', label: 'Low Gfx Mode', icon: '<svg viewBox="0 0 64 64"><circle cx="26" cy="26" r="17" fill="#bfe8ff" stroke="#7a4a10" stroke-width="5"/><circle cx="26" cy="26" r="11" fill="#e8f8ff"/><path d="M38 38 L56 56" stroke="#2a1a6a" stroke-width="9" stroke-linecap="round"/><path d="M38 38 L56 56" stroke="#7a5aff" stroke-width="5" stroke-linecap="round"/></svg>' },
  { key: 'noVfx', label: 'Disable All VFX', icon: '<svg viewBox="0 0 64 64"><path d="M32 4 C40 18 52 22 50 40 A18 18 0 0 1 14 40 C12 28 22 24 24 12 C28 20 30 22 32 4Z" fill="#5a8aff" stroke="#1d2a6a" stroke-width="3"/><path d="M32 30 C38 36 42 40 40 48 A8 8 0 0 1 24 48 C22 42 28 38 32 30Z" fill="#c8f0ff"/><circle cx="26" cy="44" r="3" fill="#1d2a6a"/><circle cx="38" cy="44" r="3" fill="#1d2a6a"/></svg>' },
  { key: 'muteMusic', label: 'Mute Music', icon: '<svg viewBox="0 0 64 64"><path d="M24 46 V12 L52 6 V18 L30 22 V46" fill="#ff3a8a" stroke="#6a0a2a" stroke-width="3" stroke-linejoin="round"/><circle cx="18" cy="48" r="10" fill="#ff3a8a" stroke="#6a0a2a" stroke-width="3"/></svg>' },
  { key: 'names', label: 'Overhead Name Toggle', icon: '<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="16" fill="#ffd23a" stroke="#7a5a00" stroke-width="3"/><ellipse cx="24" cy="30" rx="7" ry="9" fill="#fff" stroke="#1d2a44" stroke-width="2"/><ellipse cx="40" cy="30" rx="7" ry="9" fill="#fff" stroke="#1d2a44" stroke-width="2"/><circle cx="25" cy="32" r="4" fill="#1d2a44"/><circle cx="41" cy="32" r="4" fill="#1d2a44"/><path d="M26 46 q6 4 12 0" stroke="#7a3a1a" stroke-width="3" fill="none" stroke-linecap="round"/></svg>' },
]

export function createSettings({ camera, applySetting, portalQuality }) {
  const w = createWindow({ id: 'settings', title: 'Settings', icon: GEAR, theme: 'settings', width: 1000 })
  const buttons = ROWS.map((r) => {
    const row = el('div', 'st-row')
    const b = button('ui-btn', 'On', () => {
      state.settings = { ...state.settings, [r.key]: !state.settings[r.key] }
      changed()
      apply()
    })
    row.append(el('div', 'ic', r.icon), el('div', 'lbl ol', r.label), b)
    w.body.appendChild(row)
    return { b, key: r.key }
  })

  let applied = {}
  const quality = () => (state.settings.lowGfx ? 'Low' : portalQuality())
  function apply() {
    const s = state.settings
    for (const { b, key } of buttons) {
      b.textContent = s[key] ? 'On' : 'Off'
      b.classList.toggle('red', !s[key])
    }
    if (s.lowGfx !== applied.lowGfx) applySetting('graphics_quality', quality())
    setParticleDensity(s.noVfx ? 0 : graphicsPreset(quality()).particles)
    if (s.names) camera.layers.enable(OVERHEAD_LAYER)
    else camera.layers.disable(OVERHEAD_LAYER)
    if (A.amb) A.amb.gain.setTargetAtTime(s.muteMusic ? 0 : AUDIO.buses.amb, A.ctx.currentTime, 0.1)
    applied = { ...s }
  }
  onStart(() => apply()) // the audio context starts on the first gesture
  w.onOpen = apply
  apply()

  let tick = 0
  return {
    update(dt) {
      // Settings can arrive with the save (hydrate) or be overridden by a portal setting change.
      tick -= dt
      if (tick > 0) return
      tick = 1
      const s = state.settings
      if (ROWS.some((r) => s[r.key] !== applied[r.key]) || s.noVfx) apply()
    },
  }
}
