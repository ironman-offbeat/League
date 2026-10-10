import test from 'node:test';
import assert from 'node:assert/strict';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { BATTLEFIELD_AI_RULES } from '../src/game/BattlefieldAI.ts';
import { chooseJungleInvade, jungleSafeRoute, JUNGLE_INVADE_RULES } from '../src/game/JunglePlanning.ts';
import type { JungleInvadeContext } from '../src/game/JunglePlanning.ts';
import { JUNGLE, JungleState } from '../src/game/Jungle.ts';
import { BATTLEFIELD_NAVIGATION, NavigationGraph } from '../src/game/navigation.ts';
import { RULES } from '../src/game/config.ts';

function jungleForSteal(){
  const jungle=new JungleState();
  jungle.step(JUNGLE.firstSpawn);
  jungle.camp('red-blue').defeat(JUNGLE.firstSpawn);
  return jungle;
}

function invasionContext(jungle:JungleState,overrides:Partial<JungleInvadeContext>={}):JungleInvadeContext{
  return {
    position:BATTLEFIELD_NAVIGATION.node('red-jungle-top').point,
    team:'red',actorId:'red-amumu',camps:jungle.camps,
    buffs:{red:60,blue:0},healthRatio:1,manaRatio:1,
    continuing:false,preferredId:null,
    visibleEnemyChampions:[],
    canSeeCamp:camp=>camp.id==='blue-blue',
    safeFromTowers:()=>true,
    ...overrides,
  };
}

test('enemy camp selection requires a missing buff, an unavailable home camp, and fresh team sight',()=>{
  const jungle=jungleForSteal();
  const ctx=invasionContext(jungle);
  const plan=chooseJungleInvade(ctx);
  assert.ok(plan);
  assert.equal(plan.camp.id,'blue-blue');
  assert.equal(plan.pathIds.at(-1),'blue-jungle-top');
  assert.ok(plan.pathDistance>500&&plan.pathDistance<=JUNGLE_INVADE_RULES.maxTravel);
  assert.equal(chooseJungleInvade({...ctx,canSeeCamp:()=>false}),null);
  assert.equal(chooseJungleInvade({...ctx,buffs:{red:60,blue:60}}),null);
  jungle.camp('red-blue').step(JUNGLE.firstSpawn+JUNGLE.respawn);
  assert.equal(chooseJungleInvade(ctx),null);
});

test('enemy camp invasion rejects low health, insufficient mana, enemy presence or a contested camp',()=>{
  const jungle=jungleForSteal(),ctx=invasionContext(jungle);
  assert.equal(chooseJungleInvade({...ctx,healthRatio:JUNGLE_INVADE_RULES.enterHealth-.01}),null);
  assert.equal(chooseJungleInvade({...ctx,manaRatio:JUNGLE_INVADE_RULES.enterMana-.01}),null);
  assert.equal(chooseJungleInvade({...ctx,visibleEnemyChampions:[{x:390,y:500}]}),null);
  assert.equal(chooseJungleInvade({...ctx,visibleEnemyChampions:[{x:800,y:500}]}),null);
  jungle.camp('blue-blue').aggro='blue-amumu';
  assert.equal(chooseJungleInvade(ctx),null);
  jungle.camp('blue-blue').aggro='red-amumu';
  assert.ok(chooseJungleInvade(ctx));
});

test('enemy tower danger and disconnected or overly long paths prohibit invasions',()=>{
  const jungle=jungleForSteal(),ctx=invasionContext(jungle);
  assert.equal(chooseJungleInvade({...ctx,safeFromTowers:p=>p.x>510}),null);
  assert.equal(chooseJungleInvade({...ctx,position:{x:80,y:950}}),null);
  const disconnected=new NavigationGraph([
    {id:'red-jungle-top',point:{x:1130,y:240},tags:['jungle']},
    {id:'blue-jungle-top',point:{x:390,y:500},tags:['jungle']},
  ],[]);
  assert.equal(chooseJungleInvade({...ctx,graph:disconnected}),null);
});

test('navigation rejects dangerous edge interiors and can use a safe detour',()=>{
  const graph=new NavigationGraph([
    {id:'start',point:{x:0,y:0},tags:[]},
    {id:'unsafe',point:{x:100,y:0},tags:[]},
    {id:'detour',point:{x:100,y:120},tags:[]},
    {id:'goal',point:{x:200,y:0},tags:[]},
  ],[['start','unsafe'],['unsafe','goal'],['start','detour'],['detour','goal']]);
  const safe=(p:{x:number;y:number})=>!(p.x>45&&p.x<155&&p.y<35);
  const route=jungleSafeRoute({x:0,y:0},'goal',safe,graph);
  assert.deepEqual(route?.pathIds,['start','detour','goal']);
  assert.ok(route!.pathDistance>200);
  const blocked=jungleSafeRoute({x:0,y:0},'goal',p=>p.y===0? p.x===0||p.x===200:false,graph);
  assert.equal(blocked,null);
});

test('blue-side invasion uses mirrored camp/buff rules without hardcoded red paths',()=>{
  const jungle=new JungleState();
  jungle.step(JUNGLE.firstSpawn);
  jungle.camp('blue-blue').defeat(JUNGLE.firstSpawn);
  const ctx=invasionContext(jungle,{
    team:'blue',actorId:'blue-amumu',
    position:BATTLEFIELD_NAVIGATION.node('blue-jungle-top').point,
    buffs:{red:60,blue:0},
    canSeeCamp:camp=>camp.id==='red-blue',
  });
  const plan=chooseJungleInvade(ctx);
  assert.equal(plan?.camp.id,'red-blue');
  assert.equal(plan?.pathIds.at(-1),'red-jungle-bottom');
});

