import { distance } from './config.ts';
import type { Point } from './config.ts';

export type LaneId='top'|'mid'|'bottom';
export type NavigationTeam='blue'|'red';
export type NavigationNode={
  id:string;
  point:Point;
  tags:readonly string[];
};
export type NavigationEdge=readonly [string,string];
export type RouteProjection={
  distance:number;
  point:Point;
  lateral:number;
  segment:number;
};

const clonePoint=(point:Point):Point=>({x:point.x,y:point.y});

export class NavigationGraph {
  private readonly nodes=new Map<string,NavigationNode>();
  private readonly links=new Map<string,Set<string>>();

  constructor(nodes:readonly NavigationNode[],edges:readonly NavigationEdge[]){
    for(const node of nodes){
      if(this.nodes.has(node.id))throw new Error(`duplicate navigation node: ${node.id}`);
      this.nodes.set(node.id,{id:node.id,point:clonePoint(node.point),tags:[...node.tags]});
      this.links.set(node.id,new Set());
    }
    for(const [a,b] of edges){
      if(a===b)throw new Error(`self navigation edge: ${a}`);
      if(!this.nodes.has(a)||!this.nodes.has(b))throw new Error(`unknown navigation edge: ${a} <-> ${b}`);
      this.links.get(a)!.add(b);
      this.links.get(b)!.add(a);
    }
  }

  node(id:string):NavigationNode{
    const node=this.nodes.get(id);
    if(!node)throw new Error(`unknown navigation node: ${id}`);
    return {id:node.id,point:clonePoint(node.point),tags:[...node.tags]};
  }

  neighbors(id:string):NavigationNode[]{
    if(!this.nodes.has(id))throw new Error(`unknown navigation node: ${id}`);
    return [...this.links.get(id)!].map(next=>this.node(next));
  }

  nearest(point:Point,allowed:(node:NavigationNode)=>boolean=()=>true):NavigationNode|null{
    let best:NavigationNode|null=null,bestDistance=Infinity;
    for(const node of this.nodes.values()){
      if(!allowed(node))continue;
      const d=distance(point,node.point);
      if(d<bestDistance){best=node;bestDistance=d;}
    }
    return best?this.node(best.id):null;
  }

  shortestPathIds(from:string,to:string,allowed:(node:NavigationNode)=>boolean=()=>true,allowedEdge:(from:NavigationNode,to:NavigationNode)=>boolean=()=>true):string[]{
    const start=this.nodes.get(from),goal=this.nodes.get(to);
    if(!start||!goal)throw new Error(`unknown navigation path: ${from} -> ${to}`);
    if(!allowed(start)||!allowed(goal))return [];

    const open=new Set<string>([from]);
    const cost=new Map<string,number>([[from,0]]);
    const previous=new Map<string,string>();

    while(open.size){
      let current:string|null=null,currentScore=Infinity;
      for(const id of open){
        const node=this.nodes.get(id)!;
        const score=(cost.get(id)??Infinity)+distance(node.point,goal.point);
        if(score<currentScore){current=id;currentScore=score;}
      }
      if(current===null)break;
      if(current===to){
        const path=[to];
        while(path[0]!==from)path.unshift(previous.get(path[0])!);
        return path;
      }
      open.delete(current);
      const currentNode=this.nodes.get(current)!;
      for(const next of this.links.get(current)!){
        const node=this.nodes.get(next)!;
        if(!allowed(node)||!allowedEdge(currentNode,node))continue;
        const nextCost=(cost.get(current)??Infinity)+distance(currentNode.point,node.point);
        if(nextCost+1e-8<(cost.get(next)??Infinity)){
          cost.set(next,nextCost);
          previous.set(next,current);
          open.add(next);
        }
      }
    }
    return [];
  }

  shortestPath(from:string,to:string,allowed:(node:NavigationNode)=>boolean=()=>true):Point[]{
    return this.shortestPathIds(from,to,allowed).map(id=>this.node(id).point);
  }
}

