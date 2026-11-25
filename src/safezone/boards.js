import { Group, Mesh, SphereGeometry, TorusGeometry } from 'three'
import { SAFE_ZONE } from '../config.js'
import { mulberry32 } from '../textures.js'
import { M, S, box, bakeInto, solid, deg } from './kit.js'
import { strokeText, roundRect, short, DynLabel } from './text.js'
import { toTexture } from '../textures.js'
import { net } from '../net.js'

// Leaderboards on the side walls (screenshots 5-7, 18, 19): a chunky blue
// studded frame (plinth, two columns, crenellated header with the board name)
// around a recessed panel listing the top 9, with the floating "Top X" title
// above. Between Top Money and Top Speed stands the Next Update screen with a
// slowly turning purple planet and a live countdown.

const Z = SAFE_ZONE
const C = Z.colors
const ROWS = 9
// Live lists: the server's `leaderboard` message (backend leaderboard.ts) names its boards by the
// saved doc field; Z.boards ids map onto them. Until one arrives (offline, or before the first
// load) the boards show the stand-in rows below.
const STAT = { money: 'money', speed: 'speed', rebirth: 'rebirths', playtime: 'playtime' }

// Playtime is saved in seconds.
export function formatPlaytime(s) {
  s = Math.max(0, Math.floor(s))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h) return `${h}h ${m}m`
  return m ? `${m}m` : `${s % 60}s`
}
function formatValue(board, v) {
  if (board.id === 'rebirth') return `${Math.round(v)} Rebirths`
  if (board.id === 'playtime') return formatPlaytime(v)
  return `${board.unit}${short(v)}${board.suffix}`
}

// Stand-in player names (original, not the reference game's players), offline only.
const NAMES = ['SkyRunner_77', 'NovaBlitz', 'PixelMonk', 'TurboKai', 'ZenRush', 'Mochi_Flash', 'BoltDrift', 'Kazu_X', 'QuickSilverr', 'LunaDash', 'RexOnFire', 'CosmoKid', 'Yuki_Zoom', 'DashBandit', 'OrbHunter9', 'MaxVelo']

function entries(board, rand) {
  const list = []
  const pool = [...NAMES].sort(() => rand() - 0.5)
  let v = board.id === 'money' ? 2.1e25 : board.id === 'speed' ? 4.4e14 : board.id === 'rebirth' ? 38 : 435 * 60
  for (let i = 0; i < ROWS; i++) {
    list.push({ name: pool[i], text: formatValue(board, board.id === 'playtime' ? v * 60 : v) })
    v *= board.id === 'rebirth' ? 0.97 : 0.55 + rand() * 0.35
  }
  return list
}

export function buildBoards(scene, signs, labels) {
  const rand = mulberry32(31)
  const g = new Group()
  const lists = Z.boards.map((b) => ({ board: b, label: buildBoard(g, signs, labels, b, rand) }))
  bakeInto(scene, g, true)
  const screen = buildUpdateScreen(scene, signs, labels)

  // A second `leaderboard` listener (Colyseus allows several) on whichever room net.js holds;
  // rejoins make a new room. It is attached the moment net.js sets net.room, through the setter
  // below: without a database the load's `leaderboard` follows the join within milliseconds, before
  // the next frame, and the server only re-sends it a minute later.
  let hooked = null
  const apply = (msg) => {
    const boards = msg?.boards
    if (!boards) return
    for (const { board, label } of lists) {
      const rows = boards[STAT[board.id]]
      if (!Array.isArray(rows)) continue
      const list = rows.slice(0, ROWS).map((r) => ({ name: String(r?.name || 'Player'), text: formatValue(board, Number(r?.value) || 0) }))
      const key = JSON.stringify(list)
      if (key === label.key) continue // the minute refresh usually changes nothing: skip the repaint
      label.key = key
      label.set(list)
    }
  }
  const hook = () => {
    if (net.room === hooked) return
    hooked = net.room
    hooked?.onMessage('leaderboard', apply)
  }
  let room = net.room
  Object.defineProperty(net, 'room', {
    configurable: true,
    enumerable: true,
    get: () => room,
    set: (r) => {
      room = r
      hook()
    },
  })
  hook()
  return screen
}

