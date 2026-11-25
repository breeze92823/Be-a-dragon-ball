# The lane and your base slots

How the lane screenshots map onto the build (`src/lane/`, `src/base/`, `src/hud/`,
numbers in `LANE`, `ZONES` and `BASE` in `src/config.js`). Metres, +X east,
+Z south; the lane runs north (-Z) from the safe zone.

## Loop

1. **Orb.** Stepping off the green (z < -40) turns you into a winged orb
   (puff + chime). It rolls at a pace set by your **Speed** stat
   (`LANE.speedCurve`, m/s = 8 + 6 log10(1 + speed/1000)); the speedometer shows
   the current speed out of your stat, the top bar shows which zone you are in,
   and the luck multiplier under your head climbs from x1.0 to x1.5 the deeper
   into a zone you get. Back onto the green: you are yourself again.
2. **Guardian.** Each zone's guardian sleeps on a bench in its base (Z's,
   snoring). When the orb comes within `wakeRange` of it, it stands up, roars and
   chases. With Speed >= the zone's recommended speed it runs at 0.82x your top
   speed (you outrun it, it gives up past its zone); slower than that and it runs
   at 1.6x and catches you.
3. **Caught.** It grabs the orb, lifts it overhead, carries it into its base and
   sets it on a slot. The orb shakes, a dark vortex with white sparks swirls up,
   a black silhouette grows inside it, then a flash: you are now a fighter of the
   zone's rarity (`roster.js`, income x luck, maybe a mutation), "You hatched into
   a ... RUN AWAY!", the **Run !!!** banner, red vignette and heartbeat.
4. **Run.** The guardian rages (turns red, stamps) for `angryTime`, then hunts you
   at `huntSpeed` (11 m/s; the fighter runs at 14). Caught: it snatches the
   fighter back and you respawn without it. Reach the green: confetti, fanfare,
   the fighter goes into your hotbar and into your hands.
5. **Base.** Select a hotbar slot (1-9, 0 or tap) to hold that fighter. On an
   empty slot pedestal of your base, hold **E** (or the prompt) for
   `BASE.placeHold` s: it drops onto the slot and earns income/s into the green
   pad in front (its label counts up). Step on the pad to collect: cash bundles
   fly into you with "+$" pops and a cha-ching. E on a filled slot picks it up
   (or swaps with the one you hold). The orange sign upgrades the slot
   (+50% base income per level, price grows x1.8 per level).

R / portal respawn while out on the lane loses the run.

## Zones

| # | Zone | Recommended | Guardian | Scenery |
|---|------|-------------|----------|---------|
| 0 | Common | 2.7K | Mummy Warrior | the desert (z -40..-118), base at x 24 |
| 1 | Uncommon | 8K | Jungle Brute | jungle trees |
| 2 | Rare | 25K | Frost Giant | ice crystals, snow |
| 3 | Epic | 80K | Void Golem | purple crystals |
| 4 | Legendary | 250K | Golden Pharaoh | gold obelisks, coin stacks |
| 5 | Mythical | 800K | Magma Ogre | volcanic cones, lava pools, embers |
| 6 | Secret | 2.5M | Crimson Oni | red spikes |
| 7 | Eternal | 8M | Silver Sentinel | marble columns |
| 8 | Divine | 25M | Prism Titan | rainbow arches, clouds |
| 9 | Heavenly | 80M | Sakura Ronin | sakura trees, petals |
| 10 | Celestial | 250M | Sky Warden | glowing planets, stars |
| 11 | Primal | 800M | Elder Colossus | ruins |

Zones 1-11 are 64 x 90 m walled corridors through an opening in the desert's far
wall, each with a gate arch, a floating "<Zone> Zone / Recommended" sign and its
guardian base beside the carpet (alternating sides). Set pieces further than
`LANE.cullDistance` are hidden; guardians further than 260 m are not updated.

## Files

- `lane/index.js` the form state machine (human / orb / caught / hatching / fighter), wake/leash rules, hatch timeline, held fighter in front of the avatar, HUD feed.
- `lane/world.js` zones (`zoneBounds`, `zoneAt`), corridors, scenery, signs. `lane/house.js` a guardian base + its gameplay points (seat, door, slots). `lane/guardian.js` the rigged giant + its AI states. `lane/orb.js` the winged orb. `lane/actor.js` an animated fighter.
- `base/mybase.js` your base's ground-floor slots: place / pick up / swap / upgrade prompts, income, pad labels, collecting (bundles, pops).
- `hud/hud.js` + `hud.css` counters, Shop/Base/Sell, menu grid (`onMenu`), zone bar, speedometer, Run banner, hatch message, hotbar (+ Backpack hooks), hold-E prompt. `hud/icon.js` renders hotbar portraits.
- `fx.js` one-shot CPU particles (puffs, dust, vortex, flashes, trails) and confetti.
- `state.js` money, speed, hotbar, slots (saved through the server, `net.js`).

Guardian and fighter names are original stand-ins (project rule in `SAFE_ZONE.md`).
