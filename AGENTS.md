# League development rules

- User directs game design and performs acceptance QA; do implementation autonomously within approved scope.
- Current scope is a four-champion training arena and compact one-lane siege prototype. Lane progression, shared gold, T1–T3 gear, one potion slot, fixed-order Q/W/E/R ranks, symmetric enemy AI, shared vision and bush concealment are implemented. Three-lane navigation is being introduced behind the proven one-lane match; the full playable map and jungle remain future work. Do not claim this is a complete MOBA.
- Canonical design is docs/DESIGN.md. New numeric values are provisional balance settings, not proven values.
- Keep simulation independent of Phaser rendering. Commands share one rules path; data belongs in config.
- Navigation is route/graph based. Do not encode lane behavior as raw x-axis progression or hard-code a champion to map coordinates. Preserve the prototype route until the full three-lane match is explicitly switched over.
- Explicit move overrides attack and cancels windup without resetting attack cooldown.
- Attack is move-and-fight: capture the ordered location as the new anchor, fight encountered enemies, prioritize the explicit target in range, then continue to the ordered location after target loss/death. Never return to the pre-attack position. Track target generation; hidden targets only reveal their last observed location.
- Dash cancels chase and establishes the destination as the new anchor.
- Pause freezes simulation clocks; background time must never advance the game.
- Use real regression tests for command precedence, damage, cooldown, targeting, buffs and later serialization.
- Verify production build and mobile input. Never label unexecuted tests as passed.
- Keep public repository free of credentials, personal information and proprietary source/art assets.
- Preserve user work. No force pushes. Minimize deployments; publish a reviewed batch.
- Use UTF-8, Korean player-facing text, and mobile landscape safe areas.
- Do not delegate to sub-agents unless the user requests it.
- User plans to replace all graphics with production art. Keep sprite/atlas/animation/effect/icon mappings in src/render; simulation must never depend on animation completion, texture size, render FPS or asset loading.
- Graphics use stable entity identity and shared data-driven visual keys. Preserve placeholder fallback, pause, despawn cleanup and mode-reset cleanup when adding assets.
- Award death rewards once through the shared damage path. XP splits among nearby living, non-capped allies; team gold is paid once. Pure move still suppresses offensive auto combat.
- Shop transactions share one simulation path and deduct team gold only after validation. Tier stats are totals, not stacked bonuses. Rank-zero skills cannot activate; training keeps rank-one kits. Never remove a newly upgraded amount when an older temporary HP buff expires.


- Champion target adapters are live views: never duplicate health, tick their statuses twice, or respawn them through dummy timers. Entity IDs must be team-unique; visual IDs remain champion-specific. AI issues normal commands and shares normal shops, resources and cooldowns.
