import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { BASE, MUTATIONS, RARITIES } from '../config.js'
import { DynLabel, paintLines, roundRect, short, strokeText } from '../safezone/text.js'
import { FighterActor } from '../lane/actor.js'
import * as store from '../state.js'
import { addFighter, addMoney, changed, held, state, takeHeld } from '../state.js'
import { sfx } from '../audio/index.js'
import { flash, glow, puff } from '../fx.js'

// Your base's slots (the ground floor of your base in the safe zone). With a
// fighter in your hands (hotbar), walk onto an empty slot and hold E (or the
// on-screen prompt) to place it: it drops onto the pedestal and starts earning
// its income per second into the slot's green pad, whose label counts up.
// Step on the pad to collect: bundles of cash fly into you with "+$" pops.
// On a filled slot, E picks the fighter up (or swaps it with the one you hold).
// The orange sign in front of each slot upgrades it (more income per level).

const deg = (d) => (d * Math.PI) / 180
const levelMult = (lv) => 1 + BASE.levelIncome * (lv - 1)
const upgradePrice = (f, lv) => Math.round(f.income * BASE.upgradeCost * Math.pow(BASE.upgradeGrowth, lv - 1))
export const slotIncome = (sl) => (sl.fighter ? sl.fighter.income * levelMult(sl.level) * BASE.cashMulti * (store.moneyMulti?.() ?? 1) : 0)

