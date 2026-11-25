import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SRGBColorSpace,
} from 'three'
import { paintSoftDot, paintSparkle } from './textures.js'

// One-shot effects (the looping ambient particles live in particles.js): pooled
// CPU particles for bursts that start, swirl and die (the orb transform puff,
// the hatch vortex, dust under a guardian's feet, sparkle trails), plus
// tumbling confetti. Each pool is ONE draw call; nothing is allocated per frame.
//
// Particle: position, velocity, gravity, drag, size (start -> end), colour,
// alpha curve, life, and an optional swirl (angular speed round a vertical axis
// through `cx, cz`, with a radial pull), which is what makes the hatch vortex.

const sharedViewport = { value: 800 }

const vertexShader = /* glsl */ `
  uniform float uViewport;
  attribute float aSize;
  attribute vec4 aColor;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * projectionMatrix[1][1] * 0.5 * uViewport / max(-mv.z, 0.1);
  }`
const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform float uBoost;
  varying vec4 vColor;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    float a = t.a * vColor.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor.rgb * t.rgb * uBoost, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`

class Pool {
  constructor(scene, max, { additive, sprite, boost = 1 }) {
    this.max = max
    this.n = 0 // live count (live particles are packed at the front)
    const f = (k) => new Float32Array(max * k)
    this.p = f(3)
    this.v = f(3)
    this.c = f(4) // r g b a(base)
    this.s = f(3) // size0 size1 currentSize
    this.life = f(2) // age, life
    this.phys = f(4) // gravity, drag, swirl, pull
    this.centre = f(2)
    this.fade = f(2) // fadeIn, fadeOut share of life
    this.geo = new BufferGeometry()
    this.aPos = new BufferAttribute(new Float32Array(max * 3), 3).setUsage(DynamicDrawUsage)
    this.aSize = new BufferAttribute(new Float32Array(max), 1).setUsage(DynamicDrawUsage)
    this.aColor = new BufferAttribute(new Float32Array(max * 4), 4).setUsage(DynamicDrawUsage)
    this.geo.setAttribute('position', this.aPos)
    this.geo.setAttribute('aSize', this.aSize)
    this.geo.setAttribute('aColor', this.aColor)
    this.geo.setDrawRange(0, 0)
    const tex = new CanvasTexture(sprite === 'sparkle' ? paintSparkle() : paintSoftDot())
    tex.colorSpace = SRGBColorSpace
    this.points = new Points(
      this.geo,
      new ShaderMaterial({
        uniforms: { map: { value: tex }, uViewport: sharedViewport, uBoost: { value: boost } },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: additive ? AdditiveBlending : NormalBlending,
      }),
    )
    this.points.frustumCulled = false
    this.points.renderOrder = additive ? 4 : 3
    scene.add(this.points)
  }

  // o: { x,y,z, vx,vy,vz, color, alpha, size, size1, life, gravity, drag, swirl, pull, cx, cz, fadeIn, fadeOut }
  spawn(o) {
    if (this.n >= this.max) return
    const i = this.n++
    this.p.set([o.x, o.y, o.z], i * 3)
    this.v.set([o.vx ?? 0, o.vy ?? 0, o.vz ?? 0], i * 3)
    tmp.set(o.color ?? '#ffffff')
    this.c.set([tmp.r, tmp.g, tmp.b, o.alpha ?? 1], i * 4)
    this.s.set([o.size ?? 0.3, o.size1 ?? o.size ?? 0.3, o.size ?? 0.3], i * 3)
    this.life.set([0, o.life ?? 1], i * 2)
    this.phys.set([o.gravity ?? 0, o.drag ?? 0, o.swirl ?? 0, o.pull ?? 0], i * 4)
    this.centre.set([o.cx ?? o.x, o.cz ?? o.z], i * 2)
    this.fade.set([o.fadeIn ?? 0.1, o.fadeOut ?? 0.45], i * 2)
  }

  kill(i) {
    const last = --this.n
    if (i === last) return
    const mv = (arr, k) => arr.copyWithin(i * k, last * k, last * k + k)
    mv(this.p, 3)
    mv(this.v, 3)
    mv(this.c, 4)
    mv(this.s, 3)
    mv(this.life, 2)
    mv(this.phys, 4)
    mv(this.centre, 2)
    mv(this.fade, 2)
  }

  update(dt) {
    const { p, v, c, s, life, phys, centre, fade } = this
    for (let i = 0; i < this.n; i++) {
      const age = (life[i * 2] += dt)
      const L = life[i * 2 + 1]
      if (age >= L) {
        this.kill(i)
        i--
        continue
      }
      const gravity = phys[i * 4]
      const drag = phys[i * 4 + 1]
      const swirl = phys[i * 4 + 2]
      const pull = phys[i * 4 + 3]
      const k = i * 3
      if (swirl || pull) {
        // Turn round the vertical axis through the centre and pull toward it.
        const dx = p[k] - centre[i * 2]
        const dz = p[k + 2] - centre[i * 2 + 1]
        const a = swirl * dt
        const ca = Math.cos(a)
        const sa = Math.sin(a)
        const shrink = Math.max(0, 1 - pull * dt)
        p[k] = centre[i * 2] + (dx * ca - dz * sa) * shrink
        p[k + 2] = centre[i * 2 + 1] + (dx * sa + dz * ca) * shrink
      }
      v[k + 1] -= gravity * dt
      if (drag) {
        const d = Math.exp(-drag * dt)
        v[k] *= d
        v[k + 1] *= d
        v[k + 2] *= d
      }
      p[k] += v[k] * dt
      p[k + 1] += v[k + 1] * dt
      p[k + 2] += v[k + 2] * dt
      const t = age / L
      s[k + 2] = s[k] + (s[k + 1] - s[k]) * t
    }
    // Upload.
    const pos = this.aPos.array
    const size = this.aSize.array
    const col = this.aColor.array
    for (let i = 0; i < this.n; i++) {
      pos[i * 3] = p[i * 3]
      pos[i * 3 + 1] = p[i * 3 + 1]
      pos[i * 3 + 2] = p[i * 3 + 2]
      size[i] = s[i * 3 + 2]
      const t = life[i * 2] / life[i * 2 + 1]
      const fi = fade[i * 2]
      const fo = fade[i * 2 + 1]
      const a = (fi > 0 ? Math.min(1, t / fi) : 1) * (fo > 0 ? Math.min(1, (1 - t) / fo) : 1)
      col[i * 4] = c[i * 4]
      col[i * 4 + 1] = c[i * 4 + 1]
      col[i * 4 + 2] = c[i * 4 + 2]
      col[i * 4 + 3] = c[i * 4 + 3] * a
    }
    this.geo.setDrawRange(0, this.n)
    if (this.n) {
      this.aPos.needsUpdate = true
      this.aSize.needsUpdate = true
      this.aColor.needsUpdate = true
    }
  }
}
const tmp = new Color()

// --- Confetti: tumbling coloured paper squares (one instanced mesh) -------------------
const CONFETTI = ['#ff4a4a', '#ffd23a', '#3fa2ff', '#5bff6a', '#ff7ad9', '#ffffff', '#c35bff', '#ff8a1f']
class Confetti {
  constructor(scene, max) {
    this.max = max
    this.n = 0
    this.items = []
    for (let i = 0; i < max; i++) this.items.push({ p: [0, 0, 0], v: [0, 0, 0], r: [0, 0, 0], w: [0, 0, 0], age: 0, life: 1 })
    const geo = new PlaneGeometry(0.22, 0.14)
    this.mesh = new InstancedMesh(geo, new MeshBasicMaterial({ side: DoubleSide, toneMapped: false }), max)
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(max * 3), 3)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
    this.dummy = new Object3D()
  }
  burst(x, y, z, count = 160, power = 9) {
    for (let k = 0; k < count && this.n < this.max; k++) {
      const it = this.items[this.n]
      const a = Math.random() * Math.PI * 2
      const up = 0.55 + Math.random() * 0.45
      const sp = power * (0.4 + Math.random() * 0.6)
      it.p = [x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6]
      it.v = [Math.cos(a) * sp * (1 - up) * 1.6, sp * up * 1.3, Math.sin(a) * sp * (1 - up) * 1.6]
      it.r = [Math.random() * 6, Math.random() * 6, Math.random() * 6]
      it.w = [(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14]
      it.age = 0
      it.life = 2.6 + Math.random() * 1.6
      tmp.set(CONFETTI[Math.floor(Math.random() * CONFETTI.length)])
      this.mesh.instanceColor.setXYZ(this.n, tmp.r, tmp.g, tmp.b)
      this.n++
    }
    this.mesh.instanceColor.needsUpdate = true
  }
  update(dt) {
    const d = this.dummy
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i]
      it.age += dt
      if (it.age >= it.life) {
        // swap with last (keep colour too)
        const last = --this.n
        if (i !== last) {
          const tail = this.items[last]
          this.items[last] = it
          this.items[i] = tail
          this.mesh.instanceColor.setXYZ(i, this.mesh.instanceColor.getX(last), this.mesh.instanceColor.getY(last), this.mesh.instanceColor.getZ(last))
          this.mesh.instanceColor.needsUpdate = true
        }
        i--
        continue
      }
      // Paper: strong air drag, flutters down slowly once its throw is spent.
      const drag = Math.exp(-2.2 * dt)
      it.v[0] *= drag
      it.v[2] *= drag
      it.v[1] = it.v[1] * drag - 9 * dt
      if (it.v[1] < -2.2) it.v[1] = -2.2
      it.p[0] += (it.v[0] + Math.sin(it.age * 5 + i) * 0.6) * dt
      it.p[1] += it.v[1] * dt
      it.p[2] += (it.v[2] + Math.cos(it.age * 4 + i) * 0.6) * dt
      it.r[0] += it.w[0] * dt
      it.r[1] += it.w[1] * dt
      it.r[2] += it.w[2] * dt
      d.position.set(it.p[0], Math.max(0.02, it.p[1]), it.p[2])
      d.rotation.set(it.r[0], it.r[1], it.r[2])
      const fade = Math.min(1, (it.life - it.age) / 0.5)
      d.scale.setScalar(fade)
      d.updateMatrix()
      this.mesh.setMatrixAt(i, d.matrix)
    }
    this.mesh.count = this.n
    if (this.n) this.mesh.instanceMatrix.needsUpdate = true
  }
}

let glowPool = null // additive sparkles / light
let smokePool = null // normal-blended smoke, dust, dark vortex
let confetti = null

export function installFx(scene) {
  glowPool = new Pool(scene, 1400, { additive: true, sprite: 'sparkle', boost: 2.2 })
  smokePool = new Pool(scene, 1400, { additive: false, sprite: 'dot' })
  confetti = new Confetti(scene, 420)
}

export const glow = (o) => glowPool?.spawn(o)
export const smoke = (o) => smokePool?.spawn(o)
export const confettiBurst = (x, y, z, n, power) => confetti?.burst(x, y, z, n, power)

export function updateFx(dt, viewportHeight) {
  sharedViewport.value = viewportHeight
  glowPool?.update(dt)
  smokePool?.update(dt)
  confetti?.update(dt)
}

// --- Ready-made bursts ---------------------------------------------------------------------
const R = (a, b) => a + Math.random() * (b - a)

// A soft white puff with sparkles (turning into / out of the orb).
export function puff(x, y, z, scale = 1, color = '#ffffff') {
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = R(1.5, 4) * scale
    smoke({ x: x + Math.cos(a) * 0.3, y: y + R(-0.3, 0.6), z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vy: R(0.5, 2.2), vz: Math.sin(a) * sp, color, alpha: 0.85, size: R(0.7, 1.2) * scale, size1: R(1.8, 2.6) * scale, life: R(0.55, 0.9), drag: 3.5, fadeIn: 0.05, fadeOut: 0.7 })
  }
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = R(2, 6) * scale
    glow({ x, y: y + R(0, 0.8), z, vx: Math.cos(a) * sp, vy: R(1, 5), vz: Math.sin(a) * sp, color: Math.random() < 0.5 ? '#fff6c8' : '#ffd0f0', size: R(0.25, 0.5) * scale, size1: 0.05, life: R(0.5, 1), gravity: 4, drag: 2 })
  }
}

// Dust kicked up by a heavy footstep.
export function dust(x, z, color = '#e8d09a', k = 1) {
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = R(1, 3) * k
    smoke({ x: x + Math.cos(a) * 0.4, y: 0.25, z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * sp, vy: R(0.3, 1.2), vz: Math.sin(a) * sp, color, alpha: 0.55, size: R(0.5, 0.9) * k, size1: R(1.4, 2.2) * k, life: R(0.6, 1.1), drag: 3, fadeIn: 0.05, fadeOut: 0.8 })
  }
}

// Burst of light (fighter appears, safe arrival).
export function flash(x, y, z, color = '#ffffff', n = 60, power = 7) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const e = R(-0.4, 1)
    const sp = R(0.4, 1) * power
    glow({ x, y, z, vx: Math.cos(a) * sp * Math.sqrt(1 - e * e), vy: e * sp, vz: Math.sin(a) * sp * Math.sqrt(1 - e * e), color: Math.random() < 0.4 ? '#ffffff' : color, size: R(0.3, 0.7), size1: 0.04, life: R(0.5, 1.1), gravity: 3, drag: 2.5 })
  }
  glow({ x, y, z, color: '#ffffff', size: 4, size1: 9, life: 0.35, fadeIn: 0, fadeOut: 0.9, alpha: 0.9 })
}
