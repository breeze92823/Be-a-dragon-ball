// Progression simulator (BALANCE.md): plays a fresh account through the economy in src/config.js
// many times and prints when each lane zone is first reached, when the last zone is reached and
// the longest stretch with nothing new (treadmill, Dragon Ball, zone, rebirth, base upgrade).
// Run: node tools/balance-sim.mjs   (optional: number of runs per profile, default 120)
//
// It models the real rules (lane distances + orb speed curve, guardian catch zone, hatch luck,
// mutations, treadmill ticks / crits / TAP!! bubbles, base slots + upgrades, rebirths, x2 Speed,
// playtime rewards) but not walking around the hub, the Fuse Machine, spins, quests or dailies.
import { readFileSync, writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'

// config.js reads Vite's import.meta.env; give it an empty one so Node can load it.
const src = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8').replace(/import\.meta\.env/g, '({})')
const file = join(mkdtempSync(join(tmpdir(), 'dbz-balance-')), 'config.mjs')
writeFileSync(file, src)
const C = await import(pathToFileURL(file).href)
const { LANE, ZONES, INDEX, MUTATIONS, TREADMILL: T, PLAYTIME, BOOSTS, BASE, BASE_BOARD: BOARD, RARITIES, TREADMILLS, REBIRTH, BALLS } = C

const roster = {}
INDEX.perRarity.forEach((n, r) => {
  const [lo, hi] = RARITIES[r].income
  roster[RARITIES[r].name] = Array.from({ length: n }, (_, k) => Math.round(lo * Math.pow(hi / lo, n > 1 ? k / (n - 1) : 0)))
})
const mps = (s) => Math.min(LANE.speedCurve.max, LANE.speedCurve.base + LANE.speedCurve.perDecade * Math.log10(1 + s / 1000))
const zoneStart = (k) => (k === 0 ? 0 : 78 + (k - 1) * LANE.corridor.length) // m past the green
const zoneLen = (k) => (k === 0 ? 78 : LANE.corridor.length)
const mutTotal = MUTATIONS.reduce((a, m) => a + m.weight, 0)
function rollMut(luck) {
  if (Math.random() >= LANE.mutationChance * luck) return 1
  let r = Math.random() * mutTotal
  for (const m of MUTATIONS) {
    if (r < m.weight) return m.multi
    r -= m.weight
  }
  return 1
}
const tierAvg = T.tap.tiers.reduce((a, t) => a + t.m * t.w, 0) / T.tap.tiers.reduce((a, t) => a + t.w, 0)
const gapAvg = (T.tap.gap[0] + T.tap.gap[1]) / 2

// tapRate: TAP!! presses per second while a bubble is up; runsPerZone: lane runs a player makes in
// each new zone; rebirths / upgrades: whether they rebirth when ready and buy slot / base upgrades.
function simulate({ tapRate = 2, runsPerZone = 3, rebirths = true, upgrades = true, maxT = 60 * 3600 }) {
  const tickRate = (1 - T.critChance + T.critChance * T.critMulti) / T.every
  const speedPerGain = tickRate + (Math.min(tapRate, 1 / T.tapCooldown) * T.tap.life * tierAvg) / (T.tap.life + gapAvg)
  let ball = 0, t = 0, money = 0, speed = LANE.startSpeed, tm = 0, boostUntil = -1, ptIdx = 0, nReb = 0, baseLevel = 0
  const slots = [] // { inc, lv }
  const runsIn = {}
  const events = [] // [t, label]
  const firstZone = {}
  const ev = (label) => events.push([t, label])
  const multi = () => 1 + nReb * REBIRTH.multiStep
  const train = () => 1 + nReb * (REBIRTH.speedStep ?? 0)
  const baseMulti = () => 1 + baseLevel * BOARD.upgrade.multiStep
  const income = () => slots.reduce((a, s) => a + s.inc * (1 + BASE.levelIncome * (s.lv - 1)), 0) * multi() * baseMulti()
  const cashNeeded = () => REBIRTH.cash * Math.pow(REBIRTH.cashGrowth, nReb)
  const speedNeeded = () => REBIRTH.speed * Math.pow(REBIRTH.speedGrowth, nReb)
  const boostPrice = () => Math.max(BOOSTS.speed.minPrice, BOOSTS.speed.price * cashNeeded())
  const addFighter = (inc) => {
    if (slots.length < BASE.slots) return slots.push({ inc, lv: 1 })
    const w = slots.reduce((a, s) => (s.inc < a.inc ? s : a))
    if (inc > w.inc) w.inc = inc // the slot keeps its level
  }
  const pass = (dt, treadmill = false) => {
    money += income() * dt
    if (treadmill) speed += TREADMILLS[tm].gain * train() * speedPerGain * dt
    t += dt
    while (ptIdx < PLAYTIME.unlocks.length && t >= PLAYTIME.unlocks[ptIdx]) {
      const r = PLAYTIME.rewards[ptIdx++]
      if (r.cash) money += r.cash * multi()
      if (r.fighter) addFighter(roster[r.fighter][r.pick % roster[r.fighter].length])
    }
  }
  const eff = () => speed * (t < boostUntil ? BOOSTS.speed.multi : 1)
  const out = { events, firstZone }
  while (t < maxT) {
    if (out.reachLast == null && eff() >= ZONES[ZONES.length - 2].rec) {
      out.reachLast = t
      ev('REACHED LAST ZONE')
    }
    if (eff() >= ZONES[ZONES.length - 1].rec) {
      out.beat = t
      ev('OUTRAN THE LAST GUARDIAN')
      break
    }
    let best = tm
    TREADMILLS.forEach((m, i) => { if (m.gain > TREADMILLS[best].gain && m.price <= money) best = i })
    if (best !== tm) { money -= TREADMILLS[best].price; tm = best; ev('treadmill ' + TREADMILLS[best].name); pass(10); continue }
    let bb = ball
    BALLS.forEach((b, i) => { if (b.luck > BALLS[bb].luck && b.price <= money && b.price <= income() * 300) bb = i })
    if (bb !== ball) { money -= BALLS[bb].price; ball = bb; ev('ball ' + BALLS[bb].name); pass(10); continue }
    if (rebirths && speed >= speedNeeded() && money >= cashNeeded()) { nReb++; money = 0; speed = LANE.startSpeed; ev('rebirth ' + nReb); pass(5); continue }
    const bp = BOARD.upgrade.prices[baseLevel]
    if (upgrades && bp != null && money >= bp && bp <= income() * 300) { money -= bp; baseLevel++; ev('base upgrade ' + baseLevel); pass(5); continue }
    if (upgrades && slots.length) {
      const s = slots.reduce((a, b) => (b.inc * Math.pow(BASE.upgradeGrowth, b.lv - 1) < a.inc * Math.pow(BASE.upgradeGrowth, a.lv - 1) ? b : a))
      const price = s.inc * BASE.upgradeCost * Math.pow(BASE.upgradeGrowth, s.lv - 1)
      if (money >= price && price / (s.inc * BASE.levelIncome * multi() * baseMulti()) <= 300) { money -= price; s.lv++; pass(1); continue }
    }
    if (t >= boostUntil && money >= boostPrice() && boostPrice() <= income() * 120) { money -= boostPrice(); boostUntil = t + BOOSTS.speed.minutes * 60; pass(3) }
    const zc = ZONES.findIndex((z) => eff() < z.rec) // the zone whose guardian catches you
    if (zc >= 0) {
      const list = roster[ZONES[zc].rarity]
      const avg = list.reduce((a, b) => a + b, 0) / list.length
      const weakest = slots.length < BASE.slots ? 0 : Math.min(...slots.map((s) => s.inc))
      if ((runsIn[zc] ?? 0) < runsPerZone && avg * 1.2 > weakest * 1.3) {
        runsIn[zc] = (runsIn[zc] ?? 0) + 1
        if (firstZone[zc] == null) { firstZone[zc] = t; ev('new zone ' + ZONES[zc].name) }
        const d = zoneStart(zc) + zoneLen(zc) * 0.45 // caught near the guardian's base
        pass(5 + d / mps(eff()) + 1.5 + 12 + (d + 25) / LANE.character.speed + 4 + BASE.placeHold)
        addFighter(list[Math.floor(Math.random() * list.length)] * rollMut(1.2 * BALLS[ball].luck) * 1.2 * (0.8 + Math.random() * 0.5))
        continue
      }
    }
    pass(10, true) // treadmill
  }
  let gap = 0
  const until = out.reachLast ?? t
  for (let i = 1; i < events.length && events[i][0] <= until; i++) gap = Math.max(gap, events[i][0] - events[i - 1][0])
  return { ...out, maxGap: gap, rebirths: nReb }
}

const fmt = (s) => (s == null || s === Infinity ? '--' : s < 3600 ? `${(s / 60).toFixed(1)}m` : `${(s / 3600).toFixed(1)}h`)
const N = +(process.argv[2] ?? 120)
function report(label, opts) {
  const runs = Array.from({ length: N }, () => simulate(opts))
  const med = (f) => runs.map(f).map((v) => v ?? Infinity).sort((x, y) => x - y)[N >> 1]
  console.log(`\n== ${label}`)
  console.log('  first time in each zone: ' + ZONES.map((z, k) => `${z.name} ${fmt(med((r) => r.firstZone[k]))}`).join(' | '))
  console.log(`  last zone ${fmt(med((r) => r.reachLast))}, outrun its guardian ${fmt(med((r) => r.beat))}, rebirths ${med((r) => r.rebirths)}, longest wait before the last zone ${fmt(med((r) => r.maxGap))}`)
}
report('normal: TAP!! ~2/s, 3 runs per zone, rebirths + upgrades', {})
report('idle: never taps, 2 runs per zone, no upgrades', { tapRate: 0, runsPerZone: 2, upgrades: false })
report('grinder: TAP!! ~5/s, 4 runs per zone', { tapRate: 5, runsPerZone: 4 })
report('never rebirths', { rebirths: false })
const one = simulate({})
console.log('\nOne normal playthrough:')
for (const [t, l] of one.events) console.log(`  ${fmt(t).padStart(6)}  ${l}`)
