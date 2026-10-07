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


test('hidden death does not leak through an existing attack order before the last seen point is reached',()=>{
  const match=new LaneMatch({ai:false});
  const blue=match.members[0],red=match.opponents[0],redTarget=target(match,red.profile.id);
  blue.hero.x=680;blue.hero.y=430;
  red.hero.x=720;red.hero.y=430;
  match.refreshVision();
  assert.equal(match.canSee('blue',redTarget),true);
  assert.ok(blue.attack(redTarget.id,{x:900,y:430}));
  const remembered=match.lastSeen('blue',redTarget);
  assert.ok(remembered);

  blue.hero.x=600;blue.hero.y=430;
  red.hero.x=820;red.hero.y=430;
  match.refreshVision();
  assert.equal(match.canSee('blue',redTarget),false);
  red.receiveDamage(1e6);
  match.refreshVision();

  const before={x:blue.hero.x,y:blue.hero.y};
  blue.step(.1,false);
  assert.equal(blue.command.kind,'attack');
  assert.ok(blue.hero.x!==before.x||blue.hero.y!==before.y);
  assert.deepEqual(blue.lastSeen,remembered);
});

test('tower drops a windup when its champion target disappears into a bush',()=>{
  const match=new LaneMatch({ai:false});
  const blue=match.members[0],tower=match.structure('red','tower');
  blue.hero.x=940;blue.hero.y=500;
  match.refreshVision();
  match.step(1/60);
  assert.equal(match.towerShots.get(tower.id)?.target.actor,blue);

  blue.hero.x=905;blue.hero.y=450;
  match.refreshVision();
  assert.equal(match.vision.bushAt(blue.hero),'lane-north');
  match.step(1/60);
  assert.equal(match.towerShots.has(tower.id),false);
});

test('an untargeted area attack can hit a hidden enemy after a visible enemy caused the cast',()=>{
  const match=new LaneMatch({ai:false});
  const blue=match.members[0],visible=match.opponents[0],hidden=match.opponents[1];
  blue.hero.x=620;blue.hero.y=430;blue.hero.hp=blue.hero.maxHp*.4;
  visible.hero.x=630;visible.hero.y=430;
  hidden.hero.x=670;hidden.hero.y=430;
  match.refreshVision();
  const visibleTarget=target(match,visible.profile.id),hiddenTarget=target(match,hidden.profile.id);
  assert.equal(match.canSee('blue',visibleTarget),true);
  assert.equal(match.canSee('blue',hiddenTarget),false);
  const hp=hidden.hero.hp;
  assert.ok(blue.attack(visibleTarget.id));
  blue.step(.1,false);
  assert.ok(hidden.hero.hp<hp);
});


test('summons obey bush concealment and reveal themselves when attacking without revealing their owner',()=>{
  const match=new LaneMatch({ai:false});
  const blue=match.members[0],red=match.opponents[1];
  blue.hero.x=600;blue.hero.y=560;
  red.hero.x=900;red.hero.y=560;
  red.progression.gain(420);
  red.hero.mana=red.maxMana;
  assert.ok(red.castSkill('ultimate',{x:900,y:560}));
  const pet=red.abilities.pet;assert.ok(pet);
  pet.x=900;pet.y=560;
  match.refreshVision();
  assert.equal(match.canSeePet('blue',red),false);

  // The R cast correctly exposes Annie first. Expire only that cast reveal
  // without advancing pet AI, then verify a pet attack reveals only the pet.
  match.elapsed+=LANE.vision.attackReveal+.02;
  match.refreshVision();
  const redTarget=target(match,red.profile.id);
  assert.equal(match.canSee('blue',redTarget),false);
  assert.equal(match.canSeePet('blue',red),false);

  red.summonOffensiveAction();
  match.refreshVision();
  assert.equal(match.canSeePet('blue',red),true);
  assert.equal(match.canSee('blue',redTarget),false);
});
