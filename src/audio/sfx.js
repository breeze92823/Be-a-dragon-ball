// Safe zone one-shots, synthesised from physical recipes (synth.js): struck
// modes for plastic, glass, coins and bells, filtered noise for steps, whooshes
// and steam. Every sound:
//  - returns quietly before the first gesture or when the voice budget is spent
//  - is throttled per name (limit), so a burst can't stack copies of itself
//  - varies pitch / level a little each time (vary), so repeats never machine-gun
//  - starts and ends on smooth envelopes (no clicks), and the master chain's
//    compressor + limiter keep any pile-up from clipping.
import { A, now, voice } from './core.js'
import { bubble, bubbles, burst, crinkle, modal, tone, rnd, vary, pick } from './synth.js'

const COIN = [[1, 1, 0.5], [1.504, 0.6, 0.36], [2.24, 0.45, 0.26], [2.71, 0.3, 0.18], [3.47, 0.22, 0.12], [4.03, 0.12, 0.08]]
const GLOCK = [[1, 1, 1.4], [2.756, 0.32, 0.45], [5.404, 0.1, 0.18], [8.933, 0.04, 0.08]]
const BELL = [[0.5, 0.25, 1.4], [1, 1, 1.2], [1.19, 0.4, 0.9], [1.5, 0.28, 0.8], [2, 0.38, 0.7], [2.66, 0.2, 0.4], [3.01, 0.1, 0.3]]
const WOOD = [[1, 1, 0.07], [2.57, 0.45, 0.035], [4.2, 0.22, 0.016], [6.1, 0.08, 0.01]]
const PLASTIC = [[1, 1, 0.026], [2.31, 0.5, 0.016], [3.93, 0.28, 0.01]]
const GLASS = [[1, 1, 0.45], [2.32, 0.5, 0.28], [4.25, 0.28, 0.16], [6.63, 0.14, 0.1]]
const semi = (n) => Math.pow(2, n / 12)

const lastAt = new Map()
function limit(name, ms) {
  const t = performance.now()
  if (t - (lastAt.get(name) ?? -1e9) < ms) return false
  lastAt.set(name, t)
  return true
}

// --- Movement ---------------------------------------------------------------------------------
// Footstep on a surface: 'plastic' (studded floors), 'sand', 'carpet'. k = 0..1 effort.
export function step(surface = 'plastic', k = 0.6) {
  if (!limit('step', 90) || !voice(0.12, 0.6)) return
  const t = now()
  const bus = A.sfx
  const pan = rnd(-0.12, 0.12)
  const g = 0.55 + k * 0.45
  if (surface === 'sand') {
    // Grains crunching under the sole: a short band of noise grains.
    for (let i = 0; i < 5; i++) burst({ t: t + i * 0.008 + rnd(0, 0.006), f: rnd(2500, 5200), q: rnd(1.5, 3), a: 0.001, d: rnd(0.01, 0.025), gain: 0.05 * g, bus, pan })
    burst({ t, type: 'lowpass', noise: 'brown', f: 700, d: 0.07, gain: 0.16 * g, bus, pan })
    return
  }
  if (surface === 'carpet') {
    burst({ t, type: 'lowpass', noise: 'pink', f: 900, a: 0.004, d: 0.06, gain: 0.12 * g, bus, pan })
    tone({ t, f: vary(110, 0.08), f2: 70, d: 0.05, gain: 0.08 * g, bus, pan })
    return
  }
  // Hard toy plastic: a muted body thump + a tiny bright tick.
  burst({ t, type: 'lowpass', noise: 'brown', f: vary(900, 0.15), a: 0.002, d: 0.05, gain: 0.18 * g, bus, pan })
  modal({ t, f: vary(1500, 0.08), modes: PLASTIC, gain: 0.045 * g, bus, pan })
}

export function jump() {
  if (!limit('jump', 120) || !voice(0.3)) return
  const t = now()
  burst({ t, f: 500, f2: 1800, q: 1.2, a: 0.02, d: 0.18, gain: 0.08, bus: A.sfx })
  tone({ t, f: 180, f2: 260, d: 0.08, gain: 0.06, bus: A.sfx })
}

export function land(k = 0.5) {
  if (!limit('land', 150) || !voice(0.3)) return
  const t = now()
  burst({ t, type: 'lowpass', noise: 'brown', f: 600, a: 0.002, d: 0.12 + k * 0.08, gain: 0.18 + k * 0.2, bus: A.sfx })
  tone({ t, f: 120, f2: 60, d: 0.12, gain: 0.12 + k * 0.12, bus: A.sfx })
}

// --- Safe zone ------------------------------------------------------------------------------
// Walking into the safe zone: a warm rising three-note bell chime with a soft shimmer.
export function zoneEnter() {
  if (!limit('zone', 900) || !voice(1.6, 2)) return
  const t = now()
  const bus = A.ui
  ;[0, 4, 7].forEach((n, i) => modal({ t: t + i * 0.09, f: 784 * semi(n), modes: GLOCK, gain: 0.11, bus, pan: (i - 1) * 0.25, verb: 0.35 }))
  burst({ t: t + 0.05, f: 6000, f2: 9000, q: 0.8, a: 0.12, d: 0.6, gain: 0.025, bus, verb: 0.4 })
}

// Leaving it: two soft falling notes, lower and quieter (a gentle heads-up, not an alarm).
export function zoneLeave() {
  if (!limit('zone', 900) || !voice(1.2, 2)) return
  const t = now()
  const bus = A.ui
  modal({ t, f: 587, modes: GLOCK, gain: 0.08, bus, pan: 0.15, verb: 0.3 })
  modal({ t: t + 0.12, f: 440, modes: GLOCK, gain: 0.08, bus, pan: -0.15, verb: 0.3 })
}

// Stepping onto a shop's ring pad: an airy swell and a glass "ding".
export function padEnter(pan = 0) {
  if (!limit('pad', 400) || !voice(0.9, 1.5)) return
  const t = now()
  burst({ t, f: 900, f2: 3800, q: 0.9, a: 0.09, d: 0.22, gain: 0.05, bus: A.sfx, pan, verb: 0.25 })
  modal({ t: t + 0.08, f: vary(1568, 0.01), modes: GLASS, gain: 0.07, bus: A.sfx, pan, verb: 0.3 })
}

