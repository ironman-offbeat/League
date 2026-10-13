import test from 'node:test';
import assert from 'node:assert/strict';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { EPIC_OBJECTIVES } from '../src/game/EpicObjectives.ts';
import { EpicTeamRewards, EPIC_REWARDS } from '../src/game/EpicRewards.ts';
import { PROGRESSION } from '../src/game/progression.ts';

function spawned(kind:'dragon'|'baron',elapsed?:number){
  const match=new BattlefieldMatch();
  match.nextWave=Infinity;
  match.elapsed=elapsed??EPIC_OBJECTIVES[kind].firstSpawn;
  match.objectives.step(match.elapsed);
  return {match,boss:match.objectives.objective(kind)};
}
const finish=(boss:ReturnType<typeof spawned>['boss'],actor:BattlefieldMatch['members'][number])=>{
  actor.hurt(boss,1e9,'last hit',false,'physical','basic');
  assert.equal(boss.alive,false);
};

test('dragon last hit grants only the killer team gold, permanent stack and nearby shared XP',()=>{
  const {match,boss}=spawned('dragon');
  const killer=match.members[0];
  const helper=match.members[1];
  const far=match.members[2];
  killer.hero.x=boss.x;killer.hero.y=boss.y;
  helper.hero.x=boss.x+20;helper.hero.y=boss.y;
  far.hero.x=boss.x+PROGRESSION.rewardRange+20;far.hero.y=boss.y;
  const redActor=match.opponents[0];
  redActor.hero.x=boss.x+30;redActor.hero.y=boss.y;
  const baseBlueGold=match.economy.blue.gold;
  const baseRedGold=match.economy.red.gold;
  const before=[killer,helper,far,redActor].map(a=>a.progression.totalXp);
  redActor.hurt(boss,150,'opening',false,'physical','basic');
  finish(boss,killer);
  assert.equal(boss.lastDamager,killer.profile.id);
  assert.equal(match.economy.blue.gold,baseBlueGold+EPIC_REWARDS.dragon.gold);
  assert.equal(match.economy.red.gold,baseRedGold);
  assert.equal(match.epicRewards.blue.dragonStacks,1);
  assert.equal(match.epicRewards.red.dragonStacks,0);
  assert.equal(killer.progression.totalXp-before[0],EPIC_REWARDS.dragon.xp/2);
  assert.equal(helper.progression.totalXp-before[1],EPIC_REWARDS.dragon.xp/2);
  assert.equal(far.progression.totalXp-before[2],0);
  assert.equal(redActor.progression.totalXp-before[3],0);
});

test('dragon last-hit steal awards only red team despite blue damage contribution',()=>{
  const {match,boss}=spawned('dragon');
  const blue=match.members[0],red=match.opponents[0];
  blue.hero.x=boss.x;blue.hero.y=boss.y;
  red.hero.x=boss.x;red.hero.y=boss.y;
  const blueGold=match.economy.blue.gold;
  const redGold=match.economy.red.gold;
  blue.hurt(boss,200,'blue poke',false,'physical','basic');
  finish(boss,red);
  assert.equal(boss.lastDamager,red.profile.id);
  assert.equal(match.economy.blue.gold,blueGold);
  assert.equal(match.economy.red.gold,redGold+EPIC_REWARDS.dragon.gold);
  assert.equal(match.epicRewards.red.dragonStacks,1);
  assert.equal(match.epicRewards.blue.dragonStacks,0);
});

test('dragon stacks persist through respawns, while every real kill grants at most one stack',()=>{
  const {match,boss}=spawned('dragon');
  const killer=match.members[0];
  finish(boss,killer);
  const gold=match.economy.blue.gold;
  assert.equal(boss.defeat(match.elapsed),false);
  assert.equal(match.epicRewards.blue.dragonStacks,1);
  assert.equal(match.economy.blue.gold,gold);
  match.elapsed=boss.nextSpawnAt!;
  match.objectives.step(match.elapsed);
  assert.equal(boss.lastDamager,null);
  finish(boss,killer);
  assert.equal(match.epicRewards.blue.dragonStacks,2);
  assert.equal(match.economy.blue.gold,gold+EPIC_REWARDS.dragon.gold);
  match.elapsed+=10000;
  assert.equal(match.epicRewards.blue.dragonStacks,2);
});

