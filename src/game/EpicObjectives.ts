import type { Point } from './config.ts';
import type { Target } from './targets.ts';
import { freshStatus, mitigate, tickStatus } from './effects.ts';
import type { DamageType } from './effects.ts';
import { BATTLEFIELD_NAVIGATION } from './navigation.ts';

export type EpicObjectiveKind='dragon'|'baron';
export type EpicObjectiveDefinition={
  id:EpicObjectiveKind;
  nodeId:string;
  firstSpawn:number;
  respawn:number;
};

// Prototype spawn cadence. Baron entering the battlefield at 8 minutes is
// specified by design; the other timings are tunable preliminary values.
export const EPIC_OBJECTIVES={
  dragon:{id:'dragon',nodeId:'river-south',firstSpawn:120,respawn:180},
  baron:{id:'baron',nodeId:'river-north',firstSpawn:480,respawn:300},
} as const satisfies Record<EpicObjectiveKind,EpicObjectiveDefinition>;

export const EPIC_COMBAT={
  dragon:{hp:2500,armor:35,magicResist:30},
  baron:{hp:6500,armor:55,magicResist:45},
} as const;

export class EpicObjective implements Target {
  readonly definition:EpicObjectiveDefinition;
  readonly id:EpicObjectiveKind;
  readonly kind='monster' as const;
  readonly objectiveKind:EpicObjectiveKind;
  readonly point:Point;
  x:number;
  y:number;
  hp:number;
  maxHp:number;
  armor:number;
  magicResist:number;
  visible=true;
  revealed=0;
  alert=0;
  aggro:string|null=null;
  attackCooldown=0;
  stunned=0;
  rooted=0;
  airborne=0;
  slow=0;
  slowRemaining=0;
  marked=0;
  respawn=0;
  lastDamager:string|null=null;
  onDeath?:(target:Target)=>void;
  private time=0;
  alive=false;
  generation=0;
  spawnedAt:number|null=null;
  lastDefeatedAt:number|null=null;
  nextSpawnAt:number|null;
  onSpawn?:(objective:EpicObjective)=>void;
  onDefeat?:(objective:EpicObjective)=>void;

  constructor(definition:EpicObjectiveDefinition){
    if(!Number.isFinite(definition.firstSpawn)||definition.firstSpawn<0||
       !Number.isFinite(definition.respawn)||definition.respawn<=0){
      throw new Error('epic objective spawn timings must be finite and valid');
    }
    this.definition={...definition};
    this.id=definition.id;
    this.objectiveKind=definition.id;
    this.point=BATTLEFIELD_NAVIGATION.node(definition.nodeId).point;
    this.x=this.point.x;
    this.y=this.point.y;
    const stats=EPIC_COMBAT[definition.id];
    this.hp=stats.hp;this.maxHp=stats.hp;
    this.armor=stats.armor;this.magicResist=stats.magicResist;
    this.nextSpawnAt=definition.firstSpawn;
  }

  private resetCombat(){
    this.x=this.point.x;this.y=this.point.y;this.hp=this.maxHp;
    this.lastDamager=null;
    Object.assign(this,freshStatus(),{revealed:0,alert:0,aggro:null,attackCooldown:0});
  }

  receiveDamage(raw:number,type:DamageType='physical'){
    if(!this.alive)return 0;
    if(raw>0&&this.aggro)this.lastDamager=this.aggro;
    const lost=Math.min(this.hp,mitigate(raw,type==='physical'?this.armor:this.magicResist));
    this.hp-=lost;
    if(this.hp<=0)this.defeat(this.time);
    return lost;
  }

  step(time:number,dt=0){
    if(!Number.isFinite(time)||time<0)throw new Error('epic objective time must be finite and nonnegative');
    this.time=time;
    if(this.alive){
      tickStatus(this,dt);
      this.revealed=Math.max(0,this.revealed-dt);
      this.alert=Math.max(0,this.alert-dt);
      this.attackCooldown=Math.max(0,this.attackCooldown-dt);
      return false;
    }
    if(this.nextSpawnAt===null||time+1e-8<this.nextSpawnAt)return false;
    if(this.lastDefeatedAt!==null)this.generation++;
    this.alive=true;
    this.resetCombat();
    this.respawn=0;
    this.spawnedAt=this.nextSpawnAt;
    this.nextSpawnAt=null;
    this.onSpawn?.(this);
    return true;
  }

  defeat(time:number){
    if(!Number.isFinite(time)||time<0)throw new Error('epic objective time must be finite and nonnegative');
    if(!this.alive||this.spawnedAt===null||time<this.spawnedAt)return false;
    this.alive=false;
    this.hp=0;
    this.lastDefeatedAt=time;
    this.nextSpawnAt=time+this.definition.respawn;
    this.respawn=this.definition.respawn;
    Object.assign(this,freshStatus(),{aggro:null,alert:0,attackCooldown:0});
    this.onDefeat?.(this);
    this.onDeath?.(this);
    return true;
  }

  spawnRemaining(time:number){
    if(!Number.isFinite(time)||time<0)throw new Error('epic objective time must be finite and nonnegative');
    return this.alive||this.nextSpawnAt===null?0:Math.max(0,this.nextSpawnAt-time);
  }
}

export class EpicObjectiveState {
  readonly objectives:EpicObjective[];

  constructor(definitions:readonly EpicObjectiveDefinition[]=Object.values(EPIC_OBJECTIVES)){
    const ids=new Set<EpicObjectiveKind>(),nodes=new Set<string>();
    for(const definition of definitions){
      if(ids.has(definition.id))throw new Error(`duplicate epic objective: ${definition.id}`);
      if(nodes.has(definition.nodeId))throw new Error(`overlapping epic objective node: ${definition.nodeId}`);
      ids.add(definition.id);
      nodes.add(definition.nodeId);
    }
    this.objectives=definitions.map(definition=>new EpicObjective(definition));
  }

  objective(id:EpicObjectiveKind){
    const found=this.objectives.find(objective=>objective.id===id);
    if(!found)throw new Error(`unknown epic objective: ${id}`);
    return found;
  }

  step(time:number,dt=0){
    for(const objective of this.objectives)objective.step(time,dt);
  }
}
