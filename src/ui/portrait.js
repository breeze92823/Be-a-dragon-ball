import { AmbientLight, Color, DirectionalLight, Group, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Scene, WebGLRenderTarget } from 'three'
import { buildFighter } from '../safezone/fighters.js'

// Fighter portraits for the windows (Index cards, rewards): the procedural figurine rendered
// once into a small offscreen target with the game's own renderer, read back, converted to sRGB
// (render targets skip the output conversion) and kept as a data URL per key. Requests queue up
// and are drawn a couple per frame (pump(), from the ui update), so opening the Index never
// stalls a frame. Undiscovered Index entries render as a flat black silhouette; Golden ones in
// gold; other mutations are lit in their colour.

const SIZE = 128
const PER_FRAME = 2

export function createPortraits(renderer) {
  const scene = new Scene()
  const ambient = new AmbientLight('#ffffff', 1.4)
  const key = new DirectionalLight('#ffffff', 2.4)
  key.position.set(2, 4, 5)
  const rim = new DirectionalLight('#ffffff', 0)
  rim.position.set(-3, 2, -4)
  scene.add(ambient, key, rim)
  const camera = new PerspectiveCamera(30, 1, 0.1, 50)
  camera.position.set(0.4, 1.45, 6.4)
  camera.lookAt(0, 1.3, 0)
  const rt = new WebGLRenderTarget(SIZE, SIZE)
  const buf = new Uint8Array(SIZE * SIZE * 4)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(SIZE, SIZE)
  const toSrgb = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    const c = i / 255
    toSrgb[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055))
  }
  const black = new MeshBasicMaterial({ color: '#000000' })
  const gold = new MeshStandardMaterial({ color: '#ffc21f', metalness: 0.6, roughness: 0.32, emissive: '#5a3a00' })
  const cache = new Map() // key -> data URL
  const queue = [] // { key, look, mode, mutation, resolve }
  const pending = new Map() // key -> promise

  function draw({ look, mode, mutation }) {
    const g = new Group()
    const mat = mode === 'silhouette' ? black : mutation?.name === 'Golden' ? gold : null
    buildFighter(g, look, 0, 0, 0, 0.35, 1, mat)
    scene.add(g)
    const tint = mode !== 'silhouette' && mutation && mutation.name !== 'Golden'
    ambient.color.set(tint ? new Color('#ffffff').lerp(new Color(mutation.color), 0.55) : '#ffffff')
    rim.color.set(tint ? mutation.color : '#ffffff')
    rim.intensity = tint ? 3 : 0
    const prevTarget = renderer.getRenderTarget()
    const prevAlpha = renderer.getClearAlpha()
    renderer.setRenderTarget(rt)
    renderer.setClearAlpha(0)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, buf)
    renderer.setRenderTarget(prevTarget)
    renderer.setClearAlpha(prevAlpha)
    scene.remove(g) // geometry + materials are kit.js's shared caches: nothing to dispose
    // Bottom-up rows -> top-down, linear -> sRGB.
    const d = image.data
    for (let y = 0; y < SIZE; y++) {
      const src = (SIZE - 1 - y) * SIZE * 4
      const dst = y * SIZE * 4
      for (let x = 0; x < SIZE * 4; x += 4) {
        d[dst + x] = toSrgb[buf[src + x]]
        d[dst + x + 1] = toSrgb[buf[src + x + 1]]
        d[dst + x + 2] = toSrgb[buf[src + x + 2]]
        d[dst + x + 3] = buf[src + x + 3]
      }
    }
    ctx.putImageData(image, 0, 0)
    return canvas.toDataURL('image/png')
  }

  return {
    // Promise<data URL> for a fighter look. mode 'color' | 'silhouette'; mutation = MUTATIONS entry.
    get(key, look, mode = 'color', mutation = null) {
      if (cache.has(key)) return Promise.resolve(cache.get(key))
      if (pending.has(key)) return pending.get(key)
      const p = new Promise((resolve) => queue.push({ key, look, mode, mutation, resolve }))
      pending.set(key, p)
      return p
    },
    // Fills an <img> (once its portrait is ready).
    into(img, key, look, mode, mutation) {
      img.dataset.key = key
      const cached = cache.get(key)
      if (cached) return void (img.src = cached)
      this.get(key, look, mode, mutation).then((url) => {
        if (img.dataset.key === key) img.src = url
      })
    },
    pump() {
      for (let n = 0; n < PER_FRAME && queue.length; n++) {
        const job = queue.shift()
        let url = ''
        try {
          url = draw(job)
        } catch (err) {
          console.warn('[ui] portrait failed', err)
        }
        cache.set(job.key, url)
        pending.delete(job.key)
        job.resolve(url)
      }
    },
  }
}
