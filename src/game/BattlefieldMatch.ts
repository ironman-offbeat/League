import { Squad } from './Squad.ts';
import { Combat } from './combat.ts';
import { CHAMPIONS } from './champions.ts';
import type { Champion } from './champions.ts';
import { RULES, distance } from './config.ts';
import type { Point } from './config.ts';
import { PROGRESSION, TeamEconomy } from './progression.ts';
import { championTarget } from './championTarget.ts';
import { EQUIPMENT } from './equipment.ts';
import type { Purchase } from './equipment.ts';
import { freshStatus, tickStatus, towards } from './effects.ts';
import { damageTarget } from './targets.ts';
import type { Target } from './targets.ts';
import {
  BATTLEFIELD_NAVIGATION,
  battlefieldLaneRoute,
  pointOnRoute,
  routeLength,
  routeProgress,
  advanceOnRoute,
} from './navigation.ts';
import type { LaneId, NavigationTeam } from './navigation.ts';

export type BattlefieldTeam=NavigationTeam;
export type BattlefieldMinionRole='melee'|'ranged'|'siege';
export type BattlefieldStructureRole='outer'|'inner'|'inhibitor'|'nexus';
export type BattlefieldRole=LaneId|'jungle';
export type BattlefieldResult='victory'|'defeat'|'draw';

export type BattlefieldUnit=Target & {
  team:BattlefieldTeam;
  lane:LaneId|null;
  kind:'minion'|'building';
  role:BattlefieldMinionRole|BattlefieldStructureRole;
};

export const BATTLEFIELD={
  firstWave:10,
  waveInterval:20,
  supportRange:280,
  waveSpawnDistance:78,
  minionEngageRange:220,
  structures:{
    outer:{hp:3200,armor:40,range:260,attack:150,interval:1},
    inner:{hp:4000,armor:50,range:260,attack:190,interval:1},
    inhibitor:{hp:2200,armor:30},
    nexus:{hp:5500,armor:40},
  },
  structureProgress:{
    inhibitor:.12,
    inner:.25,
    outer:.40,
  },
  minions:{
    melee:{hp:350,armor:10,range:35,attack:22,interval:1.2,speed:70},
    ranged:{hp:220,armor:0,range:145,attack:27,interval:1.5,speed:70},
    siege:{hp:650,armor:15,range:175,attack:55,interval:2,speed:60},
  },
} as const;

export const BATTLEFIELD_ROLE_BY_CHAMPION={
  renekton:'top',
  annie:'mid',
  ashe:'bottom',
  amumu:'jungle',
} as const satisfies Record<string,BattlefieldRole>;

const LANES:readonly LaneId[]=['top','mid','bottom'];
const STRUCTURE_ORDER:readonly Exclude<BattlefieldStructureRole,'nexus'>[]=['outer','inner','inhibitor'];

export function battlefieldChampionSpawn(championId:keyof typeof BATTLEFIELD_ROLE_BY_CHAMPION,team:BattlefieldTeam):Point{
  const role=BATTLEFIELD_ROLE_BY_CHAMPION[championId];
  if(role==='jungle'){
    return BATTLEFIELD_NAVIGATION.node(team==='blue'?'blue-jungle-bottom':'red-jungle-top').point;
  }
  const route=battlefieldLaneRoute(role,'blue');
  return pointOnRoute(route,team,110,0);
}

export class BattlefieldMatch {
  readonly units:BattlefieldUnit[]=[];
  elapsed=0;
  wave=0;
  nextWave=BATTLEFIELD.firstWave;
  result:BattlefieldResult|null=null;
  private serial=0;

  constructor(){
    for(const team of ['blue','red'] as const){
      for(const lane of LANES){
        for(const role of ['inhibitor','inner','outer'] as const){
          const route=this.laneRoute(lane);
          const travelled=routeLength(route)*BATTLEFIELD.structureProgress[role];
          const point=pointOnRoute(route,team,travelled);
          this.units.push(this.createUnit(team,lane,role,point));
        }
      }
      const base=BATTLEFIELD_NAVIGATION.node(team==='blue'?'blue-base':'red-base').point;
      this.units.push(this.createUnit(team,null,'nexus',base));
    }
    this.updateProtection();
  }

