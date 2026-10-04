import type Phaser from 'phaser';
import type { Point } from '../game/config.ts';
import { ASSETS, clipFor } from './assets.ts';
import type { AssetCatalog, SpriteDefinition, Motion } from './assets.ts';

type VisualObject={sprite:Phaser.GameObjects.Sprite;definition:SpriteDefinition;clip?:string;seen:boolean;retiring?:number;id:string;angle:number};
/** Owns only visual objects. Never issues commands or writes combat state. */
export class VisualDirector {
  private scene:Phaser.Scene;
  private catalog:AssetCatalog;
  private objects=new Map<object|string,VisualObject>();
  private effects:{sprite:Phaser.GameObjects.Sprite;remaining:number;duration:number;fade:boolean}[]=[];
  private frozen=false;
  constructor(scene:Phaser.Scene,catalog:AssetCatalog=ASSETS){this.scene=scene;this.catalog=catalog;}
  static preload(scene:Phaser.Scene,catalog:AssetCatalog=ASSETS){
    for(const [key,asset] of Object.entries(catalog.textures)){
      if(asset.type==='image')scene.load.image(key,asset.url);
      else if(asset.type==='atlas')scene.load.atlas(key,asset.url,asset.dataUrl);
      else scene.load.spritesheet(key,asset.url,{frameWidth:asset.frameWidth,frameHeight:asset.frameHeight});
    }
  }
  private available(def?:SpriteDefinition):def is SpriteDefinition {
    return !!def&&this.scene.textures.exists(def.texture)&&(def.frame===undefined||this.scene.textures.get(def.texture).has(String(def.frame)));
  }
  private apply(sprite:Phaser.GameObjects.Sprite,def:SpriteDefinition,point:Point,angle:number){
    sprite.setPosition(point.x+(def.offset?.x??0),point.y+(def.offset?.y??0));
    sprite.setScale(def.scale??1).setOrigin(...(def.origin??[.5,.5] as [number,number]));
    if(def.tint!==undefined)sprite.setTint(def.tint);
    if(def.rotate)sprite.setRotation(angle);
    else sprite.setFlipX(!Object.keys(def.clips??{}).some(k=>k.includes(':'))&&Math.cos(angle)<0);
  }
  private play(sprite:Phaser.GameObjects.Sprite,id:string,def:SpriteDefinition,motion:Motion,angle:number){
    const clip=clipFor(def,motion,angle),spec=clip&&def.clips?.[clip];
    if(!clip||!spec||spec.fps<=0||!spec.frames.length||!spec.frames.every(f=>this.scene.textures.get(def.texture).has(String(f))))return undefined;
    const key=`visual:${id}:${clip}`;
    if(!this.scene.anims.exists(key))this.scene.anims.create({key,frames:spec.frames.map(frame=>({key:def.texture,frame})),frameRate:spec.fps,repeat:spec.loop?-1:0});
    // Do not restart a finished one-shot every frame (especially death).
    if(sprite.getData('clip')!==key){sprite.play(key);sprite.setData('clip',key);}
    if(this.frozen)sprite.anims.pause();
    return key;
  }
  clipDuration(id:string,motion:Motion,angle=0){
    const def=this.catalog.sprites[id];if(!def)return .3;
    const key=clipFor(def,motion,angle),clip=key&&def.clips?.[key];
    return clip&&clip.fps>0?clip.frames.length/clip.fps:.3;
  }
  begin(){for(const object of this.objects.values())object.seen=false;}
  draw(key:object|string,id:string,point:Point,motion:Motion='idle',angle=0,depth=4.5){
    const def=this.catalog.sprites[id];if(!this.available(def))return false;
    let object=this.objects.get(key);
    if(object&&object.definition!==def){object.sprite.destroy();this.objects.delete(key);object=undefined;}
    if(!object){object={sprite:this.scene.add.sprite(point.x,point.y,def.texture,def.frame).setDepth(4.5),definition:def,seen:true,id,angle};this.objects.set(key,object);}
    object.seen=true;object.retiring=undefined;object.angle=angle;object.sprite.setDepth(depth);this.apply(object.sprite,def,point,angle);
    const clip=this.frozen?object.clip:this.play(object.sprite,id,def,motion,angle);
    if(!clip&&object.clip){object.sprite.stop();object.sprite.setData('clip',null);object.sprite.setTexture(def.texture,def.frame);}
    object.clip=clip;
    return true;
  }
  effect(id:string,point:Point,angle=0){
    const def=this.catalog.effects[id];if(!this.available(def)||def.duration<=0)return false;
    const sprite=this.scene.add.sprite(point.x,point.y,def.texture,def.frame).setDepth(6);
    this.apply(sprite,def,point,angle);this.play(sprite,`effect:${id}`,def,'cast',angle);
    this.effects.push({sprite,remaining:def.duration,duration:def.duration,fade:def.fade??false});return true;
  }
  setPaused(value:boolean){
    if(this.frozen===value)return;this.frozen=value;
    for(const sprite of [...this.objects.values()].map(o=>o.sprite).concat(this.effects.map(e=>e.sprite)))value?sprite.anims.pause():sprite.anims.resume();
  }
  end(dt:number){
    for(const [key,object] of this.objects)if(!object.seen){
      const death=clipFor(object.definition,'death',object.angle);
      if(object.retiring===undefined&&death?.startsWith('death')){
        object.retiring=this.clipDuration(object.id,'death',object.angle);
        this.play(object.sprite,object.id,object.definition,'death',object.angle);
      }
      if(object.retiring!==undefined&&!this.frozen)object.retiring-=dt;
      if(object.retiring===undefined||object.retiring<=0){object.sprite.destroy();this.objects.delete(key);}
    }
    if(this.frozen)return;
    this.effects=this.effects.filter(effect=>{effect.remaining-=dt;if(effect.remaining<=0){effect.sprite.destroy();return false;}if(effect.fade)effect.sprite.setAlpha(effect.remaining/effect.duration);return true;});
  }
  clear(){for(const object of this.objects.values())object.sprite.destroy();for(const effect of this.effects)effect.sprite.destroy();this.objects.clear();this.effects=[];}
  get counts(){return {sprites:this.objects.size,effects:this.effects.length};}
}
