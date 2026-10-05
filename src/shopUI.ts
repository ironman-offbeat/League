import type { ArenaScene } from './game/ArenaScene.ts';
import { CHAMPIONS } from './game/champions.ts';
import { EQUIPMENT } from './game/equipment.ts';
import type { Purchase } from './game/equipment.ts';
import { ASSETS } from './render/assets.ts';
const node=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const offers:Purchase[]=['weapon','armor','health','mana','mixed'];
export function setupShop(scene:ArenaScene){
  const panel=node('shop-panel'),select=node<HTMLSelectElement>('shop-champion');
  CHAMPIONS.forEach((c,i)=>select.add(new Option(c.name,String(i))));
  select.onchange=()=>scene.selectChampion(Number(select.value));
  const close=()=>{panel.hidden=true;node('shop-toggle').focus();};
  node('shop-close').onclick=close;
  node('shop-toggle').onclick=()=>{if(!scene.match||scene.blocked)return;scene.cancelGesture();panel.hidden=!panel.hidden;if(!panel.hidden)select.focus();};
  node('potion-use').onclick=()=>{if(!scene.blocked&&scene.combat.usePotion())scene.notify('포션 사용 · 5초 동안 회복합니다.');};
  panel.addEventListener('keydown',e=>{
    if(e.key==='Escape'){close();return;}
    if(e.key!=='Tab')return;
    const focusable=Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),select'));
    const first=focusable[0],last=focusable.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  });
  for(const item of offers){
    const b=node<HTMLButtonElement>('buy-'+item);
    const icon=ASSETS.icons['item.'+item];if(icon){const img=new Image();img.src=icon;img.alt='';img.onload=()=>b.prepend(img);}
    b.onclick=()=>{if(scene.blocked)return;const m=scene.match,c=scene.combat;if(m?.purchase(c,item))node('shop-status').textContent=`${c.profile.name} 구매 완료`;else node('shop-status').textContent=m?.shopReason(c,item)??'경기 모드 전용';};
  }
  return ()=>{
    const c=scene.combat,m=scene.match,e=c.equipment;
    node('inventory').hidden=!m;
    if(!m||scene.blocked)panel.hidden=true;
    node<HTMLButtonElement>('shop-toggle').disabled=scene.blocked;
    const potion=node<HTMLButtonElement>('potion-use');
    potion.textContent=e.active?`회복 ${Math.ceil(e.active.remaining)}초`:e.potion?EQUIPMENT.potions[e.potion].name:'포션 없음';
    const p=e.potion?EQUIPMENT.potions[e.potion]:null;
    potion.disabled=scene.blocked||!c.canAct||!!e.active||!p||(!(p.hp&&c.hero.hp<c.hero.maxHp)&&!(p.mana&&c.hero.mana<c.maxMana));
    node('gear-summary').textContent=`무기 T${e.weapon} · 방어 T${e.armor}`;
    node('rank-summary').textContent=Object.entries(c.ranks).map(([k,v])=>`${k} ${v||'잠김'}`).join(' · ');
    if(panel.hidden||!m)return;
    select.value=String(scene.squad.selectedIndex);
    node('shop-gold').textContent=`팀 골드 ${Math.floor(m.economy.blue.gold+1e-8)}`;
    node('shop-stats').textContent=`공격력 ${c.stats.attack} · 주문력 ${c.abilityPower} · 방어 ${c.armor} · 마법저항 ${c.magicResist}`;
    for(const item of offers){
      const b=node<HTMLButtonElement>('buy-'+item),price=e.price(item),reason=m.shopReason(c,item);
      b.disabled=!!reason;
      let label:string;
      if(item==='weapon'){const t=Math.min(3,e.weapon+1),magic=['flame','curse'].includes(c.profile.kit);label=`무기 T${e.weapon} → T${t} · ${magic?'주문력':'공격력'} +${(magic?EQUIPMENT.magical:EQUIPMENT.physical)[t]}`;}
      else if(item==='armor'){const t=Math.min(3,e.armor+1);label=`방어구 T${e.armor} → T${t} · 체력 +${EQUIPMENT.health[t]}, 양방어 +${EQUIPMENT.defense[t]}`;}
      else {const p=EQUIPMENT.potions[item];label=`${p.name} · ${p.hp?'체력 25% ':''}${p.mana?'마나 30%':''}`;}
      b.querySelector('span')!.textContent=label;b.querySelector('small')!.textContent=reason||`${price} 골드`;
    }
  };
}
