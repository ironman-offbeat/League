import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, distance } from '../src/game/config.ts';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { chooseSiegePlan } from '../src/game/SiegePlanning.ts';
import { BATTLEFIELD_AI_RULES } from '../src/game/BattlefieldAI.ts';
import type { LaneId } from '../src/game/navigation.ts';

function setup(){
  const m=new BattlefieldMatch({ai:true});
  m.step(10);
  m.nextWave=Infinity;
  m.elapsed=490;
  // Fixture with an active Baron owner; no hidden monster HP, teleport
  // during actual AI step or free damage is introduced by the feature.
  m.epicRewards.red.grant('baron',m.elapsed);
  const jungler=m.opponents[3];
  jungler.grantBaron(180);
  return {m,jungler};
}
function repositionWave(m:BattlefieldMatch,lane:LaneId,point:{x:number;y:number}){
  const wave=m.minions('red',lane);
  for(const [i,unit] of wave.entries())Object.assign(unit,{x:point.x+(i%3-1)*22,y:point.y+(Math.floor(i/3)-1)*22});
  m.refreshVision();
  return wave;
}

test('09e-7 only living Baron bearers or exposed nexus can trigger strategic siege',()=>{
  const {m,jungler}=setup();
  const outer=m.structure('blue','outer','mid');
  repositionWave(m,'mid',{x:outer.x+90,y:outer.y});
  assert.equal(chooseSiegePlan(m,jungler)?.lane,'mid');
  jungler.baronRemaining=0;
  assert.equal(chooseSiegePlan(m,jungler),null);
  m.structure('blue','outer','top').alive=false;
  m.structure('blue','inner','top').alive=false;
  m.structure('blue','inhibitor','top').alive=false;
  m.step(RULES.step); // refresh building protection; nexus is now unlocked.
  assert.equal(m.structure('blue','nexus').protected,false);
  assert.ok(chooseSiegePlan(m,jungler));
  jungler.receiveDamage(1e9);
  assert.equal(chooseSiegePlan(m,jungler),null);
});

test('09e-7 Baron escort chooses most breached active lane with a real allied wave',()=>{
  const {m,jungler}=setup();
  const top=m.structure('blue','inhibitor','top');
  m.structure('blue','outer','top').alive=false;
  m.structure('blue','inner','top').alive=false;
  m.step(RULES.step);
  repositionWave(m,'top',{x:top.x+70,y:top.y+15});
  const outer=m.structure('blue','outer','bottom');
  repositionWave(m,'bottom',{x:outer.x+60,y:outer.y});
  const plan=chooseSiegePlan(m,jungler);
  assert.ok(plan);
  assert.equal(plan.lane,'top');
  assert.equal(plan.objective.role,'inhibitor');
  assert.ok(distance(plan.escort,plan.objective)<150);
  assert.equal(plan.escort.team,'red');
});

test('09e-7 jungler receives escort orders instead of farming under Baron when route is safe',()=>{
  const {m,jungler}=setup();
  for(const tower of m.structures('blue'))if(tower.role==='outer'||tower.role==='inner')tower.alive=false;
  m.step(RULES.step);
  const inhibitor=m.structure('blue','inhibitor','mid');
  repositionWave(m,'mid',{x:inhibitor.x+130,y:inhibitor.y});
  for(const blue of m.members)Object.assign(blue.hero,{x:140,y:840});
  m.refreshVision();
  const brain=m.ai[3];
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.ok(['siege-escort','siege-attack','siege-finish'].includes(brain.state),brain.state);
  assert.notEqual(jungler.command.kind,'idle');
});

test('09e-7 damage and buffs still use ordinary building and minion combat',()=>{
  const {m,jungler}=setup();
  for(const tower of m.structures('blue'))if(tower.role==='outer'||tower.role==='inner')tower.alive=false;
  m.step(RULES.step);
  const objective=m.structure('blue','inhibitor','mid');
  const wave=repositionWave(m,'mid',{x:objective.x+55,y:objective.y});
  // An unsupported 1-v-4 fight should retreat. Isolate the real building
  // attack by removing nearby defenders without changing building health.
  for(const blue of m.members)Object.assign(blue.hero,{x:1480,y:920});
  Object.assign(jungler.hero,{x:objective.x+55,y:objective.y+12});
  m.refreshVision();
  const brain=m.ai[3];
  const hp=objective.hp;
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'siege-attack');
  assert.equal(jungler.command.kind,'attack');
  if(jungler.command.kind==='attack')assert.equal(jungler.command.targetId,objective.id);
  assert.equal(objective.hp,hp); // issuing a command never deals instant damage
  m.step(2);
  assert.ok(objective.hp<hp, 'normal ticks must apply the attack');
  assert.equal(wave.some(unit=>m.baronEmpowersMinion(unit)),true);
});

test('09e-7 exposed supported nexus is prioritized only against non-superior visible defense',()=>{
  const {m}=setup();
  for(const tower of m.structures('blue'))if(tower.role==='outer'||tower.role==='inner')tower.alive=false;
  m.structure('blue','inhibitor','mid').alive=false;
  m.step(RULES.step);
  const nexus=m.structure('blue','nexus');
  for(const actor of m.members)Object.assign(actor.hero,{x:1480,y:920});
  repositionWave(m,'mid',{x:nexus.x+80,y:nexus.y+35});
  const attacker=m.opponents[1];
  Object.assign(attacker.hero,{x:nexus.x+120,y:nexus.y+20});
  m.refreshVision();
  const brain=m.ai[1];
  assert.ok(m.supported(nexus,'red'));
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'siege-finish');
  assert.equal(attacker.command.kind,'attack');
  if(attacker.command.kind==='attack')assert.equal(attacker.command.targetId,nexus.id);
  const before=nexus.hp;
  m.step(2);
  assert.ok(nexus.hp<before);
});

test('09e-7 no wave never authorizes a turret dive, even with temporary Baron',()=>{
  const {m,jungler}=setup();
  const outer=m.structure('blue','outer','top');
  for(const wave of m.minions('red'))wave.alive=false;
  Object.assign(jungler.hero,{x:outer.x+10,y:outer.y});
  m.refreshVision();
  assert.equal(chooseSiegePlan(m,jungler),null);
  const brain=m.ai[3];
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'retreat');
  assert.notEqual(jungler.command.kind,'attack');
});

test('09e-7 current team vision, not hidden enemy hero coordinates, drives an escort decision',()=>{
  const {m,jungler}=setup();
  for(const tower of m.structures('blue'))if(tower.role==='outer'||tower.role==='inner')tower.alive=false;
  m.step(RULES.step);
  const inhibitor=m.structure('blue','inhibitor','top');
  repositionWave(m,'top',{x:inhibitor.x+90,y:inhibitor.y});
  const before=chooseSiegePlan(m,jungler);
  assert.ok(before);
  for(const blue of m.members)Object.assign(blue.hero,{x:1500,y:60});
  m.refreshVision();
  const after=chooseSiegePlan(m,jungler);
  assert.equal(after?.lane,before.lane);
});
