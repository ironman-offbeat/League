import test from 'node:test';
import assert from 'node:assert/strict';
import {LaneMatch} from '../src/game/LaneMatch.ts';
import {Combat} from '../src/game/combat.ts';
import {CHAMPIONS} from '../src/game/champions.ts';
import {TeamEconomy} from '../src/game/progression.ts';
import {skillRanks,rankedSkills,rankedFury} from '../src/game/skillRanks.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('T1 gear is granted once per fresh lane match, never to training; stats are total tier values',()=>{
 const m=new LaneMatch();for(const c of m.members){assert.equal(c.equipment.weapon,1);assert.equal(c.equipment.armor,1);assert.equal(c.equipment.potion,'health');assert.equal(c.hero.maxHp,c.profile.stats.hp+100);assert.equal(c.armor,c.profile.armor+5);}
 assert.equal(m.members[0].stats.attack,74);assert.equal(m.members[1].abilityPower,15);assert.equal(new Combat().stats.attack,64);assert.equal(new Combat().hero.maxHp,850);
 m.economy.blue.gold=2000;const c=m.members[0];assert.ok(m.purchase(c,'weapon'));assert.equal(c.stats.attack,89);assert.ok(m.purchase(c,'weapon'));assert.equal(c.stats.attack,109);assert.equal(m.purchase(c,'weapon'),false);assert.equal(m.economy.blue.gold,1150);
});
test('shop rejects distant purchases and overspending; dead heroes can buy without revival',()=>{
 const m=new LaneMatch(),c=m.members[0];assert.equal(m.purchase(c,'weapon'),false);assert.equal(m.economy.blue.gold,200);
 m.economy.blue.gold=300;c.hero.x=700;assert.equal(m.purchase(c,'weapon'),false);assert.equal(m.economy.blue.gold,300);
 c.receiveDamage(1e6);assert.ok(m.purchase(c,'weapon'));assert.equal(c.alive,false);assert.equal(m.economy.blue.gold,0);assert.equal(m.purchase(m.members[1],'weapon'),false);
 const e=new TeamEconomy();assert.equal(e.spend(NaN),false);assert.equal(e.spend(-1),false);assert.equal(e.spend(201),false);assert.equal(e.gold,200);
});
test('armor upgrades preserve missing HP and temporary ultimate HP across expiry and death',()=>{
 const m=new LaneMatch(),c=m.members[0];m.economy.blue.gold=3000;c.gainExperience(420);c.hero.hp-=200;c.castUltimate();const missing=c.hero.maxHp-c.hero.hp;
 assert.ok(m.purchase(c,'armor'));near(c.hero.maxHp-c.hero.hp,missing);assert.equal(c.hero.maxHp,c.profile.stats.hp+3*95+220+250);
 c.gainExperience(1120);assert.equal(c.progression.level,8);c.enemies=[];c.step(10);assert.equal(c.hero.maxHp,c.profile.stats.hp+7*95+220);
 c.receiveDamage(1e6);assert.ok(m.purchase(c,'armor'));assert.equal(c.hero.hp,0);c.step(30);assert.equal(c.hero.maxHp,c.profile.stats.hp+7*95+380);assert.equal(c.hero.hp,c.hero.maxHp);
});
test('single potion slot, fury restrictions, exact prices and match-end purchase guard',()=>{
 const m=new LaneMatch(),c=m.members[0];m.economy.blue.gold=1000;
 assert.equal(m.purchase(c,'health'),false);c.hero.hp-=200;assert.ok(c.usePotion());assert.equal(c.usePotion(),false);assert.equal(m.purchase(c,'mixed'),false);assert.equal(m.purchase(c,'mana'),false);assert.ok(m.purchase(c,'health'));assert.equal(m.economy.blue.gold,960);
 const a=m.members[1];a.equipment.potion=null;assert.ok(m.purchase(a,'mixed'));assert.equal(m.economy.blue.gold,840);m.result='victory';assert.equal(m.purchase(a,'weapon'),false);assert.equal(m.economy.blue.gold,840);
});
test('potion recovery is bounded, continues under damage, dies with hero and does not consume when full',()=>{
 const c=new LaneMatch().members[1];assert.equal(c.usePotion(),false);c.hero.x=700;c.hero.y=800;c.enemies=[];c.hero.hp=200;c.hero.mana=0;c.equipment.potion='mixed';assert.ok(c.usePotion());
 const max=c.hero.maxHp,mana=c.maxMana;c.step(2);near(c.hero.hp,200+max*(.25/5+.003)*2);near(c.hero.mana,mana*(.3/5+.008)*2);
 c.receiveDamage(10);assert.ok(c.equipment.active);const hp=c.hero.hp;c.step(10);near(c.hero.hp,Math.min(max,hp+max*(.25/5*3+.003*10)));assert.equal(c.equipment.active,null);
 c.equipment.potion='health';c.hero.hp=200;assert.ok(c.usePotion());c.receiveDamage(1e6);assert.equal(c.equipment.active,null);assert.equal(c.equipment.potion,null);
});
test('fixed skill order learns one rank each level, R only at 4/8/12 and training keeps all rank one',()=>{
 for(const profile of CHAMPIONS){for(let lv=1;lv<=12;lv++){const r=skillRanks(profile.kit,lv,true);assert.equal(Object.values(r).reduce((a,b)=>a+b,0),lv);assert.equal(r.R,Math.floor(lv/4));assert.ok(Object.values(r).every(n=>n<=3));}assert.deepEqual(skillRanks(profile.kit,12,false),{Q:1,W:1,E:1,R:1});}
 const c=new LaneMatch().members[0];assert.equal(c.castDash({x:350,y:470}),false);c.gainExperience(100);assert.equal(c.abilities.canCast('manual'),true);
});
test('ranked skill tables apply all three levels and AD/AP ratios without mutating base skills',()=>{
 const r={Q:3,W:3,E:3,R:3},s=rankedSkills(r,70),f=rankedFury(r,100);
 assert.equal(s.flame.q.damage,197);assert.equal(s.flame.w.damage,239);assert.equal(s.flame.shield.amount,178);assert.equal(s.flame.ultimate.damage,356);assert.equal(s.flame.pet.hp,750);assert.equal(s.flame.pet.damage,65.5);
 assert.equal(s.frost.q.haste,.6);assert.equal(s.frost.w.damage,130);assert.equal(s.frost.scout.cooldown,20);assert.equal(s.frost.ultimate.stun,2);
 assert.equal(s.curse.hook.damage,175);assert.equal(s.curse.aura.hpRatio,.01);assert.equal(s.curse.burst.damage,158);assert.equal(s.curse.ultimate.root,2);
 assert.equal(f.q.damage,220);assert.equal(f.q.healCap,180);assert.equal(f.w.bonus,105);assert.equal(f.dash.cooldown,10);assert.equal(f.ultimate.health,550);
});
test('AP gear and ranks change real casts; pet and missiles snapshot cast strength',()=>{
 const m=new LaneMatch(),a=m.members[1];m.economy.blue.gold=5000;a.gainExperience(3300);m.purchase(a,'weapon');m.purchase(a,'weapon');
 const e=new Combat().enemies[0];e.x=a.hero.x+80;e.y=a.hero.y;e.armor=0;e.magicResist=0;e.hp=e.maxHp=10000;a.enemies=[e];
 assert.ok(a.castSkill('manual',e));near(10000-e.hp,239);a.cooldown.ultimate=0;assert.ok(a.castSkill('ultimate',e));assert.equal(a.abilities.pet!.hp,750);assert.equal(a.abilities.pet!.damage,65.5);
 const frost=new Combat(CHAMPIONS[2]);frost.progression.enabled=true;frost.gainExperience(420);const target=frost.enemies[0];target.x=frost.hero.x+200;target.y=frost.hero.y;target.magicResist=0;frost.enemies=[target];assert.ok(frost.castSkill('ultimate',target));frost.gainExperience(2880);frost.abilities.step(.5);near(target.maxHp-target.hp,120);assert.equal(target.stunned,1.5);
});
test('new match restores equipment and resources, while recall retains upgrades and ranks',()=>{
 const m=new LaneMatch(),c=m.members[0];m.economy.blue.gold=2000;m.purchase(c,'armor');c.gainExperience(3300);c.hero.x=700;c.recall();c.enemies=[];c.step(4.1);assert.equal(c.equipment.armor,2);assert.equal(c.ranks.R,3);assert.equal(c.hero.x,c.profile.spawn.x);
 const fresh=new LaneMatch();assert.equal(fresh.members[0].equipment.armor,1);assert.equal(fresh.members[0].ranks.R,0);assert.equal(fresh.economy.blue.gold,200);
});