export const BATTLEFIELD_LANE_NODES:Record<LaneId,readonly string[]>={
  top:['blue-base','top-blue-inner','top-blue-outer','top-river','top-red-outer','top-red-inner','red-base'],
  mid:['blue-base','mid-blue-inner','mid-blue-river','mid-center','mid-red-river','mid-red-inner','red-base'],
  bottom:['blue-base','bottom-blue-inner','bottom-blue-outer','bottom-river','bottom-red-outer','bottom-red-inner','red-base'],
};

const nodes:NavigationNode[]=[
  {id:'blue-base',point:{x:140,y:840},tags:['base','blue']},
  {id:'red-base',point:{x:1460,y:160},tags:['base','red']},

  {id:'top-blue-inner',point:{x:150,y:650},tags:['lane','top','blue-side']},
  {id:'top-blue-outer',point:{x:160,y:260},tags:['lane','top','blue-side']},
  {id:'top-river',point:{x:760,y:150},tags:['lane','top','river']},
  {id:'top-red-outer',point:{x:1240,y:150},tags:['lane','top','red-side']},
  {id:'top-red-inner',point:{x:1410,y:210},tags:['lane','top','red-side']},

  {id:'mid-blue-inner',point:{x:330,y:735},tags:['lane','mid','blue-side']},
  {id:'mid-blue-river',point:{x:560,y:620},tags:['lane','mid','river']},
  {id:'mid-center',point:{x:800,y:500},tags:['lane','mid','river']},
  {id:'mid-red-river',point:{x:1040,y:380},tags:['lane','mid','river']},
  {id:'mid-red-inner',point:{x:1270,y:265},tags:['lane','mid','red-side']},

  {id:'bottom-blue-inner',point:{x:190,y:790},tags:['lane','bottom','blue-side']},
  {id:'bottom-blue-outer',point:{x:360,y:850},tags:['lane','bottom','blue-side']},
  {id:'bottom-river',point:{x:840,y:850},tags:['lane','bottom','river']},
  {id:'bottom-red-outer',point:{x:1440,y:740},tags:['lane','bottom','red-side']},
  {id:'bottom-red-inner',point:{x:1450,y:350},tags:['lane','bottom','red-side']},

  {id:'blue-jungle-top',point:{x:390,y:500},tags:['jungle','blue-side']},
  {id:'blue-jungle-bottom',point:{x:470,y:760},tags:['jungle','blue-side']},
  {id:'red-jungle-top',point:{x:1130,y:240},tags:['jungle','red-side']},
  {id:'red-jungle-bottom',point:{x:1210,y:500},tags:['jungle','red-side']},
  {id:'river-north',point:{x:650,y:360},tags:['river']},
  {id:'river-south',point:{x:950,y:640},tags:['river']},
];

const laneEdges:NavigationEdge[]=(Object.values(BATTLEFIELD_LANE_NODES) as readonly (readonly string[])[])
  .flatMap(route=>route.slice(0,-1).map((id,index)=>[id,route[index+1]] as const));

const connectorEdges:NavigationEdge[]=[
  ['top-blue-inner','blue-jungle-top'],
  ['mid-blue-river','blue-jungle-top'],
  ['mid-blue-inner','blue-jungle-bottom'],
  ['bottom-blue-inner','blue-jungle-bottom'],
  ['blue-jungle-top','blue-jungle-bottom'],
  ['top-river','river-north'],
  ['mid-blue-river','river-north'],
  ['river-north','mid-center'],
  ['mid-center','river-south'],
  ['river-south','mid-red-river'],
  ['river-south','bottom-river'],
  ['top-red-inner','red-jungle-top'],
  ['mid-red-river','red-jungle-top'],
  ['mid-red-inner','red-jungle-bottom'],
  ['bottom-red-inner','red-jungle-bottom'],
  ['red-jungle-top','red-jungle-bottom'],
];

