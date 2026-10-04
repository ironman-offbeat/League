import Phaser from 'phaser';
import type { SkillSlot } from './skillConfig.ts';
import { SKILLS } from './skillConfig.ts';
import { Squad } from './Squad.ts';
import { RULES, distance } from './config.ts';
import type { Point } from './config.ts';

export class ArenaScene extends Phaser.Scene {
  squad = new Squad(true);
  get combat() { return this.squad.selected; }
  selectChampion(index: number, center = true) {
    this.cancelGesture();
    if (this.squad.select(index) && center) this.centerHero();
  }
  paused = false;
  aimSlot:SkillSlot|null=null;
  get armed(){return this.aimSlot!==null;}
  armSkill(slot:SkillSlot){const active=this.aimSlot===slot;this.cancelGesture();if(!active)this.aimSlot=slot;}
  onFrame: (scene: ArenaScene) => void = () => {};
  notify: (text: string) => void = () => {};
  private accumulator = 0;
  private actors!: Phaser.GameObjects.Graphics;
  private guide!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private gesture: { mode: 'hero' | 'pan' | 'dash'; start: Point; world: Point; camera: Point; pointer: number } | null = null;
  private aim: Point | null = null;
  constructor() { super('arena'); }
  create() {
    this.drawMap();
    this.actors = this.add.graphics().setDepth(5);
    this.guide = this.add.graphics().setDepth(6);
    this.labels = this.combat.enemies.map(() => this.add.text(0,0,'훈련 대상',{fontFamily:'Malgun Gothic, sans-serif',fontSize:'11px',color:'#d3bda7',backgroundColor:'#18241dc0',padding:{x:5,y:3}}).setOrigin(.5).setDepth(7));
    this.cameras.main.setBounds(0,0,RULES.world.width,RULES.world.height);
    this.centerHero();
    this.scale.on('resize',this.centerHero,this);
    this.input.on('pointerdown',(p: Phaser.Input.Pointer) => {
      if (this.paused || this.gesture) return;
      const world = this.cameras.main.getWorldPoint(p.x,p.y);
      const hit = this.squad.members.findIndex(c => distance(world,c.hero) < 36);
      if (!this.armed && hit >= 0) this.selectChampion(hit, false);
      const mode = this.armed ? 'dash' : distance(world,this.combat.hero) < 43 ? 'hero' : 'pan';
      this.gesture = {mode,start:{x:p.x,y:p.y},world,camera:{x:this.cameras.main.scrollX,y:this.cameras.main.scrollY},pointer:p.id};
      this.aim = world;
    });
    this.input.on('pointermove',(p: Phaser.Input.Pointer) => {
      if (this.paused) return;
      this.aim = this.cameras.main.getWorldPoint(p.x,p.y);
      if (this.gesture?.pointer === p.id && this.gesture.mode === 'pan' && p.isDown) {
        this.cameras.main.setScroll(this.gesture.camera.x-(p.x-this.gesture.start.x),this.gesture.camera.y-(p.y-this.gesture.start.y));
      }
    });
    this.input.on('pointerup',(p: Phaser.Input.Pointer) => this.release(p));
    this.input.on('pointerupoutside',(p: Phaser.Input.Pointer) => {
      // HUD releases also reach Phaser. Only cancel gestures begun on this canvas;
      // otherwise releasing E immediately erases the aim state set by the HUD.
      if (this.gesture?.pointer === p.id) this.cancelGesture();
    });
    this.input.keyboard?.on('keydown-ESC',() => this.cancelGesture());
    this.game.events.emit('arena-ready',this);
  }
  setPaused(value: boolean) { this.paused=value; this.accumulator=0; this.cancelGesture(); this.onFrame(this); }
  cancelGesture() { this.gesture=null; this.aimSlot=null; this.aim=null; }
  centerHero() { this.cameras.main.centerOn(this.combat.hero.x+100,this.combat.hero.y-25); }
  restartTraining() { this.squad=new Squad(this.squad.retaliation); this.accumulator=0; this.cancelGesture(); this.centerHero(); this.notify('연습장을 초기화했습니다.'); }
  dashToScreen(x: number,y: number,slot:SkillSlot='manual') {
    const rect = this.game.canvas.getBoundingClientRect();
    if (x<rect.left || x>rect.right || y<rect.top || y>rect.bottom || this.paused) { this.cancelGesture(); return; }
    const p=this.cameras.main.getWorldPoint((x-rect.left)*this.scale.width/rect.width,(y-rect.top)*this.scale.height/rect.height);
    this.doDash(p,slot);
  }
  private doDash(point: Point,slot:SkillSlot=this.aimSlot??'manual') {
    this.aimSlot=null;
    this.notify(this.combat.castSkill(slot,point)?`${this.combat.abilities.presentation(slot).name} 사용`:'마나·상태·재사용 대기시간을 확인하세요.');
  }
  private release(p: Phaser.Input.Pointer) {
    const gesture=this.gesture;
    if (!gesture || gesture.pointer!==p.id || this.paused) return;
    this.gesture=null;
    const point=this.cameras.main.getWorldPoint(p.x,p.y);
    if (gesture.mode==='dash') { this.doDash(point); return; }
    if (gesture.mode==='pan') return;
    if (distance(gesture.start,{x:p.x,y:p.y})<8) { this.notify('선택됨 · 지면이나 적에게 끌어 명령을 내리세요.'); return; }
    const enemy=this.combat.enemies.find(e=>e.alive&&this.combat.canSee(e)&&distance(e,point)<40);
    if (enemy) { if(this.combat.attack(enemy.id)) this.notify('직접 공격 · 전진 한계를 넘어 대상을 추격합니다.'); }
    else if(this.combat.move(point)) this.notify('이동 명령 · 추격을 취소하고 목적지로 이동합니다.');
  }
  update(_time: number,delta: number) {
    if (!this.actors) return;
    if (!this.paused) {
      this.accumulator+=Math.min(delta/1000,.1);
      while(this.accumulator>=RULES.step) {this.squad.step(RULES.step);this.accumulator-=RULES.step;}
    }
    this.renderActors();
    this.renderGuide();
    for(const event of this.squad.members.flatMap(c => c.events.splice(0))) {
      if(event.kind==='damage'||event.kind==='heal') {
        const text=this.add.text(event.point.x,event.point.y,`${event.kind==='heal'?'+':''}${Math.round(event.amount??0)}`,{fontFamily:'Georgia,serif',fontSize:'20px',color:event.kind==='heal'?'#93eaaa':'#f1d8a3',stroke:'#1b241f',strokeThickness:3}).setOrigin(.5).setDepth(10);
        this.tweens.add({targets:text,y:text.y-35,alpha:0,duration:700,onComplete:()=>text.destroy()});
      } else if(event.kind==='slash'||event.kind==='ultimate') {
        const ring=this.add.circle(event.point.x,event.point.y,25,0xd1ba72,.08).setStrokeStyle(3,0xe0c780,.75).setDepth(6);
        this.tweens.add({targets:ring,scale:4,alpha:0,duration:450,onComplete:()=>ring.destroy()});
      }
    }
    this.tweens.timeScale=this.paused?0:1;
    this.onFrame(this);
  }
  private renderActors() {
    const g=this.actors;g.clear();
    this.combat.enemies.forEach((e,i)=>{
      const label=this.labels[i];label.setVisible(this.combat.canSee(e));if(!this.combat.canSee(e))return;label.setPosition(e.x,e.y-69);
      label.setText(e.alive?(e.stunned>0?'기절':e.rooted>0?'속박':e.slowRemaining>0?'둔화':e.marked>0?'저주':'훈련 대상'): `${Math.max(1,Math.ceil(e.respawn))}초 후 재생성`);
      g.fillStyle(0x101e1a,.5);g.fillEllipse(e.x+3,e.y+18,57,23);
      if(!e.alive){g.lineStyle(1,0x7e6e54,.5);g.strokeCircle(e.x,e.y,20);return;}
      g.lineStyle(5,0x6c5040);g.lineBetween(e.x,e.y-20,e.x,e.y+25);g.lineBetween(e.x-23,e.y-7,e.x+23,e.y-7);
      g.fillStyle(0x8d5145);g.fillCircle(e.x,e.y-7,19);g.lineStyle(3,0xc09365);g.strokeCircle(e.x,e.y-7,19);g.lineStyle(2,0xdeb77a);g.strokeCircle(e.x,e.y-7,10);
      g.fillStyle(0xc79868);g.fillCircle(e.x,e.y-7,3);
      g.fillStyle(0x101a18);g.fillRoundedRect(e.x-31,e.y-48,62,7,2);g.fillStyle(0xc17b67);g.fillRect(e.x-30,e.y-47,60*(e.hp/e.maxHp),5);
      if(this.combat.command.kind==='attack'&&this.combat.command.targetId===e.id){g.lineStyle(2,0xefb47d,.9);g.strokeCircle(e.x,e.y,33);}
    });
    for(const attack of this.squad.counterattacks.values()){
      const p=attack.pet??attack.actor.hero;
      g.lineStyle(2,0xef856b,.65);g.lineBetween(attack.enemy.x,attack.enemy.y,p.x,p.y);g.strokeCircle(p.x,p.y,29);
    }
    for (const member of this.squad.members) {
      const a=member.abilities;
      for(const m of a.missiles){g.fillStyle(member.profile.color);g.fillCircle(m.point.x,m.point.y,m.kind==='arrow'?10:6);}
      if(a.scout){g.lineStyle(2,0x86c9ec,.6);g.strokeCircle(a.scout.x,a.scout.y,SKILLS.frost.scout.radius);}
      if(a.pet){const p=a.pet;g.fillStyle(0xa47258);g.fillRoundedRect(p.x-22,p.y-24,44,46,12);g.fillCircle(p.x-16,p.y-24,10);g.fillCircle(p.x+16,p.y-24,10);g.fillStyle(0xffd491);g.fillCircle(p.x-8,p.y-10,3);g.fillCircle(p.x+8,p.y-10,3);g.fillStyle(0x89cca0);g.fillRect(p.x-22,p.y-40,44*p.hp/SKILLS.flame.pet.hp,4);}
      if(a.aura){g.lineStyle(2,0x88b99d,.6);g.strokeCircle(member.hero.x,member.hero.y,SKILLS.curse.aura.range);}

      for (const p of member.projectiles) { g.fillStyle(member.profile.color); g.fillCircle(p.x,p.y,5); }
    }
    for (const c of this.squad.members) {
    const h=c.hero;
    if(!c.alive){g.lineStyle(2,0x8c8a83,.6);g.strokeCircle(h.x,h.y,23);continue;}
    if(h.shield>0){g.lineStyle(3,0x88cbed,.8);g.strokeCircle(h.x,h.y,34);}
    g.fillStyle(0x0b1915,.6);g.fillEllipse(h.x+4,h.y+24,63,26);
    if(c.ultimateRemaining>0){g.fillStyle(0xdaa549,.09);g.fillCircle(h.x,h.y,RULES.ultimate.range);g.lineStyle(1,0xdaba64,.45);g.strokeCircle(h.x,h.y,49);}
    if(c===this.combat){g.lineStyle(2,0x81d8b0,.85);g.strokeEllipse(h.x,h.y+7,64,48);}
    const size=c.ultimateRemaining>0?1.2:1;
    g.save();g.translateCanvas(h.x,h.y);g.rotateCanvas(h.facing);g.scaleCanvas(size,size);
    if (c.profile.kit === 'fury') {
    g.fillStyle(0x456d53);g.fillTriangle(-12,-12,-42,0,-12,10);
    g.fillStyle(0x628564);g.fillEllipse(0,0,42,34);g.lineStyle(2,0xa6b77c);g.strokeEllipse(0,0,42,34);
    g.fillStyle(0x9ca774);g.fillRoundedRect(9,-9,25,18,5);g.fillStyle(0xe9db90);g.fillCircle(13,-8,3);g.fillCircle(13,8,3);
    g.lineStyle(5,0xa79865);g.lineBetween(-2,18,22,31);g.lineStyle(7,0xd1c397);g.beginPath();g.arc(22,15,23,.2,1.9);g.strokePath();
    } else {
      g.fillStyle(c.profile.color);g.fillCircle(0,0,22);
      g.lineStyle(3,0xe6e2bd);g.strokeCircle(0,0,22);g.lineBetween(4,0,32,0);
      g.fillStyle(0x243d35);g.fillCircle(8,-7,3);g.fillCircle(8,7,3);
    }
    if(c.pending){g.lineStyle(3,0xf1d28b,.8);g.beginPath();g.arc(0,0,49,-.7,.7);g.strokePath();}
    g.restore();
    g.fillStyle(0x10251e);g.fillRect(h.x-29,h.y-43,58,6);g.fillStyle(0x89cca0);g.fillRect(h.x-28,h.y-42,56*h.hp/h.maxHp,4);
    if(c.command.kind==='recall'){g.lineStyle(3,0x83ced2,.8);g.strokeCircle(h.x,h.y,42+Math.sin(c.elapsed*6)*4);}
    }
  }
  private renderGuide() {
    const g=this.guide;g.clear();
    const h=this.combat.hero;const a=this.combat.anchor;
    g.lineStyle(1,0xc6b977,.2);g.strokeCircle(a.x,a.y,RULES.hero.anchorRadius);
    g.lineStyle(1,0xe4cb80,.5);g.strokeCircle(a.x,a.y,7);
    if(this.combat.command.kind==='move'||this.combat.command.kind==='return'){g.lineStyle(2,0x96d8ad,.45);g.lineBetween(h.x,h.y,a.x,a.y);g.strokeCircle(a.x,a.y,13);}
    if((this.gesture?.mode==='hero'||this.gesture?.mode==='dash'||this.armed)&&this.aim){g.lineStyle(2,this.armed?0xf2d185:0xa1dfc1,.9);g.lineBetween(h.x,h.y,this.aim.x,this.aim.y);g.strokeCircle(this.aim.x,this.aim.y,16);}
    if(this.armed){g.lineStyle(1,0xe3ca89,.5);g.strokeCircle(h.x,h.y,this.combat.abilities.presentation(this.aimSlot??'manual').range);}
  }
  private drawMap() {
    const g=this.add.graphics();const w=RULES.world.width,h=RULES.world.height;
    g.fillStyle(0x263d32);g.fillRect(0,0,w,h);
    let seed=1294;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<1600;i++){const x=rand()*w,y=rand()*h;g.fillStyle([0x496247,0x334d3b,0x69805a][i%3],.18);g.fillEllipse(x,y,4+rand()*15,2+rand()*5);}
    // Broad worn training lane, paved with irregular inset stones.
    g.lineStyle(190,0x4a5140,.8);g.lineBetween(240,790,1310,290);g.lineStyle(152,0x646651,.35);g.lineBetween(240,790,1310,290);
    for(let i=0;i<160;i++){const t=rand(),offset=(rand()-.5)*115;const x=240+t*1070+offset*.42,y=790-t*500+offset;g.fillStyle(i%2?0x879078:0x737c66,.22);g.fillRoundedRect(x,y,18+rand()*25,8+rand()*12,3);}
    g.lineStyle(2,0x879778,.25);g.strokeCircle(760,530,205);g.strokeCircle(760,530,212);
    // Spawn platform.
    g.fillStyle(0x3a5750);g.fillCircle(RULES.spawn.x,RULES.spawn.y,72);g.lineStyle(3,0x7d9b79,.8);g.strokeCircle(RULES.spawn.x,RULES.spawn.y,66);g.lineStyle(1,0xb3c291,.5);g.strokeCircle(RULES.spawn.x,RULES.spawn.y,56);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;g.lineBetween(RULES.spawn.x+Math.cos(a)*57,RULES.spawn.y+Math.sin(a)*57,RULES.spawn.x+Math.cos(a)*65,RULES.spawn.y+Math.sin(a)*65);}
    // Decorative foliage stays outside the walkable training lane.
    for(let i=0;i<90;i++){const x=60+rand()*(w-120),y=40+rand()*(h-80);if(y>245&&y<820&&x>260&&x<1260)continue;const r=20+rand()*25;g.fillStyle(0x10291f,.5);g.fillEllipse(x+8,y+r*.6,r*2.1,r);g.fillStyle(0x193c2b);g.fillCircle(x,y,r);g.fillStyle(0x28513a);g.fillCircle(x-5,y-8,r*.75);g.fillStyle(0x416249,.6);g.fillCircle(x-8,y-12,r*.4);}
    for(const p of [{x:330,y:400},{x:1100,y:640},{x:920,y:260}]){g.fillStyle(0x15281f,.6);g.fillEllipse(p.x+8,p.y+20,70,28);g.fillStyle(0x576958);g.fillRoundedRect(p.x-27,p.y-10,54,35,10);g.fillStyle(0x839076,.6);g.fillRoundedRect(p.x-20,p.y-11,32,14,5);}
    this.add.text(760,790,'T R A I N I N G   G R O U N D S',{fontFamily:'Georgia,serif',fontSize:'16px',color:'#a0aa80'}).setOrigin(.5).setAlpha(.5);
  }
}
