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
import { chooseJungleCampForBuffs, chooseJungleAssist, chooseJungleInvade, jungleSafeRoute, JUNGLE_AI_RULES, JUNGLE_INVADE_RULES } from './JunglePlanning.ts';
import type { JungleCampPlan } from './JunglePlanning.ts';
import type { JungleLaneSignal } from './JunglePlanning.ts';
import { chooseEpicPlan, epicScoutRoute, EPIC_AI_RULES } from './EpicPlanning.ts';
import type { EpicPlan } from './EpicPlanning.ts';
import { EPIC_OBJECTIVES } from './EpicObjectives.ts';
import type { EpicObjectiveKind } from './EpicObjectives.ts';

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
  jungleFinishCampHP:.36,
  jungleFinishMinimumHP:.1,
} as const;

export type BattlefieldAIState='waiting'|'advance'|'fight'|'patrol'|'river-patrol'|'lane-assist'|'camp-approach'|'camp-fight'|'invade-approach'|'invade-fight'|'invade-withdraw'|'epic-scout'|'epic-rally'|'epic-fight'|'epic-steal'|'epic-withdraw'|'retreat'|'recall'|'recover'|'dead';

const LANE_ROLES:readonly LaneId[]=['top','mid','bottom'];
const RIVER_PATROL:Record<BattlefieldTeam,readonly string[]>={
  blue:['river-north','river-south'],
  red:['river-south','river-north'],
};
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
  private invadedCampId:string|null=null;
  private invadeRetryAt=0;
  private invadeWithdrawing=false;
  private epicKind:EpicObjectiveKind|null=null;
  private scoutKind:EpicObjectiveKind|null=null;
  private epicRetryAt=0;
  private nextScoutAt:Record<EpicObjectiveKind,number>={
    dragon:EPIC_OBJECTIVES.dragon.firstSpawn,
    baron:EPIC_OBJECTIVES.baron.firstSpawn,
  };
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
    const finishableCamp=this.role==='jungle'&&!threats.length&&m.jungle.camps.some(camp=>
      camp.alive&&(camp.side===team||camp.id===this.invadedCampId)&&camp.aggro===c.profile.id&&
      camp.hp/camp.maxHp<=BATTLEFIELD_AI_RULES.jungleFinishCampHP&&
      hp>BATTLEFIELD_AI_RULES.jungleFinishMinimumHP&&
      distance(c.hero,camp)<=BATTLEFIELD_AI_RULES.engage
    );
    // Avoid abandoning an almost-finished camp at the ordinary lane retreat
    // threshold, but never override critical-health or nearby PvP danger.
    if((hp<BATTLEFIELD_AI_RULES.retreatHP&&!finishableCamp)||(c.maxMana>0&&mana<.12))this.recovering=true;

    if(this.recovering){
      if(this.epicKind){
        this.epicKind=null;
        this.epicRetryAt=Math.max(this.epicRetryAt,m.elapsed+EPIC_AI_RULES.retryDelay);
      }
      this.scoutKind=null;
      if(this.role==='jungle'&&(this.invadedCampId||this.invadeWithdrawing)){
        this.invadedCampId=null;
        this.invadeWithdrawing=false;
        this.invadeRetryAt=Math.max(this.invadeRetryAt,m.elapsed+JUNGLE_INVADE_RULES.retryDelay);
      }
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
      if(this.epicKind){
        this.abandonEpic(team);
        return;
      }
      this.scoutKind=null;
      if(this.role==='jungle'&&this.invadedCampId){
        this.cancelInvasion(team);
        return;
      }
      this.state='retreat';
      if(this.role==='jungle'){
        this.move(battlefieldFountain(team));
      }else{
        const progress=m.laneProgress(team,this.role,dangerous);
        this.move(m.lanePoint(team,this.role,Math.max(0,progress-BATTLEFIELD.structures[dangerous.role as 'outer'|'inner'].range-BATTLEFIELD_AI_RULES.towerMargin-25)));
      }
      return;
    }

    // An invasion is aborted before PvP target selection when fresh team
    // vision or tower status reveals a dangerous route or contested camp.
    if(this.role==='jungle'&&this.invadedCampId){
      const plan=this.invasionPlan(team);
      if(!plan||plan.camp.id!==this.invadedCampId){
        this.cancelInvasion(team);
      }else{
        this.followInvasion(plan);
      }
      return;
    }
    if(this.role==='jungle'&&this.invadeWithdrawing&&this.stepInvasionWithdraw(team))return;

    const local=c.enemies.filter(target=>
      target.alive&&!target.protected&&target.kind!=='building'&&target.kind!=='monster'&&c.canSee(target)&&
      distance(c.hero,target)<=BATTLEFIELD_AI_RULES.engage&&
      !this.dangerousTowerAt(target,team)
    );
    const hostileHeroes=local.filter(target=>target.kind==='champion');
    const allies=m.teamMembers(team).filter(actor=>actor.alive&&distance(actor.hero,c.hero)<=BATTLEFIELD_AI_RULES.engage);
    if(hostileHeroes.length>allies.length+1){
      if(this.epicKind){
        this.abandonEpic(team);
        return;
      }
      this.state='retreat';
      if(this.role==='jungle')this.move(this.jungleRetreatPoint(team));
      else this.move(m.laneAdvance(team,this.role,c.hero,-180,false));
      return;
    }

    // Coordinate boss hunts BEFORE normal minion targeting, so an ongoing
    // Dragon/Baron attack cannot be interrupted by incidental lane waves.
    // Reevaluate with fresh team vision every decision tick.
    const epic=m.elapsed>=this.epicRetryAt?chooseEpicPlan({
      team,actor:c,allies:m.teamMembers(team),objectives:m.objectives.objectives,
      visibleEnemies:this.visibleEnemyHeroes(team),
      canSeeObjective:objective=>m.canSee(team,objective),
      safeFromTowers:point=>!this.dangerousTowerAt(point,team),
    }):null;
    if(this.epicKind){
      if(!epic||epic.objective.id!==this.epicKind){
        this.abandonEpic(team);
        return;
      }
      this.followEpic(epic);
      return;
    }
    // Avoid abandoning a half-cleared home camp for a routine boss hunt.
    const engagedHome=this.role==='jungle'&&m.jungle.camps.some(camp=>
      camp.id===this.selectedCampId&&camp.aggro===c.profile.id&&
      camp.alive&&camp.hp/camp.maxHp<.6
    );
    if(epic&&(!engagedHome||epic.mode==='steal')){
      if(this.role==='jungle'){
        this.selectedCampId=null;
        this.invadedCampId=null;
        this.invadeWithdrawing=false;
      }
      this.followEpic(epic);
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
    const c=this.actor,m=this.match;
    if(this.scoutKind&&this.stepEpicScout(team))return;
    const buffs={red:c.buffs.red,blue:c.buffs.blue};
    const plan=chooseJungleCampForBuffs(c.hero,team,m.jungle.camps,buffs,this.selectedCampId);
    const engaged=plan&&plan.camp.aggro===c.profile.id;
    const bothBuffs=buffs.red>JUNGLE_AI_RULES.buffRefreshWindow&&
      buffs.blue>JUNGLE_AI_RULES.buffRefreshWindow;
    const assist=this.chooseLaneAssist(team);
    // Finishing an engaged camp avoids resetting its entire HP. Otherwise,
    // urgent lane defense can interrupt farming, or buffs permit a gank.
    if(assist&&(!engaged&&(bothBuffs||!plan||
      assist.allyHealth<=JUNGLE_AI_RULES.urgentAllyHP))){
      this.selectedCampId=null;
      const next=assist.pathIds.length>1?
        BATTLEFIELD_NAVIGATION.node(assist.pathIds[1]).point:assist.ally;
      this.state='lane-assist';
      if(distance(c.hero,assist.ally)>JUNGLE_AI_RULES.assistJoinRange)this.move(next);
      else this.move(assist.ally);
      return;
    }

    if(plan){
      const camp=plan.camp;
      this.selectedCampId=camp.id;
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
    if(this.stepEpicScout(team))return;
    if(m.elapsed>=this.invadeRetryAt){
      const invasion=this.invasionPlan(team);
      if(invasion){
        this.invadedCampId=invasion.camp.id;
        this.followInvasion(invasion);
        return;
      }
    }
    // Before any camp appears, preserve the familiar home-side scouting loop.
    // Once the jungle cycle begins, use river-only patrol rather than camping
    // empty spawn locations while buffs are active or camps await respawn.
    const started=m.jungle.camps.some(camp=>camp.alive||camp.lastDefeatedAt!==null);
    this.stepJunglePatrol(team,started?'river-patrol':'patrol');
  }

  private visibleEnemyHeroes(team:BattlefieldTeam):Point[]{
    const enemyTeam:BattlefieldTeam=team==='blue'?'red':'blue';
    return this.match.teamMembers(enemyTeam).filter(actor=>{
      const target=this.match.championTargets.find(t=>t.id===actor.profile.id);
      return !!target&&this.match.canSee(team,target);
    }).map(actor=>({x:actor.hero.x,y:actor.hero.y}));
  }

  private followEpic(plan:EpicPlan){
    const c=this.actor,boss=plan.objective;
    this.epicKind=boss.objectiveKind;
    this.scoutKind=null;
    if(plan.ready<plan.minimum||distance(c.hero,boss)>EPIC_AI_RULES.attackRange){
      this.state='epic-rally';
      // Wait for the required group before striking; being in attack range
      // alone must not accidentally retain a prior monster attack order.
      if(plan.ready<plan.minimum&&distance(c.hero,boss)<=EPIC_AI_RULES.rallyRadius){
        if(c.command.kind!=='move'||distance(c.command.point,c.hero)>10)c.move({...c.hero});
        return;
      }
      const nextId=plan.pathIds.length>1?plan.pathIds[1]:null;
      this.move(nextId?BATTLEFIELD_NAVIGATION.node(nextId).point:boss.point);
      return;
    }
    this.state=plan.mode==='steal'?'epic-steal':'epic-fight';
    this.attack(boss);
    this.skills(boss);
  }

  private abandonEpic(team:BattlefieldTeam){
    const kind=this.epicKind;
    this.epicKind=null;
    this.scoutKind=null;
    this.epicRetryAt=Math.max(this.epicRetryAt,this.match.elapsed+EPIC_AI_RULES.retryDelay);
    if(kind)this.nextScoutAt[kind]=Math.max(this.nextScoutAt[kind],this.match.elapsed+EPIC_AI_RULES.scoutCooldown);
    const goalId=team==='blue'
      ?kind==='baron'?'blue-jungle-top':'blue-jungle-bottom'
      :kind==='baron'?'red-jungle-top':'red-jungle-bottom';
    // The return destination is a friendly jungle waypoint, not a boss.
    // Follow only a safe first segment, otherwise cancel the attack in place.
    const path=jungleSafeRoute(this.actor.hero,goalId,
      point=>!this.dangerousTowerAt(point,team));
    const next=path?.pathIds.length&&path.pathIds.length>1
      ?BATTLEFIELD_NAVIGATION.node(path.pathIds[1]).point
      :path?BATTLEFIELD_NAVIGATION.node(goalId).point:null;
    this.state='epic-withdraw';
    this.move(next??{...this.actor.hero});
  }

  private stepEpicScout(team:BattlefieldTeam):boolean{
    if(this.role!=='jungle')return false;
    const m=this.match,c=this.actor;
    const finish=(kind:EpicObjectiveKind)=>{
      this.scoutKind=null;
      this.nextScoutAt[kind]=m.elapsed+EPIC_AI_RULES.scoutCooldown;
    };
    if(this.scoutKind){
      const kind=this.scoutKind;
      if(m.pointVisible(team,m.objectives.objective(kind).point)){
        finish(kind);return false;
      }
    }else{
      const hp=c.hero.hp/c.hero.maxHp;
      const mana=c.maxMana?c.hero.mana/c.maxMana:1;
      if(hp<EPIC_AI_RULES.scoutHealth||mana<EPIC_AI_RULES.scoutMana)return false;
      const kind=(['baron','dragon'] as const).find(id=>
        m.elapsed>=EPIC_OBJECTIVES[id].firstSpawn&&
        m.elapsed>=this.nextScoutAt[id]&&
        !m.pointVisible(team,m.objectives.objective(id).point)
      );
      if(!kind)return false;
      this.scoutKind=kind;
    }
    const kind=this.scoutKind!;
    // Only public first-spawn timing and map visibility are used here. The
    // unseen boss's alive/dead state and respawn timestamp are never queried.
    const enemies=this.visibleEnemyHeroes(team);
    const route=epicScoutRoute(c.hero,kind,point=>
      !this.dangerousTowerAt(point,team)&&!enemies.some(enemy=>
        distance(point,enemy)<=EPIC_AI_RULES.enemyAvoidRadius
      )
    );
    if(!route){finish(kind);return false;}
    this.state='epic-scout';
    const next=route.pathIds.length>1
      ?BATTLEFIELD_NAVIGATION.node(route.pathIds[1]).point
      :BATTLEFIELD_NAVIGATION.node(EPIC_OBJECTIVES[kind].nodeId).point;
    this.move(next);
    return true;
  }

  private invasionPlan(team:BattlefieldTeam):JungleCampPlan|null{
    const c=this.actor,m=this.match,enemyTeam:BattlefieldTeam=team==='blue'?'red':'blue';
    const visible=m.teamMembers(enemyTeam).filter(actor=>{
      const target=m.championTargets.find(value=>value.id===actor.profile.id);
      return actor.alive&&!!target&&m.canSee(team,target);
    });
    return chooseJungleInvade({
      position:c.hero,team,actorId:c.profile.id,camps:m.jungle.camps,
      buffs:{red:c.buffs.red,blue:c.buffs.blue},
      healthRatio:c.hero.hp/c.hero.maxHp,
      manaRatio:c.maxMana?c.hero.mana/c.maxMana:1,
      continuing:this.invadedCampId!==null,preferredId:this.invadedCampId,
      visibleEnemyChampions:visible.map(actor=>actor.hero),
      canSeeCamp:camp=>m.canSee(team,camp),
      safeFromTowers:point=>!this.dangerousTowerAt(point,team),
    });
  }

  private followInvasion(plan:JungleCampPlan){
    const c=this.actor,camp=plan.camp;
    if(c.canSee(camp)&&distance(c.hero,camp)<=JUNGLE_AI_RULES.attackInitiateRange){
      this.state='invade-fight';
      this.attack(camp);
      return;
    }
    this.state='invade-approach';
    const nextId=plan.pathIds.length>1?plan.pathIds[1]:camp.definition.nodeId;
    this.move(BATTLEFIELD_NAVIGATION.node(nextId).point);
  }

  private cancelInvasion(team:BattlefieldTeam){
    this.invadedCampId=null;
    this.invadeRetryAt=Math.max(this.invadeRetryAt,this.match.elapsed+JUNGLE_INVADE_RULES.retryDelay);
    this.invadeWithdrawing=true;
    this.stepInvasionWithdraw(team);
  }

  private stepInvasionWithdraw(team:BattlefieldTeam):boolean{
    const c=this.actor,goal=this.jungleRetreatPoint(team);
    if(distance(c.hero,goal)<=JUNGLE_INVADE_RULES.retreatArrival){
      this.invadeWithdrawing=false;
      // Replace any stale monster-attack order even if the aborted invasion
      // started at the home jungle entry point.
      this.state='invade-withdraw';
      this.move(goal);
      return false;
    }
    this.state='invade-withdraw';
    const path=jungleSafeRoute(c.hero,team==='blue'?'blue-jungle-bottom':'red-jungle-top',
      point=>!this.dangerousTowerAt(point,team));
    const nextId=path&&path.pathIds.length>1?path.pathIds[1]:null;
    // If the map offers no fully tower-safe route, retreat to the nearest
    // safe navigation waypoint rather than resuming a stale attack command.
    const nearest=BATTLEFIELD_NAVIGATION.nearest(c.hero,node=>!this.dangerousTowerAt(node.point,team));
    this.move(nextId?BATTLEFIELD_NAVIGATION.node(nextId).point:nearest?.point??goal);
    return true;
  }

  private chooseLaneAssist(team:BattlefieldTeam){
    const m=this.match,enemyTeam:BattlefieldTeam=team==='blue'?'red':'blue';
    const signals:JungleLaneSignal[]=[];
    for(const ally of m.teamMembers(team)){
      const role=BATTLEFIELD_ROLE_BY_CHAMPION[ally.visualId as keyof typeof BATTLEFIELD_ROLE_BY_CHAMPION];
      if(!ally.alive||role==='jungle')continue;
      const visible=m.teamMembers(enemyTeam).filter(enemy=>{
        const target=m.championTargets.find(value=>value.id===enemy.profile.id);
        return enemy.alive&&!!target&&m.canSee(team,target)&&
          distance(enemy.hero,ally.hero)<=JUNGLE_AI_RULES.assistEnemyRange;
      });
      // The jungler plus the allied laner should not blindly enter an
      // outnumbered fight based on unseen enemies.
      if(visible.length>2)continue;
      for(const enemy of visible){
        signals.push({
          lane:role,ally:ally.hero,enemy:enemy.hero,
          allyHealth:ally.hero.hp/ally.hero.maxHp,
        });
      }
    }
    return chooseJungleAssist(this.actor.hero,signals,
      point=>!this.dangerousTowerAt(point,team));
  }

  private stepJunglePatrol(team:BattlefieldTeam,state:'patrol'|'river-patrol'){
    const c=this.actor;
    const route=state==='river-patrol'?RIVER_PATROL[team]:PATROL[team];
    let targetId=route[this.patrolIndex%route.length];
    let target=BATTLEFIELD_NAVIGATION.node(targetId);
    if(distance(c.hero,target.point)<BATTLEFIELD_AI_RULES.patrolReach){
      this.patrolIndex=(this.patrolIndex+1)%route.length;
      targetId=route[this.patrolIndex%route.length];
      target=BATTLEFIELD_NAVIGATION.node(targetId);
    }
    const current=BATTLEFIELD_NAVIGATION.nearest(c.hero);
    const path=current?BATTLEFIELD_NAVIGATION.shortestPathIds(current.id,targetId):[];
    const nextId=path.length>1?path[1]:targetId;
    this.state=state;
    this.move(BATTLEFIELD_NAVIGATION.node(nextId).point);
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
