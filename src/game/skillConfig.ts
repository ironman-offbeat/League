export const SKILLS = {
 flame:{q:{cost:30,cooldown:5,damage:75,range:250},w:{cost:55,cooldown:9,damage:90,range:210,angle:Math.PI/4},shield:{cost:40,cooldown:12,amount:70,duration:3,threshold:.7},ultimate:{cost:100,cooldown:65,damage:140,range:300,radius:110},pet:{hp:350,duration:12,damage:25,interval:1,range:65,speed:180,leash:350},passive:{stacks:3,stun:1}},
 frost:{q:{cost:35,cooldown:10,duration:4,haste:.3},w:{cost:45,cooldown:8,damage:60,ad:.6,range:300,angle:Math.PI/5,slow:.25,duration:2},scout:{range:1900,cost:0,cooldown:30,duration:5,radius:150},ultimate:{cost:100,cooldown:60,damage:120,range:1900,speed:650,radius:20,stun:1.5},passive:{slow:.15,duration:1.2}},
 curse:{hook:{cost:50,cooldown:12,damage:60,range:330,speed:600,radius:18,stun:.6},aura:{costPerSecond:6,damage:12,hpRatio:.005,range:100,restart:1},burst:{cost:35,cooldown:7,damage:60,range:100},ultimate:{cost:100,cooldown:65,damage:100,range:150,root:1.5},passive:{duration:3,amplify:.1}},
 retaliation:{damage:65,range:325,interval:1.5,windup:.45,alert:6},
 respawn:6.5,
} as const;
export type SkillSlot='manual'|'ultimate';
export type SkillPresentation={key:string;name:string;aim:'direction'|'point'|'self';cost:number;cooldown:number;range:number;hint:string};