// Collect pad: a little cascade of coins (each one a struck metal plate).
export function coins(n = 4, pan = 0) {
  if (!limit('coins', 260) || !voice(0.8, 1.2)) return
  const t = now()
  for (let i = 0; i < n; i++) {
    const at = t + i * rnd(0.045, 0.075)
    modal({ t: at, f: vary(2300, 0.06) * pick([1, semi(3), semi(5)]), modes: COIN, beat: 6, gain: 0.05, bus: A.sfx, pan: pan + rnd(-0.15, 0.15), strike: 0.04, verb: 0.15 })
  }
}

// Dragon Spin peg passing the pointer: a dry wooden tick (k = wheel speed 0..1).
export function wheelTick(k, gain, pan) {
  if (gain < 0.01 || !limit('tick', 34) || !voice(0.08, 0.5)) return
  modal({ t: now(), f: vary(1900 + k * 500, 0.04), modes: WOOD, gain: 0.09 * gain, bus: A.sfx, pan })
}

// Fuse Machine steam vent (gain from distance).
export function steam(gain, pan) {
  if (gain < 0.01 || !limit('steam', 1200) || !voice(1, 0.5)) return
  const t = now()
  burst({ t, noise: 'white', type: 'highpass', f: 2500, a: 0.04, hold: 0.25, d: 0.5, gain: 0.05 * gain, bus: A.sfx, pan })
  burst({ t, f: 1200, f2: 700, q: 0.8, a: 0.05, d: 0.6, gain: 0.03 * gain, bus: A.sfx, pan })
}

// The free-reward statue's sparkle (harp-like glissando).
export function sparkle(pan = 0) {
  if (!limit('sparkle', 1500) || !voice(1.2, 1.5)) return
  const t = now()
  ;[0, 2, 4, 7, 9, 12].forEach((n, i) => modal({ t: t + i * 0.05, f: 1046.5 * semi(n), modes: GLOCK, gain: 0.05, bus: A.sfx, pan, verb: 0.4 }))
}

// A soft bell for the event countdown ticking over each minute.
export function bell(gain = 0.5) {
  if (!limit('bell', 2000) || !voice(1.4, 1)) return
  modal({ t: now(), f: 523, modes: BELL, beat: 3, gain: 0.08 * gain, bus: A.sfx, verb: 0.5 })
}

// --- Lane --------------------------------------------------------------------------------------
// Turning into the orb (into = true) or back: a soft "poof" of air with a magic chirp up (or down).
export function poof(into = true) {
  if (!limit('poof', 300) || !voice(0.8, 1.5)) return
  const t = now()
  burst({ t, noise: 'pink', f: 900, f2: 2600, q: 0.7, a: 0.01, d: 0.28, gain: 0.16, bus: A.sfx, verb: 0.2 })
  burst({ t, type: 'lowpass', noise: 'brown', f: 500, a: 0.004, d: 0.18, gain: 0.18, bus: A.sfx })
  const notes = into ? [0, 4, 7, 12] : [12, 7, 4, 0]
  notes.forEach((n, i) => modal({ t: t + 0.04 + i * 0.045, f: 1046.5 * semi(n), modes: GLOCK, gain: 0.045, bus: A.sfx, pan: (i - 1.5) * 0.15, verb: 0.35 }))
}

// One wing beat (k = speed 0..1): a feathery whoosh.
export function flap(k = 0.5) {
  if (!limit('flap', 110) || !voice(0.2, 0.4)) return
  burst({ t: now(), noise: 'pink', f: vary(700, 0.15), f2: 1500, q: 0.8, a: 0.03, d: 0.12, gain: 0.03 + k * 0.03, bus: A.sfx, pan: rnd(-0.2, 0.2) })
}

// The orb rolling over the studs (k = speed 0..1): a soft rumble with a hollow plastic tick.
export function roll(k = 0.5) {
  if (!limit('roll', 80) || !voice(0.12, 0.4)) return
  const t = now()
  burst({ t, type: 'lowpass', noise: 'brown', f: 300 + k * 300, a: 0.01, d: 0.1, gain: 0.08 + k * 0.08, bus: A.sfx })
  modal({ t, f: vary(900 + k * 400, 0.1), modes: PLASTIC, gain: 0.03, bus: A.sfx })
}

// A guardian roaring: a growling low sweep through a throat-like resonance (angry: harsher).
export function roar(gain = 1, pan = 0, angry = false) {
  if (gain < 0.02 || !limit(angry ? 'roarA' : 'roar', 800) || !voice(1.6, 2)) return
  const t = now()
  const d = angry ? 1.1 : 0.9
  tone({ t, type: 'sawtooth', f: 140, f2: 70, a: 0.06, hold: d * 0.4, d: d * 0.6, gain: 0.16 * gain, lp: 700, lpq: 4, bus: A.sfx, pan, verb: 0.3 })
  tone({ t, type: 'sawtooth', f: 147, f2: 66, a: 0.06, hold: d * 0.4, d: d * 0.6, gain: 0.12 * gain, lp: 500, lpq: 3, bus: A.sfx, pan, verb: 0.3 })
  burst({ t, noise: 'brown', f: 500, f2: 260, q: 2.5, a: 0.05, hold: d * 0.4, d: d * 0.6, gain: 0.3 * gain, bus: A.sfx, pan, verb: 0.25 })
  if (angry) burst({ t: t + 0.05, noise: 'pink', f: 1400, f2: 700, q: 3, a: 0.04, hold: 0.3, d: 0.5, gain: 0.08 * gain, bus: A.sfx, pan })
}

// A giant footfall: a deep thump you feel more than hear, with a crunch.
export function giantStep(gain = 1, pan = 0) {
  if (gain < 0.02 || !limit('gstep', 120) || !voice(0.5, 0.8)) return
  const t = now()
  tone({ t, f: 70, f2: 38, d: 0.28, gain: 0.32 * gain, bus: A.sfx, pan })
  burst({ t, type: 'lowpass', noise: 'brown', f: 420, a: 0.003, d: 0.22, gain: 0.35 * gain, bus: A.sfx, pan, verb: 0.15 })
  burst({ t: t + 0.01, f: 2200, q: 1.2, d: 0.05, gain: 0.05 * gain, bus: A.sfx, pan })
}

