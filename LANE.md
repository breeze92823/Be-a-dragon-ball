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
3. **Caught.** It grabs the orb (snap zoom, flash), lifts it overhead, carries it
   into its base and sets it on a slot (cinematic camera through the open front).
   It slaps the dust off its palms, walks back to its bench, sits, yawns and
   stretches, and nods off. Only once it is asleep does the orb hatch:
   the orb shakes, a dark vortex with white sparks swirls up,
   a black silhouette grows inside it, then a flash: you are now a fighter of the
   zone's rarity (`roster.js`, income x luck, maybe a mutation), "You hatched into
   a ... RUN AWAY!", the **Run !!!** banner, red vignette and heartbeat.
4. **Run.** The guardian sleeps on for `wakeDelay` (3 s, Z's and snoring), then
   stirs, sniffs, notices ("!" + sting; the camera leans toward it), gets up, roars
   red and stamps for `angryTime`, then hunts you at `huntSpeed` (11 m/s; the
   fighter runs at 14), head tracking you, all the way to the safe zone. The
   closer it gets, the wider the FOV, the redder the vignette and the faster the
   heartbeat. Caught: it snatches the fighter back and you respawn without it.
   Run the wrong way (deeper into the lane) for `wrongWayTime` (5 s; a warning at
   1.5 s) and it leans in growling with burning red eyes and drool as a fanged
   jaw creaks open, lashes out a long tongue (slow motion on the hit), reels you to
   its lips where you struggle, then CHOMP (dark flash): crunchy chewing with
   puffed cheeks and crumbs, a gulp that bulges down its throat into its belly, a
   belly-patting "HO HO HO", a gassy burp, a lip-lick and a long glare, while the
   camera pushes in on its face. Then the fighter is gone and you respawn. Reach the green: confetti, fanfare, the
   fighter goes into your hotbar and into your hands.
6. **Music** (`audio/music.js`, `AUDIO.music`): generative and low/warm (pads,
   kalimba, sine bass, low hand drums, everything lowpassed, no hats). Moods: safe
   (hub), lane, hatch (carried / hatching), chase (hunted, or a guardian closing on
   the orb). Mood changes fade out, switch on a bar and fade in; polyphony is capped;
   it plays on `A.amb` (Settings > Mute Music).
5. **Base.** Select a hotbar slot (1-9, 0 or tap) to hold that fighter. On an
   empty slot pedestal of your base, hold **E** (or the prompt) for
   `BASE.placeHold` s: it drops onto the slot and earns income/s into the green
   pad in front (its label counts up). Step on the pad to collect: cash bundles
   fly into you with "+$" pops and a cha-ching. E on a filled slot picks it up
   (or swaps with the one you hold). The orange sign upgrades the slot
   (+50% base income per level, price grows x1.8 per level).

R / portal respawn while out on the lane loses the run.

## Zones

| # | Zone | Recommended | Guardian (giants.js look, roar) | Base (housedeco.js) | Scenery |
|---|------|-------------|----------|------|---------|
| 0 | Common | 2.7K | Mummy Warrior: bandages, gold/lapis collar, glowing scarab, trailing wraps; sand motes; rasping hiss | sandstone tomb: obelisks, hieroglyph bands, crenellations, winged sun disk, urns | the desert (z -40..-118), base at x 24; desert.js adds an obelisk avenue with fire bowls, striped mounds, a palm oasis, a beast skeleton, a glyph wall, drifting sand, tumbleweeds, circling vultures, dust devils |
| 1 | Uncommon | 8K | Jungle Brute: gorilla build, mossy hide, tusks, war paint, bone necklace, leaf skirt; falling leaves; chest-beat roar | thatched hut: log posts, hanging vines, skull totems, bushes | jungle trees, fireflies, falling leaves |
| 2 | Rare | 25K | Frost Giant: fur mantle, ice spikes, icicle beard; frosty breath; howl + cracking ice | ice hall: snow cap, icicles, ice clusters | ice crystals, snow, ground mist |
| 3 | Epic | 80K | Void Golem: cracked stone, glowing seams + core, orbiting shards; double-biceps roar, grinding stone | crystal vault: amethyst clusters, rune frieze | purple crystals |
| 4 | Legendary | 250K | Golden Pharaoh: striped headdress, cobra, beard, collar, kilt, ankh; gong + brass | golden temple: gold obelisks, coin hoards, sun disk | gold obelisks, coin stacks, falling glitter |
| 5 | Mythical | 800K | Magma Ogre: basalt with glowing lava cracks, flame crown, curved horns; embers + smoke breath | magma forge: roof spikes, lava channels by the carpet, anvils | volcanic cones, lava pools, embers |
| 6 | Secret | 2.5M | Crimson Oni: white mane, horns, fangs, tiger cloth, prayer beads, kanabo club; red mist; stamping taiko roar | oni shrine: curved eaves, red lanterns, torii gate | red spikes, drifting red motes |
| 7 | Eternal | 8M | Silver Sentinel: crested helm, glowing visor, pauldrons, shield, cape; war horn + clang; metal steps | marble temple: columns, pediment, spear statues | marble columns, white motes |
| 8 | Divine | 25M | Prism Titan: faceted crystal, rainbow gems, halo, orbiting prisms, beating wings; choir chord | cloud palace: rainbow over the roof, clouds, star lights | rainbow arches, clouds, rainbow sparkles |
| 9 | Heavenly | 80M | Sakura Ronin: petal robe, wide sleeves, straw hat, mask, ponytail, katana; reaches for the sword; kiai | pagoda: two roof tiers, paper lanterns, stone lanterns, blossom tree | sakura trees, petals |
| 10 | Celestial | 250M | Sky Warden: starry armour, cyan seams, orbiting planets, star cape; sci-fi sweep | star observatory: glass dome, dish, blinking mast, planet plinths | glowing planets, stars |
| 11 | Primal | 800M | Elder Colossus: mossy carved stone, green runes, stone crown, shoulder tree, hanging vines; earth rumble | overgrown ruin: moss, vines, broken columns, half-sunk stone head | ruins, fireflies |

Zones 1-11 are 64 x 90 m walled corridors through an opening in the desert's far
wall, each with a gate arch, a floating "<Zone> Zone / Recommended" sign and its
guardian base beside the carpet (alternating sides). Set pieces further than
`LANE.cullDistance` are hidden; guardians further than 260 m are not updated.

Every guardian shares one rig (same joints and limb lengths, so every pose fits all of them);
its body is merged per joint and material (~30-45 meshes). Each base has two torch flames
(GPU emitters), a themed throne behind the bench and drifting motes; every zone has its own quiet
sound bed (audio/zones.js) and every giant its own roar layer, footstep layer and idle sounds
(sfx.giantVoice / giantStepLayer / giantIdle).

## Files

- `lane/index.js` the form state machine (human / orb / caught / hatching / fighter), wake/leash rules, hatch timeline, held fighter in front of the avatar, HUD feed.
- `lane/world.js` zones (`zoneBounds`, `zoneAt`), corridors, scenery, signs. `lane/house.js` a guardian base + its gameplay points (seat, door, slots). `lane/guardian.js` the rigged giant + its AI states; `lane/giants.js` the twelve looks (skins, costume, danglers, spinners, auras, step / roar effects); `lane/housedeco.js` the twelve base themes; `lane/desert.js` the desert extras + corridor ambient particles. `lane/orb.js` the winged orb. `lane/actor.js` an animated fighter.
- `base/mybase.js` your base's ground-floor slots: place / pick up / swap / upgrade prompts, income, pad labels, collecting (bundles, pops).
- `hud/hud.js` + `hud.css` counters, Shop/Base/Sell, menu grid (`onMenu`), zone bar, speedometer, Run banner, hatch message, hotbar (+ Backpack hooks), hold-E prompt. `hud/icon.js` renders hotbar portraits.
- `fx.js` one-shot CPU particles (puffs, dust, vortex, flashes, trails) and confetti.
- `state.js` money, speed, hotbar, slots (saved through the server, `net.js`).

Guardian and fighter names are original stand-ins (project rule in `SAFE_ZONE.md`).
