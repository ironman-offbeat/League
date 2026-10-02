import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, mitigate } from '../src/game/combat.ts';
import { RULES, distance } from '../src/game/config.ts';
const advance=(c:Combat,seconds:number)=>{for(let i=0;i<Math.ceil(seconds/RULES.step);i++)c.step(RULES.step);};

test('armor reduces physical damage deterministically',()=>{assert.equal(mitigate(100,100),50);assert.equal(mitigate(100,-10),100);});
test('movement ignores targets along the route and cancels forced attack',()=>{
  const c=new Combat();c.attack('a');advance(c,.1);c.move({x:1350,y:470});advance(c,6);
  assert.equal(c.damage,0);assert.equal(c.hero.x,1350);assert.equal(c.hero.y,470);
});
test('forced target ignores anchor limit, attacks, then retreat prevents more damage',()=>{
  const c=new Combat();c.attack('c');advance(c,4);assert.ok(c.damage>0);
  const dealt=c.damage;c.move({x:200,y:800});advance(c,2);assert.equal(c.damage,dealt);assert.equal(c.command.kind,'move');
});
test('idle auto combat cannot chase a target beyond anchor radius',()=>{const c=new Combat();advance(c,10);assert.equal(c.damage,0);assert.deepEqual({x:c.hero.x,y:c.hero.y},RULES.spawn);});
test('move during windup cancels hit without resetting attack timer',()=>{
  const c=new Combat();c.hero.x=680;c.hero.y=470;c.attack('a');c.step(RULES.step);assert.ok(c.pending);
  c.move({x:400,y:700});advance(c,.3);assert.equal(c.damage,0);assert.equal(c.pending,null);assert.ok(c.cooldown.attack>0);
});
test('dash clamps distance, cancels chase, hits each enemy once and consumes cooldown',()=>{
  const c=new Combat();c.hero.x=620;c.hero.y=470;c.attack('a');assert.ok(c.castDash({x:1600,y:470}));assert.equal(c.command.kind,'idle');
  assert.ok(!c.castDash({x:900,y:470}));advance(c,.22);assert.equal(c.hero.x,820);assert.equal(c.hero.y,470);
  const dashHits=c.events.filter(e=>e.kind==='damage'&&e.source==='E');
  assert.equal(dashHits.length,1);assert.ok(Math.abs(dashHits[0].amount!-mitigate(RULES.dash.damage,30))<.001);assert.equal(c.anchor.x,820);
});
test('zero-length dash neither fires nor consumes cooldown',()=>{const c=new Combat();assert.equal(c.castDash(c.hero),false);assert.equal(c.cooldown.dash,0);});
test('ultimate expiry removes bonus max health without killing hero',()=>{
  const c=new Combat();assert.ok(c.castUltimate());assert.equal(c.hero.maxHp,1100);c.hero.x=200;c.hero.y=200;c.hero.hp=50;advance(c,10.1);
  assert.equal(c.hero.maxHp,850);assert.ok(c.hero.hp>0&&c.hero.hp<100);assert.equal(c.castUltimate(),false);
});
test('recall can be cancelled by movement, and completed recall returns to base',()=>{
  const c=new Combat();c.hero.x=1200;c.recall();advance(c,2);c.move({x:1100,y:700});advance(c,3);assert.notEqual(c.hero.x,RULES.spawn.x);
  c.recall();advance(c,4.1);assert.deepEqual({x:c.hero.x,y:c.hero.y},RULES.spawn);
});
test('lost target is pursued only to last seen point, then anchor return',()=>{
  const c=new Combat();c.attack('a');advance(c,.1);c.enemies[0].visible=false;c.enemies[0].x=1400;advance(c,2);
  assert.ok(c.hero.x<800);assert.equal(c.damage,0);advance(c,4);assert.ok(distance(c.hero,RULES.spawn)<1);
});
test('dead forced target does not switch to another nearby enemy before returning',()=>{
  const c=new Combat();c.hero.x=680;c.hero.y=470;c.attack('a');c.enemies[0].alive=false;c.enemies[0].respawn=10;c.step(RULES.step);
  assert.equal(c.command.kind,'return');assert.equal(c.damage,0);advance(c,.5);assert.ok(c.hero.x<680);
});
test('low-health empowered Q consumes fury and heals through common event stream',()=>{
  const c=new Combat();c.hero.x=665;c.hero.y=470;c.hero.hp=200;c.hero.fury=60;c.lastCombat=0;c.attack('a');c.step(RULES.step);
  assert.equal(c.hero.fury,10);assert.ok(c.hero.hp>=270);assert.ok(c.events.some(e=>e.kind==='heal'));assert.ok(c.damage>0);
});
test('defeated training target respawns with full health',()=>{
  const c=new Combat();c.enemies[0].alive=false;c.enemies[0].hp=0;c.enemies[0].respawn=1;advance(c,1.1);assert.equal(c.enemies[0].hp,1600);assert.ok(c.enemies[0].alive);
});
