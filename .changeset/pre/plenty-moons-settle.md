---
"@tableverse-kit/engine": patch
---

`executor.isGameEnded(state)` reports whether a match has finished, so a host can retire it and tell its players. A game ends by transitioning into an automatic stage that defines no transition of its own: the stage machine settles on that stage and the match accepts no further commands. Games need no changes to describe their ending this way.
