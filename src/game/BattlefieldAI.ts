import type { Combat } from './combat.ts';
import type { Target } from './targets.ts';
import type { Point } from './config.ts';
import { distance } from './config.ts';
import {
  BATTLEFIELD,
  BATTLEFIELD_ROLE_BY_CHAMPION,
  battlefieldFountain,
} from './BattlefieldMatch.ts';
import type {
  BattlefieldMatch,
  BattlefieldRole,
  BattlefieldTeam,
  BattlefieldUnit,
} from './BattlefieldMatch.ts';
import { BATTLEFIELD_NAVIGATION } from './navigation.ts';
import type { LaneId } from './navigation.ts';
import { chooseJungleCamp, JUNGLE_AI_RULES } from './JunglePlanning.ts';

export const BATTLEFIELD_AI_RULES={
  interval:.3,
  engage:350,
  retreatHP:.3,
  potionHP:.65,
  recoverHP:.9,
  recoverMana:.6,
  safeRecall:380,
  recallQuiet:2,
  towerMargin:55,
  start:10,
  patrolReach:65,
} as const;

export type BattlefieldAIState='waiting'|'advance'|'fight'|'patrol'|'camp-approach'|'camp-fight'|'retreat'|'recall'|'recover'|'dead';

const LANE_ROLES:readonly LaneId[]=['top','mid','bottom'];
const PATROL:Record<BattlefieldTeam,readonly string[]>={
  blue:['blue-jungle-top','river-north','blue-jungle-bottom','river-south'],
  red:['red-jungle-bottom','river-south','red-jungle-top','river-north'],
};

export class BattlefieldAI {
  state:BattlefieldAIState='waiting';
  private remaining=0;
  private recovering=false;
  private patrolIndex=0;
  private selectedCampId:string|null=null;
  readonly actor:Combat;
  readonly role:BattlefieldRole;
  private readonly match:BattlefieldMatch;
  private readonly index:number;

  constructor(match:BattlefieldMatch,actor:Combat,index:number){
    this.match=match;
    this.actor=actor;
    this.index=index;
    this.role=BATTLEFIELD_ROLE_BY_CHAMPION[actor.visualId as keyof typeof BATTLEFIELD_ROLE_BY_CHAMPION];
  }

