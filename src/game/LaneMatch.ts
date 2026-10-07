import { Squad } from './Squad.ts';
import { Combat } from './combat.ts';
import { CHAMPIONS } from './champions.ts';
import { RULES, distance } from './config.ts';
import type { Point } from './config.ts';
import { TeamVision } from './vision.ts';
import type { VisionSource, VisionSubject } from './vision.ts';
import { freshStatus, mitigate, towards } from './effects.ts';
import { damageTarget } from './targets.ts';
import type { Target } from './targets.ts';
import type { Pet } from './Abilities.ts';
import { PROGRESSION, TeamEconomy } from './progression.ts';
import { championTarget } from './championTarget.ts';
import { LaneAI } from './LaneAI.ts';
import { EQUIPMENT } from './equipment.ts';
import type { Purchase } from './equipment.ts';

// Compact first-match map. These are playtest values, not final ranked balance.
export const LANE = {
  y:500, firstWave:10, waveInterval:20, supportRange:280,
  tower:{hp:1800,armor:40,range:260,attack:150,interval:1,windup:.45},
  nexus:{hp:2800,armor:40},
  melee:{hp:350,armor:10,range:35,attack:22,interval:1.2,speed:70},
  ranged:{hp:220,armor:0,range:145,attack:27,interval:1.5,speed:70},
  siege:{hp:650,armor:15,range:175,attack:55,interval:2,speed:60},
  spawns:[{x:180,y:470},{x:115,y:435},{x:115,y:565},{x:180,y:530}],
  vision:{champion:340,minion:235,tower:310,scout:260,cell:80,attackReveal:1.5},
  bushes:[
    {id:'lane-north',x:650,y:390,width:260,height:90},
    {id:'lane-south',x:690,y:520,width:260,height:90},
  ],
} as const;
export type Team='blue'|'red';
type MinionClass='melee'|'ranged'|'siege';
export type LaneUnit=Target & {team:Team;kind:'minion'|'building';role:MinionClass|'tower'|'nexus'};
type Victim={point:Point;unit?:LaneUnit;actor?:Combat;pet?:Pet;life?:number};
type TowerShot={tower:LaneUnit;target:Victim;remaining:number};
export type MatchResult='victory'|'defeat'|'draw';