  laneRoute(lane:LaneId){return battlefieldLaneRoute(lane,'blue');}
  laneLength(lane:LaneId){return routeLength(this.laneRoute(lane));}
  laneProgress(team:BattlefieldTeam,lane:LaneId,point:Point){return routeProgress(this.laneRoute(lane),team,point);}
  lanePoint(team:BattlefieldTeam,lane:LaneId,travelled:number,lateral=0){return pointOnRoute(this.laneRoute(lane),team,travelled,lateral);}
  laneAdvance(team:BattlefieldTeam,lane:LaneId,point:Point,advance:number,preserveLateral=true){
    return advanceOnRoute(this.laneRoute(lane),team,point,advance,preserveLateral);
  }

  structures(team?:BattlefieldTeam){
    return this.units.filter((unit):unit is BattlefieldUnit=>unit.kind==='building'&&(!team||unit.team===team));
  }

  structure(team:BattlefieldTeam,role:BattlefieldStructureRole,lane?:LaneId){
    const found=this.units.find(unit=>unit.kind==='building'&&unit.team===team&&unit.role===role&&(role==='nexus'||unit.lane===lane));
    if(!found)throw new Error(`missing battlefield structure: ${team} ${lane??'base'} ${role}`);
    return found;
  }

  minions(team?:BattlefieldTeam,lane?:LaneId){
    return this.units.filter(unit=>unit.kind==='minion'&&(!team||unit.team===team)&&(!lane||unit.lane===lane));
  }

  private createUnit(team:BattlefieldTeam,lane:LaneId|null,role:BattlefieldUnit['role'],point:Point):BattlefieldUnit{
    const stats=role in BATTLEFIELD.minions
      ? BATTLEFIELD.minions[role as BattlefieldMinionRole]
      : BATTLEFIELD.structures[role as BattlefieldStructureRole];
    const unit:BattlefieldUnit={
      id:`${team}-${lane??'base'}-${role}-${++this.serial}`,
      team,lane,role,
      kind:role==='melee'||role==='ranged'||role==='siege'?'minion':'building',
      x:point.x,y:point.y,
      hp:stats.hp,maxHp:stats.hp,armor:stats.armor,magicResist:0,
      alive:true,visible:true,revealed:0,alert:0,aggro:null,
      attackCooldown:0,respawn:Infinity,generation:0,
      ...freshStatus(),
    };
    return unit;
  }

  private supported(target:BattlefieldUnit,attacker:BattlefieldTeam){
    return this.units.some(unit=>
      unit.alive&&unit.kind==='minion'&&unit.team===attacker&&
      (target.lane===null||unit.lane===target.lane)&&
      distance(unit,target)<=BATTLEFIELD.supportRange
    );
  }

  private updateProtection(){
    for(const team of ['blue','red'] as const){
      for(const lane of LANES){
        const outer=this.structure(team,'outer',lane);
        const inner=this.structure(team,'inner',lane);
        const inhibitor=this.structure(team,'inhibitor',lane);
        outer.protected=false;
        inner.protected=outer.alive;
        inhibitor.protected=inner.alive;
        for(const structure of [outer,inner,inhibitor]){
          structure.damageScale=this.supported(structure,team==='blue'?'red':'blue')?1:.25;
        }
      }
      const nexus=this.structure(team,'nexus');
      nexus.protected=LANES.every(lane=>this.structure(team,'inhibitor',lane).alive);
      nexus.damageScale=this.supported(nexus,team==='blue'?'red':'blue')?1:.25;
    }
  }

  private spawnWave(){
    this.wave++;
    const roles:BattlefieldMinionRole[]=['melee','melee','melee','ranged','ranged'];
    if(this.wave%3===0)roles.push('siege');
    for(const lane of LANES){
      for(const team of ['blue','red'] as const){
        roles.forEach((role,index)=>{
          const row=Math.floor(index/3);
          const lateral=(index%3-1)*26;
          const travelled=Math.max(20,BATTLEFIELD.waveSpawnDistance-row*28);
          const point=this.lanePoint(team,lane,travelled,team==='blue'?lateral:-lateral);
          this.units.push(this.createUnit(team,lane,role,point));
        });
      }
    }
  }

