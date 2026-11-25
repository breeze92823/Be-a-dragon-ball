// Treadmill sounds (treadmill.js), synthesised like the rest (synth.js recipes):
//  deploy()  - the machine thumping down and its motor servo winding up, with a sparkle
//  stow()    - the motor winding down and a soft poof
//  motor()   - a looping belt hum: low motor buzz + rubber belt hiss + a seam thump per
//              belt turn; returns { set(k 0..1), stop() } (null before audio has started)
//  gain(n)   - a Speed tick: a bright pluck stepping up a pentatonic scale with the streak
//  crit()    - a power stride (+1000): a bell chord with a rising shimmer
//  tap()     - a TAP!! press: a punchy click and a little whoosh
//  collect() - a shoe reaching the Speed counter: a tiny glassy tick
//  deny()    - can't put a treadmill here: two soft low blips
//  bagOpen() / bagClose() - the Backpack (backpack.js): a cloth zip up / down
import { A, now, voice } from './core.js'
import { burst, modal, tone, rnd, vary } from './synth.js'

const GLOCK = [[1, 1, 1.0], [2.756, 0.32, 0.35], [5.404, 0.1, 0.14]]
const BELL = [[0.5, 0.25, 1.2], [1, 1, 1.0], [1.19, 0.4, 0.7], [1.5, 0.28, 0.6], [2, 0.38, 0.5], [2.66, 0.2, 0.3]]
const METAL = [[1, 1, 0.16], [2.4, 0.5, 0.08], [3.9, 0.3, 0.05], [5.3, 0.15, 0.03]]
const GLASS = [[1, 1, 0.22], [2.32, 0.5, 0.14], [4.25, 0.28, 0.08]]
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]
const semi = (n) => Math.pow(2, n / 12)

const lastAt = new Map()
function limit(name, ms) {
  const t = performance.now()
  if (t - (lastAt.get(name) ?? -1e9) < ms) return false
  lastAt.set(name, t)
  return true
}
const ready = () => !!A.master

export function deploy() {
  if (!ready() || !limit('tm-deploy', 300) || !voice(1.2, 2)) return
  const t = now()
  const bus = A.sfx
  // Heavy plastic body landing.
  burst({ t, type: 'lowpass', noise: 'brown', f: 520, a: 0.003, d: 0.22, gain: 0.32, bus })
  tone({ t, f: 140, f2: 55, d: 0.2, gain: 0.22, bus })
  modal({ t: t + 0.01, f: vary(420, 0.05), modes: METAL, gain: 0.08, bus, strike: 0.05, verb: 0.15 })
  // Servo winding up.
  tone({ t: t + 0.08, type: 'sawtooth', f: 90, f2: 340, glide: 0.45, a: 0.06, hold: 0.25, d: 0.25, gain: 0.05, lp: 1400, bus })
  burst({ t: t + 0.08, f: 400, f2: 2600, q: 1.4, a: 0.2, d: 0.3, gain: 0.05, bus })
  // Sparkle.
  ;[0, 4, 7, 12].forEach((n, i) => modal({ t: t + 0.22 + i * 0.05, f: 1046.5 * semi(n), modes: GLOCK, gain: 0.045, bus: A.ui, pan: (i - 1.5) * 0.2, verb: 0.35 }))
}

export function stow() {
  if (!ready() || !limit('tm-stow', 300) || !voice(0.8, 1.5)) return
  const t = now()
  const bus = A.sfx
  tone({ t, type: 'sawtooth', f: 300, f2: 60, glide: 0.35, a: 0.01, d: 0.4, gain: 0.05, lp: 1100, bus })
  burst({ t: t + 0.05, f: 2400, f2: 500, q: 0.8, a: 0.02, d: 0.35, gain: 0.07, bus, verb: 0.2 })
  burst({ t: t + 0.12, type: 'lowpass', noise: 'pink', f: 900, a: 0.01, d: 0.25, gain: 0.12, bus })
}

// Looping belt hum. set(k) eases the level and the belt rate; stop() fades it out.
export function motor() {
  if (!ready()) return null
  const ctx = A.ctx
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(A.sfx)

  // Motor: two detuned saws through a lowpass (an electric buzz, not a beep).
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 320
  lp.Q.value = 1.2
  const motorGain = ctx.createGain()
  motorGain.gain.value = 0.11
  lp.connect(motorGain).connect(out)
  const oscs = [-7, 7].map((cents) => {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = 55
    o.detune.value = cents
    o.connect(lp)
    o.start()
    return o
  })
  // Belt hiss: looping pink noise through a bandpass.
  const noise = ctx.createBufferSource()
  noise.buffer = A.noise.pink
  noise.loop = true
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1100
  bp.Q.value = 0.8
  const hissGain = ctx.createGain()
  hissGain.gain.value = 0.05
  noise.connect(bp).connect(hissGain).connect(out)
  noise.start()
  // Seam thump: an LFO wobbling the hiss once per belt turn.
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 2
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 0.025
  lfo.connect(lfoDepth).connect(hissGain.gain)
  lfo.start()

  let stopped = false
  return {
    set(k) {
      if (stopped) return
      const t = ctx.currentTime
      out.gain.setTargetAtTime(0.55 * k, t, 0.12)
      for (const o of oscs) o.frequency.setTargetAtTime(38 + 30 * k, t, 0.2)
      lp.frequency.setTargetAtTime(180 + 260 * k, t, 0.2)
      lfo.frequency.setTargetAtTime(0.5 + 2.2 * k, t, 0.2)
    },
    stop() {
      if (stopped) return
      stopped = true
      const t = ctx.currentTime
      out.gain.cancelScheduledValues(t)
      out.gain.setTargetAtTime(0, t, 0.12)
      const end = t + 0.8
      for (const o of oscs) o.stop(end)
      noise.stop(end)
      lfo.stop(end)
      setTimeout(() => out.disconnect(), 1000)
    },
  }
}

