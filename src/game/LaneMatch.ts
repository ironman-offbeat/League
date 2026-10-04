import { Squad } from './Squad.ts';
import { Combat } from './combat.ts';
import { CHAMPIONS } from './champions.ts';
import { distance } from './config.ts';
import type { Point } from './config.ts';
import { freshStatus, mitigate, towards } from './effects.ts';
import { damageTarget } from './targets.ts';
import type { Target } from './targets.ts';
import type { Pet } from './Abilities.ts';

// Compact first-match map. These are playtest values, not final ranked balance.
export const LANE = {
  y:500, firstWave:10, waveInterval:20, supportRange:280,
  tower:{hp:1800,armor:40,range:260,attack:150,interval:1,windup:.45},
  nexus:{hp:2800,armor:40},
  melee:{hp:350,armor:10,range:35,attack:22,interval:1.2,speed:70},
  ranged:{hp:220,armor:0,range:145,attack:27,interval:1.5,speed:70},
  siege:{hp:650,armor:15,range:175,attack:55,interval:2,speed:60},
  spawns:[{x:180,y:470},{x:115,y:435},{x:115,y:565},{x:180,y:530}],
} as const;
type Team='blue'|'red';
type MinionClass='melee'|'ranged'|'siege';
export type LaneUnit=Target & {team:Team;kind:'minion'|'building';role:MinionClass|'tower'|'nexus'};
type Victim={point:Point;unit?:LaneUnit;actor?:Combat;pet?:Pet;life?:number};
type TowerShot={tower:LaneUnit;target:Victim;remaining:number};
export type MatchResult='victory'|'defeat'|'draw';

