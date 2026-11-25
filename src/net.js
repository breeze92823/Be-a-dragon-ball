// Game server link (backend: Be-a-dragon-ball-backend, room "world"). Progress is saved ONLY
// there: nothing is kept in the browser. On join the server answers with the player's saved doc
// ("progress", hydrated into state.js), "noProgress" (new account, guest, or no database: the
// fresh state stands and is saved from then on) or "serverError" (the save could not be read:
// saving stays off so it is never overwritten). Guests are never saved by the server, so their
// progress lasts the page; signing in mid-session re-identifies and loads that account.
//
// On Bloxity the SDK resolves a server pod; in dev it tries NET.devUrl. Nothing answering =
// offline play, retried in the background with backoff. Saves are the whole snapshot
// (state.snapshot()), sent by state.tickSave() through the saver set here, at most every
// NET.saveEvery s, and flushed when the tab is hidden or closed.
import { Client, getStateCallbacks } from '@colyseus/sdk'
import { NET } from './config.js'
import { authState, canResolveServer, getLookJson, getOutfitKey, getPfp, getToken, playerInRoom, playerJoined, resolveServerEndpoint, subscribeAuth, updateRoom } from './bloxity.js'
import { hydrate, setSaver, snapshot } from './state.js'
import { toast } from './toast.js'

export const net = {
  base: -1, // the base (plot index) the server assigned this player; -1 until it answers
  room: null,
  connected: false,
  loaded: false, // the server has answered progress / noProgress for the current identity
  canSave: false, // false after a serverError (never overwrite a save we could not read)
}

const rand = () => Math.random().toString(36).slice(2, 10)
// A per-page guest id (the server never saves `guest-` ids, so nothing needs to remember it).
const GUEST = `guest-${rand()}`
// Dev only: ?devUser=name plays as a saved account against a local backend.
const DEV_USER = (() => {
  if (!import.meta.env.DEV) return ''
  try {
    const v = new URLSearchParams(location.search).get('devUser') || ''
    return /^[A-Za-z0-9_-]{1,24}$/.test(v) ? `dev-${v}` : ''
  } catch {
    return ''
  }
})()

function identity() {
  if (DEV_USER) return { userId: DEV_USER, username: DEV_USER.slice(4) }
  const u = authState.user
  const id = u && (u._id || u.id || u.userId || u.uid)
  if (!id) return { userId: GUEST, username: authState.guest?.displayName || authState.guest?.username || 'Guest' }
  return { userId: String(id), username: String(u.displayName || u.username || u.name || 'Player') }
}
const isGuest = (id) => id.startsWith('guest-')
const serverUrl = () => NET.url || (import.meta.env.DEV ? NET.devUrl : '')
export const hasServer = () => !!serverUrl() || canResolveServer()

function send(type, msg) {
  if (!net.connected || !net.room) return false
  try {
    net.room.send(type, msg)
    return true
  } catch {
    return false // dropped connection: the reconnect reloads and saves again
  }
}

// The saver state.tickSave() calls: true when the snapshot went to the server.
function save(snap) {
  if (!net.loaded || !net.canSave || isGuest(sentId)) return false
  return send('saveProgress', snap)
}
const flush = () => save(snapshot())

