import { DAILY, PLAYTIME, QUESTS, SPIN } from '../config.js'
import { net } from '../net.js'
import { outcomes, rollFusion } from './fuserules.js'

// The windows' link to the game server's clock-based systems (backend playtime.ts, quests.ts,
// daily.ts): the server decides what is unlocked and stores claims, the client only grants the
// reward once a claim answers ok. Handlers are attached to net.js's room as soon as it appears
// (Colyseus allows several handlers per message type); `uiSync` asks for the current views in
// case the load answered before they were attached.
//
// Offline (no server reachable, or a dev build without the backend) the same rules run here on
// the page's own clock and last the page, like the rest of an unsaved session.
//
// view.playtime { secs (at `at`), claimed[] }, view.quests { day, list[{ kind, goal, n, rerolled }],
// claimed }, view.daily { unlocked, claimed[] }; each also has nextAt (server ms of next UTC day).
// The server-authoritative machines: view.fuse { fusing: { inputs, readyAt, outcomes } | null }
// (backend fuse.ts) and view.spins { spins, nextAt } (backend spin.ts).

const DAY_MS = 86_400_000
export const view = { playtime: null, quests: null, daily: null, fuse: null, spins: null, online: false }
let offset = 0
export const serverNow = () => Date.now() + offset
const listeners = new Set()
export const onView = (fn) => listeners.add(fn)
const emit = (what) => {
  for (const fn of listeners) fn(what)
}
const keep = (m) => {
  if (typeof m?.serverTime === 'number') offset = m.serverTime - Date.now()
}

export const playSecs = () => (view.playtime ? view.playtime.secs + (performance.now() - view.playtime.at) / 1000 : 0)
function setPlaytime(v) {
  view.playtime = { secs: v.secs, at: performance.now(), claimed: [...v.claimed], nextAt: v.nextAt }
  emit('playtime')
}
function setQuests(v) {
  view.quests = { day: v.day, list: v.list.map((q) => ({ ...q })), claimed: !!v.claimed, nextAt: v.nextAt }
  emit('quests')
}
function setDaily(v) {
  view.daily = { unlocked: v.unlocked, claimed: [...v.claimed], nextAt: v.nextAt }
  emit('daily')
}
function setFuse(v) {
  view.fuse = { fusing: v?.fusing ? { inputs: v.fusing.inputs, readyAt: v.fusing.readyAt, outcomes: v.fusing.outcomes ?? outcomes(v.fusing.inputs) } : null }
  emit('fuse')
}
function setSpins(v) {
  view.spins = { spins: v.spins, nextAt: v.nextAt }
  emit('spins')
}

// --- Offline rules (mirror the backend) ----------------------------------------------------
const utcDay = (ms = Date.now()) => Math.floor(ms / DAY_MS)
const KINDS = Object.keys(QUESTS.text)
const GOALS = { hatch: [5, 8, 12], mutated: [1, 2, 3], sell: [3, 6, 10], play: [10, 15, 20] } // backend QUEST_KINDS
const pick = (a) => a[Math.floor(Math.random() * a.length)]
function localQuests() {
  const kinds = [...KINDS].sort(() => Math.random() - 0.5).slice(0, 3)
  return { day: utcDay(), list: kinds.map((kind) => ({ kind, goal: pick(GOALS[kind]), n: 0, rerolled: false })), claimed: false, nextAt: (utcDay() + 1) * DAY_MS }
}
function goOffline() {
  if (view.online === false && view.playtime) return
  view.online = false
  offset = 0
  setPlaytime({ secs: 0, claimed: [], nextAt: (utcDay() + 1) * DAY_MS })
  setQuests(localQuests())
  setDaily({ unlocked: 1, claimed: [], nextAt: (utcDay() + 1) * DAY_MS })
  // A page-only fusion keeps running offline; the free spin clock starts fresh.
  if (!local.job) setFuse({ fusing: null })
  setSpins({ spins: SPIN.start, nextAt: Date.now() + SPIN.everyMs })
}
const local = { job: null } // the offline fusion (with its result)

