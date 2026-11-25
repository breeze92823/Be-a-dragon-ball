# Boxity SDK metadata (read by the Boxity audit)

```yaml
canDie: false      # nothing kills the player: a fall below the map only resets them to spawn, and a
                   # guardian grab is the game's hatch mechanic. So there is no death screen.
hasScore: true     # leaderboards: cash, speed, rebirths, playtime (declared client + server)
notApplicable:
  gems: "Never sold for Gems / Robux (project rule): every price in the game is in-game cash."
  gameStore: "No Gems products, so there is no Game Store to declare."
  deathScreen: "The player cannot die (canDie: false)."
  partyPlay: "Hosted on Boxity with the matchmaker, which seats parties itself."
```
