import { Combat } from './combat.ts';
import type { Dummy } from './combat.ts';
import type { Pet } from './Abilities.ts';
import { CHAMPIONS } from './champions.ts';
import { distance } from './config.ts';
import { SKILLS } from './skillConfig.ts';
type Counterattack={enemy:Dummy;generation:number;actor:Combat;life:number;pet:Pet|null;remaining:number};
export class Squad {
  members: Combat[];
  selectedIndex = 0;
  retaliation:boolean;
  counterattacks=new Map<string,Counterattack>();
  constructor(retaliation=false) {
    const first = new Combat(CHAMPIONS[0]);
    this.members = [first, ...CHAMPIONS.slice(1).map(p => new Combat(p, first.enemies))];
    this.retaliation=retaliation;
  }
  get selected() { return this.members[this.selectedIndex]; }
  select(index: number) {
    if (!Number.isInteger(index) || !this.members[index]) return false;
    this.selectedIndex = index; return true;
  }
  setRetaliation(value:boolean){this.retaliation=value;this.counterattacks.clear();}
  step(dt: number) {
    Combat.stepEnemies(this.selected.enemies, dt);
    for (const member of this.members) member.step(dt, false);
    if(this.retaliation)this.stepRetaliation(dt);
  }
  private stepRetaliation(dt:number){
    const rules=SKILLS.retaliation;
    for(const enemy of this.selected.enemies){
      if(!enemy.alive||enemy.stunned>0||enemy.airborne>0){this.counterattacks.delete(enemy.id);continue;}
      const pending=this.counterattacks.get(enemy.id);
      if(pending){
        const p=pending,point=p.pet??p.actor.hero;
        const valid=p.generation===enemy.generation&&p.life===p.actor.life&&p.actor.alive&&(!p.pet||(p.actor.abilities.pet===p.pet&&p.pet.hp>0))&&distance(enemy,point)<=rules.range;
        if(!valid){this.counterattacks.delete(enemy.id);continue;}
        p.remaining-=dt;
        if(p.remaining<=0){if(p.pet)p.pet.hp=Math.max(0,p.pet.hp-rules.damage);else p.actor.receiveDamage(rules.damage);this.counterattacks.delete(enemy.id);}
        continue;
      }
      if(enemy.alert<=0||enemy.attackCooldown>0)continue;
      const candidates=this.members.filter(c=>c.alive).flatMap(actor=>[
        {actor,pet:null as Pet|null,point:actor.hero},
        ...(actor.abilities.pet&&actor.abilities.pet.hp>0?[{actor,pet:actor.abilities.pet,point:actor.abilities.pet}]:[]),
      ]).filter(c=>distance(enemy,c.point)<=rules.range).sort((a,b)=>distance(enemy,a.point)-distance(enemy,b.point));
      const target=candidates[0];if(!target)continue;
      enemy.attackCooldown=rules.interval;
      this.counterattacks.set(enemy.id,{enemy,generation:enemy.generation,actor:target.actor,life:target.actor.life,pet:target.pet,remaining:rules.windup});
    }
  }
}