// A sleeping guardian snoring: a slow nasal in-breath.
export function snore(gain = 1, pan = 0) {
  if (gain < 0.03 || !limit('snore', 2000) || !voice(1.4, 0.3)) return
  const t = now()
  tone({ t, type: 'sawtooth', f: 62, f2: 70, a: 0.5, hold: 0.3, d: 0.6, gain: 0.05 * gain, lp: 320, lpq: 6, bus: A.sfx, pan })
  burst({ t, noise: 'pink', f: 500, q: 3, a: 0.5, hold: 0.3, d: 0.6, gain: 0.04 * gain, bus: A.sfx, pan })
}

// Hands closing round the orb: a fast whoosh and a muffled clap.
export function grab() {
  if (!limit('grab', 500) || !voice(0.6, 2)) return
  const t = now()
  burst({ t, f: 400, f2: 2400, q: 1, a: 0.04, d: 0.16, gain: 0.14, bus: A.sfx })
  burst({ t: t + 0.16, type: 'lowpass', noise: 'brown', f: 900, a: 0.002, d: 0.12, gain: 0.35, bus: A.sfx })
  tone({ t: t + 0.16, f: 160, f2: 80, d: 0.15, gain: 0.18, bus: A.sfx })
}

// Hatching: a rising dark swirl (filtered noise sweeping up) over a low drone.
export function hatchSwirl() {
  if (!limit('hswirl', 1000) || !voice(2, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 250, f2: 3200, q: 3, a: 0.4, hold: 0.8, d: 0.4, gain: 0.12, bus: A.sfx, sweep: 1.5, verb: 0.4 })
  tone({ t, type: 'triangle', f: 110, f2: 220, a: 0.3, hold: 0.9, d: 0.4, gain: 0.08, bus: A.sfx, glide: 1.5 })
  for (let i = 0; i < 10; i++) modal({ t: t + 0.2 + i * 0.12, f: 1318 * semi((i % 5) * 2), modes: GLASS, gain: 0.018 + i * 0.003, bus: A.sfx, pan: rnd(-0.5, 0.5), verb: 0.4 })
}

// The fighter appears: a bright burst + a major chord on bells.
export function hatchPop() {
  if (!limit('hpop', 800) || !voice(2, 2)) return
  const t = now()
  burst({ t, noise: 'white', type: 'highpass', f: 2500, a: 0.002, d: 0.35, gain: 0.12, bus: A.sfx, verb: 0.4 })
  burst({ t, type: 'lowpass', noise: 'brown', f: 600, a: 0.002, d: 0.2, gain: 0.3, bus: A.sfx })
  const chord = [0, 4, 7, 12, 16]
  chord.forEach((n, i) => modal({ t: t + i * 0.035, f: 523 * semi(n), modes: BELL, gain: 0.05, bus: A.ui, pan: (i - 2) * 0.2, verb: 0.5 }))
}

// RUN: a two-note brass stab, twice.
export function alarm() {
  if (!limit('alarm', 1200) || !voice(1.2, 2)) return
  const t = now()
  for (let r = 0; r < 2; r++) {
    for (const [n, dt] of [[7, 0], [0, 0.13]]) {
      const f = 330 * semi(n)
      tone({ t: t + r * 0.32 + dt, type: 'sawtooth', f, a: 0.01, hold: 0.07, d: 0.09, gain: 0.07, lp: 2400, lpq: 1.5, bus: A.ui })
      tone({ t: t + r * 0.32 + dt, type: 'square', f: f / 2, a: 0.01, hold: 0.07, d: 0.09, gain: 0.04, lp: 1200, bus: A.ui })
    }
  }
}

// A heartbeat while running home (k = danger 0..1).
export function heartbeat(k = 0.5) {
  if (!limit('heart', 400) || !voice(0.4, 0.5)) return
  const t = now()
  tone({ t, f: 62, f2: 45, d: 0.12, gain: 0.12 + k * 0.1, bus: A.ui })
  tone({ t: t + 0.16, f: 58, f2: 42, d: 0.14, gain: 0.09 + k * 0.08, bus: A.ui })
}

// The guardian snatched the fighter back: a falling, deflating phrase.
export function lost() {
  if (!limit('lost', 1000) || !voice(1.6, 2)) return
  const t = now()
  const notes = [7, 5, 3, 0]
  notes.forEach((n, i) => tone({ t: t + i * 0.16, type: 'triangle', f: 392 * semi(n - 12), f2: 392 * semi(n - 12.6), a: 0.01, d: 0.22, gain: 0.1, bus: A.ui }))
  burst({ t, noise: 'pink', f: 1800, f2: 300, q: 1.2, a: 0.02, d: 0.6, gain: 0.08, bus: A.sfx })
}

// Back in the safe zone with a fighter: confetti pops + a happy rising fanfare.
export function safeArrive() {
  if (!limit('safe', 1000) || !voice(2.2, 2)) return
  const t = now()
  for (let i = 0; i < 3; i++) burst({ t: t + i * 0.06, f: rnd(1500, 3000), q: 1, a: 0.001, d: 0.05, gain: 0.18, bus: A.sfx, pan: rnd(-0.5, 0.5) })
  crinkle({ t: t + 0.05, n: 40, dur: 1.2, gain: 0.05, width: 0.8 })
  const notes = [0, 4, 7, 12, 7, 12, 16]
  notes.forEach((n, i) => modal({ t: t + 0.1 + i * 0.075, f: 784 * semi(n), modes: GLOCK, gain: 0.08, bus: A.ui, pan: (i - 3) * 0.12, verb: 0.35 }))
  tone({ t: t + 0.1, type: 'triangle', f: 392, a: 0.02, hold: 0.4, d: 0.5, gain: 0.05, bus: A.ui })
}

