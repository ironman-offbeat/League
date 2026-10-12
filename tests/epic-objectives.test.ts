import test from 'node:test';
import assert from 'node:assert/strict';
import { EpicObjective, EpicObjectiveState, EPIC_OBJECTIVES } from '../src/game/EpicObjectives.ts';
import { BATTLEFIELD_NAVIGATION } from '../src/game/navigation.ts';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { RULES } from '../src/game/config.ts';

test('dragon and baron reuse separate existing river navigation nodes',()=>{
  const state=new EpicObjectiveState();
  assert.deepEqual(state.objectives.map(objective=>objective.id),['dragon','baron']);
  for(const objective of state.objectives){
    assert.deepEqual(objective.point,BATTLEFIELD_NAVIGATION.node(objective.definition.nodeId).point);
    assert.equal(objective.alive,false);
    assert.equal(objective.generation,0);
    assert.equal(objective.spawnedAt,null);
  }
  assert.notDeepEqual(state.objective('dragon').point,state.objective('baron').point);
  assert.equal(state.objective('baron').nextSpawnAt,480);
});

test('first dragon spawn and baron 8-minute spawn are independent',()=>{
  const state=new EpicObjectiveState();
  const dragon=state.objective('dragon'),baron=state.objective('baron');
  state.step(EPIC_OBJECTIVES.dragon.firstSpawn-.01);
  assert.equal(dragon.alive,false);
  assert.equal(dragon.spawnRemaining(0),EPIC_OBJECTIVES.dragon.firstSpawn);
  state.step(EPIC_OBJECTIVES.dragon.firstSpawn);
  assert.equal(dragon.alive,true);
  assert.equal(dragon.spawnedAt,EPIC_OBJECTIVES.dragon.firstSpawn);
  assert.equal(baron.alive,false);
  state.step(479);
  assert.equal(baron.alive,false);
  state.step(480);
  assert.equal(baron.alive,true);
  assert.equal(baron.spawnedAt,480);
  assert.equal(dragon.generation,0);
});

test('each epic objective independently schedules respawn and increments its generation once',()=>{
  const state=new EpicObjectiveState();
  const dragon=state.objective('dragon'),baron=state.objective('baron');
  state.step(480);
  assert.equal(dragon.defeat(482),true);
  assert.equal(baron.defeat(490),true);
  assert.equal(dragon.defeat(483),false);
  assert.equal(dragon.nextSpawnAt,482+EPIC_OBJECTIVES.dragon.respawn);
  assert.equal(baron.nextSpawnAt,490+EPIC_OBJECTIVES.baron.respawn);
  state.step(482+EPIC_OBJECTIVES.dragon.respawn-.01);
  assert.equal(dragon.alive,false);
  state.step(482+EPIC_OBJECTIVES.dragon.respawn);
  assert.equal(dragon.alive,true);
  assert.equal(dragon.generation,1);
  assert.equal(baron.alive,false);
  state.step(490+EPIC_OBJECTIVES.baron.respawn);
  assert.equal(baron.alive,true);
  assert.equal(baron.generation,1);
  assert.equal(dragon.generation,1);
});

test('objective spawn and defeat callbacks are emitted only for actual lifecycle transitions',()=>{
  const state=new EpicObjectiveState();
  const dragon=state.objective('dragon');
  let spawns=0,defeats=0;
  dragon.onSpawn=()=>spawns++;
  dragon.onDefeat=()=>defeats++;
  state.step(119);
  assert.equal(spawns,0);
  state.step(120);
  state.step(121);
  assert.equal(spawns,1);
  assert.equal(dragon.defeat(122),true);
  assert.equal(dragon.defeat(123),false);
  assert.equal(defeats,1);
  state.step(302);
  state.step(400);
  assert.equal(spawns,2);
});

test('invalid definitions, time, duplicate ids or overlapping nodes fail safely',()=>{
  assert.throws(()=>new EpicObjective({id:'dragon',nodeId:'river-south',firstSpawn:-1,respawn:10}));
  assert.throws(()=>new EpicObjective({id:'dragon',nodeId:'river-south',firstSpawn:20,respawn:0}));
  assert.throws(()=>new EpicObjective({id:'baron',nodeId:'does-not-exist',firstSpawn:0,respawn:60}));
  assert.throws(()=>new EpicObjectiveState([EPIC_OBJECTIVES.dragon,EPIC_OBJECTIVES.dragon]));
  assert.throws(()=>new EpicObjectiveState([{...EPIC_OBJECTIVES.dragon,nodeId:'river-north'},EPIC_OBJECTIVES.baron]));
  const dragon=new EpicObjective(EPIC_OBJECTIVES.dragon);
  assert.throws(()=>dragon.step(NaN));
  assert.throws(()=>dragon.defeat(Infinity));
  assert.throws(()=>dragon.spawnRemaining(-1));
  assert.equal(dragon.defeat(500),false);
});

