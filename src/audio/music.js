// Background music, synthesised and generative, one mood at a time:
//   safe   - the hub: warm major-7th pads, a soft kalimba wandering a pentatonic scale,
//            a round sine bass (calm, unhurried)
//   lane   - out on the lane: dorian, a little quicker, a hand-drum pulse and a bass ostinato
//   hatch  - carried / hatching: a slow suspended pad swell, no drums (mysterious)
//   chase  - running home / a guardian closing in: minor, driving low eighth-note bass and
//            low toms, short pad stabs (tense, but never shrill)
// Everything is low and warm: no noise hats, every voice lowpassed and the whole music
// bus behind a gentle lowpass, so it sits under the sound effects instead of fighting them.
//
// No clicks, no pile-ups: one look-ahead scheduler on the audio clock, every note on a
// smooth envelope that starts and ends at silence, a hard polyphony cap (notes past it are
// skipped), and mood changes fade the bus out, switch on a bar line and fade back in. The
// music feeds A.amb (Settings > Mute Music silences it) under A.world (ducks for windows),
// and the master glue compressor + limiter catch whatever is left.
import { AUDIO } from '../config.js'
import { A, onStart } from './core.js'

const M = AUDIO.music
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12)

// Per mood: tempo, chords (midi roots + intervals), scale for the melody (midi), bass
// pattern (16 steps: semitones above the chord root, null = rest), drum pattern
// (16 steps: 1 low tom, 2 high-ish tom, 0 rest), melody density, pad style.
const MOODS = {
  safe: {
    bpm: M.tempo.safe,
    chords: [[48, [0, 4, 7, 11]], [45, [0, 3, 7, 10]], [41, [0, 4, 7, 11]], [43, [0, 4, 7, 9]]],
    scale: [60, 62, 64, 67, 69, 72, 74, 76],
    bass: [0, null, null, null, null, null, 7, null, 0, null, null, null, null, null, null, null],
    drums: null,
    melody: 0.32,
    pad: 'long',
  },
  lane: {
    bpm: M.tempo.lane,
    chords: [[50, [0, 3, 7, 10, 14]], [48, [0, 4, 7, 11]], [46, [0, 4, 7, 11]], [45, [0, 3, 7, 10]]],
    scale: [62, 64, 65, 67, 69, 71, 72, 74],
    bass: [0, null, null, 0, null, null, 7, null, 0, null, null, 12, null, null, 7, null],
    drums: [1, 0, 0, 0, 2, 0, 0, 1, 0, 0, 1, 0, 2, 0, 0, 0],
    melody: 0.4,
    pad: 'long',
  },
  hatch: {
    bpm: M.tempo.hatch,
    chords: [[45, [0, 5, 7, 14]], [44, [0, 5, 7, 14]]],
    scale: [69, 71, 76, 81],
    bass: [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    drums: null,
    melody: 0.12,
    pad: 'swell',
  },
  chase: {
    bpm: M.tempo.chase,
    chords: [[40, [0, 3, 7]], [36, [0, 4, 7]], [38, [0, 4, 7]], [35, [0, 4, 7, 10]]],
    scale: [64, 67, 69, 71, 72, 74],
    bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 7, 12, 7],
    drums: [1, 0, 0, 0, 1, 0, 2, 0, 1, 0, 0, 0, 1, 0, 2, 2],
    melody: 0.18,
    pad: 'stab',
  },
}

let out = null // music bus (level), into the bus lowpass
let mood = null // playing
let want = 'safe' // requested
let switching = false
let nextStep = 0 // audio time of the next 16th
let step = 0
let bar = 0
let voices = 0
let lastMel = 3

onStart((ctx) => {
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = M.lowpass
  lp.Q.value = 0.5
  out = ctx.createGain()
  out.gain.value = 0
  out.connect(lp).connect(A.amb)
  mood = want
  nextStep = ctx.currentTime + 0.3
  out.gain.setTargetAtTime(M.level, ctx.currentTime, 1.5) // fade in
})

// One note voice: oscillator(s) -> lowpass -> envelope -> music bus. Returns false when skipped.
function note({ t, f, type = 'sine', a = 0.01, hold = 0, d = 0.5, gain = 0.1, lp = 1800, detune = 0, partials = null }) {
  if (voices >= M.maxVoices) return false
  const ctx = A.ctx
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + a)
  if (hold) g.gain.setValueAtTime(gain, t + a + hold)
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + d)
  const f1 = ctx.createBiquadFilter()
  f1.type = 'lowpass'
  f1.frequency.value = lp
  f1.Q.value = 0.6
  f1.connect(g).connect(out)
  const end = t + a + hold + d + 0.05
  const list = partials ?? [[1, 1]]
  for (const [ratio, amp] of list) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = f * ratio
    if (detune) o.detune.value = detune
    let src = o
    if (amp !== 1) {
      const pg = ctx.createGain()
      pg.gain.value = amp
      o.connect(pg)
      src = pg
    }
    src.connect(f1)
    o.start(t)
    o.stop(end)
    if (ratio === list[0][0]) {
      voices++
      o.onended = () => voices--
    }
  }
  return true
}

