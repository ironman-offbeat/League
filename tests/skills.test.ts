import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat,mitigate } from '../src/game/combat.ts';
import { CHAMPIONS } from '../src/game/champions.ts';
import { Squad } from '../src/game/Squad.ts';
import { RULES,distance } from '../src/game/config.ts';
import { freshStatus,applyCC,applySlow,tickStatus } from '../src/game/effects.ts';
const advance=(c:{step:(dt:number)=>void},t:number)=>{for(let i=0;i<Math.ceil(t/RULES.step);i++)c.step(RULES.step);};
const actor=(index:number)=>new Combat(CHAMPIONS[index]);
const near=(c:Combat,x=600,y=470)=>{c.hero.x=x;c.hero.y=y;};
test('physical and magic damage use distinct resistance; curse amplifies only magic',()=>{
 const c=actor(3),e=c.enemies[0];e.armor=100;e.magicResist=0;e.marked=3;
 c.hurt(e,100,'physical');assert.equal(c.damage,50);c.hurt(e,100,'magic',true,'magic');assert.ok(Math.abs(c.damage-160)<1e-8);
});
test('CC uses max duration; roots allow attacks but block moves and hooks, airborne blocks actions',()=>{
 const s=freshStatus();applyCC(s,'stunned',2);applyCC(s,'stunned',1);assert.equal(s.stunned,2);applySlow(s,.25,2);applySlow(s,.15,1);assert.equal(s.slow,.25);tickStatus(s,2);assert.equal(s.slow,0);
 const c=actor(3);c.recall();c.receiveCC('rooted',1);assert.equal(c.command.kind,'idle');assert.equal(c.move({x:100,y:100}),false);assert.equal(c.castSkill('manual',{x:720,y:470}),false);assert.equal(c.attack('a'),true);
 c.hero.airborne=1;assert.equal(c.attack('a'),false);assert.equal(c.castSkill('ultimate'),false);
});
test('flame passive: Q prepares, W consumes on hit and misses preserve readiness',()=>{
 const c=actor(1);near(c);const e=c.enemies[0];
 for(let i=0;i<3;i++){c.cooldown.q=0;c.hero.mana=420;assert.ok(c.abilities.auto(e));}
 assert.equal(c.abilities.stacks,3);c.hero.mana=420;c.cooldown.q=0;c.abilities.auto(e);assert.equal(c.abilities.stacks,3);
 assert.ok(c.castSkill('manual',{x:400,y:470}));assert.equal(c.abilities.stacks,3);c.cooldown.dash=0;
 assert.ok(c.castSkill('manual',e));assert.equal(c.abilities.stacks,0);assert.equal(e.stunned,1);
});
test('flame R clamps range, stuns with passive and creates a timed bear',()=>{
 const c=actor(1);near(c);c.abilities.stacks=3;assert.ok(c.castSkill('ultimate',c.enemies[0]));
 assert.equal(c.enemies[0].stunned,1);assert.equal(c.hero.mana,320);assert.ok(c.abilities.pet);const before=c.damage;
 advance(c,1.2);assert.ok(c.damage>before);advance(c,11);assert.equal(c.abilities.pet,null);
});
test('flame shield triggers after low-health hit, absorbs damage and expires',()=>{
 const c=actor(1);near(c,1100,800);c.hero.hp=430;c.receiveDamage(20);assert.equal(c.hero.shield,70);assert.equal(c.hero.mana,380);
 const hp=c.hero.hp;c.receiveDamage(50);assert.equal(c.hero.hp,hp);assert.ok(c.hero.shield<70);advance(c,3.1);assert.equal(c.hero.shield,0);
});
test('automatic offensive skills reserve one ultimate; defense can spend below reserve',()=>{
 for(const i of [1,2,3]){const c=actor(i);near(c,680,470);c.hero.mana=100;assert.equal(c.abilities.auto(c.enemies[0]),false);assert.equal(c.hero.mana,100);}
 const c=actor(1);c.hero.hp=100;c.hero.mana=50;c.receiveDamage(1);assert.equal(c.hero.mana,10);assert.equal(c.hero.shield,70);
});
test('frost volley hits each cone target once and applies strongest slow',()=>{
 const c=actor(2);near(c);c.cooldown.q=10;const e=c.enemies[0];const hp=e.hp;assert.ok(c.abilities.auto(e));
 assert.ok(Math.abs(hp-e.hp-mitigate(60+58*.6,e.armor))<1e-7);assert.equal(e.slow,.25);c.abilities.onBasicHit(e);assert.equal(e.slow,.25);
});
test('frost Q speeds basic attack clock without cancelling an existing cooldown',()=>{
 const c=actor(2);near(c,500,470);c.cooldown.attack=.8;assert.ok(c.abilities.auto(c.enemies[0]));assert.equal(c.cooldown.attack,.8);assert.equal(c.abilities.haste,4);
 c.cooldown.w=99;c.attack('a');advance(c,.82);assert.ok(c.pending);assert.ok(c.cooldown.attack<1/.85/1.3+.001);
});
test('scout exposes only its region for five seconds, without changing base visibility',()=>{
 const c=actor(2),e=c.enemies[0];e.visible=false;assert.equal(c.canSee(e),false);
 assert.ok(c.castSkill('manual',e));assert.equal(c.canSee(e),true);assert.equal(e.visible,false);advance(c,5.1);assert.equal(c.canSee(e),false);
});
test('frost arrow hits only first target even over a large simulation step',()=>{
 const c=actor(2);near(c,500,470);c.enemies[1].x=850;c.enemies[1].y=470;
 assert.ok(c.castSkill('ultimate',{x:1200,y:470}));c.step(.8);assert.ok(c.enemies[0].hp<1600);assert.equal(c.enemies[1].hp,1600);assert.ok(c.enemies[0].stunned>0);
});
test('curse hook stops at first target and pulls into an attack order with new anchor',()=>{
 const c=actor(3);near(c,500,470);assert.ok(c.castSkill('manual',{x:1000,y:470}));advance(c,.7);
 assert.equal(c.command.kind,'attack');assert.ok(distance(c.hero,c.enemies[0])<=61);assert.ok(c.anchor.x>600);
});
test('missed hook expires without moving and cannot pull a dead caster',()=>{
 const c=actor(3);near(c,500,470);assert.ok(c.castSkill('manual',{x:500,y:100}));advance(c,1);assert.equal(c.hero.x,500);assert.equal(c.hero.y,470);assert.equal(c.abilities.missiles.length,0);
 c.cooldown.dash=0;c.castSkill('manual',{x:1000,y:470});c.receiveDamage(10000);advance(c,.5);assert.equal(c.abilities.pull,null);assert.equal(c.hero.x,500);
});
test('curse aura stops during movement and preserves ultimate mana',()=>{
 const c=actor(3);near(c,680,470);c.attack('a');c.cooldown.e=99;c.cooldown.attack=99;advance(c,.2);assert.ok(c.abilities.aura);const damage=c.damage;
 c.move({x:300,y:700});advance(c,.1);assert.equal(c.abilities.aura,false);assert.equal(c.damage,damage);
 c.command={kind:'idle'};c.hero.mana=100;advance(c,.1);assert.equal(c.abilities.aura,false);
});
test('curse ultimate roots all nearby enemies and leaves distant targets alone',()=>{
 const c=actor(3);near(c,720,470);assert.ok(c.castSkill('ultimate'));assert.equal(c.enemies[0].rooted,1.5);assert.equal(c.enemies[2].hp,1600);assert.equal(c.hero.mana,300);
});
test('retaliation has a windup, can be disabled, and CC cancels a pending strike',()=>{
 const s=new Squad(true),c=s.members[1],e=c.enemies[0];near(c,710,470);c.hurt(e,1,'test');s.step(.01);assert.ok(s.counterattacks.size);const hp=c.hero.hp;
 e.stunned=1;s.step(.01);assert.equal(s.counterattacks.size,0);assert.equal(c.hero.hp,hp);
 s.setRetaliation(false);advance(s,2);assert.equal(c.hero.hp,hp);
});
test('counterattack damages nearest attacker and interrupts recall even under shield',()=>{
 const s=new Squad(true),c=s.members[1],e=c.enemies[0];near(c,710,470);c.hurt(e,1,'test');c.hero.shield=200;c.hero.shieldRemaining=3;c.recall();advance(s,.6);
 assert.notEqual(c.command.kind,'recall');assert.ok(c.hero.shield<200);
});
test('death clears buffs and commands, cooldown continues, respawn restores personal state',()=>{
 const c=actor(1);near(c);c.castSkill('ultimate',c.enemies[0]);c.abilities.stacks=3;c.receiveDamage(100000);
 assert.equal(c.alive,false);assert.equal(c.abilities.pet,null);assert.equal(c.abilities.stacks,0);assert.equal(c.move({x:100,y:100}),false);
 const cd=c.cooldown.ultimate;advance(c,6.6);assert.ok(c.alive);assert.ok(c.cooldown.ultimate<cd);assert.equal(c.hero.hp,620);assert.equal(c.hero.mana,420);assert.equal(c.command.kind,'idle');assert.equal(c.hero.x,c.profile.spawn.x);
});
test('bear can absorb retaliation and disappears when killed',()=>{
 const s=new Squad(true),c=s.members[1];near(c);c.castSkill('ultimate',c.enemies[0]);const pet=c.abilities.pet!;pet.hp=20;advance(s,.7);assert.equal(c.abilities.pet,null);
});
test('ongoing ultimate and regeneration continue while stunned',()=>{
 const c=actor(0);near(c,100,100);c.castUltimate();c.hero.hp=500;c.hero.stunned=12;advance(c,10.1);
 assert.equal(c.ultimateRemaining,0);assert.equal(c.hero.maxHp,850);assert.ok(c.hero.hp>500);
});