export class LaneMatch extends Squad {
  units:LaneUnit[]=[];
  enemies:LaneUnit[]=[];
  elapsed=0;
  wave=0;
  nextWave:number=LANE.firstWave;
  result:MatchResult|null=null;
  towerShots=new Map<string,TowerShot>();
  private towerFocus=new Map<string,{key:unknown;hits:number}>();
  private serial=0;
  constructor(){
    super(false);
    for(const team of ['blue','red'] as const){
      this.units.push(this.createUnit(team,'tower',team==='blue'?440:1160,LANE.y));
      this.units.push(this.createUnit(team,'nexus',team==='blue'?100:1500,LANE.y));
    }
    this.enemies.push(...this.units.filter(u=>u.team==='red'));
    this.members=CHAMPIONS.map((profile,i)=>{
      const c=new Combat({...profile,spawn:{...LANE.spawns[i]}},this.enemies);
      c.autoTargetAllowed=target=>target.kind!=='building'||this.supported(target,'blue');
      return c;
    });
    this.updateProtection();
  }
  private createUnit(team:Team,role:LaneUnit['role'],x:number,y:number):LaneUnit {
    const stats=LANE[role];
    return{id:`${team}-${role}-${++this.serial}`,team,role,kind:role==='tower'||role==='nexus'?'building':'minion',x,y,
      hp:stats.hp,maxHp:stats.hp,armor:stats.armor,magicResist:0,alive:true,visible:true,
      revealed:0,alert:0,aggro:null,attackCooldown:0,respawn:Infinity,generation:0,...freshStatus()};
  }
  supported(target:Point,attacker:Team){return this.units.some(u=>u.alive&&u.team===attacker&&u.kind==='minion'&&distance(u,target)<=LANE.supportRange);}
  structure(team:Team,role:'tower'|'nexus'){return this.units.find(u=>u.team===team&&u.role===role)!;}
  private updateProtection(){
    for(const u of this.units.filter(u=>u.kind==='building')){
      u.protected=u.role==='nexus'&&this.structure(u.team,'tower').alive;
      u.damageScale=this.supported(u,u.team==='blue'?'red':'blue')?1:.25;
    }
  }
  private spawnWave(){
    this.wave++;
    const roles:MinionClass[]=['melee','melee','melee','ranged','ranged'];
    if(this.wave%3===0)roles.push('siege');
    for(const team of ['blue','red'] as const)roles.forEach((role,i)=>{
      const direction=team==='blue'?1:-1;
      const unit=this.createUnit(team,role,(team==='blue'?160:1440)-direction*Math.floor(i/3)*35,LANE.y+(i%3-1)*32);
      this.units.push(unit);if(team==='red')this.enemies.push(unit);
    });
  }
  private valid(v:Victim){return v.unit?v.unit.alive:!!v.actor?.alive&&v.actor.life===v.life&&(!v.pet||(v.actor.abilities.pet===v.pet&&v.pet.hp>0));}
  private defenders(attacker:LaneUnit):Victim[]{
    const candidates:Victim[]=this.units.filter(u=>u.team!==attacker.team&&u.alive&&!u.protected).map(unit=>({unit,point:unit}));
    if(attacker.team==='red')for(const actor of this.members.filter(c=>c.alive)){
      candidates.push({actor,point:actor.hero,life:actor.life});
      if(actor.abilities.pet)candidates.push({actor,pet:actor.abilities.pet,point:actor.abilities.pet,life:actor.life});
    }
    return candidates;
  }
  private hit(v:Victim,raw:number){
    if(!this.valid(v))return;
    if(v.unit)damageTarget(v.unit,raw,'physical','basic');
    else if(v.pet)v.pet.hp=Math.max(0,v.pet.hp-mitigate(raw,0));
    else v.actor!.receiveDamage(raw);
  }
  step(dt:number){
    if(this.result||dt<=0)return;
    this.elapsed+=dt;
    if(this.elapsed+1e-8>=this.nextWave){this.spawnWave();this.nextWave+=LANE.waveInterval;}
    Combat.stepEnemies(this.units,dt);
    this.updateProtection();
    for(const c of this.members){
      // Automatic siege stops when its escort dies. Explicit attack orders remain risky by choice.
      const tower=this.structure('red','tower');
      if(c.alive&&c.command.kind==='idle'&&tower.alive&&!this.supported(tower,'blue')&&distance(c.hero,tower)<=LANE.tower.range){
        c.move({x:tower.x-LANE.tower.range-50,y:c.hero.y});
      }
      c.step(dt,false);
    }
    this.updateProtection();
    const hits:{target:Victim;damage:number}[]=[];
    for(const unit of this.units){
      if(!unit.alive||unit.role==='nexus')continue;
      if(unit.kind==='building'){
        const shot=this.towerShots.get(unit.id);
        if(shot){
          if(!this.valid(shot.target)||distance(unit,shot.target.point)>LANE.tower.range){this.towerShots.delete(unit.id);continue;}
          shot.remaining-=dt;
          if(shot.remaining<=0){
            const key=shot.target.unit??shot.target.pet??`${shot.target.actor!.profile.id}:${shot.target.life}`;
            const old=this.towerFocus.get(unit.id),hitsInRow=old?.key===key?old.hits:0;
            hits.push({target:shot.target,damage:LANE.tower.attack*(1+(!shot.target.unit&&!shot.target.pet?Math.min(4,hitsInRow)*.25:0))});
            this.towerFocus.set(unit.id,{key,hits:hitsInRow+1});this.towerShots.delete(unit.id);
          }
        }else if(unit.attackCooldown<=0){
          const target=this.defenders(unit).filter(v=>v.unit?.kind!=='building'&&distance(unit,v.point)<=LANE.tower.range)
            .sort((a,b)=>Number(b.unit?.kind==='minion')-Number(a.unit?.kind==='minion')||distance(unit,a.point)-distance(unit,b.point))[0];
          if(target){this.towerShots.set(unit.id,{tower:unit,target,remaining:LANE.tower.windup});unit.attackCooldown=LANE.tower.interval;}
          else this.towerFocus.delete(unit.id);
        }
        continue;
      }
      if(unit.stunned>0||unit.airborne>0)continue;
      const stats=LANE[unit.role as MinionClass];
      const defenders=this.defenders(unit);
      const target=defenders.filter(v=>v.unit?.kind!=='building'&&distance(unit,v.point)<=220).sort((a,b)=>distance(unit,a.point)-distance(unit,b.point))[0]
        ??defenders.filter(v=>v.unit?.kind==='building').sort((a,b)=>distance(unit,a.point)-distance(unit,b.point))[0];
      if(!target)continue;
      const d=distance(unit,target.point);
      if(d>stats.range){if(unit.rooted<=0)Object.assign(unit,towards(unit,target.point,Math.min(d-stats.range,stats.speed*(1-unit.slow)*dt)));}
      else if(unit.attackCooldown<=0){hits.push({target,damage:stats.attack});unit.attackCooldown=stats.interval;}
    }
    // Collect attacks before resolving deaths, allowing simultaneous nexus destruction.
    for(const hit of hits)this.hit(hit.target,hit.damage);
    const blue=this.structure('blue','nexus').alive,red=this.structure('red','nexus').alive;
    if(!blue||!red){this.result=!blue&&!red?'draw':red?'defeat':'victory';this.towerShots.clear();return;}
    for(const [id,shot] of this.towerShots)if(!shot.tower.alive)this.towerShots.delete(id);
    // Keep shared enemy-array identity and drop dead wave units; projectiles retain safe dead references.
    for(const array of [this.units,this.enemies])for(let i=array.length-1;i>=0;i--)if(!array[i].alive&&array[i].kind==='minion')array.splice(i,1);
  }
}
