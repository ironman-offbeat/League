import { RULES } from './config.ts';
import type { Point } from './config.ts';
export type Champion = { id: string; name: string; symbol: string; color: number; kit: 'fury' | 'basic'; mana: number; spawn: Point; stats: { hp: number; attack: number; speed: number; range: number; attackInterval: number; windup: number; anchorRadius: number }; projectileSpeed: number };
export const CHAMPIONS: Champion[] = [
  { id:'renekton',name:'레넥톤',symbol:'R',color:0x89cca0,kit:'fury',mana:0,spawn:{...RULES.spawn},stats:{...RULES.hero},projectileSpeed:0 },
  { id:'annie',name:'애니',symbol:'A',color:0xe7a178,kit:'basic',mana:420,spawn:{x:360,y:490},stats:{hp:620,attack:42,speed:150,range:250,attackInterval:1/.7,windup:.22,anchorRadius:125},projectileSpeed:420 },
  { id:'ashe',name:'애쉬',symbol:'S',color:0x86c9ec,kit:'basic',mana:360,spawn:{x:360,y:620},stats:{hp:650,attack:58,speed:155,range:275,attackInterval:1/.85,windup:.22,anchorRadius:125},projectileSpeed:580 },
  { id:'amumu',name:'아무무',symbol:'M',color:0xb8c785,kit:'basic',mana:400,spawn:{x:470,y:700},stats:{hp:900,attack:46,speed:150,range:60,attackInterval:1/.7,windup:.22,anchorRadius:125},projectileSpeed:0 },
];
