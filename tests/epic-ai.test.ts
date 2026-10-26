import test from 'node:test';
import assert from 'node:assert/strict';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { BattlefieldAI, BATTLEFIELD_AI_RULES } from '../src/game/BattlefieldAI.ts';
import { chooseEpicPlan, EPIC_AI_RULES } from '../src/game/EpicPlanning.ts';
import { EPIC_OBJECTIVES } from '../src/game/EpicObjectives.ts';
import { RULES } from '../src/game/config.ts';
import type { BattlefieldTeam } from '../src/game/BattlefieldMatch.ts';

type Kind='dragon'|'baron';
const step=(m:BattlefieldMatch,seconds:number)=>{
  for(let i=0;i<Math.round(seconds/RULES.step);i++)m.step(RULES.step);
};
function spawn(kind:Kind,ai=true){
  const m=new BattlefieldMatch({ai});
  m.nextWave=Infinity;
  m.elapsed=EPIC_OBJECTIVES[kind].firstSpawn;
  m.objectives.step(m.elapsed);
  return {m,boss:m.objectives.objective(kind)};
}
function side(m:BattlefieldMatch,kind:Kind,team:BattlefieldTeam='red'){
  const boss=m.objectives.objective(kind),members=m.teamMembers(team);
  members.forEach((actor,i)=>{
    const dx=[55,-65,90,-90][i],dy=[35,-45,-25,55][i];
    Object.assign(actor.hero,{x:boss.x+dx,y:boss.y+dy});
    actor.anchor={x:actor.hero.x,y:actor.hero.y};
  });
  m.refreshVision();
  return members;
}
function ctx(m:BattlefieldMatch,actor=m.opponents[0],team:BattlefieldTeam='red'){
  const enemy:BattlefieldTeam=team==='blue'?'red':'blue';
  return {
    team,actor,allies:m.teamMembers(team),objectives:m.objectives.objectives,
    visibleEnemies:m.teamMembers(enemy).filter(c=>{
      const target=m.championTargets.find(t=>t.id===c.profile.id)!;
      return m.canSee(team,target);
    }).map(c=>c.hero),
    canSeeObjective:(boss:typeof m.objectives.objectives[number])=>m.canSee(team,boss),
    safeFromTowers:()=>true,
  };
}

test('AI cannot infer hidden boss HP or start a boss attack without LIVE team vision',()=>{
  const {m,boss}=spawn('dragon');
  assert.equal(m.canSee('red',boss),false);
  boss.hp=1;
  assert.equal(chooseEpicPlan(ctx(m)),null);
  const actor=m.opponents[0];
  Object.assign(actor.hero,{x:boss.x+45,y:boss.y+30});m.refreshVision();
  assert.equal(m.canSee('red',boss),true);
  assert.equal(chooseEpicPlan(ctx(m))?.mode,'steal');
  Object.assign(actor.hero,{x:1400,y:170});m.refreshVision();
  assert.equal(chooseEpicPlan(ctx(m)),null);
});

test('regular Dragon hunt needs a healthy team and safe graph routes',()=>{
  const {m,boss}=spawn('dragon');
  const members=side(m,'dragon');
  let plan=chooseEpicPlan(ctx(m));
  assert.ok(plan);assert.equal(plan.objective,boss);
  assert.equal(plan.mode,'hunt');assert.equal(plan.minimum,3);
  assert.ok(plan.ready>=3);
  for(const c of members.slice(1))c.hero.hp=c.hero.maxHp*.15;
  assert.equal(chooseEpicPlan(ctx(m)),null);
  for(const c of members)c.hero.hp=c.hero.maxHp;
  assert.equal(chooseEpicPlan({...ctx(m),safeFromTowers:()=>false}),null);
});

test('Baron requires a group, chooses safe participants and supports both sides',()=>{
  const {m,boss}=spawn('baron');
  side(m,'baron');
  const plan=chooseEpicPlan(ctx(m));
  assert.ok(plan);assert.equal(plan.objective,boss);
  assert.equal(plan.minimum,3);
  assert.ok(plan.participants.length>=3);
  assert.equal(plan.pathIds.at(-1),boss.definition.nodeId);
  // Test the other team independently; visible enemy contest should not
  // be confused with lack of a symmetric friendly planning route.
  for(const red of m.opponents)Object.assign(red.hero,{x:1460,y:160});
  side(m,'baron','blue');
  const blue=chooseEpicPlan(ctx(m,m.members[0],'blue'));
  assert.ok(blue);assert.equal(blue.objective.id,'baron');
});

