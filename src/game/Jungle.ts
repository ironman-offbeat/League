import { distance } from './config.ts';
import type { Point } from './config.ts';
import { freshStatus, mitigate, tickStatus, towards } from './effects.ts';
import type { DamageType } from './effects.ts';
import { BATTLEFIELD_NAVIGATION } from './navigation.ts';
import type { NavigationTeam } from './navigation.ts';
import type { Target } from './targets.ts';

export type JungleBuff='red'|'blue';
export type JungleCampState='dormant'|'idle'|'engaged'|'returning';
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
  monster:{hp:1400,armor:20,magicResist:20,attack:58,interval:1.2,range:48,speed:105,returnSpeed:145,leash:220,resetReach:5},
  camps:[
    {id:'blue-blue',side:'blue',buff:'blue',nodeId:'blue-jungle-top',firstSpawn:15,respawn:45},
    {id:'blue-red',side:'blue',buff:'red',nodeId:'blue-jungle-bottom',firstSpawn:15,respawn:45},
    {id:'red-red',side:'red',buff:'red',nodeId:'red-jungle-top',firstSpawn:15,respawn:45},
    {id:'red-blue',side:'red',buff:'blue',nodeId:'red-jungle-bottom',firstSpawn:15,respawn:45},
  ] as const satisfies readonly JungleCampDefinition[],
} as const;

export class JungleCamp implements Target {
  readonly definition:JungleCampDefinition;
  readonly point:Point;
  readonly kind='monster' as const;
  x:number;
  y:number;
  hp:number=JUNGLE.monster.hp;
  maxHp:number=JUNGLE.monster.hp;
  armor:number=JUNGLE.monster.armor;
  magicResist:number=JUNGLE.monster.magicResist;
  alive=false;
  visible=true;
  protected=false;
  state:JungleCampState='dormant';
  respawn=0;
  generation=0;
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
  nextSpawnAt:number|null;
  lastDefeatedAt:number|null=null;
  private time=0;

  constructor(definition:JungleCampDefinition){
    this.definition={...definition};
    this.point=BATTLEFIELD_NAVIGATION.node(definition.nodeId).point;
    this.x=this.point.x;
    this.y=this.point.y;
    this.nextSpawnAt=definition.firstSpawn;
  }

  get id(){return this.definition.id;}
  get side(){return this.definition.side;}
  get buff(){return this.definition.buff;}

  step(time:number,dt=0){
    if(!Number.isFinite(time)||time<0||!Number.isFinite(dt)||dt<0)throw new Error('jungle time must be finite and nonnegative');
    this.time=time;
    if(this.alive){
      tickStatus(this,dt);
      this.revealed=Math.max(0,this.revealed-dt);
      this.alert=Math.max(0,this.alert-dt);
      this.attackCooldown=Math.max(0,this.attackCooldown-dt);
      this.respawn=0;
      if(this.aggro&&this.state==='idle')this.state='engaged';
      return false;
    }
    if(this.nextSpawnAt===null||time+1e-8<this.nextSpawnAt){
      this.respawn=this.respawnRemaining(time);
      return false;
    }
    this.alive=true;
    this.hp=this.maxHp;
    this.x=this.point.x;this.y=this.point.y;
    this.state='idle';this.protected=false;
    Object.assign(this,freshStatus(),{revealed:0,alert:0,aggro:null,attackCooldown:0,respawn:0});
    if(this.lastDefeatedAt!==null)this.generation++;
    this.nextSpawnAt=null;
    return true;
  }

  receiveDamage(raw:number,type:DamageType='physical'){
    if(!this.alive||this.protected)return 0;
    if(this.aggro)this.state='engaged';
    const damage=mitigate(raw,type==='physical'?this.armor:this.magicResist);
    const lost=Math.min(this.hp,damage);
    this.hp-=lost;
    if(this.hp<=0)this.defeat(this.time);
    return lost;
  }

  defeat(time:number){
    if(!Number.isFinite(time)||time<0)throw new Error('jungle time must be finite and nonnegative');
    if(!this.alive)return false;
    this.time=time;
    this.alive=false;
    this.hp=0;
    this.state='dormant';this.protected=false;
    this.lastDefeatedAt=time;
    this.nextSpawnAt=time+this.definition.respawn;
    this.respawn=this.definition.respawn;
    Object.assign(this,freshStatus(),{revealed:0,alert:0,aggro:null,attackCooldown:0});
    return true;
  }

  beginReturn(){
    if(!this.alive||this.state==='returning')return false;
    this.state='returning';this.protected=true;
    Object.assign(this,freshStatus(),{revealed:0,alert:0,aggro:null,attackCooldown:0});
    return true;
  }

  stepReturn(dt:number){
    if(!this.alive||this.state!=='returning'||dt<=0)return false;
    const d=distance(this,this.point);
    if(d<=JUNGLE.monster.resetReach){
      this.resetEncounter();
      return true;
    }
    const next=towards(this,this.point,Math.min(d,JUNGLE.monster.returnSpeed*dt));
    this.x=next.x;this.y=next.y;
    if(distance(this,this.point)<=JUNGLE.monster.resetReach){
      this.resetEncounter();
      return true;
    }
    return false;
  }

  resetEncounter(){
    if(!this.alive)return false;
    this.x=this.point.x;this.y=this.point.y;
    this.hp=this.maxHp;this.state='idle';this.protected=false;
    Object.assign(this,freshStatus(),{revealed:0,alert:0,aggro:null,attackCooldown:0});
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

  step(time:number,dt=0){
    for(const camp of this.camps)camp.step(time,dt);
  }
}
