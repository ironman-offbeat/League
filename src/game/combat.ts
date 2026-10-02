import { RULES, distance, clampPoint } from './config.ts';
import type { Point } from './config.ts';

export type Command = { kind: 'idle' } | { kind: 'move'; point: Point } | { kind: 'attack'; targetId: string } | { kind: 'return' } | { kind: 'recall'; remaining: number };
export type Dummy = Point & { id: string; hp: number; maxHp: number; armor: number; alive: boolean; visible: boolean; respawn: number; stunned: number };
export type GameEvent = { kind: 'damage' | 'heal' | 'slash' | 'dash' | 'ultimate' | 'recall'; point: Point; amount?: number; source?: string };
export type PendingAttack = { targetId: string; remaining: number; empowered: boolean; useW: boolean };

export function mitigate(raw: number, armor: number) { return raw * 100 / (100 + Math.max(0, armor)); }
export class Combat {
  hero: Point & { hp: number; maxHp: number; fury: number; facing: number } = { ...RULES.spawn, hp: RULES.hero.hp, maxHp: RULES.hero.hp, fury: 0, facing: 0 };
  anchor: Point = { ...RULES.spawn };
  command: Command = { kind: 'idle' };
  enemies: Dummy[] = [
    { id: 'a', x: 720, y: 470 }, { id: 'b', x: 850, y: 640 }, { id: 'c', x: 1050, y: 430 },
  ].map(p => ({ ...p, hp: RULES.dummy.hp, maxHp: RULES.dummy.hp, armor: RULES.dummy.armor, alive: true, visible: true, respawn: 0, stunned: 0 }));
  cooldown = { attack: 0, q: 0, w: 0, dash: 0, ultimate: 0 };
  pending: PendingAttack | null = null;
  dash: { destination: Point; hit: Set<string> } | null = null;
  ultimateRemaining = 0;
  events: GameEvent[] = [];
  damage = 0;
  elapsed = 0;
  lastCombat = -100;
  lastSeen: Point | null = null;
  completed = { move: false, attack: false, dash: false };

