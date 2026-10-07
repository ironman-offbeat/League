import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/game/config.ts';
import { damageTarget } from '../src/game/targets.ts';
import {
  BATTLEFIELD,
  BATTLEFIELD_ROLE_BY_CHAMPION,
  BattlefieldMatch,
  battlefieldChampionSpawn,
  battlefieldFountain,
} from '../src/game/BattlefieldMatch.ts';
import type { BattlefieldTeam } from '../src/game/BattlefieldMatch.ts';
import type { LaneId } from '../src/game/navigation.ts';

const LANES:readonly LaneId[]=['top','mid','bottom'];
const step=(match:BattlefieldMatch,seconds:number)=>{
  for(let i=0;i<Math.round(seconds/RULES.step);i++)match.step(RULES.step);
};

test('battlefield creates three gated structures per lane plus one shared nexus for each team',()=>{
  const match=new BattlefieldMatch();
  assert.equal(match.structures().length,20);
  for(const team of ['blue','red'] as const){
    assert.equal(match.structures(team).length,10);
    for(const lane of LANES){
      assert.equal(match.structure(team,'outer',lane).protected,false);
      assert.equal(match.structure(team,'inner',lane).protected,true);
      assert.equal(match.structure(team,'inhibitor',lane).protected,true);
    }
    assert.equal(match.structure(team,'nexus').protected,true);
  }
});

test('lane structure protection unlocks in order and any destroyed inhibitor opens the nexus',()=>{
  const match=new BattlefieldMatch();
  const lane:LaneId='top';
  const outer=match.structure('red','outer',lane);
  const inner=match.structure('red','inner',lane);
  const inhibitor=match.structure('red','inhibitor',lane);
  const nexus=match.structure('red','nexus');

  damageTarget(inner,1e6,'physical','basic');
  assert.equal(inner.alive,true);

  damageTarget(outer,1e6,'physical','basic');
  match.step(RULES.step);
  assert.equal(outer.alive,false);
  assert.equal(inner.protected,false);

  damageTarget(inner,1e6,'physical','basic');
  match.step(RULES.step);
  assert.equal(inner.alive,false);
  assert.equal(inhibitor.protected,false);

  damageTarget(inhibitor,1e6,'physical','basic');
  match.step(RULES.step);
  assert.equal(inhibitor.alive,false);
  assert.equal(nexus.protected,false);
});

test('role starts are data driven and each lane role begins at equal team-relative progress',()=>{
  assert.deepEqual(BATTLEFIELD_ROLE_BY_CHAMPION,{
    renekton:'top',
    annie:'mid',
    ashe:'bottom',
    amumu:'jungle',
  });

  const match=new BattlefieldMatch();
  for(const champion of ['renekton','annie','ashe'] as const){
    const lane=BATTLEFIELD_ROLE_BY_CHAMPION[champion];
    const blue=battlefieldChampionSpawn(champion,'blue');
    const red=battlefieldChampionSpawn(champion,'red');
    assert.ok(blue.x>=0&&blue.x<=RULES.world.width&&blue.y>=0&&blue.y<=RULES.world.height);
    assert.ok(red.x>=0&&red.x<=RULES.world.width&&red.y>=0&&red.y<=RULES.world.height);
    assert.ok(Math.abs(match.laneProgress('blue',lane,blue)-110)<1e-6);
    assert.ok(Math.abs(match.laneProgress('red',lane,red)-110)<1e-6);
  }

  const blueJungle=battlefieldChampionSpawn('amumu','blue');
  const redJungle=battlefieldChampionSpawn('amumu','red');
  assert.ok(blueJungle.x<RULES.world.width/2&&blueJungle.y>RULES.world.height/2);
  assert.ok(redJungle.x>RULES.world.width/2&&redJungle.y<RULES.world.height/2);
});

test('first battlefield wave spawns independently on all three lanes for both teams',()=>{
  const match=new BattlefieldMatch();
  step(match,9);
  assert.equal(match.wave,0);
  step(match,1);
  assert.equal(match.wave,1);
  assert.equal(match.minions().length,30);
  for(const lane of LANES){
    for(const team of ['blue','red'] as BattlefieldTeam[]){
      const wave=match.minions(team,lane);
      assert.equal(wave.length,5);
      assert.equal(wave.filter(unit=>unit.role==='melee').length,3);
      assert.equal(wave.filter(unit=>unit.role==='ranged').length,2);
    }
  }
});

test('third wave adds a siege unit to every team and lane',()=>{
  const match=new BattlefieldMatch();
  step(match,50);
  assert.equal(match.wave,3);
  for(const lane of LANES){
    for(const team of ['blue','red'] as BattlefieldTeam[]){
      assert.ok(match.minions(team,lane).some(unit=>unit.role==='siege'));
    }
  }
});

test('lane minions advance by route progress rather than raw x direction',()=>{
  const match=new BattlefieldMatch();
  step(match,10);
  for(const lane of LANES){
    for(const team of ['blue','red'] as BattlefieldTeam[]){
      const unit=match.minions(team,lane).find(candidate=>candidate.role==='melee')!;
      const before=match.laneProgress(team,lane,unit);
      step(match,.5);
      const after=match.laneProgress(team,lane,unit);
      assert.ok(after>before,`${team} ${lane}: ${after} <= ${before}`);
    }
  }
});

