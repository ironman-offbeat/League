import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, distance } from '../src/game/config.ts';
import { damageTarget } from '../src/game/targets.ts';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { JUNGLE, JungleState } from '../src/game/Jungle.ts';
import { BATTLEFIELD_NAVIGATION } from '../src/game/navigation.ts';

const step=(match:BattlefieldMatch,seconds:number)=>{
  for(let i=0;i<Math.round(seconds/RULES.step);i++)match.step(RULES.step);
};

test('jungle camp definitions reuse the four existing battlefield jungle nodes symmetrically',()=>{
  const state=new JungleState();
  assert.equal(state.camps.length,4);
  assert.deepEqual(state.camps.map(camp=>camp.id),['blue-blue','blue-red','red-red','red-blue']);
  assert.deepEqual(state.camps.filter(camp=>camp.side==='blue').map(camp=>camp.buff),['blue','red']);
  assert.deepEqual(state.camps.filter(camp=>camp.side==='red').map(camp=>camp.buff),['red','blue']);
  for(const camp of state.camps){
    assert.deepEqual(camp.point,BATTLEFIELD_NAVIGATION.node(camp.definition.nodeId).point);
    assert.equal(camp.definition.firstSpawn,JUNGLE.firstSpawn);
    assert.equal(camp.definition.respawn,JUNGLE.respawn);
  }
});

test('all jungle camps spawn together at the configured first-spawn time',()=>{
  const match=new BattlefieldMatch();
  assert.ok(match.jungle.camps.every(camp=>!camp.alive));
  step(match,JUNGLE.firstSpawn-1);
  assert.ok(match.jungle.camps.every(camp=>!camp.alive));
  step(match,1);
  assert.ok(match.jungle.camps.every(camp=>camp.alive));
  assert.ok(match.jungle.camps.every(camp=>camp.generation===0&&camp.nextSpawnAt===null));
});

test('defeated jungle camps respawn independently and increment only their own generation',()=>{
  const match=new BattlefieldMatch();
  step(match,JUNGLE.firstSpawn);
  const red=match.jungle.camp('blue-red');
  const blue=match.jungle.camp('blue-blue');

  assert.equal(red.defeat(match.elapsed),true);
  assert.equal(red.alive,false);
  assert.equal(red.respawnRemaining(match.elapsed),JUNGLE.respawn);
  assert.equal(blue.alive,true);

  step(match,JUNGLE.respawn-1);
  assert.equal(red.alive,false);
  assert.equal(red.generation,0);
  assert.equal(blue.alive,true);
  assert.equal(blue.generation,0);

  step(match,1);
  assert.equal(red.alive,true);
  assert.equal(red.generation,1);
  assert.equal(red.nextSpawnAt,null);
  assert.equal(blue.generation,0);
});

test('inactive or already defeated jungle camps cannot schedule duplicate respawns',()=>{
  const state=new JungleState();
  const camp=state.camp('red-blue');
  assert.equal(camp.defeat(0),false);
  camp.step(JUNGLE.firstSpawn);
  assert.equal(camp.defeat(JUNGLE.firstSpawn),true);
  const scheduled=camp.nextSpawnAt;
  assert.equal(camp.defeat(JUNGLE.firstSpawn+1),false);
  assert.equal(camp.nextSpawnAt,scheduled);
});

test('jungle lifecycle validates duplicate ids and invalid timing data',()=>{
  assert.throws(()=>new JungleState([
    {id:'same',side:'blue',buff:'blue',nodeId:'blue-jungle-top',firstSpawn:0,respawn:10},
    {id:'same',side:'red',buff:'red',nodeId:'red-jungle-top',firstSpawn:0,respawn:10},
  ]));
  assert.throws(()=>new JungleState([
    {id:'bad',side:'blue',buff:'blue',nodeId:'blue-jungle-top',firstSpawn:-1,respawn:10},
  ]));
  assert.throws(()=>new JungleState([
    {id:'bad',side:'blue',buff:'blue',nodeId:'blue-jungle-top',firstSpawn:0,respawn:0},
  ]));
});


