# Economy balance

How long the game takes and why. All numbers live in `src/config.js`; check any change with the
progression simulator:

```
node tools/balance-sim.mjs
```

It plays a fresh account through the real rules many times (lane distances and orb speed curve,
the zone whose guardian catches you, hatch luck and mutations, treadmill ticks / crits / TAP!!
bubbles, base slots and upgrades, rebirths, x2 Speed, playtime rewards) and prints when each zone
is first reached, when the last zone is reached and the longest stretch with nothing new.

## The curve (median of the sim)

| Player | Last zone (Primal) | Outrun its guardian | Longest wait before the last zone |
|---|---|---|---|
| Normal: TAP!! ~2/s, 3 runs per new zone, rebirths + upgrades | ~3 h | ~5 h | ~30 min |
| Grinder: TAP!! ~5/s | ~2 h | ~3.5 h | ~15 min |
| Idle: never taps, no upgrades | ~15 h | ~24 h | ~3.5 h |
| Never rebirths | ~5 h | ~8 h | ~1.4 h |

First time in each zone (normal player): Uncommon 2.5 min, Rare 4.5 min, Epic 8 min, Legendary
13 min, Mythical 19 min, Secret 25 min, Eternal 36 min, Divine 50 min, Heavenly 1.2 h, Celestial
2.1 h, Primal 2.9 h.

**Easy start:** a new zone every 2-6 min and something to buy every 1-2 min for the first 15
minutes. **Hard later:** zones 7-11 take 15 min to 50 min each. **Motivation:** something new
lands at least every ~30 min (treadmill, Dragon Ball, base upgrade, rebirth, new zone), and the
playtime rewards (10, 20, 40, 50 min) arrive while their fighter is still an upgrade.

## The rules behind it

- **Fighter income** (`RARITIES`): each zone's fighters earn ~5x the zone before, in the lane's
  zone order (`RARITY_ORDER`: ... Secret, Eternal, Divine, Heavenly, Celestial, Primal). The
  `RARITIES` array keeps its old order because roster.js seeds the fighter names by it.
- **Treadmills** (`TREADMILLS`): gain x1.3-2.2 per tier (100 -> 28,000), price x5-40 per tier
  ($5K -> $420 quadrillion). The Speed a zone needs grows x3.2 per zone, so later zones need
  several treadmills, rebirths and TAP!! play.
- **Rebirth** (`REBIRTH`): resets cash and Speed, gives +0.5 Money and **+0.25 Training**
  (`speedStep`, `state.trainMulti()`: x treadmill gain), so the reset is won back faster each time.
  First one around minute 12, then every 5-30 min. Requirements: $5M x7 and 25K Speed x2.2 per
  rebirth.
- **Dragon Balls** (`BALLS`, luck -> mutation odds): one every ~10-60 min, $4M -> $27 quadrillion.
- **Base Upgrade** (`BASE_BOARD.upgrade`): 5 steps at ~9 min, 25 min, 45 min, 1.3 h, 2.3 h.
  Auto Collect $20M, Upgrade Max All $1B.
- **Fuse Machine**: tiers in `RARITY_ORDER` (backend `FUSE_RARITIES` matches), so a fuse step up
  is always worth more.
- **Old saves**: `state.js hydrate` caps every fighter's income at the most its rarity can roll
  now (top income x best mutation x deepest luck x top spread), so fighters hatched before the
  rebalance don't break the curve. Money, Speed and owned items are kept.

## Retuning

Move the curve with the treadmill prices first (they gate Speed, which gates zones), then the
Dragon Ball / Base Upgrade prices so they keep landing between treadmills. After any change run the
sim and check the normal player's longest wait stays under ~30-40 min.
