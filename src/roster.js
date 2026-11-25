import { INDEX, LANE, MUTATIONS, RARITIES } from './config.js'
import { mulberry32 } from './textures.js'
import { fighterLook } from './safezone/fighters.js'

// The fixed fighter roster the Index lists: INDEX.perRarity fighters per rarity (162 in all), each
// with an original generated name, a look (the same figurine everywhere: Index, rewards, lane) and
// a base income inside its rarity's range (rarer fighters in a rarity earn more). Built once from
// INDEX.seed, so every client and every session agrees on it.
//
// A fighter's Index identity is (mutation, name): indexKey() -> "golden.kairo".

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)

function buildRoster() {
  const rand = mulberry32(INDEX.seed)
  const pick = (a) => a[Math.floor(rand() * a.length)]
  const used = new Set()
  const list = []
  INDEX.perRarity.forEach((count, r) => {
    const rarity = RARITIES[r]
    if (!rarity) return
    for (let k = 0; k < count; k++) {
      let name = ''
      for (let tries = 0; tries < 50 && (!name || used.has(slug(name))); tries++) {
        const base = pick(INDEX.first) + pick(INDEX.last)
        const roll = rand()
        if (r >= 3 && roll < 0.35) name = `${pick(INDEX.titles)} ${base}`
        else if (r >= 1 && roll > 0.9) name = `${pick(INDEX.numbered)} ${1 + Math.floor(rand() * 20)}`
        else name = base
      }
      used.add(slug(name))
      const t = count > 1 ? k / (count - 1) : 0
      const [lo, hi] = rarity.income
      const seed = Math.floor(rand() * 2 ** 31)
      list.push({
        key: slug(name),
        name,
        rarity: rarity.name,
        rarityIndex: r,
        income: Math.round(lo * Math.pow(hi / lo, t)),
        look: fighterLook(mulberry32(seed)),
      })
    }
  })
  return list
}

export const ROSTER = buildRoster()
const byKey = new Map(ROSTER.map((f) => [f.key, f]))
const byRarity = new Map()
for (const f of ROSTER) {
  if (!byRarity.has(f.rarity)) byRarity.set(f.rarity, [])
  byRarity.get(f.rarity).push(f)
}

export const rosterFor = (rarity) => byRarity.get(rarity) ?? ROSTER.slice(0, 1)
export const rosterEntry = (name) => byKey.get(slug(name ?? '')) ?? null
// The roster fighter a config entry like { fighter: 'Rare', pick: 5 } means.
export function rosterPick(rarity, pick = 0) {
  const list = rosterFor(rarity)
  return list[((pick % list.length) + list.length) % list.length]
}

export const mutationOf = (name) => MUTATIONS.find((m) => m.name === name || m.id === name) ?? null
export const mutationId = (name) => mutationOf(name)?.id ?? 'default'
// Index key of a fighter { name, mutation } ("default.kairo", "golden.kairo").
export const indexKey = (f) => `${mutationId(f.mutation)}.${slug(f.name ?? '')}`

// A mutation for a hatch (or null): LANE.mutationChance x luck, then weighted by MUTATIONS.weight.
export function rollMutation(rand = Math.random, luck = 1) {
  if (rand() >= LANE.mutationChance * luck) return null
  const total = MUTATIONS.reduce((n, m) => n + m.weight, 0)
  let r = rand() * total
  for (const m of MUTATIONS) {
    if (r < m.weight) return m
    r -= m.weight
  }
  return MUTATIONS[0]
}

// A whole fighter object (state.js shape) for a roster entry, e.g. a reward. id comes from the caller.
export function makeFighter(entry, id, mutation = null, multi = 1) {
  const mu = mutation ? mutationOf(mutation) : null
  return {
    id,
    name: entry.name,
    rarity: entry.rarity,
    mutation: mu?.name ?? null,
    income: Math.max(1, Math.round(entry.income * (mu?.multi ?? 1) * multi)),
    look: { ...entry.look },
  }
}