export function createMyBase(scene, infos, { hud }) {
  const slots = infos.map((info, i) => {
    const s = state.slots[i]
    const o = { info, s, actor: null, label: null, drop: 1, padText: '', signText: '' }
    // Pad label lying on the green pad.
    o.pad = new DynLabel(160, 440, 1, (ctx, w, h, v) => paintPad(ctx, w, h, v))
    const pm = o.pad.plane(0.95, 2.6)
    pm.rotation.order = 'YXZ'
    pm.rotation.set(-Math.PI / 2, info.side < 0 ? 0 : Math.PI, 0)
    pm.position.set(info.padX, info.y + 0.15, info.z)
    scene.add(pm)
    // Upgrade sign face: same frame as the baked board.
    const sg = new Group()
    sg.position.set(info.signX, info.y, info.z)
    sg.rotation.y = info.side < 0 ? Math.PI / 2 : -Math.PI / 2
    const board = new Group()
    board.position.set(0, 0.28, 0)
    board.rotation.x = deg(-55)
    sg.add(board)
    o.sign = new DynLabel(580, 200, 1, (ctx, w, h, v) => paintUpgrade(ctx, w, h, v))
    const sm = o.sign.plane(2.9, 1.0)
    sm.position.set(0, 0.55, 0.1)
    board.add(sm)
    scene.add(sg)
    return o
  })

  // --- Cash bundles + "+$" pops (pools) ---
  const bill = new MeshStandardMaterial({ color: '#3fa84a', roughness: 0.6 })
  const band = new MeshStandardMaterial({ color: '#ffd23a', roughness: 0.4, metalness: 0.3 })
  const billGeo = new BoxGeometry(0.62, 0.22, 0.36)
  const bandGeo = new BoxGeometry(0.16, 0.24, 0.38)
  const bundles = []
  for (let i = 0; i < 14; i++) {
    const g = new Group()
    const a = new Mesh(billGeo, bill)
    const b = new Mesh(bandGeo, band)
    a.castShadow = true
    g.add(a, b)
    g.visible = false
    scene.add(g)
    bundles.push({ g, t: 1, from: { x: 0, y: 0, z: 0 }, spin: 0, delay: 0 })
  }
  const pops = []
  for (let i = 0; i < 8; i++) {
    const l = new DynLabel(420, 120, 0.9, (ctx, w, h, v) => {
      strokeText(ctx, v, w / 2, h / 2 + 4, 84, ['#c8ff5a', '#2fd23a'], { outline: '#0e4a17', ow: 16, maxW: w - 20 })
    })
    l.sprite.visible = false
    scene.add(l.sprite)
    pops.push({ l, t: 1, x: 0, y: 0, z: 0 })
  }
  let popIdx = 0
  let bundleIdx = 0

  function syncSlot(o, animate) {
    const f = o.s.fighter
    if (o.actor && (!f || o.actor.fid !== f.id)) {
      o.actor.root.removeFromParent()
      o.label?.removeFromParent()
      o.actor = o.label = null
    }
    if (f && !o.actor) {
      o.actor = new FighterActor(f.look, 1)
      o.actor.fid = f.id
      o.actor.root.position.set(o.info.x, o.info.y + 0.42, o.info.z)
      o.actor.root.rotation.y = o.info.faceYaw
      scene.add(o.actor.root)
      o.labelKey = ''
      o.drop = animate ? 0 : 1
    }
    o.signText = ''
  }
  slots.forEach((o) => syncSlot(o, false))

  function labelFor(o) {
    const f = o.s.fighter
    const key = `${f.id}|${o.s.level}`
    if (o.labelKey === key) return
    o.labelKey = key
    o.label?.removeFromParent()
    const rar = RARITIES.find((r) => r.name === f.rarity) ?? RARITIES[0]
    const lines = []
    if (f.mutation) lines.push({ t: f.mutation, px: 30, color: MUTATIONS.find((m) => m.name === f.mutation)?.color ?? '#fff' })
    lines.push({ t: f.name, px: 50, color: '#ffffff' })
    lines.push({ t: rar.name, px: 38, color: rar.color, outline: rar.outline ?? '#0b1a3a' })
    lines.push({ t: `+$${short(slotIncome(o.s))}/s`, px: 38, color: '#9dff3a' })
    const h = 46 + lines.reduce((a, l) => a + l.px * 1.08, 0)
    const dl = new DynLabel(420, Math.ceil(h), 1.45 * (lines.length / 3), (ctx, w) => paintLines(ctx, lines, w))
    dl.set(key)
    dl.sprite.center.set(0.5, 0)
    dl.sprite.position.set(o.info.x, o.info.y + 3.2, o.info.z)
    scene.add(dl.sprite)
    o.label = dl.sprite
  }

  // --- Actions ---
  function place(o) {
    const f = takeHeld()
    if (!f) return
    o.s.fighter = f
    o.s.stored = 0
    changed()
    syncSlot(o, true)
    sfx.place()
  }
  function pickUp(o) {
    const f = o.s.fighter
    if (!f) return
    const swap = held()
    o.s.fighter = null
    if (swap) {
      takeHeld()
      o.s.fighter = swap
    }
    addFighter(f)
    changed()
    puff(o.info.x, o.info.y + 1.2, o.info.z, 0.7, '#fff6c8')
    syncSlot(o, !!swap)
    sfx.pickUp()
  }
  function upgrade(o) {
    const f = o.s.fighter
    if (!f) return
    const price = upgradePrice(f, o.s.level)
    if (state.money < price) {
      sfx.denied()
      hud.toast?.('Not enough cash', `You need $${short(price)}`, '#ff6a5a')
      return
    }
    addMoney(-price)
    o.s.level++
    changed()
    o.signText = ''
    sfx.upgrade()
    flash(o.info.x, o.info.y + 1.4, o.info.z, '#ffb03a', 50, 5)
    if (o.actor) o.drop = 0.55 // a little hop
  }

  let collectCd = 0
  function collect(o, p) {
    const amount = Math.floor(o.s.stored)
    if (amount < 1) return
    o.s.stored -= amount
    addMoney(amount)
    o.padText = ''
    // "+$" pop over the player, and bundles of cash flying in from the pad.
    const pp = pops[popIdx++ % pops.length]
    pp.t = 0
    pp.x = p.x + (Math.random() - 0.5) * 1.2
    pp.y = p.y + 2.2 + Math.random() * 0.6
    pp.z = p.z + (Math.random() - 0.5) * 1.2
    pp.l.set(`+$${short(amount)}`)
    pp.l.sprite.visible = true
    const n = Math.min(5, 1 + Math.floor(Math.log10(amount + 1)))
    for (let i = 0; i < n; i++) {
      const b = bundles[bundleIdx++ % bundles.length]
      b.t = 0
      b.delay = i * 0.06
      b.from.x = o.info.padX + (Math.random() - 0.5) * 0.6
      b.from.y = o.info.y + 0.3
      b.from.z = o.info.z + (Math.random() - 0.5) * 2
      b.spin = (Math.random() - 0.5) * 16
      b.g.visible = true
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2
      glow({ x: o.info.padX, y: o.info.y + 0.3, z: o.info.z + (Math.random() - 0.5) * 2.4, vx: Math.cos(a) * 1.5, vy: 2 + Math.random() * 3, vz: Math.sin(a) * 1.5, color: Math.random() < 0.5 ? '#9dff3a' : '#ffe36a', size: 0.3, size1: 0.04, life: 0.7, gravity: 6 })
    }
    sfx.cash(Math.min(1, Math.log10(amount + 1) / 6))
    hud.moneyPop()
  }

  return {
    update(dt, elapsed, p, form) {
      // Income -> pads.
      for (const o of slots) {
        o.s.stored += slotIncome(o.s) * dt
        const txt = o.s.fighter ? `$${short(Math.floor(o.s.stored))}` : ''
        if (txt !== o.padText) {
          o.padText = txt
          o.pad.set(txt)
        }
        const st = o.s.fighter ? `${short(upgradePrice(o.s.fighter, o.s.level))}|${o.s.level}` : 'empty'
        if (st !== o.signText) {
          o.signText = st
          o.sign.set(st)
        }
        if (o.actor) {
          // Placement drop: falls from above with a squash, a puff and sparkles on landing.
          if (o.drop < 1) {
            const was = o.drop
            o.drop = Math.min(1, o.drop + dt * 2.2)
            const k = o.drop
            const fall = k < 0.55 ? 1 - (k / 0.55) ** 2 : 0
            const bounce = k >= 0.55 ? Math.sin(((k - 0.55) / 0.45) * Math.PI) * 0.25 * (1 - k) * 4 : 0
            o.actor.root.position.y = o.info.y + 0.42 + fall * 3 + bounce
            const sq = k >= 0.55 && k < 0.7 ? 1 - Math.sin(((k - 0.55) / 0.15) * Math.PI) * 0.18 : 1
            o.actor.root.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq))
            if (was < 0.55 && k >= 0.55) {
              puff(o.info.x, o.info.y + 0.5, o.info.z, 0.8, '#ffffff')
              flash(o.info.x, o.info.y + 1.2, o.info.z, RARITIES.find((r) => r.name === o.s.fighter.rarity)?.color ?? '#fff', 40, 5)
              sfx.land(0.8)
              sfx.sparkle(0)
            }
          }
          o.actor.update(dt, 0, 'idle')
          labelFor(o)
          o.label.visible = o.drop > 0.6
        }
      }
      // Bundles fly in an arc into the player's chest, spinning; pops rise and fade.
      for (const b of bundles) {
        if (!b.g.visible) continue
        if (b.delay > 0) {
          b.delay -= dt
          continue
        }
        b.t += dt / 0.55
        if (b.t >= 1) {
          b.g.visible = false
          glow({ x: p.x, y: p.y + 1.3, z: p.z, vy: 1.5, color: '#9dff3a', size: 0.5, size1: 0.05, life: 0.4 })
          continue
        }
        const k = b.t
        const e = k * k * (3 - 2 * k)
        b.g.position.set(b.from.x + (p.x - b.from.x) * e, b.from.y + (p.y + 1.3 - b.from.y) * e + Math.sin(k * Math.PI) * 2.2, b.from.z + (p.z - b.from.z) * e)
        b.g.rotation.set(k * b.spin * 0.5, k * b.spin, 0.4)
        b.g.scale.setScalar(1 - k * 0.5)
      }
      for (const pp of pops) {
        if (!pp.l.sprite.visible) continue
        pp.t += dt / 1.1
        if (pp.t >= 1) {
          pp.l.sprite.visible = false
          continue
        }
        const k = pp.t
        const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.5)
        pp.l.sprite.position.set(pp.x, pp.y + k * 1.6, pp.z)
        pp.l.sprite.scale.set(3.15 * pop, 0.9 * pop, 1)
        pp.l.sprite.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
      }

      // Collect pads.
      collectCd -= dt
      if (form === 'human' && collectCd <= 0) {
        for (const o of slots) {
          if (Math.abs(p.x - o.info.padX) < 0.75 && Math.abs(p.z - o.info.z) < 1.6 && Math.abs(p.y - o.info.y) < 0.9 && o.s.stored >= 1) {
            collect(o, p)
            collectCd = 0.45
            break
          }
        }
      }

      // Prompt: the nearest slot pedestal or upgrade sign in reach.
      let best = null
      let bestD = BASE.promptRange
      if (form === 'human') {
        const h = held()
        for (const o of slots) {
          if (Math.abs(p.y - o.info.y) > 1.5) continue
          const ds = Math.hypot(p.x - o.info.x, p.z - o.info.z)
          if (ds < bestD && (o.s.fighter || h)) {
            bestD = ds
            if (!o.s.fighter) best = { id: `place${o.info.i}`, label: 'Place', hold: BASE.placeHold, x: o.info.x, y: o.info.y + 1.6, z: o.info.z, run: () => place(o) }
            else best = { id: `pick${o.info.i}`, label: h ? 'Swap' : 'Pick Up', hold: BASE.pickupHold, x: o.info.x, y: o.info.y + 1.6, z: o.info.z, run: () => pickUp(o) }
          }
          const du = Math.hypot(p.x - o.info.signX, p.z - o.info.z)
          if (o.s.fighter && du < Math.min(bestD, 1.7)) {
            bestD = du
            best = { id: `up${o.info.i}`, label: `Upgrade $${short(upgradePrice(o.s.fighter, o.s.level))}`, hold: 0, x: o.info.signX, y: o.info.y + 1.4, z: o.info.z, run: () => upgrade(o) }
          }
        }
      }
      hud.prompt(best)
    },
  }
}

