import type { Champion } from './champions.ts';
import { SKILLS } from './skillConfig.ts';
import { RULES } from './config.ts';
export type SkillKey='Q'|'W'|'E'|'R';
export const SKILL_ORDER:Record<Champion['kit'],readonly SkillKey[]>={fury:['Q','E','W','R'],flame:['Q','W','E','R'],frost:['W','Q','E','R'],curse:['E','Q','W','R']};
export function skillRanks(kit:Champion['kit'],level:number,enabled:boolean):Record<SkillKey,number>{
  const ranks={Q:0,W:0,E:0,R:0};
  if(!enabled)return {Q:1,W:1,E:1,R:1};
  for(let i=0;i<Math.min(12,level);i++)ranks[SKILL_ORDER[kit][i%4]]++;
  return ranks;
}
const at=(rank:number,values:readonly number[])=>values[Math.max(0,Math.min(2,rank-1))];
export function rankedSkills(r:Record<SkillKey,number>,ap:number){
  const s=SKILLS;
  return {
    flame:{...s.flame,q:{...s.flame.q,damage:at(r.Q,[75,115,155])+ap*.6},w:{...s.flame.w,damage:at(r.W,[90,140,190])+ap*.7},shield:{...s.flame.shield,amount:at(r.E,[70,110,150])+ap*.4},ultimate:{...s.flame.ultimate,damage:at(r.R,[140,220,300])+ap*.8},pet:{...s.flame.pet,hp:at(r.R,[350,550,750]),damage:at(r.R,[25,40,55])+ap*.15}},
    frost:{...s.frost,q:{...s.frost.q,haste:at(r.Q,[.3,.45,.6])},w:{...s.frost.w,damage:at(r.W,[60,95,130])},scout:{...s.frost.scout,cooldown:at(r.E,[30,25,20])},ultimate:{...s.frost.ultimate,damage:at(r.R,[120,180,240]),stun:at(r.R,[1.5,1.75,2])}},
    curse:{...s.curse,hook:{...s.curse.hook,damage:at(r.Q,[60,100,140])+ap*.5,cooldown:at(r.Q,[12,11,10])},aura:{...s.curse.aura,damage:at(r.W,[12,18,24]),hpRatio:at(r.W,[.005,.0075,.01])},burst:{...s.curse.burst,damage:at(r.E,[60,95,130])+ap*.4},ultimate:{...s.curse.ultimate,damage:at(r.R,[100,160,220])+ap*.6,root:at(r.R,[1.5,1.75,2])}},
  };
}
export function rankedFury(r:Record<SkillKey,number>,ad:number){return {
  q:{...RULES.q,damage:at(r.Q,[70,110,150])+ad*.7,heal:at(r.Q,[35,50,65]),minionHeal:at(r.Q,[8,12,16]),healCap:at(r.Q,[100,140,180])},
  w:{...RULES.w,bonus:at(r.W,[25,45,65])+ad*.4,stun:at(r.W,[.6,.8,1])},
  dash:{...RULES.dash,damage:at(r.E,[60,90,120])+ad*.5,cooldown:at(r.E,[12,11,10])},
  ultimate:{...RULES.ultimate,health:at(r.R,[250,400,550]),damage:at(r.R,[20,30,40]),cooldown:at(r.R,[65,60,55])},
};}
