import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'

// A tube along a curve whose radius varies along its length (radius(t), t 0..1),
// with closed, rounded ends. Used for the serpent's body (tail tapers to a point).
// `offset` shifts every ring (e.g. a belly strip running under the body).
export function taperTube(curve, segments, radial, radius, offset = null) {
  const frames = curve.computeFrenetFrames(segments, false)
  const pos = []
  const nor = []
  const uv = []
  const idx = []
  const p = new Vector3()
  const n = new Vector3()
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    curve.getPointAt(t, p)
    if (offset) p.add(offset)
    const r = radius(t)
    const N = frames.normals[i]
    const B = frames.binormals[i]
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      const s = Math.sin(a)
      const c = -Math.cos(a)
      n.set(c * N.x + s * B.x, c * N.y + s * B.y, c * N.z + s * B.z).normalize()
      pos.push(p.x + r * n.x, p.y + r * n.y, p.z + r * n.z)
      nor.push(n.x, n.y, n.z)
      uv.push(t * 8, j / radial)
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j
      const b = (i + 1) * (radial + 1) + j
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  // End caps: a fan to the curve point at each end.
  for (const [ring, t, flip] of [[0, 0, true], [segments, 1, false]]) {
    curve.getPointAt(t, p)
    if (offset) p.add(offset)
    const tan = curve.getTangentAt(t).multiplyScalar(flip ? -1 : 1)
    const centre = pos.length / 3
    pos.push(p.x + tan.x * radius(t) * 0.6, p.y + tan.y * radius(t) * 0.6, p.z + tan.z * radius(t) * 0.6)
    nor.push(tan.x, tan.y, tan.z)
    uv.push(t * 8, 0.5)
    for (let j = 0; j < radial; j++) {
      const a = ring * (radial + 1) + j
      if (flip) idx.push(centre, a + 1, a)
      else idx.push(centre, a, a + 1)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}