// --- Base ----------------------------------------------------------------------------------------
// Fighter set on a slot: a magical whoosh down (the landing adds land() + sparkle()).
export function place() {
  if (!limit('place', 300) || !voice(1, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 3000, f2: 500, q: 1, a: 0.05, d: 0.25, gain: 0.1, bus: A.sfx, verb: 0.3 })
  const notes = [12, 7, 4]
  notes.forEach((n, i) => modal({ t: t + i * 0.05, f: 1046.5 * semi(n), modes: GLOCK, gain: 0.05, bus: A.sfx, verb: 0.3 }))
}

// Picked up into the hands: a pop and a rising blip.
export function pickUp() {
  if (!limit('pick', 250) || !voice(0.6, 1.5)) return
  const t = now()
  burst({ t, f: 800, f2: 2400, q: 1.4, a: 0.005, d: 0.1, gain: 0.12, bus: A.sfx })
  tone({ t, type: 'triangle', f: 520, f2: 1040, d: 0.14, gain: 0.08, bus: A.ui })
}

// Hotbar slot selected / deselected.
export function select(on = true) {
  if (!limit('select', 80) || !voice(0.2, 1)) return
  const t = now()
  modal({ t, f: on ? 1568 : 1175, modes: PLASTIC, gain: 0.12, bus: A.ui, strike: 0.04 })
  tone({ t, type: 'triangle', f: on ? 880 : 660, d: 0.06, gain: 0.05, bus: A.ui })
}

// Slot upgrade: a quick climbing arpeggio with a shiny ring on top.
export function upgrade() {
  if (!limit('upgrade', 300) || !voice(1.4, 2)) return
  const t = now()
  const notes = [0, 4, 7, 12, 16, 19]
  notes.forEach((n, i) => modal({ t: t + i * 0.04, f: 659 * semi(n), modes: GLOCK, gain: 0.06, bus: A.ui, verb: 0.3 }))
  modal({ t: t + 0.26, f: 2637, modes: BELL, gain: 0.04, bus: A.ui, verb: 0.5 })
}

// Not enough cash: a soft low double buzz.
export function denied() {
  if (!limit('denied', 400) || !voice(0.4, 1)) return
  const t = now()
  for (let i = 0; i < 2; i++) tone({ t: t + i * 0.11, type: 'square', f: 150, a: 0.005, d: 0.08, gain: 0.04, lp: 900, bus: A.ui })
}

// Collecting a pad (k = 0..1 size of the haul): a cash-register cha-ching on coins and paper.
export function cash(k = 0.5) {
  if (!limit('cash', 200) || !voice(1.2, 2)) return
  const t = now()
  burst({ t, f: 3500, f2: 1800, q: 2, a: 0.004, d: 0.07, gain: 0.08, bus: A.sfx })
  modal({ t: t + 0.07, f: 2093, modes: BELL, beat: 4, gain: 0.07, bus: A.sfx, verb: 0.35 })
  modal({ t: t + 0.07, f: 3136, modes: GLOCK, gain: 0.05, bus: A.sfx, verb: 0.35 })
  crinkle({ t: t + 0.02, n: 10 + Math.round(k * 20), dur: 0.35, gain: 0.05, f0: 2500, f1: 8000, width: 0.4 })
  const n = 2 + Math.round(k * 4)
  for (let i = 0; i < n; i++) modal({ t: t + 0.12 + i * rnd(0.04, 0.07), f: vary(2300, 0.06) * pick([1, semi(3), semi(5)]), modes: COIN, beat: 6, gain: 0.04, bus: A.sfx, pan: rnd(-0.3, 0.3), strike: 0.03, verb: 0.15 })
}

// Hold-to-interact progress tick (pitch rises with progress p 0..1).
export function promptTick(p) {
  if (!limit('ptick', 90) || !voice(0.1, 0.3)) return
  tone({ t: now(), type: 'triangle', f: 500 + p * 700, d: 0.04, gain: 0.025, bus: A.ui })
}

// A giant dusting off its palms: a fat, slightly hollow clap.
export function clap(gain = 1, pan = 0) {
  if (gain < 0.02 || !limit('clap', 150) || !voice(0.2, 0.5)) return
  const t = now()
  burst({ t, f: vary(900, 0.1), q: 1.1, a: 0.001, d: 0.06, gain: 0.25 * gain, bus: A.sfx, pan, verb: 0.2 })
  burst({ t, type: 'lowpass', noise: 'brown', f: 500, a: 0.001, d: 0.05, gain: 0.2 * gain, bus: A.sfx, pan })
}

// A giant's yawn: a breathy, rising-then-falling vowel through a moving formant.
export function yawn(gain = 1, pan = 0) {
  if (gain < 0.02 || !limit('yawn', 2000) || !voice(1.6, 0.8)) return
  const t = now()
  tone({ t, type: 'sawtooth', f: 95, f2: 75, a: 0.35, hold: 0.6, d: 0.6, gain: 0.07 * gain, lp: 650, lpq: 5, bus: A.sfx, pan, verb: 0.25 })
  burst({ t, noise: 'pink', f: 380, f2: 900, q: 4, a: 0.3, hold: 0.4, d: 0.8, gain: 0.08 * gain, bus: A.sfx, pan, sweep: 0.7 })
  burst({ t: t + 0.9, noise: 'pink', f: 900, f2: 300, q: 3, a: 0.05, d: 0.6, gain: 0.05 * gain, bus: A.sfx, pan })
}

// Waking with a start: a short grunt ("huh?!") plus a bright "!" sting.
export function startle(gain = 1, pan = 0) {
  if (!limit('startle', 800) || !voice(0.8, 2)) return
  const t = now()
  tone({ t, type: 'sawtooth', f: 110, f2: 190, a: 0.01, d: 0.22, gain: 0.1 * Math.max(0.3, gain), lp: 900, lpq: 4, bus: A.sfx, pan })
  burst({ t, type: 'lowpass', noise: 'brown', f: 700, a: 0.003, d: 0.12, gain: 0.2 * Math.max(0.3, gain), bus: A.sfx, pan })
  modal({ t: t + 0.02, f: 1568, modes: GLOCK, gain: 0.09, bus: A.ui, verb: 0.3 })
  modal({ t: t + 0.09, f: 2349, modes: GLOCK, gain: 0.08, bus: A.ui, verb: 0.3 })
}

