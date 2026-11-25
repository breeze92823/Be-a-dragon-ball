# Safe Zone: reference map

How the 19 reference screenshots fit together, and where each piece sits in the
build (`src/safezone/`, numbers in `SAFE_ZONE` in `src/config.js`). Metres,
+X east, +Z south, the lane (desert) is north (-Z).

## Screenshot -> what it shows

| # | Camera | What it pins down |
|---|--------|-------------------|
| 1 | Hub centre, looking at the base row | Base row along one side, two **empty plots** (light-blue checker squares) in front of it |
| 2 | Hub, looking north-east | **SAFE ZONE** text on the green with a shield at each end; Orb (pod) Shop + Dragon Spin on the left, bases on the right |
| 3 | Hub, looking north | Shop row on the green/sand edge: Treadmill Shop, Cash ("Robux") Shop, Base Skins; far left Dragon Spin + Orb Shop + Top Rebirth |
| 4 | Further east, looking north | Cash Shop, Base Skins tower, **Fuse Machine** next to the Most Money board |
| 5, 6 | Facing the east wall | **Top Money** + **Top Speed** boards on the tan wall, the **Next Update** screen (purple planet) between them, Fuse Machine on the left |
| 7, 8 | East corner, facing south-east | Boards on the left, first **player base** on the right; **Suggestions** booth and **Orb Pack** display beside the base |
| 9, 10 | At a base entrance | **Base Upgrade** sign ($500K 0/5) left, control board (Auto Collect / Upgrade All / Place Best / Upgrade Max All) right, owner head-shot + "Cash Multi: x1", floating blue **house** icon |
| 11, 12 | Inside a base | Red carpet down the middle, 5 slot pedestals per side with cyan rims, an orange **upgrade sign** and a green **collect pad** per slot, fighters with name / rarity / income labels |
| 13, 14 | Looking up at a max base | Up to 4 stacked floors on pink pillars with white caps, pink-white striped stairs at the back |
| 15 | Hub, looking north | Treadmill Shop, Cash Shop, Base Skins on their coloured ring pads, SAFE ZONE text |
| 16 | Hub centre, looking east | Whole east side in one shot: Base Skins, Fuse Machine, boards, base row |
| 17 | North-west, looking north | Bases on the left, SAFE ZONE strip, Orb Shop + Dragon Spin across the sand edge, Treadmill Shop right, red carpet lane in the desert |
| 18, 19 | Facing the west wall | **Top Playtime**, **Free Reward** statue, **Top Rebirth**, the **Sell** stall, Dragon Spin, Orb Shop; orange event building behind in the desert |

## Top-down layout

Hub 120 x 90 m (x -60..60, z -40..50), packed like the screenshots: bases
side by side, shops on the sand edge, boards on the side walls.

```
                         DESERT (lane, built later)  z -40 .. -118
        event bldg        pyramids, cacti, rocks, logs     pyramids
                              ||  red carpet lane  ||
 z=-40 ======================[  lane exit x=0   ]========================== sand edge
 W  Sell   Dragon   Orb                                   Tread-  Cash  Base   Fuse    E
 A  x-50   Spin     Shop                                  mill    Shop  Skins  Mach.   A
 L         x-37     x-23    (shields) SAFE ZONE (z-23)    x17     x29   x40.5  x50     S
 L  Top Rebirth  z-24                                            Top Money   z-20    T
    Free Reward  z-13                                            Next Update z-11    W
    Top Playtime z-2           SPAWN (0,2) faces north           Top Speed   z-2     A
                                                                 Orb Pack    z 5     L
                                                                 Suggestions z 11.5  L
 z=16 ---- base fronts (entrances face north) -------------------------------------------
     [ L4 ] [ L2 ] [empty] [YOU L1] [ L3 ] [empty]        18 x 26 plots, 1 m apart
     x-47.5 x-28.5 x-9.5   x9.5     x28.5  x47.5
 z=42 ---- base backs, stair landings to z 48 ----------------------------------------------
 z=50 ===================== south wall ======================================================
```

## Naming / rules applied

- Everything that was a Robux price in the screenshots is a money ($) price here
  (project rule: nothing is bought with premium currency). "Robux Shop" is the
  **Cash Shop**; the Orb Pack shows a $ price.
- Models, characters, names and leaderboard entries are original stand-ins built
  to match the layout and the look (blocky, bright, studded plastic), not copies
  of the reference game's characters or players.
