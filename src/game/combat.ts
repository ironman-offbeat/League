import { Equipment, EQUIPMENT } from './equipment.ts';
import { skillRanks, rankedFury } from './skillRanks.ts';
import { damageTarget, skillTarget } from './targets.ts';
import type { Target, HitKind } from './targets.ts';
import { Abilities } from './Abilities.ts';
import { freshStatus, tickStatus, mitigate, applyCC } from './effects.ts';
import type { Status, DamageType } from './effects.ts';
import { SKILLS } from './skillConfig.ts';
import type { SkillSlot } from './skillConfig.ts';
export { mitigate } from './effects.ts';
import { CHAMPIONS } from './champions.ts';
import type { Champion } from './champions.ts';
import { RULES, distance, clampPoint } from './config.ts';
import type { Point } from './config.ts';
import { Progression, PROGRESSION } from './progression.ts';
import { JungleBuffs } from './JungleBuffs.ts';
import type { JungleBuff } from './Jungle.ts';

export type Command = { kind: 'idle' } | { kind: 'move'; point: Point } | { kind: 'attack'; targetId: string; generation:number; point:Point } | { kind:'attackMove';point:Point } | { kind: 'recall'; remaining: number };
export type Dummy = Target;
export type GameEvent = { kind: 'damage' | 'heal' | 'slash' | 'dash' | 'ultimate' | 'recall' | 'cast' | 'levelUp'; point: Point; amount?: number; source?: string; entityId?:string; visual?:string };
export type PendingAttack = { targetId: string; remaining: number; empowered: boolean; useW: boolean };

