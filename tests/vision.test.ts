import test from 'node:test';
import assert from 'node:assert/strict';
import { TeamVision } from '../src/game/vision.ts';
import type { VisionSource, VisionSubject } from '../src/game/vision.ts';

const source=(x=100,y=100,team:'blue'|'red'='blue',radius=100):VisionSource=>({x,y,team,radius,alive:true});
const enemy=(x=150,y=100,team:'blue'|'red'='red'):VisionSubject=>({id:team+'-hero',x,y,team,generation:0,alive:true});
const bushes=[{id:'north',x:140,y:60,width:80,height:80},{id:'south',x:140,y:160,width:80,height:80}];

test('team vision shares every live source and applies identical rules to both teams',()=>{
  const v=new TeamVision(1000,1000),red=enemy(),blue=enemy(550,100,'blue');
  v.update([source(),source(600,100,'red')],[red,blue],0);
  assert.ok(v.canSee('blue',red));assert.ok(v.canSee('red',blue));
  assert.ok(!v.canSee('blue',enemy(900)));assert.ok(!v.canSee('red',enemy(900,100,'blue')));
  v.update([source(800),{...source(),alive:false}],[red],1);
  assert.ok(!v.canSee('blue',red));assert.equal(v.lastSeen('red',red.id),null);
});
test('range boundary is inclusive while map edges reject invalid positions',()=>{
  const v=new TeamVision(1000,1000);v.update([source()],[],0);
  assert.ok(v.canSee('blue',enemy(200)));assert.ok(!v.canSee('blue',enemy(200.001)));
  assert.ok(!v.canSee('blue',enemy(-1)));assert.ok(!v.canSee('blue',enemy(1000)));
  assert.ok(!v.canSee('blue',enemy(NaN)));assert.ok(!v.pointVisible('blue',{x:Infinity,y:0}));
});
test('outside sources cannot see into a bush; same bush and outside terrain follow range',()=>{
  const v=new TeamVision(1000,1000,bushes),target=enemy(170);
  v.update([source()],[],0);assert.ok(!v.canSee('blue',target));assert.ok(v.pointVisible('blue',target));
  v.update([source(150)],[],1);assert.ok(v.canSee('blue',target));
  assert.ok(v.canSee('blue',enemy(120)));assert.ok(!v.canSee('blue',enemy(170,180)));
  assert.equal(v.bushAt({x:220,y:100}),null);
});
test('attack exposure bypasses bush concealment but does not grant global sight',()=>{
  const v=new TeamVision(1000,1000,bushes),target={...enemy(170),exposed:true};
  v.update([source()],[],0);assert.ok(v.canSee('blue',target));
  assert.ok(!v.canSee('blue',{...target,exposed:false}));
  v.update([source(500)],[],1);assert.ok(!v.canSee('blue',target));
});
test('scouting reveals bush occupants only to the owning team and expires with its source',()=>{
  const v=new TeamVision(1000,1000,bushes),red=enemy(170),blue=enemy(180,100,'blue');
  v.update([{...source(170,100,'blue',50),revealsBush:true},source(100,100,'red',100)],[red,blue],0);
  assert.ok(v.canSee('blue',red));assert.ok(!v.canSee('red',blue));
  v.update([], [red,blue],5);assert.ok(!v.canSee('blue',red));
});
test('terrain exploration persists per team without preserving live enemy visibility',()=>{
  const v=new TeamVision(1000,1000,[],20),p={x:110,y:110},target=enemy(110,110);
  assert.equal(v.terrain('blue',p),'unexplored');
  v.update([source()],[target],1);assert.equal(v.terrain('blue',p),'visible');
  v.update([], [target],2);assert.equal(v.terrain('blue',p),'remembered');
  assert.equal(v.terrain('red',p),'unexplored');assert.ok(!v.canSee('blue',target));
  v.reset();assert.equal(v.terrain('blue',p),'unexplored');assert.equal(v.lastSeen('blue',target.id),null);
});
test('last sighting snapshots cannot leak hidden movement, death or a new life',()=>{
  const v=new TeamVision(1000,1000),target=enemy();
  v.update([source()],[target],1);
  const initial=v.lastSeen('blue',target.id)!;initial.x=999;
  target.x=700;target.generation=1;
  v.update([source()],[target],2);
  assert.deepEqual(v.lastSeen('blue',target.id),{x:150,y:100,generation:0,seenAt:1});
  target.alive=false;v.update([source()],[target],3);assert.equal(v.lastSeen('blue',target.id)!.seenAt,1);
  target.alive=true;target.x=160;v.update([source()],[target],4);
  assert.deepEqual(v.lastSeen('blue',target.id),{x:160,y:100,generation:1,seenAt:4});
  target.alive=false;v.update([source()],[target],5);assert.equal(v.lastSeen('blue',target.id),null);
});
test('source and map snapshots remain independent of caller mutation',()=>{
  const layout=[{id:'a',x:140,y:60,width:80,height:80}],v=new TeamVision(1000,1000,layout);
  const s=source();v.update([s],[],0);s.x=900;layout[0].x=900;
  assert.ok(v.pointVisible('blue',enemy()));assert.ok(!v.canSee('blue',enemy()));
  assert.throws(()=>new TeamVision(0,100));assert.throws(()=>new TeamVision(100,100,[],NaN));
  assert.throws(()=>new TeamVision(100,100,[...layout,...layout]));
  assert.throws(()=>v.update([],[],NaN));
});
