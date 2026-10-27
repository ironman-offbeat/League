import type { BattlefieldMatch, BattlefieldTeam } from './BattlefieldMatch.ts';
import { EPIC_OBJECTIVES } from './EpicObjectives.ts';
import type { EpicObjectiveKind } from './EpicObjectives.ts';

function clock(seconds:number){
  const s=Math.max(0,Math.ceil(seconds));
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}

// No hidden HP, death status or respawn timer is exposed to a team.
export function epicHudStatus(match:BattlefieldMatch,team:BattlefieldTeam,kind:EpicObjectiveKind){
  const first=EPIC_OBJECTIVES[kind].firstSpawn;
  if(match.elapsed<first)return `등장 ${clock(first-match.elapsed)}`;
  const boss=match.objectives.objective(kind);
  if(match.canSee(team,boss))return `체력 ${Math.ceil(100*boss.hp/boss.maxHp)}%`;
  if(match.pointVisible(team,boss.point)&&!boss.alive)return '둥지 비어 있음';
  return '상태 미확인 · 정찰 필요';
}
