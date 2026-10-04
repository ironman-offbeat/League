import Phaser from 'phaser';
import './style.css';
import type { SkillSlot } from './game/skillConfig.ts';
import { CHAMPIONS } from './game/champions.ts';
import { ArenaScene } from './game/ArenaScene.ts';

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const scene=new ArenaScene();
CHAMPIONS.forEach((p,i)=>{
  const b=document.createElement('button');b.id=`champion-${p.id}`;b.setAttribute('aria-label',`${p.name} 선택`);
  b.innerHTML=`<b>${p.symbol}</b><span>${p.name}<small></small></span>`;
  b.onclick=()=>{skillDrag=null;scene.selectChampion(i);};el('roster').append(b);
});
let manualPause=false,helpOpen=false,backgroundPause=false;
let lastToast='';
const game=new Phaser.Game({type:Phaser.AUTO,parent:'game',backgroundColor:'#263d32',scene:[scene],scale:{mode:Phaser.Scale.RESIZE,width:'100%',height:'100%'},render:{antialias:true,roundPixels:false},input:{activePointers:2},audio:{noAudio:true}});
const portraitQuery=window.matchMedia('(orientation: portrait) and (max-width: 900px)');
function syncPause(){skillDrag=null;scene.setPaused(manualPause||helpOpen||backgroundPause||portraitQuery.matches);el('pause-overlay').hidden=!(manualPause||backgroundPause)||helpOpen;el('pause').textContent=manualPause?'계속하기':'일시정지';}
scene.notify=text=>{if(lastToast!==text){el('toast').textContent=text;lastToast=text;}};
scene.onFrame=s=>{
  const c=s.combat;
  const fury=c.profile.kit==='fury';
  el('champion-name').textContent=c.profile.name;
  el('champion-status').textContent=c.profile.kit==='flame'?`불꽃 ${c.abilities.stacks}/3`:c.abilities.haste>0?'공속 강화':c.abilities.aura?'눈물 활성':'Lv. 1';
  el('portrait').querySelector('span')!.textContent=c.profile.symbol;
  el('portrait').setAttribute('aria-label',`${c.profile.name}에게 카메라 이동`);
  el('kit-note').textContent={fury:'Q · W 자동',flame:`불꽃 ${c.abilities.stacks}/3 · Q/E 자동`,frost:'Q · W 자동',curse:'W · E 자동'}[c.profile.kit];
  el('retaliation').textContent=s.squad.retaliation?'반격 켜짐':'반격 꺼짐';
  el('retaliation').setAttribute('aria-pressed',String(s.squad.retaliation));
  s.squad.members.forEach((m,i)=>{
    const b=el(`champion-${m.profile.id}`);b.setAttribute('aria-pressed',String(i===s.squad.selectedIndex));
    const names={idle:'대기',move:'이동',attack:'공격',return:'복귀',recall:'귀환'};
    b.querySelector('small')!.textContent=m.alive?`HP ${Math.ceil(m.hero.hp)} · ${names[m.command.kind]}`:`부활 ${Math.ceil(m.respawnRemaining)}초`;
  });
  el('hp-bar').style.width=`${c.hero.hp/c.hero.maxHp*100}%`;
  el('hp-text').textContent=`${Math.ceil(c.hero.hp)} / ${c.hero.maxHp}`;
  el('fury-bar').style.background=fury?'#bc8b3c':'#5a9fce';
  el('fury-bar').style.width=`${fury?c.hero.fury:c.hero.mana/c.profile.mana*100}%`;
  el('fury-text').textContent=fury?`분노 ${Math.floor(c.hero.fury)} / 100`:`마나 ${Math.floor(c.hero.mana)} / ${c.profile.mana}`;
  el('damage').textContent=Math.round(c.damage).toLocaleString('ko-KR');
  for(const [id,slot,cdId] of [['dash','manual','dash-cd'],['ultimate','ultimate','ult-cd']] as const){
    const p=c.abilities.presentation(slot),button=el<HTMLButtonElement>(id),cd=c.cooldown[slot==='manual'?'dash':'ultimate'];
    button.querySelector('b')!.textContent=p.key;button.querySelector('span')!.textContent=p.name;button.querySelector('small')!.textContent=p.hint;
    el(cdId).textContent=!c.alive?'부활 중':cd>0?Math.ceil(cd).toString():c.hero.mana<p.cost?'마나 부족':'';
    button.disabled=!c.abilities.canCast(slot);button.classList.toggle('armed',s.aimSlot===slot);
    button.setAttribute('aria-label',`${p.name} ${p.key}`);
  }
  el<HTMLButtonElement>('recall').disabled=!c.canAct;
  const names={idle:'대기 · 자동 전투',move:'이동 · 공격보다 이동 우선',attack:'직접 공격 · 전진 한계 무시',return:'기준 지점으로 복귀',recall:'귀환 중'};
  el('command-label').textContent=!c.alive?`부활까지 ${c.respawnRemaining.toFixed(1)}초`:c.hero.shield>0?`보호막 ${Math.ceil(c.hero.shield)} · ${names[c.command.kind]}`:c.command.kind==='recall'?`귀환 중 · ${c.command.remaining.toFixed(1)}초`:names[c.command.kind];
  for(const key of ['move','attack','dash'] as const) el(`goal-${key}`).classList.toggle('done',c.completed[key]);
};
game.events.once('arena-ready',()=>{syncPause();document.body.dataset.ready='true';});
el('pause').onclick=()=>{manualPause=!manualPause;backgroundPause=false;syncPause();};
el('resume').onclick=()=>{manualPause=false;backgroundPause=false;syncPause();};
el('help').onclick=()=>{helpOpen=true;el('help-overlay').hidden=false;syncPause();};
el('close-help').onclick=()=>{helpOpen=false;el('help-overlay').hidden=true;syncPause();};
el('reset').onclick=()=>{scene.restartTraining();manualPause=false;backgroundPause=false;syncPause();};
el('center').onclick=el('portrait').onclick=()=>scene.centerHero();
el('retaliation').onclick=()=>{if(!scene.paused)scene.squad.setRetaliation(!scene.squad.retaliation);};
el('recall').onclick=()=>{if(!scene.paused&&scene.combat.recall())scene.notify('귀환 중 · 이동이나 스킬을 사용하면 취소됩니다.');};
let skillDrag:{x:number;y:number;id:number;actor:string;slot:SkillSlot}|null=null;
for(const [id,slot] of [['dash','manual'],['ultimate','ultimate']] as const){
  const button=el(id);
  button.onpointerdown=e=>{
    if(scene.paused||!scene.combat.abilities.canCast(slot)||skillDrag)return;
    skillDrag={x:e.clientX,y:e.clientY,id:e.pointerId,actor:scene.combat.profile.id,slot};button.setPointerCapture(e.pointerId);
  };
  button.onpointerup=e=>{
    const start=skillDrag;if(!start||start.id!==e.pointerId)return;skillDrag=null;
    if(scene.paused||start.actor!==scene.combat.profile.id||!scene.combat.abilities.canCast(slot))return;
    const p=scene.combat.abilities.presentation(slot);
    if(p.aim==='self'){scene.cancelGesture();if(scene.combat.castSkill(slot))scene.notify(`${p.name} 사용`);}
    else if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>12)scene.dashToScreen(e.clientX,e.clientY,slot);
    else {scene.armSkill(slot);scene.notify(scene.armed?`${p.name} 사용할 지점을 선택하세요.`:'스킬 조준을 취소했습니다.');}
  };
  button.onpointercancel=()=>{skillDrag=null;scene.cancelGesture();};
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){backgroundPause=true;syncPause();}});
window.addEventListener('blur',()=>{backgroundPause=true;syncPause();});
window.addEventListener('pointercancel',()=>{skillDrag=null;scene.cancelGesture();});
portraitQuery.addEventListener('change',syncPause);
document.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(e.repeat)return;if(e.code==='Space'){e.preventDefault();manualPause=!manualPause;syncPause();}if(e.code==='Escape'){skillDrag=null;scene.cancelGesture();}});

// Read-only diagnostics for repeatable browser verification, no mutation shortcuts.
Object.defineProperty(window,'leagueDebug',{get:()=>({selected:scene.combat.profile.id,retaliation:scene.squad.retaliation,skillCooldowns:{...scene.combat.cooldown},respawn:scene.combat.respawnRemaining,stacks:scene.combat.abilities.stacks,pet:scene.combat.abilities.pet?{...scene.combat.abilities.pet}:null,members:scene.squad.members.map(c=>({id:c.profile.id,hero:{...c.hero},command:c.command.kind,damage:c.damage,elapsed:c.elapsed})),ready:document.body.dataset.ready==='true',paused:scene.paused,hero:{...scene.combat.hero},command:scene.combat.command.kind,damage:scene.combat.damage,dashCooldown:scene.combat.cooldown.dash,elapsed:scene.combat.elapsed,enemies:scene.combat.enemies.map(e=>({...e})),camera:{x:scene.cameras.main?.scrollX??0,y:scene.cameras.main?.scrollY??0},completed:{...scene.combat.completed}})});