  step(dt:number){
    this.remaining-=dt;
    if(this.remaining>0)return;
    this.remaining=BATTLEFIELD_AI_RULES.interval;

    const c=this.actor,m=this.match,team=m.teamOf(c);
    if(!c.alive){
      this.state='dead';
      this.recovering=true;
      this.shop();
      return;
    }
    if(!c.canAct||c.dash||c.abilities.pull)return;

    const nearby=c.enemies.filter(target=>
      target.kind!=='monster'&&target.alive&&!target.protected&&c.canSee(target)&&
      distance(c.hero,target)<=BATTLEFIELD_AI_RULES.safeRecall
    );
    const threats=nearby.filter(target=>target.kind!=='building'||this.attackTower(target)!==null);
    const hp=c.hero.hp/c.hero.maxHp;
    const mana=c.maxMana?c.hero.mana/c.maxMana:1;

    if(hp<BATTLEFIELD_AI_RULES.potionHP)c.usePotion();
    if(hp<BATTLEFIELD_AI_RULES.retreatHP||(c.maxMana>0&&mana<.12))this.recovering=true;

    if(this.recovering){
      const fountain=battlefieldFountain(team);
      if(distance(c.hero,fountain)<70){
        this.state='recover';
        this.shop();
        if(hp>=BATTLEFIELD_AI_RULES.recoverHP&&mana>=BATTLEFIELD_AI_RULES.recoverMana)this.recovering=false;
        else {
          this.move(fountain);
          return;
        }
      }else{
        if(!threats.length&&c.elapsed-c.lastCombat>=BATTLEFIELD_AI_RULES.recallQuiet){
          this.state='recall';
          if(c.command.kind!=='recall')c.recall();
          return;
        }
        this.state='retreat';
        this.move(fountain);
        return;
      }
    }

    if(m.elapsed<BATTLEFIELD_AI_RULES.start){
      this.state='waiting';
      return;
    }

    const dangerous=this.dangerousTowerAt(c.hero,team);
    if(dangerous){
      this.state='retreat';
      if(this.role==='jungle'){
        this.move(battlefieldFountain(team));
      }else{
        const progress=m.laneProgress(team,this.role,dangerous);
        this.move(m.lanePoint(team,this.role,Math.max(0,progress-BATTLEFIELD.structures[dangerous.role as 'outer'|'inner'].range-BATTLEFIELD_AI_RULES.towerMargin-25)));
      }
      return;
    }

    const local=c.enemies.filter(target=>
      target.alive&&!target.protected&&target.kind!=='building'&&target.kind!=='monster'&&c.canSee(target)&&
      distance(c.hero,target)<=BATTLEFIELD_AI_RULES.engage&&
      !this.dangerousTowerAt(target,team)
    );
    const hostileHeroes=local.filter(target=>target.kind==='champion');
    const allies=m.teamMembers(team).filter(actor=>actor.alive&&distance(actor.hero,c.hero)<=BATTLEFIELD_AI_RULES.engage);
    if(hostileHeroes.length>allies.length+1){
      this.state='retreat';
      if(this.role==='jungle')this.move(this.jungleRetreatPoint(team));
      else this.move(m.laneAdvance(team,this.role,c.hero,-180,false));
      return;
    }

    local.sort((a,b)=>Number(b.kind==='champion')-Number(a.kind==='champion')||distance(c.hero,a)-distance(c.hero,b));
    const target=local[0];
    if(target){
      this.state='fight';
      this.attack(target);
      this.skills(target);
      return;
    }

    if(this.role==='jungle'){
      this.stepJungle(team);
      return;
    }

    this.stepLane(team,this.role);
  }

  private stepLane(team:BattlefieldTeam,lane:LaneId){
    const c=this.actor,m=this.match;
    const enemyTeam:BattlefieldTeam=team==='blue'?'red':'blue';
    const escort=m.minions(team,lane).filter(unit=>unit.alive);
    const front=escort.length
      ? Math.max(...escort.map(unit=>m.laneProgress(team,lane,unit)))
      : 110;
    let progress=Math.max(0,front-(c.stats.range>100?95:35));

    const tower=this.nextAttackTower(enemyTeam,lane);
    if(tower&&!m.supported(tower,team)){
      const towerProgress=m.laneProgress(team,lane,tower);
      const range=BATTLEFIELD.structures[tower.role as 'outer'|'inner'].range;
      progress=Math.min(progress,towerProgress-range-BATTLEFIELD_AI_RULES.towerMargin-20);
    }

    const building=this.objective(enemyTeam,lane);
    if(building&&m.supported(building,team)&&distance(c.hero,building)<=BATTLEFIELD_AI_RULES.engage){
      this.state='fight';
      this.attack(building);
      return;
    }

    this.state='advance';
    const lateral=(this.index%2?1:-1)*(25+Math.floor(this.index/2)*28);
    const goal=m.lanePoint(team,lane,Math.max(0,progress),team==='blue'?lateral:-lateral);
    if(distance(c.hero,goal)>20&&(c.command.kind!=='attackMove'||distance(c.command.point,goal)>45))c.attackMove(goal);
  }