test('baron awards the correct team and sets a renewable temporary team timer',()=>{
  const {match,boss}=spawned('baron');
  const red=match.opponents[3];
  red.hero.x=boss.x;red.hero.y=boss.y;
  finish(boss,red);
  const state=match.epicRewards.red;
  assert.equal(state.hasBaron(match.elapsed),true);
  assert.equal(state.baronRemaining(match.elapsed),EPIC_REWARDS.baron.duration);
  assert.equal(match.epicRewards.blue.hasBaron(match.elapsed),false);
  assert.equal(match.economy.red.gold,PROGRESSION.startingGold+EPIC_REWARDS.baron.gold);
  const initial=match.elapsed;
  assert.equal(state.baronRemaining(initial+37),EPIC_REWARDS.baron.duration-37);
  assert.equal(state.hasBaron(initial+EPIC_REWARDS.baron.duration),false);
  match.elapsed=boss.nextSpawnAt!;
  match.objectives.step(match.elapsed);
  finish(boss,red);
  assert.equal(state.baronRemaining(match.elapsed),EPIC_REWARDS.baron.duration);
  assert.equal(match.epicRewards.red.dragonStacks,0);
});

test('uncredited forced boss defeats give no gold, xp, stack or baron timer',()=>{
  const {match,boss}=spawned('dragon');
  const gold=match.economy.blue.gold,redGold=match.economy.red.gold;
  assert.equal(boss.defeat(match.elapsed),true);
  assert.equal(boss.defeat(match.elapsed),false);
  assert.equal(match.economy.blue.gold,gold);
  assert.equal(match.economy.red.gold,redGold);
  assert.equal(match.epicRewards.blue.dragonStacks,0);
  assert.equal(match.epicRewards.red.dragonStacks,0);
  const baron=match.objectives.objective('baron');
  match.elapsed=EPIC_OBJECTIVES.baron.firstSpawn;
  match.objectives.step(match.elapsed);
  assert.equal(baron.defeat(match.elapsed),true);
  assert.equal(match.epicRewards.blue.baronRemaining(match.elapsed),0);
  assert.equal(match.epicRewards.red.baronRemaining(match.elapsed),0);
});

test('no nearby eligible champions still awards team gold and owner buff state',()=>{
  const {match,boss}=spawned('baron');
  const killer=match.members[0];
  // An already-landed projectile may finish a monster while its caster is far away.
  const xp=match.actors.map(a=>a.progression.totalXp);
  finish(boss,killer);
  assert.equal(match.economy.blue.gold,PROGRESSION.startingGold+EPIC_REWARDS.baron.gold);
  assert.equal(match.epicRewards.blue.hasBaron(match.elapsed),true);
  assert.deepEqual(match.actors.map(a=>a.progression.totalXp),xp);
});

test('unattributed reward state does not leak to a new match, and match result blocks credit',()=>{
  const match=new BattlefieldMatch();
  match.epicRewards.blue.grant('dragon',0);
  match.epicRewards.red.grant('baron',500);
  const fresh=new BattlefieldMatch();
  assert.equal(fresh.epicRewards.blue.dragonStacks,0);
  assert.equal(fresh.epicRewards.red.baronExpiresAt,0);
  const {match:ended,boss}=spawned('dragon');
  ended.result='defeat';
  const gold=ended.economy.blue.gold;
  finish(boss,ended.members[0]);
  assert.equal(ended.economy.blue.gold,gold);
  assert.equal(ended.epicRewards.blue.dragonStacks,0);
});

test('team buff reward timestamps are validated and dragon does not erase Baron buff',()=>{
  const state=new EpicTeamRewards();
  assert.throws(()=>state.grant('dragon',NaN));
  assert.throws(()=>state.grant('baron',-1));
  assert.throws(()=>state.baronRemaining(Infinity));
  state.grant('baron',600);
  state.grant('dragon',610);
  assert.equal(state.dragonStacks,1);
  assert.equal(state.baronRemaining(610),EPIC_REWARDS.baron.duration-10);
  state.grant('baron',620);
  assert.equal(state.baronRemaining(620),EPIC_REWARDS.baron.duration);
});