// --- Painters ---------------------------------------------------------------------------------
function paintPad(ctx, w, h, v) {
  if (!v) return
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.rotate(-Math.PI / 2)
  strokeText(ctx, v, 0, 4, 104, '#ffffff', { outline: '#0e5a17', ow: 20, maxW: h - 30 })
  ctx.restore()
}

function paintUpgrade(ctx, w, h, v) {
  const gr = ctx.createLinearGradient(0, 0, 0, h)
  gr.addColorStop(0, '#ff9b3d')
  gr.addColorStop(1, '#ff6a12')
  ctx.fillStyle = gr
  roundRect(ctx, 4, 4, w - 8, h - 8, 28)
  ctx.fill()
  if (v === 'empty') {
    strokeText(ctx, 'Empty Slot', w / 2, h / 2 - 20, 60, '#ffffff', { outline: '#7a2a00', ow: 12 })
    strokeText(ctx, 'Place a fighter here', w / 2, h / 2 + 42, 38, '#fff3d8', { outline: '#7a2a00', ow: 9 })
    return
  }
  const [price, level] = v.split('|')
  // Double-chevron "upgrade" badge.
  ctx.fillStyle = '#2a9dff'
  roundRect(ctx, 22, 38, 124, 124, 24)
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 16
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const y of [72, 112]) {
    ctx.beginPath()
    ctx.moveTo(52, y + 24)
    ctx.lineTo(84, y - 4)
    ctx.lineTo(116, y + 24)
    ctx.stroke()
  }
  strokeText(ctx, `$${price}`, 362, 74, 92, '#ffffff', { outline: '#7a2a00', ow: 18, maxW: 380 })
  strokeText(ctx, `Level ${level} > Level ${+level + 1}`, 362, 152, 48, '#ffffff', { outline: '#7a2a00', ow: 11, maxW: 380 })
}
