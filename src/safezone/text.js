import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Uint32BufferAttribute,
} from 'three'

// All text in the safe zone. Static text is painted once into shared atlas
// pages (2048 px canvases), so hundreds of signs and labels cost one texture
// and one draw call per page instead of one each:
//  - SignAtlas: flat text panels (board lists, sign faces, floor decals); their
//    planes are baked together with the model they sit on
//  - LabelBatch: floating billboard labels (shop titles, fighter name /
//    rarity / income) drawn by a tiny shader that turns each quad to face the
//    camera on the GPU and fades it out past `far` metres; one mesh per page
//  - DynLabel: the few labels whose text changes (countdowns), own small canvas

export const FONT = (px, weight = 700) => `${weight} ${px}px Fredoka, "Arial Black", sans-serif`

// Outlined text. fill: colour or [top, bottom] vertical gradient.
export function strokeText(ctx, text, x, y, px, fill, { outline = '#0b1a3a', ow = px * 0.18, align = 'center', maxW = 0, weight = 700 } = {}) {
  ctx.font = FONT(px, weight)
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.save()
  const w = ctx.measureText(text).width
  if (maxW && w > maxW) {
    // Squeeze long text horizontally instead of overflowing its box.
    const k = maxW / w
    const ax = align === 'left' ? x : align === 'right' ? x : x
    ctx.translate(ax, 0)
    ctx.scale(k, 1)
    ctx.translate(-ax, 0)
  }
  if (outline) {
    ctx.lineWidth = ow
    ctx.strokeStyle = outline
    ctx.strokeText(text, x, y)
  }
  if (Array.isArray(fill)) {
    const g = ctx.createLinearGradient(0, y - px / 2, 0, y + px / 2)
    g.addColorStop(0, fill[0])
    g.addColorStop(1, fill[1])
    ctx.fillStyle = g
  } else ctx.fillStyle = fill
  ctx.fillText(text, x, y)
  ctx.restore()
  return w
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// --- Atlas pages -------------------------------------------------------------------
class Page {
  constructor(size) {
    this.size = size
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.canvas.height = size
    this.ctx = this.canvas.getContext('2d')
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.anisotropy = 4
    this.x = 0
    this.y = 0
    this.row = 0
  }
  // Shelf packing with a gutter so mipmaps never bleed between cells.
  alloc(w, h) {
    const g = 8
    if (w + g > this.size || h + g > this.size) return null
    if (this.x + w + g > this.size) {
      this.x = 0
      this.y += this.row + g
      this.row = 0
    }
    if (this.y + h + g > this.size) return null
    const r = { x: this.x + g / 2, y: this.y + g / 2, w, h }
    this.x += w + g
    this.row = Math.max(this.row, h)
    return r
  }
  uv(r) {
    const s = this.size
    return [r.x / s, 1 - (r.y + r.h) / s, (r.x + r.w) / s, 1 - r.y / s]
  }
}

class Atlas {
  constructor(size) {
    this.size = size
    this.pages = []
  }
  // Paints `painter(ctx, w, h)` into a free w x h cell; returns { page, uv }.
  paint(w, h, painter) {
    w = Math.ceil(Math.min(w, this.size - 8))
    h = Math.ceil(Math.min(h, this.size - 8))
    let page = this.pages[this.pages.length - 1]
    let r = page?.alloc(w, h)
    if (!r) {
      page = new Page(this.size)
      this.pages.push(page)
      this.onPage?.(page)
      r = page.alloc(w, h)
    }
    const ctx = page.ctx
    ctx.save()
    ctx.beginPath()
    ctx.rect(r.x, r.y, r.w, r.h)
    ctx.clip()
    ctx.translate(r.x, r.y)
    painter(ctx, w, h)
    ctx.restore()
    page.texture.needsUpdate = true
    return { page, uv: page.uv(r) }
  }
}

// --- Flat sign panels ----------------------------------------------------------------
export class SignAtlas extends Atlas {
  constructor(size = 2048) {
    super(size)
    this.onPage = (page) => {
      page.material = new MeshBasicMaterial({
        map: page.texture,
        transparent: true,
        alphaTest: 0.02,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
      })
    }
  }
  // A wm x hm metre plane showing a pw x ph px painted cell, facing +Z before rotation.
  // `key`: cells painted under the same key are painted once and shared.
  plane(parent, wm, hm, pw, ph, painter, x, y, z, ry = 0, rx = 0, key = null) {
    this.cells ??= new Map()
    let cell = key && this.cells.get(key)
    if (!cell) {
      cell = this.paint(pw, ph, painter)
      if (key) this.cells.set(key, cell)
    }
    const { page, uv } = cell
    const g = new PlaneGeometry(wm, hm)
    const a = g.attributes.uv
    for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]))
    const m = new Mesh(g, page.material)
    m.rotation.order = 'YXZ'
    m.rotation.set(rx, ry, 0)
    m.position.set(x, y, z)
    m.renderOrder = 1
    parent.add(m)
    return m
  }
}

