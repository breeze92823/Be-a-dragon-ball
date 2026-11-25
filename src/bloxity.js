// The Bloxity (Legion) SDK facade. Every SDK call goes through here. Nothing
// here may throw when the SDK is missing: a blocked sdk.bloxity.io leaves the
// game fully playable on the default avatar and keyboard controls.
// Docs: https://docs.bloxity.io/#html5
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GAME_SLUG, GAME_TITLE, SETTINGS, DEV_MODE, coerceSetting } from './config.js'

export function sdk() {
  if (DEV_MODE) return null
  return (typeof window !== 'undefined' && window.Legion && window.Legion.SDK) || null
}

// --- State --------------------------------------------------------------
export const settings = {}
for (const key of Object.keys(SETTINGS)) settings[key] = coerceSetting(key, SETTINGS[key].def)

// `user` is only written from onUserChanged (re-reading getUser()). `ready`
// flips once auth has settled so the signed-in avatar load isn't pre-empted.
export const authState = { ready: false, user: null, guest: null }

let latestEquipped = null
let latestProportions = null
const avatarListeners = new Set()
const proportionListeners = new Set()
const authListeners = new Set()
const settingListeners = new Set()
const respawnListeners = new Set()
const unsubscribers = []
const playerEventListeners = new Set()
const adBreakListeners = new Set()
const chatListeners = new Set()
const badgeListeners = new Set()

function emit(listeners, ...args) {
  for (const fn of listeners) {
    try {
      fn(...args)
    } catch (err) {
      console.warn('[bloxity] listener threw', err)
    }
  }
}

// Fires on any customizer change (may fire twice: optimistic, then confirmed;
// keep handlers idempotent). Each returns an unsubscribe.
export function onAvatarChanged(fn) {
  avatarListeners.add(fn)
  return () => avatarListeners.delete(fn)
}
export function onProportionsChanged(fn) {
  proportionListeners.add(fn)
  return () => proportionListeners.delete(fn)
}
export function subscribeAuth(fn) {
  authListeners.add(fn)
  fn(authState)
  return () => authListeners.delete(fn)
}
// fn(key, value) on every change of a SETTINGS key (already coerced).
export function onSetting(fn) {
  settingListeners.add(fn)
  return () => settingListeners.delete(fn)
}
// The portal's own pause-menu "Respawn" button.
export function onRespawnRequest(fn) {
  respawnListeners.add(fn)
  return () => respawnListeners.delete(fn)
}

// --- Auth ---------------------------------------------------------------
// The SDK fires onUserChanged immediately with a null user, then again once the
// portal handshake answers; a null user only settles auth after a grace period.
const GUEST_SETTLE_MS = 2500
let settleTimer = null

function settleAuth() {
  settleTimer = null
  if (authState.ready) return
  authState.ready = true
  emit(authListeners, authState)
}

function onUser() {
  const SDK = sdk()
  const user = SDK ? SDK.auth.getUser() : null
  latestEquipped = null // a different account's equip event must not linger
  latestProportions = null

  if (user || authState.ready) {
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = null
    authState.ready = true
  } else if (!settleTimer) {
    settleTimer = setTimeout(settleAuth, GUEST_SETTLE_MS)
  }
  authState.user = user
  try {
    authState.guest = user || typeof SDK.auth.getGuest !== 'function' ? null : SDK.auth.getGuest()
  } catch {
    authState.guest = null
  }
  emit(authListeners, authState)
}

// Name for the HUD badge.
export function displayName() {
  const u = authState.user
  if (u) return u.displayName || u.username || u.name || 'Player'
  const g = authState.guest
  if (g) return g.displayName || g.username || g.name || 'Guest'
  return sdk() ? 'Guest' : 'Offline'
}

