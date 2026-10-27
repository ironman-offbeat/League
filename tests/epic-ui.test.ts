import test from 'node:test';
import assert from 'node:assert/strict';
import { BattlefieldMatch } from '../src/game/BattlefieldMatch.ts';
import { EPIC_OBJECTIVES } from '../src/game/EpicObjectives.ts';
import { epicHudStatus } from '../src/game/EpicHud.ts';
import { BATTLEFIELD_NAVIGATION } from '../src/game/navigation.ts';

test('objective HUD displays public first-spawn countdown',()=>{
  const match=new BattlefieldMatch();
  assert.equal(epicHudStatus(match,'blue','dragon'),'등장 2:00');
  assert.equal(epicHudStatus(match,'blue','baron'),'등장 8:00');
  match.elapsed=119.1;
  assert.equal(epicHudStatus(match,'blue','dragon'),'등장 0:01');
});

test('hidden boss HP and defeat cannot leak into HUD',()=>{
  const m=new BattlefieldMatch();
  for(const tower of m.structures('blue'))if(tower.role==='outer'||tower.role==='inner')tower.alive=false;
  m.elapsed=EPIC_OBJECTIVES.dragon.firstSpawn;
  m.objectives.step(m.elapsed);
  const boss=m.objectives.objective('dragon');
  for(const actor of m.members)Object.assign(actor.hero,{x:140,y:840});
  m.refreshVision();
  assert.equal(m.canSee('blue',boss),false);
  const before=epicHudStatus(m,'blue','dragon');
  assert.match(before,/상태 미확인/);
  boss.hp=80;
  assert.equal(epicHudStatus(m,'blue','dragon'),before);
  boss.defeat(m.elapsed);
  assert.equal(epicHudStatus(m,'blue','dragon'),before);
  const pos=BATTLEFIELD_NAVIGATION.node('river-south').point;
  Object.assign(m.members[0].hero,pos);m.refreshVision();
  assert.equal(epicHudStatus(m,'blue','dragon'),'둥지 비어 있음');
});

test('visible Dragon shows only observed HP percentage',()=>{
  const m=new BattlefieldMatch();
  for(const tower of m.structures('blue'))if(tower.role==='outer'||tower.role==='inner')tower.alive=false;
  m.elapsed=EPIC_OBJECTIVES.dragon.firstSpawn;
  m.objectives.step(m.elapsed);
  const boss=m.objectives.objective('dragon');
  boss.hp=boss.maxHp*.37;
  Object.assign(m.members[0].hero,{x:boss.x+50,y:boss.y});m.refreshVision();
  assert.equal(epicHudStatus(m,'blue','dragon'),'체력 37%');
});
