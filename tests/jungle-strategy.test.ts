import test from 'node:test';
import assert from 'node:assert/strict';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { BATTLEFIELD_AI_RULES } from '../src/game/BattlefieldAI.ts';
import {
  JUNGLE_AI_RULES, chooseJungleCampForBuffs, chooseJungleAssist,
} from '../src/game/JunglePlanning.ts';
import { JUNGLE, JungleState } from '../src/game/Jungle.ts';
import { BATTLEFIELD_NAVIGATION, NavigationGraph } from '../src/game/navigation.ts';
import { distance } from '../src/game/config.ts';

function readyMatch(){
  const match=new BattlefieldMatch({ai:true});
  match.elapsed=JUNGLE.firstSpawn;
  match.jungle.step(match.elapsed);
  match.refreshVision();
  return match;
}

test('buff-aware camp planner targets the missing buff, not a live camp whose buff is already held',()=>{
  const jungle=new JungleState();
  jungle.step(JUNGLE.firstSpawn);
  const p=BATTLEFIELD_NAVIGATION.node('red-jungle-top').point;
  assert.equal(chooseJungleCampForBuffs(p,'red',jungle.camps,{red:60,blue:0})?.camp.id,'red-blue');
  assert.equal(chooseJungleCampForBuffs(p,'red',jungle.camps,{red:0,blue:60})?.camp.id,'red-red');
  assert.equal(chooseJungleCampForBuffs(p,'red',jungle.camps,{red:50,blue:50}),null);
  assert.ok(chooseJungleCampForBuffs(p,'red',jungle.camps,{red:0,blue:0}));
});

test('buff refresh window permits reacquisition without overriding a fully missing buff',()=>{
  const jungle=new JungleState();
  jungle.step(JUNGLE.firstSpawn);
  const p=BATTLEFIELD_NAVIGATION.node('red-jungle-top').point;
  const low=JUNGLE_AI_RULES.buffRefreshWindow;
  assert.equal(chooseJungleCampForBuffs(p,'red',jungle.camps,{red:low,blue:0})?.camp.id,'red-blue');
  assert.equal(chooseJungleCampForBuffs(p,'red',jungle.camps,{red:low,blue:50})?.camp.id,'red-red');
  assert.equal(chooseJungleCampForBuffs(p,'red',jungle.camps,{red:low+.01,blue:50}),null);
});

test('buff-aware planner respects current camp and does not pursue an unavailable respawning camp',()=>{
  const jungle=new JungleState();
  jungle.step(JUNGLE.firstSpawn);
  const p=BATTLEFIELD_NAVIGATION.node('red-jungle-top').point;
  assert.equal(chooseJungleCampForBuffs(p,'red',jungle.camps,{red:0,blue:0},'red-blue')?.camp.id,'red-blue');
  jungle.camp('red-blue').defeat(JUNGLE.firstSpawn);
  assert.equal(chooseJungleCampForBuffs(p,'red',jungle.camps,{red:0,blue:0},'red-blue')?.camp.id,'red-red');
  jungle.camp('red-red').defeat(JUNGLE.firstSpawn);
  assert.equal(chooseJungleCampForBuffs(p,'red',jungle.camps,{red:0,blue:0}),null);
});

test('lane assist path uses graph, rejects unsafe tower approaches and overlong requests',()=>{
  const from=BATTLEFIELD_NAVIGATION.node('red-jungle-top').point;
  const ally=BATTLEFIELD_NAVIGATION.node('mid-red-river').point;
  const signals=[{lane:'mid' as const,ally,enemy:{x:ally.x-60,y:ally.y},allyHealth:.55}];
  const plan=chooseJungleAssist(from,signals,()=>true);
  assert.ok(plan);
  assert.equal(plan.lane,'mid');
  assert.equal(plan.pathIds[0],'red-jungle-top');
  assert.equal(plan.pathIds.at(-1),'mid-red-river');
  assert.equal(chooseJungleAssist(from,signals,p=>distance(p,ally)>5),null);
  const distant=chooseJungleAssist({x:100,y:900},signals,()=>true);
  assert.equal(distant,null);
});

