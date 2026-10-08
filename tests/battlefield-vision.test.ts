import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLEFIELD,
  BATTLEFIELD_BUSHES,
  BattlefieldMatch,
} from '../src/game/BattlefieldMatch.ts';
import { RULES } from '../src/game/config.ts';

const targetFor=(match:BattlefieldMatch,id:string)=>{
  const target=match.championTargets.find(value=>value.id===id);
  assert.ok(target,`missing target ${id}`);
  return target;
};

const center=(b:(typeof BATTLEFIELD_BUSHES)[number])=>({
  x:b.x+b.width/2,
  y:b.y+b.height/2,
});

test('battlefield brush layout is finite, unique and inside the world',()=>{
  assert.equal(BATTLEFIELD_BUSHES.length,6);
  assert.equal(new Set(BATTLEFIELD_BUSHES.map(b=>b.id)).size,BATTLEFIELD_BUSHES.length);
  for(const bush of BATTLEFIELD_BUSHES){
    assert.ok(bush.x>=0&&bush.y>=0);
    assert.ok(bush.x+bush.width<=RULES.world.width);
    assert.ok(bush.y+bush.height<=RULES.world.height);
  }
});

test('battlefield brush hides an enemy from outside vision but same-brush vision reveals it',()=>{
  const match=new BattlefieldMatch();
  const bush=BATTLEFIELD_BUSHES[0],p=center(bush);
  const blue=match.members[0],red=match.opponents[0],redTarget=targetFor(match,red.profile.id);

  for(const actor of match.members.slice(1)){
    actor.hero.x=100;actor.hero.y=900;actor.anchor={x:100,y:900};
  }
  blue.hero.x=p.x;blue.hero.y=bush.y+bush.height+35;blue.anchor={x:blue.hero.x,y:blue.hero.y};
  red.hero.x=p.x;red.hero.y=p.y;red.anchor={...p};
  match.refreshVision();

  assert.equal(match.bushAt(red.hero),bush.id);
  assert.equal(match.bushAt(blue.hero),null);
  assert.equal(match.canSee('blue',redTarget),false);

  blue.hero.x=p.x-40;blue.hero.y=p.y;blue.anchor={x:blue.hero.x,y:blue.hero.y};
  match.refreshVision();
  assert.equal(match.bushAt(blue.hero),bush.id);
  assert.equal(match.canSee('blue',redTarget),true);
});

test('battlefield offensive action temporarily exposes a brush-hidden champion',()=>{
  const match=new BattlefieldMatch();
  const bush=BATTLEFIELD_BUSHES[0],p=center(bush);
  const blue=match.members[0],red=match.opponents[0],redTarget=targetFor(match,red.profile.id);

  for(const actor of match.members.slice(1)){
    actor.hero.x=100;actor.hero.y=900;actor.anchor={x:100,y:900};
  }
  blue.hero.x=p.x;blue.hero.y=bush.y+bush.height+35;blue.anchor={x:blue.hero.x,y:blue.hero.y};
  red.hero.x=p.x;red.hero.y=p.y;red.anchor={...p};
  match.refreshVision();
  assert.equal(match.canSee('blue',redTarget),false);

  red.offensiveAction();
  match.refreshVision();
  assert.equal(match.canSee('blue',redTarget),true);

  match.elapsed+=BATTLEFIELD.vision.attackReveal+.02;
  match.refreshVision();
  assert.equal(match.canSee('blue',redTarget),false);
});

test('battlefield tower cannot attack a champion concealed in brush until allied shared vision reveals it',()=>{
  const match=new BattlefieldMatch();
  const bush=BATTLEFIELD_BUSHES.find(value=>value.id==='mid-blue-river-brush')!;
  const p=center(bush);
  const red=match.opponents[1],redTarget=targetFor(match,red.profile.id);
  const tower=match.structure('blue','outer','mid');

  for(const actor of match.members){
    actor.hero.x=100;actor.hero.y=900;actor.anchor={x:100,y:900};
  }
  red.hero.x=p.x;red.hero.y=p.y;red.anchor={...p};
  match.refreshVision();
  assert.ok(Math.hypot(tower.x-red.hero.x,tower.y-red.hero.y)<BATTLEFIELD.structures.outer.range);
  assert.equal(match.canSee('blue',redTarget),false);

  const hp=red.hero.hp;
  match.step(RULES.step);
  assert.equal(red.hero.hp,hp);

  const spotter=match.members[1];
  spotter.hero.x=p.x-30;spotter.hero.y=p.y;spotter.anchor={x:spotter.hero.x,y:spotter.hero.y};
  match.refreshVision();
  assert.equal(match.canSee('blue',redTarget),true);
  match.step(RULES.step);
  assert.ok(red.hero.hp<hp);
});
