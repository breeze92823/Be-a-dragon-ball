import * as THREE from 'three'
import { ACESFilmicToneMapping, Clock, Group, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'
import { BASE, CAMERA, graphicsPreset, RENDER, SAFE_ZONE } from './config.js'
import * as bloxity from './bloxity.js'
import { ignoreNextUnlock, install as installInput, onKey } from './input.js'
import { isOpen as isWindowOpen } from './ui/shell.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player, resetPlayer, respawn } from './player.js'
import { setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { isFirstPerson, onModeChanged, toggleMode } from './modes.js'
import { bodyCount, initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { createWorld } from './world.js'
import { buildSafeZone } from './safezone/index.js'
import { setParticleDensity, updateParticles } from './particles.js'
import { installAudio, setAdMuted, setMusicVolume, setVolume, updateAudio, updateMusic } from './audio/index.js'
import { emoteClip } from './avatar/emotes.js'
import { setShowFps, tickFps } from './fps.js'
import { toast } from './toast.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { installFx, updateFx } from './fx.js'
import { createHud } from './hud/hud.js'
import { createLane } from './lane/index.js'
import { createMyBase } from './base/mybase.js'
import { createBaseBoard } from './base/board.js'
import { initUi } from './ui/index.js'
import { load as loadProgress, state, tickSave, changed, addFighter, baseMulti } from './state.js'
import { makeFighter, rosterFor } from './roster.js'
// --- Treadmill / Backpack / Net (imports) ---
import { createTreadmill } from './treadmill.js'
import { createBackpack } from './backpack.js'
import { hint, initNet, net, sendOutfit, sendPose, whenBase } from './net.js'
import { createRemotePlayers } from './remote.js'
import { createRemoteBases } from './safezone/remotebases.js'
import { BASE_DEFAULT } from './safezone/bases.js'

// Boot order: Bloxity SDK -> renderer -> Rapier (async wasm) -> ground + sky + lighting,
// player body -> avatar (async, swaps in when ready) -> loop. The SDK is optional at every step.
let lighting = null
let renderer = null
let postfx = null

// Settings come from the portal's settings menu (or their defaults offline).
function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'master_volume') setVolume(value / 100)
  else if (key === 'music_volume') setMusicVolume(value / 100)
  else if (key === 'show_fps') setShowFps(value)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    setParticleDensity(next.particles)
    postfx?.setSize(window.innerWidth, window.innerHeight)
  }
}
bloxity.onSetting(applySetting)
bloxity.init()
initNet() // join early: the server assigns this player's base, which the safe zone is built around

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
installInput(() => bloxity.showMenu(), renderer.domElement, () => !isWindowOpen()) // Esc opens the portal menu

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

// --- Physics + ground + sky --------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()

lighting = createLighting(scene, renderer, preset)
const world = createWorld(scene) // clouds
// Which base is mine: the server's answer (the join also asks for the one remembered from this tab),
// else the default plot when there is no server.
bloxity.loadingStep('Joining the room')
const builtBase = (await whenBase(6000)) ?? (hint.base >= 0 ? hint.base : BASE_DEFAULT)
hint.base = builtBase
bloxity.loadingStep('Building the safe zone')
const safeZone = await buildSafeZone(scene, { base: builtBase })
const remoteBases = createRemoteBases(scene, safeZone.plots, builtBase, () => ({ name: bloxity.displayName(), pfp: bloxity.getPfp(), multi: baseMulti() }))
// A late join can be given another plot than the one built (it was taken meanwhile): rebuild once around it.
setInterval(() => {
  if (net.base < 0 || net.base === builtBase) return
  const url = new URL(location.href)
  if (url.searchParams.has('dbzBase')) return // already reloaded once around a plot: never loop
  url.searchParams.set('dbzBase', String(net.base))
  location.replace(url)
}, 1000)
installFx(scene)
createPlayerBody()
installAudio()
syncYawToPlayer()

