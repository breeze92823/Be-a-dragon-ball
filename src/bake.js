import { BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// --- Baking: as few meshes as possible ----------------------------------------------
// Props are built from many small meshes (a palm is ~20); merging them keeps a
// set piece to a handful of draw calls (mobile).
//
// With `vertexColors` (the default), every opaque, non-glowing standard
// material is folded into its geometry as a vertex colour, and meshes then
// merge by surface type only (roughness / metalness / shading / texture), so a
// figurine with 12 colours costs the same single draw as a grey box. Anything
// transparent, emissive or otherwise special keeps its own material and merges
// with the meshes that share it.
const matKey = (m) => [m.type, m.color?.getHexString(), m.emissive?.getHexString(), m.vertexColors, m.side, m.flatShading, m.transparent, m.opacity, m.blending, m.map?.uuid, m.roughness, m.metalness, m.userData.k, m.emissiveIntensity].join('|')

const foldable = (m) => m.isMeshStandardMaterial && !m.transparent && !m.vertexColors && m.emissive.r + m.emissive.g + m.emissive.b === 0 && !m.emissiveMap
// Roughness / metalness are bucketed (quarters / halves): the eye can't tell 0.45 from 0.5,
// and every distinct value would be another draw call.
const qRough = (r) => Math.max(0.25, Math.round(r * 4) / 4)
const qMetal = (m) => Math.round(m * 2) / 2
const surfaceKey = (m) => ['vc', qRough(m.roughness), qMetal(m.metalness), m.flatShading, m.side, m.map?.uuid ?? '', m.normalMap?.uuid ?? ''].join('|')
const surfaceMats = new Map() // shared across bakes so every set piece reuses the same few materials
function surfaceMaterial(m) {
  const key = surfaceKey(m)
  let s = surfaceMats.get(key)
  if (!s) {
    s = new MeshStandardMaterial({ vertexColors: true, roughness: qRough(m.roughness), metalness: qMetal(m.metalness), flatShading: m.flatShading, side: m.side, map: m.map, normalMap: m.normalMap })
    if (m.normalMap) s.normalScale.copy(m.normalScale)
    surfaceMats.set(key, s)
  }
  return s
}

function withColor(geo, color) {
  const n = geo.attributes.position.count
  const c = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    c[i * 3] = color.r
    c[i * 3 + 1] = color.g
    c[i * 3 + 2] = color.b
  }
  geo.setAttribute('color', new BufferAttribute(c, 3))
  return geo
}

const rel = new Matrix4()
export function bake(root, castShadow = false, { vertexColors = true } = {}) {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  const groups = new Map() // key -> { mat, geos }
  const out = new Group()
  root.traverse((o) => {
    if (!o.isMesh) return
    rel.multiplyMatrices(inv, o.matrixWorld)
    if (Array.isArray(o.material)) {
      out.add(new Mesh(o.geometry.clone().applyMatrix4(rel), o.material)) // multi-material: kept as is
      return
    }
    let mat = o.material
    let geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(rel)
    if (vertexColors && foldable(mat)) {
      geo = withColor(geo, mat.color)
      mat = surfaceMaterial(mat)
    }
    const key = mat.vertexColors && surfaceMats.has(surfaceKey(mat)) ? 'vc:' + surfaceKey(mat) : matKey(mat)
    let e = groups.get(key)
    if (!e) groups.set(key, (e = { mat, geos: [] }))
    e.geos.push(geo)
  })
  for (const { mat, geos } of groups.values()) {
    const names = Object.keys(geos[0].attributes).filter((n) => geos.every((g) => g.attributes[n]))
    for (const g of geos) {
      for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n)
      g.morphAttributes = {}
      g.clearGroups()
    }
    const merged = mergeGeometries(geos)
    for (const g of geos) g.dispose()
    if (merged) out.add(new Mesh(merged, mat))
  }
  out.traverse((o) => {
    if (o.isMesh) o.castShadow = castShadow
  })
  return out
}
