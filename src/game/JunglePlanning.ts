import { distance } from './config.ts';
import type { Point } from './config.ts';
import { BATTLEFIELD_NAVIGATION } from './navigation.ts';
import type { NavigationGraph, NavigationTeam, LaneId } from './navigation.ts';
import type { JungleBuff, JungleCamp } from './Jungle.ts';

export const JUNGLE_AI_RULES={
  attackInitiateRange:115,
  buffRefreshWindow:12,
  assistEnemyRange:275,
  assistMaxTravel:750,
  assistFinalLeg:210,
  assistJoinRange:95,
  urgentAllyHP:.55,
} as const;

export type JungleCampPlan={
  camp:JungleCamp;
  pathIds:string[];
  pathDistance:number;
};

// A graph-based plan uses the existing camp navigation node, not duplicated
// world coordinates or hard-coded camp IDs.
export function jungleCampPath(
  position:Point,
  camp:JungleCamp,
  graph:NavigationGraph=BATTLEFIELD_NAVIGATION,
):JungleCampPlan|null{
  if(!camp.alive)return null;
  const start=graph.nearest(position);
  if(!start)return null;
  const ids=graph.shortestPathIds(start.id,camp.definition.nodeId);
  if(!ids.length)return null;
  let pathDistance=distance(position,start.point);
  for(let i=1;i<ids.length;i++){
    pathDistance+=distance(graph.node(ids[i-1]).point,graph.node(ids[i]).point);
  }
  return {camp,pathIds:ids,pathDistance};
}

// Keep pursuing the current live, reachable home-side camp. If it is cleared,
// select the closest reachable home-side camp by graph distance.
// Enemy-side invasion is deliberately left for a later stage.
export function chooseJungleCamp(
  position:Point,
  team:NavigationTeam,
  camps:readonly JungleCamp[],
  preferredId:string|null=null,
  graph:NavigationGraph=BATTLEFIELD_NAVIGATION,
):JungleCampPlan|null{
  const plans=camps.filter(camp=>camp.alive&&camp.side===team)
    .map(camp=>jungleCampPath(position,camp,graph))
    .filter((plan):plan is JungleCampPlan=>plan!==null);
  return plans.find(plan=>plan.camp.id===preferredId)??
    plans.sort((a,b)=>a.pathDistance-b.pathDistance||a.camp.id.localeCompare(b.camp.id))[0]??null;
}

export type JungleBuffTimers=Readonly<Record<JungleBuff,number>>;

export function chooseJungleCampForBuffs(
  position:Point,
  team:NavigationTeam,
  camps:readonly JungleCamp[],
  buffs:JungleBuffTimers,
  preferredId:string|null=null,
  graph:NavigationGraph=BATTLEFIELD_NAVIGATION,
):JungleCampPlan|null{
  const eligible=camps.filter(camp=>
    camp.side===team&&camp.alive&&buffs[camp.buff]<=JUNGLE_AI_RULES.buffRefreshWindow
  );
  // A missing buff takes precedence over refreshing a buff that is merely
  // approaching expiry. Within a priority class choose graph route distance.
  const plans=eligible.map(camp=>jungleCampPath(position,camp,graph))
    .filter((plan):plan is JungleCampPlan=>plan!==null)
    .sort((a,b)=>{
      const priority=(plan:JungleCampPlan)=>buffs[plan.camp.buff]<=0?0:1;
      return priority(a)-priority(b)||a.pathDistance-b.pathDistance||a.camp.id.localeCompare(b.camp.id);
    });
  if(!plans.length)return null;
  const bestPriority=buffs[plans[0].camp.buff]<=0?0:1;
  return plans.find(plan=>
    plan.camp.id===preferredId&&(buffs[plan.camp.buff]<=0?0:1)===bestPriority
  )??plans[0];
}

export type JungleLaneSignal={
  lane:LaneId;
  ally:Point;
  enemy:Point;
  allyHealth:number;
};

export type JungleAssistPlan={
  lane:LaneId;
  ally:Point;
  pathIds:string[];
  pathDistance:number;
  allyHealth:number;
};

// Callers supply only revealed enemies and a safe-point predicate. This planner
// never reads fogged actor positions or assumes an unguarded path through towers.
export function chooseJungleAssist(
  position:Point,
  signals:readonly JungleLaneSignal[],
  safe:(point:Point)=>boolean,
  graph:NavigationGraph=BATTLEFIELD_NAVIGATION,
):JungleAssistPlan|null{
  const allowed=(node:{point:Point})=>safe(node.point);
  const start=graph.nearest(position,allowed);
  if(!start)return null;
  const plans:JungleAssistPlan[]=[];
  for(const signal of signals){
    if(distance(signal.ally,signal.enemy)>JUNGLE_AI_RULES.assistEnemyRange||
       !safe(signal.ally)||!safe(signal.enemy))continue;
    const goal=graph.nearest(signal.ally,allowed);
    if(!goal||distance(goal.point,signal.ally)>JUNGLE_AI_RULES.assistFinalLeg)continue;
    const pathIds=graph.shortestPathIds(start.id,goal.id,allowed);
    if(!pathIds.length)continue;
    let length=distance(position,start.point)+distance(goal.point,signal.ally);
    let routeSafe=safe(position)&&safe({x:(goal.point.x+signal.ally.x)/2,y:(goal.point.y+signal.ally.y)/2});
    for(let i=1;i<pathIds.length;i++){
      const a=graph.node(pathIds[i-1]).point,b=graph.node(pathIds[i]).point;
      length+=distance(a,b);
      if(!safe({x:(a.x+b.x)/2,y:(a.y+b.y)/2}))routeSafe=false;
    }
    if(!routeSafe||length>JUNGLE_AI_RULES.assistMaxTravel)continue;
    plans.push({lane:signal.lane,ally:{...signal.ally},pathIds,pathDistance:length,allyHealth:signal.allyHealth});
  }
  return plans.sort((a,b)=>
    a.pathDistance-b.pathDistance||a.allyHealth-b.allyHealth||a.lane.localeCompare(b.lane)
  )[0]??null;
}