// --- Player avatar ----------------------------------------------------------
// The Bloxity base rig (player.glb; procedural fallback if it fails), dressed
// with the signed-in player's equipped cosmetics and body proportions. It
// rebuilds on customizer edits and sign-in/out.
const playerGroup = new Group()
scene.add(playerGroup)
let avatar = null
let animator = null
let generation = 0
let avatarReady = false

// `kit` = the platform character kit's handle while the avatar is dressed by it (see loadAvatar).
let kit = null
function setAvatar(next, nextKit = null) {
  if (avatar) playerGroup.remove(avatar)
  disposeAnimator(animator)
  kit?.dispose()
  kit = nextKit
  avatar = next
  playerGroup.add(avatar)
  animator = makeAnimator(avatar)
}

setAvatar(buildDefaultCharacter()) // visible immediately; replaced once the rig loads

const remotePlayers = createRemotePlayers(scene, camera)

// --- Lane, your base, HUD -------------------------------------------------------
// Shop / Base / Sell teleport you to those spots in the safe zone (facing in).
function teleportTo(where) {
  const shop = (id) => SAFE_ZONE.shops.find((s) => s.id === id)
  const home = safeZone.homeZone
  const to =
    where === 'base' && home ? { x: home.x, z: home.z - home.hd - 3, facing: 0 } :
    where === 'sell' ? { x: shop('sell').x, z: shop('sell').z + 5, facing: Math.PI } :
    { x: shop('treadmill').x, z: shop('treadmill').z + 6, facing: Math.PI }
  resetPlayer({ x: to.x, y: 0.05, z: to.z }, to.facing)
  syncYawToPlayer()
}
loadProgress()
const hud = createHud({ renderer, onTeleport: teleportTo })
const lane = createLane(scene, { hud, playerGroup, getAvatar: () => avatar })
const myBase = createMyBase(scene, safeZone.mySlots.slice(0, BASE.slots), { hud })
// Your base's entrance boards: clickable with the free cursor / a tap (base/board.js).
const baseBoard = createBaseBoard(scene, safeZone.myBoards, { camera, canvas: renderer.domElement, hud, myBase })
// --- Treadmill / Backpack / Net ---
// Treadmill: the HUD's Treadmill button (or T) trains Speed in the safe zone. Backpack: the bag
// button opens the fighter inventory over the hotbar. Net: progress loads from / saves to the
// game server only (state.tickSave sends it).
const treadmill = createTreadmill(scene, { hud, camera, renderer })
createBackpack({ hud, renderer })
// Windows (src/ui/): Index, Rebirth, Quests, Playtime + Daily Rewards, Settings, x2 Speed.
const ui = initUi({ hud, renderer, camera, applySetting, portalQuality: () => bloxity.settings.graphics_quality, safeZone })
// Respawning (R, touch, portal) while out on the lane loses the orb run / the fighter.
const respawnAll = () => {
  lane.onRespawn()
  respawn()
}

async function loadAvatar() {
  // The SDK fires twice per change (optimistic + confirmed); only the newest load may land.
  const mine = ++generation
  try {
    const group = await loadBaseCharacter()
    if (mine !== generation) return
    // The platform character kit dresses the rig from the outfit key (every slot, the skin with
    // pants / shirt / face, body parts, accessories and proportions, item types added later too).
    // When it can't (kit off, custom character, SDK blocked) the manual path below takes over.
    const handle = await bloxity.dressCharacter(group, bloxity.getOutfitKey())
    if (mine !== generation) return void handle?.dispose()
    if (!handle) {
      const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
      await attachEquippedAccessories(group, equipped, { skinTextureUrl: bloxity.getSkinTextureUrl() })
      if (mine !== generation) return
      applyProportions(group, bloxity.authState.user ? bloxity.getProportions() : null)
    }
    setAvatar(group, handle)
    sendOutfit() // the others dress their copy of you from the same key
  } finally {
    if (mine === generation) avatarReady = true
  }
}

let signedIn = null
bloxity.subscribeAuth((s) => {
  const now = !!s.user
  if (now !== signedIn) {
    signedIn = now
    loadAvatar() // also runs once at start to swap in the real rig
  }
})
bloxity.onAvatarChanged(loadAvatar)
// The kit bakes proportions into the outfit key, so a slider change is a look change.
bloxity.onProportionsChanged(() => (kit ? loadAvatar() : applyProportions(avatar, bloxity.getProportions())))
bloxity.onRespawnRequest(respawnAll)

