import { mitigate } from './effects.ts';
import {
  battlefieldLaneRoute,
  pointAtRouteDistance,
  routeLength,
} from './navigation.ts';
import type { LaneId, NavigationTeam } from './navigation.ts';
import type { Point } from './config.ts';

export type BattlefieldStructureRole='outer'|'inner'|'inhibitor'|'nexus';
export type BattlefieldMinionRole='melee'|'ranged'|'siege'|'super';

export type BattlefieldStructure=Point & {
  id:string;
  team:NavigationTeam;
  lane:LaneId|null;
  role:BattlefieldStructureRole;
  hp:number;
  maxHp:number;
  armor:number;
  attack:number;
  alive:boolean;
};

export type WaveMinion=Point & {
  id:string;
  team:NavigationTeam;
  lane:LaneId;
  role:BattlefieldMinionRole;
  route:Point[];
};

export type BattlefieldWave={
  number:number;
  spawnedAt:number;
  minions:WaveMinion[];
};

export const BATTLEFIELD={
  firstWave:10,
  waveInterval:20,
  backdoorScale:.25,
  structureFractions:{
    inhibitor:.09,
    inner:.19,
    outer:.32,
  },
  structures:{
    outer:{hp:3200,armor:40,attack:150},
    inner:{hp:4000,armor:50,attack:190},
    inhibitor:{hp:2200,armor:30,attack:0},
    nexus:{hp:5500,armor:40,attack:0},
  },
} as const;

const LANES:readonly LaneId[]=['top','mid','bottom'];
const TEAMS:readonly NavigationTeam[]=['blue','red'];

const clonePoint=(point:Point):Point=>({x:point.x,y:point.y});

export class BattlefieldState {
  readonly structures:BattlefieldStructure[]=[];
  elapsed=0;
  wave=0;
  nextWave=BATTLEFIELD.firstWave;
  private serial=0;

  constructor(){
    for(const team of TEAMS){
      const base=battlefieldLaneRoute('mid',team)[0];
      this.structures.push(this.createStructure(team,null,'nexus',base));
      for(const lane of LANES){
        const route=battlefieldLaneRoute(lane,team);
        const length=routeLength(route);
        for(const role of ['inhibitor','inner','outer'] as const){
          const point=pointAtRouteDistance(route,length*BATTLEFIELD.structureFractions[role]);
          this.structures.push(this.createStructure(team,lane,role,point));
        }
      }
    }
  }

  private createStructure(team:NavigationTeam,lane:LaneId|null,role:BattlefieldStructureRole,point:Point):BattlefieldStructure{
    const stats=BATTLEFIELD.structures[role];
    return {
      id:role==='nexus'?`${team}-nexus`:`${team}-${lane}-${role}`,
      team,lane,role,x:point.x,y:point.y,
      hp:stats.hp,maxHp:stats.hp,armor:stats.armor,attack:stats.attack,alive:true,
    };
  }

  structure(team:NavigationTeam,lane:LaneId,role:Exclude<BattlefieldStructureRole,'nexus'>){
    const structure=this.structures.find(item=>item.team===team&&item.lane===lane&&item.role===role);
    if(!structure)throw new Error(`missing structure: ${team} ${lane} ${role}`);
    return structure;
  }

  nexus(team:NavigationTeam){
    const structure=this.structures.find(item=>item.team===team&&item.role==='nexus');
    if(!structure)throw new Error(`missing nexus: ${team}`);
    return structure;
  }

  protected(structure:BattlefieldStructure){
    if(!structure.alive)return false;
    if(structure.role==='outer')return false;
    if(structure.role==='inner')return this.structure(structure.team,structure.lane!,'outer').alive;
    if(structure.role==='inhibitor')return this.structure(structure.team,structure.lane!,'inner').alive;
    return LANES.every(lane=>this.structure(structure.team,lane,'inhibitor').alive);
  }

  damageStructure(structure:BattlefieldStructure,raw:number,escorted:boolean){
    if(!Number.isFinite(raw)||raw<=0||!structure.alive||this.protected(structure))return 0;
    const scaled=raw*(escorted?1:BATTLEFIELD.backdoorScale);
    const damage=mitigate(scaled,structure.armor);
    structure.hp=Math.max(0,structure.hp-damage);
    if(structure.hp<=0)structure.alive=false;
    return damage;
  }

  inhibitorDown(team:NavigationTeam,lane:LaneId){
    return !this.structure(team,lane,'inhibitor').alive;
  }

  step(dt:number):BattlefieldWave[]{
    if(!Number.isFinite(dt)||dt<=0)return [];
    const end=this.elapsed+dt;
    const waves:BattlefieldWave[]=[];
    while(this.nextWave<=end+1e-8){
      this.elapsed=this.nextWave;
      waves.push(this.spawnWave());
      this.nextWave+=BATTLEFIELD.waveInterval;
    }
    this.elapsed=end;
    return waves;
  }

  spawnWave():BattlefieldWave{
    this.wave++;
    const minions:WaveMinion[]=[];
    for(const team of TEAMS)for(const lane of LANES){
      const roles:BattlefieldMinionRole[]=['melee','melee','melee','ranged','ranged'];
      if(this.wave%3===0)roles.push('siege');
      const enemy=team==='blue'?'red':'blue';
      if(this.inhibitorDown(enemy,lane))roles.push('super');
      const route=battlefieldLaneRoute(lane,team);
      roles.forEach((role,index)=>{
        const row=Math.floor(index/3);
        const lateral=(index%3-1)*24;
        const point=pointAtRouteDistance(route,32+row*28,lateral);
        minions.push({
          id:`${team}-${lane}-${role}-${this.wave}-${++this.serial}`,
          team,lane,role,x:point.x,y:point.y,
          route:route.map(clonePoint),
        });
      });
    }
    return {number:this.wave,spawnedAt:this.elapsed,minions};
  }

  reset(){
    this.elapsed=0;this.wave=0;this.nextWave=BATTLEFIELD.firstWave;this.serial=0;
    for(const structure of this.structures){
      const stats=BATTLEFIELD.structures[structure.role];
      structure.hp=stats.hp;structure.maxHp=stats.hp;structure.alive=true;
    }
  }
}
