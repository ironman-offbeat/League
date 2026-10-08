import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/game/config.ts';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { JUNGLE, JungleState } from '../src/game/Jungle.ts';
import { BATTLEFIELD_NAVIGATION } from '../src/game/navigation.ts';

const step=(match:BattlefieldMatch,seconds:number)=>{
  for(let i=0;i<Math.round(seconds/RULES.step);i++)match.step(RULES.step);
};

test('jungle camp definitions reuse the four existing battlefield jungle nodes symmetrically',()=>{
  const state=new JungleState();
  assert.equal(state.camps.length,4);
  assert.deepEqual(state.camps.map(camp=>camp.id),['blue-blue','blue-red','red-red','red-blue']);
  assert.deepEqual(state.camps.filter(camp=>camp.side==='blue').map(camp=>camp.buff),['blue','red']);
  assert.deepEqual(state.camps.filter(camp=>camp.side==='red').map(camp=>camp.buff),['red','blue']);
  for(const camp of state.camps){
    assert.deepEqual(camp.point,BATTLEFIELD_NAVIGATION.node(camp.definition.nodeId).point);
    assert.equal(camp.definition.firstSpawn,JUNGLE.firstSpawn);
    assert.equal(camp.definition.respawn,JUNGLE.respawn);
  }
});

test('all jungle camps spawn together at the configured first-spawn time',()=>{
  const match=new BattlefieldMatch();
  assert.ok(match.jungle.camps.every(camp=>!camp.alive));
  step(match,JUNGLE.firstSpawn-1);
  assert.ok(match.jungle.camps.every(camp=>!camp.alive));
  step(match,1);
  assert.ok(match.jungle.camps.every(camp=>camp.alive));
  assert.ok(match.jungle.camps.every(camp=>camp.generation===0&&camp.nextSpawnAt===null));
});

test('defeated jungle camps respawn independently and increment only their own generation',()=>{
  const match=new BattlefieldMatch();
  step(match,JUNGLE.firstSpawn);
  const red=match.jungle.camp('blue-red');
  const blue=match.jungle.camp('blue-blue');

  assert.equal(red.defeat(match.elapsed),true);
  assert.equal(red.alive,false);
  assert.equal(red.respawnRemaining(match.elapsed),JUNGLE.respawn);
  assert.equal(blue.alive,true);

  step(match,JUNGLE.respawn-1);
  assert.equal(red.alive,false);
  assert.equal(red.generation,0);
  assert.equal(blue.alive,true);
  assert.equal(blue.generation,0);

  step(match,1);
  assert.equal(red.alive,true);
  assert.equal(red.generation,1);
  assert.equal(red.nextSpawnAt,null);
  assert.equal(blue.generation,0);
});

test('inactive or already defeated jungle camps cannot schedule duplicate respawns',()=>{
  const state=new JungleState();
  const camp=state.camp('red-blue');
  assert.equal(camp.defeat(0),false);
  camp.step(JUNGLE.firstSpawn);
  assert.equal(camp.defeat(JUNGLE.firstSpawn),true);
  const scheduled=camp.nextSpawnAt;
  assert.equal(camp.defeat(JUNGLE.firstSpawn+1),false);
  assert.equal(camp.nextSpawnAt,scheduled);
});

test('jungle lifecycle validates duplicate ids and invalid timing data',()=>{
  assert.throws(()=>new JungleState([
    {id:'same',side:'blue',buff:'blue',nodeId:'blue-jungle-top',firstSpawn:0,respawn:10},
    {id:'same',side:'red',buff:'red',nodeId:'red-jungle-top',firstSpawn:0,respawn:10},
  ]));
  assert.throws(()=>new JungleState([
    {id:'bad',side:'blue',buff:'blue',nodeId:'blue-jungle-top',firstSpawn:-1,respawn:10},
  ]));
  assert.throws(()=>new JungleState([
    {id:'bad',side:'blue',buff:'blue',nodeId:'blue-jungle-top',firstSpawn:0,respawn:0},
  ]));
});
