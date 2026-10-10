import test from 'node:test';
import assert from 'node:assert/strict';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { BATTLEFIELD_AI_RULES } from '../src/game/BattlefieldAI.ts';
import { chooseJungleCamp, jungleCampPath, JUNGLE_AI_RULES } from '../src/game/JunglePlanning.ts';
import { JUNGLE, JungleState } from '../src/game/Jungle.ts';
import { BATTLEFIELD_NAVIGATION, NavigationGraph } from '../src/game/navigation.ts';
import { RULES, distance } from '../src/game/config.ts';

const step=(match:BattlefieldMatch,seconds:number)=>{
  for(let i=0;i<Math.round(seconds/RULES.step);i++)match.step(RULES.step);
};
const openCamps=(match:BattlefieldMatch)=>{
  match.elapsed=JUNGLE.firstSpawn;
  match.jungle.step(match.elapsed);
  match.refreshVision();
};

test('jungle camp planner ignores dead and enemy-side camps, and uses reachable graph paths',()=>{
  const state=new JungleState();
  state.step(JUNGLE.firstSpawn);
  const from=BATTLEFIELD_NAVIGATION.node('red-base').point;
  const plan=chooseJungleCamp(from,'red',state.camps);
  assert.ok(plan);
  assert.equal(plan.camp.id,'red-red');
  assert.equal(plan.pathIds[0],'red-base');
  assert.equal(plan.pathIds.at(-1),'red-jungle-top');
  assert.ok(plan.pathDistance>0);

  state.camp('red-red').defeat(JUNGLE.firstSpawn);
  const alternate=chooseJungleCamp(from,'red',state.camps);
  assert.ok(alternate);
  assert.equal(alternate.camp.id,'red-blue');
  state.camp('red-blue').defeat(JUNGLE.firstSpawn);
  assert.equal(chooseJungleCamp(from,'red',state.camps),null);
});

test('jungle camp planner respects a current reachable target until it is defeated',()=>{
  const state=new JungleState();
  state.step(JUNGLE.firstSpawn);
  const from=BATTLEFIELD_NAVIGATION.node('red-jungle-top').point;
  const keep=chooseJungleCamp(from,'red',state.camps,'red-blue');
  assert.equal(keep?.camp.id,'red-blue');
  state.camp('red-blue').defeat(JUNGLE.firstSpawn);
  assert.equal(chooseJungleCamp(from,'red',state.camps,'red-blue')?.camp.id,'red-red');
});

test('jungle planner skips camps on disconnected graph nodes rather than inventing paths',()=>{
  const state=new JungleState();
  state.step(JUNGLE.firstSpawn);
  const separated=new NavigationGraph([
    {id:'red-base',point:{x:1460,y:160},tags:['base']},
    {id:'red-jungle-top',point:{x:1130,y:240},tags:['jungle']},
    {id:'red-jungle-bottom',point:{x:1210,y:500},tags:['jungle']},
  ],[['red-base','red-jungle-bottom']]);
  assert.equal(jungleCampPath(separated.node('red-base').point,state.camp('red-red'),separated),null);
  const plan=chooseJungleCamp(separated.node('red-base').point,'red',state.camps,null,separated);
  assert.equal(plan?.camp.id,'red-blue');
});

test('jungle AI approaches a home camp by navigation waypoint instead of cutting straight across the map',()=>{
  const match=new BattlefieldMatch({ai:true});
  openCamps(match);
  const brain=match.ai[3],actor=brain.actor;
  actor.hero.x=1460;actor.hero.y=160;
  actor.anchor={x:1460,y:160};
  match.refreshVision();
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'camp-approach');
  assert.equal(actor.command.kind,'move');
  if(actor.command.kind==='move'){
    const goal=BATTLEFIELD_NAVIGATION.node('top-red-inner').point;
    assert.deepEqual(actor.command.point,goal);
    assert.ok(distance(actor.command.point,match.jungle.camp('red-red').point)>JUNGLE_AI_RULES.attackInitiateRange);
  }
});

