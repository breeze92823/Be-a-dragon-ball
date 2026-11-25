import { Group, MathUtils } from 'three'
import { BALLS, LANE } from './config.js'
import { createOrb } from './lane/orb.js'
import { FighterActor } from './lane/actor.js'
import { loadBaseCharacter } from './avatar/character.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { dressCharacter, skinTextureUrlFor, validOutfitKey } from './bloxity.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { DynLabel } from './safezone/text.js'
import { net } from './net.js'

// The other players in your room. The server relays each player's pose (`pose` ~10/s), form and
// Boxity outfit key through the room roster (backend presence.ts); this draws them: a clone of the
// base rig dressed with the platform character kit from the outfit key, the locomotion animator
// driven by their speed, a name tag (the overhead layer, so Settings -> names hides it) and an
// eased position so the 10 Hz updates read smooth.
//
// Forms (the sender's `form`): human = the dressed avatar (plus the fighter it carries); orb = the
// winged Dragon Ball orb rolling the lane, in their equipped ball's skin; fighter = the hatched
// fighter running home. Fallbacks: kit switched off / key invalid -> the stock Boxity body; far
// away -> hidden and not animated.

const HEAD = 2.3 // m above the feet: name tag and chat bubble
const FAR = 140 // m: beyond this a remote player is not drawn
const SMOOTH = 14 // 1/s: how fast the drawn position follows the latest pose
const ORB_R = LANE.ball.radius
const TAG = { human: HEAD + 0.3, orb: ORB_R * 2 + 0.9, fighter: 3.3 } // name tag height per form

// "gi,pants,hair,skin,belt,boots,style,stance,cape" (the roster's format) -> a fighter look, or null.
function parseLook(csv) {
  const a = typeof csv === 'string' ? csv.split(',') : []
  if (a.length !== 9) return null
  return { gi: a[0], pants: a[1], hair: a[2], skin: a[3], belt: a[4], boots: a[5], style: Number(a[6]) || 0, stance: Number(a[7]) || 0, cape: a[8] === '1' }
}
const ballLookOf = (id) => (BALLS.find((b) => b.id === id) ?? BALLS[0]).look

