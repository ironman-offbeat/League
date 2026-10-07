import test from 'node:test';
import assert from 'node:assert/strict';
import { LaneMatch } from '../src/game/LaneMatch.ts';
import { LaneAI } from '../src/game/LaneAI.ts';
import { Combat } from '../src/game/combat.ts';
import { CHAMPIONS } from '../src/game/champions.ts';
import { championTarget } from '../src/game/championTarget.ts';
import { damageTarget } from '../src/game/targets.ts';
import { applyCC, applySlow } from '../src/game/effects.ts';
import { RULES, distance } from '../src/game/config.ts';
const step=(m:{step:(dt:number)=>void},seconds:number)=>{for(let i=0;i<Math.round(seconds/RULES.step);i++)m.step(RULES.step);};
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('enemy champions use identical starting stats, separate identities and shared original art keys',()=>{
 const m=new LaneMatch();assert.equal(m.opponents.length,4);assert.equal(m.ai.length,4);
 for(let i=0;i<4;i++){const a=m.members[i],b=m.opponents[i];assert.notEqual(a.profile.id,b.profile.id);assert.equal(a.visualId,b.visualId);assert.deepEqual(a.stats,b.stats);assert.deepEqual(a.ranks,b.ranks);assert.equal(a.maxMana,b.maxMana);assert.equal(a.armor,b.armor);assert.equal(a.hero.x+b.hero.x,1600);assert.equal(a.hero.y+b.hero.y,1000);}
 assert.equal(new Set(m.actors.map(c=>c.profile.id)).size,8);assert.ok(m.members.every(c=>c.enemies===m.enemies));assert.ok(m.opponents.every(c=>c.enemies===m.opponents[0].enemies));
});
test('live target damage uses defenses and shields exactly once, interrupts recall and runs death cleanup',()=>{
 const c=new Combat(CHAMPIONS[1],[]),t=championTarget(c);c.hero.x=800;c.hero.shield=50;c.hero.shieldRemaining=3;c.recall();
 const hp=c.hero.hp,lost=damageTarget(t,150,'magic','skill');near(lost,150*100/122-50);near(c.hero.hp,hp-lost);assert.equal(c.command.kind,'idle');assert.equal(t.hp,c.hero.hp);
 c.castSkill('ultimate',{x:850,y:c.hero.y});assert.ok(c.abilities.pet);let deaths=0;c.onDeath=()=>deaths++;
 damageTarget(t,1e6,'physical','basic');damageTarget(t,1e6,'physical','basic');assert.equal(deaths,1);assert.equal(c.abilities.pet,null);assert.equal(t.alive,false);assert.equal(t.respawn,c.respawnRemaining);
 step(c,8.1);assert.equal(t.alive,true);assert.equal(t.generation,1);assert.equal(t.hp,t.maxHp);assert.equal(t.x,c.profile.spawn.x);
});
test('live CC cancels windup, movement skills and recall; status and respawn clocks tick only on owner',()=>{
 const c=new Combat(),t=championTarget(c);c.castDash({x:600,y:560});assert.ok(c.dash);applyCC(t,'stunned',2);assert.equal(c.dash,null);assert.equal(c.command.kind,'idle');
 applyCC(t,'stunned',1);applySlow(t,.25,3);Combat.stepEnemies([t],1);assert.equal(c.hero.stunned,2);c.step(.5,false);near(t.stunned,1.5);near(t.slowRemaining,2.5);
 c.hero.stunned=0;c.recall();applyCC(t,'rooted',1);assert.equal(c.command.kind,'idle');assert.equal(c.move({x:900,y:500}),false);
 c.receiveDamage(1e6);const remaining=c.respawnRemaining;Combat.stepEnemies([t],4);assert.equal(c.respawnRemaining,remaining);
});
test('champion kill rewards occur once, split nearby XP, persist through respawn and credit either team',()=>{
 const m=new LaneMatch({ai:false}),victim=m.opponents[0];
 m.members.forEach((c,i)=>{c.hero.x=i<2?victim.hero.x:100;c.hero.y=victim.hero.y;});
 const target=m.enemies.find(t=>t.id===victim.profile.id)!;damageTarget(target,1e6,'physical','basic');
 assert.equal(m.kills.blue,1);assert.equal(m.economy.blue.gold,320);near(m.members[0].progression.xp,70);near(m.members[1].progression.xp,70);
 damageTarget(target,1e6,'physical','basic');assert.equal(m.economy.blue.gold,320);
 victim.step(6.6,false);damageTarget(target,1e6,'magic','skill');assert.equal(m.kills.blue,2);assert.equal(m.economy.blue.gold,440);
 const blue=m.members[2];blue.receiveDamage(1e6);assert.equal(m.kills.red,1);assert.equal(m.economy.red.gold,320);
});
test('red minion rewards and equipment spending use red team budget without affecting blue',()=>{
 const m=new LaneMatch({ai:false});step(m,10);const unit=m.units.find(u=>u.kind==='minion'&&u.team==='blue')!;
 const c=m.opponents[0];c.hero.x=unit.x;c.hero.y=unit.y;const gold=m.economy.red.gold;damageTarget(unit,1e6,'physical','basic');near(m.economy.red.gold,gold+8);assert.equal(c.progression.xp,20);
 c.hero.x=c.profile.spawn.x;c.hero.y=c.profile.spawn.y;m.economy.red.gold=300;
 assert.ok(m.purchase(c,'weapon'));assert.equal(m.economy.red.gold,0);near(m.economy.blue.gold,200);assert.equal(c.equipment.weapon,2);assert.equal(m.members[0].equipment.weapon,1);
});
test('old homing projectiles cannot hit a champion after death and respawn',()=>{
 const m=new LaneMatch({ai:false}),a=m.members[2],b=m.opponents[0],t=m.enemies.find(t=>t.id===b.profile.id)!;
 a.projectiles.push({x:b.hero.x,y:b.hero.y,target:t,generation:t.generation,damage:200});b.receiveDamage(1e6);b.step(6.6,false);const hp=b.hero.hp;a.step(.1,false);assert.equal(b.hero.hp,hp);assert.equal(a.projectiles.length,0);
});
test('both towers defend allied champions even when a shield absorbs the attack',()=>{
 for(const team of ['blue','red'] as const){
  const m=new LaneMatch({ai:false});step(m,10);
  const tower=m.structure(team,'tower'),defender=m.teamMembers(team)[0],attacker=m.teamMembers(team==='blue'?'red':'blue')[0];
  attacker.hero.x=tower.x+40;attacker.hero.y=tower.y;attacker.anchor={x:attacker.hero.x,y:attacker.hero.y};attacker.cooldown.q=100;attacker.attack(tower.id);
  defender.hero.x=tower.x-40;defender.hero.y=tower.y;defender.hero.shield=1000;defender.hero.shieldRemaining=5;
  const minion=m.units.find(u=>u.team!==team&&u.kind==='minion')!;minion.x=tower.x+100;minion.y=tower.y;m.step(RULES.step);assert.equal(m.towerShots.get(tower.id)?.target.unit,minion);
  const t=attacker.enemies.find(t=>t.id===defender.profile.id)!;attacker.hurt(t,10,'basic',true,'physical','basic');m.step(RULES.step);
  assert.equal(m.towerShots.get(tower.id)?.target.actor,attacker);assert.ok(m.towerShots.get(tower.id)!.remaining>.4);
 }
});
test('AI waits for the first wave, then advances without extra income or stats',()=>{
 const m=new LaneMatch();step(m,9);assert.ok(m.ai.every(b=>b.state==='waiting'));assert.ok(m.opponents.every(c=>distance(c.hero,c.profile.spawn)===0));assert.equal(m.economy.red.gold,200);
 step(m,6);assert.ok(m.opponents.every(c=>c.hero.x<c.profile.spawn.x-100));near(m.economy.red.gold,210);assert.ok(m.opponents.every(c=>c.progression.level===1));
});
test('AI retreat is latched until fountain recovery, recall is not restarted every decision',()=>{
 const m=new LaneMatch({ai:false}),c=m.opponents[0],brain=new LaneAI(m,c,0);m.ai=[brain];c.hero.x=1000;c.hero.y=750;c.hero.hp=200;c.equipment.potion=null;
 step(m,.4);assert.equal(brain.state,'recall');assert.equal(c.command.kind,'recall');step(m,4.2);assert.ok(distance(c.hero,c.profile.spawn)<70);assert.equal(brain.state,'recover');
 step(m,4.5);assert.ok(c.hero.hp/c.hero.maxHp>=.9);assert.notEqual(brain.state,'recall');
});
test('AI uses a potion and runs away before recalling while nearby visible enemies threaten it',()=>{
 const m=new LaneMatch({ai:false}),c=m.opponents[0],enemy=m.members[0],brain=new LaneAI(m,c,0);m.elapsed=20;c.hero.x=1000;c.hero.y=700;c.hero.hp=200;enemy.hero.x=950;enemy.hero.y=700;
 m.refreshVision();brain.step(.3);assert.equal(brain.state,'retreat');assert.equal(c.command.kind,'move');assert.equal(c.equipment.potion,null);assert.ok(c.equipment.active);assert.deepEqual(c.anchor,c.profile.spawn);
});
test('low-health AI escapes tower range instead of repeatedly recalling under fire',()=>{
 const m=new LaneMatch({ai:false}),c=m.opponents[0],brain=new LaneAI(m,c,0);c.hero.x=680;c.hero.y=500;c.hero.hp=150;
 m.refreshVision();brain.step(.3);assert.equal(brain.state,'retreat');assert.equal(c.command.kind,'move');assert.deepEqual(c.anchor,c.profile.spawn);
});
test('AI respects visibility, preserves attack windup and does not chase unescorted tower targets',()=>{
 const m=new LaneMatch({ai:false}),c=m.opponents[0],enemy=m.members[0],brain=new LaneAI(m,c,0);m.elapsed=20;
 // Enemy is inside south bush while AI is just outside it: close but concealed.
 c.hero.x=960;c.hero.y=560;enemy.hero.x=900;enemy.hero.y=560;m.refreshVision();brain.step(.3);assert.notEqual(c.command.kind,'attack');
 // Entering the same bush reveals the enemy under the shared vision rules.
 c.hero.x=930;m.refreshVision();brain.step(.4);assert.equal(c.command.kind,'attack');c.cooldown.q=100;c.step(.01,false);const pending=c.pending;assert.ok(pending);brain.step(.4);assert.equal(c.pending,pending);c.step(.3,false);assert.ok(enemy.hero.hp<enemy.hero.maxHp);
 enemy.hero.x=440;enemy.hero.y=500;c.hero.x=720;c.hero.y=500;m.refreshVision();brain.step(.4);assert.equal(brain.state,'retreat');assert.equal(c.command.kind,'move');assert.ok(c.anchor.x>750);
});
test('AI skills obey learned ranks, cooldowns, mana and the normal cast path',()=>{
 const m=new LaneMatch({ai:false}),c=m.opponents[1],enemy=m.members[0],brain=new LaneAI(m,c,1);m.elapsed=20;c.hero.x=900;c.hero.y=750;enemy.hero.x=800;enemy.hero.y=750;
 m.refreshVision();brain.step(.3);assert.equal(c.cooldown.dash,0);assert.equal(c.cooldown.ultimate,0);
 c.gainExperience(420);m.refreshVision();brain.step(.4);assert.ok(c.cooldown.ultimate>0);assert.ok(c.abilities.pet);assert.equal(c.hero.mana,c.maxMana-100);
 const cd=c.cooldown.ultimate;c.hero.mana=0;brain.step(.4);assert.equal(c.cooldown.ultimate,cd);assert.equal(c.cooldown.dash,0);
});
test('unlearned frost Q cannot activate and continuous aura damage does not flood floating labels',()=>{
 const m=new LaneMatch({ai:false}),a=m.members[2],victim=m.opponents[0],t=m.enemies.find(t=>t.id===victim.profile.id)!;
 a.hero.x=victim.hero.x-100;a.hero.y=victim.hero.y;a.abilities.auto(t);assert.equal(a.abilities.haste,0);assert.equal(a.cooldown.q,0);
 victim.events=[];a.hurt(t,1,'aura',false,'magic');assert.equal(victim.events.length,0);
});
test('default opposing teams can fight, grow, retreat and keep entity counts bounded in a long match',()=>{
 const m=new LaneMatch();for(const [i,c] of m.members.entries())c.attackMove({x:820,y:450+i*35});
 step(m,180);assert.ok(m.kills.blue+m.kills.red>0);assert.ok(m.actors.some(c=>c.progression.level>1));assert.ok(m.units.length<100);
 assert.ok(m.actors.every(c=>Number.isFinite(c.hero.hp)&&c.hero.hp>=0&&c.hero.hp<=c.hero.maxHp));assert.ok(m.economy.red.gold>=0);assert.ok(m.economy.blue.gold>=0);
 m.result='victory';const snapshot=JSON.stringify({time:m.elapsed,ai:m.ai.map(b=>b.state),heroes:m.actors.map(c=>[c.hero,c.elapsed]),gold:m.economy});step(m,10);assert.equal(JSON.stringify({time:m.elapsed,ai:m.ai.map(b=>b.state),heroes:m.actors.map(c=>[c.hero,c.elapsed]),gold:m.economy}),snapshot);
});
