import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
} from 'three'
import { SAFE_ZONE } from '../config.js'
import { bake } from '../bake.js'
import { heightToNormal } from '../textures.js'
import { RAPIER, addFixed } from '../physics.js'

// Building kit for the safe zone. Every model here is assembled from these
// helpers so the whole area stays cheap to draw:
//  - materials come from one cache (same look = same material object), so
//    `bake` can merge a whole set piece into one mesh per colour
//  - primitive geometries are shared (unit box scaled, cached cylinders...)
//  - studded plastic uses ONE neutral albedo + normal texture pair tinted by
//    the material colour, with world-scaled UVs (1 UV unit = SAFE_ZONE.tile m),
//    so the pattern is the same size on every surface and never stretches
//  - z-fighting rule: no two faces are ever coplanar. Trims stick out of what
//    they trim, decals float >= 2 cm above their surface AND use polygonOffset.

export const TILE = SAFE_ZONE.tile
export const DECAL_LIFT = 0.025

// --- Studded plastic texture ------------------------------------------------------
// 8 m tile: a 2x2 checker of 4 m squares (two shades), each split into 1 m
// cells with a bevelled groove and the little "L" moulding mark of toy bricks.
// Near-white so the material colour tints it without darkening.
let studTex = null
function studTextures() {
  if (studTex) return studTex
  const size = 512
  const cell = size / TILE // px per metre
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const h = document.createElement('canvas') // height field for the normal map
  h.width = h.height = size
  const hx = h.getContext('2d')
  hx.fillStyle = '#808080'
  hx.fillRect(0, 0, size, size)
  for (let sy = 0; sy < 2; sy++) {
    for (let sx = 0; sx < 2; sx++) {
      ctx.fillStyle = (sx + sy) % 2 ? '#f1f1f1' : '#ffffff'
      ctx.fillRect(sx * size / 2, sy * size / 2, size / 2, size / 2)
    }
  }
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const px = x * cell
      const py = y * cell
      // Bevel: light top-left edge, dark bottom-right edge (reads as a raised tile).
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(px, py, cell, 2)
      ctx.fillRect(px, py, 2, cell)
      ctx.fillStyle = 'rgba(0,0,0,0.08)'
      ctx.fillRect(px, py + cell - 2, cell, 2)
      ctx.fillRect(px + cell - 2, py, 2, cell)
      // The "L" mark.
      ctx.strokeStyle = 'rgba(0,0,0,0.075)'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(px + cell * 0.4, py + cell * 0.36)
      ctx.lineTo(px + cell * 0.4, py + cell * 0.6)
      ctx.lineTo(px + cell * 0.58, py + cell * 0.6)
      ctx.stroke()
      hx.strokeStyle = '#686868'
      hx.lineWidth = 3
      hx.lineCap = 'round'
      hx.beginPath()
      hx.moveTo(px + cell * 0.4, py + cell * 0.36)
      hx.lineTo(px + cell * 0.4, py + cell * 0.6)
      hx.lineTo(px + cell * 0.58, py + cell * 0.6)
      hx.stroke()
      hx.fillStyle = '#6a6a6a'
      hx.fillRect(px, py, cell, 2)
      hx.fillRect(px, py, 2, cell)
    }
  }
  const data = hx.getImageData(0, 0, size, size).data
  const heights = new Float32Array(size * size)
  for (let i = 0; i < heights.length; i++) heights[i] = data[i * 4] / 255
  const normalCanvas = heightToNormal(heights, size, 3)
  const wrap = (canvas, srgb) => {
    const t = new CanvasTexture(canvas)
    t.wrapS = t.wrapT = RepeatWrapping
    t.anisotropy = 8
    t.minFilter = LinearMipmapLinearFilter
    if (srgb) t.colorSpace = SRGBColorSpace
    return t
  }
  studTex = { map: wrap(c, true), normal: wrap(normalCanvas, false) }
  return studTex
}

