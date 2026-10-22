import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat } from '../src/game/combat.ts';
import { RULES } from '../src/game/config.ts';
import { BattlefieldMatch, BATTLEFIELD } from '../src/game/BattlefieldMatch.ts';
import { EPIC_OBJECTIVES } from '../src/game/EpicObjectives.ts';
import { EPIC_EFFECTS, EPIC_REWARDS } from '../src/game/EpicRewards.ts';
import { damageTarget } from '../src/game/targets.ts';
import { mitigate } from '../src/game/effects.ts';

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
type Kind='dragon'|'baron';
function slay(match:BattlefieldMatch,kind:Kind,killer:Combat){
  match.elapsed=Math.max(match.elapsed,EPIC_OBJECTIVES[kind].firstSpawn);
  match.objectives.step(match.elapsed);
  const boss=match.objectives.objective(kind);
  assert.equal(boss.alive,true);
  killer.hurt(boss,1e9,'epic last hit',false,'physical','basic');
  assert.equal(boss.alive,false);
  return boss;
}
function dummy(){
  const target=new Combat().enemies[0];
  Object.assign(target,{hp:10000,maxHp:10000,armor:0,magicResist:0,alive:true,protected:false,damageScale:1});
  return target;
}

test('Dragon provides one additive 4% health stack to both living and dead team champions',()=>{
  const match=new BattlefieldMatch(),live=match.members[0],dead=match.members[1];
  live.hero.hp-=125;
  dead.receiveDamage(1e9);
  const deadBase=dead.hero.maxHp;
  const boss=slay(match,'dragon',live);
  assert.equal(match.epicRewards.blue.dragonStacks,1);
  for(const c of match.members){
    assert.equal(c.dragonStacks,1);
    near(c.hero.maxHp,c.baseHealth*1.04);
  }
  near(live.hero.maxHp-live.hero.hp,125);
  assert.equal(dead.hero.hp,0);
  near(dead.hero.maxHp,deadBase+dead.baseHealth*.04);
  dead.enemies=[];
  dead.step(30);
  near(dead.hero.hp,dead.hero.maxHp);
  match.elapsed=boss.nextSpawnAt!;
  slay(match,'dragon',live);
  for(const c of match.members){assert.equal(c.dragonStacks,2);near(c.hero.maxHp,c.baseHealth*1.08);}
  assert.equal(match.opponents[0].dragonStacks,0);
});

test('Dragon health bonus includes level and equipment growth without compounding or double-counting ultimate',()=>{
  const match=new BattlefieldMatch(),c=match.members[0];
  slay(match,'dragon',c);
  c.hero.hp-=75;
  c.gainExperience(420);
  near(c.hero.maxHp-c.hero.hp,75);
  near(c.hero.maxHp,c.baseHealth*1.04);
  match.economy.blue.gold=2000;
  Object.assign(c.hero,c.profile.spawn);
  assert.equal(match.purchase(c,'armor'),true);
  near(c.hero.maxHp,c.baseHealth*1.04);
  near(c.hero.maxHp-c.hero.hp,75);
  const baseline=c.hero.maxHp;
  assert.equal(c.castUltimate(),true);
  near(c.hero.maxHp,baseline+c.ultimateHealth);
  c.enemies=[];
  c.step(11);
  near(c.hero.maxHp,baseline);
  c.receiveDamage(1e9);
  near(c.hero.maxHp,c.baseHealth*1.04);
  c.step(30);
  near(c.hero.hp,c.hero.maxHp);
});

test('Dragon and Baron damage increases apply at the shared champion damage entry without exponential stacking',()=>{
  const match=new BattlefieldMatch(),actor=match.members[0];
  let t=dummy();
  actor.hurt(t,100,'base',false,'physical','basic');
  near(10000-t.hp,100);
  const dragon=slay(match,'dragon',actor);
  t=dummy();actor.hurt(t,100,'dragon',false,'physical','basic');
  near(10000-t.hp,104);
  match.elapsed=dragon.nextSpawnAt!;
  slay(match,'dragon',actor);
  t=dummy();actor.hurt(t,100,'dragon 2',false,'magic','skill');
  near(10000-t.hp,108);
  slay(match,'baron',actor);
  assert.equal(actor.baronActive,true);
  t=dummy();actor.hurt(t,100,'both',false,'physical','basic');
  near(10000-t.hp,100*(1+2*EPIC_EFFECTS.dragon.damagePerStack+EPIC_EFFECTS.baron.championDamage));
  actor.receiveDamage(1e9);
  assert.equal(actor.baronRemaining,0);
  actor.enemies=[];
  actor.step(30);
  t=dummy();actor.hurt(t,100,'after respawn',false,'physical','basic');
  near(10000-t.hp,108);
});