test('jungle AI attacks a visible home camp using the existing combat command',()=>{
  const match=new BattlefieldMatch({ai:true});
  openCamps(match);
  const brain=match.ai[3],actor=brain.actor;
  const camp=match.jungle.camp('red-red');
  actor.hero.x=camp.x;actor.hero.y=camp.y;
  actor.anchor={x:camp.x,y:camp.y};
  match.refreshVision();
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'camp-fight');
  assert.equal(actor.command.kind,'attack');
  if(actor.command.kind==='attack'){
    assert.equal(actor.command.targetId,camp.id);
    assert.equal(actor.command.generation,camp.generation);
  }
});

test('jungle AI switches to another home camp after the selected one dies, and patrols when both are down',()=>{
  const match=new BattlefieldMatch({ai:true});
  openCamps(match);
  const brain=match.ai[3],actor=brain.actor;
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'camp-fight');
  const first=match.jungle.camp('red-red');
  first.defeat(match.elapsed);
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'camp-approach');
  assert.equal(actor.command.kind,'move');
  const second=match.jungle.camp('red-blue');
  second.defeat(match.elapsed);
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'river-patrol');
});

test('jungle AI can finish a monster and receive its buff, XP and team gold through ordinary combat',()=>{
  const match=new BattlefieldMatch({ai:true});
  openCamps(match);
  const brain=match.ai[3],actor=brain.actor;
  const camp=match.jungle.camp('red-red');
  // Leave a partly damaged camp to verify the complete AI attack->kill->reward
  // integration without coupling this regression to a future balance revision.
  camp.hp=220;
  const gold=match.economy.red.earned, xp=actor.progression.totalXp;
  for(let i=0;i<Math.round(12/RULES.step)&&camp.alive;i++)match.step(RULES.step);
  assert.equal(camp.alive,false);
  assert.equal(camp.lastDamager,actor.profile.id);
  assert.ok(match.economy.red.earned>=gold+JUNGLE.reward.gold);
  assert.ok(actor.progression.totalXp>=xp+JUNGLE.reward.xp/4);
  assert.ok(actor.buffs.red>0);
});

test('full-health home jungle camp is farmable by autonomous Amumu before its first respawn',()=>{
  const match=new BattlefieldMatch({ai:true});
  openCamps(match);
  // Disable unrelated lane brains to isolate the jungle battle without modifying
  // monster health, attack stats, the champion kit, or its potion.
  const brain=match.ai[3];
  match.ai=[brain];
  const camp=match.jungle.camp('red-red');
  assert.equal(camp.hp,JUNGLE.monster.hp);
  const trace:{time:number;campHP:number;heroHP:number;state:string;command:string;aggro:string|null}[]=[];
  for(let i=0;i<Math.round(65/RULES.step)&&camp.lastDefeatedAt===null&&match.result===null;i++){
    match.step(RULES.step);
    if(i%Math.round(5/RULES.step)===0)trace.push({
      time:Math.round(match.elapsed),campHP:Math.round(camp.hp),
      heroHP:Math.round(brain.actor.hero.hp),state:brain.state,
      command:brain.actor.command.kind,aggro:camp.aggro,
    });
  }
  assert.ok(camp.lastDefeatedAt!==null,`Amumu failed to clear a full-health own camp: ${JSON.stringify(trace)}`);
  assert.ok(match.economy.red.earned>=JUNGLE.reward.gold);
});

test('jungle AI commits to a nearly cleared camp but honors emergency low-health retreat',()=>{
  const match=new BattlefieldMatch({ai:true});
  openCamps(match);
  const brain=match.ai[3],actor=brain.actor;
  const camp=match.jungle.camp('red-red');
  camp.hp=camp.maxHp*.1;
  camp.aggro=actor.profile.id;
  actor.hero.hp=actor.hero.maxHp*.28;
  match.refreshVision();
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'camp-fight');

  actor.hero.hp=actor.hero.maxHp*.1;
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.ok(['recall','retreat','recover'].includes(brain.state));
});
