import { Vector3 } from 'three'
import { LANE, MUTATIONS, RARITIES, SAFE_ZONE, SPAWN, SPAWN_FACING, ZONES } from '../config.js'
import { player, placePlayer, resetPlayer, setFrozen, setMoveProfile } from '../player.js'
import { syncYawToPlayer } from '../camera.js'
import { sfx, spatial } from '../audio/index.js'
import { confettiBurst, flash, glow, puff, smoke } from '../fx.js'
import { DynLabel, short, paintLines } from '../safezone/text.js'
import { makeFighter, rollMutation, rosterFor } from '../roster.js'
import * as store from '../state.js'
import { addFighter, changed, held, state } from '../state.js'
import { buildLane, zoneAt, zoneBounds } from './world.js'
import { createOrb } from './orb.js'
import { Guardian, snatchFx } from './guardian.js'
import { FighterActor } from './actor.js'

// Lane gameplay. The player has one of five forms:
//   human    - the avatar (safe zone), holding the selected hotbar fighter if any
//   orb      - the winged orb, rolling down the lane at the Speed stat's pace
//   caught   - in a guardian's hands, carried back to its base (no control)
//   hatching - on the base's slot, hatching into a fighter (no control)
//   fighter  - running back to the safe zone as the fighter, hunted by the guardian
// Crossing the hub edge switches human <-> orb; reaching the safe zone as a
// fighter adds it to the hotbar. Being caught as a fighter loses it.

const Z = SAFE_ZONE
const G = LANE.guardian
const R = LANE.ball.radius

// Speed stat in effect (ui/* adds an x2 boost through state.effectiveSpeed when it exists).
const speedStat = () => store.effectiveSpeed?.() ?? state.speed

export function mps(stat) {
  const c = LANE.speedCurve
  return Math.min(c.max, c.base + c.perDecade * Math.log10(1 + stat / 1000))
}

