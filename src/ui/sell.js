import { SELL } from '../config.js'
import { addMoney, allFighters, held, moneyMulti, recordSell, removeFighters, state } from '../state.js'
import { toast } from '../toast.js'
import { sfx } from '../audio/index.js'
import { button, el, money } from './shell.js'

// Sell stall: standing on the Sell pad shows the shopkeeper's dialog beside you (not a window,
// you can still look around): 1 Sell this fighter (the one in your hands), 2 Sell all my fighters
// (hotbar + Backpack; asks once more first), 3 What's this fighter worth?, 4 Never mind. Tap an
// option or press its number. A fighter sells for its income x SELL.seconds x the money multiplier.

export const sellPrice = (f) => Math.round(f.income * SELL.seconds * moneyMulti())

export function createSell({ hud }) {
  const box = el('div', 'sell-dlg')
  box.appendChild(el('div', 'sell-say ol', 'Sell me your fighters!'))
  const opts = [
    ['Sell this fighter', sellHeld],
    ['Sell all my fighters', sellAll],
    ["What's this fighter worth?", worth],
    ['Never mind', () => show(false, true)],
  ].map(([text, fn], i) => {
    const b = button('sell-opt', `<i class="ol">${i + 1}</i><span class="ol">${text}</span>`, () => fn())
    box.appendChild(b)
    return b
  })
  document.body.appendChild(box)

  let open = false
  let dismissed = false // Never mind: stays shut until you step off the pad and on again
  let confirmAll = 0 // s left to confirm Sell all

  function show(on, dismiss = false) {
    if (dismiss) dismissed = true
    if (!on && !dismiss) dismissed = false // stepped off
    open = on && !dismissed
    box.classList.toggle('open', open)
    confirmAll = 0
    opts[1].lastChild.textContent = 'Sell all my fighters'
  }

  function pay(list) {
    const total = list.reduce((n, f) => n + sellPrice(f), 0)
    addMoney(total)
    hud.moneyPop?.()
    recordSell(list.length)
    sfx.coins?.(Math.min(12, 3 + list.length), 0)
    return total
  }

  function sellHeld() {
    const f = held()
    if (!f) return toast('Hold a fighter first', 'Pick one in your hotbar, then sell it', '#ff8a6a')
    removeFighters([f.id])
    toast(`Sold ${f.name}!`, `+${money(pay([f]))}`, '#9dff3a')
  }

  function sellAll() {
    const list = allFighters()
    if (!list.length) return toast('No fighters to sell', 'Your hotbar and Backpack are empty', '#ff8a6a')
    if (confirmAll <= 0) {
      confirmAll = 4
      opts[1].lastChild.textContent = `Sure? Tap again (${list.length} for ${money(list.reduce((n, f) => n + sellPrice(f), 0))})`
      return
    }
    removeFighters(list.map((f) => f.id))
    toast(`Sold ${list.length} fighters!`, `+${money(pay(list))}`, '#9dff3a')
    show(true)
  }

  function worth() {
    const f = held()
    if (!f) return toast('Hold a fighter first', 'Pick one in your hotbar to price it', '#ff8a6a')
    toast(`${f.name} is worth ${money(sellPrice(f))}`, `${f.rarity}${f.mutation ? `, ${f.mutation}` : ''}`, '#ffe14a')
  }

  // Number keys pick an option while the dialog is up (before the hotbar sees them).
  window.addEventListener(
    'keydown',
    (e) => {
      if (!open || e.repeat) return
      const k = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code]
      if (k === undefined) return
      e.stopImmediatePropagation()
      e.preventDefault()
      opts[k].click()
    },
    true,
  )

  return {
    show,
    update(dt) {
      if (confirmAll > 0) {
        confirmAll -= dt
        if (confirmAll <= 0) opts[1].lastChild.textContent = 'Sell all my fighters'
      }
      // Lists change under the dialog (a fighter placed meanwhile): nothing to redraw but the hint.
      box.classList.toggle('none', !state.inventory.length && !state.backpack.length)
    },
  }
}