export class Combat {
  onDeath?:()=>void;
  visibilityResolver?:(target:Dummy)=>boolean;
  lastSeenResolver?:(target:Dummy)=>Point|null;
  memoryResolver?:(targetId:string,generation:number)=>Point|null;
  onOffensiveAction?:()=>void;
  onSummonOffensiveAction?:()=>void;
  // Entity IDs distinguish teams; art keys continue to identify the original champion.
  visualId:string;
  profile: Champion;
  progression=new Progression();
  equipment=new Equipment();
  readonly buffs=new JungleBuffs();
  get ranks(){return skillRanks(this.profile.kit,this.progression.level,this.progression.enabled);}
  get furySkills(){return rankedFury(this.ranks,this.stats.attack);}
  get abilityPower(){return ['flame','curse'].includes(this.profile.kit)?EQUIPMENT.magical[this.equipment.weapon]:0;}
  get weaponAttack(){return ['fury','frost'].includes(this.profile.kit)?EQUIPMENT.physical[this.equipment.weapon]:0;}
  initializeEquipment(){this.equipment.initialize();this.hero.maxHp+=EQUIPMENT.health[1];this.hero.hp+=EQUIPMENT.health[1];}
  grantJungleBuff(kind:JungleBuff){if(this.alive)this.buffs.grant(kind);}
  usePotion(){
    const e=this.equipment;if(!this.canAct||!e.potion||e.active)return false;
    const p=EQUIPMENT.potions[e.potion];
    if(!(p.hp&&this.hero.hp<this.hero.maxHp)&&!(p.mana&&this.hero.mana<this.maxMana))return false;
    e.active={remaining:EQUIPMENT.duration,hpPerSecond:this.hero.maxHp*p.hp/EQUIPMENT.duration,manaPerSecond:this.maxMana*p.mana/EQUIPMENT.duration,healed:0};e.potion=null;return true;
  }
  get stats(){const n=this.progression.level-1;return {...this.profile.stats,hp:this.profile.stats.hp+this.profile.growth.hp*n+EQUIPMENT.health[this.equipment.armor],attack:this.profile.stats.attack+this.profile.growth.attack*n+this.weaponAttack,attackInterval:this.profile.stats.attackInterval/(1+n*PROGRESSION.attackSpeedPerLevel)};}
  get maxMana(){return this.profile.mana+this.profile.growth.mana*(this.progression.level-1);}
  get armor(){return this.profile.armor+this.profile.growth.armor*(this.progression.level-1)+EQUIPMENT.defense[this.equipment.armor];}
  get magicResist(){return this.profile.magicResist+this.profile.growth.magicResist*(this.progression.level-1)+EQUIPMENT.defense[this.equipment.armor];}
  gainExperience(amount:number){
    const gained=this.progression.gain(amount);if(!gained)return;
    const health=this.profile.growth.hp*gained,mana=this.profile.growth.mana*gained;
    this.hero.maxHp+=health;
    if(this.alive){this.hero.hp+=health;this.hero.mana=Math.min(this.maxMana,this.hero.mana+mana);}
    this.events.push({kind:'levelUp',point:{x:this.hero.x,y:this.hero.y},amount:this.progression.level,entityId:this.profile.id,visual:'level.up'});
  }
  autoTargetAllowed:(target:Dummy)=>boolean=()=>true;
  abilities = new Abilities(this);
  respawnRemaining=0;
  life=0;
  get alive(){return this.hero.hp>0;}
  get canAct(){return this.alive&&this.hero.stunned<=0&&this.hero.airborne<=0;}
  canSee(e:Dummy){return this.visibilityResolver?this.visibilityResolver(e):e.visible||e.revealed>0;}
  lastSeenFor(e:Dummy){return this.lastSeenResolver?.(e)??(this.canSee(e)?{x:e.x,y:e.y}:null);}
  memoryFor(targetId:string,generation:number){return this.memoryResolver?.(targetId,generation)??null;}
  offensiveAction(){this.onOffensiveAction?.();}
  summonOffensiveAction(){this.onSummonOffensiveAction?.();}
  castSkill(slot:SkillSlot,point?:Point){
    const cast=this.abilities.cast(slot,point);
    if(cast)this.events.push({kind:'cast',point:{x:this.hero.x,y:this.hero.y},entityId:this.profile.id,visual:`skill.${this.profile.kit}.${slot}`});
    return cast;
  }
  receiveCC(kind:'stunned'|'rooted'|'airborne',seconds:number){
    if(!this.alive||seconds<=0)return;
    applyCC(this.hero,kind,seconds);this.cancelRecall();
    if(kind!=='rooted')this.pending=null;
    if(this.dash||this.abilities.pull){this.dash=null;this.abilities.pull=null;this.anchor={x:this.hero.x,y:this.hero.y};this.command={kind:'idle'};}
  }
  receiveDamage(raw:number,type:DamageType='physical',show=true){
    if(!this.alive)return 0;
    this.cancelRecall();this.lastCombat=this.elapsed;
    const damage=mitigate(raw,type==='physical'?this.armor:this.magicResist);
    const absorbed=Math.min(this.hero.shield,damage);this.hero.shield-=absorbed;
    const lost=Math.min(this.hero.hp,damage-absorbed);this.hero.hp-=lost;
    if(lost>0&&show)this.events.push({kind:'damage',point:{x:this.hero.x,y:this.hero.y-45},amount:lost,source:'피격',entityId:this.profile.id,visual:`hit.${type}`});
    if(!this.alive){
      this.respawnRemaining=this.progression.enabled?PROGRESSION.respawnBase+this.progression.level*PROGRESSION.respawnPerLevel+(this.elapsed>=PROGRESSION.lateRespawnAt?PROGRESSION.lateRespawnBonus:0):SKILLS.respawn;this.command={kind:'idle'};this.pending=null;this.dash=null;
      if(this.ultimateRemaining>0)this.hero.maxHp-=this.ultimateHealth;
      this.ultimateHealth=0;this.equipment.active=null;
      this.ultimateRemaining=0;this.hero.shield=0;this.hero.shieldRemaining=0;this.hero.fury=0;
      this.abilities.reset();this.buffs.clear();Object.assign(this.hero,freshStatus());
      this.onDeath?.();
    }else this.abilities.onDamage();
    return lost;
  }
  projectiles: { x: number; y: number; target: Dummy; generation: number; damage: number }[] = [];
  constructor(profile: Champion = CHAMPIONS[0], enemies?: Dummy[]) {
    this.profile = profile;
    this.visualId = profile.id;
    this.hero = { ...profile.spawn, hp: profile.stats.hp, maxHp: profile.stats.hp, fury: 0, mana: profile.mana, facing: 0, shield:0, shieldRemaining:0, ...freshStatus() };
    this.anchor = { ...profile.spawn };
    if (enemies) this.enemies = enemies;
  }
  hero: Point & Status & { shield:number; shieldRemaining:number; hp: number; maxHp: number; fury: number; mana: number; facing: number } = { ...RULES.spawn, hp: RULES.hero.hp, maxHp: RULES.hero.hp, fury: 0, mana: 0, facing: 0, shield:0, shieldRemaining:0, ...freshStatus() };
  anchor: Point = { ...RULES.spawn };
  command: Command = { kind: 'idle' };
  enemies: Dummy[] = [
    { id: 'a', x: 720, y: 470 }, { id: 'b', x: 850, y: 640 }, { id: 'c', x: 1050, y: 430 },
  ].map(p => ({ ...p, hp: RULES.dummy.hp, maxHp: RULES.dummy.hp, armor: RULES.dummy.armor, alive: true, visible: true, respawn: 0, generation: 0, magicResist:30, revealed:0, alert:0, aggro:null, attackCooldown:0, ...freshStatus() }));
  cooldown = { attack: 0, q: 0, w: 0, e:0, dash: 0, ultimate: 0 };
  pending: PendingAttack | null = null;
  dash: { destination: Point; hit: Set<string> } | null = null;
  ultimateRemaining = 0;
  ultimateHealth=0;
  ultimateDamage=0;
  events: GameEvent[] = [];
  damage = 0;
  elapsed = 0;
  lastCombat = -100;
  lastSeen: Point | null = null;
  completed = { move: false, attack: false, dash: false };

