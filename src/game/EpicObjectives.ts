import type { Point } from './config.ts';
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

export class EpicObjective {
  readonly definition:EpicObjectiveDefinition;
  readonly id:EpicObjectiveKind;
  readonly kind:EpicObjectiveKind;
  readonly point:Point;
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
    this.kind=definition.id;
    this.point=BATTLEFIELD_NAVIGATION.node(definition.nodeId).point;
    this.nextSpawnAt=definition.firstSpawn;
  }

  step(time:number){
    if(!Number.isFinite(time)||time<0)throw new Error('epic objective time must be finite and nonnegative');
    if(this.alive||this.nextSpawnAt===null||time+1e-8<this.nextSpawnAt)return false;
    if(this.lastDefeatedAt!==null)this.generation++;
    this.alive=true;
    this.spawnedAt=this.nextSpawnAt;
    this.nextSpawnAt=null;
    this.onSpawn?.(this);
    return true;
  }

  defeat(time:number){
    if(!Number.isFinite(time)||time<0)throw new Error('epic objective time must be finite and nonnegative');
    if(!this.alive||this.spawnedAt===null||time<this.spawnedAt)return false;
    this.alive=false;
    this.lastDefeatedAt=time;
    this.nextSpawnAt=time+this.definition.respawn;
    this.onDefeat?.(this);
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

  step(time:number){
    for(const objective of this.objectives)objective.step(time);
  }
}