test('lane assist refuses disconnected navigation paths instead of taking direct shortcuts',()=>{
  const nodes=[
    {id:'red-jungle-top',point:{x:1130,y:240},tags:['jungle']},
    {id:'mid-red-river',point:{x:1040,y:380},tags:['mid']},
  ];
  const graph=new NavigationGraph(nodes,[]);
  const plan=chooseJungleAssist(nodes[0].point,[
    {lane:'mid',ally:nodes[1].point,enemy:{x:1000,y:380},allyHealth:1},
  ],()=>true,graph);
  assert.equal(plan,null);
});

test('AI prioritizes a missing buff camp then chooses river patrol with both buffs active',()=>{
  const match=readyMatch(),brain=match.ai[3],actor=brain.actor;
  actor.grantJungleBuff('red');
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'camp-approach');
  const missing=match.jungle.camp('red-blue');
  assert.equal(actor.command.kind,'move');
  assert.ok(distance(actor.command.point,missing.point)<400);

  actor.grantJungleBuff('blue');
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'river-patrol');
  assert.equal(actor.command.kind,'move');
  assert.ok(actor.command.point.x>=650&&actor.command.point.x<=1450);

  actor.buffs.blue=0;
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'camp-approach');
});

test('AI joins a lane with a visible enemy and safe graph route instead of farming refreshed buffs',()=>{
  const match=readyMatch(),brain=match.ai[3],jungler=brain.actor;
  jungler.grantJungleBuff('red');jungler.grantJungleBuff('blue');
  jungler.hero.x=1280;jungler.hero.y=600;
  jungler.anchor={x:1280,y:600};
  const ally=match.opponents.find(x=>x.visualId==='annie')!;
  const enemy=match.members.find(x=>x.visualId==='annie')!;
  ally.hero.x=920;ally.hero.y=400;ally.anchor={x:920,y:400};
  enemy.hero.x=895;enemy.hero.y=400;enemy.anchor={x:895,y:400};
  for(const other of match.members.filter(x=>x!==enemy)){
    other.hero.x=100;other.hero.y=900;
  }
  match.refreshVision();
  assert.ok(match.canSee('red',match.championTargets.find(t=>t.id===enemy.profile.id)!));
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'lane-assist');
  assert.equal(jungler.command.kind,'move');
});

test('urgent visible lane defense may preempt buff farming but fogged enemies never trigger assistance',()=>{
  const match=readyMatch(),brain=match.ai[3],jungler=brain.actor;
  jungler.hero.x=1280;jungler.hero.y=600;
  jungler.anchor={x:1280,y:600};
  const ally=match.opponents.find(x=>x.visualId==='annie')!;
  const enemy=match.members.find(x=>x.visualId==='annie')!;
  ally.hero.x=920;ally.hero.y=400;ally.anchor={x:920,y:400};
  ally.hero.hp=ally.hero.maxHp*.45;
  enemy.hero.x=900;enemy.hero.y=400;enemy.anchor={x:900,y:400};
  for(const other of match.members.filter(x=>x!==enemy)){other.hero.x=100;other.hero.y=900;}
  match.refreshVision();
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'lane-assist');

  enemy.hero.x=100;enemy.hero.y=900;enemy.anchor={x:100,y:900};
  match.refreshVision();
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.notEqual(brain.state,'lane-assist');
});

test('AI rejects unsafe enemy tower dives even with both buffs and visible lane pressure',()=>{
  const match=readyMatch(),brain=match.ai[3],jungler=brain.actor;
  jungler.grantJungleBuff('red');jungler.grantJungleBuff('blue');
  jungler.hero.x=1280;jungler.hero.y=600;jungler.anchor={x:1280,y:600};
  const ally=match.opponents.find(x=>x.visualId==='annie')!;
  const enemy=match.members.find(x=>x.visualId==='annie')!;
  ally.hero.x=900;ally.hero.y=400;ally.anchor={x:900,y:400};
  enemy.hero.x=880;enemy.hero.y=400;enemy.anchor={x:880,y:400};
  for(const other of match.members.filter(x=>x!==enemy)){other.hero.x=100;other.hero.y=900;}
  const tower=match.structure('blue','outer','mid');
  tower.x=840;tower.y=400;
  match.refreshVision();
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.notEqual(brain.state,'lane-assist');
  assert.notEqual(brain.state,'fight');
});

test('laner role AI keeps its original lane behavior regardless of jungle buff state',()=>{
  const match=readyMatch();
  const laner=match.ai[1];
  laner.actor.grantJungleBuff('red');laner.actor.grantJungleBuff('blue');
  laner.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(laner.state,'advance');
});