test('Baron hunt refuses known enemies at the pit, but low-HP contest permits an even fight',()=>{
  const {m,boss}=spawn('baron');
  side(m,'baron');
  m.members[0].hero.x=boss.x+15;m.members[0].hero.y=boss.y+25;
  m.refreshVision();
  assert.equal(chooseEpicPlan(ctx(m)),null);
  boss.hp=boss.maxHp*.2;
  assert.equal(chooseEpicPlan(ctx(m))?.mode,'steal');
  for(const blue of m.members)Object.assign(blue.hero,{x:boss.x+30,y:boss.y+25});
  m.refreshVision();
  assert.equal(chooseEpicPlan(ctx(m)),null);
});

test('AI issues an ordinary boss target order only when enough teammates are at the pit',()=>{
  const {m,boss}=spawn('dragon');
  const members=side(m,'dragon');
  const brain=m.ai[0];
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'epic-fight');
  assert.equal(brain.actor.command.kind,'attack');
  if(brain.actor.command.kind==='attack')assert.equal(brain.actor.command.targetId,boss.id);
  for(const actor of members.slice(1))Object.assign(actor.hero,{x:1420,y:180});
  m.refreshVision();
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'epic-withdraw');
  assert.notEqual(brain.actor.command.kind,'attack');
});

test('AI rallies near Dragon without initiating an unsafe solo pull',()=>{
  const {m,boss}=spawn('dragon');
  const members=side(m,'dragon');
  for(let i=1;i<3;i++)Object.assign(members[i].hero,{x:1150+i*30,y:360});
  m.refreshVision();
  const brain=m.ai[0];
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'epic-rally');
  assert.notEqual(brain.actor.command.kind,'attack');
  assert.ok(m.canSee('red',boss));
});

test('jungler scouts a publicly spawned unseen objective without reading its private state',()=>{
  const {m,boss}=spawn('dragon');
  const brain=m.ai[3],actor=brain.actor;
  actor.grantJungleBuff('red');actor.grantJungleBuff('blue');
  m.refreshVision();
  assert.equal(m.canSee('red',boss),false);
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'epic-scout');
  assert.equal(actor.command.kind,'move');
  boss.hp=50;
  assert.equal(chooseEpicPlan(ctx(m,actor)),null);
});

test('wounded jungler keeps existing retreat and does not scout',()=>{
  const {m}=spawn('dragon');
  const brain=m.ai[3],actor=brain.actor;
  actor.hero.hp=actor.hero.maxHp*.15;
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.notEqual(brain.state,'epic-scout');
  assert.notEqual(brain.state,'epic-fight');
  assert.ok(['retreat','recall','recover'].includes(brain.state));
});

test('autonomous group finishes a weakened visible Dragon and receives real team rewards',()=>{
  const {m,boss}=spawn('dragon');
  side(m,'dragon');
  m.ai=m.ai.slice(0,3);
  for(const blue of m.members)Object.assign(blue.hero,{x:100,y:920});
  boss.hp=380;
  m.refreshVision();
  const initial=m.economy.red.gold;
  for(let i=0;i<Math.round(25/RULES.step)&&boss.alive&&!m.result;i++)m.step(RULES.step);
  assert.equal(boss.alive,false,'AI failed to coordinate an objective kill');
  assert.equal(m.epicRewards.red.dragonStacks,1);
  assert.equal(m.epicRewards.blue.dragonStacks,0);
  assert.ok(m.economy.red.gold>=initial+150);
});

test('low-HP contested objective can be stolen using existing last-hit reward logic',()=>{
  const {m,boss}=spawn('dragon');
  const reds=side(m,'dragon');
  for(const blue of m.members)Object.assign(blue.hero,{x:100,y:920});
  const blue=m.members[0];
  blue.hero.x=boss.x+180;blue.hero.y=boss.y;
  blue.hurt(boss,boss.maxHp*1.05,'blue opening',false,'physical','basic');
  assert.ok(boss.hp/boss.maxHp<=EPIC_AI_RULES.stealThreshold);
  m.refreshVision();
  const red=reds[0],brain=m.ai[0];
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'epic-steal');
  assert.equal(red.command.kind,'attack');
  m.ai=m.ai.slice(0,3);
  for(let i=0;i<Math.round(20/RULES.step)&&boss.alive&&!m.result;i++)m.step(RULES.step);
  assert.equal(boss.alive,false);
  assert.equal(boss.lastDamager?.startsWith('red-'),true);
  assert.equal(m.epicRewards.red.dragonStacks,1);
  assert.equal(m.epicRewards.blue.dragonStacks,0);
});

test('loss of Dragon vision immediately cancels a previously issued attack order',()=>{
  const {m,boss}=spawn('dragon');
  side(m,'dragon');
  const brain=m.ai[0];
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'epic-fight');
  for(const red of m.opponents)Object.assign(red.hero,{x:1420,y:180});
  m.refreshVision();
  assert.equal(m.canSee('red',boss),false);
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'epic-withdraw');
  assert.notEqual(brain.actor.command.kind,'attack');
});