  private stepJungle(team:BattlefieldTeam){
    const c=this.actor;
    const plan=chooseJungleCamp(c.hero,team,this.match.jungle.camps,this.selectedCampId);
    if(plan){
      const camp=plan.camp;
      this.selectedCampId=camp.id;
      // Enter combat only after actually seeing the monster and arriving
      // close to its spawn. Attack() then runs the existing Combat target,
      // skill, aggro, loot and buff systems without a jungle-specific hit path.
      if(c.canSee(camp)&&distance(c.hero,camp)<=JUNGLE_AI_RULES.attackInitiateRange){
        this.state='camp-fight';
        this.attack(camp);
        return;
      }
      const nextNodeId=plan.pathIds.length>1?plan.pathIds[1]:camp.definition.nodeId;
      this.state='camp-approach';
      this.move(BATTLEFIELD_NAVIGATION.node(nextNodeId).point);
      return;
    }
    this.selectedCampId=null;
    const route=PATROL[team];
    let targetId=route[this.patrolIndex%route.length];
    let target=BATTLEFIELD_NAVIGATION.node(targetId);
    if(distance(c.hero,target.point)<BATTLEFIELD_AI_RULES.patrolReach){
      this.patrolIndex=(this.patrolIndex+1)%route.length;
      targetId=route[this.patrolIndex];
      target=BATTLEFIELD_NAVIGATION.node(targetId);
    }

    const current=BATTLEFIELD_NAVIGATION.nearest(c.hero);
    const path=current?BATTLEFIELD_NAVIGATION.shortestPathIds(current.id,targetId):[];
    const nextId=path.length>1?path[1]:targetId;
    const goal=BATTLEFIELD_NAVIGATION.node(nextId).point;
    this.state='patrol';
    this.move(goal);
  }

  private jungleRetreatPoint(team:BattlefieldTeam){
    return BATTLEFIELD_NAVIGATION.node(team==='blue'?'blue-jungle-bottom':'red-jungle-top').point;
  }

  private nextAttackTower(team:BattlefieldTeam,lane:LaneId){
    const outer=this.match.structure(team,'outer',lane);
    if(outer.alive)return outer;
    const inner=this.match.structure(team,'inner',lane);
    return inner.alive?inner:null;
  }

  private objective(team:BattlefieldTeam,lane:LaneId){
    for(const role of ['outer','inner','inhibitor'] as const){
      const structure=this.match.structure(team,role,lane);
      if(structure.alive&&!structure.protected)return structure;
    }
    const nexus=this.match.structure(team,'nexus');
    return nexus.alive&&!nexus.protected?nexus:null;
  }

  private dangerousTowerAt(point:Point,attacker:BattlefieldTeam){
    const defender:BattlefieldTeam=attacker==='blue'?'red':'blue';
    return this.match.structures(defender)
      .filter((unit):unit is BattlefieldUnit&{role:'outer'|'inner'}=>
        unit.alive&&(unit.role==='outer'||unit.role==='inner')&&!this.match.supported(unit,attacker)
      )
      .find(unit=>distance(point,unit)<=BATTLEFIELD.structures[unit.role].range+BATTLEFIELD_AI_RULES.towerMargin)??null;
  }

  private attackTower(target:Target){
    const unit=this.match.units.find(unit=>unit===target);
    return unit&&unit.kind==='building'&&(unit.role==='outer'||unit.role==='inner')?unit:null;
  }

  private move(point:Point){
    const c=this.actor;
    if(c.command.kind!=='move'||distance(c.command.point,point)>20)c.move(point);
  }

  private attack(target:Target){
    const c=this.actor;
    if(c.command.kind!=='attack'||c.command.targetId!==target.id||c.command.generation!==target.generation)c.attack(target.id);
  }

  private shop(){
    const c=this.actor;
    const next=c.equipment.armor<=c.equipment.weapon?'armor':'weapon';
    if(!this.match.purchase(c,next)&&!c.equipment.potion)this.match.purchase(c,'health');
  }

  private skills(target:Target){
    const c=this.actor,d=distance(c.hero,target),kit=c.profile.kit;
    const manual=c.abilities.presentation('manual'),ultimate=c.abilities.presentation('ultimate');
    if(target.kind==='champion'&&d<=Math.min(450,ultimate.range)&&c.abilities.canCast('ultimate')){
      if(c.castSkill('ultimate',target))return;
    }
    if(!c.abilities.canCast('manual')||d>manual.range)return;
    if(kit==='flame'||kit==='frost'||((kit==='fury'||kit==='curse')&&d>c.stats.range+35))c.castSkill('manual',target);
  }
}