// --- Guardian tongue -------------------------------------------------------------------
// Rearing back with jaws open: a wet, rising throaty gurgle.
export function tongueWind(gain = 1, pan = 0) {
  if (!limit('twind', 800) || !voice(0.8, 2)) return
  const t = now()
  tone({ t, type: 'sawtooth', f: 80, f2: 140, a: 0.1, hold: 0.2, d: 0.3, gain: 0.09 * gain, lp: 600, lpq: 6, bus: A.sfx, pan })
  bubbles({ t, n: 14, dur: 0.5, f0: 300, f1: 900, gain: 0.06 * gain, width: 0.3 })
}

// The tongue lashing out: a fast rising whip of air with a rubbery "thwip".
export function tongueShoot() {
  if (!limit('tshoot', 600) || !voice(0.5, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 400, f2: 2600, q: 1.2, a: 0.01, d: 0.22, gain: 0.16, bus: A.sfx, sweep: 0.2 })
  tone({ t, type: 'triangle', f: 220, f2: 660, a: 0.005, d: 0.16, gain: 0.08, lp: 1800, bus: A.sfx })
}

// Sticky impact: a wet low slap.
export function splat() {
  if (!limit('splat', 400) || !voice(0.4, 2)) return
  const t = now()
  burst({ t, type: 'lowpass', noise: 'brown', f: 900, a: 0.002, d: 0.16, gain: 0.4, bus: A.sfx })
  bubbles({ t, n: 8, dur: 0.15, f0: 250, f1: 700, gain: 0.08, width: 0.2 })
}

// Reeling in: a long falling slurp.
export function slurp() {
  if (!limit('slurp', 800) || !voice(0.9, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 1400, f2: 300, q: 5, a: 0.05, hold: 0.3, d: 0.35, gain: 0.14, bus: A.sfx, sweep: 0.7 })
  bubbles({ t, n: 18, dur: 0.6, f0: 200, f1: 600, gain: 0.05, width: 0.3 })
}

// Swallowed whole: a deep gulp with a pitch drop.
export function gulp() {
  if (!limit('gulp', 800) || !voice(0.6, 2)) return
  const t = now()
  tone({ t, f: 180, f2: 55, a: 0.01, d: 0.35, gain: 0.25, bus: A.sfx })
  burst({ t, type: 'lowpass', noise: 'brown', f: 500, a: 0.01, d: 0.25, gain: 0.25, bus: A.sfx })
  bubble({ t: t + 0.1, f: 140, d: 0.12, gain: 0.12, rise: 1.2, bus: A.sfx })
}

// Chomp while chewing: a soft wet squelch.
export function chew(gain = 1, pan = 0) {
  if (gain < 0.02 || !limit('chew', 220) || !voice(0.25, 0.6)) return
  const t = now()
  burst({ t, type: 'lowpass', noise: 'brown', f: vary(600, 0.2), a: 0.005, d: 0.1, gain: 0.2 * gain, bus: A.sfx, pan })
  bubble({ t, f: vary(260, 0.2), d: 0.05, gain: 0.05 * gain, bus: A.sfx, pan })
}

// The satisfied burp.
export function burp(gain = 1, pan = 0) {
  if (!limit('burp', 1500) || !voice(0.9, 2)) return
  const t = now()
  tone({ t, type: 'sawtooth', f: 72, f2: 58, a: 0.03, hold: 0.25, d: 0.3, gain: 0.14 * gain, lp: 480, lpq: 8, bus: A.sfx, pan, verb: 0.25 })
  burst({ t, noise: 'brown', f: 300, q: 3, a: 0.03, hold: 0.2, d: 0.3, gain: 0.25 * gain, bus: A.sfx, pan })
}

// Running the wrong way: a short descending warning blip pair.
export function warn() {
  if (!limit('warn', 900) || !voice(0.4, 2)) return
  const t = now()
  tone({ t, type: 'square', f: 520, d: 0.1, gain: 0.04, lp: 1600, bus: A.ui })
  tone({ t: t + 0.13, type: 'square', f: 390, d: 0.14, gain: 0.04, lp: 1600, bus: A.ui })
}

// --- Giants: each zone's guardian has its own voice, footstep and idle sounds (lane/giants.js) ----
// These are layers: the shared roar / giantStep above still plays underneath.
const METAL = [[1, 1, 0.9], [2.76, 0.5, 0.6], [5.4, 0.3, 0.4], [8.93, 0.15, 0.25]]
const GONG = [[0.5, 0.6, 2.4], [1, 1, 2.2], [1.47, 0.5, 1.6], [2.1, 0.35, 1.2], [2.9, 0.2, 0.8]]

