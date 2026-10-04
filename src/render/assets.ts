/** Rendering-only asset catalog. World positions, ranges and hitboxes stay in game/. */
export type Motion='idle'|'walk'|'attack'|'cast'|'hurt'|'recall'|'death';
export type Direction='e'|'se'|'s'|'sw'|'w'|'nw'|'n'|'ne';
export type ClipKey=Motion|`${Motion}:${Direction}`;
export type TextureSource=
  |{type:'image';url:string}
  |{type:'sheet';url:string;frameWidth:number;frameHeight:number}
  |{type:'atlas';url:string;dataUrl:string};
export type Clip={frames:(string|number)[];fps:number;loop?:boolean};
export type SpriteDefinition={
  texture:string;frame?:string|number;scale?:number;origin?:[number,number];
  offset?:{x:number;y:number};rotate?:boolean;tint?:number;
  clips?:Partial<Record<ClipKey,Clip>>;
};
export type EffectDefinition=SpriteDefinition & {duration:number;fade?:boolean};
export type AssetCatalog={textures:Record<string,TextureSource>;sprites:Record<string,SpriteDefinition>;effects:Record<string,EffectDefinition>;icons:Record<string,string>};

// Add licensed production files under public/assets and register them here.
// Missing or failed resources retain the procedural placeholder.
export const ASSETS:AssetCatalog={textures:{},sprites:{},effects:{},icons:{}};
export const actorVisual=(id:string)=>`champion.${id}`;
export const skillVisual=(kit:string,slot:string)=>`skill.${kit}.${slot}`;
export function directionFor(angle:number):Direction {
  const directions:Direction[]=['e','se','s','sw','w','nw','n','ne'];
  return directions[(Math.round(angle/(Math.PI/4))+8)%8];
}
export function clipFor(def:SpriteDefinition,motion:Motion,angle:number):ClipKey|undefined {
  const directional:ClipKey=`${motion}:${directionFor(angle)}`;
  return def.clips?.[directional]?directional:def.clips?.[motion]?motion:def.clips?.idle?'idle':undefined;
}
export function motionFor(state:{alive:boolean;moving:boolean;attacking:boolean;casting:boolean;hurt:boolean;recalling:boolean}):Motion {
  if(!state.alive)return'death';if(state.hurt)return'hurt';if(state.casting)return'cast';
  if(state.attacking)return'attack';if(state.recalling)return'recall';return state.moving?'walk':'idle';
}