function wallFrame(side, z) {
  // x just off the wall's inner face; yaw so local +z faces into the hub.
  const x = side > 0 ? Z.hub.maxX - 2.2 : Z.hub.minX + 2.2
  return { x, z, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 }
}

function buildBoard(root, signs, labels, b, rand) {
  const f = wallFrame(b.side, b.z)
  const g = new Group()
  g.position.set(f.x, 0, f.z)
  g.rotation.y = f.yaw
  root.add(g)
  const blue = S(C.board, { rough: 0.5 })
  const dark = S(C.boardDark, { rough: 0.55 })
  const light = S('#6aa2ff', { rough: 0.5 })
  const W = 10
  // Plinth (two steps), columns, header block with crenellations.
  box(g, dark, W + 1.6, 0.6, 3.2, 0, 0, 0)
  box(g, blue, W + 0.8, 0.8, 2.6, 0, 0.6, 0)
  for (const s of [-1, 1]) {
    box(g, blue, 1.4, 8.4, 2.2, s * (W / 2 - 0.2), 1.4, 0)
    box(g, light, 1.6, 0.3, 2.4, s * (W / 2 - 0.2), 4.6, 0) // band
  }
  box(g, blue, W + 1.2, 2.6, 2.4, 0, 9.8, 0)
  box(g, light, W + 1.5, 0.35, 2.7, 0, 9.8, 0) // header foot band
  for (let i = 0; i < 6; i++) box(g, blue, 1.1, 0.7, 2.0, -W / 2 + 0.5 + i * ((W - 1) / 5), 12.4, 0) // crenellations
  // Recessed list panel, set back from the columns' front faces.
  box(g, dark, W - 2.6, 8.4, 0.6, 0, 1.4, -0.2)
  // The list repaints when the server's lists arrive, so it has its own canvas (not the atlas).
  const list = new DynLabel(420, 520, 7.8, paintList)
  const face = list.plane(W - 3, 7.8)
  face.position.set(0, 5.6, 0.13)
  g.add(face)
  list.set(entries(b, rand))
  signs.plane(g, W - 0.6, 2.0, 600, 120, (ctx, w, h) => {
    strokeText(ctx, b.header, w / 2, h / 2 + 4, 72, '#ffffff', { outline: '#173a9a', ow: 14, maxW: w - 20 })
    if (b.id === 'speed') strokeText(ctx, '⚡', w - 40, h / 2, 56, '#ffd23a', { outline: '#173a9a', ow: 8 })
  }, 0, 11.1, 1.23)
  solid(W / 2 + 0.8, 6.5, 1.6, f.x, 6.5, f.z, f.yaw)
  // Floating title.
  const tx = f.x + Math.sin(f.yaw) * 0.5
  const tz = f.z + Math.cos(f.yaw) * 0.5
  labels.add([{ t: b.title, px: 96, color: b.titleColor, outline: '#0b1a3a', ow: 18 }], tx, 13.6, tz, 2.6)
  return list
}

function paintList(ctx, w, h, list) {
  const gr = ctx.createLinearGradient(0, 0, 0, h)
  gr.addColorStop(0, '#3a6fe6')
  gr.addColorStop(1, '#2149b8')
  ctx.fillStyle = gr
  roundRect(ctx, 0, 0, w, h, 18)
  ctx.fill()
  const rowH = (h - 20) / ROWS // fixed slots, so a short live list keeps the same row size
  if (!list.length) strokeText(ctx, 'No saved players yet', w / 2, h / 2, 30, '#ffffff', { outline: '#0b1a3a', ow: 6, maxW: w - 40 })
  list.forEach((e, i) => {
    const y = 10 + rowH * (i + 0.5)
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
    ctx.fillRect(8, y - rowH / 2 + 2, w - 16, rowH - 4)
    const rankColor = ['#ffd23a', '#d9e3f0', '#ff9b4a'][i] ?? '#ffffff'
    strokeText(ctx, `#${i + 1}`, 14, y, 30, rankColor, { outline: '#0b1a3a', ow: 6, align: 'left' })
    strokeText(ctx, e.name, 70, y, 28, '#ffffff', { outline: '#0b1a3a', ow: 6, align: 'left', maxW: 190 })
    strokeText(ctx, e.text, w - 14, y, 26, '#ffe14a', { outline: '#0b1a3a', ow: 6, align: 'right', maxW: 150 })
  })
}

