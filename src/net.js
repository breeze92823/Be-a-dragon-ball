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
import { Client } from '@colyseus/sdk'
import { NET } from './config.js'
import { authState, canResolveServer, getPfp, resolveServerEndpoint, subscribeAuth, updateRoom } from './bloxity.js'
import { hydrate, setSaver, snapshot } from './state.js'
import { toast } from './toast.js'

export const net = {
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

let sentId = ''
function attach(room) {
  net.room = room
  net.connected = true
  net.loaded = false
  net.canSave = true
  room.onMessage('progress', (doc) => {
    hydrate(doc)
    net.loaded = true
  })
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
  room.onLeave(() => {
    if (net.room !== room) return
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
    const options = { userId: id.userId, username: id.username, pfp: getPfp() }
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
    send('identify', { userId: id.userId, username: id.username, pfp: getPfp() })
  })
  setTimeout(connect, 2000) // the SDK may never settle auth outside the portal
}