test('destroying one lane inhibitor does not unlock the other lane structures',()=>{
  const match=new BattlefieldMatch();
  const team:BattlefieldTeam='red';
  const topOuter=match.structure(team,'outer','top');
  const topInner=match.structure(team,'inner','top');
  const topInhibitor=match.structure(team,'inhibitor','top');

  for(const structure of [topOuter,topInner,topInhibitor]){
    structure.protected=false;
    damageTarget(structure,1e6,'physical','basic');
    match.step(RULES.step);
  }

  assert.equal(match.structure(team,'nexus').protected,false);
  for(const lane of ['mid','bottom'] as const){
    assert.equal(match.structure(team,'inner',lane).protected,true);
    assert.equal(match.structure(team,'inhibitor',lane).protected,true);
  }
});

test('battlefield match result freezes simulation after nexus destruction',()=>{
  const match=new BattlefieldMatch();
  const nexus=match.structure('red','nexus');
  nexus.protected=false;
  damageTarget(nexus,1e9,'physical','basic');
  match.step(RULES.step);
  assert.equal(match.result,'victory');
  const elapsed=match.elapsed,wave=match.wave;
  step(match,30);
  assert.equal(match.elapsed,elapsed);
  assert.equal(match.wave,wave);
});

test('configured building values match the current full-map design targets',()=>{
  assert.equal(BATTLEFIELD.structures.outer.hp,3200);
  assert.equal(BATTLEFIELD.structures.inner.hp,4000);
  assert.equal(BATTLEFIELD.structures.inhibitor.hp,2200);
  assert.equal(BATTLEFIELD.structures.nexus.hp,5500);
  assert.equal(BATTLEFIELD.structures.outer.attack,150);
  assert.equal(BATTLEFIELD.structures.inner.attack,190);
});


test('battlefield champions begin at fountains while role staging stays data driven',()=>{
  const match=new BattlefieldMatch();
  assert.equal(match.members.length,4);
  assert.equal(match.opponents.length,4);
  assert.deepEqual(match.members.map(actor=>actor.profile.id),['renekton','annie','ashe','amumu']);
  assert.deepEqual(match.opponents.map(actor=>actor.profile.id),['red-renekton','red-annie','red-ashe','red-amumu']);
  assert.deepEqual(match.opponents.map(actor=>actor.visualId),['renekton','annie','ashe','amumu']);

  for(const actor of match.actors){
    const team=match.teamOf(actor);
    const original=actor.visualId as keyof typeof BATTLEFIELD_ROLE_BY_CHAMPION;
    const roleStart=battlefieldChampionSpawn(original,team);
    const fountain=battlefieldFountain(team);
    assert.deepEqual({x:actor.hero.x,y:actor.hero.y},fountain);
    assert.deepEqual(actor.profile.spawn,fountain);
    assert.deepEqual(actor.anchor,fountain);
    assert.notDeepEqual(roleStart,fountain);
    assert.equal(actor.progression.enabled,true);
    assert.equal(actor.equipment.weapon,1);
    assert.equal(actor.equipment.armor,1);
    assert.equal(match.shopReason(actor,'armor'),'팀 골드 부족');
  }

  const renekton=match.members[0];
  renekton.hero.x+=80;renekton.anchor={x:renekton.hero.x,y:renekton.hero.y};
  assert.ok(renekton.recall());
  step(match,4.1);
  assert.deepEqual({x:renekton.hero.x,y:renekton.hero.y},battlefieldFountain('blue'));
  assert.deepEqual(renekton.anchor,battlefieldFountain('blue'));
});

test('new battlefield waves join live champion target arrays and ordinary combat can damage them',()=>{
  const match=new BattlefieldMatch();
  const renekton=match.members[0];
  const beforeTargets=renekton.enemies.length;
  step(match,10);
  assert.ok(renekton.enemies.length>beforeTargets);

  const target=match.minions('red','top').find(unit=>unit.role==='melee')!;
  renekton.hero.x=target.x-25;
  renekton.hero.y=target.y;
  renekton.anchor={x:renekton.hero.x,y:renekton.hero.y};
  const hp=target.hp;
  assert.ok(renekton.attack(target.id,{x:target.x,y:target.y}));
  step(match,1.5);
  assert.ok(target.hp<hp);
});

test('battlefield team economy advances and uses the same finite purchase path',()=>{
  const match=new BattlefieldMatch();
  step(match,40);
  assert.ok(match.economy.blue.gold>=250);
  const actor=match.members[0];
  actor.hero.x=battlefieldFountain('blue').x;
  actor.hero.y=battlefieldFountain('blue').y;
  const gold=match.economy.blue.gold;
  assert.ok(match.purchase(actor,'armor'));
  assert.equal(actor.equipment.armor,2);
  assert.ok(match.economy.blue.gold<gold);
});
