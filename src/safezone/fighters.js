import { Group } from 'three'
import { RARITIES, MUTATIONS } from '../config.js'
import { M, box, boxC, cone, deg } from './kit.js'
import { short } from './text.js'

// Blocky martial-artist figurines that stand on base slots and the stalls.
// ~30 parts each (boots, gi, belt, sleeves, wristbands, face, spiky hair...),
// all from shared geometry + cached materials so a base full of them bakes
// down to a handful of draw calls. Original designs, varied by a seed.

const GI = ['#ff7a1a', '#1f5ed8', '#7b3fe0', '#2bb04a', '#d8262e', '#f4f4f4', '#1d2a44', '#ffcf2a', '#e94fa8', '#18b8c9']
const PANTS = ['#1f5ed8', '#ff7a1a', '#20283c', '#f4f4f4', '#6b3a1e', '#7b3fe0']
const HAIR = ['#111318', '#111318', '#ffd23a', '#ffe76a', '#4fd3ff', '#ff5fb1', '#f4f4f4', '#8a5bff', '#2b2b2b', '#c43b2b']
const SKIN = ['#f2c79a', '#e8b384', '#c98d5c', '#8fd16a', '#b6c3ff', '#f7d7b4']
const NAMES = ['Kairo', 'Zenbu', 'Rokka', 'Tamo', 'Veltra', 'Gorin', 'Shiro', 'Brakk', 'Nimbo', 'Koda', 'Yuzan', 'Raiko', 'Senji', 'Ozuru', 'Fenn', 'Juro', 'Mako', 'Tessa', 'Ryn', 'Haku', 'Dorun', 'Lumo', 'Kenta', 'Saru', 'Voltan', 'Iza', 'Gryn', 'Pako']

export function fighterLook(rand) {
  const p = (a) => a[Math.floor(rand() * a.length)]
  return {
    gi: p(GI),
    pants: p(PANTS),
    hair: p(HAIR),
    skin: p(SKIN),
    belt: p(['#1d2a44', '#1f5ed8', '#d8262e', '#111318']),
    boots: p(['#1f5ed8', '#d8262e', '#f4f4f4', '#2a1d14', '#ffcf2a']),
    style: Math.floor(rand() * 4), // hair: 0 spiky, 1 tall flame, 2 swept back, 3 short + headband
    stance: Math.floor(rand() * 3), // 0 fists up, 1 arms crossed-ish, 2 power pose
    cape: rand() < 0.18,
  }
}

// Picks a rarity index weighted toward the common end (a base's floors get rarer upward).
export function rollRarity(rand, bias = 0) {
  const r = Math.pow(rand(), 1.7 - Math.min(1.2, bias))
  return Math.min(RARITIES.length - 1, Math.floor(r * RARITIES.length))
}

// Label lines for a fighter: [mutation], name, rarity, +income/s.
export function fighterLabel(rand, rarityIndex) {
  const R = RARITIES[rarityIndex]
  const name = NAMES[Math.floor(rand() * NAMES.length)]
  const income = R.income[0] * Math.pow(R.income[1] / R.income[0], rand())
  const lines = []
  if (rand() < 0.3) {
    const mu = MUTATIONS[Math.floor(rand() * MUTATIONS.length)]
    lines.push({ t: mu.name, px: 26, color: mu.color })
  }
  lines.push({ t: name, px: 44, color: '#ffffff' })
  lines.push({ t: R.name, px: 32, color: R.color, outline: R.outline ?? '#0b1a3a' })
  lines.push({ t: `+${short(income)}/s`, px: 32, color: '#9dff3a' })
  return { lines, income, rarity: R }
}