test('jungle camps are shared neutral combat targets for both teams',()=>{
  const match=new BattlefieldMatch();
  const camp=match.jungle.camp('blue-red');
  assert.equal(camp.kind,'monster');
  assert.ok(match.members.every(actor=>actor.enemies.includes(camp)));
  assert.ok(match.opponents.every(actor=>actor.enemies.includes(camp)));
  assert.equal(match.members[0].autoTargetAllowed(camp),false);
  assert.equal(match.opponents[0].autoTargetAllowed(camp),false);
});

test('a visible jungle monster accepts champion attacks, takes damage and schedules its own respawn',()=>{
  const match=new BattlefieldMatch();
  step(match,JUNGLE.firstSpawn);
  const camp=match.jungle.camp('blue-red');
  const amumu=match.members.find(actor=>actor.visualId==='amumu')!;
  amumu.hero.x=camp.x-25;amumu.hero.y=camp.y;amumu.anchor={x:amumu.hero.x,y:amumu.hero.y};
  match.refreshVision();

  assert.equal(match.canSee('blue',camp),true);
  assert.ok(amumu.attack(camp.id,{x:camp.x,y:camp.y}));
  const hp=camp.hp;
  step(match,1.5);
  assert.ok(camp.hp<hp);

  const generation=camp.generation;
  damageTarget(camp,1e9,'physical','basic');
  assert.equal(camp.alive,false);
  assert.equal(camp.hp,0);
  assert.equal(camp.generation,generation);
  assert.equal(camp.respawnRemaining(match.elapsed),JUNGLE.respawn);
  assert.equal(amumu.attack(camp.id,{x:camp.x,y:camp.y}),false);

  step(match,JUNGLE.respawn);
  assert.equal(camp.alive,true);
  assert.equal(camp.hp,camp.maxHp);
  assert.equal(camp.generation,generation+1);
});

test('neutral jungle monsters obey battlefield team vision instead of global visibility',()=>{
  const match=new BattlefieldMatch();
  step(match,JUNGLE.firstSpawn);
  const blueCamp=match.jungle.camp('blue-red');

  for(const actor of match.members){
    actor.hero.x=100;actor.hero.y=900;actor.anchor={x:100,y:900};
  }
  for(const actor of match.opponents){
    actor.hero.x=1450;actor.hero.y=100;actor.anchor={x:1450,y:100};
  }
  for(const unit of match.units){
    if(unit.kind==='minion'||unit.role==='outer'||unit.role==='inner')unit.alive=false;
  }
  match.vision.reset();
  match.refreshVision();
  assert.equal(match.canSee('blue',blueCamp),false);
  assert.equal(match.canSee('red',blueCamp),false);

  const scout=match.members[0];
  scout.hero.x=blueCamp.x-80;scout.hero.y=blueCamp.y;scout.anchor={x:scout.hero.x,y:scout.hero.y};
  match.refreshVision();
  assert.equal(match.canSee('blue',blueCamp),true);
  assert.equal(match.canSee('red',blueCamp),false);
});

test('existing battlefield AI ignores neutral monsters until jungle-AI integration arrives',()=>{
  const match=new BattlefieldMatch({ai:true});
  step(match,JUNGLE.firstSpawn);
  const redAmumu=match.opponents.find(actor=>actor.visualId==='amumu')!;
  const camp=match.jungle.camp('red-red');
  redAmumu.hero.x=camp.x;redAmumu.hero.y=camp.y;redAmumu.anchor={x:camp.x,y:camp.y};
  match.refreshVision();

  const hp=camp.hp;
  step(match,1);
  assert.ok(redAmumu.command.kind!=='attack'||redAmumu.command.targetId!==camp.id);
  assert.equal(camp.hp,hp);
});


