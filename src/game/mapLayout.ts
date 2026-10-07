import type { Point } from './config.ts';

export type LaneId='top'|'mid'|'bot';
export const LANE_IDS=['top','mid','bot'] as const;
export const LANE_LABELS:Record<LaneId,string>={top:'상단',mid:'중앙',bot:'하단'};

export const MAP_LAYOUT={
  bases:{blue:{x:100,y:850},red:{x:1500,y:150}},
  championSpawns:[
    {x:145,y:805},
    {x:185,y:845},
    {x:135,y:890},
    {x:220,y:800},
  ],
  // Jungle routing is introduced in the next map phase. Until then the fourth
  // slot shadows mid so the existing 4v4 AI remains active and symmetric.
  championLanes:['top','mid','bot','mid'] as const,
  lanes:{
    top:{
      points:[{x:100,y:850},{x:340,y:300},{x:800,y:160},{x:1260,y:190},{x:1500,y:150}],
      towers:{blue:{x:340,y:300},red:{x:1260,y:190}},
    },
    mid:{
      points:[{x:100,y:850},{x:440,y:500},{x:800,y:500},{x:1160,y:500},{x:1500,y:150}],
      towers:{blue:{x:440,y:500},red:{x:1160,y:500}},
    },
    bot:{
      // Exact 180-degree counterpart of top. Blue top maps to red bot and vice versa.
      points:[{x:100,y:850},{x:340,y:810},{x:800,y:840},{x:1260,y:700},{x:1500,y:150}],
      towers:{blue:{x:340,y:810},red:{x:1260,y:700}},
    },
  },
  bushes:[
    {id:'lane-north',x:650,y:390,width:260,height:90},
    {id:'lane-south',x:690,y:520,width:260,height:90},
    {id:'top-west',x:470,y:190,width:220,height:80},
    {id:'top-east',x:930,y:125,width:220,height:80},
    {id:'bot-west',x:500,y:790,width:220,height:80},
    {id:'bot-east',x:980,y:700,width:220,height:80},
  ],
} as const;

export const mirrorPoint=(p:Point):Point=>({x:1600-p.x,y:1000-p.y});

export function laneRoute(lane:LaneId,team:'blue'|'red'):Point[]{
  const points=MAP_LAYOUT.lanes[lane].points.map(p=>({x:p.x,y:p.y}));
  return team==='blue'?points:points.reverse();
}

export function laneTowerPoint(lane:LaneId,team:'blue'|'red'):Point{
  const p=MAP_LAYOUT.lanes[lane].towers[team];
  return {x:p.x,y:p.y};
}

export function routeLength(route:readonly Point[]){
  let total=0;
  for(let i=1;i<route.length;i++)total+=Math.hypot(route[i].x-route[i-1].x,route[i].y-route[i-1].y);
  return total;
}

export function routePointAt(route:readonly Point[],progress:number):Point{
  if(!route.length)return {x:0,y:0};
  let remaining=Math.max(0,progress);
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.y-a.y);
    if(remaining<=length||i===route.length-1){
      const t=length?Math.min(1,remaining/length):0;
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
    }
    remaining-=length;
  }
  return {...route[route.length-1]};
}

export function routeProgress(route:readonly Point[],point:Point){
  let bestDistance=Infinity,bestProgress=0,passed=0;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],dx=b.x-a.x,dy=b.y-a.y,lengthSq=dx*dx+dy*dy;
    const t=lengthSq?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/lengthSq)):0;
    const x=a.x+dx*t,y=a.y+dy*t,distanceSq=(point.x-x)**2+(point.y-y)**2;
    const length=Math.sqrt(lengthSq);
    if(distanceSq<bestDistance){bestDistance=distanceSq;bestProgress=passed+length*t;}
    passed+=length;
  }
  return bestProgress;
}

export function formationPoint(lane:LaneId,team:'blue'|'red',slot:number):Point{
  const route=laneRoute(lane,team),a=route[0],b=route[1];
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length;
  const forward=48+Math.floor(slot/3)*32,lateral=(slot%3-1)*26;
  return {x:a.x+ux*forward-uy*lateral,y:a.y+uy*forward+ux*lateral};
}
