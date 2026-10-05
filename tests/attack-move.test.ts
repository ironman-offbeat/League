import test from 'node:test';
import assert from 'node:assert/strict';
import {Combat} from '../src/game/combat.ts';
import {CHAMPIONS} from '../src/game/champions.ts';
import {RULES,distance} from '../src/game/config.ts';
const step=(c:Combat,seconds:number)=>{for(let i=0;i<Math.ceil(seconds/RULES.step);i++)c.step(RULES.step);};
const remove=(c:Combat,id:string)=>{const e=c.enemies.find(e=>e.id===id)!;e.alive=false;e.hp=0;e.respawn=Infinity;};
test('moving target death keeps the original clicked point, not spawn or the death position',()=>{
 const c=new Combat();c.enemies=c.enemies.slice(0,1);const destination={x:735,y:475};c.attack('a',destination);destination.x=1200;
 c.enemies[0].x=1000;step(c,2);remove(c,'a');step(c,4);
 assert.deepEqual(c.anchor,{x:735,y:475});assert.ok(distance(c.hero,c.anchor)<.1);assert.equal(c.command.kind,'idle');
});
test('attack move fights route enemies both before and after the designated target dies',()=>{
 const c=new Combat();c.hero.x=600;c.hero.y=470;c.enemies[0].x=640;c.enemies[0].y=470;
 c.enemies[2].x=1100;c.enemies[2].y=470;c.attack('c');step(c,1);assert.ok(c.enemies[0].hp<c.enemies[0].maxHp);
 remove(c,'c');const before=c.enemies[0].hp;step(c,2);assert.ok(c.enemies[0].hp<before);
 for(const e of c.enemies)remove(c,e.id);step(c,5);assert.ok(distance(c.hero,{x:1100,y:470})<.1);
});
test('explicit destination target takes priority over a closer route enemy when both are in range',()=>{
 const c=new Combat(CHAMPIONS[2]);c.hero.x=600;c.hero.y=470;c.enemies[0].x=650;c.enemies[0].y=470;c.enemies[2].x=800;c.enemies[2].y=470;
 c.cooldown.q=100;c.cooldown.w=100;c.attack('c');step(c,1);
 assert.equal(c.enemies[0].hp,c.enemies[0].maxHp);assert.ok(c.enemies[2].hp<c.enemies[2].maxHp);
});
test('new move or dash replaces the attack destination and cancels its continuation',()=>{
 for(const action of ['move','dash']){
  const c=new Combat();c.attack('a');remove(c,'a');c.step(RULES.step);
  const point={x:300,y:650};action==='move'?c.move(point):c.castDash(point);const anchor={...c.anchor};
  step(c,4);assert.ok(distance(c.hero,anchor)<.1);assert.notEqual(c.command.kind,'attackMove');
 }
});
test('target respawn is not mistaken for the old forced target generation',()=>{
 const c=new Combat();c.attack('a');const e=c.enemies[0];e.generation++;e.x=1400;
 c.step(RULES.step);assert.equal(c.command.kind,'attackMove');step(c,4);assert.ok(distance(c.hero,{x:720,y:470})<.1);
});
test('ranged champion finishes movement to the target point after the killing projectile',()=>{
 const c=new Combat(CHAMPIONS[2]);c.hero.x=600;c.hero.y=470;c.cooldown.q=100;c.cooldown.w=100;c.enemies=c.enemies.slice(0,1);c.enemies[0].hp=1;c.enemies[0].respawn=Infinity;
 c.attack('a');step(c,1);assert.equal(c.enemies[0].alive,false);c.enemies[0].respawn=Infinity;step(c,3);
 assert.ok(distance(c.hero,{x:720,y:470})<.1);assert.equal(c.command.kind,'idle');
});
