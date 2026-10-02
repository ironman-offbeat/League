import Phaser from 'phaser';
import './style.css';
import { CHAMPIONS } from './game/champions.ts';
import { ArenaScene } from './game/ArenaScene.ts';

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const scene=new ArenaScene();
CHAMPIONS.forEach((p,i)=>{
  const b=document.createElement('button');b.id=`champion-${p.id}`;b.setAttribute('aria-label',`${p.name} 선택`);
  b.innerHTML=`<b>${p.symbol}</b><span>${p.name}<small></small></span>`;
  b.onclick=()=>{dashStart=null;scene.selectChampion(i);};el('roster').append(b);
});
let manualPause=false,helpOpen=false,backgroundPause=false;
let lastToast='';
const game=new Phaser.Game({type:Phaser.AUTO,parent:'game',backgroundColor:'#263d32',scene:[scene],scale:{mode:Phaser.Scale.RESIZE,width:'100%',height:'100%'},render:{antialias:true,roundPixels:false},input:{activePointers:2},audio:{noAudio:true}});
const portraitQuery=window.matchMedia('(orientation: portrait) and (max-width: 900px)');
function syncPause(){scene.setPaused(manualPause||helpOpen||backgroundPause||portraitQuery.matches);el('pause-overlay').hidden=!(manualPause||backgroundPause)||helpOpen;el('pause').textContent=manualPause?'계속하기':'일시정지';}
scene.notify=text=>{if(lastToast!==text){el('toast').textContent=text;lastToast=text;}};
scene.onFrame=s=>{
  const c=s.combat;
  const fury=c.profile.kit==='fury';
  el('champion-name').textContent=c.profile.name;
  el('portrait').querySelector('span')!.textContent=c.profile.symbol;
  el('portrait').setAttribute('aria-label',`${c.profile.name}에게 카메라 이동`);
  el('kit-note').textContent=fury?'Q · W 자동 발동':'기본 공격 · 스킬 준비 중';
  s.squad.members.forEach((m,i)=>{
    const b=el(`champion-${m.profile.id}`);b.setAttribute('aria-pressed',String(i===s.squad.selectedIndex));
    const names={idle:'대기',move:'이동',attack:'공격',return:'복귀',recall:'귀환'};
    b.querySelector('small')!.textContent=`HP ${Math.ceil(m.hero.hp)} · ${names[m.command.kind]}`;
  });
  el('hp-bar').style.width=`${c.hero.hp/c.hero.maxHp*100}%`;
  el('hp-text').textContent=`${Math.ceil(c.hero.hp)} / ${c.hero.maxHp}`;
  el('fury-bar').style.width=`${fury?c.hero.fury:c.hero.mana/c.profile.mana*100}%`;
  el('fury-text').textContent=fury?`분노 ${Math.floor(c.hero.fury)} / 100`:`마나 ${Math.floor(c.hero.mana)} / ${c.profile.mana}`;
  el('damage').textContent=Math.round(c.damage).toLocaleString('ko-KR');
  el('dash-cd').textContent=!fury?'준비 중':c.cooldown.dash>0?Math.ceil(c.cooldown.dash).toString():'';
  el('ult-cd').textContent=!fury?'준비 중':c.cooldown.ultimate>0?Math.ceil(c.cooldown.ultimate).toString():'';
  el('dash').classList.toggle('armed',s.armed);
  el<HTMLButtonElement>('dash').disabled=!fury||c.cooldown.dash>0;
  el<HTMLButtonElement>('ultimate').disabled=!fury||c.cooldown.ultimate>0;
  const names={idle:'대기 · 자동 전투',move:'이동 · 공격보다 이동 우선',attack:'직접 공격 · 전진 한계 무시',return:'기준 지점으로 복귀',recall:'귀환 중'};
  el('command-label').textContent=c.command.kind==='recall'?`귀환 중 · ${c.command.remaining.toFixed(1)}초`:names[c.command.kind];
  for(const key of ['move','attack','dash'] as const) el(`goal-${key}`).classList.toggle('done',c.completed[key]);
};
game.events.once('arena-ready',()=>{syncPause();document.body.dataset.ready='true';});
el('pause').onclick=()=>{manualPause=!manualPause;backgroundPause=false;syncPause();};
el('resume').onclick=()=>{manualPause=false;backgroundPause=false;syncPause();};
el('help').onclick=()=>{helpOpen=true;el('help-overlay').hidden=false;syncPause();};
el('close-help').onclick=()=>{helpOpen=false;el('help-overlay').hidden=true;syncPause();};
el('reset').onclick=()=>{scene.restartTraining();manualPause=false;backgroundPause=false;syncPause();};
el('center').onclick=el('portrait').onclick=()=>scene.centerHero();
el('ultimate').onclick=()=>{if(!scene.paused&&scene.combat.castUltimate())scene.notify('거대화 · 10초간 체력 증가와 주변 지속 피해');};
el('recall').onclick=()=>{if(!scene.paused&&scene.combat.recall())scene.notify('귀환 중 · 이동이나 스킬을 사용하면 취소됩니다.');};
let dashStart:{x:number;y:number;id:number}|null=null;
el('dash').onpointerdown=e=>{if(scene.paused||scene.combat.profile.kit!=='fury'||scene.combat.cooldown.dash>0)return;dashStart={x:e.clientX,y:e.clientY,id:e.pointerId};el('dash').setPointerCapture(e.pointerId);};
el('dash').onpointerup=e=>{if(!dashStart||dashStart.id!==e.pointerId)return;const d=Math.hypot(e.clientX-dashStart.x,e.clientY-dashStart.y);dashStart=null;if(d>12)scene.dashToScreen(e.clientX,e.clientY);else{scene.armed=!scene.armed;scene.notify(scene.armed?'돌진할 지점을 선택하세요. 다시 E를 누르면 취소합니다.':'돌진 조준을 취소했습니다.');}};
el('dash').onpointercancel=()=>{dashStart=null;scene.cancelGesture();};
document.addEventListener('visibilitychange',()=>{if(document.hidden){backgroundPause=true;syncPause();}});
window.addEventListener('blur',()=>{backgroundPause=true;syncPause();});
window.addEventListener('pointercancel',()=>scene.cancelGesture());
portraitQuery.addEventListener('change',syncPause);
document.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(e.repeat)return;if(e.code==='Space'){e.preventDefault();manualPause=!manualPause;syncPause();}if(e.code==='Escape')scene.cancelGesture();});

// Read-only diagnostics for repeatable browser verification, no mutation shortcuts.
Object.defineProperty(window,'leagueDebug',{get:()=>({selected:scene.combat.profile.id,members:scene.squad.members.map(c=>({id:c.profile.id,hero:{...c.hero},command:c.command.kind,damage:c.damage,elapsed:c.elapsed})),ready:document.body.dataset.ready==='true',paused:scene.paused,hero:{...scene.combat.hero},command:scene.combat.command.kind,damage:scene.combat.damage,dashCooldown:scene.combat.cooldown.dash,elapsed:scene.combat.elapsed,enemies:scene.combat.enemies.map(e=>({...e})),camera:{x:scene.cameras.main?.scrollX??0,y:scene.cameras.main?.scrollY??0},completed:{...scene.combat.completed}})});
