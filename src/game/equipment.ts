export type GearSlot='weapon'|'armor';
export type Potion='health'|'mana'|'mixed';
export type Purchase=GearSlot|Potion;
export const EQUIPMENT={
  fountainRadius:75,
  physical:[0,10,25,45], magical:[0,15,40,70],
  health:[0,100,220,380], defense:[0,5,10,18],
  weaponCost:[0,300,550],armorCost:[0,250,450],
  potions:{health:{name:'체력 포션',cost:40,hp:.25,mana:0},mana:{name:'마나 포션',cost:40,hp:0,mana:.30},mixed:{name:'혼합 포션',cost:120,hp:.25,mana:.30}},
  duration:5,
} as const;
export class Equipment {
  weapon=0;
  armor=0;
  potion:Potion|null=null;
  active:{remaining:number;hpPerSecond:number;manaPerSecond:number;healed:number}|null=null;
  initialize(){this.weapon=1;this.armor=1;this.potion='health';this.active=null;}
  price(item:Purchase):number|null{
    if(item==='weapon'||item==='armor')return this[item]>=3?null:EQUIPMENT[item==='weapon'?'weaponCost':'armorCost'][this[item]];
    return EQUIPMENT.potions[item]?.cost??null;
  }
}
