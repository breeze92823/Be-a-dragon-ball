import { DynLabel } from './text.js'

// The card floating at every base's entrance: the owner's profile picture (Boxity DP), "@name" and
// the base's Cash Multi; an unclaimed plot reads "Free Base". It is a camera-facing sprite on the
// overhead layer (Settings -> Overhead Name Toggle hides it with the other names). set() repaints
// only when something changed; the picture loads once per URL and the card repaints when it lands.
//
// The DP comes from the Boxity CDN, which must allow cross-origin canvas use; when it does not (or the
// player has no picture) the card draws a coloured disc with the player's initial instead.

const W = 360
const H = 420
const pictures = new Map() // url -> { img, state: 'loading' | 'ok' | 'failed' }
const waiting = new Set() // cards to repaint when a picture lands

function picture(url) {
  if (!url) return null
  let p = pictures.get(url)
  if (!p) {
    p = { img: new Image(), state: 'loading' }
    p.img.crossOrigin = 'anonymous'
    p.img.onload = () => {
      p.state = 'ok'
      for (const c of waiting) c.repaint()
    }
    p.img.onerror = () => {
      p.state = 'failed'
      for (const c of waiting) c.repaint()
    }
    p.img.src = url
    pictures.set(url, p)
  }
  return p
}

function outlined(ctx, text, x, y, px, fill, maxW) {
  ctx.font = `700 ${px}px Fredoka, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = px * 0.3
  ctx.strokeStyle = '#0b1a3a'
  ctx.strokeText(text, x, y, maxW)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y, maxW)
}

// A stable colour from a name, for the initial disc.
function hue(name) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 65% 55%)`
}

export class OwnerCard {
  constructor() {
    this.data = { name: '', pfp: '', multi: 1 } // name '' = a free base
    this.label = new DynLabel(W, H, 4.4, (ctx, w, h) => this.paint(ctx, w, h))
    this.sprite = this.label.sprite
    this.sprite.center.set(0.5, 0)
    this.repaint()
  }

  // { name, pfp, multi } of the owner, or null for a free base.
  set(owner) {
    const next = owner ? { name: owner.name || 'Player', pfp: owner.pfp || '', multi: owner.multi || 1 } : { name: '', pfp: '', multi: 1 }
    if (next.name === this.data.name && next.pfp === this.data.pfp && next.multi === this.data.multi) return
    this.data = next
    this.repaint()
  }

  repaint() {
    this.label.value = null // force DynLabel to repaint
    this.label.set(JSON.stringify(this.data))
  }

  paint(ctx, w, h) {
    const d = this.data
    const cx = w / 2
    const cy = 130
    const r = 100
    ctx.clearRect(0, 0, w, h)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.clip()
    const pic = d.name ? picture(d.pfp) : null
    if (pic) waiting.add(this)
    if (pic?.state === 'ok') ctx.drawImage(pic.img, cx - r, cy - r, r * 2, r * 2)
    else {
      ctx.fillStyle = d.name ? hue(d.name) : '#8a96ad'
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
      outlined(ctx, d.name ? d.name[0].toUpperCase() : '?', cx, cy + 4, 120, '#ffffff')
    }
    ctx.restore()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.lineWidth = 12
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    ctx.lineWidth = 5
    ctx.strokeStyle = '#0b1a3a'
    ctx.stroke()
    if (d.name) {
      outlined(ctx, `@${d.name}`, cx, 290, 52, '#ffffff', w - 20)
      outlined(ctx, `Cash Multi: x${+d.multi.toFixed(2)}`, cx, 352, 40, '#ffe14a', w - 20)
    } else {
      outlined(ctx, 'Free Base', cx, 300, 56, '#dfe6f5', w - 20)
    }
  }
}
