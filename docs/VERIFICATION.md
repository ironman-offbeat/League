# 검증 기록

## 0.1 초기 구현

- 로컬: Node.js 24의 TypeScript 타입 제거 기능으로 전투 회귀 테스트 13/13 통과.
- CI: TypeScript 검사, Vite production build, Chromium 데스크톱·모바일 및 WebKit 모바일 검사.
- GitHub Actions의 Verify game 실행 결과를 현재 커밋 기준으로 확인할 것.
- CI가 종료되기 전에는 빌드·브라우저 검증 완료로 표시하지 않음.
- 실제 iPhone Safari 터치 감각과 PWA 동작은 별도 사용자 QA가 필요.
- 이 버전은 경기 저장·오프라인 설치 지원을 제공하지 않음.

로컬 실행 환경에서 npm 네트워크 접근이 제한되어 전체 빌드는 CI에서 검증합니다.

## 2026-10-02 돌진 입력 수정

초기 b60f923은 사용자가 main에 업로드했고 Vercel 배포가 완료되었습니다.
초기 CI에서 빌드와 전투 테스트는 통과했지만 세 브라우저의 돌진 조작 검사가 실패했습니다.

원인: HUD의 E 버튼에서 놓은 입력도 Phaser의 pointerupoutside 이벤트로 전달되어 조준 상태를 취소했습니다.
수정: 전장에서 시작한 동일 포인터의 드래그에만 바깥 놓기 취소를 적용합니다.
기존의 ESC·일시정지·명시적 취소 동작은 유지합니다.

- 수정 후 로컬 전투 테스트 13/13 통과, 타입 검사 및 production build 통과.
- Chromium 데스크톱·모바일 검사 7개 통과, 데스크톱 터치 전용 검사 1개 의도적 제외.
- E 선택 후 지점 지정, 버튼 드래그, 재선택 취소, 일시정지 재개, 모바일 터치 탭 포함.
- WebKit 및 원격 CI 최종 결과는 해당 커밋의 Verify game 실행에서 확인합니다.
- package-lock.json 추가, CI는 npm ci로 의존성 버전을 고정합니다.

현재 접속 주소: https://league.2hayoung.com

## Four-champion command prototype — 2026-10-02

- Local Node 24: 13 existing combat cases and 5 squad cases passed.
- Local TypeScript check and Vite production build passed.
- Local Chromium desktop/mobile landscape: 9 browser cases passed, 1 desktop touch-only case skipped.
- New coverage: simultaneous independent orders, shared damage, ranged attack distance, once-per-frame shared timers, projectile persistence after movement/selection, stale projectile rejection after respawn, personal recall and unselected cooldowns.
- Browser coverage now switches among all four champions, checks independent HUD and unavailable skills, confirms two unselected attackers keep dealing damage, and freezes every actor when paused.
- WebKit verification runs in the PR's GitHub Actions workflow; consult the run result for the exact tested commit.
- This is still a training arena. Other three full skill kits, enemy retaliation, champion death, lanes and match objectives remain unimplemented.

## Level-one skills and retaliation — 2026-10-02

- 37 local simulation cases passed: existing combat/squad coverage plus 19 skill/effect cases.
- TypeScript checking and production build passed.
- New checks cover separate defenses, magic vulnerability, max-duration CC, resource reservation, shield triggering/expiry, passives, pet lifetime/death, scouting expiry, first-target skillshots, hook pull, aura interruption, retaliation windup/cancellation, recall interruption, hero death/respawn, and persistent timers while stunned.
- Local Chromium desktop/mobile: 11 passed, 1 desktop touch-only case skipped.
- Browser suite includes touch aiming for all new manual/ultimate abilities, retaliation toggle, and switching away from an armed skill. Exact browser results are recorded by Verify game for the deployed commit.
- All training targets are stationary champion-type targets. Minion/building-specific triggers and collision walls are verified when those entity types enter the game.
- Retaliation balance (65 physical damage, 325 range, 1.5s interval, 0.45s windup) is provisional and configurable in skillConfig.ts.

## One-lane siege prototype — 2026-10-04

- Local Node 24: 48 simulation cases passed; TypeScript checking and production build passed.
- New coverage: wave timing, siege cadence, shared array lifetime, protected nexus, building skill immunity, reduced unescorted siege damage, minion-priority tower targeting, escape during windup, automatic retreat, arrow/hook target differences, all match outcomes and frozen clocks, lane recall/respawn, long-run wave cleanup.
- Scripted ordinary attack commands reached victory through tower and nexus destruction (about 74 simulated seconds); this compact prototype is not the final 10–15 minute balance.
- Browser suite adds mode switching, cancelling armed input, four-hero rally, pause/resume, first wave, camera navigation, reset and returning to training on desktop and mobile. Consult this commit's Verify game result for executed browser coverage.
- No enemy champion AI, economy, progression, equipment, inhibitors or saved matches in this increment.

## Graphics integration foundation — 2026-10-04

