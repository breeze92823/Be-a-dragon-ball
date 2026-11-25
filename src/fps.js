// The portal's `show_fps` setting: a small frame-rate readout in the bottom-right corner (the top-left
// belongs to Boxity's toolbar). Costs nothing while hidden.
let el = null
let on = false
let frames = 0
let acc = 0

export function setShowFps(value) {
  on = !!value
  if (!on) {
    el?.remove()
    el = null
    return
  }
  if (el) return
  el = document.createElement('div')
  el.style.cssText = 'position:fixed;right:max(8px,env(safe-area-inset-right));bottom:max(8px,env(safe-area-inset-bottom));z-index:50;padding:2px 8px;border-radius:6px;background:rgba(0,0,0,.55);color:#9cff8a;font:600 12px/18px Fredoka,sans-serif;pointer-events:none'
  el.textContent = '-- FPS'
  document.body.appendChild(el)
}

export function tickFps(dt) {
  if (!on || !el) return
  frames++
  acc += dt
  if (acc < 0.5) return
  el.textContent = `${Math.round(frames / acc)} FPS`
  frames = 0
  acc = 0
}
