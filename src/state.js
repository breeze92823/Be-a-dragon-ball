import { LANE, BASE, BASE_BOARD, BALLS, BOOSTS, GAME_SETTINGS, REBIRTH, TREADMILLS } from './config.js'

// The player's progress: money, Speed stat, the fighters in the hotbar and the
// Backpack, and the ones placed on base slots. Saved ONLY on the game server
// (net.js): snapshot() is what saveProgress carries, hydrate() applies the
// server's saved doc. Nothing is kept in the browser.
//
// fighter: { id, name, rarity, mutation, income (per s), look }
// slot:    { fighter | null, level, stored (cash waiting on the pad) }

export const state = {
  money: 0,
  speed: LANE.startSpeed,
  inventory: [], // fighters in the hotbar, in slot order (keys 1-9, 0)
  backpack: [], // fighters in the Backpack (backpack.js), beyond the hotbar
  selected: -1, // hotbar index held in the hands (-1 = none)
  slots: Array.from({ length: BASE.slots }, () => ({ fighter: null, level: 1, stored: 0 })),
  nextId: 1,
  // Windows (src/ui/): rebirths, total s played, Index discoveries ("mutation.name", roster.js
  // indexKey), mutations whose Index base skin is unlocked, boost end times (epoch ms), Settings.
  rebirths: 0,
  playtime: 0,
  discovered: new Set(),
  indexClaimed: [],
  speedBoostUntil: 0,
  luckBoostUntil: 0,
  settings: { ...GAME_SETTINGS },
  // Shops (src/ui/): equipped base skin ("" = Default), owned + equipped treadmill and Dragon
  // Ball ("" = the starter one, always owned), x2 Money boost end time.
  baseSkin: '',
  treadmills: [],
  treadmill: '',
  balls: [],
  ball: '',
  moneyBoostUntil: 0,
  // Base boards (base/board.js): Base Upgrade steps bought, Auto Collect owned + switched on,
  // Upgrade Max All owned.
  baseLevel: 0,
  autoCollect: false,
  autoCollectOn: true,
  upgradeMax: false,
}

const listeners = new Set()
export function onState(fn) {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}
let dirty = false
export function changed() {
  dirty = true
  for (const fn of listeners) fn(state)
}

// Progress arrives from the game server (net.js -> hydrate); nothing to read locally.
export function load() {}

// The whole saved progress (backend sanitize.ts bounds every field).
export function snapshot() {
  return {
    money: state.money, speed: state.speed, inventory: state.inventory, backpack: state.backpack, slots: state.slots, nextId: state.nextId,
    rebirths: state.rebirths, playtime: Math.floor(state.playtime), discovered: [...state.discovered], indexClaimed: state.indexClaimed,
    speedBoostUntil: state.speedBoostUntil, luckBoostUntil: state.luckBoostUntil, settings: state.settings,
    baseSkin: state.baseSkin, treadmills: state.treadmills, treadmill: state.treadmill, balls: state.balls, ball: state.ball, moneyBoostUntil: state.moneyBoostUntil,
    baseLevel: state.baseLevel, autoCollect: state.autoCollect, autoCollectOn: state.autoCollectOn, upgradeMax: state.upgradeMax,
  }
}

// Applies the server's saved doc (fields it lacks keep their current value).
export function hydrate(doc) {
  if (!doc || typeof doc !== 'object') return
  if (typeof doc.money === 'number') state.money = doc.money
  if (typeof doc.speed === 'number') state.speed = Math.max(LANE.startSpeed, doc.speed)
  const fighters = (a) => (Array.isArray(a) ? a.filter((f) => f && f.look) : [])
  if (Array.isArray(doc.inventory)) {
    const all = fighters(doc.inventory)
    state.inventory = all.slice(0, LANE.hotbarSlots)
    state.backpack = all.slice(LANE.hotbarSlots) // hotbar shrank: the rest waits in the Backpack
  }
  if (Array.isArray(doc.backpack)) state.backpack.push(...fighters(doc.backpack))
  if (Array.isArray(doc.slots)) {
    state.slots.forEach((sl, i) => Object.assign(sl, { fighter: null, level: 1, stored: 0 }, doc.slots[i] ?? {}))
  }
  let top = 0
  for (const f of [...state.inventory, ...state.backpack, ...state.slots.map((sl) => sl.fighter)]) if (f && f.id > top) top = f.id
  state.nextId = Math.max(typeof doc.nextId === 'number' ? doc.nextId : 1, top + 1)
  if (typeof doc.rebirths === 'number') state.rebirths = doc.rebirths
  if (typeof doc.playtime === 'number') state.playtime = Math.max(state.playtime, doc.playtime)
  if (Array.isArray(doc.discovered)) state.discovered = new Set(doc.discovered)
  if (Array.isArray(doc.indexClaimed)) state.indexClaimed = doc.indexClaimed
  if (typeof doc.speedBoostUntil === 'number') state.speedBoostUntil = doc.speedBoostUntil
  if (typeof doc.luckBoostUntil === 'number') state.luckBoostUntil = doc.luckBoostUntil
  if (doc.settings && typeof doc.settings === 'object') state.settings = { ...GAME_SETTINGS, ...doc.settings }
  if (typeof doc.moneyBoostUntil === 'number') state.moneyBoostUntil = doc.moneyBoostUntil
  if (typeof doc.baseSkin === 'string') state.baseSkin = doc.baseSkin
  const ids = (a, list) => (Array.isArray(a) ? a.filter((id) => typeof id === 'string' && id && list.some((x) => x.id === id)) : [])
  if (Array.isArray(doc.treadmills)) state.treadmills = ids(doc.treadmills, TREADMILLS)
  if (Array.isArray(doc.balls)) state.balls = ids(doc.balls, BALLS)
  if (typeof doc.treadmill === 'string') state.treadmill = state.treadmills.includes(doc.treadmill) ? doc.treadmill : ''
  if (typeof doc.ball === 'string') state.ball = state.balls.includes(doc.ball) ? doc.ball : ''
  if (typeof doc.baseLevel === 'number') state.baseLevel = Math.max(0, Math.min(BASE_BOARD.upgrade.prices.length, Math.floor(doc.baseLevel)))
  if (typeof doc.autoCollect === 'boolean') state.autoCollect = doc.autoCollect
  if (typeof doc.autoCollectOn === 'boolean') state.autoCollectOn = doc.autoCollectOn
  if (typeof doc.upgradeMax === 'boolean') state.upgradeMax = doc.upgradeMax
  state.selected = -1
  changed()
  dirty = false // this IS the saved state
}

