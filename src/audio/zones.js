// Each lane zone's sound bed, on the ambience bus (so Mute Music silences it too) and kept
// quiet so the music and the giants sit on top: a filtered noise bed + a low drone that glide
// to the zone's settings, plus sparse little events (birds and insects in the jungle, cracking
// ice, glass chimes in the crystal vault, bubbling lava, distant taiko, wind chimes under the
// sakura, sci-fi twinkles in space, crickets and drips in the ruins).
//
// setLaneZone(kind) is called every frame by the lane with the current zone's theme
// (ZONES[i].props, or null in the safe zone); it also advances the event scheduler, so this
// module needs no hook of its own in updateAudio.
import { A, onStart, voice } from './core.js'
import { burst, tone, modal, bubbles, crinkle, rnd, pick } from './synth.js'

// bed: noise filter (type, f, q) + level; drone: Hz + level; every: [min, max] s between events.
const BEDS = {
  desert: { bed: ['bandpass', 1800, 0.6, 0.006], drone: [0, 0], every: [5, 9] },
  jungle: { bed: ['bandpass', 4200, 1.2, 0.012], drone: [0, 0], every: [0.8, 2.2] },
  ice: { bed: ['bandpass', 800, 3, 0.03], drone: [0, 0], every: [3, 6] },
  crystal: { bed: ['highpass', 6000, 0.7, 0.004], drone: [110, 0.012], every: [2, 4] },
  gold: { bed: ['highpass', 7000, 0.7, 0.004], drone: [0, 0], every: [2.5, 5] },
  lava: { bed: ['lowpass', 220, 0.8, 0.05], drone: [41, 0.03], every: [0.8, 2] },
  spikes: { bed: ['lowpass', 400, 0.8, 0.015], drone: [55, 0.02], every: [4, 7] },
  marble: { bed: ['bandpass', 900, 1.5, 0.015], drone: [0, 0], every: [4, 8] },
  rainbow: { bed: ['highpass', 5000, 0.7, 0.004], drone: [0, 0], every: [2.5, 5] },
  sakura: { bed: ['bandpass', 1300, 0.8, 0.014], drone: [0, 0], every: [2, 4.5] },
  space: { bed: ['lowpass', 500, 1, 0.01], drone: [65, 0.02], every: [1.5, 3.5] },
  ruins: { bed: ['bandpass', 4500, 6, 0.006], drone: [0, 0], every: [0.6, 1.6] },
}

let bed = null
let current = null
let nextIn = 2
let last = 0

onStart((ctx) => {
  const src = ctx.createBufferSource()
  src.buffer = A.noise.pinkStereo
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 1000
  const g = ctx.createGain()
  g.gain.value = 0
  src.connect(f).connect(g).connect(A.amb)
  src.start()
  const osc = ctx.createOscillator()
  osc.frequency.value = 55
  const og = ctx.createGain()
  og.gain.value = 0
  // A slow wobble so the drone breathes.
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.15
  const lg = ctx.createGain()
  lg.gain.value = 3
  lfo.connect(lg).connect(osc.frequency)
  osc.connect(og).connect(A.amb)
  osc.start()
  lfo.start()
  bed = { f, g, osc, og }
})

export function setLaneZone(kind) {
  const t = performance.now() / 1000
  const dt = Math.min(0.25, t - last)
  last = t
  if (!bed || A.ctx?.state !== 'running') return
  const now = A.ctx.currentTime
  const cfg = BEDS[kind] ?? null
  if (kind !== current) {
    current = kind
    if (cfg) {
      const [type, f, q, level] = cfg.bed
      if (bed.f.type !== type) bed.f.type = type
      bed.f.frequency.setTargetAtTime(f, now, 0.6)
      bed.f.Q.setTargetAtTime(q, now, 0.6)
      bed.g.gain.setTargetAtTime(level, now, 1.2)
      if (cfg.drone[0]) bed.osc.frequency.setTargetAtTime(cfg.drone[0], now, 0.8)
      bed.og.gain.setTargetAtTime(cfg.drone[1], now, 1.2)
      nextIn = rnd(1, 2)
    } else {
      bed.g.gain.setTargetAtTime(0, now, 0.8)
      bed.og.gain.setTargetAtTime(0, now, 0.8)
    }
  }
  if (!cfg) return
  // Ice: the howl swells and fades.
  if (kind === 'ice') bed.f.frequency.setTargetAtTime(700 + Math.sin(t * 0.4) * 350, now, 0.5)
  if ((nextIn -= dt) > 0) return
  nextIn = rnd(cfg.every[0], cfg.every[1])
  if (!voice(1.2, 0.2)) return
  event(kind, now + 0.05)
}