// The player's Bloxity profile picture (user, else the guest's derived one) as an absolute
// http(s) URL, '' when there is none. Relative paths resolve against the CDN (staticUrl).
export function getPfp() {
  const raw = authState.user?.pfp || authState.guest?.pfp
  if (typeof raw !== 'string' || !raw) return ''
  try {
    const base = boxityEnv().staticUrl
    const url = new URL(raw, base)
    return /^https?:$/.test(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

// --- Environment ---------------------------------------------------------
// Boxity tells the page which environment it runs in (prod / stage / local); never guess it from a
// hostname or hardcode api./static.bloxity.io. Prod is only the fallback when nothing was told.
const PROD_ENV = { env: 'prod', apiUrl: 'https://api.bloxity.io', playUrl: 'https://play.bloxity.io', portalUrl: 'https://bloxity.io', staticUrl: 'https://static.bloxity.io' }
export function boxityEnv() {
  try {
    const e = sdk()?.environment?.()
    if (e?.apiUrl) return e
  } catch {
    // Older SDK builds have no environment().
  }
  const told = typeof window !== 'undefined' ? window.BLOXITY_ENV : null
  return told && told.apiUrl ? told : PROD_ENV
}

// --- Init ---------------------------------------------------------------
let initialised = false

export function init() {
  if (initialised) return
  initialised = true

  const SDK = sdk()
  if (!SDK) {
    if (DEV_MODE) console.info('[bloxity] VITE_DEV_MODE=true: skipping SDK/CDN, running on the default avatar')
    else console.info('[bloxity] SDK not loaded: running offline on the default avatar')
    authState.ready = true
    emit(authListeners, authState)
    return
  }

  try {
    const onLocalhost = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    SDK.init(onLocalhost ? { gameSlug: GAME_SLUG, portalUrl: 'https://bloxity.io' } : { gameSlug: GAME_SLUG })
    SDK.game.loadingStep(`Loading ${GAME_TITLE}`)

    for (const key of Object.keys(SETTINGS)) {
      const off = SDK.settings.listen(key, (raw) => {
        const next = coerceSetting(key, raw)
        if (settings[key] === next) return
        settings[key] = next
        emit(settingListeners, key, next)
      })
      if (typeof off === 'function') unsubscribers.push(off)
    }
    SDK.settings.triggerAll?.()

    unsubscribers.push(SDK.auth.onUserChanged(onUser))

    if (typeof SDK.avatar?.onAvatarChanged === 'function') {
      unsubscribers.push(
        SDK.avatar.onAvatarChanged((equipped) => {
          // The event payload wins over getEquipped(), which can lag the event.
          if (equipped && typeof equipped === 'object') latestEquipped = equipped
          emit(avatarListeners)
        }),
      )
    }
    if (typeof SDK.avatar?.onProportionsChanged === 'function') {
      unsubscribers.push(
        SDK.avatar.onProportionsChanged((proportions) => {
          if (proportions && typeof proportions === 'object') latestProportions = proportions
          emit(proportionListeners)
        }),
      )
    }

    unsubscribers.push(
      SDK.player.onEvent((event, data) => {
        if (event === 'respawn_request') emit(respawnListeners)
        else emit(playerEventListeners, event, data) // chat_message_sent, pointer_lock_changed, play_emote, stop_emote
      }),
    )
    installPlatformFeatures(SDK)

    SDK.game.loadingStep('Building the island')
  } catch (err) {
    console.warn('[bloxity] init failed; running without the SDK', err)
    authState.ready = true
    emit(authListeners, authState)
  }
}

export function loadingStep(text) {
  try {
    sdk()?.game.loadingStep(text)
  } catch {
    // Non-fatal.
  }
}

let announcedFirstFrame = false

// Call once the scene has rendered: tells the portal loading is done.
export function notifyFirstFrame() {
  if (announcedFirstFrame) return
  announcedFirstFrame = true
  const SDK = sdk()
  if (!SDK) return
  try {
    SDK.game.loadingEnd()
    SDK.game.gameplayStart()
    reportScreen('gameplay')
  } catch {
    // Non-fatal.
  }
}

export function teardown() {
  for (const off of unsubscribers.splice(0)) {
    try {
      off()
    } catch {
      // Tearing down anyway.
    }
  }
  try {
    sdk()?.game.gameplayEnd()
  } catch {
    // Non-fatal.
  }
}

// --- Avatar accessors (null when the SDK is unavailable or the call throws) ---
export function getEquippedAvatar() {
  if (latestEquipped) return latestEquipped
  try {
    return sdk()?.avatar.getEquipped() ?? null
  } catch {
    return null
  }
}

// { height, shoulderWidth, armLength, legOffsetX, torsoScaleX, neckHeight,
// headScale }, normalised around 1.0; loader.js applyProportions() consumes it.
export function getProportions() {
  try {
    const current = sdk()?.avatar.getProportions()
    return latestProportions ? { ...current, ...latestProportions } : current ?? null
  } catch {
    return latestProportions
  }
}

// Skin texture URL with the worn face, shirt and pants already drawn on.
export function getSkinTextureUrl() {
  try {
    const url = sdk()?.avatar?.getSkinTextureUrl?.()
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  }
}

export const canCustomize = () => typeof sdk()?.avatar?.toggleCustomizer === 'function'

// Opens / closes the portal's avatar editor; edits come back through onAvatarChanged.
export function toggleCustomizer() {
  try {
    sdk()?.avatar.toggleCustomizer()
  } catch {
    // Ignore.
  }
}

// --- Game server ------------------------------------------------------
// Bloxity hosting has no fixed socket URL: the matchmaker picks a pod with room (or wakes one) and
// the SDK returns its endpoint (the dev channel reaches the dev backend, prod the prod one). Each
// endpoint is pinned to one pod, so net.js builds a new Client per resolve.
export function canResolveServer() {
  try {
    return typeof sdk()?.net?.resolveEndpoint === 'function'
  } catch {
    return false
  }
}
// { endpoint, relayRoomId }: relayRoomId is the matchmaker relay pinning the pod (the endpoint is
// {playUrl}/v1/ws/<relayRoomId>). Rejects (net.js retries with backoff) when the matchmaker can't answer.
// No options on purpose: the SDK already asks as the signed-in user (or this page's guest id), and an
// explicit userId would skip its early seat prefetch; the party ticket rides on the request either way.
export async function resolveServerEndpoint() {
  const { endpoint, roomId, cold } = await sdk().net.resolveEndpoint(GAME_SLUG)
  if (cold) console.info('[net] waking up a server...')
  return { endpoint, relayRoomId: roomId }
}

// The ?roomId= the page was opened with: the game page's Open Rooms Join button (a bare Colyseus
// room id) or a friend invite (what updateRoom() reported: "<relayRoomId>~<colyseusRoomId>").
export function launchRoomId() {
  try {
    return new URLSearchParams(location.search).get('roomId') || ''
  } catch {
    return ''
  }
}

// Where a launch room lives: { endpoint, roomId, relayRoomId }, or null when it is gone, full or
// can't be found. A bare id needs the matchmaker's cross-pod directory (a plain joinById through
// any relay would usually land on another pod); a relay~room id is joined through its relay.
export async function locateRoom(id) {
  const playUrl = (() => {
    try {
      return sdk()?.environment?.()?.playUrl
    } catch {
      return '' // Older SDK builds have no environment().
    }
  })()
  if (!playUrl || !id) return null
  const base = playUrl.replace(/\/$/, '')
  const [relay, roomId] = id.includes('~') ? id.split('~', 2) : ['', id]
  if (relay) return { endpoint: `${base.replace(/^http/i, 'ws')}/v1/ws/${encodeURIComponent(relay)}`, roomId, relayRoomId: relay }
  const res = await fetch(`${base}/v1/dir/${encodeURIComponent(GAME_SLUG)}/list`)
  const rooms = res.ok ? (await res.json())?.rooms ?? [] : []
  const r = rooms.find((r) => r.colyseusRoomId === roomId && !r.locked && r.players < r.maxPlayers)
  return r ? { endpoint: r.joinUrl, roomId: r.colyseusRoomId, relayRoomId: r.relayRoomId } : null
}

// The one id every player of a room reports, so the portal's "In this server" list (players whose
// reported room matches) groups them: "<relayRoomId>~<colyseusRoomId>" with the relay the matchmaker's
// directory names for the room (each player's own resolve may have returned a different relay for
// the same pod). '' when the directory doesn't list the room yet (it fills every ~2 s).
export async function canonicalRoomKey(colyseusRoomId) {
  try {
    const playUrl = sdk()?.environment?.()?.playUrl
    if (!playUrl || !colyseusRoomId) return ''
    const res = await fetch(`${playUrl.replace(/\/$/, '')}/v1/dir/${encodeURIComponent(GAME_SLUG)}/list`)
    if (!res.ok) return ''
    const r = ((await res.json())?.rooms ?? []).find((x) => x.colyseusRoomId === colyseusRoomId)
    return r?.relayRoomId ? `${r.relayRoomId}~${colyseusRoomId}` : ''
  } catch {
    return ''
  }
}

// Reports the room this player is in ('' = not in a joinable room), so the portal's friend invites
// land in it.
export function updateRoom(roomId) {
  try {
    sdk()?.game?.updateRoom?.(roomId)
  } catch {
    // Ignore.
  }
}

// --- Portal -----------------------------------------------------------
export function showMenu() {
  try {
    sdk()?.portal.showMenu(true)
  } catch {
    // Ignore.
  }
}

// Where Boxity draws its own controls over the game: the toolbar in the top-left corner and
// the chat feed under it, as [{ id, left, top, width, height }] in CSS px. fn runs now and on
// every change (resize, toolbar change). Without the SDK (dev mode, blocked CDN) it gets the
// default footprint the SDK itself assumes until the portal reports, so the HUD is laid out
// the same everywhere. Returns an unsubscribe.
export function onReservedAreas(fn) {
  try {
    const off = sdk()?.ui?.onReservedAreasChange?.((areas) => fn(Array.isArray(areas) ? areas : []))
    if (typeof off === 'function') return off
  } catch {
    // Fall back to the estimate below.
  }
  const update = () => fn(estimatedReservedAreas(window.innerWidth, window.innerHeight))
  window.addEventListener('resize', update)
  update()
  return () => window.removeEventListener('resize', update)
}

// The SDK's estimate (legion-sdk ui.estimatedAreas): an 8 px margin round one row of buttons,
// the whole width on narrow phones, and the chat feed under it.
function estimatedReservedAreas(w, h) {
  const compact = w < 640 || h <= 500
  const toolbarHeight = 16 + (w < 640 ? 32 : w < 768 ? 40 : 44)
  const chatWidth = compact ? Math.min(w * 0.7, 260) : Math.min(w * 0.8, 360)
  return [
    { id: 'toolbar', left: 0, top: 0, width: Math.min(w, w < 480 ? w : 330), height: toolbarHeight },
    { id: 'chat', left: 0, top: toolbarHeight, width: Math.round(chatWidth + 8), height: compact ? 140 : 180 },
  ]
}

export function requestFullscreen(on) {
  try {
    const SDK = sdk()
    if (!SDK) return
    if (on) SDK.portal.requestFullscreen()
    else SDK.portal.exitFullscreen()
  } catch {
    // Ignore.
  }
}

// --- Platform features (docs.bloxity.io) ---------------------------------------------------------
// Emotes, ad breaks, screen ads, leaderboards, badges and overhead chat. Boxity draws the UI for all
// of them; the game only opts in, pauses for ads, reports its screens and reacts to events.
export const BOARDS = [
  { id: 'cash', label: 'Top Cash', format: 'compact' },
  { id: 'speed', label: 'Top Speed', format: 'compact' },
  { id: 'rebirths', label: 'Top Rebirths', format: 'number' },
  { id: 'playtime', label: 'Top Playtime', format: 'time' },
]

function installPlatformFeatures(SDK) {
  const guard = (fn) => {
    try {
      fn()
    } catch (err) {
      console.warn('[bloxity] feature setup failed', err)
    }
  }
  const keep = (off) => {
    if (typeof off === 'function') unsubscribers.push(off)
  }
  // Emotes: Boxity owns the picker; this only makes the button appear (right after init).
  guard(() => SDK.game.registerFeature?.('emotes'))
  // Ads: Boxity runs every ad. Pause + mute for every break, midrolls included.
  guard(() => {
    const a = SDK.ads
    if (!a) return
    keep(a.onBreakStart?.((info) => emit(adBreakListeners, true, info?.kind)))
    keep(a.onBreakEnd?.((info) => emit(adBreakListeners, false, info?.kind)))
    // The game's own screens: one full-screen window at a time ('panel') and the world ('gameplay').
    a.declareScreens?.({ panel: {}, gameplay: {} })
  })
  // Leaderboards: the server reports the scores (backend boxity.ts); declaring shows the trophy button.
  guard(() => SDK.leaderboard?.define?.(BOARDS.map((b) => ({ ...b, mode: 'best', reset: 'none' }))))
  guard(() => keep(SDK.badges?.onEarned?.((badge) => emit(badgeListeners, badge))))
  guard(() => keep(SDK.chat?.onMessage?.((m) => emit(chatListeners, m, SDK.chat.bubbleText?.(m) ?? m?.text ?? ''))))
}

// fn(event, data) for the portal events the game handles itself: 'chat_message_sent',
// 'pointer_lock_changed', 'play_emote' (data = emote id) and 'stop_emote'.
export function onPlayerEvent(fn) {
  playerEventListeners.add(fn)
  return () => playerEventListeners.delete(fn)
}
// fn(active, kind): an ad break starts (true) / ends (false); pause the game and mute while active.
export function onAdBreak(fn) {
  adBreakListeners.add(fn)
  return () => adBreakListeners.delete(fn)
}
export function onBadgeEarned(fn) {
  badgeListeners.add(fn)
  return () => badgeListeners.delete(fn)
}
// fn(message, bubbleText): every chat message in the room (including the player's own).
export function onChat(fn) {
  chatListeners.add(fn)
  return () => chatListeners.delete(fn)
}
// A camera-facing bubble over a three.js object for the SDK's bubbleSeconds.
export function chatBubble(THREE, target, text, height) {
  try {
    sdk()?.chat?.attachBubble?.(THREE, target, text, { height })
  } catch {
    // Cosmetic.
  }
}

// Screen ads: report which of the game's screens is showing ('gameplay' or 'panel'); Boxity draws
// its banners around it. No-ops outside Boxity.
let shownScreen = ''
export function reportScreen(name) {
  if (name === shownScreen) return
  shownScreen = name
  try {
    sdk()?.ads?.screen?.(name)
  } catch {
    // Non-fatal.
  }
}

// Rewarded ads. -> { status: 'completed' | 'skipped' | 'no-fill' | ..., rewardToken? }.
export const adsAvailable = () => {
  try {
    return !!sdk()?.ads?.isAvailable?.()
  } catch {
    return false
  }
}
export async function showRewardedAd(placement) {
  try {
    return (await sdk()?.ads?.showRewarded?.(placement)) ?? { status: 'disabled' }
  } catch {
    return { status: 'error' }
  }
}

// The player's Boxity token: the game server verifies it with the platform to learn who this is.
export function getToken() {
  try {
    return sdk()?.auth?.getToken?.() || ''
  } catch {
    return ''
  }
}

// Friend-join toasts: report the room's players (players already there / players arriving).
export function playerInRoom(name) {
  try {
    sdk()?.game?.playerInRoom?.(name)
  } catch {
    // Cosmetic.
  }
}
export function playerJoined(name) {
  try {
    sdk()?.game?.playerJoined?.(name)
  } catch {
    // Cosmetic.
  }
}

// --- Platform character kit ------------------------------------------------------------------------
// Boxity builds one outfit file per look (body, skin with pants / shirt / face, body parts, every
// accessory) and binds it to our player.glb rig by bone name; we keep the skeleton, animations and
// held items. Everyone's look travels as one URL-safe outfit key, so item types Boxity adds later
// show up here with no code change. dress() resolves null when the kit is off for this game, the key
// is invalid, a custom character is worn or the file failed: callers then keep the manual avatar.
const KEY = /^[A-Za-z0-9_.-]{1,2900}$/
export const validOutfitKey = (key) => typeof key === 'string' && KEY.test(key)

// The local player's outfit key ('' without the SDK): every slot + body proportions.
export function getOutfitKey() {
  try {
    const key = sdk()?.avatar?.getOutfitKey?.()
    return validOutfitKey(key) ? key : ''
  } catch {
    return ''
  }
}

export function kitEnabled() {
  try {
    return !!sdk()?.character?.isEnabled?.()
  } catch {
    return false
  }
}

// -> CharacterHandle { update(key), dispose(), say(text), head, outfitKey } or null.
// `proportions: 'kit'` (default): the kit applies the look's body proportions, so the game must not.
export async function dressCharacter(root, outfitKey) {
  const SDK = sdk()
  if (!SDK?.character?.dress || !validOutfitKey(outfitKey)) return null
  try {
    if (SDK.character.canDress && !SDK.character.canDress(outfitKey)) return null
    return (await SDK.character.dress({ THREE, GLTFLoader, root, outfitKey })) ?? null
  } catch (err) {
    console.warn('[bloxity] character kit failed; using the manual avatar', err)
    return null
  }
}

// --- Skins without the character kit -----------------------------------------------------------------
// Where the kit is off, the others' skins are drawn the manual way from the equipped item ids, so they
// travel too: `look` = JSON { equipped, proportions } (ids only, a few hundred bytes).
export function getLookJson() {
  try {
    const equipped = getEquippedAvatar()
    if (!equipped) return ''
    const out = JSON.stringify({ equipped, proportions: getProportions() ?? null })
    return out.length <= 2900 ? out : ''
  } catch {
    return ''
  }
}
// The skin texture (with pants / shirt / face drawn on) of another player's equipped ids.
export function skinTextureUrlFor(equipped) {
  try {
    const url = sdk()?.avatar?.getSkinTextureUrlFor?.(equipped)
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  }
}