test('jungle monster stays neutral until attacked even when a champion stands nearby',()=>{
  const match=new BattlefieldMatch();
  step(match,JUNGLE.firstSpawn);
  const camp=match.jungle.camp('blue-red');
  const amumu=match.members.find(actor=>actor.visualId==='amumu')!;
  amumu.hero.x=camp.x+20;amumu.hero.y=camp.y;amumu.anchor={x:amumu.hero.x,y:amumu.hero.y};
  match.refreshVision();

  const hp=amumu.hero.hp;
  step(match,JUNGLE.monster.interval*2);
  assert.equal(camp.aggro,null);
  assert.equal(amumu.hero.hp,hp);
});

test('jungle monster retaliates against the champion that damaged it',()=>{
  const match=new BattlefieldMatch();
  step(match,JUNGLE.firstSpawn);
  const camp=match.jungle.camp('blue-red');
  const amumu=match.members.find(actor=>actor.visualId==='amumu')!;
  amumu.hero.x=camp.x+20;amumu.hero.y=camp.y;amumu.anchor={x:amumu.hero.x,y:amumu.hero.y};

  amumu.hurt(camp,80,'test',false,'physical','basic');
  assert.equal(camp.aggro,amumu.profile.id);
  assert.ok(camp.hp<camp.maxHp);

  const hp=amumu.hero.hp;
  step(match,RULES.step);
  assert.ok(amumu.hero.hp<hp);
  assert.equal(camp.attackCooldown>0,true);
});

test('jungle monster chases its aggro target only inside the camp leash',()=>{
  const match=new BattlefieldMatch();
  step(match,JUNGLE.firstSpawn);
  const camp=match.jungle.camp('blue-red');
  const amumu=match.members.find(actor=>actor.visualId==='amumu')!;
  amumu.hero.x=camp.point.x+180;amumu.hero.y=camp.point.y;amumu.anchor={x:amumu.hero.x,y:amumu.hero.y};

  amumu.hurt(camp,40,'test',false,'physical','basic');
  const start={x:camp.x,y:camp.y};
  step(match,.5);

  assert.ok(camp.x>start.x);
  assert.ok(distance(camp,camp.point)<JUNGLE.monster.leash);
  assert.equal(camp.aggro,amumu.profile.id);
});

test('jungle monster drops aggro, returns home and fully resets after its target leaves the leash',()=>{
  const match=new BattlefieldMatch();
  step(match,JUNGLE.firstSpawn);
  const camp=match.jungle.camp('blue-red');
  const amumu=match.members.find(actor=>actor.visualId==='amumu')!;

  amumu.hero.x=camp.point.x+180;amumu.hero.y=camp.point.y;amumu.anchor={x:amumu.hero.x,y:amumu.hero.y};
  amumu.hurt(camp,300,'test',false,'physical','basic');
  step(match,.75);
  assert.ok(distance(camp,camp.point)>0);
  assert.ok(camp.hp<camp.maxHp);

  amumu.hero.x=camp.point.x+JUNGLE.monster.leash+60;amumu.hero.y=camp.point.y;
  amumu.anchor={x:amumu.hero.x,y:amumu.hero.y};
  step(match,2);

  assert.equal(camp.aggro,null);
  assert.equal(distance(camp,camp.point),0);
  assert.equal(camp.hp,camp.maxHp);
  assert.equal(camp.stunned,0);
  assert.equal(camp.rooted,0);
  assert.equal(camp.slowRemaining,0);
});

test('jungle monster resets when its aggro target dies',()=>{
  const match=new BattlefieldMatch();
  step(match,JUNGLE.firstSpawn);
  const camp=match.jungle.camp('blue-red');
  const amumu=match.members.find(actor=>actor.visualId==='amumu')!;
  amumu.hero.x=camp.x+25;amumu.hero.y=camp.y;amumu.anchor={x:amumu.hero.x,y:amumu.hero.y};

  amumu.hurt(camp,100,'test',false,'physical','basic');
  assert.equal(camp.aggro,amumu.profile.id);
  amumu.receiveDamage(1e9);
  step(match,RULES.step);

  assert.equal(camp.aggro,null);
  assert.equal(distance(camp,camp.point),0);
  assert.equal(camp.hp,camp.maxHp);
});