// --- Room binding ----------------------------------------------------------------------------
const waiting = {}
let bound = null
function bind(room) {
  const mine = (fn) => (m) => {
    if (net.room === room) fn(m)
  }
  room.onMessage('playtime', mine((v) => (keep(v), setPlaytime(v))))
  room.onMessage('playtimeResult', mine((r) => {
    keep(r)
    if (Array.isArray(r?.claimed)) setPlaytime(r)
    waiting.playtimeResult?.(r)
  }))
  room.onMessage('quests', mine((v) => (keep(v), setQuests(v))))
  room.onMessage('questResult', mine((r) => {
    keep(r)
    if (Array.isArray(r?.list)) setQuests(r)
    waiting.questResult?.(r)
  }))
  room.onMessage('daily', mine((v) => (keep(v), setDaily(v))))
  room.onMessage('fuse', mine((v) => (keep(v), setFuse(v))))
  room.onMessage('fuseResult', mine((r) => {
    keep(r)
    if ('fusing' in (r ?? {})) setFuse(r)
    waiting.fuseResult?.(r)
  }))
  room.onMessage('spins', mine((v) => (keep(v), setSpins(v))))
  room.onMessage('spinResult', mine((r) => {
    keep(r)
    if (typeof r?.spins === 'number') setSpins(r)
    waiting.spinResult?.(r)
  }))
  room.onMessage('dailyResult', mine((r) => {
    keep(r)
    if (Array.isArray(r?.claimed)) setDaily(r)
    waiting.dailyResult?.(r)
  }))
}

const send = (type, msg = {}) => {
  try {
    net.room?.send(type, msg)
    return true
  } catch {
    return false
  }
}

let syncIn = 0
let dayCheckIn = 0
let playTick = 0
// Each frame (ui update): binds a new room, falls back to offline rules, rolls the day.
export function pollServer(dt) {
  const room = net.connected ? net.room : null
  if (room !== bound) {
    bound = room
    if (room) {
      // The server's views replace the page's offline ones (null = loading).
      view.playtime = view.quests = view.daily = view.fuse = view.spins = null
      view.online = true
      bind(room)
      syncIn = 0.2
      emit('all')
    } else {
      view.online = false
      view.playtime = null
      goOffline()
    }
  }
  if (!bound && !view.playtime) goOffline()
  // Ask for the views until they are here (the load may have answered before bind).
  if (bound && net.loaded && (!view.quests || !view.daily || !view.playtime || !view.fuse || !view.spins)) {
    syncIn -= dt
    if (syncIn <= 0) {
      syncIn = 3
      send('uiSync')
    }
  }
  // A new UTC day: the server re-rolls (online) or the page does (offline).
  dayCheckIn -= dt
  if (dayCheckIn <= 0) {
    dayCheckIn = 1
    const next = view.quests?.nextAt ?? Infinity
    if (serverNow() >= next) {
      if (bound) {
        send('dayRefresh')
        send('dailyRefresh')
        view.quests.nextAt = serverNow() + 5000 // ask again in a bit if no answer
      } else {
        view.playtime = null
        goOffline()
      }
    }
  }
  // Offline: free spins accrue on the page clock.
  if (!bound && view.spins) accrueLocal(view.spins)
  // Offline: the page counts the Play quests itself.
  if (!bound) {
    playTick += dt
    if (playTick >= 60) {
      playTick -= 60
      if (localProgress('play', 1)) emit('quests')
    }
  }
}

function localProgress(kind, n) {
  let moved = false
  for (const q of view.quests?.list ?? []) {
    if (q.kind !== kind || q.n >= q.goal) continue
    q.n = Math.min(q.goal, q.n + n)
    moved = true
  }
  return moved
}

// --- Requests ---------------------------------------------------------------------------------
// Resolves with the server's answer, or { ok: false, reason: 'busy' | 'timeout' }.
function request(type, payload, answer) {
  return new Promise((resolve) => {
    if (waiting[answer]) return resolve({ ok: false, reason: 'busy' })
    const timer = setTimeout(() => {
      delete waiting[answer]
      resolve({ ok: false, reason: 'timeout' })
    }, 6000)
    waiting[answer] = (msg) => {
      clearTimeout(timer)
      delete waiting[answer]
      resolve(msg)
    }
    if (!send(type, payload)) {
      clearTimeout(timer)
      delete waiting[answer]
      resolve({ ok: false, reason: 'offline' })
    }
  })
}

