import { FUSE, MUTATIONS, RARITY_ORDER } from '../config.js'

// Fuse Machine rules, the same as the backend's fuse.ts (which decides when online; these run
// the page's offline fusions and draw the Possible Outcomes). Inputs: [{ rarity, mutation }]
// where mutation is a mutation id or null.

// Tiers in the lane's zone order (= backend FUSE_RARITIES), so a step up is always worth more.
const rarityIndex = (name) => RARITY_ORDER.indexOf(name)
const mutationIdOf = (v) => MUTATIONS.find((m) => m.id === v || m.name === v)?.id ?? null

export const fuseInputs = (fighters) => fighters.map((f) => ({ rarity: f.rarity, mutation: mutationIdOf(f.mutation) }))

export function baseTier(inputs) {
  const sum = inputs.reduce((n, f) => n + Math.max(0, rarityIndex(f.rarity)), 0)
  return Math.round(sum / inputs.length)
}

// [{ rarity, chance }] (chance 0..1), steps folded at the top rarity.
export function outcomes(inputs) {
  const base = baseTier(inputs)
  const total = FUSE.steps.reduce((n, s) => n + s.weight, 0)
  const out = []
  for (const s of FUSE.steps) {
    const rarity = RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, base + s.step)]
    const hit = out.find((o) => o.rarity === rarity)
    if (hit) hit.chance += s.weight / total
    else out.push({ rarity, chance: s.weight / total })
  }
  return out
}

export const fuseSeconds = (tier) => FUSE.seconds[0] + FUSE.seconds[1] * tier

export function rollFusion(inputs, now, rand = Math.random) {
  const list = outcomes(inputs)
  let r = rand()
  let rarity = list[list.length - 1].rarity
  for (const o of list) {
    if (r < o.chance) {
      rarity = o.rarity
      break
    }
    r -= o.chance
  }
  let mutation = inputs.every((f) => f.mutation && f.mutation === inputs[0].mutation) ? inputs[0].mutation : null
  if (!mutation && rand() < FUSE.mutationChance) {
    const total = MUTATIONS.reduce((n, m) => n + m.weight, 0)
    let k = rand() * total
    mutation = MUTATIONS[MUTATIONS.length - 1].id
    for (const m of MUTATIONS) {
      if (k < m.weight) {
        mutation = m.id
        break
      }
      k -= m.weight
    }
  }
  return { inputs, rarity, mutation, pick: Math.floor(rand() * 10000), readyAt: now + fuseSeconds(baseTier(inputs)) * 1000 }
}
