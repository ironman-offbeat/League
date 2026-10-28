import { distance } from './config.ts';
import type { Point } from './config.ts';
import type { Combat } from './combat.ts';
import type { BattlefieldMatch, BattlefieldUnit, BattlefieldTeam } from './BattlefieldMatch.ts';
import type { LaneId } from './navigation.ts';

// A champion carrying Baron must escort real allied minions to empower them;
// an open nexus is also a permanent, public late-game reason to group for a push.
export const SIEGE_AI_RULES={
  minimumHealth:.4,
  escortHorizon:540,
  behindWave:75,
  escortReach:100,
  routeSnap:420,
  maximumTravel:1600,
  towerApproachMargin:15,
} as const;

const LANES:readonly LaneId[]=['top','mid','bottom'];
const OPPOSITE:Record<BattlefieldTeam,BattlefieldTeam>={blue:'red',red:'blue'};
const VALUE={outer:0,inner:1,inhibitor:2,nexus:3} as const;
export type SiegePlan={
  lane:LaneId;
  objective:BattlefieldUnit;
  escort:BattlefieldUnit;
  escortPoint:Point;
  score:number;
};

// Reads only public structure progression and friendly minion positions.
// Opponent champion location or unseen monster state never enters the plan.
export function chooseSiegePlan(match:BattlefieldMatch,actor:Combat):SiegePlan|null{
  if(!actor.alive||!actor.canAct||
    actor.hero.hp/actor.hero.maxHp<SIEGE_AI_RULES.minimumHealth)return null;
  const team=match.teamOf(actor),defender=OPPOSITE[team];
  const nexus=match.structure(defender,'nexus');
  if(!actor.baronActive&&nexus.protected)return null;
  const plans:SiegePlan[]=[];
  for(const lane of LANES){
    const objective=(['outer','inner','inhibitor'] as const)
      .map(role=>match.structure(defender,role,lane))
      .find(target=>target.alive&&!target.protected) ??
      (nexus.alive&&!nexus.protected?nexus:null);
    if(!objective)continue;
    const eligible=match.minions(team,lane).filter(unit=>
      unit.alive&&distance(unit,objective)<=SIEGE_AI_RULES.escortHorizon
    ).sort((a,b)=>distance(a,objective)-distance(b,objective)||a.id.localeCompare(b.id));
    if(!eligible.length)continue;
    const escort=eligible[0];
    const escortPoint=match.laneAdvance(team,lane,escort,-SIEGE_AI_RULES.behindWave,false);
    // The most breached lane wins, but a wave actually near its objective is
    // essential. Do not pick a distant lane solely from a global tower count.
    const score=VALUE[objective.role as keyof typeof VALUE]*250+
      Math.min(eligible.length,6)*20-
      .1*distance(escort,objective)-.06*distance(actor.hero,escortPoint);
    plans.push({lane,objective,escort,escortPoint,score});
  }
  return plans.sort((a,b)=>b.score-a.score||a.lane.localeCompare(b.lane))[0]??null;
}
