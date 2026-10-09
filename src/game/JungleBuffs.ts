import { applySlow } from './effects.ts';
import type { Target } from './targets.ts';
import type { JungleBuff } from './Jungle.ts';

export const JUNGLE_BUFF_RULES={
  duration:60,
  red:{slow:0.2,slowDuration:1.25,burnDuration:2,burnDamagePerSecond:14},
  blue:{bonusManaRegenPerSecond:0.012,skillCooldownSpeed:0.2},
} as const;

type Burn={target:Target;generation:number;remaining:number};

// A champion owns its temporary buffs and its outgoing on-hit burns.
// Burns are keyed by target generation: a respawn or camp reset cancels stale hits.
export class JungleBuffs{
  red=0;
  blue=0;
  private burns=new Map<string,Burn>();

  grant(kind:JungleBuff){this[kind]=JUNGLE_BUFF_RULES.duration;}
  clear(){this.red=0;this.blue=0;this.burns.clear();}
  get skillCooldownSpeed(){return this.blue>0?1+JUNGLE_BUFF_RULES.blue.skillCooldownSpeed:1;}
  get extraManaRegen(){return this.blue>0?JUNGLE_BUFF_RULES.blue.bonusManaRegenPerSecond:0;}

  onBasicHit(target:Target){
    if(this.red<=0||!target.alive||target.protected||target.kind==='building')return;
    applySlow(target,JUNGLE_BUFF_RULES.red.slow,JUNGLE_BUFF_RULES.red.slowDuration);
    this.burns.set(target.id,{
      target,generation:target.generation,remaining:JUNGLE_BUFF_RULES.red.burnDuration,
    });
  }

  step(dt:number,dealDamage:(target:Target,amount:number)=>void){
    this.red=Math.max(0,this.red-dt);
    this.blue=Math.max(0,this.blue-dt);
    for(const [id,burn] of this.burns){
      if(!burn.target.alive||burn.target.generation!==burn.generation||burn.target.protected){
        this.burns.delete(id);continue;
      }
      const tick=Math.min(dt,burn.remaining);
      burn.remaining-=tick;
      if(tick>0)dealDamage(burn.target,JUNGLE_BUFF_RULES.red.burnDamagePerSecond*tick);
      if(burn.remaining<=1e-8||!burn.target.alive)this.burns.delete(id);
    }
  }
}
