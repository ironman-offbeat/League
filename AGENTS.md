# League development rules

- User directs game design and performs acceptance QA; do implementation autonomously within approved scope.
- Current scope is the four-champion command prototype: shared targets, independent orders and basic attacks; only the fury fighter has a complete training kit. Do not claim this is a complete MOBA.
- Canonical design is docs/DESIGN.md. New numeric values are provisional balance settings, not proven values.
- Keep simulation independent of Phaser rendering. Commands share one rules path; data belongs in config.
- Explicit move overrides attack and cancels windup without resetting attack cooldown.
- Forced targeting ignores anchor limit; loss of vision does not reveal a hidden target's current location.
- Dash cancels chase and establishes the destination as the new anchor.
- Pause freezes simulation clocks; background time must never advance the game.
- Use real regression tests for command precedence, damage, cooldown, targeting, buffs and later serialization.
- Verify production build and mobile input. Never label unexecuted tests as passed.
- Keep public repository free of credentials, personal information and proprietary source/art assets.
- Preserve user work. No force pushes. Minimize deployments; publish a reviewed batch.
- Use UTF-8, Korean player-facing text, and mobile landscape safe areas.
- Do not delegate to sub-agents unless the user requests it.
