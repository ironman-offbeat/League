import type { Point } from './config.ts';
import { BATTLEFIELD_NAVIGATION } from './navigation.ts';
import type { NavigationTeam } from './navigation.ts';

export type JungleBuff='red'|'blue';
export type JungleCampDefinition={
  id:string;
  side:NavigationTeam;
  buff:JungleBuff;
  nodeId:string;
  firstSpawn:number;
  respawn:number;
};

export const JUNGLE={
  firstSpawn:15,
  respawn:45,
  camps:[
    {id:'blue-blue',side:'blue',buff:'blue',nodeId:'blue-jungle-top',firstSpawn:15,respawn:45},
    {id:'blue-red',side:'blue',buff:'red',nodeId:'blue-jungle-bottom',firstSpawn:15,respawn:45},
    {id:'red-red',side:'red',buff:'red',nodeId:'red-jungle-top',firstSpawn:15,respawn:45},
    {id:'red-blue',side:'red',buff:'blue',nodeId:'red-jungle-bottom',firstSpawn:15,respawn:45},
  ] as const satisfies readonly JungleCampDefinition[],
} as const;

export class JungleCamp {
  readonly definition:JungleCampDefinition;
  readonly point:Point;
  alive=false;
  generation=0;
  nextSpawnAt:number|null;
  lastDefeatedAt:number|null=null;

  constructor(definition:JungleCampDefinition){
    this.definition={...definition};
    this.point=BATTLEFIELD_NAVIGATION.node(definition.nodeId).point;
    this.nextSpawnAt=definition.firstSpawn;
  }

  get id(){return this.definition.id;}
  get side(){return this.definition.side;}
  get buff(){return this.definition.buff;}

  step(time:number){
    if(!Number.isFinite(time)||time<0)throw new Error('jungle time must be finite and nonnegative');
    if(this.alive||this.nextSpawnAt===null||time+1e-8<this.nextSpawnAt)return false;
    this.alive=true;
    if(this.lastDefeatedAt!==null)this.generation++;
    this.nextSpawnAt=null;
    return true;
  }

  defeat(time:number){
    if(!Number.isFinite(time)||time<0)throw new Error('jungle time must be finite and nonnegative');
    if(!this.alive)return false;
    this.alive=false;
    this.lastDefeatedAt=time;
    this.nextSpawnAt=time+this.definition.respawn;
    return true;
  }

  respawnRemaining(time:number){
    if(this.alive||this.nextSpawnAt===null)return 0;
    return Math.max(0,this.nextSpawnAt-time);
  }
}

export class JungleState {
  readonly camps:JungleCamp[];

  constructor(definitions:readonly JungleCampDefinition[]=JUNGLE.camps){
    const ids=new Set<string>();
    for(const definition of definitions){
      if(ids.has(definition.id))throw new Error(`duplicate jungle camp: ${definition.id}`);
      if(definition.firstSpawn<0||definition.respawn<=0)throw new Error('jungle spawn timings must be valid');
      ids.add(definition.id);
    }
    this.camps=definitions.map(definition=>new JungleCamp(definition));
  }

  camp(id:string){
    const camp=this.camps.find(value=>value.id===id);
    if(!camp)throw new Error(`unknown jungle camp: ${id}`);
    return camp;
  }

  step(time:number){
    for(const camp of this.camps)camp.step(time);
  }
}
