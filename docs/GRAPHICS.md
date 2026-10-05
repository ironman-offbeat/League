# 그래픽 리소스 연결 규격

게임 로직은 `src/game/`, 그래픽 등록과 수명 관리는 `src/render/`에 둡니다. 현재 화면의 도형은 임시 그래픽입니다. 실제 이미지가 준비되면 `public/assets/`에 파일을 넣고 `src/render/assets.ts`의 `ASSETS`를 등록합니다. 챔피언별 전투 코드를 다시 만들지 않습니다.

## 등록할 수 있는 형식

- 정적 이미지: PNG, WebP 등 Phaser가 지원하는 이미지.
- 스프라이트 시트: 동일한 프레임 크기와 숫자 프레임 번호.
- 아틀라스: 텍스처 이미지와 Phaser 호환 JSON, 문자열 프레임 이름.
- 아이콘: 브라우저 이미지 URL. 로딩 실패 시 글자 버튼을 유지합니다.

픽셀 크기·배율·기준점·이미지 오프셋은 외형에만 영향을 줍니다. 선택 반경·사거리·투사체 충돌 반경과 전투 좌표는 별도 게임 설정입니다. 캐릭터 이미지의 중심을 현재 게임 좌표에 맞추거나 `origin` / `offset`으로 발 위치를 맞추세요.

## 그래픽 키

| 분류 | 키 예시 | 용도 |
|---|---|---|
| 챔피언 | `champion.renekton`, `champion.annie`, `champion.ashe`, `champion.amumu` | 전장 캐릭터; 같은 키로 `icons`에 초상화 등록 |
| 미니언·건물 | `unit.blue.melee`, `unit.red.ranged`, `unit.blue.siege`, `unit.red.tower`, `unit.red.nexus` | blue/red 각각 등록 |
| 훈련 대상 | `unit.training` | 연습장 표적 |
| 기본 공격 발사체 | `projectile.annie.basic`, `projectile.ashe.basic` | 생성된 발사체를 추적 |
| 스킬 발사체 | `projectile.frost.arrow`, `projectile.curse.hook` | 화살·붕대의 실제 위치와 방향 |
| 소환수·영역 | `pet.flame`, `aura.curse`, `zone.scout` | 곰·눈물·정찰 영역 |
| 스킬 시전 | `skill.fury.manual`, `skill.flame.ultimate` 등 | kit(fury/flame/frost/curse) × manual/ultimate; `effects`와 `icons` 등록 |
| 피격 | `hit.physical`, `hit.magic` | 실제 피해 이벤트 위치의 일회성 효과 |
| 배경 | `map.training`, `map.lane` | 1600×1000 월드 중앙에 배치되는 배경 이미지 |

`sprites`는 살아 있는 게임 객체에 연결됩니다. `effects`는 이벤트 위치에 생성되는 일회성 효과입니다. 소환수·오라처럼 계속 붙어 있어야 하는 효과는 `sprites`를 사용합니다. 자동 스킬별 전용 연출, 화면 흔들림, 음향, 복합 이펙트 타임라인은 이후 추가 범위입니다.

## 등록 예시

아래 파일 이름은 예시입니다. 실제 파일을 넣기 전에는 등록하지 않습니다.

```ts
textures: {
  croc: {type:'atlas', url:'/assets/croc.webp', dataUrl:'/assets/croc.json'},
  arrow: {type:'image', url:'/assets/arrow.webp'},
  impact: {type:'sheet', url:'/assets/impact.png', frameWidth:64, frameHeight:64},
},
sprites: {
  'champion.renekton': {
    texture:'croc', frame:'idle_0', scale:.5, origin:[.5,.75],
    clips:{
      idle:{frames:['idle_0','idle_1'], fps:6, loop:true},
      'walk:e':{frames:['walk_e0','walk_e1'], fps:10, loop:true},
      'walk:w':{frames:['walk_w0','walk_w1'], fps:10, loop:true},
      attack:{frames:['attack_0','attack_1'], fps:10},
      death:{frames:['death_0','death_1'], fps:5},
    },
  },
  'projectile.ashe.basic':{texture:'arrow', scale:.4, rotate:true},
},
effects: {
  'hit.physical':{texture:'impact', frame:0, duration:.4, fade:true,
    clips:{cast:{frames:[0,1,2,3], fps:10}}},
},
icons:{'skill.fury.manual':'/assets/icons/dash.webp'},
```

동작 키는 `idle`, `walk`, `attack`, `cast`, `hurt`, `recall`, `death`입니다. 방향별 키는 `walk:e`처럼 `e/se/s/sw/w/nw/n/ne`를 붙입니다. 해당 방향이 없으면 공통 동작, 다음으로 idle을 사용합니다. 방향별 클립이 없는 이미지는 좌우 반전하며, `rotate:true` 발사체는 진행 방향으로 회전합니다.

## 구현 계약

- 피해·발사·이동·사망은 고정 시간 간격의 게임 판정이 먼저입니다. 애니메이션 완료 이벤트에서 공격을 발생시키지 않습니다.
- 공격의 준비 시간에 맞는 프레임 속도를 설정합니다. 이미지 프레임 수를 바꿔도 피해나 쿨타임은 변하지 않습니다.
- 캐릭터·발사체·소환물은 같은 sprite를 재사용합니다. 사라진 객체는 death가 있으면 재생 후 제거하고, 없으면 즉시 제거합니다.
- 일시정지 중에는 애니메이션과 이펙트 수명도 멈춥니다. 재경기·모드 변경 시 남은 sprite와 이펙트를 정리합니다.
- 텍스처 미등록·로딩 실패·잘못된 시작 프레임은 기존 도형으로 대체합니다. 잘못된 애니메이션 프레임은 재생하지 않고 정적 이미지를 유지합니다.
- 아트 작업 시 투명 배경, 기준점, 프레임 이름, 방향, FPS, 반복 여부, 사용 권한을 함께 정합니다. 실제 리소스를 연결한 뒤 저사양 실기기에서 텍스처 용량과 렌더링 부하를 검증합니다.

## Item UI keys

Shop icons optionally use `ASSETS.icons` keys `item.weapon`, `item.armor`, `item.health`, `item.mana`, `item.mixed`. Missing images retain text labels. Item icons are presentation-only; tiers, price and effects live in `src/game/equipment.ts` and skill rank values in `src/game/skillRanks.ts`.
