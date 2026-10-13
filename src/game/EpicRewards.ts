import type { EpicObjectiveKind } from './EpicObjectives.ts';

// Prototype rewards. Team-level effects are represented here and applied to
// gameplay in the follow-up combat/economy phase.
export const EPIC_REWARDS={
  dragon:{gold:150,xp:300},
  baron:{gold:350,xp:600,duration:180},
} as const;

// Instances belong to one BattlefieldMatch. No global mutable buff state.
// Dragon stacks never expire during a match; Baron timer can be renewed.
export class EpicTeamRewards{
  dragonStacks=0;
  baronExpiresAt=0;

  grant(kind:EpicObjectiveKind,now:number){
    if(!Number.isFinite(now)||now<0)throw new Error('epic reward time must be nonnegative and finite');
    if(kind==='dragon')this.dragonStacks++;
    else this.baronExpiresAt=now+EPIC_REWARDS.baron.duration;
  }

  baronRemaining(now:number){
    if(!Number.isFinite(now)||now<0)throw new Error('epic reward time must be nonnegative and finite');
    return Math.max(0,this.baronExpiresAt-now);
  }

  hasBaron(now:number){return this.baronRemaining(now)>0;}
}