// Soft kalimba: sine + an inharmonic overtone that dies fast (the tine), gently lowpassed.
function kalimba(t, n, gain) {
  note({ t, f: midi(n), a: 0.004, d: 1.4, gain, lp: 2200, partials: [[1, 1], [2.76, 0.18], [5.4, 0.05]] })
}
// Warm pad: two detuned triangles per chord tone, slow attack/release, dark filter.
function pad(t, notes, dur, style) {
  const a = style === 'stab' ? 0.03 : style === 'swell' ? dur * 0.45 : 0.9
  const d = style === 'stab' ? 0.35 : 1.2
  const hold = style === 'stab' ? 0.05 : Math.max(0, dur - a - 0.3)
  const gain = style === 'stab' ? 0.028 : 0.022
  for (const n of notes) {
    note({ t, f: midi(n), type: 'triangle', a, hold, d, gain, lp: style === 'stab' ? 700 : 950, detune: -6 })
    note({ t, f: midi(n), type: 'triangle', a, hold, d, gain, lp: style === 'stab' ? 700 : 950, detune: 6 })
  }
}
function bass(t, n, len, gain) {
  note({ t, f: midi(n), a: 0.02, hold: len * 0.5, d: len * 0.6, gain, lp: 420, partials: [[1, 1], [2, 0.25]] })
}
// Low hand drum: a sine whose pitch drops, no noise on top (nothing hissy).
function drum(t, kind, gain) {
  if (voices >= M.maxVoices) return
  const ctx = A.ctx
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  const f0 = kind === 1 ? 110 : 170
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.18)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.36)
  voices++
  o.onended = () => voices--
}

function schedule(m, t, len) {
  const chord = m.chords[bar % m.chords.length]
  const [root, ivs] = chord
  const s = step
  // Pads: once a bar (stabs on the off-beats in the chase).
  if (m.pad === 'stab') {
    if (s === 0 || s === 6 || s === 10) pad(t, ivs.map((i) => root + 12 + i), len * 2, 'stab')
  } else if (s === 0) pad(t, ivs.map((i) => root + 12 + i), len * 16, m.pad)
  // Bass.
  const b = m.bass[s]
  if (b != null) bass(t, root - 12 + b + (root < 44 ? 12 : 0), len * (m === MOODS.chase ? 1.4 : 3), m === MOODS.chase ? 0.11 : 0.09)
  // Drums.
  if (m.drums && m.drums[s]) drum(t, m.drums[s], m.drums[s] === 1 ? 0.16 : 0.09)
  // Melody: a random walk over the scale on 8ths, resting often; lands on chord tones on beat 1.
  if (s % 2 === 0 && Math.random() < m.melody * (s === 0 ? 1.6 : 1)) {
    lastMel = Math.max(0, Math.min(m.scale.length - 1, lastMel + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]))
    kalimba(t, m.scale[lastMel], m === MOODS.chase ? 0.035 : 0.05)
  }
}

// Called every frame: keeps ~0.25 s of notes scheduled ahead, handles mood switches.
export function updateMusic(nextMood) {
  if (!out || A.ctx.state !== 'running') return
  if (nextMood && nextMood !== want) want = nextMood
  const ctx = A.ctx
  if (want !== mood && !switching) {
    // Fade out, switch on the next bar line, fade back in.
    switching = true
    out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.35)
    setTimeout(() => {
      mood = want
      step = 0
      bar = 0
      nextStep = Math.max(nextStep, A.ctx.currentTime + 0.05)
      out.gain.setTargetAtTime(M.level * (M.moodLevel[mood] ?? 1), A.ctx.currentTime, 0.6)
      switching = false
    }, 1100)
  }
  if (switching) return
  const m = MOODS[mood]
  const len = 60 / m.bpm / 4 // one 16th
  // After a stall (tab in the background) never catch up with a burst: skip ahead.
  if (nextStep < ctx.currentTime - 0.2) nextStep = ctx.currentTime + 0.05
  while (nextStep < ctx.currentTime + 0.25) {
    schedule(m, nextStep, len)
    nextStep += len
    step = (step + 1) % 16
    if (step === 0) bar++
  }
}