// The themed part of a roar (kind: 'mummy', 'brute', 'frost', 'golem', 'pharaoh', 'magma',
// 'oni', 'sentinel', 'prism', 'ronin', 'warden', 'colossus').
export function giantVoice(kind, gain = 1, pan = 0) {
  if (gain < 0.03 || !limit('gvoice', 700) || !voice(1.8, 2)) return
  const t = now()
  const bus = A.sfx
  const g = gain
  switch (kind) {
    case 'mummy':
      // A dry rasping hiss through a moving throat formant, cloth flapping.
      burst({ t, noise: 'white', f: 1800, f2: 700, q: 3, a: 0.08, hold: 0.5, d: 0.5, gain: 0.12 * g, bus, pan, verb: 0.3 })
      burst({ t, noise: 'pink', f: 500, f2: 900, q: 6, a: 0.1, hold: 0.4, d: 0.4, gain: 0.1 * g, bus, pan })
      crinkle({ t: t + 0.1, n: 30, dur: 0.8, gain: 0.04 * g, f0: 1200, f1: 4000, width: 0.4, bus })
      break
    case 'brute':
      // Chest beats: six hollow thumps, then a deep hoot.
      for (let i = 0; i < 6; i++) {
        const at = t + 0.12 + i * 0.13
        tone({ t: at, f: vary(95, 0.06), f2: 55, d: 0.16, gain: 0.3 * g, bus, pan: pan + (i % 2 ? 0.1 : -0.1) })
        burst({ t: at, type: 'lowpass', noise: 'brown', f: 700, a: 0.002, d: 0.1, gain: 0.25 * g, bus, pan })
      }
      tone({ t, type: 'sawtooth', f: 120, f2: 85, a: 0.05, hold: 0.3, d: 0.4, gain: 0.08 * g, lp: 420, lpq: 5, bus, pan, verb: 0.3 })
      break
    case 'frost':
      // Howling icy wind and cracking ice, a glassy shimmer.
      burst({ t, noise: 'pink', f: 500, f2: 2200, q: 8, a: 0.15, hold: 0.4, d: 0.6, gain: 0.1 * g, bus, pan, verb: 0.5, sweep: 0.6 })
      crinkle({ t, n: 45, dur: 0.7, gain: 0.07 * g, f0: 3000, f1: 9000, width: 0.6, bus })
      modal({ t: t + 0.05, f: 1760, modes: GLASS, gain: 0.06 * g, bus, pan, verb: 0.5 })
      modal({ t: t + 0.18, f: 2349, modes: GLASS, gain: 0.04 * g, bus, pan, verb: 0.5 })
      break
    case 'golem':
      // Grinding stone and a sub drone that swells.
      for (let i = 0; i < 8; i++) burst({ t: t + i * 0.09, type: 'lowpass', noise: 'brown', f: rnd(180, 420), a: 0.02, d: 0.12, gain: 0.2 * g, bus, pan })
      tone({ t, f: 48, f2: 38, a: 0.2, hold: 0.5, d: 0.6, gain: 0.3 * g, bus, pan })
      tone({ t, type: 'triangle', f: 220, f2: 330, a: 0.3, hold: 0.3, d: 0.6, gain: 0.04 * g, bus, pan, verb: 0.6 })
      break
    case 'pharaoh':
      // A great gong and a brassy fanfare stab.
      modal({ t, f: 110, modes: GONG, beat: 4, gain: 0.18 * g, bus, pan, verb: 0.5 })
      for (const [f, d] of [[220, 0], [330, 0.02], [440, 0.04]]) tone({ t: t + d, type: 'sawtooth', f, a: 0.04, hold: 0.35, d: 0.4, gain: 0.04 * g, lp: 1400, lpq: 2, bus, pan, verb: 0.35 })
      break
    case 'magma':
      // A fire whoosh, bubbling lava and a deep rumble.
      burst({ t, noise: 'pink', f: 250, f2: 2400, q: 1, a: 0.1, hold: 0.25, d: 0.5, gain: 0.18 * g, bus, pan, sweep: 0.5, verb: 0.2 })
      bubbles({ t, n: 24, dur: 1, f0: 90, f1: 300, gain: 0.08 * g, width: 0.4, bus })
      tone({ t, f: 42, f2: 32, a: 0.1, hold: 0.4, d: 0.6, gain: 0.3 * g, bus, pan })
      crinkle({ t, n: 25, dur: 0.9, gain: 0.05 * g, f0: 2500, f1: 7000, width: 0.5, bus })
      break
    case 'oni':
      // Taiko: three big drum hits and a war shout.
      for (let i = 0; i < 3; i++) {
        const at = t + i * 0.2 + (i === 2 ? 0.08 : 0)
        tone({ t: at, f: vary(85, 0.04), f2: 48, d: 0.35, gain: 0.35 * g, bus, pan, verb: 0.3 })
        burst({ t: at, type: 'lowpass', noise: 'brown', f: 900, a: 0.002, d: 0.08, gain: 0.3 * g, bus, pan })
        burst({ t: at, f: 2500, q: 1, a: 0.001, d: 0.02, gain: 0.05 * g, bus, pan })
      }
      tone({ t: t + 0.05, type: 'sawtooth', f: 210, f2: 150, a: 0.03, hold: 0.25, d: 0.25, gain: 0.07 * g, lp: 900, lpq: 6, bus, pan, verb: 0.3 })
      break
    case 'sentinel':
      // A resonant war horn and a ringing clang of armour.
      tone({ t, type: 'square', f: 146.8, a: 0.12, hold: 0.5, d: 0.4, gain: 0.05 * g, lp: 900, lpq: 3, bus, pan, verb: 0.5 })
      tone({ t, type: 'square', f: 220, a: 0.14, hold: 0.45, d: 0.4, gain: 0.035 * g, lp: 1100, lpq: 3, bus, pan, verb: 0.5 })
      modal({ t, f: 620, modes: METAL, beat: 6, gain: 0.08 * g, bus, pan, verb: 0.4, strike: 0.05 })
      break
    case 'prism':
      // A shining choir chord with a crystal sparkle.
      for (const [f, dt] of [[523.3, 0], [659.3, 0.03], [784, 0.06], [1046.5, 0.09]]) {
        tone({ t: t + dt, type: 'triangle', f, a: 0.2, hold: 0.5, d: 0.6, gain: 0.03 * g, bus, pan, verb: 0.6 })
        tone({ t: t + dt, type: 'sine', f: f * 1.004, a: 0.2, hold: 0.5, d: 0.6, gain: 0.025 * g, bus, pan, verb: 0.6 })
      }
      crinkle({ t: t + 0.1, n: 20, dur: 0.8, gain: 0.03 * g, f0: 5000, f1: 10000, width: 0.7, bus, verb: 0.4 })
      break
    case 'ronin':
      // A sharp kiai, a blade ringing out of its scabbard, a gust.
      tone({ t, type: 'sawtooth', f: 280, f2: 200, a: 0.02, hold: 0.12, d: 0.2, gain: 0.07 * g, lp: 1300, lpq: 5, bus, pan, verb: 0.3 })
      burst({ t: t + 0.15, noise: 'white', f: 3000, f2: 7000, q: 2, a: 0.08, d: 0.12, gain: 0.08 * g, bus, pan })
      modal({ t: t + 0.25, f: 2637, modes: METAL, beat: 3, gain: 0.05 * g, bus, pan, verb: 0.4 })
      burst({ t, noise: 'pink', f: 600, f2: 1500, q: 0.7, a: 0.15, d: 0.5, gain: 0.06 * g, bus, pan, verb: 0.3 })
      break
    case 'warden':
      // A rising sci-fi sweep and starry twinkles.
      tone({ t, type: 'sawtooth', f: 70, f2: 420, a: 0.05, hold: 0.4, d: 0.4, gain: 0.06 * g, lp: 1200, lpq: 8, bus, pan, verb: 0.5, glide: 0.8 })
      tone({ t, type: 'sine', f: 55, a: 0.1, hold: 0.4, d: 0.5, gain: 0.2 * g, bus, pan })
      for (let i = 0; i < 6; i++) tone({ t: t + 0.2 + i * 0.08, type: 'triangle', f: pick([1568, 2093, 2637, 3136]), d: 0.15, gain: 0.025 * g, bus, pan: rnd(-0.5, 0.5), verb: 0.5 })
      break
    case 'colossus':
      // The ground itself groaning: a long sub rumble and falling pebbles.
      burst({ t, type: 'lowpass', noise: 'brown', f: 220, a: 0.2, hold: 0.6, d: 0.8, gain: 0.4 * g, bus, pan, verb: 0.3 })
      tone({ t, f: 36, f2: 30, a: 0.2, hold: 0.5, d: 0.8, gain: 0.35 * g, bus, pan })
      crinkle({ t: t + 0.3, n: 30, dur: 1, gain: 0.05 * g, f0: 800, f1: 3000, width: 0.6, bus })
      break
  }
}

