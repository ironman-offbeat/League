export type Growth={hp:number;mana:number;attack:number;armor:number;magicResist:number};
export const PROGRESSION={
  thresholds:[100,140,180,220,260,300,340,380,420,460,500],
  attackSpeedPerLevel:.02, ultimateLevel:4, rewardRange:350,
  startingGold:200, passiveGoldStart:10, passiveGoldPerSecond:2,
  respawnBase:5, respawnPerLevel:1.5, lateRespawnAt:480, lateRespawnBonus:4,
  rewards:{melee:{gold:8,xp:20},ranged:{gold:10,xp:16},siege:{gold:20,xp:40},tower:{gold:150,xp:0},nexus:{gold:0,xp:0}},
} as const;

export class Progression {
  enabled:boolean;
  level=1;
  xp=0;
  totalXp=0;
  constructor(enabled=false){this.enabled=enabled;}
  get maxLevel(){return PROGRESSION.thresholds.length+1;}
  get capped(){return this.level===this.maxLevel;}
  get required(){return this.capped?0:PROGRESSION.thresholds[this.level-1];}
  get ultimateUnlocked(){return !this.enabled||this.level>=PROGRESSION.ultimateLevel;}
  gain(amount:number){
    if(!this.enabled||!Number.isFinite(amount)||amount<=0||this.capped)return 0;
    const before=this.level;this.xp+=amount;this.totalXp+=amount;
    while(!this.capped&&this.xp+1e-8>=this.required){this.xp=Math.max(0,this.xp-this.required);this.level++;}
    if(this.capped){this.totalXp=PROGRESSION.thresholds.reduce((sum,n)=>sum+n,0);this.xp=0;}
    return this.level-before;
  }
}

export class TeamEconomy {
  gold:number=PROGRESSION.startingGold;
  earned=0;
  spend(amount:number){if(!Number.isFinite(amount)||amount<0||this.gold+1e-8<amount)return false;this.gold=Math.max(0,this.gold-amount);return true;}
  add(amount:number){if(Number.isFinite(amount)&&amount>0){this.gold+=amount;this.earned+=amount;}}
  advance(from:number,to:number){
    const start=PROGRESSION.passiveGoldStart;
    this.add(Math.max(0,Math.max(0,to-start)-Math.max(0,from-start))*PROGRESSION.passiveGoldPerSecond);
  }
}