export function gain(streak = 0) {
  if (!ready() || !limit('tm-gain', 70) || !voice(0.5, 0.8)) return
  const t = now()
  const f = 784 * semi(PENTA[streak % PENTA.length])
  modal({ t, f: vary(f, 0.004), modes: GLOCK, gain: 0.06, bus: A.ui, pan: rnd(-0.2, 0.2), verb: 0.25 })
  burst({ t, f: 2200, f2: 5200, q: 1.1, a: 0.01, d: 0.12, gain: 0.025, bus: A.ui })
}

export function crit() {
  if (!ready() || !limit('tm-crit', 250) || !voice(1.6, 2)) return
  const t = now()
  const bus = A.ui
  ;[0, 4, 7].forEach((n, i) => modal({ t: t + i * 0.035, f: 659 * semi(n), modes: BELL, beat: 3, gain: 0.07, bus, pan: (i - 1) * 0.3, verb: 0.45 }))
  burst({ t, f: 800, f2: 7000, q: 0.7, a: 0.12, d: 0.45, gain: 0.05, bus, verb: 0.3 })
  ;[12, 16, 19, 24].forEach((n, i) => modal({ t: t + 0.18 + i * 0.045, f: 659 * semi(n), modes: GLOCK, gain: 0.04, bus, verb: 0.4 }))
}

// A TAP!! bubble popping up: a quick rising blip, higher and sparklier for bigger multipliers.
export function tapAppear(m = 2) {
  if (!ready() || !limit('tm-tapA', 150) || !voice(0.6, 1.5)) return
  const t = now()
  const bus = A.ui
  const base = 740 * semi((m - 2) * 2)
  tone({ t, f: base, f2: base * 1.5, glide: 0.09, d: 0.14, gain: 0.08, bus, verb: 0.2 })
  modal({ t: t + 0.07, f: base * 2, modes: GLASS, gain: 0.06, bus, verb: 0.3 })
  if (m >= 4) [0, 4, 7, 12].forEach((n, i) => modal({ t: t + 0.12 + i * 0.05, f: base * 2 * semi(n), modes: GLOCK, gain: 0.04, bus, verb: 0.4 }))
}

// A TAP!! press; the bigger the multiplier the higher it rings.
export function tap(m = 2) {
  if (!ready() || !limit('tm-tap', 60) || !voice(0.3, 1)) return
  const t = now()
  const bus = A.ui
  const up = semi((m - 2) * 2)
  burst({ t, type: 'lowpass', noise: 'brown', f: 1200, a: 0.001, d: 0.05, gain: 0.2, bus })
  tone({ t, f: vary(620, 0.04) * up, f2: 980 * up, d: 0.08, gain: 0.07, bus })
  burst({ t: t + 0.01, f: 1500, f2: 4500, q: 1, a: 0.01, d: 0.12, gain: 0.04, bus })
}

export function collect() {
  if (!ready() || !limit('tm-collect', 45) || !voice(0.25, 0.5)) return
  modal({ t: now(), f: vary(2600, 0.05), modes: GLASS, gain: 0.03, bus: A.ui, pan: -0.5 })
}

export function deny() {
  if (!ready() || !limit('tm-deny', 400) || !voice(0.4, 1)) return
  const t = now()
  tone({ t, type: 'triangle', f: 330, d: 0.09, gain: 0.08, bus: A.ui })
  tone({ t: t + 0.11, type: 'triangle', f: 247, d: 0.14, gain: 0.08, bus: A.ui })
}

// Backpack zip: a run of tiny noise ticks sweeping up (open) or down (close).
function zip(up) {
  if (!ready() || !limit('bp-zip', 150) || !voice(0.4, 0.8)) return
  const t = now()
  for (let i = 0; i < 9; i++) {
    const k = up ? i / 8 : 1 - i / 8
    burst({ t: t + i * 0.018, f: 1800 + 2600 * k, q: 2.5, a: 0.001, d: 0.012, gain: 0.05, bus: A.ui })
  }
  burst({ t, type: 'lowpass', noise: 'pink', f: 700, a: 0.01, d: 0.12, gain: 0.06, bus: A.ui })
}
export const bagOpen = () => zip(true)
export const bagClose = () => zip(false)