// saver(snapshot) -> true when sent (net.js); until it succeeds the changes stay pending.
let saver = null
export function setSaver(fn) {
  saver = fn
}
let saveIn = 0
export function tickSave(dt) {
  saveIn -= dt
  if (!dirty || saveIn > 0 || !saver) return
  saveIn = 3
  if (saver(snapshot())) dirty = false
}

// --- Windows (src/ui/) ------------------------------------------------------------
// Money multiplier from rebirths (x1.0, x1.5, x2.0 ...): base income and cash rewards use it.
export const moneyMulti = () => 1 + state.rebirths * REBIRTH.multiStep
// The Speed stat with the x2 Speed boost applied: what the lane's orb runs on.
export const speedBoosted = () => Date.now() < state.speedBoostUntil
export const luckBoosted = () => Date.now() < state.luckBoostUntil
export const moneyBoosted = () => Date.now() < state.moneyBoostUntil
export const effectiveSpeed = () => state.speed * (speedBoosted() ? BOOSTS.speed.multi : 1)
// The equipped Dragon Ball / treadmill (catalog entries; "" = the starter one).
export const equippedBall = () => BALLS.find((b) => b.id === state.ball) ?? BALLS[0]
export const equippedTreadmill = () => TREADMILLS.find((t) => t.id === state.treadmill) ?? TREADMILLS[0]
// Luck: the x2 Luck boost x the equipped Dragon Ball.
export const luckMulti = () => (luckBoosted() ? BOOSTS.luck.multi : 1) * equippedBall().luck
// Your base's own Cash Multi from the Base Upgrade sign (x1, x1.5 ... x3.5).
export const baseMulti = () => 1 + state.baseLevel * BASE_BOARD.upgrade.multiStep
// Base income: the rebirth multiplier x the x2 Money boost.
export const cashMulti = () => moneyMulti() * (moneyBoosted() ? BOOSTS.money.multi : 1)

// Game events the windows count (Index discoveries, Daily Quests). fn(kind, data):
// 'hatch' (fighter), 'sell' (n).
const events = new Set()
export function onGameEvent(fn) {
  events.add(fn)
  return () => events.delete(fn)
}
// The lane calls this when a fighter hatches (and the windows when one is granted).
export function recordHatch(f) {
  for (const fn of events) fn('hatch', f)
}
export function recordSell(n = 1) {
  for (const fn of events) fn('sell', n)
}

export function addSpeed(n) {
  state.speed += n
  changed()
}

export function addMoney(n) {
  state.money += n
  changed()
}

export function addFighter(f) {
  if (state.inventory.length >= LANE.hotbarSlots) state.backpack.unshift(state.inventory.shift()) // full: the oldest goes to the Backpack
  state.inventory.push(f)
  state.selected = state.inventory.length - 1
  changed()
}

// Every fighter you carry (hotbar, then Backpack).
export const allFighters = () => [...state.inventory, ...state.backpack]

// Takes fighters out of the hotbar / Backpack by id; returns the ones removed.
export function removeFighters(ids) {
  const want = new Set(ids)
  const out = []
  const keep = (list) => list.filter((f) => (want.has(f.id) ? (out.push(f), false) : true))
  const heldF = held()
  state.inventory = keep(state.inventory)
  state.backpack = keep(state.backpack)
  state.selected = heldF ? state.inventory.indexOf(heldF) : -1
  if (out.length) changed()
  return out
}

export const held = () => (state.selected >= 0 ? state.inventory[state.selected] ?? null : null)

export function select(i) {
  state.selected = state.selected === i || i >= state.inventory.length ? -1 : i
  changed()
}

// Puts a fighter back into the hotbar (or the Backpack when it is full) without changing
// what is held (Place Best's swaps).
export function stashFighter(f) {
  if (state.inventory.length < LANE.hotbarSlots) state.inventory.push(f)
  else state.backpack.unshift(f)
  changed()
}

// Takes the held fighter out of the hotbar (placing it); returns it.
export function takeHeld() {
  const f = held()
  if (!f) return null
  state.inventory.splice(state.selected, 1)
  state.selected = -1
  changed()
  return f
}
