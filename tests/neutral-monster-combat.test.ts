import test from 'node:test';
import assert from 'node:assert/strict';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { EPIC_COMBAT, EPIC_OBJECTIVES } from '../src/game/EpicObjectives.ts';
import type { EpicObjectiveKind } from '../src/game/EpicObjectives.ts';
import { JUNGLE } from '../src/game/Jungle.ts';
import { RULES, distance } from '../src/game/config.ts';

function battlefield(kind:EpicObjectiveKind='dragon'){
  const match=new BattlefieldMatch();
  match.nextWave=Infinity;
  for(const unit of match.structures())if(unit.role==='outer'||unit.role==='inner')unit.alive=false;
  match.elapsed=EPIC_OBJECTIVES[kind].firstSpawn;
  match.objectives.step(match.elapsed);
  const boss=match.objectives.objective(kind);
  // Avoid passive Amumu aura damage in tests of neutral proximity.
  const blue=match.members.find(a=>a.visualId==='renekton')!;
  const red=match.opponents.find(a=>a.visualId==='renekton')!;
  for(const actor of [blue,red]){
    actor.hero.x=boss.point.x+35;actor.hero.y=boss.point.y;
    actor.anchor={x:actor.hero.x,y:actor.hero.y};
  }
  match.refreshVision();
  return {match,boss,blue,red};
}

test('dragon and baron remain neutral near heroes until an actual attack',()=>{
  for(const kind of ['dragon','baron'] as const){
    const {match,boss,blue}=battlefield(kind);
    const hp=blue.hero.hp;
    match.step(.5);
    assert.equal(boss.aggro,null);
    assert.equal(blue.hero.hp,hp);
    assert.equal(boss.hp,boss.maxHp);
  }
});

test('boss retaliates only against its current aggressor and respects attack intervals',()=>{
  const {match,boss,blue,red}=battlefield();
  blue.hurt(boss,120,'poke',false,'physical','basic');
  assert.equal(boss.aggro,blue.profile.id);
  assert.ok(boss.hp<boss.maxHp);
  match.step(.05);
  assert.ok(blue.hero.hp<blue.hero.maxHp);
  assert.equal(red.hero.hp,red.hero.maxHp);
  assert.ok(boss.attackCooldown>0);
  const lastHP=blue.hero.hp;
  match.step(.3);
  assert.ok(blue.hero.hp>=lastHP); // Between attacks: passive health regeneration only.
  red.hurt(boss,40,'steal',false,'physical','basic');
  assert.equal(boss.aggro,red.profile.id);
  assert.equal(boss.lastDamager,red.profile.id);
  match.step(EPIC_COMBAT.dragon.interval);
  assert.ok(red.hero.hp<red.hero.maxHp);
});

test('dragon pursues attacker inside leash and stops while rooted or stunned',()=>{
  const {match,boss,blue}=battlefield();
  blue.hero.x=boss.point.x+200;blue.hero.y=boss.point.y;
  blue.anchor={x:blue.hero.x,y:blue.hero.y};
  blue.hurt(boss,50,'poke',false,'physical','basic');
  const origin={...boss.point};
  match.step(.5);
  assert.ok(boss.x>origin.x);
  assert.ok(distance(boss,boss.point)<EPIC_COMBAT.dragon.leash);
  const previous=boss.x;
  boss.rooted=1;
  match.step(.2);
  assert.equal(boss.x,previous);
  boss.rooted=0;
  boss.stunned=1;
  match.step(.2);
  assert.equal(boss.x,previous);
  boss.stunned=0;
  match.step(.2);
  assert.ok(boss.x>previous);
});

