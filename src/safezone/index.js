import { AUDIO, SAFE_ZONE } from '../config.js'
import { fontReady } from '../propkit.js'
import { createEmitter } from '../particles.js'
import { sfx, spatial } from '../audio/index.js'
import { toast } from '../toast.js'
import { SignAtlas, LabelBatch } from './text.js'
import { buildGround } from './ground.js'
import { buildBoards } from './boards.js'
import { buildBases } from './bases.js'
import { buildStalls } from './stalls.js'

// The safe zone (layout map: SAFE_ZONE.md). Builds every piece, sets up the
// GPU particle emitters, and each frame animates the few moving parts and runs
// the player-driven triggers: crossing the SAFE ZONE edge, stepping on a shop
// pad / collect pad / the free-reward spot, and the positional one-shots.
//
// Draw-call budget: static geometry is baked per set piece (one mesh per
// material), all signs share 1-2 atlas textures, all floating labels are two
// billboard meshes, particles are 5 GPU emitters.

const Z = SAFE_ZONE

export async function buildSafeZone(scene) {
  // Signs are painted once, so wait (briefly) for the Fredoka web font.
  await Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))])
  const signs = new SignAtlas(2048)
  const nearLabels = new LabelBatch(scene, { far: 55, overhead: true }) // fighter / owner names
  const farLabels = new LabelBatch(scene, { far: 260 })

  const ground = buildGround(scene, signs)
  const board = buildBoards(scene, signs, farLabels)
  const bases = buildBases(scene, signs, nearLabels)
  const stalls = buildStalls(scene, signs, farLabels)
  nearLabels.build()
  farLabels.build()

  // --- Particles (one draw call each, animated entirely on the GPU) ---
  createEmitter(scene, { boxes: stalls.sparkles, count: 320, life: 2.4, velocity: [0, 1.2, 0], spread: [0.25, 0.35, 0.25], size: 0.3, sprite: 'sparkle', intensity: 2.4, twinkle: 7, seed: 11 })
  if (bases.auras.length) {
    createEmitter(scene, {
      boxes: bases.auras.map((a) => ({ x: a.x, y: a.y, z: a.z, sx: 0.75, sy: 1.0, sz: 0.75, color: a.color })),
      count: bases.auras.length * 16,
      life: 1.5,
      velocity: [0, 1.4, 0],
      spread: [0.2, 0.4, 0.2],
      size: 0.26,
      grow: 0.4,
      intensity: 2.6,
      seed: 12,
    })
  }
  createEmitter(scene, { boxes: stalls.steam.map((s) => ({ ...s, sx: 0.25, sy: 0.1, sz: 0.25 })), count: 110, life: 2.8, velocity: [0, 1.5, 0], spread: [0.35, 0.3, 0.35], size: 0.8, grow: 2.8, color: '#dfe6ff', intensity: 0.55, opacity: 0.5, seed: 13 })
  const lane = Z.laneExit
  createEmitter(scene, { boxes: [{ x: lane.x, y: 0.3, z: lane.textZ, sx: 19, sy: 0.1, sz: 3.2 }], count: 90, life: 2.6, velocity: [0, 0.9, 0], spread: [0.1, 0.3, 0.1], size: 0.22, sprite: 'sparkle', color: '#8ff6ff', intensity: 2.2, twinkle: 5, seed: 14 })
  if (bases.collectPads.length) {
    createEmitter(scene, { boxes: bases.collectPads.map((c) => ({ x: c.x, y: c.y + 0.3, z: c.z, sx: 0.4, sy: 0.1, sz: 1.3 })), count: bases.collectPads.length * 10, life: 1.6, velocity: [0, 0.8, 0], spread: [0.1, 0.2, 0.1], size: 0.2, sprite: 'sparkle', color: '#8dff7a', intensity: 2, twinkle: 6, seed: 15 })
  }

  // --- Sound hooks ---
  if (stalls.wheel) {
    const w = stalls.wheel
    w.onTick = (k) => {
      const s = spatial(w.position.x, w.position.z, AUDIO.ambience.tickNear)
      sfx.wheelTick(k, s.gain * AUDIO.ambience.tick, s.pan)
    }
  }
  const fuseShop = Z.shops.find((s) => s.id === 'fuse')
  const fuse = { x: fuseShop.x, z: fuseShop.z }
  let steamIn = 3

  // --- Trigger state ---
  let inSafe = null
  let inDesert = false
  const padCooldown = new Map()
  const spots = [
    stalls.freeReward && { ...stalls.freeReward, title: 'Claim Free Reward', sub: 'Like the game + Favorite to claim', color: '#7dff5a', sound: 'sparkle' },
    stalls.orbPack && { ...stalls.orbPack, title: `Orb Pack ${Z.orbPack.price}`, sub: '3 Orbs, paid with cash only', color: '#ff4a4a', sound: 'pad' },
  ].filter(Boolean)
  const spotIn = new Set()

  const surfaceAt = (p) => {
    if (p.z < Z.desertEnd) return Math.abs(p.x - lane.x) < lane.width / 2 ? 'carpet' : 'plastic'
    if (p.z < Z.hub.minZ) {
      if (Math.abs(p.x - lane.x) < lane.width / 2) return 'carpet'
      if (p.z > Z.hub.minZ - 7 && p.z < Z.hub.minZ - 3 && Math.abs(p.x) < (Z.hub.maxX - Z.hub.minX - 30) / 2) return 'carpet'
      return 'sand'
    }
    for (const b of Z.bases.plots) {
      if (b.level && Math.abs(p.x - b.x) < 2 && p.z > Z.bases.frontZ && p.z < Z.bases.frontZ + Z.bases.depth) return 'carpet'
    }
    return 'plastic'
  }

  return {
    mySlots: bases.mySlots,
    homeZone: bases.homeZone,
    fuse,
    get inDesert() {
      return inDesert
    },
    surfaceAt,
    update(dt, elapsed, p) {
      ground.update(dt)
      board.update(dt, elapsed)
      stalls.wheel?.update(dt)
      for (const c of stalls.crystals) {
        c.mesh.rotation.y = elapsed * 1.1
        c.mesh.position.y = c.y + Math.sin(elapsed * 1.6) * 0.15
      }
      for (const b of stalls.bobbers) b.obj.position.y = b.base + Math.sin(elapsed * 1.8 + b.phase) * 0.18
      for (const h of bases.houseIcons) {
        h.position.y = h.userData.y + Math.sin(elapsed * 1.5) * 0.35
        h.rotation.y = Math.PI + Math.sin(elapsed * 0.8) * 0.35
      }

      // Safe zone edge.
      const nowSafe = p.x > Z.hub.minX && p.x < Z.hub.maxX && p.z > Z.hub.minZ && p.z < Z.hub.maxZ
      inDesert = p.z < Z.hub.minZ
      if (inSafe !== null && nowSafe !== inSafe) {
        if (nowSafe) {
          toast('Entered the Safe Zone', 'Nobody can take your fighters here', '#7af4ff')
          sfx.zoneEnter()
        } else {
          toast('Left the Safe Zone', 'Watch out out there!', '#ff8a6a')
          sfx.zoneLeave()
        }
      }
      inSafe = nowSafe

      // Shop pads: glow pulse, brighten + sound + notice when stepped on.
      for (const pad of stalls.pads) {
        const d = Math.hypot(p.x - pad.x, p.z - pad.z)
        const on = d < pad.r && p.y < 1.5
        if (on && !pad.on) {
          sfx.padEnter(spatial(pad.x, pad.z, 20).pan * 0.5)
          toast(pad.shop.title, pad.shop.note, pad.shop.pad)
        }
        pad.on = on
        pad.heat += ((on ? 1 : 0) - pad.heat) * Math.min(1, dt * 6)
        pad.mat.opacity = 0.62 + 0.18 * Math.sin(elapsed * 2.4 + pad.x) + pad.heat * 0.3
        const s = 1 + pad.heat * 0.06
        pad.mesh.scale.set(pad.r * 2 * s, pad.r * 2 * s, 1)
      }
      // Collect pads in your base.
      for (const c of bases.collectPads) {
        if (Math.abs(p.x - c.x) < 0.7 && Math.abs(p.z - c.z) < 1.6 && Math.abs(p.y - c.y) < 0.6) {
          const key = c.x * 1000 + c.z
          if (elapsed - (padCooldown.get(key) ?? -9) > 1.5) {
            padCooldown.set(key, elapsed)
            sfx.coins(4, 0)
          }
        }
      }
      // Free reward / Orb Pack spots.
      for (const s of spots) {
        const on = Math.hypot(p.x - s.x, p.z - s.z) < s.r
        if (on && !spotIn.has(s)) {
          spotIn.add(s)
          toast(s.title, s.sub, s.color)
          if (s.sound === 'sparkle') sfx.sparkle(0)
          else sfx.padEnter(0)
        } else if (!on) spotIn.delete(s)
      }
      // Fuse Machine steam puffs (heard only nearby).
      steamIn -= dt
      if (steamIn <= 0) {
        steamIn = 3 + Math.random() * 4
        const s = spatial(fuse.x, fuse.z, AUDIO.ambience.humNear)
        sfx.steam(s.gain, s.pan)
      }
    },
  }
}