  move(point: Point) {
    if (this.dash) return false;
    this.anchor = clampPoint(point);
    this.command = { kind: 'move', point: { ...this.anchor } };
    this.pending = null;
    this.completed.move = true;
    return true;
  }
  attack(targetId: string) {
    if (this.dash) return false;
    const target = this.enemies.find(e => e.id === targetId && e.alive && e.visible);
    if (!target) return false;
    this.command = { kind: 'attack', targetId };
    this.lastSeen = { x: target.x, y: target.y };
    this.pending = null;
    return true;
  }
  castDash(point: Point) {
    if (this.cooldown.dash > 0 || this.dash) return false;
    const d = distance(this.hero, point);
    if (d < 5) return false;
    const length = Math.min(d, RULES.dash.range);
    const destination = clampPoint({ x: this.hero.x + (point.x - this.hero.x) / d * length, y: this.hero.y + (point.y - this.hero.y) / d * length });
    this.hero.facing = Math.atan2(destination.y - this.hero.y, destination.x - this.hero.x);
    this.dash = { destination, hit: new Set() };
    this.anchor = { ...destination };
    this.command = { kind: 'idle' };
    this.pending = null;
    this.cooldown.dash = RULES.dash.cooldown;
    this.completed.dash = true;
    this.events.push({ kind: 'dash', point: { ...this.hero } });
    return true;
  }
  castUltimate() {
    if (this.cooldown.ultimate > 0) return false;
    this.cancelRecall();
    this.hero.maxHp += RULES.ultimate.health;
    this.hero.hp += RULES.ultimate.health;
    this.ultimateRemaining = RULES.ultimate.duration;
    this.cooldown.ultimate = RULES.ultimate.cooldown;
    this.events.push({ kind: 'ultimate', point: { ...this.hero } });
    return true;
  }
  recall() {
    if (this.dash) return false;
    this.pending = null;
    this.command = { kind: 'recall', remaining: RULES.recall.duration };
    return true;
  }
  cancelRecall() { if (this.command.kind === 'recall') this.command = { kind: 'idle' }; }
  step(dt: number) {
    this.elapsed += dt;
    for (const key of Object.keys(this.cooldown) as (keyof typeof this.cooldown)[]) this.cooldown[key] = Math.max(0, this.cooldown[key] - dt);
    for (const enemy of this.enemies) {
      enemy.stunned = Math.max(0, enemy.stunned - dt);
      if (!enemy.alive) {
        enemy.respawn -= dt;
        if (enemy.respawn <= 0) { enemy.alive = true; enemy.hp = enemy.maxHp; enemy.stunned = 0; }
      }
    }
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.maxHp * 0.003 * dt);
    if (this.elapsed - this.lastCombat > 6) this.hero.fury = Math.max(0, this.hero.fury - 10 * dt);
    if (this.ultimateRemaining > 0) {
      this.ultimateRemaining = Math.max(0, this.ultimateRemaining - dt);
      for (const enemy of this.enemies) if (enemy.alive && distance(this.hero, enemy) <= RULES.ultimate.range) this.hurt(enemy, RULES.ultimate.damage * dt, 'R', false);
      if (!this.ultimateRemaining) { this.hero.maxHp -= RULES.ultimate.health; this.hero.hp = Math.min(this.hero.hp, this.hero.maxHp); }
    }
    if (this.dash) {
      this.travel(this.dash.destination, RULES.dash.speed * dt);
      for (const enemy of this.enemies) if (enemy.alive && !this.dash.hit.has(enemy.id) && distance(this.hero, enemy) < 48) {
        this.dash.hit.add(enemy.id); this.hurt(enemy, RULES.dash.damage, 'E');
      }
      if (distance(this.hero, this.dash.destination) < 0.1) this.dash = null;
      return;
    }
    if (this.command.kind === 'recall') {
      this.command.remaining -= dt;
      if (this.command.remaining <= 0) {
        this.hero.x = RULES.spawn.x; this.hero.y = RULES.spawn.y;
        this.anchor = { ...RULES.spawn }; this.command = { kind: 'idle' };
        this.events.push({ kind: 'recall', point: { ...this.hero } });
      }
      return;
    }
    if (distance(this.hero, RULES.spawn) < 75) this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.maxHp * 0.15 * dt);
    if (this.command.kind === 'move') {
      this.travel(this.command.point, RULES.hero.speed * dt);
      if (distance(this.hero, this.command.point) < 0.1) this.command = { kind: 'idle' };
      return;
    }
    if (this.command.kind === 'return') {
      this.pending = null; this.travel(this.anchor, RULES.hero.speed * dt);
      if (distance(this.hero, this.anchor) < 0.1) this.command = { kind: 'idle' };
      return;
    }
    let target: Dummy | undefined;
    if (this.command.kind === 'attack') {
      const id = this.command.targetId;
      target = this.enemies.find(e => e.id === id && e.alive);
      if (!target) { this.pending = null; this.command = { kind: 'return' }; return; }
      if (!target.visible) {
        this.pending = null;
        if (this.lastSeen) this.travel(this.lastSeen, RULES.hero.speed * dt);
        if (!this.lastSeen || distance(this.hero, this.lastSeen) < 0.1) this.command = { kind: 'return' };
        return;
      }
      this.lastSeen = { x: target.x, y: target.y };
    } else {
      target = this.enemies.filter(e => e.alive && e.visible && distance(e, this.anchor) <= RULES.hero.anchorRadius).sort((a,b) => distance(this.hero,a)-distance(this.hero,b))[0];
    }
    if (!target) { this.pending = null; return; }
    this.hero.facing = Math.atan2(target.y - this.hero.y, target.x - this.hero.x);
    if (this.pending) {
      if (this.pending.targetId !== target.id || distance(this.hero, target) > RULES.hero.range + 12) { this.pending = null; return; }
      this.pending.remaining -= dt;
      if (this.pending.remaining <= 0) {
        const p = this.pending;
        if (p.useW) {
          if (p.empowered) this.hero.fury -= 50;
          this.cooldown.w = RULES.w.cooldown;
          target.stunned = RULES.w.stun + (p.empowered ? 0.4 : 0);
        }
        this.hurt(target, RULES.hero.attack + (p.useW ? RULES.w.bonus * (p.empowered ? 1.5 : 1) : 0), p.useW ? 'W' : '기본 공격');
        this.hero.fury = Math.min(100, this.hero.fury + 10);
        this.completed.attack = true;
        this.pending = null;
      }
      return;
    }
    const nearby = this.enemies.filter(e => e.alive && e.visible && distance(this.hero,e) <= RULES.q.range);
    const canW = this.cooldown.w <= 0 && distance(this.hero,target) <= RULES.hero.range;
    if (this.cooldown.q <= 0 && nearby.length && (this.hero.hp / this.hero.maxHp <= 0.5 || !canW)) {
      const empowered = this.hero.fury >= 50;
      if (empowered) this.hero.fury -= 50;
      else this.hero.fury = Math.min(100, this.hero.fury + Math.min(15, nearby.length * 5));
      for (const enemy of nearby) this.hurt(enemy, RULES.q.damage * (empowered ? 1.5 : 1), 'Q');
      const before = this.hero.hp;
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.min(100, nearby.length * RULES.q.heal) * (empowered ? 2 : 1));
      if (this.hero.hp > before) this.events.push({ kind: 'heal', point: { ...this.hero }, amount: this.hero.hp-before });
      this.events.push({ kind: 'slash', point: { ...this.hero } });
      this.cooldown.q = RULES.q.cooldown;
      return;
    }
    if (distance(this.hero, target) > RULES.hero.range) {
      this.travel(target, Math.min(RULES.hero.speed * dt, distance(this.hero,target)-RULES.hero.range));
    } else if (this.cooldown.attack <= 0) {
      this.pending = { targetId: target.id, remaining: RULES.hero.windup, empowered: this.hero.fury >= 50, useW: canW };
      this.cooldown.attack = RULES.hero.attackInterval;
    }
  }
  private travel(point: Point, amount: number) {
    const d = distance(this.hero,point);
    if (d < 0.001) return;
    this.hero.facing = Math.atan2(point.y-this.hero.y,point.x-this.hero.x);
    const scale = Math.min(1, amount/d);
    this.hero.x += (point.x-this.hero.x)*scale;
    this.hero.y += (point.y-this.hero.y)*scale;
  }
  private hurt(target: Dummy, raw: number, source: string, show = true) {
    const amount = Math.min(target.hp, mitigate(raw,target.armor));
    target.hp -= amount; this.damage += amount; this.lastCombat = this.elapsed;
    if (show) this.events.push({ kind: 'damage', point: { x: target.x, y: target.y-40 }, amount, source });
    if (target.hp <= 0) { target.hp=0; target.alive=false; target.respawn=RULES.dummy.respawn; }
  }
}
