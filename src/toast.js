import './toast.css'

// One-line game notices ("Entered the Safe Zone", shop pads...), centred near the
// top of the screen, clear of the Bloxity toolbar in the top-left corner. A new
// notice replaces the one showing; the same text again within a moment is ignored.
let el = null
let hideTimer = 0
let last = ''
let lastAt = 0

function ensure() {
  if (el) return el
  el = document.createElement('div')
  el.className = 'game-toast'
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')
  el.innerHTML = '<div class="gt-title"></div><div class="gt-sub"></div>'
  document.body.appendChild(el)
  return el
}

export function toast(title, sub = '', color = '#ffffff') {
  const key = title + '|' + sub
  const t = performance.now()
  if (key === last && t - lastAt < 2500) return
  last = key
  lastAt = t
  const e = ensure()
  e.querySelector('.gt-title').textContent = title
  e.querySelector('.gt-title').style.color = color
  const s = e.querySelector('.gt-sub')
  s.textContent = sub
  s.style.display = sub ? '' : 'none'
  e.classList.remove('show')
  void e.offsetWidth // restart the pop-in animation
  e.classList.add('show')
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => e.classList.remove('show'), 2600)
}
