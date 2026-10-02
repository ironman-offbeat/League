import { Combat } from './combat.ts';
import { CHAMPIONS } from './champions.ts';
export class Squad {
  members: Combat[];
  selectedIndex = 0;
  constructor() {
    const first = new Combat(CHAMPIONS[0]);
    this.members = [first, ...CHAMPIONS.slice(1).map(p => new Combat(p, first.enemies))];
  }
  get selected() { return this.members[this.selectedIndex]; }
  select(index: number) {
    if (!Number.isInteger(index) || !this.members[index]) return false;
    this.selectedIndex = index; return true;
  }
  step(dt: number) {
    Combat.stepEnemies(this.selected.enemies, dt);
    for (const member of this.members) member.step(dt, false);
  }
}