test('continuing a visible camp fight requires safe health and is allowed to finish a weak camp',()=>{
  const jungle=jungleForSteal();
  const camp=jungle.camp('blue-blue');
  camp.aggro='red-amumu';
  const ctx=invasionContext(jungle,{
    continuing:true,preferredId:camp.id,healthRatio:.19,
  });
  assert.equal(chooseJungleInvade(ctx),null);
  camp.hp=camp.maxHp*.25;
  assert.equal(chooseJungleInvade(ctx)?.camp.id,camp.id);
  assert.equal(chooseJungleInvade({...ctx,healthRatio:.09}),null);
});

function battlefieldForInvade(){
  const match=new BattlefieldMatch({ai:true});
  match.elapsed=JUNGLE.firstSpawn;
  match.jungle.step(match.elapsed);
  match.nextWave=Infinity;
  // Make an enemy camp genuinely accessible without bypassing tower safety.
  for(const structure of match.structures('blue')){
    if(structure.role==='outer'||structure.role==='inner')structure.alive=false;
  }
  for(const enemy of match.members){
    enemy.hero.x=100;enemy.hero.y=910;
    enemy.anchor={x:100,y:910};
  }
  const spotter=match.opponents.find(c=>c.visualId==='renekton')!;
  const target=match.jungle.camp('blue-blue');
  spotter.hero.x=target.x+40;spotter.hero.y=target.y+15;
  spotter.anchor={x:spotter.hero.x,y:spotter.hero.y};
  match.jungle.camp('red-blue').defeat(match.elapsed);
  const brain=match.ai.find(ai=>ai.role==='jungle')!;
  brain.actor.grantJungleBuff('red');
  match.ai=[brain];
  match.refreshVision();
  return {match,brain,spotter,target};
}

test('real jungler invades only a visible safe enemy buff camp and issues standard move orders',()=>{
  const {match,brain,target}=battlefieldForInvade();
  assert.equal(match.canSee('red',target),true);
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'invade-approach');
  assert.equal(brain.actor.command.kind,'move');
  if(brain.actor.command.kind==='move'){
    assert.notDeepEqual(brain.actor.command.point,target.point);
  }
});

test('loss of live camp vision cancels an invasion and immediately replaces its move order with withdrawal',()=>{
  const {match,brain,spotter,target}=battlefieldForInvade();
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'invade-approach');
  brain.actor.hero.x=900;brain.actor.hero.y=480;
  brain.actor.anchor={x:900,y:480};
  spotter.hero.x=1460;spotter.hero.y=160;
  spotter.anchor={x:1460,y:160};
  match.refreshVision();
  assert.equal(match.canSee('red',target),false);
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'invade-withdraw');
  assert.equal(brain.actor.command.kind,'move');
});

test('enemy sighting or tower protection makes an ongoing invasion withdraw instead of fighting blindly',()=>{
  const {match,brain,target}=battlefieldForInvade();
  brain.step(BATTLEFIELD_AI_RULES.interval);
  brain.actor.hero.x=900;brain.actor.hero.y=480;
  brain.actor.anchor={x:900,y:480};
  const enemy=match.members[0];
  enemy.hero.x=target.x+50;enemy.hero.y=target.y;
  enemy.anchor={x:enemy.hero.x,y:enemy.hero.y};
  match.refreshVision();
  assert.equal(match.canSee('red',match.championTargets.find(t=>t.id===enemy.profile.id)!),true);
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.equal(brain.state,'invade-withdraw');
  assert.equal(brain.actor.command.kind,'move');
});

test('enemy camp protected by a live unsupported tower is never an invasion candidate',()=>{
  const {match,brain,target}=battlefieldForInvade();
  const tower=match.structure('blue','outer','mid');
  tower.alive=true;tower.x=target.x;tower.y=target.y;
  match.refreshVision();
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.notEqual(brain.state,'invade-approach');
  assert.notEqual(brain.state,'invade-fight');
});

test('enemy buff steal reuses ordinary target damage, team gold and killer buff reward',()=>{
  const {match,brain,target}=battlefieldForInvade();
  // Isolate pathing/kill/loot against a weakened camp, not an unrelated
  // full-health 1v1 balance issue already covered by home-camp tests.
  target.hp=220;
  const gold=match.economy.red.earned;
  const xp=brain.actor.progression.totalXp;
  for(let i=0;i<Math.round(42/RULES.step)&&target.alive&&match.result===null;i++)match.step(RULES.step);
  assert.equal(target.alive,false,'Jungler never completed the visible enemy buff steal');
  assert.equal(target.lastDamager,brain.actor.profile.id);
  assert.ok(match.economy.red.earned>=gold+JUNGLE.reward.gold);
  assert.ok(brain.actor.progression.totalXp>xp);
  assert.ok(brain.actor.buffs.blue>0);
  assert.equal(match.economy.blue.earned,0);
});

test('critical health ends invasion before a jungle death and retains fountain recovery behavior',()=>{
  const {match,brain}=battlefieldForInvade();
  brain.step(BATTLEFIELD_AI_RULES.interval);
  brain.actor.hero.hp=brain.actor.hero.maxHp*.2;
  brain.step(BATTLEFIELD_AI_RULES.interval);
  assert.ok(['recall','retreat','recover'].includes(brain.state));
  assert.notEqual(brain.actor.command.kind,'attack');
});