// --- Billboard labels ------------------------------------------------------------------
const billboardVertex = /* glsl */ `
  attribute vec2 corner;
  uniform float uFar;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    mv.xy += corner;
    gl_Position = projectionMatrix * mv;
    vFade = 1.0 - smoothstep(uFar * 0.75, uFar, -mv.z);
  }`
const billboardFragment = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vec4 c = texture2D(map, vUv);
    c.a *= vFade;
    if (c.a < 0.03) discard;
    gl_FragColor = c;
    #include <colorspace_fragment>
  }`

// lines: [{ t, px, color, outline, ow, gap }] stacked top to bottom, centred.
function measure(lines) {
  const c = measure.ctx ?? (measure.ctx = document.createElement('canvas').getContext('2d'))
  let w = 0
  let h = 0
  for (const l of lines) {
    c.font = FONT(l.px)
    w = Math.max(w, c.measureText(l.t).width + (l.ow ?? l.px * 0.18) + 8)
    h += l.px * 1.08 + (l.gap ?? 0)
  }
  return { w: Math.ceil(w + 8), h: Math.ceil(h + 10) }
}
export function paintLines(ctx, lines, w) {
  let y = 5
  for (const l of lines) {
    const lh = l.px * 1.08
    strokeText(ctx, l.t, w / 2, y + lh / 2, l.px, l.color ?? '#ffffff', { outline: l.outline ?? '#0b1a3a', ow: l.ow ?? l.px * 0.18 })
    y += lh + (l.gap ?? 0)
  }
}

// Floating name labels (fighters, base owners) live on this camera layer so the Settings
// window's Overhead Name Toggle hides them all at no cost (camera.layers, ui/settings.js).
export const OVERHEAD_LAYER = 3
export const markOverhead = (obj) => obj.layers.set(OVERHEAD_LAYER)

export class LabelBatch extends Atlas {
  constructor(scene, { far = 90, size = 2048, overhead = false } = {}) {
    super(size)
    this.scene = scene
    this.far = far
    this.overhead = overhead
    this.quads = new Map() // page -> arrays
    this.meshes = []
  }
  // Floating label with its bottom centre at (x, y, z), `height` metres tall.
  add(lines, x, y, z, height) {
    const { w, h } = measure(lines)
    const { page, uv } = this.paint(w, h, (ctx) => paintLines(ctx, lines, w))
    const hw = (height * w) / h / 2
    const hh = height / 2
    let q = this.quads.get(page)
    if (!q) this.quads.set(page, (q = { pos: [], corner: [], uv: [], n: 0 }))
    const cy = y + hh
    for (const [cx, cyy, u, v] of [[-hw, -hh, uv[0], uv[1]], [hw, -hh, uv[2], uv[1]], [hw, hh, uv[2], uv[3]], [-hw, hh, uv[0], uv[3]]]) {
      q.pos.push(x, cy, z)
      q.corner.push(cx, cyy)
      q.uv.push(u, v)
    }
    q.n++
  }
  // Builds one mesh per atlas page. Call once after every add().
  build() {
    for (const [page, q] of this.quads) {
      const g = new BufferGeometry()
      g.setAttribute('position', new Float32BufferAttribute(q.pos, 3))
      g.setAttribute('corner', new Float32BufferAttribute(q.corner, 2))
      g.setAttribute('uv', new Float32BufferAttribute(q.uv, 2))
      const idx = []
      for (let i = 0; i < q.n; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3)
      g.setIndex(new Uint32BufferAttribute(idx, 1))
      const mat = new ShaderMaterial({
        uniforms: { map: { value: page.texture }, uFar: { value: this.far } },
        vertexShader: billboardVertex,
        fragmentShader: billboardFragment,
        transparent: true,
        depthWrite: false,
        fog: false,
      })
      const m = new Mesh(g, mat)
      m.frustumCulled = false // quads are expanded in the shader; centres alone would cull wrongly
      m.renderOrder = 3
      if (this.overhead) markOverhead(m)
      this.scene.add(m)
      this.meshes.push(m)
    }
  }
}

// --- Labels whose text changes ----------------------------------------------------------
export class DynLabel {
  constructor(pw, ph, height, painter) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = pw
    this.canvas.height = ph
    this.ctx = this.canvas.getContext('2d')
    this.painter = painter
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.sprite = new Sprite(new SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false, fog: false }))
    this.sprite.scale.set((height * pw) / ph, height, 1)
    this.sprite.renderOrder = 3
    markOverhead(this.sprite) // floating text over a fighter / spot (plane() text stays on layer 0)
    this.value = null
  }
  // A fixed plane (facing +Z) showing the same canvas, for text mounted on a model.
  plane(w, h) {
    const m = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    )
    m.renderOrder = 2
    return m
  }
  set(value) {
    if (value === this.value) return
    this.value = value
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.painter(this.ctx, this.canvas.width, this.canvas.height, value)
    this.texture.needsUpdate = true
  }
}

// Short money / big-number format used on every sign: 1500 -> 1.5K, 2.3e12 -> 2.3T ...
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc']
export function short(n) {
  let i = 0
  while (n >= 1000 && i < SUFFIX.length - 1) {
    n /= 1000
    i++
  }
  const s = n >= 100 || i === 0 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, '')
  return s + SUFFIX[i]
}
