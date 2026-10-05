export const RULES = {
  step: 1 / 60,
  world: { width: 1600, height: 1000, margin: 45 },
  hero: { hp: 850, attack: 64, armor: 30, speed: 160, range: 65, attackInterval: 1.25, windup: 0.22, anchorRadius: 125 },
  dash: { range: 200, speed: 950, damage: 92, attackRatio:.5, cooldown: 12 },
  q: { range: 100, damage: 114.8, attackRatio:.7, cooldown: 7, heal: 35 },
  w: { bonus: 50.6, attackRatio:.4, cooldown: 9, stun: 0.6 },
  ultimate: { health: 250, duration: 10, cooldown: 65, range: 100, damage: 20 },
  recall: { duration: 4 },
  dummy: { hp: 1600, armor: 30, respawn: 3 },
  spawn: { x: 470, y: 560 },
} as const;
export type Point = { x: number; y: number };
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const clampPoint = (p: Point): Point => ({
  x: Math.max(RULES.world.margin, Math.min(RULES.world.width - RULES.world.margin, p.x)),
  y: Math.max(RULES.world.margin, Math.min(RULES.world.height - RULES.world.margin, p.y)),
});