test('Baron grants 180 seconds only to living captures, refreshes on repeat and is lost on death',()=>{
  const match=new BattlefieldMatch(),dead=match.members[2];
  dead.receiveDamage(1e9);
  const boss=slay(match,'baron',match.members[0]);
  assert.equal(match.epicRewards.blue.baronRemaining(match.elapsed),EPIC_REWARDS.baron.duration);
  assert.equal(dead.baronActive,false);
  for(const c of match.members.filter(c=>c.alive)){assert.equal(c.baronActive,true);near(c.baronRemaining,180);}
  for(const c of match.opponents)assert.equal(c.baronActive,false);
  const bearer=match.members[0];
  bearer.receiveDamage(1e9);
  bearer.enemies=[];bearer.step(30);
  assert.equal(bearer.baronActive,false);
  match.elapsed=boss.nextSpawnAt!;
  slay(match,'baron',match.members[1]);
  assert.equal(bearer.baronActive,true);
  match.members[1].enemies=[];match.members[1].step(181);
  assert.equal(match.members[1].baronActive,false);
  match.elapsed+=181;
  assert.equal(match.epicRewards.blue.hasBaron(match.elapsed),false);
});

test('Baron minion aura reduces all incoming damage and clears when the only carrier dies',()=>{
  const match=new BattlefieldMatch();
  match.step(10);
  match.nextWave=Infinity;
  const minion=match.minions('blue','top')[0];
  slay(match,'baron',match.members[0]);
  for(const c of match.members)Object.assign(c.hero,{x:-1000,y:-1000});
  Object.assign(match.members[0].hero,{x:minion.x,y:minion.y});
  match.step(RULES.step);
  assert.equal(match.baronEmpowersMinion(minion),true);
  near(minion.damageScale!,1-EPIC_EFFECTS.baron.minionDamageReduction);
  const hp=minion.hp;
  damageTarget(minion,100,'physical','basic');
  near(hp-minion.hp,mitigate(75,minion.armor));
  match.members[0].receiveDamage(1e9);
  match.step(RULES.step);
  assert.equal(match.baronEmpowersMinion(minion),false);
  near(minion.damageScale!,1);
});

test('newly spawned minions receive Baron protection near a living bearer, never by stacking auras',()=>{
  const match=new BattlefieldMatch();
  match.nextWave=Infinity;
  slay(match,'baron',match.members[0]);
  for(const c of match.members)Object.assign(c.hero,{x:-1000,y:-1000});
  Object.assign(match.members[0].hero,{...match.lanePoint('blue','top',BATTLEFIELD.waveSpawnDistance)});
  Object.assign(match.members[1].hero,{...match.members[0].hero});
  match.nextWave=match.elapsed+RULES.step;
  match.step(RULES.step);
  const minion=match.minions('blue','top')[0];
  assert.equal(match.baronEmpowersMinion(minion),true);
  near(minion.damageScale!,.75);
  for(const c of match.members)Object.assign(c.hero,{x:-1000,y:-1000});
  match.step(RULES.step);
  near(minion.damageScale!,1);
});

test('Baron nearby minions inflict 40% more building damage, expiring back to baseline',()=>{
  const match=new BattlefieldMatch();
  match.step(10);
  match.nextWave=Infinity;
  const minion=match.minions('blue','top').find(u=>u.role==='melee')!;
  const building=match.structure('red','outer','top');
  // Isolate a building-only attack: otherwise the first wave's enemy minions
  // correctly take priority over structures and no structure damage occurs.
  for(const enemy of match.minions('red','top'))enemy.alive=false;
  for(const enemy of match.opponents)Object.assign(enemy.hero,{x:-1000,y:-1000});
  slay(match,'baron',match.members[0]);
  for(const c of match.members)Object.assign(c.hero,{x:-1000,y:-1000});
  Object.assign(match.members[0].hero,{x:building.x,y:building.y});
  Object.assign(minion,{x:building.x,y:building.y,attackCooldown:0});
  const original=building.hp;
  match.step(RULES.step);
  near(original-building.hp,mitigate(BATTLEFIELD.minions.melee.attack*1.4,building.armor));
  match.elapsed+=EPIC_REWARDS.baron.duration;
  minion.attackCooldown=0;
  const hp=building.hp;
  match.step(RULES.step);
  near(hp-building.hp,mitigate(BATTLEFIELD.minions.melee.attack,building.armor));
});

test('epic effects remain match-local; permanent dragon does not leak into one-lane mode',()=>{
  const match=new BattlefieldMatch();
  slay(match,'dragon',match.members[0]);
  slay(match,'baron',match.opponents[0]);
  const fresh=new BattlefieldMatch();
  assert.equal(fresh.members[0].dragonStacks,0);
  assert.equal(fresh.members[0].baronRemaining,0);
  assert.equal(fresh.opponents[0].dragonStacks,0);
  assert.equal(fresh.epicRewards.blue.dragonStacks,0);
  assert.equal(fresh.epicRewards.red.baronRemaining(0),0);
});
