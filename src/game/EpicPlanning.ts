import { distance } from './config.ts';
import type { Point } from './config.ts';
import type { Combat } from './combat.ts';
import type { EpicObjective, EpicObjectiveKind } from './EpicObjectives.ts';
import { BATTLEFIELD_NAVIGATION } from './navigation.ts';
import type { NavigationTeam } from './navigation.ts';
import { jungleSafeRoute } from './JunglePlanning.ts';

export const EPIC_AI_RULES={
  interval: .3,
  healthEnter:.62,
  healthContinue:.30,
  manaEnter:.22,
  manaContinue:.08,
  stealThreshold:.25,
  finishingThreshold:.12,
  stealHealth:.68,
  minimum:{dragon:3,baron:3},
  maximum:{dragon:3,baron:4},
  huntTravel:{dragon:1150,baron:1400},
  stealTravel:650,
  rallyRadius:250,
  attackRange:120,
  enemyAvoidRadius:270,
  contestRadius:350,
  scoutHealth:.72,
  scoutMana:.35,
  scoutCooldown:50,
  retryDelay:18,
} as const;

export type EpicPlanMode='hunt'|'steal';
export type EpicPlan={
  objective:EpicObjective;
  mode:EpicPlanMode;
  pathIds:string[];
  pathDistance:number;
  participants:readonly Combat[];
  minimum:number;
  ready:number;
  visibleOpponents:number;
};

export type EpicPlanningContext={
  team:NavigationTeam;
  actor:Combat;
  allies:readonly Combat[];
  objectives:readonly EpicObjective[];
  // Only LIVE team-visible champion positions may be supplied. Never pass
  // raw hidden enemy coordinates, enemy commands, or last-seen coordinates.
  visibleEnemies:readonly Point[];
  canSeeObjective:(objective:EpicObjective)=>boolean;
  safeFromTowers:(point:Point)=>boolean;
};

type Candidate={actor:Combat;pathIds:string[];pathDistance:number};

// Pure selection: public objective identity and live team vision are inputs.
// The objective's HP/aggro and even its live state cannot influence decisions
// until the caller certifies that its location is currently visible.
export function chooseEpicPlan(ctx:EpicPlanningContext):EpicPlan|null{
  for(const objective of [...ctx.objectives].sort((a,b)=>
    Number(b.objectiveKind==='baron')-Number(a.objectiveKind==='baron')
  )){
    if(!ctx.canSeeObjective(objective))continue;
    if(!objective.alive)continue;
    const ratio=objective.hp/objective.maxHp;
    const mode:EpicPlanMode=ratio<=EPIC_AI_RULES.stealThreshold?'steal':'hunt';
    const minimum=mode==='steal'
      ?(ratio<=EPIC_AI_RULES.finishingThreshold?1:2)
      :EPIC_AI_RULES.minimum[objective.objectiveKind];
    const maxTravel=mode==='steal'
      ?EPIC_AI_RULES.stealTravel:EPIC_AI_RULES.huntTravel[objective.objectiveKind];
    const pitEnemies=ctx.visibleEnemies.filter(point=>
      distance(point,objective)<=EPIC_AI_RULES.contestRadius
    );
    // A normal objective hunt never starts with enemy champions in the pit.
    // A low-HP steal may challenge visible opponents, but not an outnumbering.
    if(mode==='hunt'&&pitEnemies.length)continue;
    const safe=(point:Point)=>ctx.safeFromTowers(point)&&
      !ctx.visibleEnemies.some(enemy=>
        distance(enemy,point)<=EPIC_AI_RULES.enemyAvoidRadius&&
        !(mode==='steal'&&distance(enemy,objective)<=EPIC_AI_RULES.contestRadius)
      );
    const options:Candidate[]=[];
    for(const actor of ctx.allies){
      if(!actor.alive||!actor.canAct)continue;
      const committed=actor.command.kind==='attack'&&actor.command.targetId===objective.id;
      const minHealth=committed?EPIC_AI_RULES.healthContinue:
        mode==='steal'?EPIC_AI_RULES.stealHealth:EPIC_AI_RULES.healthEnter;
      const minMana=committed?EPIC_AI_RULES.manaContinue:EPIC_AI_RULES.manaEnter;
      if(actor.hero.hp/actor.hero.maxHp<minHealth||
        (actor.maxMana>0&&actor.hero.mana/actor.maxMana<minMana))continue;
      const route=jungleSafeRoute(actor.hero,objective.definition.nodeId,safe);
      if(!route||route.pathDistance>maxTravel)continue;
      options.push({actor,pathIds:route.pathIds,pathDistance:route.pathDistance});
    }
    const maxMembers=mode==='steal'?3:EPIC_AI_RULES.maximum[objective.objectiveKind];
    options.sort((a,b)=>a.pathDistance-b.pathDistance||
      a.actor.profile.id.localeCompare(b.actor.profile.id));
    const chosen=options.slice(0,maxMembers);
    if(chosen.length<minimum||pitEnemies.length>chosen.length)continue;
    const mine=chosen.find(candidate=>candidate.actor===ctx.actor);
    if(!mine)continue;
    const participants=chosen.map(candidate=>candidate.actor);
    const ready=participants.filter(actor=>
      distance(actor.hero,objective)<=EPIC_AI_RULES.rallyRadius
    ).length;
    return {objective,mode,pathIds:mine.pathIds,pathDistance:mine.pathDistance,
      participants,minimum,ready,visibleOpponents:pitEnemies.length};
  }
  return null;
}

// Scouting is based on publicly configured first-spawn timing and a team-safe
// route, not on a hidden monster's alive flag, current HP or next respawn.
export function epicScoutRoute(
  from:Point,kind:EpicObjectiveKind,safe:(point:Point)=>boolean,
){
  const toId=kind==='dragon'?'river-south':'river-north';
  return jungleSafeRoute(from,toId,safe,BATTLEFIELD_NAVIGATION);
}
