// Game audio, the one import the rest of the game uses:
//   installAudio() once at boot (it waits for the first gesture to start),
//   updateAudio(dt, state) every frame, sfx.<name>() for one-shots.
import { AUDIO } from '../config.js'
import { A, installAudio as installCore, isMuted, setMuted, setVolume, toggleMuted } from './core.js'
import * as sfx from './sfx.js'
import * as ambience from './ambience.js'

export { sfx, setVolume, setMuted, isMuted, toggleMuted }
export const falloff = ambience.falloff

export function installAudio() {
  installCore()
}

export const audioRunning = () => !!A.master && A.ctx.state === 'running'

// Per-frame state: { camera, player: { x, y, z, vy, grounded, speed }, surface, inDesert, fuse }
const prev = { grounded: true, vy: 0, init: false }
let stride = 0
const listener = { x: 0, z: 0, rightX: 1, rightZ: 0, inDesert: false, fuse: null }
export function updateAudio(dt, st) {
  if (!audioRunning()) return
  const p = st.player
  if (prev.init) {
    if (prev.grounded && !p.grounded && p.vy > 2) sfx.jump()
    if (!prev.grounded && p.grounded && prev.vy < -4) sfx.land(Math.min(1, -prev.vy / 18))
  }
  // Footsteps from distance walked on the ground (faster = more steps, a bit harder).
  if (p.grounded && p.speed > 1.2) {
    stride += p.speed * dt
    const len = AUDIO.footstepStride * (p.speed > 10 ? 1.35 : 1)
    if (stride >= len) {
      stride -= len
      sfx.step(st.surface, Math.min(1, p.speed / 14))
    }
  } else stride = AUDIO.footstepStride * 0.6 // first step lands soon after starting to move
  prev.grounded = p.grounded
  prev.vy = p.vy
  prev.init = true

  const e = st.camera.matrixWorld.elements // camera right vector = first column
  const rl = Math.hypot(e[0], e[2]) || 1
  listener.x = st.camera.position.x
  listener.z = st.camera.position.z
  listener.rightX = e[0] / rl
  listener.rightZ = e[2] / rl
  listener.inDesert = st.inDesert
  listener.fuse = st.fuse
  ambience.update(dt, listener)
}

// Level (0..1) and pan for a point source, as heard from the camera.
export function spatial(x, z, near) {
  const dx = x - listener.x
  const dz = z - listener.z
  const d = Math.hypot(dx, dz)
  return { gain: ambience.falloff(d, near), pan: ambience.panFor(dx, dz, d, listener) }
}