// --- Boxity platform events ---------------------------------------------------------------
// Emotes (the portal's picker sends the id; the clip comes from its catalogue), the portal handing
// the mouse back, overhead chat bubbles, ad breaks and earned badges.
bloxity.onPlayerEvent((event, data) => {
  if (event === 'play_emote') emoteClip(String(data)).then((clip) => clip && animator?.playEmote(clip))
  else if (event === 'stop_emote') animator?.stopEmote()
  else if (event === 'pointer_lock_changed' && !data && document.pointerLockElement) {
    ignoreNextUnlock() // the portal's own menu is open already
    document.exitPointerLock?.()
  }
})
bloxity.onChat((message, text) => {
  if (!text) return
  const target = message?.isLocalPlayer ? playerGroup : remotePlayers.byUid(message?.userId)
  if (target) bloxity.chatBubble(THREE, target, text, 2.3)
})
let adBreak = false
bloxity.onAdBreak((active) => {
  adBreak = active
  setAdMuted(active)
})
bloxity.onBadgeEarned((badge) => toast(`Badge: ${badge?.name ?? 'earned'}`, badge?.description ?? '', '#ffd23a'))

// --- Modes + keys --------------------------------------------------------------
onModeChanged((mode) => {
  playerGroup.visible = mode !== 'player' // first person: you are the camera
})
onKey('KeyV', toggleMode)
onKey('KeyN', () => lighting.toggleDayNight())
onKey('KeyR', respawnAll)
installTouch({ mode: toggleMode, day: () => lighting.toggleDayNight(), respawn: respawnAll })

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
const audioState = { camera, player: { x: 0, y: 0, z: 0, vy: 0, grounded: true, speed: 0 }, surface: 'plastic', inDesert: false, fuse: safeZone.fuse }
let shownLoading = true
const cinePos = new Vector3()
const cineLook = new Vector3()
const chaseLook = new Vector3()
let orbChased = false
let cineBlend = 0
let readySince = 0

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1) // clamp huge frames (tab switch, breakpoint)
  if (adBreak) return // an ad plays over the game: it is paused until the break ends
  tickFps(dt)
  const elapsed = clock.elapsedTime

  stepPhysics(dt) // runs the player controller + world at the fixed rate, interpolates bodies
  interpolatePlayer()

  const p = player.renderPosition
  playerGroup.position.set(p.x, p.y, p.z)
  playerGroup.rotation.y = player.facing
  if (avatar) avatar.visible = lane.form === 'human' // orb / fighter forms replace the avatar
  animator?.update(dt, {
    grounded: player.grounded,
    speed: Math.hypot(player.velocity.x, player.velocity.z),
    verticalVelocity: player.velocity.y,
    turn: 0,
    carry: lane.carrying,
  })

  lane.update(dt, elapsed, p, isFirstPerson())
  remotePlayers.update(dt)
  remoteBases.update(dt)
  sendPose(p.x, p.y, p.z, player.facing, Math.hypot(player.velocity.x, player.velocity.z), { form: lane.presenceForm, ball: state.ball, fighter: lane.fighterLook, held: lane.heldLook, multi: baseMulti(), slots: state.slots.map((sl) => sl.fighter?.look ?? null) }, performance.now())
  myBase.update(dt, elapsed, p, lane.form)
  baseBoard.update(dt, p, lane.form)
  treadmill.update(dt, elapsed) // --- Treadmill ---
  updateCamera(camera, dt)
  // Carried / hatching: ease to the lane's cinematic shot through the base's open front.
  const cine = lane.cinematic
  cineBlend += ((cine ? 1 : 0) - cineBlend) * (1 - Math.exp(-3 * dt))
  if (cine) {
    const k = 1 - Math.exp(-4 * dt)
    cinePos.x += (cine.x - cinePos.x) * k
    cinePos.y += (cine.y - cinePos.y) * k
    cinePos.z += (cine.z - cinePos.z) * k
    cineLook.x += (cine.lx - cineLook.x) * k
    cineLook.y += (cine.ly - cineLook.y) * k
    cineLook.z += (cine.lz - cineLook.z) * k
  } else if (cineBlend < 0.01) {
    cinePos.copy(camera.position)
    camera.getWorldDirection(cineLook).multiplyScalar(10).add(camera.position)
  }
  if (cineBlend > 0.01) {
    camera.getWorldDirection(chaseLook).multiplyScalar(10).add(camera.position)
    camera.position.lerp(cinePos, cineBlend)
    camera.lookAt(chaseLook.lerp(cineLook, cineBlend))
  }
  // Lane camera effects: the view leans toward a waking / roaring guardian, the FOV kicks
  // (zoom-in on a catch or hatch, widening as a guardian closes in).
  const fx = lane.camFx
  if (fx.lookW > 0.01 && cineBlend < 0.5) {
    camera.getWorldDirection(chaseLook).multiplyScalar(12).add(camera.position)
    camera.lookAt(chaseLook.lerp(fx.look, fx.lookW))
  }
  // (camera.js rewrites camera.fov every frame it differs from its own value, so the kick is
  // simply added on top again each frame.)
  if (Math.abs(fx.fov) > 0.02) {
    camera.fov += fx.fov
    camera.updateProjectionMatrix()
  }
  // Guardian stomps / roars / grabs shake the camera a little (a tilt wobble too).
  const shake = lane.shake
  if (shake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.5
    camera.position.y += (Math.random() - 0.5) * shake * 0.5
    camera.position.z += (Math.random() - 0.5) * shake * 0.5
    camera.rotateZ((Math.random() - 0.5) * shake * 0.03)
  }
  world.update(dt, elapsed)
  safeZone.update(dt, elapsed, p)
  updateParticles(elapsed, renderer.domElement.height)
  updateFx(dt, renderer.domElement.height)
  hud.update(dt, camera)
  ui.update(dt)
  tickSave(dt)
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  audioState.player.x = p.x
  audioState.player.y = p.y
  audioState.player.z = p.z
  audioState.player.vy = player.velocity.y
  audioState.player.grounded = player.grounded
  audioState.player.speed = speed
  audioState.surface = safeZone.surfaceAt(p)
  audioState.inDesert = safeZone.inDesert
  updateAudio(dt, audioState)
  // Music follows the situation: hub calm, lane adventure, hatch mystery, chase tension.
  const f = lane.form
  if (lane.danger > 0.45) orbChased = true // hysteresis: no flapping between moods
  else if (lane.danger < 0.15) orbChased = false
  updateMusic(f === 'human' ? 'safe' : f === 'orb' ? (orbChased ? 'chase' : 'lane') : f === 'caught' || f === 'hatching' ? 'hatch' : 'chase')
  lighting.update(dt, playerGroup.position)
  postfx.render()

  // Loading ends once the scene has drawn and the avatar has had its chance (max ~5 s).
  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
}
renderer.setAnimationLoop(frame)

window.addEventListener('beforeunload', bloxity.teardown)

// Dev-only console hook, e.g. __game.teleport(-24, 0, 6, Math.PI / 2)
if (import.meta.env.DEV) {
  const teleport = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  const setSpeed = (n) => {
    state.speed = n
    changed()
  }
  const giveMoney = (n) => {
    state.money += n
    changed()
  }
  // e.g. __game.giveFighter('Rare') puts a roster fighter in your hands
  const giveFighter = (rarity = 'Common') => {
    const list = rosterFor(rarity)
    addFighter(makeFighter(list[Math.floor(Math.random() * list.length)], state.nextId++))
  }
  // frame: one loop iteration (drive it with setInterval when the tab is hidden and rAF stalls)
  window.__game = { remotePlayers, player, scene, renderer, camera, postfx, bodies: bodyCount, toggleMode, teleport, safeZone, lane, state, setSpeed, giveMoney, giveFighter, hud, frame }
}