export function createLane(scene, { hud, playerGroup, getAvatar }) {
  const lane = buildLane(scene)
  const guardians = lane.zones.map((z, i) => new Guardian(scene, z.zone, z.house, i))
  const orb = createOrb(scene)

  let form = 'human'
  let active = null // guardian dealing with the player
  let caughtZone = -1
  let luckAtCatch = 1
  let flyIn = 0 // 0..1 orb flying into the guardian's hands
  const flyFrom = new Vector3()
  const hold = new Vector3()
  let hatchT = 0
  let revealed = false
  let hatchSlot = null
  let pending = null // the fighter being hatched / run home
  let actor = null // FighterActor for the hatching / running fighter
  let actorLabel = null
  let heldActor = null // FighterActor carried in front of the avatar
  let heldId = -1
  let heldLabel = null
  let shake = 0
  let rollAcc = 0
  let lastBeat = 0
  const target = { x: 0, z: 0 } // live chase target (orb / fighter feet)
  const centre = new Vector3()
  const cam = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0 }

  // --- Profiles ---
  const orbProfile = () => ({ speed: mps(speedStat()), accel: LANE.ball.accel, decel: LANE.ball.decel, airAccel: LANE.ball.airAccel, turnSpeed: LANE.ball.turnSpeed, jumpSpeed: LANE.ball.jumpSpeed })
  const fighterProfile = { speed: LANE.character.speed, accel: LANE.character.accel }

  function showAvatar(on) {
    const a = getAvatar()
    if (a) a.visible = on
  }

  function toOrb() {
    form = 'orb'
    setMoveProfile(orbProfile())
    showAvatar(false)
    orb.show(true)
    const p = player.renderPosition
    puff(p.x, p.y + 1, p.z, 1)
    sfx.poof(true)
    hud.toast?.('Ball mode!', 'Roll down the lane, outrun the guardians', '#ffd6f0')
  }
  function toHuman(effects = true) {
    form = 'human'
    setMoveProfile(null)
    setFrozen(false)
    showAvatar(true)
    orb.show(false)
    orb.setHeld(false)
    if (effects) {
      const p = player.renderPosition
      puff(p.x, p.y + 1, p.z, 1)
      sfx.poof(false)
    }
  }

  // A fighter of the zone's rarity from the shared roster (roster.js: fixed names + looks for
  // the Index); luck (how deep the orb got x any luck boost) raises income and mutation odds.
  function rollFighter(zone, luck) {
    const list = rosterFor(zone.rarity)
    const entry = list[Math.floor(Math.random() * list.length)]
    const boost = store.luckMulti?.() ?? 1
    const mu = rollMutation(Math.random, luck * boost)
    // Spread inside the rarity's range around the roster's base income.
    const spread = 0.8 + Math.random() * 0.5
    const f = makeFighter(entry, state.nextId++, mu?.name ?? null, luck * spread)
    changed()
    return f
  }

  function fighterLabel(f, height = 1.4) {
    const rar = RARITIES.find((r) => r.name === f.rarity) ?? RARITIES[0]
    const lines = []
    if (f.mutation) lines.push({ t: f.mutation, px: 30, color: MUTATIONS.find((m) => m.name === f.mutation)?.color ?? '#fff' })
    lines.push({ t: f.name, px: 50, color: '#ffffff' })
    lines.push({ t: rar.name, px: 38, color: rar.color, outline: rar.outline ?? '#0b1a3a' })
    lines.push({ t: `+$${short(f.income)}/s`, px: 38, color: '#9dff3a' })
    const h = 46 + lines.reduce((a, l) => a + l.px * 1.08, 0)
    const label = new DynLabel(420, Math.ceil(h), height * (lines.length / 3), (ctx, w) => paintLines(ctx, lines, w))
    label.set(f.id)
    label.sprite.center.set(0.5, 0)
    scene.add(label.sprite)
    return label.sprite
  }

  function disposeActor() {
    if (actor) actor.root.removeFromParent()
    if (actorLabel) actorLabel.removeFromParent()
    actor = null
    actorLabel = null
  }

  // --- Catch -> hatch -> run ---
  function caught(g) {
    form = 'caught'
    caughtZone = lane.zones.findIndex((z) => z.zone === g.zone)
    const b = zoneBounds(caughtZone)
    const frac = Math.min(1, Math.max(0, (b.start - player.position.z) / (b.start - b.end)))
    luckAtCatch = 1 + Math.round(frac * LANE.luckMax * 10) / 10
    setFrozen(true)
    orb.setHeld(true)
    flyIn = 0
    flyFrom.set(player.renderPosition.x, player.renderPosition.y + R, player.renderPosition.z)
    const free = g.house.slots
    hatchSlot = free[Math.floor(Math.random() * free.length)]
    g.carryTo(hatchSlot)
    sfx.grab()
    shake = Math.max(shake, 0.5)
    hud.flashScreen?.('#ffffff')
  }

  function startHatch() {
    form = 'hatching'
    hatchT = 0
    pending = rollFighter(active.zone, luckAtCatch)
    sfx.hatchSwirl()
  }

  function finishHatch() {
    // Control back, as the fighter, standing on the slot.
    form = 'fighter'
    setFrozen(false)
    resetPlayer({ x: hatchSlot.x, y: hatchSlot.y, z: hatchSlot.z }, active.house.frontYaw)
    syncYawToPlayer()
    setMoveProfile(fighterProfile)
    orb.show(false)
    orb.setHeld(false)
    actorLabel = fighterLabel(pending)
    const what = `${pending.mutation ?? 'Default'} ${pending.rarity} ${pending.name}`
    hud.hatched(what)
    hud.run(true)
    sfx.alarm()
    active.hunt(target)
  }

  function lose() {
    const g = active
    const p = player.renderPosition
    snatchFx(p.x, p.y, p.z)
    sfx.lost()
    hud.run(false)
    hud.toast?.(`${g?.name ?? 'The guardian'} took ${pending?.name ?? 'it'} back!`, 'Run faster next time', '#ff6a5a')
    disposeActor()
    pending = null
    active = null
    toHuman(false)
    resetPlayer(SPAWN, SPAWN_FACING)
    syncYawToPlayer()
  }

  function safeHome() {
    const p = player.renderPosition
    confettiBurst(p.x, p.y + 1.5, p.z, 180, 10)
    flash(p.x, p.y + 1.4, p.z, '#ffe36a', 70, 8)
    sfx.safeArrive()
    hud.run(false)
    addFighter(pending)
    store.recordHatch?.(pending)
    hud.toast?.(`${pending.name} is yours!`, 'Added to your hotbar - place it in your base', '#9dff3a')
    active?.giveUp()
    active = null
    pending = null
    disposeActor()
    toHuman(false)
  }

  // Held fighter (hotbar selection) in front of the avatar.
  function syncHeld() {
    const f = form === 'human' ? held() : null
    const id = f ? f.id : -1
    if (id === heldId) return
    heldId = id
    if (heldActor) heldActor.root.removeFromParent()
    if (heldLabel) heldLabel.removeFromParent()
    heldActor = heldLabel = null
    if (!f) return
    heldActor = new FighterActor(f.look, 0.55)
    heldActor.root.position.set(0, 0.62, 0.62)
    playerGroup.add(heldActor.root)
    heldLabel = fighterLabel(f, 1.0)
    const p = player.renderPosition
    puff(p.x, p.y + 1.2, p.z, 0.4, '#fff6c8')
  }

  return {
    get form() {
      return form
    },
    get carrying() {
      return form === 'human' && !!heldActor
    },
    get shake() {
      return shake
    },
    // Cinematic camera while carried + hatching: outside the base's open front, looking in at the orb.
    get cinematic() {
      if ((form !== 'caught' && form !== 'hatching') || !active) return null
      const yaw = active.house.frontYaw
      const fx = Math.sin(yaw)
      const fz = Math.cos(yaw)
      const tx = form === 'hatching' ? hatchSlot.x : centre.x
      const tz = form === 'hatching' ? hatchSlot.z : centre.z
      const ty = form === 'hatching' ? hatchSlot.y + 1.2 : centre.y
      // Stand off from the base's front (never inside it), a little to the side and above.
      const d = active.house.toLocal(tx, tz)
      const out = Math.max(9, 18 - d.z)
      cam.x = tx + fx * out + fz * 2.5
      cam.z = tz + fz * out - fx * 2.5
      cam.y = Math.max(3.2, ty + 2.6)
      cam.lx = tx
      cam.ly = ty
      cam.lz = tz
      return cam
    },
    mps,
    // R / portal respawn while out on the lane: whatever you were carrying is lost.
    onRespawn() {
      if (form === 'fighter' || form === 'caught' || form === 'hatching') {
        active?.giveUp()
        active = null
        hud.run(false)
        disposeActor()
        pending = null
      }
      for (const g of guardians) if (g.busy) g.giveUp()
      if (form !== 'human') toHuman(false)
    },
    update(dt, elapsed, p, firstPerson) {
      shake = Math.max(0, shake - dt * 2)
      const inLane = p.z < Z.hub.minZ
      const zi = zoneAt(p.z)

      // --- Form switches at the hub edge ---
      if (form === 'human' && p.z < Z.hub.minZ - 0.3) toOrb()
      else if (form === 'orb' && p.z > Z.hub.minZ + 0.3) {
        toHuman()
        if (active) active.giveUp()
        active = null
      } else if (form === 'fighter' && p.z > Z.hub.minZ + 0.3) safeHome()
      if (form === 'orb') setMoveProfile(orbProfile()) // the Speed stat may change (treadmills)

      // --- Orb ---
      const speed = Math.hypot(player.velocity.x, player.velocity.z)
      const top = mps(speedStat())
      if (form === 'orb') {
        centre.set(p.x, p.y + R, p.z)
        target.x = p.x
        target.z = p.z
        const beat = orb.update(dt, centre, player.velocity, player.facing, Math.min(1, speed / top))
        if (lastBeat < 0 && beat >= 0) sfx.flap(Math.min(1, speed / top))
        lastBeat = beat
        if (player.grounded && speed > 1) {
          rollAcc += speed * dt
          if (rollAcc > 2.2) {
            rollAcc = 0
            sfx.roll(Math.min(1, speed / top))
          }
        }
        // Wake the guardian of this zone when the orb comes near its base.
        if (zi >= 0) {
          const g = guardians[zi]
          const d = Math.hypot(p.x - g.house.seat.x, p.z - g.house.seat.z)
          const fastEnough = speedStat() >= g.zone.rec
          if (!active && !g.busy && d < G.wakeRange) {
            active = g
            g.wake(target, fastEnough ? top * G.fastChase : Math.max(top * G.slowChase, 10))
            if (!fastEnough) hud.toast?.(`${g.name} woke up!`, `Recommended: ${short(g.zone.rec)} Speed`, '#ff8a6a')
          }
        }
        // Too far from its zone: it gives up.
        if (active) {
          const ai = guardians.indexOf(active)
          const b = zoneBounds(ai)
          if (p.z > b.start + (ai === 0 ? 0 : G.leash) || p.z < b.end - G.leash) {
            active.giveUp()
            active = null
          }
        }
      } else if (form === 'caught') {
        flyIn = Math.min(1, flyIn + dt / 0.3)
        active.holdPoint(hold)
        hold.y += R * 0.6
        const k = flyIn * flyIn * (3 - 2 * flyIn)
        centre.lerpVectors(flyFrom, hold, k)
        orb.update(dt, centre, { x: 0, z: 0 }, active.yaw, 0)
        placePlayer(centre.x, centre.y - R, centre.z)
      } else if (form === 'hatching') {
        hatchT += dt
        const s = hatchSlot
        const base = { x: s.x, y: s.y + R, z: s.z }
        const T = LANE.hatchTime
        if (hatchT < 0.55) {
          // Orb on the slot, shaking harder and harder, light gathering.
          const k = hatchT / 0.55
          centre.set(base.x + Math.sin(hatchT * 60) * 0.08 * k, base.y + Math.abs(Math.sin(hatchT * 30)) * 0.12 * k, base.z + Math.cos(hatchT * 52) * 0.08 * k)
          orb.update(dt, centre, { x: 0, z: 0 }, active.yaw + Math.PI, 0)
          if (Math.random() < dt * 60) {
            const a = Math.random() * Math.PI * 2
            glow({ x: base.x + Math.cos(a) * 2, y: base.y + (Math.random() - 0.5), z: base.z + Math.sin(a) * 2, vx: -Math.cos(a) * 3.4, vz: -Math.sin(a) * 3.4, color: '#fff2c0', size: 0.3, size1: 0.08, life: 0.55 })
          }
        } else if (!actor) {
          revealed = false
          orb.show(false)
          puff(base.x, base.y, base.z, 0.8, '#3a2a4a')
          actor = new FighterActor(pending.look, LANE.character.scale)
          actor.setSilhouette(true)
          actor.root.position.set(s.x, s.y, s.z)
          actor.root.rotation.y = active.house.frontYaw
          actor.root.scale.setScalar(0.01)
          scene.add(actor.root)
        }
        if (actor && hatchT < 1.6) {
          // Dark vortex with white glyph shards; the silhouette grows inside it.
          const k = Math.min(1, (hatchT - 0.55) / 0.9)
          actor.root.scale.setScalar(Math.max(0.01, k * k * (3 - 2 * k)))
          actor.root.rotation.y += dt * (1 - k) * 12
          for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2
            const r = 1.2 + Math.random() * 1.2
            smoke({ x: s.x + Math.cos(a) * r, y: s.y + Math.random() * 2.4, z: s.z + Math.sin(a) * r, vy: 0.8, color: Math.random() < 0.6 ? '#0a0610' : '#2a1238', alpha: 0.85, size: 0.7, size1: 1.4, life: 0.7, swirl: 7, pull: 0.9, cx: s.x, cz: s.z, fadeIn: 0.15, fadeOut: 0.5 })
          }
          if (Math.random() < dt * 30) {
            const a = Math.random() * Math.PI * 2
            glow({ x: s.x + Math.cos(a) * 1.7, y: s.y + 0.4 + Math.random() * 2, z: s.z + Math.sin(a) * 1.7, vy: 0.6, color: '#ffffff', size: 0.42, size1: 0.15, life: 0.8, swirl: 5, cx: s.x, cz: s.z })
          }
        }
        if (actor && hatchT >= 1.6 && !revealed) {
          revealed = true
          actor.setSilhouette(false)
          actor.root.scale.setScalar(1)
          flash(s.x, s.y + 1.2, s.z, RARITIES.find((r) => r.name === pending.rarity)?.color ?? '#ffffff', 80, 7)
          sfx.hatchPop()
          shake = Math.max(shake, 0.3)
        }
        if (actor && hatchT >= 1.6) actor.setGlow(Math.max(0, 1 - (hatchT - 1.6) / 0.35))
        placePlayer(s.x, s.y, s.z)
        if (hatchT >= T) finishHatch()
      }

      // --- Fighter running home ---
      if (actor) {
        if (form === 'fighter') {
          actor.root.position.set(p.x, p.y, p.z)
          actor.root.rotation.y = player.facing
          actor.update(dt, speed, player.grounded ? 'run' : 'idle')
          target.x = p.x
          target.z = p.z
        } else actor.update(dt, 0, 'idle')
        if (actorLabel) actorLabel.position.set(actor.root.position.x, actor.root.position.y + 3.0, actor.root.position.z)
        actor.root.visible = !(firstPerson && form === 'fighter')
      }

      // --- Guardians ---
      for (let i = 0; i < guardians.length; i++) {
        const g = guardians[i]
        const near = Math.abs(p.z - lane.zones[i].mid) < 260
        g.setVisible(near || g.busy)
        if (!near && !g.busy) continue
        const ev = g.update(dt, elapsed, Math.hypot(p.x - g.pos.x, p.z - g.pos.z) > 70)
        shake = Math.max(shake, g.shake)
        if (ev === 'caught' && g === active && form === 'orb') caught(g)
        else if (ev === 'placed' && g === active && form === 'caught') startHatch()
        else if (ev === 'caughtFighter' && g === active && form === 'fighter') lose()
      }
      // The hunting guardian gives up once the fighter is well out of its zone (keep running!).
      if (form === 'fighter' && active && active.state === 'hunt') {
        const b = zoneBounds(guardians.indexOf(active))
        if (p.z > b.start + G.leash + 10 || p.z < b.end - G.leash) {
          active.giveUp()
          active = null
        }
      }

      // --- Zone culling ---
      for (const z of lane.zones) {
        const vis = Math.abs(p.z - z.mid) < LANE.cullDistance
        z.baked.visible = vis
        z.label.visible = vis
        for (const e of z.emitters) e.visible = vis
      }

      // --- Held fighter ---
      syncHeld()
      if (heldActor) {
        heldActor.update(dt, speed, 'carried')
        heldLabel.position.set(playerGroup.position.x, playerGroup.position.y + 3.0, playerGroup.position.z)
        heldLabel.visible = !firstPerson
      }

      // --- HUD ---
      if (inLane) {
        const b = zoneBounds(Math.max(0, zi))
        const frac = Math.min(1, Math.max(0, (b.start - p.z) / (b.start - b.end)))
        const luck = form === 'caught' || form === 'hatching' || form === 'fighter' ? luckAtCatch : 1 + Math.round(frac * LANE.luckMax * 10) / 10
        hud.lane(true, (Math.max(0, zi) + frac) / ZONES.length, luck)
      } else hud.lane(false)
      hud.speedo(form === 'orb', form === 'orb' ? speedStat() * Math.min(1, speed / top) : 0, speedStat())
    },
  }
}