// Presence: the others draw you from these (backend presence.ts). The pose goes ~10x/s while it
// changes (and once a second otherwise), the outfit key whenever the look changes.
let lastPose = {}
let sentPose = ''
let sentForm = ''
let poseAt = 0
// loadout = { form: 'human' | 'orb' | 'fighter', ball, fighter: look | null, held: look | null }: how
// the others draw you. It is re-sent only when it changes.
export function sendPose(x, y, z, yaw, speed, loadout, now) {
  lastPose = { pose: { x, y, z, yaw, speed }, loadout }
  if (now - poseAt < 100) return
  const sig = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)},${yaw.toFixed(2)},${speed.toFixed(1)}`
  if (sig === sentPose && now - poseAt < 1000) return
  if (send('pose', lastPose.pose)) {
    const l = JSON.stringify(loadout)
    if (l !== sentForm && send('loadout', loadout)) sentForm = l
    sentPose = sig
    poseAt = now
  }
}
let sentKey = ''
export function sendOutfit() {
  const key = getOutfitKey()
  const look = getLookJson()
  if (key + look === sentKey) return
  if (send('setAvatar', { avatar: key, look })) sentKey = key + look
}

// The base the world was built around: the join asks for it, so a rejoin keeps the same plot.
export const hint = { base: -1 }
try {
  const saved = Number(sessionStorage.getItem('dbz.base'))
  if (Number.isInteger(saved) && saved >= 0) hint.base = saved
} catch {
  // Storage blocked: the server picks.
}
// Resolves with the assigned base index once the server has answered, or null after `ms` (offline / slow).
export function whenBase(ms) {
  return new Promise((resolve) => {
    const t0 = performance.now()
    const poll = () => {
      const mine = net.room?.state?.players?.get?.(net.room.sessionId)
      if (mine && mine.base >= 0) return resolve(mine.base)
      if (performance.now() - t0 > ms) return resolve(null)
      setTimeout(poll, 80)
    }
    poll()
  })
}

let sentId = ''
function attach(room) {
  net.room = room
  net.base = -1
  net.connected = true
  net.loaded = false
  net.canSave = true
  room.onMessage('progress', (doc) => {
    hydrate(doc)
    net.loaded = true
  })
  room.onMessage('base', (m) => (net.base = Number.isInteger(m?.index) ? m.index : -1))
  room.onMessage('noProgress', () => {
    net.loaded = true // keep the fresh (or the guest's) state; it is saved from now on
    flush()
  })
  room.onMessage('serverError', () => {
    net.loaded = true
    net.canSave = false
    toast('Could not load your save', 'Progress will not be saved this session', '#ff8a6a')
  })
  for (const type of ['leaderboard']) room.onMessage(type, () => {}) // not used yet (ui/server.js handles spins, daily, fuse)
  // Friend-join toasts: who was already here, then each arrival (Boxity only toasts friends).
  try {
    const joinedAt = performance.now()
    const $ = getStateCallbacks(room)
    $(room.state).players.onAdd((p, key) => {
      if (key === room.sessionId || !p?.username) return
      if (performance.now() - joinedAt < 1500) playerInRoom(p.username)
      else playerJoined(p.username)
    })
  } catch {
    // Cosmetic: no roster callbacks, no toasts.
  }
  room.onLeave(() => {
    if (net.room !== room) return
    sentPose = ''
    sentForm = ''
    sentKey = ''
    net.room = null
    net.connected = false
    net.loaded = false
    updateRoom('')
    setTimeout(connect, NET.rejoin * 1000)
  })
}

let connecting = false
let retryIn = NET.retry
async function connect() {
  if (!hasServer() || connecting || net.connected) return
  connecting = true
  try {
    const id = identity()
    // `token` is the player's Boxity token: the server verifies it with the platform and takes the
    // account id from that (a deployed server ignores `userId`; it only serves local dev).
    const options = { userId: id.userId, username: id.username, pfp: getPfp(), token: isGuest(id.userId) ? '' : getToken(), avatar: getOutfitKey(), look: getLookJson(), base: hint.base, ...lastPose }
    const url = serverUrl()
    let room
    if (url) room = await new Client(url).joinOrCreate(NET.room, options)
    else {
      const { endpoint } = await resolveServerEndpoint(isGuest(id.userId) ? undefined : id.userId)
      room = await new Client(endpoint).joinOrCreate(NET.room, options)
    }
    sentId = id.userId
    retryIn = NET.retry
    attach(room)
    updateRoom(room.roomId)
    console.info(`[net] joined ${NET.room} ${room.roomId} as ${room.sessionId}`)
  } catch (err) {
    console.info(`[net] no game server (retrying in ${retryIn}s); progress is not saved meanwhile`, err?.message ?? err)
    setTimeout(connect, retryIn * 1000)
    retryIn = Math.min(retryIn * 2, NET.retryMax)
  } finally {
    connecting = false
  }
}

export function initNet() {
  setSaver(save)
  if (!hasServer()) return console.info('[net] no server configured; progress is not saved')
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => document.hidden && flush())
  subscribeAuth((s) => {
    if (!s.ready && !DEV_USER) return
    const id = identity()
    if (!net.connected) return void connect()
    if (id.userId === sentId) return void send('identify', { username: id.username, pfp: getPfp() })
    // Signed in or out mid-session: save under the old id, then load the new one.
    flush()
    sentId = id.userId
    net.loaded = false
    send('identify', { userId: id.userId, username: id.username, pfp: getPfp(), token: isGuest(id.userId) ? '' : getToken() })
  })
  setTimeout(connect, 2000) // the SDK may never settle auth outside the portal
}