export class LaneMatch extends Squad {
  units:LaneUnit[]=[];
  enemies:Target[]=[];
  opponents:Combat[]=[];
  private redTargets:Target[]=[];
  championTargets:Target[]=[];
  ai:LaneAI[]=[];
  kills={blue:0,red:0};
  get actors(){return [...this.members,...this.opponents];}
  teamOf(c:Combat):Team{return this.opponents.includes(c)?'red':'blue';}
  teamMembers(team:Team){return team==='blue'?this.members:this.opponents;}
  elapsed=0;
  wave=0;
  nextWave:number=LANE.firstWave;
  result:MatchResult|null=null;
  economy={blue:new TeamEconomy(),red:new TeamEconomy()};
  towerShots=new Map<string,TowerShot>();
  readonly vision=new TeamVision(RULES.world.width,RULES.world.height,LANE.bushes,LANE.vision.cell);
  private exposedUntil=new Map<string,number>();
  private petExposedUntil=new Map<string,number>();
  private towerFocus=new Map<string,{key:unknown;hits:number}>();
  private towerProvoker(tower:LaneUnit){
    const alliedIds=new Set(this.teamMembers(tower.team).map(c=>c.profile.id));
    const aggressors=new Set(this.championTargets.filter(t=>alliedIds.has(t.id)&&t.alert>0).map(t=>t.aggro));
    const actor=this.teamMembers(tower.team==='blue'?'red':'blue').find(c=>c.alive&&aggressors.has(c.profile.id)&&distance(c.hero,tower)<=LANE.tower.range);
    return actor?{actor,point:actor.hero,life:actor.life}:undefined;
  }
  private serial=0;
  constructor(options:{enemyChampions?:boolean;ai?:boolean}={}){
    super(false);
    for(const team of ['blue','red'] as const){
      this.units.push(this.createUnit(team,'tower',team==='blue'?440:1160,LANE.y));
      this.units.push(this.createUnit(team,'nexus',team==='blue'?100:1500,LANE.y));
    }
    this.enemies.push(...this.units.filter(u=>u.team==='red'));
    this.members=CHAMPIONS.map((profile,i)=>{
      const c=new Combat({...profile,spawn:{...LANE.spawns[i]}},this.enemies);
      c.progression.enabled=true;
      c.initializeEquipment();
      c.autoTargetAllowed=target=>target.kind!=='building'||this.supported(target,'blue');
      return c;
    });
    this.redTargets.push(...this.units.filter(u=>u.team==='blue'));
    const blue=this.members.map(championTarget);
    this.championTargets.push(...blue);this.redTargets.push(...blue);
    if(options.enemyChampions!==false){
      this.opponents=CHAMPIONS.map((profile,i)=>{
        const c=new Combat({...profile,id:`red-${profile.id}`,spawn:{x:1600-LANE.spawns[i].x,y:1000-LANE.spawns[i].y}},this.redTargets);
        c.visualId=profile.id;c.hero.facing=Math.PI;c.progression.enabled=true;c.initializeEquipment();
        c.autoTargetAllowed=target=>target.kind!=='building'||this.supported(target,'red');
        return c;
      });
      const red=this.opponents.map(championTarget);
      this.championTargets.push(...red);this.enemies.push(...red);
      for(const c of this.actors)c.onDeath=()=>this.rewardChampion(c);
      if(options.ai!==false)this.ai=this.opponents.map((c,i)=>new LaneAI(this,c,i));
    }
    for(const actor of this.actors){
      const team=this.teamOf(actor);
      actor.visibilityResolver=target=>this.canSee(team,target);
      actor.lastSeenResolver=target=>this.lastSeen(team,target);
      actor.memoryResolver=(targetId,generation)=>this.lastSeenById(team,targetId,generation);
      actor.onOffensiveAction=()=>this.expose(actor);
      actor.onSummonOffensiveAction=()=>this.exposePet(actor);
    }
    this.updateProtection();
    this.refreshVision();
  }
  private targetTeam(target:Target):Team|null{
    const unitTeam=(target as Partial<LaneUnit>).team;if(unitTeam==='blue'||unitTeam==='red')return unitTeam;
    if(this.championTargets.some(t=>t===target||t.id===target.id))return target.id.startsWith('red-')?'red':'blue';
    return null;
  }
  private subject(target:Target):VisionSubject|null{
    const team=this.targetTeam(target);if(!team)return null;
    return {id:target.id,team,x:target.x,y:target.y,generation:target.generation,alive:target.alive,exposed:(this.exposedUntil.get(target.id)??0)>this.elapsed};
  }
  canSee(team:Team,target:Target){
    const subject=this.subject(target);return subject?this.vision.canSee(team,subject):target.visible||target.revealed>0;
  }
  pointVisible(team:Team,point:Point){return this.vision.pointVisible(team,point);}
  terrain(team:Team,point:Point){return this.vision.terrain(team,point);}
  lastSeen(team:Team,target:Target){return this.lastSeenById(team,target.id,target.generation);}
  lastSeenById(team:Team,id:string,generation:number){
    const sighting=this.vision.lastSeen(team,id);
    return sighting&&sighting.generation===generation?{x:sighting.x,y:sighting.y}:null;
  }
  expose(actor:Combat){this.exposedUntil.set(actor.profile.id,this.elapsed+LANE.vision.attackReveal);}
  private petSubject(actor:Combat):VisionSubject|null{
    const pet=actor.abilities.pet;if(!pet||pet.hp<=0)return null;
    return {id:`pet:${actor.profile.id}`,team:this.teamOf(actor),x:pet.x,y:pet.y,generation:actor.life,alive:true,exposed:(this.petExposedUntil.get(actor.profile.id)??0)>this.elapsed};
  }
  canSeePet(team:Team,actor:Combat){
    const subject=this.petSubject(actor);return !!subject&&this.vision.canSee(team,subject);
  }
  exposePet(actor:Combat){this.petExposedUntil.set(actor.profile.id,this.elapsed+LANE.vision.attackReveal);}
  refreshVision(){
    const sources:VisionSource[]=[];
    for(const actor of this.actors)if(actor.alive)sources.push({team:this.teamOf(actor),x:actor.hero.x,y:actor.hero.y,radius:LANE.vision.champion,alive:true});
    for(const unit of this.units)if(unit.alive&&(unit.kind==='minion'||unit.role==='tower'))sources.push({team:unit.team,x:unit.x,y:unit.y,radius:unit.role==='tower'?LANE.vision.tower:LANE.vision.minion,alive:true});
    for(const actor of this.actors){const scout=actor.abilities.scout;if(scout)sources.push({team:this.teamOf(actor),x:scout.x,y:scout.y,radius:LANE.vision.scout,alive:true,revealsBush:true});}
    const subjects:VisionSubject[]=[];
    for(const target of [...this.championTargets,...this.units]){const subject=this.subject(target);if(subject)subjects.push(subject);}
    for(const actor of this.actors){const subject=this.petSubject(actor);if(subject)subjects.push(subject);}
    this.vision.update(sources,subjects,this.elapsed);
  }
  private rewardChampion(victim:Combat){
    if(this.result)return;
    const team=this.teamOf(victim)==='blue'?'red':'blue';
    this.kills[team]++;
    this.economy[team].add(120);
    const eligible=this.teamMembers(team).filter(c=>c.alive&&!c.progression.capped&&distance(c.hero,victim.hero)<=PROGRESSION.rewardRange);
    for(const c of eligible)c.gainExperience((120+victim.progression.level*20)/eligible.length);
  }
  shopReason(c:Combat,item:Purchase){
    if(this.result||!this.actors.includes(c))return '경기 종료';
    if(c.alive&&distance(c.hero,c.profile.spawn)>=EQUIPMENT.fountainRadius)return '우물에서만 구매 가능';
    const price=c.equipment.price(item);
    if(price===null)return '최대 단계';
    if(item!=='weapon'&&item!=='armor'){
      if(c.equipment.potion)return '포션 슬롯이 가득 참';
      if(c.maxMana===0&&item!=='health')return '분노 챔피언은 구매 불가';
    }
    if(this.economy[this.teamOf(c)].gold+1e-8<price)return '팀 골드 부족';
    return '';
  }
  purchase(c:Combat,item:Purchase){
    if(this.shopReason(c,item))return false;
    const price=c.equipment.price(item);if(price===null||!this.economy[this.teamOf(c)].spend(price))return false;
    if(item==='weapon')c.equipment.weapon++;
    else if(item==='armor'){
      const before=EQUIPMENT.health[c.equipment.armor];c.equipment.armor++;
      const delta=EQUIPMENT.health[c.equipment.armor]-before;c.hero.maxHp+=delta;if(c.alive)c.hero.hp+=delta;
    }else c.equipment.potion=item;
    return true;
  }
  private createUnit(team:Team,role:LaneUnit['role'],x:number,y:number):LaneUnit {
    const stats=LANE[role];
    const unit:LaneUnit={id:`${team}-${role}-${++this.serial}`,team,role,kind:role==='tower'||role==='nexus'?'building':'minion',x,y,
      hp:stats.hp,maxHp:stats.hp,armor:stats.armor,magicResist:0,alive:true,visible:true,
      revealed:0,alert:0,aggro:null,attackCooldown:0,respawn:Infinity,generation:0,...freshStatus()};
    unit.onDeath=()=>this.reward(unit);
    return unit;
  }
  private reward(unit:LaneUnit){
    if(this.result)return;
    const team=unit.team==='blue'?'red':'blue',reward=PROGRESSION.rewards[unit.role];
    const nearby=this.teamMembers(team).filter(c=>c.alive&&distance(c.hero,unit)<=PROGRESSION.rewardRange);
    if(unit.kind==='building'||nearby.length)this.economy[team].add(reward.gold);
    const eligible=nearby.filter(c=>!c.progression.capped);
    for(const c of eligible)c.gainExperience(reward.xp/eligible.length);
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
      this.units.push(unit);(team==='red'?this.enemies:this.redTargets).push(unit);
    });
  }
  private valid(v:Victim){return v.unit?v.unit.alive:!!v.actor?.alive&&v.actor.life===v.life&&(!v.pet||(v.actor.abilities.pet===v.pet&&v.pet.hp>0));}
  private defenders(attacker:LaneUnit):Victim[]{
    const candidates:Victim[]=this.units.filter(u=>u.team!==attacker.team&&u.alive&&!u.protected&&this.canSee(attacker.team,u)).map(unit=>({unit,point:unit}));
    for(const actor of this.teamMembers(attacker.team==='red'?'blue':'red').filter(c=>{
      if(!c.alive)return false;
      const target=this.championTargets.find(t=>t.id===c.profile.id);
      return !!target&&this.canSee(attacker.team,target);
    })){
      candidates.push({actor,point:actor.hero,life:actor.life});
      if(actor.abilities.pet&&this.canSeePet(attacker.team,actor))candidates.push({actor,pet:actor.abilities.pet,point:actor.abilities.pet,life:actor.life});
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
    for(const economy of Object.values(this.economy))economy.advance(this.elapsed,this.elapsed+dt);
    this.elapsed+=dt;
    if(this.elapsed+1e-8>=this.nextWave){this.spawnWave();this.nextWave+=LANE.waveInterval;}
    Combat.stepEnemies(this.units,dt);
    this.updateProtection();
    for(const target of this.championTargets){target.revealed=Math.max(0,target.revealed-dt);target.alert=Math.max(0,target.alert-dt);}
    this.refreshVision();
    for(const brain of this.ai)brain.step(dt);
    for(const c of this.actors){
      // Automatic siege stops when its escort dies. Explicit attack orders remain risky by choice.
      const team=this.teamOf(c),tower=this.structure(team==='blue'?'red':'blue','tower');
      if(c.alive&&c.command.kind==='idle'&&tower.alive&&!this.supported(tower,team)&&distance(c.hero,tower)<=LANE.tower.range){
        c.move({x:tower.x+(team==='blue'?-1:1)*(LANE.tower.range+50),y:c.hero.y});
      }
      c.step(dt,false);
    }
    this.refreshVision();
    this.updateProtection();
    const hits:{target:Victim;damage:number}[]=[];
    for(const unit of this.units){
      if(!unit.alive||unit.role==='nexus')continue;
      if(unit.kind==='building'){
        const shot=this.towerShots.get(unit.id);
        const provoker=this.towerProvoker(unit);
        if(shot&&provoker&&shot.target.actor!==provoker.actor){
          // Give the newly targeted hero a full, escapable warning, never an instant hit.
          shot.target=provoker;shot.remaining=LANE.tower.windup;
        }
        if(shot){
          const targetVisible=shot.target.unit?this.canSee(unit.team,shot.target.unit):shot.target.actor?(()=>{const t=this.championTargets.find(v=>v.id===shot.target.actor!.profile.id);return !!t&&this.canSee(unit.team,t);})():this.pointVisible(unit.team,shot.target.point);
          if(!this.valid(shot.target)||!targetVisible||distance(unit,shot.target.point)>LANE.tower.range){this.towerShots.delete(unit.id);continue;}
          shot.remaining-=dt;
          if(shot.remaining<=0){
            const key=shot.target.unit??shot.target.pet??`${shot.target.actor!.profile.id}:${shot.target.life}`;
            const old=this.towerFocus.get(unit.id),hitsInRow=old?.key===key?old.hits:0;
            hits.push({target:shot.target,damage:LANE.tower.attack*(1+(!shot.target.unit&&!shot.target.pet?Math.min(4,hitsInRow)*.25:0))});
            this.towerFocus.set(unit.id,{key,hits:hitsInRow+1});this.towerShots.delete(unit.id);
          }
        }else if(unit.attackCooldown<=0){
          const target=provoker??this.defenders(unit).filter(v=>v.unit?.kind!=='building'&&distance(unit,v.point)<=LANE.tower.range)
            .sort((a,b)=>Number(b.unit?.kind==='minion')-Number(a.unit?.kind==='minion')||distance(unit,a.point)-distance(unit,b.point))[0];
          if(target){this.towerShots.set(unit.id,{tower:unit,target,remaining:LANE.tower.windup});unit.attackCooldown=LANE.tower.interval;}
          else this.towerFocus.delete(unit.id);
        }
        continue;
      }
      if(unit.stunned>0||unit.airborne>0)continue;
      const stats=LANE[unit.role as MinionClass];
      const defenders=this.defenders(unit);
      const objective=this.units.filter(u=>u.team!==unit.team&&u.kind==='building'&&u.alive&&!u.protected)
        .sort((a,b)=>distance(unit,a)-distance(unit,b))[0];
      const target=defenders.filter(v=>v.unit?.kind!=='building'&&distance(unit,v.point)<=220).sort((a,b)=>distance(unit,a.point)-distance(unit,b.point))[0]
        ??defenders.filter(v=>v.unit?.kind==='building').sort((a,b)=>distance(unit,a.point)-distance(unit,b.point))[0]
        ??(objective?{unit:objective,point:objective}:undefined);
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
    for(const array of [this.units,this.enemies,this.redTargets])for(let i=array.length-1;i>=0;i--)if(!array[i].alive&&array[i].kind==='minion')array.splice(i,1);
  }
}
