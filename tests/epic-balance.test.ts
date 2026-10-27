import test from 'node:test';
import assert from 'node:assert/strict';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { RULES } from '../src/game/config.ts';

test('09e-6 natural ten-minute match observation: objective activity and visible lane pressure',()=>{
  const match=new BattlefieldMatch({ai:true});
  const limit=10*60;
  const states:Record<string,number>={};
  let pressuredRaids=0,observations=0,visibleBossSamples=0;
  const minimumHP={dragon:100,baron:100};
  // Fixed in-game simulation step. Stop on natural nexus destruction instead
  // of claiming a full ten-minute match was played when it ended early.
  for(let frame=0;frame<Math.round(limit/RULES.step)&&!match.result;frame++){
    match.step(RULES.step);
    if(frame%Math.round(1/RULES.step)!==0)continue;
    observations++;
    for(const brain of match.ai){
      states[brain.state]=(states[brain.state]??0)+1;
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
    observations,states,visibleBossSamples,pressuredRaids,minimumHP,
    dragonStacks:match.epicRewards.red.dragonStacks,
    baronActive:match.epicRewards.red.hasBaron(match.elapsed),
    buildings:{blue:match.structures('blue').filter(u=>u.alive).length,red:match.structures('red').filter(u=>u.alive).length},
  }));
  assert.ok(match.elapsed>0);
  assert.equal(pressuredRaids,0,'AI must not raid during visible home-lane emergency');
  assert.ok(Object.values(states).every(n=>Number.isFinite(n)&&n>=0));
});