// --- Materials (cached) ----------------------------------------------------------------
const mats = new Map()
// opts: studs, rough, metal, emissive, ei (emissive intensity), opacity, double, flat, basic, toneMapped
export function M(color, opts = {}) {
  const key = color + JSON.stringify(opts)
  let m = mats.get(key)
  if (m) return m
  if (opts.basic) {
    m = new MeshBasicMaterial({ color, transparent: opts.opacity != null, opacity: opts.opacity ?? 1, side: opts.double ? DoubleSide : 0, toneMapped: opts.toneMapped ?? true, depthWrite: opts.opacity == null })
  } else {
    m = new MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.55,
      metalness: opts.metal ?? 0,
      flatShading: !!opts.flat,
      side: opts.double ? DoubleSide : 0,
    })
    if (opts.emissive) {
      m.emissive.set(opts.emissive)
      m.emissiveIntensity = opts.ei ?? 1
    }
    if (opts.opacity != null) {
      m.transparent = true
      m.opacity = opts.opacity
      m.depthWrite = false
    }
    if (opts.studs) {
      const t = studTextures()
      m.map = t.map
      m.normalMap = t.normal
      m.normalScale = new Vector2(0.45, 0.45)
    }
  }
  m.userData.studs = !!opts.studs
  mats.set(key, m)
  return m
}
export const S = (color, opts = {}) => M(color, { ...opts, studs: true }) // studded plastic

// --- Geometry -------------------------------------------------------------------------
const unitBox = new BoxGeometry(1, 1, 1)
// Box with UVs in metres / TILE (faces px, nx, py, ny, pz, nz).
function studBox(w, h, d) {
  const g = new BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / TILE, (uv.getY(k) * dims[f][1]) / TILE)
    }
  }
  return g
}

function place(mesh, parent, x, y, z, rx, ry, rz) {
  mesh.position.set(x, y, z)
  mesh.rotation.set(rx, ry, rz)
  parent.add(mesh)
  return mesh
}

// Box standing on y (bottom face at y).
export function box(parent, m, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) {
  return boxC(parent, m, w, h, d, x, y + h / 2, z, ry, rx, rz)
}
// Box centred at (x, y, z).
export function boxC(parent, m, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) {
  let mesh
  if (m.userData.studs) mesh = new Mesh(studBox(w, h, d), m)
  else {
    mesh = new Mesh(unitBox, m)
    mesh.scale.set(w, h, d)
  }
  return place(mesh, parent, x, y, z, rx, ry, rz)
}

const geoCache = new Map()
function cached(key, make) {
  let g = geoCache.get(key)
  if (!g) geoCache.set(key, (g = make()))
  return g
}
// Cylinder standing on y.
export function cyl(parent, m, rTop, rBot, h, x, y, z, seg = 20, ry = 0, rx = 0, rz = 0) {
  const g = cached(`c${rTop},${rBot},${h},${seg}`, () => new CylinderGeometry(rTop, rBot, h, seg))
  return place(new Mesh(g, m), parent, x, y + h / 2, z, rx, ry, rz)
}
// Cylinder centred at (x, y, z).
export function cylC(parent, m, rTop, rBot, h, x, y, z, seg = 20, ry = 0, rx = 0, rz = 0) {
  const g = cached(`c${rTop},${rBot},${h},${seg}`, () => new CylinderGeometry(rTop, rBot, h, seg))
  return place(new Mesh(g, m), parent, x, y, z, rx, ry, rz)
}
export function cone(parent, m, r, h, x, y, z, seg = 12, ry = 0, rx = 0, rz = 0) {
  const g = cached(`k${r},${h},${seg}`, () => new ConeGeometry(r, h, seg))
  return place(new Mesh(g, m), parent, x, y, z, rx, ry, rz)
}
export function ball(parent, m, r, x, y, z, ws = 20, hs = 14) {
  const g = cached(`s${r},${ws},${hs}`, () => new SphereGeometry(r, ws, hs))
  return place(new Mesh(g, m), parent, x, y, z, 0, 0, 0)
}
// Anything else: caller-made geometry.
export function mesh(parent, geo, m, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  return place(new Mesh(geo, m), parent, x, y, z, rx, ry, rz)
}

