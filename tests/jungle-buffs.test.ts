import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat } from '../src/game/combat.ts';
import { CHAMPIONS } from '../src/game/champions.ts';
import { RULES } from '../src/game/config.ts';
import { JungleBuffs, JUNGLE_BUFF_RULES } from '../src/game/JungleBuffs.ts';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { JUNGLE } from '../src/game/Jungle.ts';

const champion=(id:string)=>{
  const profile=CHAMPIONS.find(value=>value.id===id);
  assert.ok(profile);
  return new Combat(profile);
};
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`expected ${a} to equal ${b}`);

test('red and blue buffs go only to the last-hitting champion, and can coexist',()=>{
  const match=new BattlefieldMatch();
  match.jungle.step(JUNGLE.firstSpawn);
  const killer=match.members[3];
  const ally=match.members[0];
  const blue=match.jungle.camp('blue-blue');
  const red=match.jungle.camp('blue-red');
  killer.hero.x=blue.x;killer.hero.y=blue.y;
  killer.hurt(blue,1e9,'blue finish',false,'physical','basic');
  assert.equal(killer.buffs.blue,JUNGLE_BUFF_RULES.duration);
  assert.equal(killer.buffs.red,0);
  assert.equal(ally.buffs.blue,0);

  killer.hero.x=red.x;killer.hero.y=red.y;
  killer.hurt(red,1e9,'red finish',false,'physical','basic');
  assert.equal(killer.buffs.red,JUNGLE_BUFF_RULES.duration);
  assert.equal(killer.buffs.blue,JUNGLE_BUFF_RULES.duration);

  const enemy=match.opponents[0];
  const steal=match.jungle.camp('red-red');
  enemy.hero.x=steal.x;enemy.hero.y=steal.y;
  enemy.hurt(steal,1e9,'steal',false,'physical','basic');
  assert.equal(enemy.buffs.red,JUNGLE_BUFF_RULES.duration);
  assert.equal(match.opponents[1].buffs.red,0);
});

test('same buff refreshes duration without stacking, and expires with simulation time',()=>{
  const buffs=new JungleBuffs();
  buffs.grant('red');
  buffs.step(10,()=>{});
  near(buffs.red,JUNGLE_BUFF_RULES.duration-10);
  buffs.grant('red');
  near(buffs.red,JUNGLE_BUFF_RULES.duration);
  buffs.grant('blue');
  buffs.step(JUNGLE_BUFF_RULES.duration,()=>{});
  assert.equal(buffs.red,0);
  assert.equal(buffs.blue,0);
  near(buffs.skillCooldownSpeed,1);
  near(buffs.extraManaRegen,0);
});

test('blue grants bonus mana regeneration and speeds skill but not basic-attack cooldown',()=>{
  const actor=champion('annie');
  actor.hero.mana=0;
  actor.cooldown.attack=10;
  actor.cooldown.dash=10;
  actor.cooldown.ultimate=20;
  actor.grantJungleBuff('blue');
  actor.step(1,false);
  near(actor.cooldown.attack,9);
  near(actor.cooldown.dash,10-(1+JUNGLE_BUFF_RULES.blue.skillCooldownSpeed));
  near(actor.cooldown.ultimate,20-(1+JUNGLE_BUFF_RULES.blue.skillCooldownSpeed));
  near(actor.hero.mana,actor.maxMana*(.008+JUNGLE_BUFF_RULES.blue.bonusManaRegenPerSecond));

  const fury=champion('renekton');
  fury.cooldown.dash=10;
  fury.grantJungleBuff('blue');
  fury.step(1,false);
  near(fury.cooldown.dash,10-(1+JUNGLE_BUFF_RULES.blue.skillCooldownSpeed));
  assert.equal(fury.hero.mana,0);
});

