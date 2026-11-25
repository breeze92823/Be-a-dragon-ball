import { RARITIES } from '../config.js'
import { addFighter, addMoney, changed, moneyMulti, state } from '../state.js'
import { indexKey, makeFighter, rosterPick } from '../roster.js'
import { sfx } from '../audio/index.js'
import { toast } from '../toast.js'
import { el, money } from './shell.js'

// Rewards shared by Playtime Rewards, Daily Rewards and Daily Quests. A reward entry (config) is
// { cash } ($, x the money multiplier), { fighter: rarity, pick } (a roster fighter, Default
// mutation, into the hotbar) or { boost: 'luck', minutes }.

export const ICON = {
  cash: '<svg viewBox="0 0 64 48"><g stroke="#0b3a14" stroke-width="2.5" stroke-linejoin="round"><path d="M6 24 L36 10 L60 24 L30 40Z" fill="#59c85a"/><path d="M6 24 L6 31 L30 47 L30 40Z" fill="#2f8a3a"/><path d="M30 40 L60 24 L60 31 L30 47Z" fill="#247a2e"/><path d="M6 18 L36 4 L60 18 L30 34Z" fill="#6ad86a"/><path d="M6 18 L6 24 L30 40 L30 34Z" fill="#3a9a44"/><path d="M30 34 L60 18 L60 24 L30 40Z" fill="#2a8a34"/><path d="M16 13 L48 27" stroke="#ffd23a" stroke-width="6"/></g><ellipse cx="33" cy="19" rx="6" ry="3.6" fill="#c8f5b0"/></svg>',
  clover: '<svg viewBox="0 0 64 64"><g fill="#3fd13a" stroke="#0b4a14" stroke-width="3"><circle cx="22" cy="22" r="12"/><circle cx="42" cy="22" r="12"/><circle cx="22" cy="40" r="12"/><circle cx="42" cy="40" r="12"/></g><circle cx="32" cy="31" r="6" fill="#6aff5a"/><path d="M34 40 q6 12 14 20" stroke="#0b4a14" stroke-width="5" fill="none" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 100 100"><path d="M12 54 L38 80 L90 22" fill="none" stroke="#0b3a08" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 54 L38 80 L90 22" fill="none" stroke="#4ae81a" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}

const rarityOf = (name) => RARITIES.find((r) => r.name === name) ?? RARITIES[0]

// What a reward looks like on a card: { label, entry (roster fighter) | null, icon (svg) }.
export function describe(reward) {
  if (reward.fighter) {
    const entry = rosterPick(reward.fighter, reward.pick ?? 0)
    return { label: entry.name, entry, icon: '', rarity: rarityOf(entry.rarity) }
  }
  if (reward.boost) return { label: reward.label ?? 'x2 Luck', entry: null, icon: ICON.clover }
  const n = Math.round(reward.cash * moneyMulti())
  return { label: n < 1e6 ? `$${n.toLocaleString('en-US')}` : money(n), entry: null, icon: ICON.cash }
}

// The picture element for a reward: a portrait <img> (filled by the portrait renderer) or an icon.
export function rewardPic(reward, portraits) {
  const d = describe(reward)
  if (!d.entry) return el('div', 'pic-icon', d.icon)
  const img = el('img', 'portrait')
  img.alt = ''
  portraits.into(img, `default.${d.entry.key}`, d.entry.look, 'color', null)
  return img
}

// Marks a fighter as discovered in the Index; true when it is new.
export function discover(f) {
  const key = indexKey(f)
  if (state.discovered.has(key)) return false
  state.discovered.add(key)
  changed()
  return true
}

// Gives the reward to the player (after the server said ok, where it decides).
export function grant(reward, hud) {
  if (reward.fighter) {
    const entry = rosterPick(reward.fighter, reward.pick ?? 0)
    const f = makeFighter(entry, state.nextId++, null)
    addFighter(f)
    discover(f)
    toast(`${f.name} joined you!`, `${f.rarity} fighter, now in your hotbar`, rarityOf(f.rarity).color)
    sfx.sparkle?.(0)
    return
  }
  if (reward.boost === 'luck') {
    const now = Date.now()
    state.luckBoostUntil = Math.max(now, state.luckBoostUntil) + reward.minutes * 60_000
    changed()
    toast('x2 Luck!', `Double mutation luck for ${reward.minutes} minutes`, '#d88aff')
    sfx.sparkle?.(0)
    return
  }
  const n = Math.round(reward.cash * moneyMulti())
  addMoney(n)
  hud?.moneyPop?.()
  toast(`+${money(n)}`, 'Cash reward claimed', '#9dff3a')
  sfx.coins?.(6, 0)
}