// --- Baking ---------------------------------------------------------------------------
// Merges a built group into one mesh per material and puts it at the group's transform.
export function bakeInto(scene, group, castShadow = true) {
  const parent = new Group()
  parent.position.copy(group.position)
  parent.rotation.copy(group.rotation)
  group.position.set(0, 0, 0)
  group.rotation.set(0, 0, 0)
  const out = bake(group, castShadow)
  out.traverse((o) => {
    if (!o.isMesh) return
    o.receiveShadow = !o.material.transparent
    if (o.material.transparent) o.castShadow = false
    o.geometry.computeBoundingSphere()
  })
  parent.add(out)
  scene.add(parent)
  return parent
}

// --- Colliders --------------------------------------------------------------------------
const yawQuat = (yaw) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
// Fixed box: half extents, centre, yaw.
export function solid(hx, hy, hz, x, y, z, yaw = 0) {
  addFixed(RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x, y, z }, yaw ? yawQuat(yaw) : null)
}
// Fixed box from a local box (w, h, d at x, bottom y, z) inside a frame at (ox, oz) turned by yaw.
export function solidLocal(frame, w, h, d, x, y, z, yaw = 0) {
  const c = Math.cos(frame.yaw)
  const s = Math.sin(frame.yaw)
  const wx = frame.x + x * c + z * s
  const wz = frame.z - x * s + z * c
  solid(w / 2, h / 2, d / 2, wx, (frame.y ?? 0) + y + h / 2, wz, frame.yaw + yaw)
}
// Inclined walkable ramp: from (x0,y0) to (x1,y1) along local x, width d, at local z.
export function solidRamp(frame, x0, y0, x1, y1, z, d) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const pitch = Math.atan2(y1 - y0, x1 - x0)
  const c = Math.cos(frame.yaw)
  const s = Math.sin(frame.yaw)
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2 - 0.15
  const wx = frame.x + mx * c + z * s
  const wz = frame.z - mx * s + z * c
  // Rotation = yaw about Y, then roll about local Z (raises +x end).
  const qy = yawQuat(frame.yaw)
  const qz = { x: 0, y: 0, z: Math.sin(pitch / 2), w: Math.cos(pitch / 2) }
  const q = {
    w: qy.w * qz.w - qy.x * qz.x - qy.y * qz.y - qy.z * qz.z,
    x: qy.w * qz.x + qy.x * qz.w + qy.y * qz.z - qy.z * qz.y,
    y: qy.w * qz.y - qy.x * qz.z + qy.y * qz.w + qy.z * qz.x,
    z: qy.w * qz.z + qy.x * qz.y - qy.y * qz.x + qy.z * qz.w,
  }
  addFixed(RAPIER.ColliderDesc.cuboid(len / 2, 0.15, d / 2), { x: wx, y: (frame.y ?? 0) + my, z: wz }, q)
}

// --- Flat decals ------------------------------------------------------------------------
// A plane lying on the ground (texture top toward -Z when yaw = 0), lifted DECAL_LIFT.
const flatPlane = new PlaneGeometry(1, 1)
export function groundDecal(parent, material, w, d, x, y, z, yaw = 0) {
  const m = new Mesh(flatPlane, material)
  m.scale.set(w, d, 1)
  m.rotation.order = 'YXZ' // lay flat (X), then turn (Y)
  m.rotation.set(-Math.PI / 2, yaw, 0)
  m.position.set(x, y + DECAL_LIFT, z)
  m.renderOrder = 1
  parent.add(m)
  return m
}
// Decal material: unlit, transparent, pulled toward the camera in the depth buffer.
export function decalMaterial(map, opts = {}) {
  return new MeshBasicMaterial({
    map,
    color: opts.color ?? '#ffffff',
    transparent: true,
    opacity: opts.opacity ?? 1,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    blending: opts.blending ?? 1,
  })
}

export const deg = (d) => (d * Math.PI) / 180
