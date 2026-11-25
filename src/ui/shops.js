import { BALLS, RARITIES, TREADMILLS } from '../config.js'
import { changed, state } from '../state.js'
import { toast } from '../toast.js'
import { sfx } from '../audio/index.js'
import { ballSvg } from '../balls.js'
import { big, button, createWindow, el, isOpen, money } from './shell.js'
import { ICON } from './rewards.js'

// The two catalog shops, both paid in $ only (never premium currency):
//  - Treadmills Shop! (the Treadmill Shop kiosk): TREADMILLS, each more Speed per stride. Buying
//    equips it; the HUD's Treadmill then drops that machine (treadmill.js reads the equipped one).
//  - Dragon Ball Shop (the Dragon Ball Shop stage): BALLS, each a luck multiplier and the ball you
//    roll down the lane as (lane/orb.js).
// Cards list every entry in order: owned -> Equip / Equipped, not owned -> its $ price (greyed
// while you can't afford it). The starter ("" id) is always owned.

const TREAD_ICON = '<svg viewBox="0 0 64 64"><path d="M6 46 L44 30 L58 36 L20 54Z" fill="#4a4d5c" stroke="#14103a" stroke-width="3" stroke-linejoin="round"/><path d="M40 10 v22 M50 14 v20" stroke="#c9cde0" stroke-width="5" stroke-linecap="round"/><rect x="36" y="6" width="18" height="9" rx="3" fill="#38e0ff" stroke="#14103a" stroke-width="3"/></svg>'

// A treadmill in its colours (card picture).
function treadPic(c) {
  return `<svg viewBox="0 0 120 90"><path d="M8 70 L70 44 L112 58 L50 86Z" fill="${c.bodyDark}" stroke="#14103a" stroke-width="3" stroke-linejoin="round"/><path d="M16 66 L70 44 L104 56 L50 78Z" fill="#4a4d5c"/><path d="M30 64 L74 46 M42 70 L86 51 M54 75 L96 56" stroke="#e9ecf5" stroke-width="3" opacity="0.7"/><path d="M8 70 L50 86 L50 90 L8 74Z" fill="${c.body}" stroke="#14103a" stroke-width="2"/><path d="M50 86 L112 58 L112 62 L50 90Z" fill="${c.trim}" stroke="#14103a" stroke-width="2"/><path d="M84 52 L84 14 M100 56 L100 18" stroke="${c.body}" stroke-width="8" stroke-linecap="round"/><path d="M84 52 L84 14 M100 56 L100 18" stroke="#14103a" stroke-width="1.5" opacity="0.4"/><rect x="74" y="8" width="36" height="14" rx="4" fill="${c.body}" stroke="#14103a" stroke-width="3"/><rect x="80" y="11" width="24" height="7" rx="2" fill="${c.neon}"/><path d="M14 68 L66 46" stroke="${c.neon}" stroke-width="2.5"/></svg>`
}

const rarityOf = (name) => RARITIES.find((r) => r.name === name) ?? RARITIES[0]

function createShop({ id, title, icon, theme, width, list, ownedKey, equipKey, picture, bg, lines, onEquip, hud }) {
  const w = createWindow({ id, title, icon, theme, width })
  const listEl = el('div', 'sh-list')
  w.body.appendChild(listEl)
  const owns = (item) => !item.id || state[ownedKey].includes(item.id)
  const rows = list.map((item) => {
    const card = el('div', 'sh-card')
    const [a, b] = bg(item)
    card.style.setProperty('--a', a)
    card.style.setProperty('--b', b)
    const pic = el('div', 'sh-pic', picture(item))
    const info = el('div', 'sh-info')
    info.appendChild(el('div', 'sh-name ol', item.name))
    for (const l of lines(item)) info.appendChild(l)
    const btns = el('div', 'sh-btns')
    const btn = button('ui-btn sh-btn', '', () => act(item))
    btns.appendChild(btn)
    info.appendChild(btns)
    card.append(pic, info)
    listEl.appendChild(card)
    return { item, card, btn }
  })

  function act(item) {
    if (owns(item)) {
      if (state[equipKey] === item.id) return
      state[equipKey] = item.id
      changed()
      onEquip?.(item, false)
      toast(`${item.name} equipped!`, '', '#7dff5a')
      sfx.padEnter?.(0)
      return refresh()
    }
    if (state.money < item.price) return toast('Not enough cash', `${item.name} costs ${money(item.price)}`, '#ff8a6a')
    state.money -= item.price
    state[ownedKey] = [...state[ownedKey], item.id]
    state[equipKey] = item.id
    changed()
    hud?.moneyPop?.()
    onEquip?.(item, true)
    toast(`Bought ${item.name}!`, 'Equipped', '#7dff5a')
    sfx.coins?.(6, 0)
    sfx.sparkle?.(0)
    refresh()
  }

  function refresh() {
    for (const r of rows) {
      const on = state[equipKey] === r.item.id
      if (owns(r.item)) {
        r.btn.textContent = on ? 'Equipped' : 'Equip'
        r.btn.className = `ui-btn sh-btn${on ? ' on' : ' equip'}`
      } else {
        r.btn.textContent = money(r.item.price)
        r.btn.className = `ui-btn sh-btn buy${state.money < r.item.price ? ' off' : ''}`
      }
      r.card.classList.toggle('on', on)
    }
  }
  w.onOpen = () => {
    refresh()
    // Scroll to the first one you don't own yet (the next upgrade).
    const next = rows.find((r) => !owns(r.item)) ?? rows[rows.length - 1]
    w.body.scrollTop = Math.max(0, next.card.offsetTop - listEl.offsetTop - 8 - next.card.offsetHeight)
  }
  let tick = 0
  return {
    update(dt) {
      tick -= dt
      if (tick > 0 || !isOpen(id)) return
      tick = 0.3
      refresh()
    },
  }
}

export function createTreadmillShop({ hud }) {
  return createShop({
    id: 'treadmills',
    title: 'Treadmills Shop!',
    icon: TREAD_ICON,
    theme: 'treads',
    width: 760,
    list: TREADMILLS,
    ownedKey: 'treadmills',
    equipKey: 'treadmill',
    picture: (t) => treadPic(t.colors),
    bg: (t) => t.bg,
    lines: (t) => [el('div', 'sh-tag ol', `+${big(t.gain)} Speed`)],
    hud,
  })
}

export function createBallShop({ hud }) {
  return createShop({
    id: 'balls',
    title: 'Dragon Ball Shop',
    icon: ballSvg(BALLS[1].look),
    theme: 'balls',
    width: 760,
    list: BALLS,
    ownedKey: 'balls',
    equipKey: 'ball',
    picture: (b) => ballSvg(b.look),
    bg: () => ['#173a22', '#0c2414'],
    lines: (b) => {
      const r = rarityOf(b.rarity)
      const ra = el('div', 'sh-rarity ol', b.rarity)
      ra.style.color = r.color
      return [ra, el('div', 'sh-luck ol', `${ICON.clover}<span>x${b.luck}</span>`)]
    },
    hud,
  })
}