test('boss loses aggro when target leaves leash and resets HP, statuses, cooldown and generation',()=>{
  const {match,boss,blue}=battlefield();
  blue.hero.x=boss.point.x+220;blue.hero.y=boss.point.y;
  blue.anchor={x:blue.hero.x,y:blue.hero.y};
  blue.hurt(boss,500,'poke',false,'physical','basic');
  match.step(.7);
  assert.ok(distance(boss,boss.point)>0);
  assert.ok(boss.hp<boss.maxHp);
  const generation=boss.generation;
  boss.slow=.25;
  boss.slowRemaining=3;
  blue.hero.x=boss.point.x+EPIC_COMBAT.dragon.leash+60;
  blue.hero.y=boss.point.y;
  blue.anchor={x:blue.hero.x,y:blue.hero.y};
  match.step(4);
  assert.equal(boss.aggro,null);
  assert.equal(distance(boss,boss.point),0);
  assert.equal(boss.hp,boss.maxHp);
  assert.equal(boss.lastDamager,null);
  assert.equal(boss.slow,0);
  assert.equal(boss.attackCooldown,0);
  assert.equal(boss.generation,generation+1);
});

test('dead aggressor clears boss hostility without attacking buildings or minions',()=>{
  const {match,boss,blue}=battlefield('baron');
  blue.hurt(boss,130,'poke',false,'physical','basic');
  const gen=boss.generation;
  blue.receiveDamage(1e9);
  match.step(RULES.step);
  assert.equal(boss.aggro,null);
  assert.equal(boss.hp,boss.maxHp);
  assert.equal(boss.generation,gen+1);
});

test('Baron has independent attack, leash and pursuit configuration',()=>{
  const {match,boss,red}=battlefield('baron');
  assert.equal(boss.maxHp,EPIC_COMBAT.baron.hp);
  assert.ok(EPIC_COMBAT.baron.attack>EPIC_COMBAT.dragon.attack);
  red.hero.x=boss.point.x-180;red.hero.y=boss.point.y;
  red.anchor={x:red.hero.x,y:red.hero.y};
  red.hurt(boss,70,'poke',false,'physical','basic');
  const x=boss.x;
  match.step(.5);
  assert.ok(boss.x<x);
  assert.equal(boss.aggro,red.profile.id);
  red.hero.x=boss.point.x-EPIC_COMBAT.baron.leash-50;
  red.anchor={x:red.hero.x,y:red.hero.y};
  match.step(3);
  assert.equal(boss.hp,boss.maxHp);
  assert.equal(boss.aggro,null);
});

test('boss death and respawn do not preserve previous aggro or incomplete health',()=>{
  const {match,boss,blue}=battlefield();
  blue.hurt(boss,160,'poke',false,'physical','basic');
  const previousGeneration=boss.generation;
  boss.receiveDamage(1e9,'physical');
  assert.equal(boss.alive,false);
  match.objectives.step(boss.nextSpawnAt!);
  assert.equal(boss.alive,true);
  assert.equal(boss.hp,boss.maxHp);
  assert.equal(boss.aggro,null);
  assert.equal(boss.lastDamager,null);
  assert.equal(boss.generation,previousGeneration+1);
  assert.equal(distance(boss,boss.point),0);
});

test('original jungle monster retaliates after shared combat refactor',()=>{
  const match=new BattlefieldMatch();
  match.nextWave=Infinity;
  match.elapsed=JUNGLE.firstSpawn;
  match.jungle.step(match.elapsed);
  const camp=match.jungle.camp('blue-red'),blue=match.members[3];
  blue.hero.x=camp.x+20;blue.hero.y=camp.y;
  blue.anchor={x:blue.hero.x,y:blue.hero.y};
  blue.hurt(camp,75,'test',false,'physical','basic');
  const before=blue.hero.hp;
  match.step(.05);
  assert.ok(blue.hero.hp<before);
  const hp=camp.hp;
  blue.hero.x=camp.point.x+JUNGLE.monster.leash+40;
  blue.anchor={x:blue.hero.x,y:blue.hero.y};
  match.step(.05);
  assert.equal(camp.hp,camp.maxHp);
  assert.ok(camp.hp>hp);
});

test('objective combat rejects nonfinite or negative simulation durations',()=>{
  const {boss}=battlefield();
  assert.throws(()=>boss.step(120,-1));
  assert.throws(()=>boss.step(120,Number.NaN));
});
