import test from 'node:test';
import assert from 'node:assert/strict';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { RULES } from '../src/game/config.ts';
import { EPIC_OBJECTIVES } from '../src/game/EpicObjectives.ts';
import { chooseSiegePlan } from '../src/game/SiegePlanning.ts';

test('09e-6 natural fifteen-minute match observation: objective activity and visible lane pressure',()=>{
  const match=new BattlefieldMatch({ai:true});
  const limit=15*60;
  const states:Record<string,number>={};
  let pressuredRaids=0,observations=0,visibleBossSamples=0,baronEscortSeconds=0;
  let baronBearerSeconds=0,reachableSiegeSeconds=0,empoweredMinionSeconds=0;
  const minimumHP={dragon:100,baron:100};
  // Fixed in-game simulation step. Stop on natural nexus destruction instead
  // of claiming a full ten-minute match was played when it ended early.
  for(let frame=0;frame<Math.round(limit/RULES.step)&&!match.result;frame++){
    match.step(RULES.step);
    if(frame%Math.round(1/RULES.step)!==0)continue;
    observations++;
    if(match.epicRewards.red.hasBaron(match.elapsed)){
      for(const actor of match.opponents)if(actor.baronActive){
        baronBearerSeconds++;
        if(chooseSiegePlan(match,actor))reachableSiegeSeconds++;
      }
      empoweredMinionSeconds+=match.minions('red').filter(unit=>match.baronEmpowersMinion(unit)).length;
    }
    for(const brain of match.ai){
      states[brain.state]=(states[brain.state]??0)+1;
      if(brain.state==='siege-escort'&&brain.actor.baronActive)baronEscortSeconds++;
      if(brain.role!=='jungle'&&['epic-fight','epic-rally','epic-steal'].includes(brain.state)&&
        brain.laneNeedsDefense('red',brain.role))pressuredRaids++;
    }
    for(const boss of match.objectives.objectives){
      if(match.canSee('red',boss))visibleBossSamples++;
      if(boss.alive)minimumHP[boss.id]=Math.min(minimumHP[boss.id],
        Math.round(100*boss.hp/boss.maxHp));
    }
  }
  console.info('[09e-6 match balance]',JSON.stringify({
    seconds:Math.round(match.elapsed),result:match.result,
    observations,states,visibleBossSamples,pressuredRaids,
    baronEscortSeconds,baronBearerSeconds,reachableSiegeSeconds,empoweredMinionSeconds,
    blueNexusHp:Math.round(match.structure('blue','nexus').hp),minimumHP,
    objectiveKills:Object.fromEntries(match.objectives.objectives.map(b=>[b.id,b.lastDefeatedAt===null?0:1])),
    championLevels:match.opponents.map(a=>a.progression.level),
    dragonStacks:match.epicRewards.red.dragonStacks,
    baronActive:match.epicRewards.red.hasBaron(match.elapsed),
    buildings:{blue:match.structures('blue').filter(u=>u.alive).length,red:match.structures('red').filter(u=>u.alive).length},
  }));
  assert.ok(match.elapsed>=600,'Natural match must progress at least ten minutes before balance is evaluated');
  assert.ok((states['epic-rally']??0)+(states['epic-fight']??0)+(states['epic-steal']??0)>0,
    'AI must attempt a visible objective rather than merely completing a timer');
  assert.equal(pressuredRaids,0,'AI must not raid during visible home-lane emergency');
  assert.ok(Object.values(states).every(n=>Number.isFinite(n)&&n>=0));
});

test('09e-6 healthy mid-game AI takes a full-health visible Dragon without manually reducing boss HP',()=>{
  const match=new BattlefieldMatch({ai:true});
  match.nextWave=Infinity;
  for(const building of match.structures())if(building.role==='outer'||building.role==='inner')building.alive=false;
  match.elapsed=EPIC_OBJECTIVES.dragon.firstSpawn;
  match.objectives.step(match.elapsed);
  const dragon=match.objectives.objective('dragon');
  assert.equal(dragon.hp,dragon.maxHp);
  for(const champion of match.members)Object.assign(champion.hero,{x:100,y:920});
  const offsets=[{x:55,y:35},{x:-65,y:-45},{x:90,y:-25},{x:-90,y:55}];
  for(const [index,actor] of match.opponents.entries()){
    actor.gainExperience(1540); // level 8: attainable before the mid-game objective window
    Object.assign(actor.hero,{
      x:dragon.x+offsets[index].x,y:dragon.y+offsets[index].y,
      hp:actor.hero.maxHp,mana:actor.maxMana,
    });
    actor.anchor={x:actor.hero.x,y:actor.hero.y};
  }
  match.refreshVision();
  const initial=match.economy.red.earned;
  for(let i=0;i<Math.round(75/RULES.step)&&dragon.alive&&!match.result;i++)match.step(RULES.step);
  assert.equal(dragon.alive,false,
    `Three-hero level-8 group should finish unmodified dragon: HP ${Math.round(dragon.hp)}/${dragon.maxHp}, AI ${match.ai.map(a=>a.state).join(',')}`);
  assert.equal(match.epicRewards.red.dragonStacks,1);
  assert.equal(match.epicRewards.blue.dragonStacks,0);
  assert.ok(match.economy.red.earned>=initial+150);
});
