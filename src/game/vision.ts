import type { Point } from './config.ts';

export type VisionTeam = 'blue' | 'red';
export type Bush = { id:string; x:number; y:number; width:number; height:number };
export type VisionSource = Point & { team:VisionTeam; radius:number; alive:boolean; revealsBush?:boolean };
export type VisionSubject = Point & { id:string; team:VisionTeam; generation:number; alive:boolean; exposed?:boolean };
export type Sighting = Point & { generation:number; seenAt:number };
export type TerrainVisibility = 'unexplored' | 'remembered' | 'visible';

// Independent of rendering and combat clocks. Call update once per simulation step.
// Ranges and bush layout belong to the caller's map configuration.
export class TeamVision {
  readonly width:number;
  readonly height:number;
  readonly cellSize:number;
  private bushes:Bush[];
  private sources:VisionSource[]=[];
  private explored:Record<VisionTeam,Set<number>>={blue:new Set(),red:new Set()};
  private exploredSamples:Record<VisionTeam,Set<string>>={blue:new Set(),red:new Set()};
  private sightings:Record<VisionTeam,Map<string,Sighting>>={blue:new Map(),red:new Map()};
  private knownSubjects=new Set<string>();
  private visibleSubjects:Record<VisionTeam,Set<string>>={blue:new Set(),red:new Set()};
  private columns:number;
  constructor(width:number,height:number,bushes:readonly Bush[]=[],cellSize=40){
    if(!Number.isFinite(width)||!Number.isFinite(height)||!Number.isFinite(cellSize)||width<=0||height<=0||cellSize<=0)
      throw new Error('Vision map dimensions must be positive finite numbers');
    const ids=new Set<string>();
    for(const b of bushes){
      if(!b.id||ids.has(b.id)||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<=0||b.height<=0)
        throw new Error('Bushes need unique IDs and finite positive dimensions');
      ids.add(b.id);
    }
    this.width=width;this.height=height;this.cellSize=cellSize;this.columns=Math.ceil(width/cellSize);
    this.bushes=bushes.map(b=>({...b}));
  }
  private inside(p:Point){return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<this.width&&p.y<this.height;}
  private cell(p:Point){return Math.floor(p.y/this.cellSize)*this.columns+Math.floor(p.x/this.cellSize);}
  private covers(source:VisionSource,p:Point){return (source.x-p.x)**2+(source.y-p.y)**2<=source.radius**2;}
  bushAt(p:Point):string|null{
    return this.bushes.find(b=>p.x>=b.x&&p.x<b.x+b.width&&p.y>=b.y&&p.y<b.y+b.height)?.id??null;
  }
  pointVisible(team:VisionTeam,p:Point){
    return this.inside(p)&&this.sources.some(s=>s.team===team&&this.covers(s,p));
  }
  private subjectKey(subject:VisionSubject){return `${subject.id}:${subject.generation}:${subject.team}:${subject.alive?1:0}:${subject.exposed?1:0}:${subject.x}:${subject.y}`;}
  private detects(team:VisionTeam,subject:VisionSubject){
    if(!subject.alive||!this.inside(subject))return false;
    if(subject.team===team)return true;
    const bush=this.bushAt(subject);
    return this.sources.some(s=>s.team===team&&this.covers(s,subject)&&
      (!bush||subject.exposed||s.revealsBush||this.bushAt(s)===bush));
  }
  canSee(team:VisionTeam,subject:VisionSubject){
    if(!subject.alive||!this.inside(subject))return false;
    if(subject.team===team)return true;
    const key=this.subjectKey(subject);
    return this.knownSubjects.has(key)?this.visibleSubjects[team].has(key):this.detects(team,subject);
  }
  terrain(team:VisionTeam,p:Point):TerrainVisibility{
    if(!this.inside(p))return 'unexplored';
    if(this.pointVisible(team,p))return 'visible';
    return this.explored[team].has(this.cell(p))?'remembered':'unexplored';
  }
  // A copy prevents callers from moving a last-seen marker with a live entity.
  lastSeen(team:VisionTeam,id:string):Sighting|null{
    const value=this.sightings[team].get(id);
    return value?{...value}:null;
  }
  update(sources:readonly VisionSource[],subjects:readonly VisionSubject[],time:number){
    if(!Number.isFinite(time)||time<0)throw new Error('Vision time must be finite and nonnegative');
    this.sources=sources.filter(s=>s.alive&&Number.isFinite(s.x)&&Number.isFinite(s.y)&&Number.isFinite(s.radius)&&s.radius>=0).map(s=>({...s}));
    // Explored terrain is monotonic. Quantize source positions so long fixed-step
    // matches do not recompute the same cells thousands of times while live
    // visibility still uses the exact source positions above.
    const sampleSize=this.cellSize/4;
    for(const source of this.sources){
      const key=`${Math.floor(source.x/sampleSize)}:${Math.floor(source.y/sampleSize)}:${source.radius}`;
      if(this.exploredSamples[source.team].has(key))continue;
      this.exploredSamples[source.team].add(key);
      const minX=Math.max(0,Math.floor((source.x-source.radius)/this.cellSize));
      const maxX=Math.min(this.columns-1,Math.floor((source.x+source.radius)/this.cellSize));
      const minY=Math.max(0,Math.floor((source.y-source.radius)/this.cellSize));
      const maxY=Math.min(Math.ceil(this.height/this.cellSize)-1,Math.floor((source.y+source.radius)/this.cellSize));
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const center={x:Math.min(this.width-.001,(x+.5)*this.cellSize),y:Math.min(this.height-.001,(y+.5)*this.cellSize)};
        if(this.covers(source,center))this.explored[source.team].add(y*this.columns+x);
      }
    }
    this.knownSubjects.clear();this.visibleSubjects.blue.clear();this.visibleSubjects.red.clear();
    for(const subject of subjects)this.knownSubjects.add(this.subjectKey(subject));
    for(const team of ['blue','red'] as const)for(const subject of subjects){
      if(subject.team===team)continue;
      const visible=this.detects(team,subject),key=this.subjectKey(subject);
      if(visible){this.visibleSubjects[team].add(key);this.sightings[team].set(subject.id,{x:subject.x,y:subject.y,generation:subject.generation,seenAt:time});}
      // Hidden death/respawn must not update or erase the opponent's memory.
      else if(!subject.alive&&this.detects(team,{...subject,alive:true}))this.sightings[team].delete(subject.id);
    }
  }
  reset(){this.sources=[];this.knownSubjects.clear();for(const team of ['blue','red'] as const){this.explored[team].clear();this.exploredSamples[team].clear();this.sightings[team].clear();this.visibleSubjects[team].clear();}}
}