function paintName(ctx, w, h, name) {
  ctx.clearRect(0, 0, w, h)
  ctx.font = `700 ${Math.floor(h * 0.5)}px Fredoka, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = h * 0.14
  ctx.strokeStyle = '#0b1a3a'
  ctx.strokeText(name, w / 2, h / 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(name, w / 2, h / 2)
}

export function createRemotePlayers(scene, camera) {
  const remotes = new Map() // sessionId -> remote

  function add(id) {
    const r = {
      id,
      uid: '',
      group: new Group(),
      avatar: null,
      animator: null,
      kit: null,
      key: '',
      lookJson: '',
      gen: 0,
      label: new DynLabel(512, 128, 0.42, paintName),
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      vy: 0,
      vx: 0,
      vz: 0,
      form: 'human',
      ball: '',
      orb: null,
      actor: null,
      actorLook: '',
      held: null,
      heldLook: '',
      seen: false,
      dead: false,
    }
    r.group.visible = false
    r.label.sprite.position.set(0, HEAD + 0.3, 0)
    r.group.add(r.label.sprite)
    scene.add(r.group)
    remotes.set(id, r)
    build(r)
    return r
  }

  // The rig loads asynchronously; the outfit follows once its key is known.
  async function build(r) {
    const avatar = await loadBaseCharacter()
    if (r.dead) return
    r.avatar = avatar
    r.group.add(avatar)
    r.animator = makeAnimator(avatar)
    await dress(r) // the kit when it can, else the skin from the item ids
  }

  async function dress(r) {
    if (!r.avatar) return
    if (!validOutfitKey(r.key)) return void manual(r)
    const key = r.key
    if (r.kit) {
      // Switch looks in place (the old one stays until the new one is loaded).
      const ok = await r.kit.update(key).catch(() => false)
      if (!ok && !r.dead) {
        r.kit = null // the kit can't draw this look: the rig is back to its stock body
      }
      return
    }
    const handle = await dressCharacter(r.avatar, key)
    if (!handle) return void manual(r) // kit off / can't draw this look: draw the skin from the item ids
    if (r.dead || r.key !== key) {
      // Left, or changed again while the outfit loaded.
      if (r.dead) handle.dispose()
      else {
        r.kit = handle
        dress(r)
      }
      return
    }
    r.kit = handle
  }

  // The model of one form is built when the form starts and dropped when it ends.
  function setActor(r, csv, scale) {
    if (r.actorLook === csv && (r.actor || !csv)) return
    r.actorLook = csv
    r.actor?.root.removeFromParent()
    r.actor = null
    const look = parseLook(csv)
    if (!look) return
    r.actor = new FighterActor(look, scale)
    scene.add(r.actor.root)
  }
  function setHeld(r, csv) {
    if (r.heldLook === csv) return
    r.heldLook = csv
    r.held?.root.removeFromParent()
    r.held = null
    const look = parseLook(csv)
    if (!look) return
    r.held = new FighterActor(look, 0.55)
    r.held.root.position.set(0, 0.62, 0.62) // in front of the avatar, like your own
    r.group.add(r.held.root)
  }
  function dropOrb(r) {
    if (!r.orb) return
    r.orb.show(false)
    r.orb.root.removeFromParent()
    r.orb = null
  }

  // The skin without the kit: a fresh rig with the player's equipped Boxity items (hat, hair, mask,
  // body parts, skin texture with pants / shirt / face) and body proportions, from the ids they relay.
  async function manual(r) {
    if (r.kit || !r.lookJson || !r.avatar) return
    let look
    try {
      look = JSON.parse(r.lookJson)
    } catch {
      return
    }
    if (!look?.equipped) return
    const mine = ++r.gen
    const group = await loadBaseCharacter()
    await attachEquippedAccessories(group, look.equipped, { skinTextureUrl: skinTextureUrlFor(look.equipped) })
    if (r.dead || mine !== r.gen || r.kit) return
    applyProportions(group, look.proportions ?? null)
    r.group.remove(r.avatar)
    disposeAnimator(r.animator)
    r.avatar = group
    r.group.add(group)
    r.animator = makeAnimator(group)
  }

  function remove(r) {
    r.dead = true
    dropOrb(r)
    setActor(r, '', 1)
    setHeld(r, '')
    r.kit?.dispose()
    disposeAnimator(r.animator)
    scene.remove(r.group)
    r.label.texture.dispose()
    r.label.sprite.material.dispose()
    remotes.delete(r.id)
  }

  function sync(r, p, dt) {
    if (p.username !== r.label.value) r.label.set(p.username || 'Player')
    r.uid = p.uid || ''
    if (p.avatar !== r.key) {
      r.key = p.avatar
      dress(r)
    }
    if (p.look !== r.lookJson) {
      r.lookJson = p.look
      manual(r)
    }
    // Position: snap on the first pose, then ease toward each new one.
    // The roster starts every player at the origin: wait for a real pose before drawing anyone.
    if (!r.seen && p.x === 0 && p.y === 0 && p.z === 0 && p.yaw === 0 && p.speed === 0) return void (r.group.visible = false)
    if (!r.seen) {
      r.seen = true
      r.x = p.x
      r.y = p.y
      r.z = p.z
      r.yaw = p.yaw
    } else {
      const k = 1 - Math.exp(-SMOOTH * dt)
      const lastY = r.y
      const lastX = r.x
      const lastZ = r.z
      r.x += (p.x - r.x) * k
      r.y += (p.y - r.y) * k
      r.z += (p.z - r.z) * k
      r.yaw += (MathUtils.euclideanModulo(p.yaw - r.yaw + Math.PI, Math.PI * 2) - Math.PI) * k // the short way round
      r.vy = dt > 0 ? (r.y - lastY) / dt : 0
      r.vx = dt > 0 ? (r.x - lastX) / dt : 0
      r.vz = dt > 0 ? (r.z - lastZ) / dt : 0
    }
    r.group.position.set(r.x, r.y, r.z)
    r.group.rotation.y = r.yaw
    // What this player is right now: the avatar, the rolling orb or the running fighter.
    const form = p.form === 'orb' || p.form === 'fighter' ? p.form : 'human'
    r.form = form
    const near = Math.hypot(r.x - camera.position.x, r.z - camera.position.z) < FAR
    const grounded = Math.abs(r.vy) < 2.5
    r.group.visible = r.seen && near // the group carries the name tag (and the avatar when human)
    if (r.avatar) r.avatar.visible = form === 'human'
    r.label.sprite.position.y = TAG[form]
    // Orb (also while a guardian holds it): the winged ball in their equipped skin.
    if (form === 'orb' && near) {
      if (!r.orb || r.ball !== p.ball) {
        dropOrb(r)
        r.ball = p.ball
        r.orb = createOrb(scene, () => ballLookOf(r.ball))
        r.orb.show(true)
      }
      r.orb.update(dt, { x: r.x, y: r.y + ORB_R, z: r.z }, { x: r.vx, z: r.vz }, r.yaw, Math.min(1, p.speed / 20))
    } else dropOrb(r)
    // Fighter running home.
    if (form === 'fighter' && near) {
      setActor(r, p.fighter, LANE.character.scale)
      if (r.actor) {
        r.actor.root.position.set(r.x, r.y, r.z)
        r.actor.root.rotation.y = r.yaw
        r.actor.update(dt, p.speed, grounded ? 'run' : 'idle')
      }
    } else setActor(r, '', 1)
    // Human: the dressed avatar, carrying the fighter in front of it when it holds one.
    setHeld(r, form === 'human' && near ? p.held : '')
    if (r.held) r.held.update(dt, p.speed, 'carried')
    if (form === 'human' && r.group.visible) {
      r.animator?.update(dt, { grounded, speed: p.speed, verticalVelocity: r.vy, turn: 0, carry: !!r.held })
    }
  }

  return {
    // Call every frame: adds / removes players as the roster changes and moves the rest.
    update(dt) {
      const room = net.connected ? net.room : null
      const players = room?.state?.players
      if (!players) {
        for (const r of [...remotes.values()]) remove(r)
        return
      }
      const here = new Set()
      players.forEach((p, id) => {
        if (id === room.sessionId) return
        here.add(id)
        sync(remotes.get(id) ?? add(id), p, dt)
      })
      for (const r of [...remotes.values()]) if (!here.has(r.id)) remove(r)
    },
    // The drawn group of the player with this Boxity account id (chat bubbles), or null.
    byUid(uid) {
      if (!uid) return null
      for (const r of remotes.values()) if (r.uid === uid && r.group.visible) return r.group
      return null
    },
    // Dev: what each remote is drawing right now.
    get debug() {
      return [...remotes.values()].map((r) => ({ form: r.form, orb: !!r.orb, actor: !!r.actor, held: !!r.held, visible: r.group.visible }))
    },
    get count() {
      return remotes.size
    },
  }
}
