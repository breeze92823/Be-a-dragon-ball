import { Euler, Quaternion } from 'three'
import { boxityEnv } from '../bloxity.js'

// Boxity emotes (docs: Emotes). The portal draws the picker and sends `play_emote` with the emote's
// catalogue id; the catalogue (`GET {apiUrl}/v1/avatar/emotes`) carries each emote's clip, so every
// emote works with the standard rig, including ones added after this game shipped. A clip is
// { len, loop, tracks: { bone: [[timeSec, xDeg, yDeg, zDeg], ...] } }: degree deltas over the bind
// pose, XYZ euler, smoothstep between keys. Unknown ids / bones are ignored, never an error.

const DEG = Math.PI / 180
let catalogue = null

async function loadCatalogue() {
  if (catalogue) return catalogue
  catalogue = fetch(`${boxityEnv().apiUrl}/v1/avatar/emotes`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => new Map((j?.emotes ?? []).map((e) => [e.id, e])))
    .catch(() => {
      catalogue = null // retry on the next emote
      return new Map()
    })
  return catalogue
}

// The clip of an emote id, or null.
export async function emoteClip(id) {
  const emote = (await loadCatalogue()).get(id)
  const clip = emote?.clip
  return clip && clip.tracks && clip.len > 0 ? clip : null
}

function sample(keys, t) {
  if (t <= keys[0][0]) return keys[0].slice(1)
  const last = keys[keys.length - 1]
  if (t >= last[0]) return last.slice(1)
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (t >= a[0] && t <= b[0]) {
      let s = (t - a[0]) / (b[0] - a[0])
      s = s * s * (3 - 2 * s)
      return [1, 2, 3].map((j) => a[j] + (b[j] - a[j]) * s)
    }
  }
  return null
}

// Plays one clip over a rig root (`root.nodes` / named bones). `owned` = bones the locomotion
// animator rewrites every frame (their current rotation already is bind * pose); the others are
// restored from the bind rotation captured here.
export class EmotePlayer {
  constructor(root, ownedBones) {
    this.root = root
    this.owned = new Set(ownedBones)
    this.clip = null
    this.time = 0
    this.bones = []
    this.q = new Quaternion()
    this.e = new Euler()
  }

  get active() {
    return !!this.clip
  }

  play(clip) {
    this.stop()
    const bones = []
    for (const name of Object.keys(clip.tracks)) {
      const bone = this.root.nodes?.[name] ?? this.root.getObjectByName?.(name)
      if (bone) bones.push({ name, bone, bind: bone.quaternion.clone(), keys: clip.tracks[name] })
    }
    if (!bones.length) return false
    this.clip = clip
    this.bones = bones
    this.time = 0
    return true
  }

  stop() {
    for (const b of this.bones) if (!this.owned.has(b.name)) b.bone.quaternion.copy(b.bind)
    this.clip = null
    this.bones = []
  }

  // After the locomotion pose was written for this frame.
  update(dt) {
    if (!this.clip) return
    this.time += dt
    const { len, loop } = this.clip
    if (!loop && this.time > len) return this.stop()
    const t = loop ? this.time % len : this.time
    for (const b of this.bones) {
      const v = sample(b.keys, t)
      if (!v) continue
      this.q.setFromEuler(this.e.set(v[0] * DEG, v[1] * DEG, v[2] * DEG, 'XYZ'))
      if (this.owned.has(b.name)) b.bone.quaternion.multiply(this.q)
      else b.bone.quaternion.copy(b.bind).multiply(this.q)
    }
  }
}
