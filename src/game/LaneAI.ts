import type { LaneMatch } from './LaneMatch.ts';
import { LANE } from './LaneMatch.ts';
import type { Combat } from './combat.ts';
import type { Target } from './targets.ts';
import type { Point } from './config.ts';
import { distance } from './config.ts';

// Provisional lane decisions. Top/mid/bot use route progress; jungle routing follows in the next map phase.
 // No bonus health, income, damage or cooldowns.
export const AI_RULES={interval:.3,engage:350,retreatHP:.3,potionHP:.65,recoverHP:.9,recoverMana:.6,safeRecall:380,recallQuiet:2,towerMargin:55,start:10} as const;
export type AIState='waiting'|'advance'|'fight'|'retreat'|'recall'|'recover'|'dead';
export class LaneAI {
  state:AIState='waiting';
  private remaining=0;
  private recovering=false;
  private match:LaneMatch;
  readonly actor:Combat;
  private index:number;
  constructor(match:LaneMatch,actor:Combat,index:number){this.match=match;this.actor=actor;this.index=index;}
  step(dt:number){
    this.remaining-=dt;if(this.remaining>0)return;this.remaining=AI_RULES.interval;
    const c=this.actor,m=this.match;
    if(!c.alive){this.state='dead';this.recovering=true;this.shop();return;}
    if(!c.canAct||c.dash||c.abilities.pull)return;
    const visible=c.enemies.filter(t=>t.alive&&!t.protected&&c.canSee(t));
    const order=c.command;
    const team=m.teamOf(c),lane=m.laneOf(c),enemyTeam=team==='red'?'blue':'red';
    const hiddenChase=order.kind==='attack'&&!visible.some(t=>t.id===order.targetId&&t.generation===order.generation)&&!!m.lastSeenById(team,order.targetId,order.generation);
    const hostileTower=m.structure(enemyTeam,'tower',lane);
    const threats=visible.filter(t=>distance(c.hero,t)<=AI_RULES.safeRecall&&(t.kind!=='building'||t===hostileTower&&distance(c.hero,t)<=LANE.tower.range));
    const hp=c.hero.hp/c.hero.maxHp,mana=c.maxMana?c.hero.mana/c.maxMana:1;
    if(hp<AI_RULES.potionHP)c.usePotion();
    if(hp<AI_RULES.retreatHP||(c.maxMana>0&&mana<.12))this.recovering=true;
    if(this.recovering){
      if(distance(c.hero,c.profile.spawn)<70){
        this.state='recover';this.shop();
        if(hp>=AI_RULES.recoverHP&&mana>=AI_RULES.recoverMana)this.recovering=false;
        else {this.move(c.profile.spawn);return;}
      }else {
        if(!threats.length&&c.elapsed-c.lastCombat>=AI_RULES.recallQuiet){
          this.state='recall';if(c.command.kind!=='recall')c.recall();return;
        }
        this.state='retreat';this.move(c.profile.spawn);return;
      }
    }
    if(m.elapsed<AI_RULES.start){this.state='waiting';return;}
    if(hiddenChase){this.state='fight';return;}
    const tower=m.structure(enemyTeam,'tower',lane);
    const safe=(p:Point)=>!tower.alive||m.supported(tower,team)||distance(p,tower)>LANE.tower.range+AI_RULES.towerMargin;
    // Never continue a chase under an unescorted tower, even if a target has moved there.
    if(!safe(c.hero)){this.state='retreat';this.move(m.retreatPoint(team,lane,c.hero,LANE.tower.range+AI_RULES.towerMargin));return;}
    const hostileHeroes=visible.filter(t=>t.kind==='champion'&&distance(c.hero,t)<=AI_RULES.engage);
    const allies=m.teamMembers(team).filter(a=>a.alive&&distance(a.hero,c.hero)<=AI_RULES.engage);
    if(hostileHeroes.length>allies.length+1){this.state='retreat';this.move(m.retreatPoint(team,lane,c.hero,180));return;}
    const candidates=visible.filter(t=>t.kind!=='building'&&distance(c.hero,t)<=AI_RULES.engage&&safe(t));
    candidates.sort((a,b)=>Number(b.kind==='champion')-Number(a.kind==='champion')||distance(c.hero,a)-distance(c.hero,b));
    const target=candidates[0];
    if(target){
      this.state='fight';this.attack(target);this.skills(target);return;
    }
    const building=tower.alive?tower:m.structure(enemyTeam,'nexus');
    if(m.supported(building,team,tower.alive?lane:undefined)&&distance(c.hero,building)<=AI_RULES.engage){this.state='fight';this.attack(building);return;}
    this.state='advance';
    const backoff=(c.stats.range>100?95:35)+(this.index%2)*18;
    const goal=m.advancePoint(team,lane,backoff);
    if(c.command.kind!=='attackMove'||distance(c.command.point,goal)>45)c.attackMove(goal);
  }
  private move(point:Point){const c=this.actor;if(c.command.kind!=='move'||distance(c.command.point,point)>20)c.move(point);}
  private attack(target:Target){const c=this.actor;if(c.command.kind!=='attack'||c.command.targetId!==target.id||c.command.generation!==target.generation)c.attack(target.id);}
  private shop(){
    const c=this.actor;
    // One normal transaction per decision; all four share the same finite red budget.
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
