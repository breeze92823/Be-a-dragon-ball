import { FighterActor } from '../lane/actor.js'
import { net } from '../net.js'
import { LANE } from '../config.js'

// Every player of the room owns one base (the server assigns the plot, `PlayerState.base`). This keeps
// the plots in step with the roster: each plot's owner card shows its owner's Boxity DP, name and Cash
// Multi (a free plot reads "Free Base"), and the fighters standing on another player's slots are drawn
// from what they relay (`baseSlots`). Your own plot is driven by base/mybase.js; only its card is set here.

function parseLook(csv) {
  const a = csv ? csv.split(',') : []
  if (a.length !== 9) return null
  return { gi: a[0], pants: a[1], hair: a[2], skin: a[3], belt: a[4], boots: a[5], style: Number(a[6]) || 0, stance: Number(a[7]) || 0, cape: a[8] === '1' }
}

// plots: safeZone.plots; mine: your plot index; local(): { name, pfp, multi } of you.
export function createRemoteBases(scene, plots, mine, local) {
  // per plot: the fighter actor on each slot, keyed by the look it shows
  const shown = plots.map(() => [])

  function clear(i) {
    for (const s of shown[i]) s?.actor.root.removeFromParent()
    shown[i] = []
  }

  function fill(i, csv) {
    const looks = csv ? csv.split('|') : []
    const slots = plots[i].slots
    for (let j = 0; j < slots.length; j++) {
      const want = looks[j] || ''
      const cur = shown[i][j]
      if ((cur?.csv ?? '') === want) continue
      cur?.actor.root.removeFromParent()
      shown[i][j] = null
      const look = parseLook(want)
      if (!look) continue
      const actor = new FighterActor(look, LANE.character.scale * 0.8)
      actor.root.position.set(slots[j].x, slots[j].y + 0.42, slots[j].z)
      actor.root.rotation.y = slots[j].faceYaw
      scene.add(actor.root)
      shown[i][j] = { csv: want, actor }
    }
  }

  return {
    update(dt) {
      const room = net.connected ? net.room : null
      const owners = new Map() // plot index -> roster player
      room?.state?.players?.forEach((p, id) => {
        if (id !== room.sessionId && p.base >= 0 && p.base < plots.length) owners.set(p.base, p)
      })
      plots.forEach((plot, i) => {
        if (i === mine) {
          plot.card.set(local())
          return
        }
        const p = owners.get(i)
        plot.card.set(p ? { name: p.username || 'Player', pfp: p.pfp, multi: p.multi } : null)
        if (p) fill(i, p.baseSlots)
        else if (shown[i].length) clear(i)
        for (const s of shown[i]) s?.actor.update(dt, 0, 'idle')
      })
    },
  }
}
