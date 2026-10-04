import test from 'node:test';
import assert from 'node:assert/strict';
import { motionFor, directionFor, clipFor } from '../src/render/assets.ts';
import type { AssetCatalog } from '../src/render/assets.ts';
import { VisualDirector } from '../src/render/VisualDirector.ts';

// A rendering backend double checks resource lifetime without importing Phaser into game simulation.
function fixture(){
 const made:any[]=[];const animations=new Set<string>();
 const scene:any={textures:{exists:(key:string)=>key==='hero',get:()=>({has:(frame:string)=>['0','1','2','3'].includes(frame)})},
  anims:{exists:(key:string)=>animations.has(key),create:(spec:any)=>animations.add(spec.key)},
  add:{sprite:()=>{const data=new Map(),sprite:any={plays:[],destroyed:false,anims:{pause:()=>{},resume:()=>{}},destroy(){this.destroyed=true;},play(key:string){this.plays.push(key);return this;},getData:(key:string)=>data.get(key),setData(key:string,value:unknown){data.set(key,value);return this;}};
    for(const method of ['setDepth','setPosition','setScale','setOrigin','setTint','setRotation','setFlipX','stop','setFrame','setTexture','setAlpha'])sprite[method]=()=>sprite;
    made.push(sprite);return sprite;}},load:{image:()=>{},atlas:()=>{},spritesheet:()=>{}}};
 const catalog:AssetCatalog={textures:{},icons:{},sprites:{hero:{texture:'hero',clips:{idle:{frames:[0],fps:4,loop:true},walk:{frames:[1,2],fps:4,loop:true},death:{frames:[2,3],fps:4}}}},effects:{hit:{texture:'hero',frame:1,duration:.5,fade:true}}};
 return{director:new VisualDirector(scene,catalog),made,catalog};
}
test('presentation state priority and directional clips are independent of sprite size',()=>{
 assert.equal(motionFor({alive:false,moving:true,attacking:true,casting:true,hurt:true,recalling:false}),'death');
 assert.equal(directionFor(-Math.PI/2),'n');assert.equal(directionFor(Math.PI),'w');
 const def={texture:'hero',scale:20,clips:{walk:{frames:[0],fps:10},'walk:w':{frames:[1],fps:10}}};
 assert.equal(clipFor(def,'walk',Math.PI),'walk:w');assert.equal(clipFor(def,'walk',0),'walk');
});
test('missing texture/frame safely falls back and drawing never mutates world points',()=>{
 const {director,catalog}=fixture();const point=Object.freeze({x:100,y:200});
 assert.equal(director.draw('a','missing',point),false);
 catalog.sprites.broken={texture:'unloaded'};assert.equal(director.draw('a','broken',point),false);
 catalog.sprites.frame={texture:'hero',frame:100};assert.equal(director.draw('a','frame',point),false);
 assert.equal(director.draw('a','hero',point),true);assert.deepEqual(point,{x:100,y:200});
});
test('sprites are reused; pause freezes animation transitions and disappearing units finish death clips',()=>{
 const {director,made}=fixture();
 director.begin();director.draw('a','hero',{x:0,y:0});director.end(.1);
 director.begin();director.draw('a','hero',{x:10,y:0},'walk');director.end(.1);assert.equal(made.length,1);assert.equal(made[0].plays.length,2);
 director.setPaused(true);director.begin();director.draw('a','hero',{x:10,y:0});director.end(5);assert.equal(made[0].plays.length,2);
 director.setPaused(false);director.begin();director.end(.1);assert.equal(director.counts.sprites,1);assert.equal(made[0].plays.at(-1),'visual:hero:death');
 director.begin();director.end(.5);assert.equal(director.counts.sprites,0);assert.equal(made[0].destroyed,true);
});
test('effect clocks pause and clearing a match releases all sprites and effects',()=>{
 const {director,made}=fixture();assert.equal(director.effect('hit',{x:1,y:2}),true);
 director.setPaused(true);director.end(10);assert.equal(director.counts.effects,1);
 director.setPaused(false);director.end(.6);assert.equal(director.counts.effects,0);
 director.draw('hero','hero',{x:1,y:2});director.effect('hit',{x:1,y:2});director.clear();
 assert.deepEqual(director.counts,{sprites:0,effects:0});assert.ok(made.every(s=>s.destroyed));
});
