import { rankedSkills } from './skillRanks.ts';
import type { SkillKey } from './skillRanks.ts';
import { skillTarget } from './targets.ts';
import type { Combat, Dummy } from './combat.ts';
import { RULES, distance } from './config.ts';
import type { Point } from './config.ts';
import { applyCC, applySlow, inCone, alongSegment, towards } from './effects.ts';
import { SKILLS } from './skillConfig.ts';
import type { SkillSlot, SkillPresentation } from './skillConfig.ts';
export type Pet=Point & {hp:number;remaining:number;cooldown:number;damage:number};
export class Abilities {
  owner:Combat;
  stacks=0;
  haste=0;
  hasteBonus=0;
  private configKey='';
  private configValue?:ReturnType<typeof rankedSkills>;
  get config(){const c=this.owner,key=`${c.progression.enabled}:${c.progression.level}:${c.abilityPower}`;if(key!==this.configKey||!this.configValue){this.configKey=key;this.configValue=rankedSkills(c.ranks,c.abilityPower);}return this.configValue;}
  aura=false;
  auraLock=0;
  pet:Pet|null=null;
  scout:(Point & {remaining:number})|null=null;
  missiles:{point:Point;direction:Point;remaining:number;kind:'hook'|'arrow';damage:number;stun:number}[]=[];
  pull:Point|null=null;
  constructor(owner:Combat){this.owner=owner;}
  get reserve(){return this.owner.progression.ultimateUnlocked?this.presentation('ultimate').cost:0;}
  presentation(slot:SkillSlot):SkillPresentation {
    const kit=this.owner.profile.kit;
    const {flame,frost,curse}=this.config;
    if(slot==='ultimate') {
      if(kit==='fury')return{key:'R',name:'거대화',aim:'self',cost:0,cooldown:this.owner.furySkills.ultimate.cooldown,range:RULES.ultimate.range,hint:'10초 체력 증가'};
      if(kit==='flame')return{key:'R',name:'곰 소환',aim:'point',cost:flame.ultimate.cost,cooldown:flame.ultimate.cooldown,range:flame.ultimate.range,hint:'지점 지정 · 12초 소환'};
      if(kit==='frost')return{key:'R',name:'얼음 화살',aim:'direction',cost:frost.ultimate.cost,cooldown:frost.ultimate.cooldown,range:frost.ultimate.range,hint:'첫 챔피언 기절'};
      return{key:'R',name:'슬픈 미라',aim:'self',cost:curse.ultimate.cost,cooldown:curse.ultimate.cooldown,range:curse.ultimate.range,hint:'주변 속박'};
    }
    if(kit==='fury')return{key:'E',name:'돌진',aim:'direction',cost:0,cooldown:this.owner.furySkills.dash.cooldown,range:RULES.dash.range,hint:'드래그 / 선택 후 지점'};
    if(kit==='flame')return{key:'W',name:'화염',aim:'direction',cost:flame.w.cost,cooldown:flame.w.cooldown,range:flame.w.range,hint:'부채꼴 · 기절 연계'};
    if(kit==='frost')return{key:'E',name:'정찰',aim:'point',cost:frost.scout.cost,cooldown:frost.scout.cooldown,range:frost.scout.range,hint:'지정 지역 5초 공개'};
    return{key:'Q',name:'붕대',aim:'direction',cost:curse.hook.cost,cooldown:curse.hook.cooldown,range:curse.hook.range,hint:'첫 대상에게 이동'};
  }
  canCast(slot:SkillSlot){const c=this.owner,p=this.presentation(slot);return c.ranks[p.key as SkillKey]>0&&c.canAct&&!c.dash&&!this.pull&&c.cooldown[slot==='manual'?'dash':'ultimate']<=0&&c.hero.mana>=p.cost&&!(c.hero.rooted>0&&slot==='manual'&&(c.profile.kit==='fury'||c.profile.kit==='curse'));}
  cast(slot:SkillSlot,point?:Point){
    const c=this.owner,p=this.presentation(slot),kit=c.profile.kit;
    if(!this.canCast(slot))return false;
    if(p.aim!=='self'&&(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||(p.aim==='direction'&&distance(c.hero,point)<5)))return false;
    if(kit==='fury')return slot==='manual'?c.castDash(point!):c.castUltimate();
    c.hero.mana-=p.cost;c.cooldown[slot==='manual'?'dash':'ultimate']=p.cooldown;c.cancelRecall();c.pending=null;
    if(slot==='manual')c.completed.dash=true;
    const targets=c.enemies.filter(e=>e.alive&&skillTarget(e)&&c.canSee(e));
    if(kit==='flame') {
      const cfg=this.config.flame;
      const center=slot==='ultimate'?towards(c.hero,point!,cfg.ultimate.range):c.hero;
      const hit=targets.filter(e=>slot==='manual'?inCone(c.hero,point!,e,cfg.w.range,cfg.w.angle):distance(center,e)<=cfg.ultimate.radius);
      const stun=this.stacks>=cfg.passive.stacks&&hit.length>0;
      for(const e of hit){c.hurt(e,slot==='manual'?cfg.w.damage:cfg.ultimate.damage,p.key,true,'magic');if(stun)applyCC(e,'stunned',cfg.passive.stun);}
      if(stun)this.stacks=0;else if(slot==='manual'&&hit.length)this.stacks=Math.min(cfg.passive.stacks,this.stacks+1);
      if(slot==='ultimate')this.pet={...center,hp:cfg.pet.hp,remaining:cfg.pet.duration,cooldown:0,damage:cfg.pet.damage};
      c.events.push({kind:'slash',point:{...center}});
    } else if(kit==='frost') {
      if(slot==='manual'){this.scout={...towards(c.hero,point!,p.range),remaining:this.config.frost.scout.duration};this.reveal();}
      else this.launch('arrow',point!,this.config.frost.ultimate.range);
    } else {
      if(slot==='manual')this.launch('hook',point!,this.config.curse.hook.range);
      else {for(const e of targets.filter(e=>distance(c.hero,e)<=this.config.curse.ultimate.range)){c.hurt(e,this.config.curse.ultimate.damage,'R',true,'magic');applyCC(e,'rooted',this.config.curse.ultimate.root);}c.events.push({kind:'ultimate',point:{...c.hero}});}
    }
    return true;
  }
  private launch(kind:'hook'|'arrow',point:Point,range:number){const c=this.owner,d=distance(c.hero,point);this.missiles.push({point:{x:c.hero.x,y:c.hero.y},direction:{x:(point.x-c.hero.x)/d,y:(point.y-c.hero.y)/d},remaining:range,kind,damage:kind==='hook'?this.config.curse.hook.damage:this.config.frost.ultimate.damage,stun:kind==='hook'?this.config.curse.hook.stun:this.config.frost.ultimate.stun});}
  onBasicHit(e:Dummy){
    if(!skillTarget(e))return;
    if(this.owner.profile.kit==='frost')applySlow(e,this.config.frost.passive.slow,this.config.frost.passive.duration);
    if(this.owner.profile.kit==='curse')e.marked=Math.max(e.marked,this.config.curse.passive.duration);
  }
  onDamage(){
    const c=this.owner,s=this.config.flame.shield;
    if(c.profile.kit==='flame'&&c.ranks.E>0&&c.canAct&&c.hero.hp/c.hero.maxHp<=s.threshold&&c.cooldown.e<=0&&c.hero.mana>=s.cost){
      c.hero.mana-=s.cost;c.cooldown.e=s.cooldown;c.hero.shield=s.amount;c.hero.shieldRemaining=s.duration;
    }
  }
  auto(target:Dummy){
    const c=this.owner,kit=c.profile.kit;
    if(!skillTarget(target)&&kit!=='frost')return false;
    if(kit==='flame'){
      const q=this.config.flame.q;
      if(c.ranks.Q>0&&c.cooldown.q<=0&&distance(c.hero,target)<=q.range&&this.pay(q.cost)){c.cooldown.q=q.cooldown;c.hurt(target,q.damage,'Q',true,'magic');this.stacks=Math.min(this.config.flame.passive.stacks,this.stacks+1);return true;}
    } else if(kit==='frost'){
      const s=this.config.frost;
      if(c.cooldown.q<=0&&distance(c.hero,target)<=c.profile.stats.range+.001&&this.pay(s.q.cost)){c.cooldown.q=s.q.cooldown;this.haste=s.q.duration;this.hasteBonus=s.q.haste;return true;}
      if(c.ranks.W>0&&skillTarget(target)&&c.cooldown.w<=0&&distance(c.hero,target)<=s.w.range&&this.pay(s.w.cost)){
        c.cooldown.w=s.w.cooldown;
        for(const e of c.enemies.filter(e=>e.alive&&skillTarget(e)&&c.canSee(e)&&inCone(c.hero,target,e,s.w.range,s.w.angle))){c.hurt(e,s.w.damage+c.stats.attack*s.w.ad,'W');applySlow(e,s.w.slow,s.w.duration);}
        c.events.push({kind:'slash',point:{...c.hero}});return true;
      }
    } else if(kit==='curse'){
      const s=this.config.curse.burst;
      if(c.ranks.E>0&&c.cooldown.e<=0&&distance(c.hero,target)<=s.range&&this.pay(s.cost)){
        c.cooldown.e=s.cooldown;for(const e of c.enemies.filter(e=>e.alive&&skillTarget(e)&&c.canSee(e)&&distance(c.hero,e)<=s.range))c.hurt(e,s.damage,'E',true,'magic');c.events.push({kind:'slash',point:{...c.hero}});return true;
      }
    }
    return false;
  }
  private pay(cost:number){if(this.owner.hero.mana-cost<this.reserve)return false;this.owner.hero.mana-=cost;return true;}
  reset(){this.stacks=0;this.haste=0;this.aura=false;this.auraLock=0;this.pet=null;this.scout=null;this.pull=null;}
  private reveal(){if(this.scout)for(const e of this.owner.enemies)if(distance(this.scout,e)<=this.config.frost.scout.radius)e.revealed=Math.max(e.revealed,RULES.step*2);}
  step(dt:number){
    const c=this.owner;this.haste=Math.max(0,this.haste-dt);this.auraLock=Math.max(0,this.auraLock-dt);
    this.stepMissiles(dt);
    if(!c.alive){this.pet=null;this.scout=null;return;}
    if(this.scout){this.scout.remaining-=dt;if(this.scout.remaining<=0)this.scout=null;else this.reveal();}
    if(this.pet)this.stepPet(dt);
    if(c.profile.kit==='curse'){
      const a=this.config.curse.aura,targets=c.enemies.filter(e=>e.alive&&skillTarget(e)&&c.canSee(e)&&distance(c.hero,e)<=a.range);
      const canAura=c.ranks.W>0&&c.canAct&&!this.pull&&!c.dash&&['idle','attack','attackMove'].includes(c.command.kind)&&targets.length>0&&c.hero.mana-a.costPerSecond*dt>=this.reserve;
      if(this.aura&&!canAura){this.aura=false;this.auraLock=a.restart;}
      if(canAura&&this.auraLock<=0){this.aura=true;c.hero.mana-=a.costPerSecond*dt;for(const e of targets)c.hurt(e,(a.damage+e.maxHp*a.hpRatio)*dt,'W',false,'magic');}
    }
  }
  private stepMissiles(dt:number){
    const c=this.owner;
    this.missiles=this.missiles.filter(m=>{
      const cfg=m.kind==='hook'?this.config.curse.hook:this.config.frost.ultimate;
      const length=Math.min(m.remaining,cfg.speed*dt),end={x:m.point.x+m.direction.x*length,y:m.point.y+m.direction.y*length};
      const hit=c.enemies.filter(e=>e.alive&&skillTarget(e)&&(m.kind==='hook'||e.kind!=='minion')).map(e=>({e,...alongSegment(m.point,end,e)})).filter(h=>h.distance<=cfg.radius+18).sort((a,b)=>a.t-b.t)[0]?.e;
      m.remaining-=length;m.point=end;
      if(hit){c.hurt(hit,m.damage,m.kind==='hook'?'Q':'R',true,'magic');applyCC(hit,'stunned',m.stun);
        if(m.kind==='hook'&&c.canAct&&c.hero.rooted<=0){c.attack(hit.id);this.pull=towards(hit,c.hero,c.profile.stats.range);}
        return false;
      }
      return m.remaining>0;
    });
  }
  private stepPet(dt:number){
    const c=this.owner,p=this.pet!,cfg=this.config.flame.pet;p.remaining-=dt;p.cooldown=Math.max(0,p.cooldown-dt);
    if(p.remaining<=0||p.hp<=0){this.pet=null;return;}
    const direct=c.command.kind==='attack'?c.command.targetId:null;
    const targets=c.enemies.filter(e=>e.alive&&skillTarget(e)&&c.canSee(e)&&distance(c.hero,e)<=cfg.leash);
    const target=targets.find(e=>e.id===direct)??targets.sort((a,b)=>distance(p,a)-distance(p,b))[0];
    const goal=distance(p,c.hero)>cfg.leash?c.hero:target??c.hero;
    const reach=goal===c.hero?45:cfg.range,d=distance(p,goal);
    if(d>reach){const next=towards(p,goal,Math.min(cfg.speed*dt,d-reach));p.x=next.x;p.y=next.y;}
    else if(goal===target&&target&&p.cooldown<=0){c.hurt(target,p.damage,'곰',true,'magic');p.cooldown=cfg.interval;}
  }
}