// Builds one figurine (feet at the group origin, facing +Z) into `parent`.
// height ~2.1 m at scale 1. mat: optional single material (statues).
export function buildFighter(parent, look, x, y, z, yaw = 0, scale = 1, mat = null) {
  const g = new Group()
  g.position.set(x, y, z)
  g.rotation.y = yaw
  g.scale.setScalar(scale)
  parent.add(g)
  const m = (c, o) => mat ?? M(c, o)
  const skin = m(look.skin, { rough: 0.7 })
  const gi = m(look.gi, { rough: 0.75 })
  const pants = m(look.pants, { rough: 0.75 })
  const belt = m(look.belt)
  const boots = m(look.boots, { rough: 0.5 })
  const hair = m(look.hair, { rough: 0.6 })
  const dark = mat ?? M('#14161c', { rough: 0.4 })
  const white = mat ?? M('#ffffff', { rough: 0.4 })

  // Legs + boots (boots stick out past the trouser legs on every side: no shared faces).
  for (const s of [-1, 1]) {
    box(g, boots, 0.36, 0.28, 0.5, s * 0.2, 0, 0.04)
    box(g, boots, 0.38, 0.08, 0.52, s * 0.2, 0.28, 0.04) // boot cuff
    box(g, pants, 0.33, 0.66, 0.36, s * 0.2, 0.3, 0)
    box(g, pants, 0.35, 0.18, 0.38, s * 0.2, 0.62, 0) // baggy knee
  }
  // Hips + belt with a knot.
  box(g, pants, 0.78, 0.22, 0.42, 0, 0.92, 0)
  box(g, belt, 0.84, 0.14, 0.48, 0, 1.08, 0)
  box(g, belt, 0.12, 0.2, 0.08, 0.16, 0.94, 0.25)
  box(g, belt, 0.12, 0.2, 0.08, 0.3, 0.92, 0.25, deg(10))
  // Torso: gi top, undershirt V, collar trims.
  box(g, gi, 0.82, 0.68, 0.44, 0, 1.2, 0)
  box(g, m('#1d2a44'), 0.3, 0.36, 0.04, 0, 1.5, 0.215)
  box(g, gi, 0.18, 0.5, 0.05, -0.17, 1.38, 0.22, 0, 0, deg(-16))
  box(g, gi, 0.18, 0.5, 0.05, 0.17, 1.38, 0.22, 0, 0, deg(16))
  if (look.cape) box(g, m('#f4f4f4', { rough: 0.8 }), 0.9, 1.25, 0.06, 0, 0.55, -0.27, 0, deg(-6))
  // Shoulder pads for some looks.
  if (look.style === 1) {
    for (const s of [-1, 1]) box(g, white, 0.34, 0.16, 0.5, s * 0.5, 1.78, 0, 0, 0, s * deg(-14))
  }
  // Arms per stance.
  const arm = (s, shoulderX, swingX, swingZ, elbow) => {
    const a = new Group()
    a.position.set(s * shoulderX, 1.82, 0)
    a.rotation.set(swingX, 0, s * swingZ)
    g.add(a)
    boxC(a, gi, 0.3, 0.38, 0.32, 0, -0.17, 0) // sleeve
    const fore = new Group()
    fore.position.set(0, -0.36, 0)
    fore.rotation.x = elbow
    a.add(fore)
    boxC(fore, skin, 0.24, 0.36, 0.26, 0, -0.17, 0)
    boxC(fore, m('#d8262e'), 0.28, 0.12, 0.3, 0, -0.3, 0) // wristband
    boxC(fore, skin, 0.27, 0.22, 0.27, 0, -0.46, 0) // fist
  }
  if (look.stance === 0) {
    arm(-1, 0.55, deg(-50), deg(12), deg(-80))
    arm(1, 0.55, deg(-25), deg(10), deg(-100))
  } else if (look.stance === 1) {
    arm(-1, 0.55, deg(-12), deg(8), deg(-20))
    arm(1, 0.55, deg(-12), deg(8), deg(-20))
  } else {
    arm(-1, 0.55, deg(10), deg(40), deg(-30))
    arm(1, 0.55, deg(10), deg(40), deg(-30))
  }
  // Neck + head + face.
  box(g, skin, 0.24, 0.14, 0.24, 0, 1.88, 0)
  box(g, skin, 0.54, 0.54, 0.5, 0, 2.0, 0)
  for (const s of [-1, 1]) {
    box(g, white, 0.14, 0.1, 0.03, s * 0.12, 2.24, 0.25)
    box(g, dark, 0.07, 0.09, 0.03, s * 0.1, 2.245, 0.262)
    box(g, hair, 0.17, 0.05, 0.04, s * 0.12, 2.33, 0.25, 0, 0, s * deg(-12)) // brows
    box(g, skin, 0.06, 0.14, 0.12, s * 0.29, 2.17, 0) // ears
  }
  box(g, m('#9a4a3a'), 0.16, 0.04, 0.03, 0, 2.08, 0.25) // mouth
  // Hair.
  box(g, hair, 0.58, 0.16, 0.54, 0, 2.47, -0.01)
  box(g, hair, 0.58, 0.36, 0.14, 0, 2.15, -0.22)
  const spikes = (list, r, h) => {
    for (const [sx, sy, sz, tx, tz] of list) cone(g, hair, r, h, sx, sy, sz, 5, 0, deg(tx), deg(tz))
  }
  if (look.style === 0) {
    spikes([[0, 2.75, 0, 0, 0], [-0.2, 2.7, 0.05, 8, 30], [0.2, 2.7, 0.05, 8, -30], [-0.12, 2.68, -0.2, -30, 18], [0.12, 2.68, -0.2, -30, -18], [0, 2.62, 0.22, 40, 0], [-0.3, 2.45, -0.05, 0, 60], [0.3, 2.45, -0.05, 0, -60]], 0.14, 0.5)
  } else if (look.style === 1) {
    spikes([[0, 2.95, -0.02, -6, 0], [-0.18, 2.88, 0, -4, 14], [0.18, 2.88, 0, -4, -14], [-0.1, 2.85, -0.2, -22, 8], [0.1, 2.85, -0.2, -22, -8], [0, 2.78, 0.2, 18, 0], [-0.3, 2.6, -0.06, 0, 38], [0.3, 2.6, -0.06, 0, -38]], 0.15, 0.95)
  } else if (look.style === 2) {
    spikes([[0, 2.55, -0.3, -70, 0], [-0.18, 2.55, -0.28, -70, 12], [0.18, 2.55, -0.28, -70, -12], [0, 2.32, -0.34, -100, 0], [-0.2, 2.32, -0.32, -100, 15], [0.2, 2.32, -0.32, -100, -15]], 0.13, 0.6)
  } else {
    box(g, m('#d8262e'), 0.6, 0.1, 0.56, 0, 2.36, 0) // headband
    box(g, m('#d8262e'), 0.08, 0.3, 0.04, 0.1, 2.12, -0.29, 0, deg(12), deg(14))
    spikes([[-0.14, 2.64, 0.05, 10, 20], [0.14, 2.64, 0.05, 10, -20], [0, 2.66, -0.12, -20, 0]], 0.13, 0.32)
  }
  return g
}