test('red basic hits slow and burn the struck target without stacking duplicate burns',()=>{
  const actor=champion('annie');
  const target=actor.enemies[0];
  actor.grantJungleBuff('red');
  actor.buffs.onBasicHit(target);
  actor.buffs.onBasicHit(target);
  near(target.slow,JUNGLE_BUFF_RULES.red.slow);
  near(target.slowRemaining,JUNGLE_BUFF_RULES.red.slowDuration);
  const before=target.hp;
  actor.step(.5,false);
  const expected=JUNGLE_BUFF_RULES.red.burnDamagePerSecond*.5*100/(100+target.magicResist);
  near(before-target.hp,expected);
  target.generation++;
  const after=target.hp;
  actor.step(.5,false);
  near(target.hp,after);
});

test('ranged basic attack applies red slow on actual projectile hit',()=>{
  const actor=champion('ashe');
  actor.hero.mana=0;
  const target=actor.enemies[0];
  target.x=actor.hero.x+110;target.y=actor.hero.y;
  actor.grantJungleBuff('red');
  assert.ok(actor.attack(target.id));
  for(let i=0;i<120&&target.slowRemaining===0;i++)actor.step(RULES.step,false);
  assert.ok(target.slowRemaining>0);
  assert.ok(target.hp<target.maxHp);
});

test('red burn lasts its own remaining time even when red buff expires',()=>{
  const buffs=new JungleBuffs();
  const target=champion('ashe').enemies[0];
  buffs.grant('red');
  buffs.step(JUNGLE_BUFF_RULES.duration-.2,()=>{});
  buffs.onBasicHit(target);
  let applied=0;
  buffs.step(1,(enemy,raw)=>{assert.equal(enemy,target);applied+=raw;});
  assert.equal(buffs.red,0);
  near(applied,JUNGLE_BUFF_RULES.red.burnDamagePerSecond);
  buffs.step(1,(_enemy,raw)=>{applied+=raw;});
  near(applied,JUNGLE_BUFF_RULES.red.burnDamagePerSecond*JUNGLE_BUFF_RULES.red.burnDuration);
});

test('champion death clears buffs, and no buff persists through respawn',()=>{
  const actor=champion('annie');
  actor.grantJungleBuff('red');
  actor.grantJungleBuff('blue');
  actor.receiveDamage(1e9);
  assert.equal(actor.buffs.red,0);
  assert.equal(actor.buffs.blue,0);
  assert.equal(actor.alive,false);
  for(let i=0;i<500;i++)actor.step(RULES.step,false);
  assert.equal(actor.buffs.red,0);
  assert.equal(actor.buffs.blue,0);
});

test('leash reset invalidates stale red-buff burn and stale projectile generation',()=>{
  const match=new BattlefieldMatch();
  match.jungle.step(JUNGLE.firstSpawn);
  const camp=match.jungle.camp('blue-red');
  const actor=match.members[0];
  actor.grantJungleBuff('red');
  actor.buffs.onBasicHit(camp);
  const generation=camp.generation;
  camp.restoreAtHome();
  assert.ok(camp.generation>generation);
  const hp=camp.hp;
  actor.buffs.step(1,(target,raw)=>actor.hurt(target,raw,'red',false,'magic'));
  near(camp.hp,hp);
});

test('uncredited jungle death does not grant buffs, and death before delayed burn kill blocks buff',()=>{
  const match=new BattlefieldMatch();
  match.jungle.step(JUNGLE.firstSpawn);
  const camp=match.jungle.camp('red-blue');
  assert.equal(camp.defeat(JUNGLE.firstSpawn),true);
  assert.equal(match.members.every(actor=>actor.buffs.blue===0),true);

  const camp2=match.jungle.camp('blue-red');
  const killer=match.members[0];
  killer.hurt(camp2,camp2.hp-1,'first',false,'physical','basic');
  killer.receiveDamage(1e9);
  camp2.aggro=killer.profile.id;
  camp2.receiveDamage(1e9,'physical');
  assert.equal(killer.buffs.red,0);
});
