import type { Combat } from './combat.ts';
import type { Target } from './targets.ts';

/** A live view, never a second copy of champion health or timers. */
export function championTarget(c:Combat):Target {
  return {
    id:c.profile.id,kind:'champion',visible:true,revealed:0,alert:0,aggro:null,attackCooldown:0,
    receiveDamage:(raw,type,show)=>c.receiveDamage(raw,type,show),
    get x(){return c.hero.x;},set x(n){c.hero.x=n;},
    get y(){return c.hero.y;},set y(n){c.hero.y=n;},
    get hp(){return c.hero.hp;},set hp(n){c.hero.hp=n;},
    get maxHp(){return c.hero.maxHp;},set maxHp(n){c.hero.maxHp=n;},
    get armor(){return c.armor;},get magicResist(){return c.magicResist;},
    get alive(){return c.alive;},get respawn(){return c.respawnRemaining;},get generation(){return c.life;},
    get stunned(){return c.hero.stunned;},set stunned(n){c.receiveCC('stunned',n);},
    get rooted(){return c.hero.rooted;},set rooted(n){c.receiveCC('rooted',n);},
    get airborne(){return c.hero.airborne;},set airborne(n){c.receiveCC('airborne',n);},
    get slow(){return c.hero.slow;},set slow(n){if(c.alive)c.hero.slow=n;},
    get slowRemaining(){return c.hero.slowRemaining;},set slowRemaining(n){if(c.alive)c.hero.slowRemaining=n;},
    get marked(){return c.hero.marked;},set marked(n){if(c.alive)c.hero.marked=n;},
  };
}
