import { distance } from './config.ts';
import type { Point } from './config.ts';
import { towards } from './effects.ts';
import type { Target } from './targets.ts';
import type { Combat } from './combat.ts';

// Reused by ordinary jungle camps, Dragon, and Baron.
// Monster attack and leash properties belong to the per-monster config.
export type NeutralCombatRules={
  attack:number;
  interval:number;
  range:number;
  speed:number;
  leash:number;
  resetSpeed:number;
  homeRadius:number;
  // Epic raid bosses can re-target an active attacker if a tank dies/exits.
  // Ordinary jungle camps keep their original single-aggressor leash behavior.
  retargetOnDisengage?:boolean;
};

export type NeutralMonster=Target & {
  point:Point;
  clearAggro():void;
  restoreAtHome():void;
};

export function returnNeutralMonster(monster:NeutralMonster,dt:number,rules:NeutralCombatRules){
  monster.clearAggro();
  const remaining=distance(monster,monster.point);
  if(remaining<=rules.homeRadius){
    monster.restoreAtHome();
    return;
  }
  if(monster.rooted>0||monster.airborne>0)return;
  const speed=rules.resetSpeed*(1-monster.slow);
  Object.assign(monster,towards(monster,monster.point,Math.min(remaining,speed*dt)));
  if(distance(monster,monster.point)<=rules.homeRadius)monster.restoreAtHome();
}

export function stepNeutralMonster(
  monster:NeutralMonster,
  actors:readonly Combat[],
  dt:number,
  rules:NeutralCombatRules,
){
  if(!monster.alive)return;
  if(!monster.aggro){
    if(distance(monster,monster.point)>rules.homeRadius)returnNeutralMonster(monster,dt,rules);
    return;
  }

  let target=actors.find(actor=>actor.profile.id===monster.aggro);
  if((!target||!target.alive||distance(target.hero,monster.point)>rules.leash)&&
     rules.retargetOnDisengage){
    const next=actors.find(actor=>
      actor.alive&&actor.command.kind==='attack'&&
      actor.command.targetId===monster.id&&
      distance(actor.hero,monster.point)<=rules.leash
    );
    if(next){monster.aggro=next.profile.id;target=next;}
  }
  if(!target||!target.alive||
    distance(target.hero,monster.point)>rules.leash||
    distance(monster,monster.point)>rules.leash){
    returnNeutralMonster(monster,dt,rules);
    return;
  }

  if(monster.stunned>0||monster.airborne>0)return;
  const d=distance(monster,target.hero);
  if(d>rules.range){
    if(monster.rooted<=0){
      const speed=rules.speed*(1-monster.slow);
      Object.assign(monster,towards(monster,target.hero,Math.min(Math.max(0,d-rules.range),speed*dt)));
    }
    return;
  }

  if(monster.attackCooldown<=0){
    target.receiveDamage(rules.attack,'physical');
    monster.attackCooldown=rules.interval;
  }
}