  move(point: Point) {
    if(this.hero.rooted>0)return false;
    if (!this.canAct || this.dash || this.abilities.pull) return false;
    this.anchor = clampPoint(point);
    this.command = { kind: 'move', point: { ...this.anchor } };
    this.pending = null;
    this.completed.move = true;
    return true;
  }
  attack(targetId: string, point?:Point) {
    if (!this.canAct || this.dash || this.abilities.pull) return false;
    const target = this.enemies.find(e => e.id === targetId && e.alive && !e.protected && this.canSee(e));
    if (!target) return false;
    // Capture the ordered location, not the target's future/death position.
    this.anchor = clampPoint(point??target);
    this.command = { kind: 'attack', targetId, generation:target.generation, point:{...this.anchor} };
    this.lastSeen = this.lastSeenFor(target)??{ x: target.x, y: target.y };
    this.pending = null;
    return true;
  }
  attackMove(point:Point){
    if(!this.canAct||this.dash||this.abilities.pull||this.hero.rooted>0)return false;
    this.anchor=clampPoint(point);this.command={kind:'attackMove',point:{...this.anchor}};
    this.pending=null;return true;
  }
  castDash(point: Point) {
    if (!this.canAct || this.hero.rooted>0 || this.profile.kit !== 'fury' || !this.ranks.E || this.cooldown.dash > 0 || this.dash) return false;
    const d = distance(this.hero, point);
    if (d < 5) return false;
    const length = Math.min(d, RULES.dash.range);
    const destination = clampPoint({ x: this.hero.x + (point.x - this.hero.x) / d * length, y: this.hero.y + (point.y - this.hero.y) / d * length });
    this.hero.facing = Math.atan2(destination.y - this.hero.y, destination.x - this.hero.x);
    this.dash = { destination, hit: new Set() };
    this.anchor = { ...destination };
    this.command = { kind: 'idle' };
    this.pending = null;
    this.cooldown.dash = this.furySkills.dash.cooldown;
    this.completed.dash = true;
    this.events.push({ kind: 'dash', point: { ...this.hero } });
    return true;
  }
  castUltimate() {
    if (!this.canAct || this.profile.kit !== 'fury' || this.cooldown.ultimate > 0 || !this.progression.ultimateUnlocked) return false;
    this.cancelRecall();
    this.ultimateHealth=this.furySkills.ultimate.health;this.ultimateDamage=this.furySkills.ultimate.damage;
    this.hero.maxHp += this.ultimateHealth;
    this.hero.hp += this.ultimateHealth;
    this.ultimateRemaining = RULES.ultimate.duration;
    this.cooldown.ultimate = this.furySkills.ultimate.cooldown;
    this.events.push({ kind: 'ultimate', point: { ...this.hero } });
    return true;
  }
  recall() {
    if (!this.canAct || this.dash || this.abilities.pull) return false;
    this.pending = null;
    this.command = { kind: 'recall', remaining: RULES.recall.duration };
    return true;
  }
  cancelRecall() { if (this.command.kind === 'recall') this.command = { kind: 'idle' }; }
  step(dt: number, updateEnemies = true) {
    this.elapsed += dt;
    const skillSpeed=this.buffs.skillCooldownSpeed;
    for (const key of Object.keys(this.cooldown) as (keyof typeof this.cooldown)[])
      this.cooldown[key] = Math.max(0,this.cooldown[key]-dt*(key==='attack'?1:skillSpeed));
    if (updateEnemies) Combat.stepEnemies(this.enemies, dt);
    this.buffs.step(dt,(target,amount)=>this.hurt(target,amount,'레드 버프',false,'magic','skill',false));
    this.stepProjectiles(dt);
    tickStatus(this.hero,dt);
    this.hero.shieldRemaining=Math.max(0,this.hero.shieldRemaining-dt);
    if(!this.hero.shieldRemaining)this.hero.shield=0;
    this.abilities.step(dt);
    if(!this.alive){
      this.respawnRemaining=Math.max(0,this.respawnRemaining-dt);
      if(!this.respawnRemaining){this.life++;Object.assign(this.hero,this.profile.spawn,freshStatus(),{hp:this.hero.maxHp,mana:this.maxMana,fury:0,shield:0,shieldRemaining:0});this.anchor={...this.profile.spawn};}
      return;
    }
    this.stepVitals(dt);
    if(this.hero.rooted>0)this.dash=null;
    if(!this.canAct){this.pending=null;this.cancelRecall();this.dash=null;this.abilities.pull=null;return;}
    if(this.abilities.pull){
      if(this.hero.rooted>0)this.abilities.pull=null;
      else {this.travel(this.abilities.pull,RULES.dash.speed*dt,true);if(distance(this.hero,this.abilities.pull)<.1)this.abilities.pull=null;return;}
    }
    this.stepActor(dt);
  }
  static stepEnemies(enemies: Dummy[], dt: number) {
    for (const enemy of enemies) {
      if(enemy.receiveDamage)continue;
      tickStatus(enemy,dt);
      enemy.revealed=Math.max(0,enemy.revealed-dt);
      enemy.alert=Math.max(0,enemy.alert-dt);
      enemy.attackCooldown=Math.max(0,enemy.attackCooldown-dt);
      if (!enemy.alive) {
        enemy.respawn -= dt;
        if (enemy.respawn <= 0) { enemy.generation++; enemy.alive = true; enemy.hp = enemy.maxHp; enemy.stunned = 0; Object.assign(enemy,freshStatus(),{alert:0,aggro:null,attackCooldown:0}); }
      }
    }
  }
  private stepVitals(dt:number){
    const potion=this.equipment.active;
    if(potion){const tick=Math.min(dt,potion.remaining),before=this.hero.hp;this.hero.hp=Math.min(this.hero.maxHp,this.hero.hp+potion.hpPerSecond*tick);this.hero.mana=Math.min(this.maxMana,this.hero.mana+potion.manaPerSecond*tick);potion.remaining-=tick;potion.healed+=this.hero.hp-before;if(potion.remaining<=1e-8){if(potion.healed>0)this.events.push({kind:'heal',point:{...this.hero},amount:potion.healed});this.equipment.active=null;}}
    this.hero.mana = Math.min(this.maxMana, this.hero.mana + this.maxMana * (.008+this.buffs.extraManaRegen) * dt);
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.maxHp * 0.003 * dt);
    if (this.elapsed - this.lastCombat > 6) this.hero.fury = Math.max(0, this.hero.fury - 10 * dt);
    if (this.ultimateRemaining > 0) {
      this.ultimateRemaining = Math.max(0, this.ultimateRemaining - dt);
      for (const enemy of this.enemies) if (enemy.alive && distance(this.hero, enemy) <= RULES.ultimate.range) this.hurt(enemy, this.ultimateDamage * dt, 'R', false, 'magic');
      if (!this.ultimateRemaining) { this.hero.maxHp -= this.ultimateHealth; this.ultimateHealth=0; this.hero.hp = Math.min(this.hero.hp, this.hero.maxHp); }
    }
  }
  private stepActor(dt: number) {
    if (this.dash) {
      this.travel(this.dash.destination, RULES.dash.speed * dt,true);
      for (const enemy of this.enemies) if (enemy.alive && !this.dash.hit.has(enemy.id) && distance(this.hero, enemy) < 48) {
        this.dash.hit.add(enemy.id); this.hurt(enemy, this.furySkills.dash.damage, 'E');
      }
      if (distance(this.hero, this.dash.destination) < 0.1) this.dash = null;
      return;
    }
    if (this.command.kind === 'recall') {
      this.command.remaining -= dt;
      if (this.command.remaining <= 0) {
        this.hero.x = this.profile.spawn.x; this.hero.y = this.profile.spawn.y;
        this.anchor = { ...this.profile.spawn }; this.command = { kind: 'idle' };
        this.events.push({ kind: 'recall', point: { ...this.hero } });
      }
      return;
    }
    if (distance(this.hero, this.profile.spawn) < 75) {
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.maxHp * 0.15 * dt);
      this.hero.mana = Math.min(this.maxMana, this.hero.mana + this.maxMana * .15 * dt);
    }
    if (this.command.kind === 'move') {
      this.travel(this.command.point, this.stats.speed * dt);
      if (distance(this.hero, this.command.point) < 0.1) this.command = { kind: 'idle' };
      return;
    }
    let target: Dummy | undefined;
    if (this.command.kind === 'attack') {
      const order = this.command;
      const current = this.enemies.find(e => e.id === order.targetId && !e.protected);
      if (!current || current.generation!==order.generation || !current.alive) {
        this.pending = null;
        const memory=this.memoryResolver?this.memoryFor(order.targetId,order.generation):null;
        if(memory){
          this.lastSeen={...memory};
          this.travel(this.lastSeen,this.stats.speed*dt);
          if(distance(this.hero,this.lastSeen)<.1)this.command={kind:'attackMove',point:{...order.point}};
          return;
        }
        this.command={kind:'attackMove',point:{...order.point}};
      } else if (!this.canSee(current)) {
        target=current;
        this.pending = null;
        const sighting=this.lastSeenFor(current);if(sighting)this.lastSeen=sighting;
        if (this.lastSeen) this.travel(this.lastSeen, this.stats.speed * dt);
        if (!this.lastSeen || distance(this.hero, this.lastSeen) < 0.1) this.command = { kind:'attackMove',point:{...order.point} };
        return;
      } else {
        target=current;
        this.lastSeen = { x: target.x, y: target.y };
        // Fight enemies encountered on the route; the explicit target wins when in range.
        if(distance(this.hero,target)>this.stats.range+.001)target=this.routeTarget()??target;
      }
    }
    if(this.command.kind==='attackMove')target=this.routeTarget();
    else if(this.command.kind!=='attack') {
      target = this.enemies.filter(e => e.alive && !e.protected && this.autoTargetAllowed(e) && this.canSee(e) && distance(e, this.anchor) <= this.stats.anchorRadius).sort((a,b) => distance(this.hero,a)-distance(this.hero,b))[0];
    }
    if (!target) {
      this.pending = null;
      if(this.command.kind==='attackMove'){
        this.travel(this.command.point,this.stats.speed*dt);
        if(distance(this.hero,this.command.point)<.1)this.command={kind:'idle'};
      }
      return;
    }
    this.hero.facing = Math.atan2(target.y - this.hero.y, target.x - this.hero.x);
    if (this.pending) {
      if (this.pending.targetId !== target.id || distance(this.hero, target) > this.stats.range + 12) { this.pending = null; return; }
      this.pending.remaining -= dt;
      if (this.pending.remaining <= 0) {
        const p = this.pending;
        if (p.useW) {
          if (p.empowered) this.hero.fury -= 50;
          this.cooldown.w = RULES.w.cooldown;
          target.stunned = Math.max(target.stunned,this.furySkills.w.stun + (p.empowered ? 0.4 : 0));
        }
        this.basicHit(target, this.stats.attack + (p.useW ? this.furySkills.w.bonus * (p.empowered ? 1.5 : 1) : 0), p.useW ? 'W' : '기본 공격');
        if (this.profile.kit === 'fury') this.hero.fury = Math.min(100, this.hero.fury + 10);
        this.completed.attack = true;
        this.pending = null;
      }
      return;
    }
    if(this.abilities.auto(target))return;
    const visibleNearby = this.enemies.filter(e => e.alive && skillTarget(e) && this.canSee(e) && distance(this.hero,e) <= RULES.q.range);
    const qHits = this.enemies.filter(e => e.alive && skillTarget(e) && distance(this.hero,e) <= RULES.q.range);
    const canW = skillTarget(target) && this.profile.kit === 'fury' && this.ranks.W>0 && this.cooldown.w <= 0 && distance(this.hero,target) <= this.stats.range + .001;
    if (this.profile.kit === 'fury' && this.ranks.Q>0 && this.cooldown.q <= 0 && visibleNearby.length && (this.hero.hp / this.hero.maxHp <= 0.5 || !canW)) {
      const empowered = this.hero.fury >= 50;
      if (empowered) this.hero.fury -= 50;
      else this.hero.fury = Math.min(100, this.hero.fury + Math.min(15, qHits.length * 5));
      for (const enemy of qHits) this.hurt(enemy, this.furySkills.q.damage * (empowered ? 1.5 : 1), 'Q');
      const before = this.hero.hp;
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.min(this.furySkills.q.healCap, qHits.reduce((sum,e)=>sum+(e.kind==='minion'?this.furySkills.q.minionHeal:this.furySkills.q.heal),0)) * (empowered ? 2 : 1));
      if (this.hero.hp > before) this.events.push({ kind: 'heal', point: { ...this.hero }, amount: this.hero.hp-before });
      this.events.push({ kind: 'slash', point: { ...this.hero } });
      this.cooldown.q = RULES.q.cooldown;
      return;
    }
    if (distance(this.hero, target) > this.stats.range + .001) {
      this.travel(target, Math.min(this.stats.speed * dt, distance(this.hero,target)-this.stats.range));
    } else if (this.cooldown.attack <= 0) {
      this.pending = { targetId: target.id, remaining: this.stats.windup, empowered: this.hero.fury >= 50, useW: canW };
      this.cooldown.attack = this.stats.attackInterval / (this.abilities.haste>0?1+this.abilities.hasteBonus:1);
    }
  }
  private routeTarget(){
    return this.enemies.filter(e=>e.alive&&!e.protected&&this.autoTargetAllowed(e)&&this.canSee(e)&&distance(this.hero,e)<=this.stats.range+.001)
      .sort((a,b)=>Number(a.kind==='building')-Number(b.kind==='building')||distance(this.hero,a)-distance(this.hero,b))[0];
  }
  private basicHit(target: Dummy, raw: number, source: string) {
    if (!this.profile.projectileSpeed) { this.hurt(target, raw, source, true, 'physical', 'basic');this.abilities.onBasicHit(target);this.buffs.onBasicHit(target); return; }
    this.offensiveAction();
    this.projectiles.push({ x:this.hero.x, y:this.hero.y, target, generation:target.generation, damage:raw });
  }
  private stepProjectiles(dt: number) {
    this.projectiles = this.projectiles.filter(p => {
      if (!p.target.alive || p.target.generation !== p.generation) return false;
      const d = distance(p, p.target), travel = this.profile.projectileSpeed * dt;
      if (d <= travel) { this.hurt(p.target, p.damage, '기본 공격', true, 'physical', 'basic', false);this.abilities.onBasicHit(p.target);this.buffs.onBasicHit(p.target); return false; }
      p.x += (p.target.x-p.x)/d*travel; p.y += (p.target.y-p.y)/d*travel;
      return true;
    });
  }
  private travel(point: Point, amount: number, ignoreSlow=false) {
    if(this.hero.rooted>0||this.hero.airborne>0)return;
    if(!ignoreSlow)amount*=1-this.hero.slow;
    const d = distance(this.hero,point);
    if (d < 0.001) return;
    this.hero.facing = Math.atan2(point.y-this.hero.y,point.x-this.hero.x);
    const scale = Math.min(1, amount/d);
    this.hero.x += (point.x-this.hero.x)*scale;
    this.hero.y += (point.y-this.hero.y)*scale;
  }
  hurt(target: Dummy, raw: number, source: string, show = true, type:DamageType='physical', kind:HitKind='skill', exposeSource=true) {
    if(!target.alive||target.protected||(target.kind==='building'&&kind!=='basic'))return;
    if(raw>0){if(exposeSource)this.offensiveAction();target.alert=SKILLS.retaliation.alert;target.aggro=this.profile.id;this.lastCombat=this.elapsed;}
    const amount=damageTarget(target,raw*(type==='magic'&&target.marked>0?1+SKILLS.curse.passive.amplify:1),type,kind,show);
    if(!amount)return;
    this.damage += amount; this.lastCombat = this.elapsed;
    if (show&&!target.receiveDamage) this.events.push({ kind: 'damage', point: { x: target.x, y: target.y-40 }, amount, source, visual:`hit.${type}` });

  }
}