// Next Update screen: framed navy monitor on a stand, a ringed planet turning
// in front of it, "Next Update!" + live countdown above.
function buildUpdateScreen(scene, signs, labels) {
  const u = Z.updateScreen
  const f = wallFrame(u.side, u.z)
  const g = new Group()
  g.position.set(f.x + Math.sin(f.yaw) * 0.5, 0, f.z)
  g.rotation.y = f.yaw
  const frameMat = S('#e8ecff', { rough: 0.5 })
  const legMat = S('#3d7ff2', { rough: 0.5 })
  for (const s of [-1, 1]) box(g, legMat, 0.5, 2.2, 0.5, s * 2.4, 0, 0)
  box(g, legMat, 6, 0.4, 1.4, 0, 0, 0)
  box(g, frameMat, 6.4, 4.0, 0.5, 0, 2.2, 0)
  box(g, M('#0c1a4a', { rough: 0.2 }), 5.6, 3.3, 0.1, 0, 2.55, 0.27)
  solid(3.2, 3.1, 0.7, g.position.x, 3.1, g.position.z, f.yaw)
  const fx = g.position.x
  const fz = g.position.z
  bakeInto(scene, g, true)

  // Planet: starry purple sphere + a thin ring, unbaked (it turns).
  const planet = new Group()
  planet.position.set(fx + Math.sin(f.yaw) * 2.3, 4.2, fz + Math.cos(f.yaw) * 2.3)
  const tex = toTexture(paintPlanet(), { srgb: true })
  const ballMesh = new Mesh(new SphereGeometry(1.3, 32, 20), M('#ffffff', { rough: 0.45 }).clone())
  ballMesh.material.map = tex
  ballMesh.material.emissive.set('#5b1a9a')
  ballMesh.material.emissiveIntensity = 0.35
  ballMesh.castShadow = true
  const ring = new Mesh(new TorusGeometry(1.85, 0.08, 8, 48), M('#ff7ad9', { rough: 0.3, emissive: '#ff3fbf', ei: 0.6 }))
  ring.rotation.x = deg(70)
  planet.add(ballMesh, ring)
  scene.add(planet)

  const timer = new DynLabel(512, 180, 2.0, (ctx, w, h, text) => {
    strokeText(ctx, 'Next Update!', w / 2, 52, 64, '#ff3fd2', { outline: '#2a0b4a', ow: 12 })
    strokeText(ctx, text, w / 2, 128, 60, '#ffffff', { outline: '#0b1a3a', ow: 12 })
  })
  timer.sprite.position.set(fx + Math.sin(f.yaw) * 0.4, 6.6, fz + Math.cos(f.yaw) * 0.4)
  scene.add(timer.sprite)

  let left = u.nextUpdateHours * 3600 + 22 * 60 + 38
  let shown = -1
  return {
    update(dt, elapsed) {
      ballMesh.rotation.y = elapsed * 0.35
      ring.rotation.z = elapsed * 0.12
      planet.position.y = 4.2 + Math.sin(elapsed * 1.2) * 0.12
      left = Math.max(0, left - dt)
      const s = Math.floor(left)
      if (s !== shown) {
        shown = s
        const hh = Math.floor(s / 3600)
        const mm = Math.floor((s % 3600) / 60)
        const ss = s % 60
        timer.set(`${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`)
      }
    },
  }
}

function paintPlanet() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const ctx = c.getContext('2d')
  const gr = ctx.createLinearGradient(0, 0, 0, 128)
  gr.addColorStop(0, '#d35bff')
  gr.addColorStop(0.5, '#9a2fe6')
  gr.addColorStop(1, '#5e14b0')
  ctx.fillStyle = gr
  ctx.fillRect(0, 0, 256, 128)
  const rand = mulberry32(5)
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = `rgba(255,170,255,${0.15 + rand() * 0.2})`
    ctx.beginPath()
    ctx.ellipse(rand() * 256, 20 + rand() * 88, 14 + rand() * 30, 4 + rand() * 8, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // Little stars (the planet's markings).
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 6; i++) {
    const x = 20 + i * 42
    const y = 40 + (i % 2) * 40
    ctx.beginPath()
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 4 : 10
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    }
    ctx.fill()
  }
  return c
}
