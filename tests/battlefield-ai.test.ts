import test from 'node:test';
import assert from 'node:assert/strict';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { BATTLEFIELD_AI_RULES } from '../src/game/BattlefieldAI.ts';
import { BATTLEFIELD_NAVIGATION, battlefieldLaneRoute, projectToRoute } from '../src/game/navigation.ts';
import { RULES, distance } from '../src/game/config.ts';

const step=(match:BattlefieldMatch,seconds:number)=>{
  for(let i=0;i<Math.round(seconds/RULES.step);i++)match.step(RULES.step);
};

test('battlefield AI is opt-in for deterministic simulation tests and enabled as four role brains',()=>{
  assert.equal(new BattlefieldMatch().ai.length,0);
  const match=new BattlefieldMatch({ai:true});
  assert.equal(match.ai.length,4);
  assert.deepEqual(match.ai.map(brain=>brain.role),['top','mid','bottom','jungle']);
  assert.deepEqual(match.ai.map(brain=>brain.actor.visualId),['renekton','annie','ashe','amumu']);
});

test('battlefield lane AI waits for the first wave then issues route-bound advance orders',()=>{
  const match=new BattlefieldMatch({ai:true});
  const starts=match.opponents.slice(0,3).map(actor=>({x:actor.hero.x,y:actor.hero.y}));
  step(match,9);
  assert.ok(match.ai.slice(0,3).every(brain=>brain.state==='waiting'));
  match.opponents.slice(0,3).forEach((actor,index)=>assert.ok(distance(actor.hero,starts[index])<1));

  step(match,2);
  for(const [index,lane] of ['top','mid','bottom'].entries()){
    const brain=match.ai[index],actor=brain.actor;
    assert.equal(brain.state,'advance');
    assert.equal(actor.command.kind,'attackMove');
    if(actor.command.kind!=='attackMove')continue;
    const route=battlefieldLaneRoute(lane as 'top'|'mid'|'bottom','blue');
    const projection=projectToRoute(route,actor.command.point);
    assert.ok(distance(projection.point,actor.command.point)<90);
  }
});

test('battlefield AI engages a nearby enemy champion through ordinary attack commands',()=>{
  const match=new BattlefieldMatch({ai:true});
  match.elapsed=20;
  const brain=match.ai[0],red=brain.actor,blue=match.members[0];
  red.hero.x=760;red.hero.y=470;red.anchor={x:red.hero.x,y:red.hero.y};
  blue.hero.x=800;blue.hero.y=470;blue.anchor={x:blue.hero.x,y:blue.hero.y};

  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'fight');
  assert.equal(red.command.kind,'attack');
  if(red.command.kind==='attack')assert.equal(red.command.targetId,blue.profile.id);
});

test('low-health battlefield AI uses the shared retreat and recall path toward its fountain',()=>{
  const match=new BattlefieldMatch({ai:true});
  match.elapsed=20;
  const brain=match.ai[1],actor=brain.actor;
  actor.hero.x=900;actor.hero.y=500;
  actor.hero.hp=actor.hero.maxHp*.2;
  actor.lastCombat=-100;
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'recall');
  assert.equal(actor.command.kind,'recall');
});

test('jungle role patrols navigation graph instead of joining a lane wave by default',()=>{
  const match=new BattlefieldMatch({ai:true});
  match.elapsed=20;
  const brain=match.ai[3],actor=brain.actor;
  const start={x:actor.hero.x,y:actor.hero.y};
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'patrol');
  assert.equal(actor.command.kind,'move');
  if(actor.command.kind!=='move')return;
  const target=BATTLEFIELD_NAVIGATION.node('red-jungle-bottom').point;
  assert.deepEqual(actor.command.point,target);
  assert.ok(distance(actor.command.point,start)>100);
});
