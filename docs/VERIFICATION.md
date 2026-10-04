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
