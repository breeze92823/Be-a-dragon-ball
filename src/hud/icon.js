import { AmbientLight, DirectionalLight, Group, PerspectiveCamera, Scene, WebGLRenderTarget } from 'three'
import { buildFighter } from '../safezone/fighters.js'

// Portrait icons for the hotbar: a fighter rendered once into a small offscreen
// target with the game's own renderer, read back and turned into a data URL
// (cached per fighter id). Render targets skip tone mapping and the sRGB
// output step, so the bytes are converted to sRGB here.

const SIZE = 128
export function createIconRenderer(renderer) {
  const scene = new Scene()
  scene.add(new AmbientLight('#ffffff', 1.4))
  const key = new DirectionalLight('#ffffff', 2.4)
  key.position.set(2, 4, 5)
  scene.add(key)
  const camera = new PerspectiveCamera(30, 1, 0.1, 50)
  camera.position.set(0.4, 1.5, 6.2)
  camera.lookAt(0, 1.35, 0)
  const rt = new WebGLRenderTarget(SIZE, SIZE)
  const buf = new Uint8Array(SIZE * SIZE * 4)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  const cache = new Map()
  const toSrgb = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    const c = i / 255
    toSrgb[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055))
  }

  return function icon(fighter) {
    if (cache.has(fighter.id)) return cache.get(fighter.id)
    const g = new Group()
    buildFighter(g, fighter.look, 0, 0, 0, 0.35, 1)
    scene.add(g)
    const prevTarget = renderer.getRenderTarget()
    const prevAlpha = renderer.getClearAlpha()
    renderer.setRenderTarget(rt)
    renderer.setClearAlpha(0)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, buf)
    renderer.setRenderTarget(prevTarget)
    renderer.setClearAlpha(prevAlpha)
    scene.remove(g)
    const img = ctx.createImageData(SIZE, SIZE)
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const s = ((SIZE - 1 - y) * SIZE + x) * 4 // flip: GL rows start at the bottom
        const d = (y * SIZE + x) * 4
        img.data[d] = toSrgb[buf[s]]
        img.data[d + 1] = toSrgb[buf[s + 1]]
        img.data[d + 2] = toSrgb[buf[s + 2]]
        img.data[d + 3] = buf[s + 3]
      }
    }
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.putImageData(img, 0, 0)
    const url = canvas.toDataURL('image/png')
    cache.set(fighter.id, url)
    return url
  }
}
