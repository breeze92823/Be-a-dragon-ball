import { CanvasTexture, SRGBColorSpace } from 'three'

// Dragon Ball looks (config BALLS[].look: base, dark, star, stars, pattern): an equirectangular
// texture for the 3D balls (the lane orb, the Dragon Ball Shop's display) and an SVG icon for the
// shop window. Stars sit in a cluster on two opposite faces so one is always in view as it rolls.

const textures = new Map()

// Star cluster offsets (unit circle) for 1-7 stars.
const CLUSTERS = [
  [[0, 0]],
  [[-0.45, 0], [0.45, 0]],
  [[0, -0.5], [-0.45, 0.35], [0.45, 0.35]],
  [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]],
  [[0, -0.6], [-0.55, -0.1], [0.55, -0.1], [-0.35, 0.55], [0.35, 0.55]],
  [[-0.5, -0.5], [0, -0.6], [0.5, -0.5], [-0.5, 0.4], [0, 0.55], [0.5, 0.4]],
  [[0, 0], [0, -0.65], [0.6, -0.3], [0.6, 0.35], [0, 0.65], [-0.6, 0.35], [-0.6, -0.3]],
]

function starPath(ctx, cx, cy, r, sx = 1) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    ctx.lineTo(cx + Math.cos(a) * rr * sx, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
}

export function ballTexture(look) {
  const key = JSON.stringify(look)
  if (textures.has(key)) return textures.get(key)
  const W = 512
  const H = 256
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, look.base)
  g.addColorStop(0.55, look.base)
  g.addColorStop(1, look.dark)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  if (look.pattern === 'grid') {
    ctx.strokeStyle = 'rgba(120,255,140,0.35)'
    ctx.lineWidth = 2
    for (let x = 0; x < W; x += 16) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }
    for (let y = 0; y < H; y += 16) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
  } else if (look.pattern === 'crack' || look.pattern === 'wings') {
    ctx.strokeStyle = look.pattern === 'wings' ? 'rgba(160,180,255,0.35)' : 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 3
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let k = 0; k < 18; k++) {
      ctx.beginPath()
      let x = rnd() * W
      let y = rnd() * H
      ctx.moveTo(x, y)
      for (let s = 0; s < 5; s++) {
        x += (rnd() - 0.5) * 60
        y += (rnd() - 0.5) * 40
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
  const cluster = CLUSTERS[Math.max(0, Math.min(CLUSTERS.length - 1, (look.stars ?? 1) - 1))]
  for (const ox of [W / 4, (W * 3) / 4]) {
    for (const [dx, dy] of cluster) {
      starPath(ctx, ox + dx * 46, H / 2 + dy * 46, 22, 0.55)
      ctx.fillStyle = look.star
      ctx.shadowColor = 'rgba(0,0,0,0.25)'
      ctx.shadowBlur = 4
      ctx.fill()
    }
  }
  ctx.shadowBlur = 0
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  textures.set(key, t)
  return t
}

// SVG icon of a ball (shop cards).
let uid = 0
export function ballSvg(look) {
  const id = `bg${uid++}`
  const cluster = CLUSTERS[Math.max(0, Math.min(CLUSTERS.length - 1, (look.stars ?? 1) - 1))]
  const star = (cx, cy, r) => {
    let d = ''
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rr = i % 2 ? r * 0.45 : r
      d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`
    }
    return `<path d="${d}Z" fill="${look.star}" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>`
  }
  const wings =
    look.pattern === 'wings'
      ? `<g fill="#ffffff" stroke="#c8d4ff" stroke-width="2"><path d="M14 46 C-2 30 2 12 10 4 C12 18 18 26 24 30 C16 30 12 38 14 46Z"/><path d="M86 46 C102 30 98 12 90 4 C88 18 82 26 76 30 C84 30 88 38 86 46Z"/></g>`
      : ''
  const grid = look.pattern === 'grid' ? `<g stroke="rgba(120,255,140,0.35)" stroke-width="1.2">${Array.from({ length: 9 }, (_, i) => `<path d="M${14 + i * 9} 14V86M14 ${14 + i * 9}H86"/>`).join('')}</g>` : ''
  return `<svg viewBox="0 0 100 100"><defs><radialGradient id="${id}" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="0.18" stop-color="${look.base}"/><stop offset="0.75" stop-color="${look.base}"/><stop offset="1" stop-color="${look.dark}"/></radialGradient><clipPath id="${id}c"><circle cx="50" cy="52" r="36"/></clipPath></defs>${wings}<circle cx="50" cy="52" r="38" fill="#0b1a14" opacity="0.35"/><circle cx="50" cy="50" r="36" fill="url(#${id})"/><g clip-path="url(#${id}c)">${grid}</g>${cluster.map(([dx, dy]) => star(50 + dx * 15, 52 + dy * 15, 8)).join('')}<ellipse cx="38" cy="30" rx="9" ry="5" fill="#ffffff" opacity="0.6"/></svg>`
}
