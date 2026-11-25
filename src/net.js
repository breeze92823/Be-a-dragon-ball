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
import { authState, canResolveServer, getLookJson, launchRoomId, locateRoom, canonicalRoomKey, getOutfitKey, getPfp, getToken, playerInRoom, playerJoined, resolveServerEndpoint, subscribeAuth, updateRoom } from './bloxity.js'
import { hydrate, setSaver, snapshot } from './state.js'
import { toast } from './toast.js'
import { short } from './safezone/text.js'

export const net = {
  base: -1, // the base (plot index) the server assigned this player; -1 until it answers
  room: null,
  leaderboard: null, // the server's last `leaderboard` message
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
// After a one-off reload around a different plot the page carries it in the URL (?dbzBase=n); nothing is
// stored in the browser.
try {
  const asked = Number(new URLSearchParams(location.search).get('dbzBase'))
  if (Number.isInteger(asked) && asked >= 0) hint.base = asked
} catch {
  // No URL: the server picks.
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
    const away = hydrate(doc)
    net.loaded = true
    if (away >= 1 && doc?.offlineSeconds >= 60) toast('Welcome back!', `Your fighters earned $${short(away)} while you were away. Collect it from your base pads.`, '#9dff3a')
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
  // The safe zone boards are built after the join, and the server only re-sends the lists every minute:
  // keep the last one so a board built later paints it at once (safezone/boards.js).
  room.onMessage('leaderboard', (msg) => (net.leaderboard = msg)) // ui/server.js handles spins, daily, fuse
  // Boxity's friend toasts: tell it who was already here (playerInRoom) and each arrival (playerJoined).
  // Boxity matches friends by the permanent username, which the server only knows once the player's token
  // is verified, so a player is reported when their `handle` arrives (or after a few seconds without one).
  const joinedAt = performance.now()
  const seen = new Map() // sessionId -> { at, done }
  const report = setInterval(() => {
    if (net.room !== room) return clearInterval(report)
    const now = performance.now()
    room.state?.players?.forEach((p, id) => {
      if (id === room.sessionId) return
      const s = seen.get(id) ?? seen.set(id, { at: now, early: now - joinedAt < 2500, done: false }).get(id)
      if (s.done || (!p.handle && now - s.at < 4000)) return
      s.done = true
      const name = p.handle || p.username
      if (name) (s.early ? playerInRoom : playerJoined)(name)
    })
    for (const id of [...seen.keys()]) if (!room.state?.players?.has(id)) seen.delete(id)
  }, 500)
  room.onLeave(() => {
    if (net.room !== room) return
    sentPose = ''
    sentForm = ''
    sentKey = ''
    net.room = null
    net.connected = false
    net.loaded = false
    updateRoom('')
    rejoinKey = roomKey.includes('~') ? roomKey : '' // a bare id can't be joined without its pod
    setTimeout(connect, NET.rejoin * 1000)
  })
}

let connecting = false
let launchOnce = false // the ?roomId= of the page is tried on the first connect only
let roomKey = '' // "<relayRoomId>~<colyseusRoomId>" of the room we are in
let canonical = '' // the directory's id for the current room, once known
let rejoinKey = '' // set when that room dropped us: tried before matchmaking
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
    let relay = ''
    if (url) room = await new Client(url).joinOrCreate(NET.room, options)
    else {
      // Arrived from a friend's invite or the game page's Open Rooms Join button (?roomId=): join that very
      // room through the pod that holds it; when it is gone or full, fall back to normal matchmaking.
      // After a dropped connection the same room comes first (friends stay together), then matchmaking.
      const launch = rejoinKey || (launchOnce ? '' : launchRoomId())
      rejoinKey = ''
      launchOnce = true
      const target = launch ? await locateRoom(launch).catch(() => null) : null
      if (target) {
        try {
          room = await new Client(target.endpoint).joinById(target.roomId, options)
          relay = target.relayRoomId || ''
        } catch (err) {
          console.info('[net] the invited room is full or gone; matchmaking instead', err?.message ?? err)
        }
      }
      if (!room) {
        const found = await resolveServerEndpoint()
        room = await new Client(found.endpoint).joinOrCreate(NET.room, options)
        relay = found.relayRoomId || ''
      }
    }
    sentId = id.userId
    retryIn = NET.retry
    attach(room)
    // Friends are invited into the room reported here, so it names the pod's relay too: "<relay>~<room>".
    roomKey = relay ? `${relay}~${room.roomId}` : room.roomId
    updateRoom(roomKey)
    // Everyone in this room must report the SAME id (the portal's "In this server" list groups by it):
    // swap in the directory's canonical relay once the room is listed.
    const joined = room
    canonical = ''
    for (const wait of [2500, 5000, 10000]) {
      setTimeout(async () => {
        if (net.room !== joined || roomKey.includes('~') && roomKey === canonical) return
        const key = await canonicalRoomKey(joined.roomId)
        if (!key || net.room !== joined) return
        canonical = roomKey = key
        updateRoom(key)
      }, wait)
    }
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