// The themed part of a footfall (kind = the giant's fx.step).
export function giantStepLayer(kind, gain = 1, pan = 0) {
  if (gain < 0.03 || !limit('gstep', 120) || !voice(0.4, 0.8)) return
  const t = now()
  const bus = A.sfx
  const g = gain
  switch (kind) {
    case 'sand':
      for (let i = 0; i < 6; i++) burst({ t: t + i * 0.01, f: rnd(2500, 5500), q: 2, a: 0.001, d: rnd(0.015, 0.035), gain: 0.06 * g, bus, pan })
      break
    case 'leaf':
      crinkle({ t, n: 10, dur: 0.15, gain: 0.05 * g, f0: 1500, f1: 4500, width: 0.3, bus })
      break
    case 'ice':
      crinkle({ t, n: 14, dur: 0.12, gain: 0.08 * g, f0: 2500, f1: 8000, width: 0.3, bus })
      modal({ t, f: vary(2200, 0.1), modes: GLASS, gain: 0.025 * g, bus, pan })
      break
    case 'lava':
      burst({ t, noise: 'white', type: 'highpass', f: 3000, a: 0.01, hold: 0.1, d: 0.3, gain: 0.07 * g, bus, pan })
      bubbles({ t, n: 5, dur: 0.3, f0: 120, f1: 380, gain: 0.05 * g, width: 0.2, bus })
      break
    case 'void':
    case 'tech':
      tone({ t, type: 'sine', f: kind === 'void' ? 180 : 600, f2: kind === 'void' ? 90 : 1400, d: 0.12, gain: 0.05 * g, bus, pan, verb: 0.3 })
      break
    case 'gold':
      modal({ t, f: vary(2400, 0.1), modes: COIN, gain: 0.04 * g, bus, pan })
      modal({ t: t + 0.03, f: vary(3100, 0.1), modes: COIN, gain: 0.03 * g, bus, pan })
      break
    case 'thud':
      tone({ t, f: 55, f2: 30, d: 0.3, gain: 0.2 * g, bus, pan })
      break
    case 'metal':
      modal({ t, f: vary(480, 0.05), modes: METAL, beat: 5, gain: 0.07 * g, bus, pan, strike: 0.04 })
      break
    case 'prism':
      modal({ t, f: pick([1568, 1760, 2093, 2349]), modes: GLASS, gain: 0.04 * g, bus, pan, verb: 0.4 })
      break
    case 'petal':
      burst({ t, noise: 'pink', f: 900, f2: 2000, q: 0.8, a: 0.02, d: 0.15, gain: 0.04 * g, bus, pan })
      break
    case 'stone':
      burst({ t, type: 'lowpass', noise: 'brown', f: 260, a: 0.01, d: 0.2, gain: 0.2 * g, bus, pan })
      crinkle({ t: t + 0.02, n: 6, dur: 0.2, gain: 0.03 * g, f0: 800, f1: 2500, width: 0.3, bus })
      break
  }
}

// Something the giant does now and then while it is near (rustle, crackle, hum, clink...).
export function giantIdle(kind, gain = 1, pan = 0) {
  if (gain < 0.05 || !limit('gidle', 1500) || !voice(0.8, 0.3)) return
  const t = now()
  const bus = A.sfx
  const g = gain
  switch (kind) {
    case 'mummy':
      crinkle({ t, n: 16, dur: 0.5, gain: 0.03 * g, f0: 1000, f1: 3500, width: 0.3, bus })
      break
    case 'brute':
      tone({ t, type: 'sawtooth', f: 95, f2: 75, a: 0.03, d: 0.25, gain: 0.05 * g, lp: 380, lpq: 4, bus, pan })
      break
    case 'frost':
      crinkle({ t, n: 12, dur: 0.4, gain: 0.04 * g, f0: 3000, f1: 9000, width: 0.4, bus })
      break
    case 'golem':
      tone({ t, type: 'triangle', f: 110, a: 0.2, hold: 0.3, d: 0.4, gain: 0.03 * g, bus, pan, verb: 0.4 })
      break
    case 'pharaoh':
      modal({ t, f: 1318, modes: BELL, gain: 0.03 * g, bus, pan, verb: 0.5 })
      break
    case 'magma':
      bubbles({ t, n: 10, dur: 0.6, f0: 90, f1: 260, gain: 0.05 * g, width: 0.3, bus })
      burst({ t, noise: 'white', type: 'highpass', f: 4000, a: 0.05, hold: 0.2, d: 0.3, gain: 0.03 * g, bus, pan })
      break
    case 'oni':
      tone({ t, type: 'sawtooth', f: 70, f2: 62, a: 0.2, hold: 0.2, d: 0.3, gain: 0.05 * g, lp: 300, lpq: 5, bus, pan })
      break
    case 'sentinel':
      modal({ t, f: vary(900, 0.05), modes: METAL, beat: 4, gain: 0.03 * g, bus, pan })
      break
    case 'prism':
      ;[0, 4, 7].forEach((n, i) => modal({ t: t + i * 0.1, f: 1568 * semi(n), modes: GLASS, gain: 0.025 * g, bus, pan, verb: 0.5 }))
      break
    case 'ronin':
      ;[0, 3, 7, 10].forEach((n, i) => modal({ t: t + i * 0.14 + rnd(0, 0.05), f: 1760 * semi(n), modes: GLOCK, gain: 0.02 * g, bus, pan: rnd(-0.4, 0.4), verb: 0.5 }))
      break
    case 'warden':
      tone({ t, type: 'sine', f: 1760, d: 0.08, gain: 0.02 * g, bus, pan })
      tone({ t: t + 0.1, type: 'sine', f: 2349, d: 0.08, gain: 0.02 * g, bus, pan })
      break
    case 'colossus':
      crinkle({ t, n: 12, dur: 0.6, gain: 0.04 * g, f0: 600, f1: 2200, width: 0.3, bus })
      break
  }
}

