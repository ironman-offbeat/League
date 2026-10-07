import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLEFIELD, BattlefieldState } from '../src/game/battlefield.ts';
import { battlefieldLaneRoute } from '../src/game/navigation.ts';

const destroy=(state:BattlefieldState,team:'blue'|'red',lane:'top'|'mid'|'bottom',role:'outer'|'inner'|'inhibitor')=>{
  const structure=state.structure(team,lane,role);
  assert.ok(state.damageStructure(structure,1e9,true)>0);
  assert.equal(structure.alive,false);
};

test('battlefield creates three ordered structure chains and one nexus per team',()=>{
  const field=new BattlefieldState();
  assert.equal(field.structures.length,20);
  for(const team of ['blue','red'] as const){
    assert.equal(field.nexus(team).maxHp,BATTLEFIELD.structures.nexus.hp);
    for(const lane of ['top','mid','bottom'] as const){
      const outer=field.structure(team,lane,'outer');
      const inner=field.structure(team,lane,'inner');
      const inhibitor=field.structure(team,lane,'inhibitor');
      assert.equal(outer.maxHp,3200);
      assert.equal(inner.maxHp,4000);
      assert.equal(inhibitor.maxHp,2200);
      assert.ok(outer.attack>0&&inner.attack>0);
      assert.equal(inhibitor.attack,0);
    }
  }
});

test('each lane enforces outer to inner to inhibitor and any inhibitor unlocks nexus',()=>{
  const field=new BattlefieldState();
  const inner=field.structure('red','top','inner');
  const inhibitor=field.structure('red','top','inhibitor');
  const nexus=field.nexus('red');

  assert.equal(field.protected(inner),true);
  assert.equal(field.damageStructure(inner,500,true),0);
  assert.equal(field.protected(nexus),true);

  destroy(field,'red','top','outer');
  assert.equal(field.protected(inner),false);
  destroy(field,'red','top','inner');
  assert.equal(field.protected(inhibitor),false);
  destroy(field,'red','top','inhibitor');

  assert.equal(field.protected(nexus),false);
  assert.equal(field.structure('red','mid','inhibitor').alive,true);
  assert.equal(field.structure('red','bottom','inhibitor').alive,true);
});

test('structure damage uses armor and the existing 75 percent backdoor reduction',()=>{
  const escorted=new BattlefieldState(),backdoor=new BattlefieldState();
  const a=escorted.structure('red','mid','outer');
  const b=backdoor.structure('red','mid','outer');
  const full=escorted.damageStructure(a,140,true);
  const reduced=backdoor.damageStructure(b,140,false);
  assert.ok(Math.abs(full-100)<1e-8);
  assert.ok(Math.abs(reduced-25)<1e-8);
});

test('all three lanes spawn together at ten seconds and every twenty seconds',()=>{
  const field=new BattlefieldState();
  assert.deepEqual(field.step(9),[]);
  const first=field.step(1);
  assert.equal(first.length,1);
  assert.equal(first[0].number,1);
  assert.equal(first[0].spawnedAt,10);
  assert.equal(first[0].minions.length,30);

  const next=field.step(40);
  assert.deepEqual(next.map(w=>w.number),[2,3]);
  const third=next[1];
  assert.equal(third.minions.filter(m=>m.role==='siege').length,6);
  assert.equal(third.minions.length,36);
});

test('destroyed inhibitor adds one super minion only to the pushing lane and team',()=>{
  const field=new BattlefieldState();
  destroy(field,'red','bottom','outer');
  destroy(field,'red','bottom','inner');
  destroy(field,'red','bottom','inhibitor');

  const wave=field.spawnWave();
  const supers=wave.minions.filter(m=>m.role==='super');
  assert.deepEqual(supers.map(m=>[m.team,m.lane]),[['blue','bottom']]);
});

test('wave routes are lane-specific, team-oriented and isolated from caller mutation',()=>{
  const field=new BattlefieldState();
  const wave=field.spawnWave();
  for(const team of ['blue','red'] as const)for(const lane of ['top','mid','bottom'] as const){
    const minion=wave.minions.find(m=>m.team===team&&m.lane===lane)!;
    const route=battlefieldLaneRoute(lane,team);
    assert.deepEqual(minion.route,route);
    assert.ok(Math.hypot(minion.x-route[0].x,minion.y-route[0].y)<100);
  }
  const a=wave.minions[0],b=wave.minions[1];
  a.route[0].x=0;
  assert.notEqual(b.route[0].x,0);
});

test('reset restores structure health, wave clock and inhibitor state',()=>{
  const field=new BattlefieldState();
  destroy(field,'blue','mid','outer');
  field.step(55);
  field.reset();
  assert.equal(field.elapsed,0);
  assert.equal(field.wave,0);
  assert.equal(field.nextWave,10);
  assert.ok(field.structures.every(s=>s.alive&&s.hp===s.maxHp));
});