  private objective(unit:BattlefieldUnit){
    if(unit.lane===null)return undefined;
    const enemy=unit.team==='blue'?'red':'blue';
    for(const role of STRUCTURE_ORDER){
      const structure=this.structure(enemy,role,unit.lane);
      if(structure.alive&&!structure.protected)return structure;
    }
    const nexus=this.structure(enemy,'nexus');
    return nexus.alive&&!nexus.protected?nexus:undefined;
  }

  private defenders(unit:BattlefieldUnit){
    if(unit.lane===null)return [];
    return this.units.filter(other=>
      other.alive&&other.team!==unit.team&&other.kind==='minion'&&other.lane===unit.lane
    );
  }

  private stepTower(unit:BattlefieldUnit,hits:{target:BattlefieldUnit;damage:number}[]){
    if(unit.role!=='outer'&&unit.role!=='inner')return;
    const stats=BATTLEFIELD.structures[unit.role];
    if(unit.attackCooldown>0)return;
    const target=this.units
      .filter(other=>other.alive&&other.kind==='minion'&&other.team!==unit.team&&other.lane===unit.lane&&distance(unit,other)<=stats.range)
      .sort((a,b)=>distance(unit,a)-distance(unit,b))[0];
    if(!target)return;
    hits.push({target,damage:stats.attack});
    unit.attackCooldown=stats.interval;
  }

  private stepMinion(unit:BattlefieldUnit,dt:number,hits:{target:BattlefieldUnit;damage:number}[]){
    if(unit.lane===null||unit.stunned>0||unit.airborne>0)return;
    const stats=BATTLEFIELD.minions[unit.role as BattlefieldMinionRole];
    const defenders=this.defenders(unit)
      .filter(target=>distance(unit,target)<=BATTLEFIELD.minionEngageRange)
      .sort((a,b)=>distance(unit,a)-distance(unit,b));
    const target=defenders[0]??this.objective(unit);
    if(!target)return;
    const d=distance(unit,target);
    if(d>stats.range&&unit.rooted<=0){
      const travel=stats.speed*(1-unit.slow)*dt;
      if(target.kind==='building'){
        const targetProgress=this.laneProgress(unit.team,unit.lane,target);
        const currentProgress=this.laneProgress(unit.team,unit.lane,unit);
        const remaining=targetProgress-currentProgress-stats.range;
        if(remaining>1e-6)Object.assign(unit,this.laneAdvance(unit.team,unit.lane,unit,Math.min(travel,remaining)));
        else Object.assign(unit,towards(unit,target,Math.min(Math.max(0,d-stats.range),travel)));
      }else{
        Object.assign(unit,towards(unit,target,Math.min(Math.max(0,d-stats.range),travel)));
      }
      return;
    }
    if(d<=stats.range&&unit.attackCooldown<=0){
      hits.push({target,damage:stats.attack});
      unit.attackCooldown=stats.interval;
    }
  }

  step(dt:number){
    if(this.result||dt<=0)return;
    const previous=this.elapsed;
    this.elapsed+=dt;
    while(this.nextWave<=this.elapsed+1e-8){
      if(this.nextWave>=previous-1e-8)this.spawnWave();
      this.nextWave+=BATTLEFIELD.waveInterval;
    }

    for(const unit of this.units){
      unit.attackCooldown=Math.max(0,unit.attackCooldown-dt);
      tickStatus(unit,dt);
      unit.revealed=Math.max(0,unit.revealed-dt);
      unit.alert=Math.max(0,unit.alert-dt);
    }

    this.updateProtection();
    const hits:{target:BattlefieldUnit;damage:number}[]=[];
    for(const unit of this.units){
      if(!unit.alive)continue;
      if(unit.kind==='building')this.stepTower(unit,hits);
      else this.stepMinion(unit,dt,hits);
    }

    for(const hit of hits)damageTarget(hit.target,hit.damage,'physical','basic');
    this.updateProtection();

    const blue=this.structure('blue','nexus').alive;
    const red=this.structure('red','nexus').alive;
    if(!blue||!red){
      this.result=!blue&&!red?'draw':red?'defeat':'victory';
      return;
    }

    for(let index=this.units.length-1;index>=0;index--){
      const unit=this.units[index];
      if(unit.kind==='minion'&&!unit.alive)this.units.splice(index,1);
    }
  }
}