export async function claimPlaytime(i) {
  if (bound) return request('claimPlaytime', { i }, 'playtimeResult')
  const v = view.playtime
  if (!v || v.claimed.includes(i) || playSecs() < PLAYTIME.unlocks[i]) return { ok: false, reason: 'locked' }
  v.claimed.push(i)
  emit('playtime')
  return { ok: true, i }
}

export async function claimDaily(day) {
  if (bound) return request('claimDaily', { day }, 'dailyResult')
  const v = view.daily
  if (!v || day >= v.unlocked || v.claimed.includes(day) || day >= DAILY.days.length) return { ok: false, reason: 'locked' }
  v.claimed.push(day)
  emit('daily')
  return { ok: true, day }
}

export async function rerollQuest(i) {
  if (bound) return request('questAction', { action: 'reroll', i }, 'questResult')
  const v = view.quests
  const q = v?.list[i]
  if (!q || q.rerolled || q.n >= q.goal || v.claimed) return { ok: false, reason: 'locked' }
  const free = KINDS.filter((k) => !v.list.some((o) => o.kind === k))
  const kind = free.length ? pick(free) : q.kind
  v.list[i] = { kind, goal: pick(GOALS[kind]), n: 0, rerolled: true }
  emit('quests')
  return { ok: true, i }
}

export async function claimQuests(skip) {
  if (bound) return request('questAction', { action: 'claim', skip: !!skip }, 'questResult')
  const v = view.quests
  if (!v || v.claimed || (!skip && !v.list.every((q) => q.n >= q.goal))) return { ok: false, reason: 'locked' }
  v.claimed = true
  emit('quests')
  return { ok: true }
}

// A hatch / sale the windows saw: Daily Quests progress.
export function questEvent(kind, n = 1) {
  if (bound) return void send('questEvent', { kind, n })
  if (localProgress(kind, n)) emit('quests')
}

// --- Fuse Machine (backend fuse.ts) -------------------------------------------------------------
// fuseStart(inputs) -> { ok, reason?, fusing }; fuseClaim() -> { ok, reason?, result: { rarity,
// mutation (id | null), pick } }. The client removes the fighters / grants the result on ok.
export async function fuseStart(inputs) {
  if (bound) return request('fuseStart', { inputs }, 'fuseResult')
  if (local.job) return { ok: false, reason: 'busy' }
  local.job = rollFusion(inputs, Date.now())
  setFuse({ fusing: local.job })
  return { ok: true, fusing: view.fuse.fusing }
}

export async function fuseClaim() {
  if (bound) return request('fuseClaim', {}, 'fuseResult')
  const job = local.job
  if (!job) return { ok: false, reason: 'none' }
  if (Date.now() < job.readyAt) return { ok: false, reason: 'wait' }
  local.job = null
  setFuse({ fusing: null })
  return { ok: true, result: { rarity: job.rarity, mutation: job.mutation, pick: job.pick } }
}

// --- Dragon Spin (backend spin.ts) ---------------------------------------------------------------
function accrueLocal(s) {
  const now = Date.now()
  let moved = false
  while (s.spins < SPIN.cap && now >= s.nextAt) {
    s.spins++
    s.nextAt += SPIN.everyMs
    moved = true
  }
  if (s.spins >= SPIN.cap && s.nextAt < now) s.nextAt = now + SPIN.everyMs
  if (moved) emit('spins')
}

// -> { ok, id (SPIN.wedges id), spins, nextAt } or { ok: false, reason: 'none' | ... }.
export async function spinWheel() {
  if (bound) return request('spin', {}, 'spinResult')
  const s = view.spins
  if (!s || s.spins < 1) return { ok: false, reason: 'none' }
  if (s.spins >= SPIN.cap) s.nextAt = Date.now() + SPIN.everyMs
  s.spins--
  const total = SPIN.wedges.reduce((n, w) => n + w.weight, 0)
  let r = Math.random() * total
  let id = SPIN.wedges[SPIN.wedges.length - 1].id
  for (const w of SPIN.wedges) {
    if (r < w.weight) {
      id = w.id
      break
    }
    r -= w.weight
  }
  emit('spins')
  return { ok: true, id, spins: s.spins, nextAt: s.nextAt }
}

// A spin pack the player paid $ for (SPIN.packs index).
export function buySpins(pack) {
  if (bound) return void send('buySpins', { pack })
  if (!view.spins) return
  view.spins.spins += SPIN.packs[pack]?.spins ?? 0
  emit('spins')
}
