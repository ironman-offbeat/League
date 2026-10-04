import { clampPoint, distance } from './config.ts';
import type { Point } from './config.ts';
export type DamageType = 'physical' | 'magic';
export type Status = { stunned:number; rooted:number; airborne:number; slow:number; slowRemaining:number; marked:number };
export const freshStatus=():Status=>({stunned:0,rooted:0,airborne:0,slow:0,slowRemaining:0,marked:0});
export function tickStatus(s:Status,dt:number) {
  for(const k of ['stunned','rooted','airborne','slowRemaining','marked'] as const)s[k]=Math.max(0,s[k]-dt);
  if(!s.slowRemaining)s.slow=0;
}
export function applyCC(s:Status,kind:'stunned'|'rooted'|'airborne',seconds:number){s[kind]=Math.max(s[kind],seconds);}
export function applySlow(s:Status,strength:number,seconds:number){
  if(strength>=s.slow || !s.slowRemaining){s.slow=strength;s.slowRemaining=Math.max(s.slowRemaining,seconds);}
}
export function mitigate(raw:number,resist:number){return Math.max(0,raw)*100/(100+Math.max(0,resist));}
export function inCone(origin:Point,point:Point,target:Point,range:number,halfAngle:number){
  const d=distance(origin,target);if(d>range)return false;if(d<.001)return true;
  const aim=distance(origin,point);if(aim<.001)return false;
  return ((point.x-origin.x)*(target.x-origin.x)+(point.y-origin.y)*(target.y-origin.y))/(aim*d)>=Math.cos(halfAngle);
}
export function alongSegment(a:Point,b:Point,p:Point){
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
  return {t,distance:distance(p,{x:a.x+dx*t,y:a.y+dy*t})};
}
export function towards(from:Point,to:Point,range:number){const d=distance(from,to);return d<.001?{...from}:clampPoint({x:from.x+(to.x-from.x)*Math.min(1,range/d),y:from.y+(to.y-from.y)*Math.min(1,range/d)});}
