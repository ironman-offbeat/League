import { mitigate } from './effects.ts';
import type { DamageType, Status } from './effects.ts';
import type { Point } from './config.ts';

export type Target = Point & Status & {
  onDeath?:(target:Target)=>void;
  kind?: 'champion' | 'minion' | 'building';
  protected?: boolean;
  damageScale?: number;
  magicResist:number; revealed:number; alert:number; aggro:string|null;
  attackCooldown:number; id:string; hp:number; maxHp:number; armor:number;
  alive:boolean; visible:boolean; respawn:number; generation:number;
};
export type HitKind = 'basic' | 'skill';
export const skillTarget = (target:Target) => target.kind !== 'building';

// All attackers share building protection and death rules, including minions.
export function damageTarget(target:Target,raw:number,type:DamageType,kind:HitKind) {
  if(!target.alive || target.protected || (target.kind==='building' && kind!=='basic'))return 0;
  const amount=Math.min(target.hp,mitigate(raw*(target.damageScale??1),type==='physical'?target.armor:target.magicResist));
  target.hp-=amount;
  if(target.hp<=0){target.hp=0;target.alive=false;target.respawn=target.kind==='minion'||target.kind==='building'?Infinity:3;target.onDeath?.(target);}
  return amount;
}