function event(kind, t) {
  const bus = A.amb
  const pan = rnd(-0.8, 0.8)
  switch (kind) {
    case 'desert':
      // A gust of sand hissing past.
      burst({ t, noise: 'pink', f: 2500, f2: 5000, q: 1, a: 0.4, hold: 0.3, d: 0.8, gain: 0.02, bus, pan })
      break
    case 'jungle':
      if (Math.random() < 0.6) {
        // A bird: two or three quick chirps sweeping up.
        const f = rnd(2200, 3800)
        for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) tone({ t: t + i * 0.11, type: 'sine', f, f2: f * 1.35, d: 0.07, gain: 0.018, bus, pan })
      } else {
        // An insect buzz.
        tone({ t, type: 'sawtooth', f: rnd(180, 260), a: 0.1, hold: 0.4, d: 0.3, gain: 0.006, lp: 2500, bus, pan })
      }
      break
    case 'ice':
      crinkle({ t, n: 10, dur: 0.5, gain: 0.02, f0: 3000, f1: 9000, width: 0.8, bus })
      break
    case 'crystal':
      modal({ t, f: pick([1318, 1568, 1760, 2093]), modes: [[1, 1, 1.2], [2.32, 0.4, 0.6], [4.25, 0.2, 0.3]], gain: 0.012, bus, pan, verb: 0.6 })
      break
    case 'gold':
    case 'rainbow':
      for (let i = 0; i < 3; i++) tone({ t: t + i * 0.09, type: 'triangle', f: pick([1568, 2093, 2349, 2637, 3136]), d: 0.25, gain: 0.008, bus, pan, verb: 0.5 })
      break
    case 'lava':
      bubbles({ t, n: 8, dur: 0.8, f0: 70, f1: 220, gain: 0.03, width: 0.8, bus })
      if (Math.random() < 0.3) crinkle({ t, n: 8, dur: 0.4, gain: 0.015, f0: 2500, f1: 6000, width: 0.8, bus })
      break
    case 'spikes':
      // Distant taiko.
      for (let i = 0; i < 2; i++) tone({ t: t + i * 0.32, f: 80, f2: 50, d: 0.4, gain: 0.04, bus, pan, verb: 0.6 })
      break
    case 'marble':
      modal({ t, f: 392, modes: [[0.5, 0.25, 2], [1, 1, 1.8], [1.19, 0.4, 1.2], [2, 0.38, 0.9]], gain: 0.012, bus, pan, verb: 0.7 })
      break
    case 'sakura':
      for (let i = 0; i < 4; i++) modal({ t: t + i * rnd(0.08, 0.2), f: pick([1760, 1976, 2349, 2637, 2960]), modes: [[1, 1, 1.4], [2.756, 0.32, 0.45]], gain: 0.008, bus, pan: rnd(-0.6, 0.6), verb: 0.5 })
      break
    case 'space':
      tone({ t, type: 'sine', f: rnd(800, 2400), f2: rnd(400, 3000), d: 0.35, gain: 0.008, bus, pan, verb: 0.6 })
      break
    case 'ruins':
      if (Math.random() < 0.75) {
        // Cricket: a rapid run of tiny chirps.
        for (let i = 0; i < 4; i++) tone({ t: t + i * 0.045, type: 'sine', f: 4600, d: 0.025, gain: 0.008, bus, pan })
      } else {
        // A drip into a pool.
        tone({ t, type: 'sine', f: rnd(900, 1400), f2: 2200, d: 0.05, gain: 0.02, bus, pan, verb: 0.6 })
      }
      break
  }
}
