import test from 'node:test';
import assert from 'node:assert/strict';
import {Progression,PROGRESSION,TeamEconomy} from '../src/game/progression.ts';
import {LaneMatch} from '../src/game/LaneMatch.ts';
import {Combat} from '../src/game/combat.ts';
import {CHAMPIONS} from '../src/game/champions.ts';
import {damageTarget} from '../src/game/targets.ts';
import {RULES} from '../src/game/config.ts';
const step=(m:{step:(dt:number)=>void},s:number)=>{for(let i=0;i<Math.round(s/RULES.step);i++)m.step(RULES.step);};
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const wave=()=>{const m=new LaneMatch();step(m,10);return m;};
test('XP thresholds support fractional shares, multi-level awards, level 12 cap and training isolation',()=>{
 const p=new Progression(true);p.gain(99);assert.equal(p.level,1);p.gain(1);assert.equal(p.level,2);assert.equal(p.xp,0);
 p.gain(140+180+5);assert.equal(p.level,4);assert.equal(p.xp,5);p.gain(100000);assert.equal(p.level,12);assert.equal(p.xp,0);assert.equal(p.totalXp,3300);p.gain(30);assert.equal(p.totalXp,3300);
 const training=new Progression();training.gain(500);assert.equal(training.level,1);
 const fractional=new Progression(true);for(let i=0;i<15;i++)fractional.gain(20/3);assert.equal(fractional.level,2);
});
test('passive team gold starts at ten seconds, accrues once per match and freezes at match end',()=>{
 const gold=new TeamEconomy();gold.advance(0,9);assert.equal(gold.gold,200);gold.advance(9,11);assert.equal(gold.gold,202);
 const m=new LaneMatch();step(m,12);near(m.economy.blue.gold,204);near(m.economy.red.gold,204);
 m.result='victory';step(m,5);near(m.economy.blue.gold,204);assert.equal(new LaneMatch().economy.blue.gold,200);
});
test('minion rewards split XP among nearby living heroes and pay team gold exactly once',()=>{
 const m=wave(),enemy=m.enemies.find(u=>u.role==='melee')!;
 for(const [i,c] of m.members.entries()){c.hero.x=i<2?enemy.x:45;c.hero.y=i<2?enemy.y:45;}
 const before=m.economy.blue.gold;damageTarget(enemy,1e6,'physical','basic');
 near(m.economy.blue.gold-before,8);assert.equal(m.members[0].progression.xp,10);assert.equal(m.members[1].progression.xp,10);assert.equal(m.members[2].progression.xp,0);
 damageTarget(enemy,1e6,'physical','basic');near(m.economy.blue.gold-before,8);
});
test('dead or distant heroes earn nothing; capped heroes still qualify for gold but do not dilute XP',()=>{
 const m=wave(),enemy=m.enemies.find(u=>u.role==='melee')!;
 for(const c of m.members){c.hero.x=enemy.x;c.hero.y=enemy.y;}
 m.members[0].gainExperience(3300);m.members[2].receiveDamage(1e6);m.members[3].hero.x=45;m.members[3].hero.y=45;
 damageTarget(enemy,1e6,'physical','basic');assert.equal(m.members[1].progression.xp,20);assert.equal(m.members[2].progression.totalXp,0);assert.equal(m.members[3].progression.totalXp,0);
 const lone=m.enemies.find(u=>u.role==='ranged'&&u.alive)!;for(const c of m.members){c.hero.x=45;c.hero.y=45;}const before=m.economy.blue.gold;
 damageTarget(lone,1e6,'physical','basic');assert.equal(m.economy.blue.gold,before);
});
test('tower bounty is global, while basic, skill and minion kills use the same reward path',()=>{
 for(const method of ['basic','skill','minion'] as const){
  const m=wave(),e=m.enemies.find(u=>u.role==='melee')!,c=m.members[0];c.hero.x=e.x;c.hero.y=e.y;
  const before=m.economy.blue.gold;
  if(method==='minion')damageTarget(e,1e6,'physical','basic');else c.hurt(e,1e6,'test',true,'physical',method);
  near(m.economy.blue.gold-before,8);assert.equal(c.progression.xp,20);
 }
 const m=new LaneMatch();damageTarget(m.structure('red','tower'),1e6,'physical','basic');assert.equal(m.economy.blue.gold,350);assert.ok(m.members.every(c=>c.progression.xp===0));
});
test('level growth changes real stats without mutating shared champion data or refilling lost health',()=>{
 for(const [i,profile] of CHAMPIONS.entries()){
  const before=JSON.stringify(profile),c=new LaneMatch().members[i];c.hero.hp-=100;c.hero.mana=Math.max(0,c.hero.mana-100);const hp=c.hero.hp,mana=c.hero.mana;
  c.gainExperience(100);assert.equal(c.progression.level,2);assert.equal(c.hero.maxHp,profile.stats.hp+profile.growth.hp);assert.equal(c.hero.hp,hp+profile.growth.hp);assert.equal(c.hero.mana,mana+profile.growth.mana);
  assert.equal(c.stats.attack,profile.stats.attack+profile.growth.attack);assert.equal(c.armor,profile.armor+profile.growth.armor);assert.equal(c.magicResist,profile.magicResist+profile.growth.magicResist);near(c.stats.attackInterval,profile.stats.attackInterval/1.02);assert.equal(JSON.stringify(profile),before);
 }
});
test('ultimate unlock and mana reservation switch at level four; training retains its unlocked kit',()=>{
 const c=new LaneMatch().members[1];assert.equal(c.abilities.canCast('ultimate'),false);assert.equal(c.abilities.reserve,0);
 c.gainExperience(420);assert.equal(c.progression.level,4);assert.equal(c.abilities.canCast('ultimate'),true);assert.equal(c.abilities.reserve,100);assert.equal(new Combat(CHAMPIONS[1]).abilities.canCast('ultimate'),true);
});
test('growth survives death and recall, changes respawn delay, and does not corrupt temporary max HP',()=>{
 const c=new LaneMatch().members[0];c.gainExperience(420);assert.ok(c.castUltimate());const bonus=c.hero.maxHp;c.gainExperience(220);assert.equal(c.hero.maxHp,bonus+95);
 c.receiveDamage(1e6);assert.equal(c.hero.maxHp,850+4*95);assert.equal(c.respawnRemaining,12.5);step(c,12.6);assert.ok(c.alive);assert.equal(c.hero.hp,c.hero.maxHp);assert.equal(c.progression.level,5);
 c.elapsed=480;c.receiveDamage(1e6);assert.equal(c.respawnRemaining,16.5);
});
test('new matches reset both personal XP and team wealth; no reward occurs after match completion',()=>{
 const m=wave();m.members[0].gainExperience(100);m.result='victory';const before=m.economy.blue.gold;damageTarget(m.structure('red','tower'),1e6,'physical','basic');assert.equal(m.economy.blue.gold,before);
 const next=new LaneMatch();assert.equal(next.members[0].progression.totalXp,0);assert.equal(next.economy.blue.gold,PROGRESSION.startingGold);
});
test('levelled attack and defenses affect actual damage, not just displayed stats',()=>{
 const m=new LaneMatch(),c=m.members[0],tower=m.structure('red','tower');c.gainExperience(100);
 const before=c.hero.hp,lost=c.receiveDamage(100);near(lost,100*100/133);near(before-c.hero.hp,lost);
 c.hero.x=tower.x-60;c.hero.y=tower.y;c.cooldown.q=100;c.attack(tower.id);
 const hp=tower.hp;step(c,.3);near(hp-tower.hp,68*.25*100/140);
});
