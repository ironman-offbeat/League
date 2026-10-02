import test from 'node:test';
import assert from 'node:assert/strict';
import { Squad } from '../src/game/Squad.ts';
import { RULES, distance } from '../src/game/config.ts';
const advance=(s:Squad,t:number)=>{for(let i=0;i<Math.ceil(t/RULES.step);i++)s.step(RULES.step);};
test('switching preserves independent orders and shared target damage',()=>{
 const s=new Squad(), [r,a]=s.members;
 r.attack('a');s.select(1);a.attack('a');s.select(2);s.selected.move({x:200,y:800});advance(s,4);
 assert.ok(r.damage>0);assert.ok(a.damage>0);assert.equal(r.command.kind,'attack');assert.equal(a.command.kind,'attack');
 assert.equal(s.selected.hero.x,200);assert.equal(s.selected.hero.y,800);
 assert.ok(Math.abs(r.enemies[0].hp-(r.enemies[0].maxHp-r.damage-a.damage))<1e-7);
 assert.ok(distance(a.hero,a.enemies[0])>200);assert.equal(a.hero.fury,0);
 assert.equal(s.select(99),false);assert.equal(s.selectedIndex,2);
});
test('shared respawn and stun timers tick once for the whole squad',()=>{
 const s=new Squad(),e=s.selected.enemies[0];e.alive=false;e.hp=0;e.respawn=3;
 const other=s.selected.enemies[1];other.stunned=2;advance(s,1);
 assert.equal(e.alive,false);assert.ok(Math.abs(e.respawn-2)<1e-7);assert.ok(Math.abs(other.stunned-1)<1e-7);
 advance(s,2.1);assert.equal(e.alive,true);assert.equal(e.generation,1);
});
test('launched projectile survives move and selection, impacts only once',()=>{
 const s=new Squad(),a=s.members[1];a.cooldown.q=99;a.hero.x=480;a.hero.y=470;a.attack('a');advance(s,.3);
 assert.equal(a.projectiles.length,1);assert.equal(a.damage,0);const cd=a.cooldown.attack;
 a.move({x:200,y:700});s.select(3);advance(s,.7);
 assert.ok(a.damage>0);assert.equal(a.projectiles.length,0);assert.ok(a.cooldown.attack<cd);
 const damage=a.damage;advance(s,1);assert.equal(a.damage,damage);
});
test('old projectile cannot hit a respawned target',()=>{
 const s=new Squad(),a=s.members[1];a.cooldown.q=99;a.hero.x=480;a.hero.y=470;a.attack('a');advance(s,.3);
 a.move({x:200,y:700});const e=a.enemies[0];e.alive=false;e.hp=0;e.respawn=.01;
 advance(s,.8);assert.equal(e.generation,1);assert.equal(e.hp,e.maxHp);assert.equal(a.damage,0);
});
test('unselected cooldowns advance and recall returns to individual spawn',()=>{
 const s=new Squad(),r=s.members[0],a=s.members[1];r.castDash({x:600,y:560});s.select(1);
 a.hero.x=1200;a.recall();a.hero.mana=0;advance(s,4.1);
 assert.deepEqual({x:a.hero.x,y:a.hero.y},a.profile.spawn);assert.ok(a.hero.mana>0);assert.ok(r.cooldown.dash<8);
 assert.equal(a.castDash({x:600,y:560}),false);assert.equal(a.castUltimate(),false);
});