export const BATTLEFIELD_NAVIGATION=new NavigationGraph(nodes,[...laneEdges,...connectorEdges]);

export function battlefieldLaneRoute(lane:LaneId,team:NavigationTeam='blue'):Point[]{
  const ids=team==='blue'?[...BATTLEFIELD_LANE_NODES[lane]]:[...BATTLEFIELD_LANE_NODES[lane]].reverse();
  return ids.map(id=>BATTLEFIELD_NAVIGATION.node(id).point);
}

// Existing one-lane match uses the same polyline API. Keeping this route separate
// lets the full map arrive without changing proven prototype coordinates first.
export const PROTOTYPE_MID_ROUTE:readonly Point[]=[
  {x:100,y:500},
  {x:440,y:500},
  {x:800,y:500},
  {x:1160,y:500},
  {x:1500,y:500},
];

export function routeForTeam(route:readonly Point[],team:NavigationTeam):Point[]{
  const points=route.map(clonePoint);
  return team==='blue'?points:points.reverse();
}

export function routeLength(route:readonly Point[]):number{
  let total=0;
  for(let i=1;i<route.length;i++)total+=distance(route[i-1],route[i]);
  return total;
}

export function projectToRoute(route:readonly Point[],point:Point):RouteProjection{
  if(route.length<2)throw new Error('route requires at least two points');
  let best:RouteProjection|null=null;
  let walked=0;
  for(let i=0;i<route.length-1;i++){
    const a=route[i],b=route[i+1],dx=b.x-a.x,dy=b.y-a.y;
    const length=Math.hypot(dx,dy);
    if(length<=1e-8)continue;
    const ux=dx/length,uy=dy/length;
    const along=Math.max(0,Math.min(length,(point.x-a.x)*ux+(point.y-a.y)*uy));
    const projected={x:a.x+ux*along,y:a.y+uy*along};
    const lateral=(point.x-projected.x)*(-uy)+(point.y-projected.y)*ux;
    const candidate:RouteProjection={distance:walked+along,point:projected,lateral,segment:i};
    if(!best||distance(point,projected)<distance(point,best.point))best=candidate;
    walked+=length;
  }
  if(!best)throw new Error('route has no usable segment');
  return {...best,point:clonePoint(best.point)};
}

export function pointAtRouteDistance(route:readonly Point[],travelled:number,lateral=0):Point{
  if(route.length<2)throw new Error('route requires at least two points');
  const total=routeLength(route);
  let remaining=Math.max(0,Math.min(total,travelled));
  for(let i=0;i<route.length-1;i++){
    const a=route[i],b=route[i+1],dx=b.x-a.x,dy=b.y-a.y;
    const length=Math.hypot(dx,dy);
    if(length<=1e-8)continue;
    if(remaining<=length||i===route.length-2){
      const t=Math.max(0,Math.min(1,remaining/length));
      const x=a.x+dx*t,y=a.y+dy*t;
      const nx=-dy/length,ny=dx/length;
      return {x:x+nx*lateral,y:y+ny*lateral};
    }
    remaining-=length;
  }
  return clonePoint(route[route.length-1]);
}

export function routeProgress(route:readonly Point[],team:NavigationTeam,point:Point):number{
  return projectToRoute(routeForTeam(route,team),point).distance;
}

export function pointOnRoute(route:readonly Point[],team:NavigationTeam,travelled:number,lateral=0):Point{
  return pointAtRouteDistance(routeForTeam(route,team),travelled,lateral);
}

export function advanceOnRoute(route:readonly Point[],team:NavigationTeam,point:Point,advance:number,preserveLateral=true):Point{
  const ordered=routeForTeam(route,team);
  const projected=projectToRoute(ordered,point);
  return pointAtRouteDistance(ordered,projected.distance+advance,preserveLateral?projected.lateral:0);
}