- Added four rendering-contract tests (52 local tests total): directional clip lookup/state priority, missing resource fallback, immutable world points, sprite reuse, pause, death-clip cleanup, effect expiration and mode-reset cleanup.
- These lifecycle tests use a rendering backend double. Production art and its specific atlas/frame layout have not yet been supplied or visually accepted.
- Local Chromium desktop/mobile before the rendering refactor: 13 passed, 1 desktop touch-only case skipped. The final combined commit is rechecked in GitHub Actions across desktop Chromium, mobile Chromium and mobile WebKit.
- Graphics may react to combat events but cannot create gameplay damage or control attack/CC/respawn timing.

### WebKit first-wave timing

The initial PR run passed 19 browser cases but the new WebKit wave check exceeded its 15-second wall-time budget. Its captured DOM showed the match running at 00:08 with two simulation seconds until the first wave; resume was working. The check now separately verifies unpaused state and clock advancement, then allows 35 wall seconds to reach the unchanged 10-second simulation threshold. No game timing or frame cap was relaxed. Final status is recorded by Verify game for the amended commit.

## Attack-move and lane progression — 2026-10-05

- The former return-to-old-anchor rule is superseded by the user's attack-move requirement. Orders snapshot destination and target generation; route combat and post-kill continuation share ordinary attack logic.
- Updated former return behavior cases and added moving-target destination, en-route fighting, explicit-target priority, replacement commands, target respawn and ranged killing-projectile cases.
- Added progression checks for XP thresholds/cap/fractions, once-only rewards, eligibility, team income, real stat growth, ultimate unlock and mana reservation, death/respawn, temporary HP buffs and reset/end-state isolation.
- Browser regression uses real drag orders and combat deaths, without state mutation shortcuts, to check that the hero reaches the attacked location. Lane HUD tests also cover gold, XP, ultimate gating, pause and reset.
- Final results are attached to this commit's Verify game run. Equipment and higher skill ranks are not included.

## Equipment and ranked skills — 2026-10-05

- Regression coverage includes shared atomic gold spending, fountain/death purchase eligibility, tier totals, missing-HP preservation, death/ultimate interactions, potion slot/resource restrictions and timed recovery.
- Skill coverage checks every level's fixed learning order, R at 4/8/12, training isolation, AD/AP rank tables and actual cast/projectile/pet damage.
- Browser coverage adds a real passive-income-funded armor purchase, individual inventory/shared wealth, out-of-fountain rejection, mode/reset cleanup and mobile shop screenshots. No browser state mutation is used to grant money or ranks.
- Exact executed test and build results are recorded in the commit's Verify game workflow. Physical iPhone Safari testing remains user QA.


## Opposing champion AI — 2026-10-06

- Added regression tests for live target health/shields/CC, single owner status/respawn clocks, generation-safe missiles, once-only rewards, both team budgets and tower defense through shields.
- AI tests cover first-wave timing, ordinary commands/windup, visibility, resource/rank gating, potions, latched retreat, safe recall (including tower danger), recovery and long-match bounded entities.
- Browser scenario uses real mode/rally buttons and combat to observe enemy advance/damage, then pause and reset; no state mutation is used. PC/mobile screenshots distinguish enemy rings and health/name labels. Existing shop/attack-move/touch regressions remain enabled.
- The old undefended siege victory test explicitly disables enemy champions to isolate building rules. Default-mode AI matches have their own combat/growth/end-freeze checks.
- Exact executed final results are in this commit's Verify game workflow. Physical-device Korean font/rendering and difficulty remain user QA.
- The first AI CI run passed 28 browser cases but WebKit's live-shop clock advanced only 1.5 simulation seconds in 15 wall seconds. Phaser's startup smoothing replaces slow frames with historical 16ms deltas before our own fixed-step accumulator. Disabled that duplicate smoothing; the existing 100ms foreground cap, pause/visibility guards and unchanged shop-progress assertion remain in place. Final CI must verify this correction.


## Three-lane champion runtime and playable mode — 2026-10-07

- 09c-1 PR #14 reuses the production Combat/Squad path inside BattlefieldMatch instead of creating a second champion combat implementation.
- Role starts are separate from fountain spawn: Renekton Top, Annie Mid, Ashe Bottom and Amumu Jungle begin at role positions while recall/respawn return to the correct team base.
- Shared target arrays are retained when three lane waves spawn, and regression coverage verifies ordinary champion attacks can damage newly spawned battlefield minions.
- Team economy, purchases, champion/minion/building rewards and minion/tower attacks against champions are connected without changing LaneMatch.
- PR #14 final Verify game run 37571848755 passed 126 simulation cases, TypeScript/production build, desktop Chromium, mobile Chromium and mobile WebKit before squash merge.
- 09c-2 adds a separate browser-accessible three-lane session while preserving the existing training and one-lane buttons. Browser coverage checks mode entry, 20 initial buildings, four opposing champions, distinct role starts, real drag movement, full-map camera control and clean return to training.
- Full-map fog/bush rules, strategic enemy AI, jungle camps and champion obstacle/path commands are deliberately not claimed by this increment. Exact 09c-2 execution results are recorded by its final Verify game workflow.