test('actual battlefield match tick drives objective lifecycle using match elapsed time',()=>{
  const match=new BattlefieldMatch();
  match.nextWave=Infinity;
  assert.equal(match.objectives.objective('dragon').alive,false);
  assert.equal(match.objectives.objective('baron').alive,false);
  match.elapsed=EPIC_OBJECTIVES.dragon.firstSpawn-RULES.step*2;
  match.step(RULES.step);
  assert.equal(match.objectives.objective('dragon').alive,false);
  match.step(RULES.step);
  assert.equal(match.objectives.objective('dragon').alive,true);
  assert.equal(match.objectives.objective('baron').alive,false);
  match.elapsed=EPIC_OBJECTIVES.baron.firstSpawn-RULES.step;
  match.step(RULES.step);
  assert.equal(match.objectives.objective('baron').alive,true);
});

test('finished matches do not advance objective timers and new matches have fresh state',()=>{
  const match=new BattlefieldMatch();
  match.nextWave=Infinity;
  match.elapsed=EPIC_OBJECTIVES.dragon.firstSpawn-1;
  match.result='victory';
  match.step(10);
  assert.equal(match.elapsed,EPIC_OBJECTIVES.dragon.firstSpawn-1);
  assert.equal(match.objectives.objective('dragon').alive,false);
  const fresh=new BattlefieldMatch();
  assert.equal(fresh.objectives.objective('dragon').alive,false);
  assert.equal(fresh.objectives.objective('dragon').generation,0);
  assert.equal(fresh.objectives.objective('baron').nextSpawnAt,480);
});


test('epic bosses are shared neutral combat targets with no automatic aggro',()=>{
  const match=new BattlefieldMatch();
  const dragon=match.objectives.objective('dragon');
  const baron=match.objectives.objective('baron');
  for(const actor of match.actors){
    assert.ok(actor.enemies.includes(dragon));
    assert.ok(actor.enemies.includes(baron));
    assert.equal(actor.autoTargetAllowed(dragon),false);
    assert.equal(actor.autoTargetAllowed(baron),false);
  }
  assert.equal(dragon.kind,'monster');
  assert.ok(baron.maxHp>dragon.maxHp);
});

test('direct champion attack damages dragon, death fires once and respawn resets health',()=>{
  const match=new BattlefieldMatch();
  match.nextWave=Infinity;
  match.elapsed=EPIC_OBJECTIVES.dragon.firstSpawn;
  match.objectives.step(match.elapsed);
  const dragon=match.objectives.objective('dragon');
  const actor=match.members[3];
  actor.hero.x=dragon.x-35;actor.hero.y=dragon.y;
  actor.anchor={x:actor.hero.x,y:actor.hero.y};
  match.refreshVision();
  assert.equal(match.canSee('blue',dragon),true);
  assert.equal(actor.attack(dragon.id),true);
  const hp=dragon.hp;
  for(let i=0;i<60;i++)match.step(RULES.step);
  assert.ok(dragon.hp<hp);
  dragon.aggro=actor.profile.id;
  const generation=dragon.generation;
  let deaths=0;
  dragon.onDeath=()=>deaths++;
  dragon.receiveDamage(1e9,'physical');
  assert.equal(dragon.alive,false);
  assert.equal(dragon.hp,0);
  assert.equal(dragon.lastDamager,actor.profile.id);
  assert.equal(deaths,1);
  assert.equal(dragon.defeat(match.elapsed),false);
  assert.equal(deaths,1);
  match.objectives.step(dragon.nextSpawnAt!);
  assert.equal(dragon.alive,true);
  assert.equal(dragon.hp,dragon.maxHp);
  assert.equal(dragon.lastDamager,null);
  assert.equal(dragon.generation,generation+1);
});

test('epic boss visibility requires living objective and local team sight',()=>{
  const match=new BattlefieldMatch();
  match.elapsed=EPIC_OBJECTIVES.dragon.firstSpawn;
  match.objectives.step(match.elapsed);
  const dragon=match.objectives.objective('dragon');
  const actor=match.members[0];
  actor.hero.x=dragon.x+20;actor.hero.y=dragon.y;
  match.refreshVision();
  assert.equal(match.canSee('blue',dragon),true);
  dragon.defeat(match.elapsed);
  assert.equal(match.canSee('blue',dragon),false);
});
