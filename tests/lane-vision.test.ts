import test from 'node:test';
import assert from 'node:assert/strict';
import { LaneMatch, LANE } from '../src/game/LaneMatch.ts';

function target(match:LaneMatch,id:string){
  const value=match.championTargets.find(t=>t.id===id);
  assert.ok(value,`missing target ${id}`);
  return value;
}

test('lane vision hides enemies in bushes until shared vision can reveal them',()=>{
  const match=new LaneMatch({ai:false});
  const blue=match.members[0],red=match.opponents[0],redTarget=target(match,red.profile.id);
  blue.hero.x=600;blue.hero.y=430;
  red.hero.x=720;red.hero.y=430;
  match.step(1/60);
  assert.equal(match.vision.bushAt(red.hero),'lane-north');
  assert.equal(match.vision.bushAt(blue.hero),null);
  assert.equal(match.canSee('blue',redTarget),false);

  blue.hero.x=680;blue.hero.y=430;
  match.step(1/60);
  assert.equal(match.vision.bushAt(blue.hero),'lane-north');
  assert.equal(match.canSee('blue',redTarget),true);
});

test('last seen position does not follow a hidden champion',()=>{
  const match=new LaneMatch({ai:false});
  const blue=match.members[0],red=match.opponents[0],redTarget=target(match,red.profile.id);
  blue.hero.x=680;blue.hero.y=430;
  red.hero.x=720;red.hero.y=430;
  match.step(1/60);
  assert.deepEqual(match.lastSeen('blue',redTarget),{x:720,y:430});

  blue.hero.x=600;blue.hero.y=430;
  red.hero.x=820;red.hero.y=430;
  match.step(1/60);
  assert.equal(match.canSee('blue',redTarget),false);
  assert.deepEqual(match.lastSeen('blue',redTarget),{x:720,y:430});
});

test('offensive action reveals a bush-hidden champion for the configured duration',()=>{
  const match=new LaneMatch({ai:false});
  const blue=match.members[0],red=match.opponents[0],redTarget=target(match,red.profile.id);
  blue.hero.x=600;blue.hero.y=430;
  red.hero.x=720;red.hero.y=430;
  match.step(1/60);
  assert.equal(match.canSee('blue',redTarget),false);

  red.offensiveAction();
  match.step(1/60);
  assert.equal(match.canSee('blue',redTarget),true);

  match.step(LANE.vision.attackReveal+.02);
  assert.equal(match.canSee('blue',redTarget),false);
});
