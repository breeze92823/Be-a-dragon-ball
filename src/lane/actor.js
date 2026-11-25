import { Color, Group, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { buildFighter } from '../safezone/fighters.js'

// A hatched fighter as a living model: the same figurine the bases show, with
// its legs and arms swung procedurally (run cycle from ground speed, idle
// breathing, a little hop on landing). Used for the fighter the player runs
// as, the one carried in front of the avatar, and the ones standing on your
// base's slots. Materials are cloned so the hatch can show it as a black
// silhouette first (setSilhouette) without touching the shared cache.

const silhouette = new MeshBasicMaterial({ color: '#07040c' })

export class FighterActor {
  constructor(look, scale = 1) {
    this.root = new Group()
    this.model = buildFighter(this.root, look, 0, 0, 0, 0, scale)
    this.rig = this.model.userData.rig
    this.phase = 0
    this.time = Math.random() * 10
    this.lean = 0
    this.mats = []
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true
        o.material = o.material.clone()
        this.mats.push({ mesh: o, mat: o.material })
      }
    })
  }

  setSilhouette(on) {
    for (const m of this.mats) m.mesh.material = on ? silhouette : m.mat
  }

  // Brightens toward white (k 0..1): the flash as it hatches.
  setGlow(k, color = '#ffffff') {
    const c = _c.set(color)
    for (const m of this.mats) {
      if (m.mat instanceof MeshStandardMaterial) {
        m.mat.emissive.copy(c)
        m.mat.emissiveIntensity = k * 2
      }
    }
  }

  // speed m/s on the ground; mode: 'run' | 'idle' | 'carried' | 'pose'
  update(dt, speed = 0, mode = 'run') {
    this.time += dt
    const rig = this.rig
    const moving = mode === 'run' && speed > 0.6
    if (moving) this.phase += (speed / 3.0) * Math.PI * dt
    const amp = moving ? Math.min(1, speed / 9) : 0
    const sw = Math.sin(this.phase)
    const k = 1 - Math.exp(-14 * dt)
    for (let i = 0; i < 2; i++) {
      const leg = rig.legs[i]
      const sgn = i === 0 ? 1 : -1
      const want = mode === 'carried' ? Math.sin(this.time * 3 + i * Math.PI) * 0.18 : sgn * sw * 0.9 * amp
      leg.rotation.x += (want - leg.rotation.x) * k
    }
    for (const a of rig.arms) {
      const r = a.userData.rest
      let wx
      let wz
      let we
      if (moving) {
        // Arms pump against the legs, elbows bent (sprint form).
        wx = -r.side * sw * 1.0 * amp - 0.2
        wz = r.side * 0.12
        we = -1.3
      } else if (mode === 'carried') {
        wx = -0.5 + Math.sin(this.time * 2.4 + r.side) * 0.2
        wz = r.side * 0.5
        we = -0.6
      } else {
        // Back to its stance, breathing.
        wx = r.x + Math.sin(this.time * 1.6) * 0.04
        wz = r.z
        we = a.userData.fore.userData.rest
      }
      a.rotation.x += (wx - a.rotation.x) * k
      a.rotation.z += (wz - a.rotation.z) * k
      const fore = a.userData.fore
      fore.rotation.x += (we - fore.rotation.x) * k
    }
    // Lean into the run, bob with the stride, breathe at rest.
    const wantLean = moving ? 0.22 * amp : 0
    this.lean += (wantLean - this.lean) * k
    this.model.rotation.x = this.lean
    this.model.position.y = moving ? Math.abs(Math.cos(this.phase)) * 0.12 * amp : Math.sin(this.time * 1.6) * 0.015
  }
}
const _c = new Color()
