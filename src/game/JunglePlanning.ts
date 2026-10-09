import { distance } from './config.ts';
import type { Point } from './config.ts';
import { BATTLEFIELD_NAVIGATION } from './navigation.ts';
import type { NavigationGraph, NavigationTeam } from './navigation.ts';
import type { JungleCamp } from './Jungle.ts';

export const JUNGLE_AI_RULES={
  attackInitiateRange:115,
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
