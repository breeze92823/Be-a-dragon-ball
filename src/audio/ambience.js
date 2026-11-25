// The safe zone's sound bed: a soft stereo breeze (stronger out on the sand)
// and the Fuse Machine's hum, placed in the stereo field around the listener.
// Every loop is built once and never restarted; levels, filter and pan only
// move on smoothed ramps (setTargetAtTime), so nothing ever clicks or doubles up.
import { AUDIO } from '../config.js'
import { A, onStart } from './core.js'

const AMB = AUDIO.ambience
let wind = null
let hum = null

onStart((ctx) => {
  // Breeze: stereo pink noise -> lowpass whose cutoff wanders -> level.
  const src = ctx.createBufferSource()
  src.buffer = A.noise.pinkStereo
  src.loop = true
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 500
  lp.Q.value = 0.4
  const g = ctx.createGain()
  g.gain.value = 0
  src.connect(lp).connect(g).connect(A.amb)
  src.start()
  wind = { lp, g }

  // Machine hum: low saw + its octave through a lowpass, plus a faint hiss, panned.
  const out = ctx.createGain()
  out.gain.value = 0
  const pan = ctx.createStereoPanner()
  out.connect(pan).connect(A.amb)
  const hlp = ctx.createBiquadFilter()
  hlp.type = 'lowpass'
  hlp.frequency.value = 340
  hlp.Q.value = 1.2
  hlp.connect(out)
  for (const [type, f, level] of [['sawtooth', 55, 0.35], ['sine', 110, 0.5], ['triangle', 165.4, 0.12]]) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = f
    const og = ctx.createGain()
    og.gain.value = level
    o.connect(og).connect(hlp)
    o.start()
  }
  // Slow throb so it breathes like a motor, not a test tone.
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 2.3
  const depth = ctx.createGain()
  depth.gain.value = 60
  lfo.connect(depth).connect(hlp.frequency)
  lfo.start()
  const hiss = ctx.createBufferSource()
  hiss.buffer = A.noise.pink
  hiss.loop = true
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2200
  bp.Q.value = 0.8
  const hg = ctx.createGain()
  hg.gain.value = 0.05
  hiss.connect(bp).connect(hg).connect(out)
  hiss.start()
  hum = { out, pan }
})

// Distance falloff: half level at `near` m.
export const falloff = (d, near) => 1 / (1 + (d / near) * (d / near))

// st: { x, z (listener), rightX, rightZ (camera right), inDesert, fuse: {x, z} }
let t = 0
export function update(dt, st) {
  if (!wind || !hum) return
  const ctx = A.ctx
  const now = ctx.currentTime
  t += dt
  const gust = 0.75 + 0.25 * Math.sin(t * 0.21) * Math.sin(t * 0.077 + 1)
  wind.g.gain.setTargetAtTime(AMB.wind * gust * (st.inDesert ? 1.5 : 1), now, 0.8)
  wind.lp.frequency.setTargetAtTime(380 + gust * 420 + (st.inDesert ? 250 : 0), now, 0.8)

  const dx = st.fuse.x - st.x
  const dz = st.fuse.z - st.z
  const d = Math.hypot(dx, dz)
  hum.out.gain.setTargetAtTime(AMB.hum * falloff(d, AMB.humNear), now, 0.15)
  hum.pan.pan.setTargetAtTime(panFor(dx, dz, d, st), now, 0.15)
}

// -1..1: how far right of the listener a point is.
export function panFor(dx, dz, d, st) {
  if (d < 0.5) return 0
  return Math.max(-0.85, Math.min(0.85, (dx * st.rightX + dz * st.rightZ) / d))
}