// --- Guardian eating ---------------------------------------------------------------------
// A deep, rattling growl (two detuned saws through a throat resonance + rumble).
export function growl(gain = 1, pan = 0) {
  if (!limit('growl', 900) || !voice(1.4, 2)) return
  const t = now()
  tone({ t, type: 'sawtooth', f: 58, f2: 52, a: 0.15, hold: 0.6, d: 0.5, gain: 0.12 * gain, lp: 380, lpq: 7, bus: A.sfx, pan, verb: 0.2 })
  tone({ t, type: 'sawtooth', f: 61, f2: 49, a: 0.15, hold: 0.6, d: 0.5, gain: 0.1 * gain, lp: 300, lpq: 5, bus: A.sfx, pan })
  burst({ t, noise: 'brown', f: 220, q: 2, a: 0.1, hold: 0.6, d: 0.5, gain: 0.3 * gain, bus: A.sfx, pan })
  for (let i = 0; i < 9; i++) burst({ t: t + 0.08 + i * 0.09, type: 'lowpass', noise: 'brown', f: 300, a: 0.01, d: 0.06, gain: 0.08 * gain, bus: A.sfx, pan }) // the rattle
}

// A bite (big = the first CHOMP): a hard crack of bone-like modes over a wet crunch.
export function crunch(gain = 1, pan = 0, big = false) {
  if (gain < 0.03 || !limit(big ? 'chomp' : 'crunch', big ? 400 : 160) || !voice(0.4, big ? 2 : 0.8)) return
  const t = now()
  const g = gain * (big ? 1.4 : 1)
  modal({ t, f: vary(big ? 520 : 700, 0.15), modes: WOOD, gain: 0.22 * g, bus: A.sfx, pan, strike: 0.2 * g })
  burst({ t, type: 'lowpass', noise: 'brown', f: big ? 1200 : 900, a: 0.002, d: big ? 0.2 : 0.1, gain: 0.35 * g, bus: A.sfx, pan })
  crinkle({ t: t + 0.01, n: big ? 16 : 7, dur: big ? 0.18 : 0.09, gain: 0.07 * g, f0: 900, f1: 3200, width: 0.25 })
  bubble({ t: t + 0.03, f: vary(220, 0.2), d: 0.06, gain: 0.06 * g, bus: A.sfx, pan })
  if (big) tone({ t, f: 90, f2: 45, d: 0.25, gain: 0.25 * g, bus: A.sfx, pan })
}

// The fighter struggling at its lips: muffled squeaky yelps.
export function struggle() {
  if (!limit('struggle', 800) || !voice(0.6, 2)) return
  const t = now()
  for (let i = 0; i < 3; i++) tone({ t: t + i * 0.14, type: 'triangle', f: vary(640, 0.1), f2: vary(900, 0.1), a: 0.01, d: 0.1, gain: 0.05, lp: 1400, bus: A.sfx })
}

// A slow, deep "HO, HO, HO" (three vowel pulses through a formant).
export function laugh(gain = 1, pan = 0) {
  if (!limit('laugh', 1500) || !voice(1.2, 2)) return
  const t = now()
  for (let i = 0; i < 3; i++) {
    const at = t + i * 0.3
    tone({ t: at, type: 'sawtooth', f: 98 - i * 6, f2: 86 - i * 6, a: 0.03, hold: 0.08, d: 0.16, gain: 0.13 * gain, lp: 560, lpq: 6, bus: A.sfx, pan, verb: 0.3 })
    burst({ t: at, noise: 'pink', f: 450, q: 3, a: 0.02, hold: 0.06, d: 0.14, gain: 0.07 * gain, bus: A.sfx, pan })
  }
}

// Lips smacking after the meal.
export function smack() {
  if (!limit('smack', 600) || !voice(0.3, 1.5)) return
  const t = now()
  burst({ t, f: 1500, q: 2, a: 0.001, d: 0.03, gain: 0.15, bus: A.sfx })
  bubble({ t: t + 0.01, f: 420, d: 0.05, gain: 0.08, rise: 0.6, bus: A.sfx })
  burst({ t: t + 0.09, f: 1300, q: 2, a: 0.001, d: 0.025, gain: 0.1, bus: A.sfx })
}

// A vulture crying far overhead in the desert: a thin, falling, hoarse screech.
export function vultureCry(gain = 1, pan = 0) {
  if (gain < 0.02 || !limit('vulture', 4000) || !voice(0.8, 0.2)) return
  const t = now()
  tone({ t, type: 'sawtooth', f: 1900, f2: 1200, a: 0.03, hold: 0.15, d: 0.35, gain: 0.025 * gain, lp: 2600, lpq: 4, bus: A.amb, pan, verb: 0.5 })
  burst({ t, noise: 'white', f: 2600, f2: 1700, q: 4, a: 0.03, hold: 0.15, d: 0.35, gain: 0.02 * gain, bus: A.amb, pan, verb: 0.5 })
}
