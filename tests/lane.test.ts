import test from 'node:test';
import assert from 'node:assert/strict';
import { LaneMatch, LANE } from '../src/game/LaneMatch.ts';
import { RULES } from '../src/game/config.ts';
import { damageTarget } from '../src/game/targets.ts';
import { Combat } from '../src/game/combat.ts';
import { CHAMPIONS } from '../src/game/champions.ts';
const step=(m:{step:(dt:number)=>void},seconds:number)=>{for(let i=0;i<Math.round(seconds/RULES.step);i++)m.step(RULES.step);};
const kill=(u:{hp:number;alive:boolean})=>{u.hp=0;u.alive=false;};

test('first wave at 10s, every 20s, third wave includes siege minions; arrays stay shared',()=>{
 const m=new LaneMatch(),shared=m.enemies;step(m,9);assert.equal(m.wave,0);step(m,1);assert.equal(m.wave,1);
 assert.equal(m.units.filter(u=>u.kind==='minion').length,10);step(m,40);assert.equal(m.wave,3);
 assert.equal(m.units.filter(u=>u.role==='siege').length,2);assert.equal(m.enemies,shared);assert.ok(m.members.every(c=>c.enemies===shared));
});
test('tower gates nexus, buildings reject skill damage, unescorted basic attacks deal 25%',()=>{
 const m=new LaneMatch(),tower=m.structure('red','tower'),nexus=m.structure('red','nexus');
 assert.equal(damageTarget(nexus,100,'physical','basic'),0);assert.equal(damageTarget(tower,100,'magic','skill'),0);
 assert.ok(Math.abs(damageTarget(tower,140,'physical','basic')-25)<1e-8);
 kill(tower);m.step(RULES.step);assert.equal(nexus.protected,false);assert.ok(damageTarget(nexus,140,'physical','basic')>0);
});
test('nearby escort removes backdoor reduction; dead minions do not respawn or retain array slots',()=>{
 const m=new LaneMatch();step(m,10);const tower=m.structure('red','tower'),minion=m.units.find(u=>u.team==='blue'&&u.kind==='minion')!;
 minion.x=tower.x-200;minion.y=tower.y;m.step(RULES.step);assert.equal(tower.damageScale,1);
 assert.equal(damageTarget(tower,140,'physical','basic'),100);kill(minion);m.step(RULES.step);assert.equal(tower.damageScale,.25);assert.ok(!m.units.includes(minion));step(m,4);assert.equal(minion.alive,false);
});
test('tower selects minion before closer champion and its windup can be escaped',()=>{
 const m=new LaneMatch();step(m,10);const tower=m.structure('red','tower'),hero=m.members[0];
 hero.hero.x=tower.x-70;hero.hero.y=tower.y;hero.attack(tower.id);
 const minion=m.units.find(u=>u.team==='blue'&&u.kind==='minion')!;minion.x=tower.x-210;minion.y=tower.y;
 m.step(RULES.step);assert.equal(m.towerShots.get(tower.id)?.target.unit,minion);
 const hp=minion.hp;minion.x=600;step(m,.5);assert.equal(minion.hp,hp);
});
test('unescorted direct siege takes tower damage; automatic siege retreats when escort is gone',()=>{
 const m=new LaneMatch(),c=m.members[0],tower=m.structure('red','tower');c.hero.x=1100;c.hero.y=500;c.anchor={x:1100,y:500};m.refreshVision();
 assert.ok(c.attack(tower.id));step(m,2);assert.ok(c.hero.hp<c.hero.maxHp);assert.ok(tower.hp<tower.maxHp);
 c.command={kind:'idle'};c.pending=null;m.step(RULES.step);assert.equal(c.command.kind,'move');assert.ok(c.anchor.x<tower.x-LANE.tower.range);
});
test('all champion spell effects leave buildings untouched; basic attacks do not apply CC or marks',()=>{
 for(const profile of CHAMPIONS){
  const m=new LaneMatch(),tower=m.structure('red','tower');tower.damageScale=1;const c=new Combat(profile,[tower]);c.autoTargetAllowed=()=>false;
  c.hero.x=tower.x-50;c.hero.y=tower.y;c.anchor={x:c.hero.x,y:c.hero.y};
  c.castSkill('manual',{x:tower.x+60,y:tower.y});c.castSkill('ultimate',{x:tower.x,y:tower.y});
  step(c,1);assert.equal(tower.hp,tower.maxHp);assert.equal(tower.stunned,0);assert.equal(tower.rooted,0);assert.equal(tower.marked,0);
  c.attack(tower.id);step(c,3);assert.ok(tower.hp<tower.maxHp);assert.equal(tower.stunned,0);assert.equal(tower.slow,0);assert.equal(tower.marked,0);
 }
});
test('arrow passes through minions and buildings while hook can hit minions',()=>{
 const m=new LaneMatch();step(m,10);const minion=m.enemies.find(u=>u.kind==='minion')!;minion.x=650;minion.y=500;
 const target=new Combat().enemies[0];target.x=760;target.y=500;
 const arrow=new Combat(CHAMPIONS[2],[minion,target]);arrow.hero.x=550;arrow.hero.y=500;arrow.castSkill('ultimate',{x:1000,y:500});
 const hp=minion.hp;step(arrow,.5);assert.equal(minion.hp,hp);assert.ok(target.stunned>0);
 const hook=new Combat(CHAMPIONS[3],[minion]);hook.hero.x=550;hook.hero.y=500;hook.castSkill('manual',{x:1000,y:500});step(hook,.2);assert.ok(minion.hp<hp);assert.ok(minion.stunned>0);
});
test('victory, defeat and simultaneous draw freeze every match clock and fresh matches reset',()=>{
 for(const result of ['victory','defeat','draw'] as const){
  const m=new LaneMatch();if(result!=='defeat')kill(m.structure('red','nexus'));if(result!=='victory')kill(m.structure('blue','nexus'));
  m.step(RULES.step);assert.equal(m.result,result);const snapshot=JSON.stringify({time:m.elapsed,heroes:m.members.map(c=>c.elapsed),wave:m.wave});step(m,30);
  assert.equal(JSON.stringify({time:m.elapsed,heroes:m.members.map(c=>c.elapsed),wave:m.wave}),snapshot);
 }
 const fresh=new LaneMatch();assert.equal(fresh.result,null);assert.equal(fresh.wave,0);assert.ok(fresh.units.every(u=>u.alive));
});
test('lane recall and respawn return to match spawn, and wave clocks do not multiply by hero count',()=>{
 const m=new LaneMatch(),c=m.members[1];c.hero.x=700;c.recall();step(m,4.1);assert.equal(c.hero.x,c.profile.spawn.x);
 c.receiveDamage(1e6);step(m,6.6);assert.ok(c.alive);assert.equal(c.hero.x,c.profile.spawn.x);assert.equal(m.wave,1);
});
test('long unattended match keeps waves bounded and minions fight opposing structures',()=>{
 const m=new LaneMatch();step(m,360);assert.ok(m.units.length<100);assert.ok(m.structure('red','tower').hp<m.structure('red','tower').maxHp||m.structure('blue','tower').hp<m.structure('blue','tower').maxHp);
});
test('isolated siege fixture finishes through tower then nexus without champion opposition',()=>{
 const m=new LaneMatch({enemyChampions:false});
 for(let tick=0;tick<60*180&&!m.result;tick++){
  if(tick%120===0){
   const target=m.structure('red','tower').alive?m.structure('red','tower'):m.structure('red','nexus');
   for(const c of m.members)if(c.alive){if(c.canSee(target))c.attack(target.id);else c.attackMove(target);}
  }
  m.step(RULES.step);
 }
 assert.equal(m.result,'victory');assert.equal(m.structure('red','tower').alive,false);assert.equal(m.structure('red','nexus').alive,false);
});
