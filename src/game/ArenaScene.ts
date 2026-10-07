import { VisualDirector } from '../render/VisualDirector.ts';
import { actorVisual, motionFor } from '../render/assets.ts';
import { LaneMatch, LANE } from './LaneMatch.ts';
import { BattlefieldMatch, BATTLEFIELD } from './BattlefieldMatch.ts';
import { BATTLEFIELD_NAVIGATION, battlefieldLaneRoute } from './navigation.ts';
import Phaser from 'phaser';
import type { SkillSlot } from './skillConfig.ts';
import { SKILLS } from './skillConfig.ts';
import { Squad } from './Squad.ts';
import { RULES, distance } from './config.ts';
import type { Point } from './config.ts';

export class ArenaScene extends Phaser.Scene {
  squad:Squad = new Squad(true);
  get match(){return this.squad instanceof LaneMatch?this.squad:null;}
  get battlefield(){return this.squad instanceof BattlefieldMatch?this.squad:null;}
  get session(){return this.match??this.battlefield;}
  get champions(){return this.session?.actors??this.squad.members;}
  get blocked(){return this.paused||!!this.session?.result;}
  private visuals?:VisualDirector;
  private lastPositions=new Map<string,Point>();
  private poses=new Map<string,{kind:'cast'|'hurt';until:number}>();
  get visualCounts(){return this.visuals?.counts??{sprites:0,effects:0};}
  private mapLayer?:Phaser.GameObjects.Container;
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
  private fog!: Phaser.GameObjects.Graphics;
  private guide!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private gesture: { mode: 'hero' | 'pan' | 'dash'; start: Point; world: Point; camera: Point; pointer: number } | null = null;
  private aim: Point | null = null;
  constructor() { super('arena'); }
  preload(){VisualDirector.preload(this);}
  create() {
    this.visuals=new VisualDirector(this);
    this.drawMap();
    this.fog = this.add.graphics().setDepth(4);
    this.actors = this.add.graphics().setDepth(5);
    this.guide = this.add.graphics().setDepth(6);
    this.labels = this.combat.enemies.map(() => this.add.text(0,0,'훈련 대상',{fontFamily:'Malgun Gothic, sans-serif',fontSize:'11px',color:'#d3bda7',backgroundColor:'#18241dc0',padding:{x:5,y:3}}).setOrigin(.5).setDepth(7));
    this.cameras.main.setBounds(0,0,RULES.world.width,RULES.world.height);
    this.centerHero();
    this.scale.on('resize',this.centerHero,this);
    this.input.on('pointerdown',(p: Phaser.Input.Pointer) => {
      if (this.blocked || this.gesture) return;
      const world = this.cameras.main.getWorldPoint(p.x,p.y);
      const hit = this.squad.members.findIndex(c => distance(world,c.hero) < 36);
      if (!this.armed && hit >= 0) this.selectChampion(hit, false);
      const mode = this.armed ? 'dash' : distance(world,this.combat.hero) < 43 ? 'hero' : 'pan';
      this.gesture = {mode,start:{x:p.x,y:p.y},world,camera:{x:this.cameras.main.scrollX,y:this.cameras.main.scrollY},pointer:p.id};
      this.aim = world;
    });
    this.input.on('pointermove',(p: Phaser.Input.Pointer) => {
      if (this.blocked) return;
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
  setPaused(value: boolean) { this.paused=value; this.visuals?.setPaused(this.blocked); this.accumulator=0; this.cancelGesture(); this.onFrame(this); }
  cancelGesture() { this.gesture=null; this.aimSlot=null; this.aim=null; }
  centerHero() { this.cameras.main.centerOn(this.combat.hero.x+100,this.combat.hero.y-25); }
  private replaceSquad(next:Squad,notice:string){
    this.visuals?.clear();this.lastPositions.clear();this.poses.clear();
    this.squad=next;this.accumulator=0;this.cancelGesture();
    this.labels.forEach(label=>label.destroy());
    this.labels=this.combat.enemies.map(()=>this.add.text(0,0,'',{fontFamily:'Malgun Gothic, sans-serif',fontSize:'11px',color:'#e4ddbd',backgroundColor:'#18241dc0',padding:{x:5,y:3}}).setOrigin(.5).setDepth(7));
    this.drawMap();this.centerHero();this.notify(notice);
  }
  startMode(lane:boolean){
    this.replaceSquad(lane?new LaneMatch():new Squad(true),lane?'적 챔피언 4명과 교전합니다 · 미니언과 함께 전진하세요.':'연습장을 초기화했습니다.');
  }
  startBattlefield(){
    this.replaceSquad(new BattlefieldMatch(),'3라인 전장 · 역할별 시작 위치에서 네 챔피언을 직접 지휘합니다.');
  }
  restartTraining(){if(this.battlefield)this.startBattlefield();else this.startMode(!!this.match);}
  rally(){
    if(!this.match||this.blocked)return;
    const front=Math.max(600,...this.match.units.filter(u=>u.team==='blue'&&u.kind==='minion'&&u.alive).map(u=>u.x-60));
    this.squad.members.forEach((c,i)=>c.move({x:Math.min(1390,front)-(i%2)*55,y:LANE.y+(Math.floor(i/2)*2-1)*42}));
    this.notify('전선 집결 · 각 챔피언의 이동·공격 명령으로 조정할 수 있습니다.');
  }
  dashToScreen(x: number,y: number,slot:SkillSlot='manual') {
    const rect = this.game.canvas.getBoundingClientRect();
    if (x<rect.left || x>rect.right || y<rect.top || y>rect.bottom || this.blocked) { this.cancelGesture(); return; }
    const p=this.cameras.main.getWorldPoint((x-rect.left)*this.scale.width/rect.width,(y-rect.top)*this.scale.height/rect.height);
    this.doDash(p,slot);
  }
  private doDash(point: Point,slot:SkillSlot=this.aimSlot??'manual') {
    this.aimSlot=null;
    this.notify(this.combat.castSkill(slot,point)?`${this.combat.abilities.presentation(slot).name} 사용`:'마나·상태·재사용 대기시간을 확인하세요.');
  }
  private release(p: Phaser.Input.Pointer) {
    const gesture=this.gesture;
    if (!gesture || gesture.pointer!==p.id || this.blocked) return;
    this.gesture=null;
    const point=this.cameras.main.getWorldPoint(p.x,p.y);
    if (gesture.mode==='dash') { this.doDash(point); return; }
    if (gesture.mode==='pan') return;
    if (distance(gesture.start,{x:p.x,y:p.y})<8) { this.notify('선택됨 · 지면이나 적에게 끌어 명령을 내리세요.'); return; }
    const enemy=this.combat.enemies.find(e=>e.alive&&this.combat.canSee(e)&&distance(e,point)<40);
    if (enemy) { if(this.combat.attack(enemy.id,point)) this.notify('전진 공격 · 교전 후에도 지정한 위치까지 이동합니다.'); }
    else if(this.combat.move(point)) this.notify('이동 명령 · 추격을 취소하고 목적지로 이동합니다.');
  }
  update(_time: number,delta: number) {
    if (!this.actors) return;
    if (!this.blocked) {
      this.accumulator+=Math.min(delta/1000,.1);
      while(this.accumulator>=RULES.step) {this.squad.step(RULES.step);this.accumulator-=RULES.step;}
    }
    this.visuals?.setPaused(this.blocked);this.visuals?.begin();
    this.renderFog();
    this.renderActors();
    this.renderGuide();
    for(const owner of this.champions)for(const event of owner.events.splice(0)) {
      const enemyOwner=this.session?.opponents.includes(owner)??false;
      if(enemyOwner&&this.match){
        const ownerTarget=this.match.championTargets.find(t=>t.id===owner.profile.id);
        const sourceEvent=event.entityId===owner.profile.id||event.kind==='cast'||event.kind==='slash'||event.kind==='ultimate'||event.kind==='levelUp'||event.kind==='heal';
        if(sourceEvent&&(!ownerTarget||!this.match.canSee('blue',ownerTarget)))continue;
        if(!sourceEvent&&!this.match.pointVisible('blue',event.point))continue;
      }
      if(event.entityId&&(event.kind==='cast'||event.kind==='damage'))this.poses.set(event.entityId,{kind:event.kind==='cast'?'cast':'hurt',until:this.combat.elapsed+(this.visuals?.clipDuration(actorVisual(this.champions.find(c=>c.profile.id===event.entityId)?.visualId??event.entityId),event.kind==='cast'?'cast':'hurt')??.3)});
      const custom=event.visual?this.visuals?.effect(event.visual,event.point):false;
      if(event.kind==='levelUp'){
        const label=this.add.text(event.point.x,event.point.y-65,`Lv. ${event.amount}`,{fontSize:'20px',color:'#a0e7ff',stroke:'#122d35',strokeThickness:3}).setOrigin(.5).setDepth(10);
        this.tweens.add({targets:label,y:label.y-35,alpha:0,duration:1000,onComplete:()=>label.destroy()});
      } else if(event.kind==='damage'||event.kind==='heal') {
        const text=this.add.text(event.point.x,event.point.y,`${event.kind==='heal'?'+':''}${Math.round(event.amount??0)}`,{fontFamily:'Georgia,serif',fontSize:'20px',color:event.kind==='heal'?'#93eaaa':'#f1d8a3',stroke:'#1b241f',strokeThickness:3}).setOrigin(.5).setDepth(10);
        this.tweens.add({targets:text,y:text.y-35,alpha:0,duration:700,onComplete:()=>text.destroy()});
      } else if(!custom&&(event.kind==='slash'||event.kind==='ultimate')) {
        const ring=this.add.circle(event.point.x,event.point.y,25,0xd1ba72,.08).setStrokeStyle(3,0xe0c780,.75).setDepth(6);
        this.tweens.add({targets:ring,scale:4,alpha:0,duration:450,onComplete:()=>ring.destroy()});
      }
    }
    this.visuals?.end(Math.min(delta/1000,.1));
    this.tweens.timeScale=this.blocked?0:1;
    this.onFrame(this);
  }
  private renderActors() {
    const g=this.actors;g.clear();
    if(!this.battlefield)this.visuals?.draw('map',this.match?'map.lane':'map.training',{x:RULES.world.width/2,y:RULES.world.height/2},'idle',0,1);
    if(this.match)this.renderLane();
    else if(this.battlefield)this.renderBattlefield();
    else this.combat.enemies.forEach((e,i)=>{
      const label=this.labels[i];label.setVisible(this.combat.canSee(e));if(!this.combat.canSee(e))return;label.setPosition(e.x,e.y-69);
      label.setText(e.alive?(e.stunned>0?'기절':e.rooted>0?'속박':e.slowRemaining>0?'둔화':e.marked>0?'저주':'훈련 대상'): `${Math.max(1,Math.ceil(e.respawn))}초 후 재생성`);
      g.fillStyle(0x101e1a,.5);g.fillEllipse(e.x+3,e.y+18,57,23);
      if(!e.alive){g.lineStyle(1,0x7e6e54,.5);g.strokeCircle(e.x,e.y,20);return;}
      if(!this.visuals?.draw(e,'unit.training',e,e.stunned>0?'hurt':'idle')){
      g.lineStyle(5,0x6c5040);g.lineBetween(e.x,e.y-20,e.x,e.y+25);g.lineBetween(e.x-23,e.y-7,e.x+23,e.y-7);
      g.fillStyle(0x8d5145);g.fillCircle(e.x,e.y-7,19);g.lineStyle(3,0xc09365);g.strokeCircle(e.x,e.y-7,19);g.lineStyle(2,0xdeb77a);g.strokeCircle(e.x,e.y-7,10);
      g.fillStyle(0xc79868);g.fillCircle(e.x,e.y-7,3);
      }
      g.fillStyle(0x101a18);g.fillRoundedRect(e.x-31,e.y-48,62,7,2);g.fillStyle(0xc17b67);g.fillRect(e.x-30,e.y-47,60*(e.hp/e.maxHp),5);
      if(this.combat.command.kind==='attack'&&this.combat.command.targetId===e.id){g.lineStyle(2,0xefb47d,.9);g.strokeCircle(e.x,e.y,33);}
    });
    for(const attack of this.squad.counterattacks.values()){
      const p=attack.pet??attack.actor.hero;
      g.lineStyle(2,0xef856b,.65);g.lineBetween(attack.enemy.x,attack.enemy.y,p.x,p.y);g.strokeCircle(p.x,p.y,29);
    }
    for (const member of this.champions) {
      const enemyMember=this.session?.opponents.includes(member)??false;
      const visiblePoint=(p:Point)=>!enemyMember||!this.match||this.match.pointVisible('blue',p);
      const a=member.abilities;
      for(const m of a.missiles){if(!visiblePoint(m.point))continue;if(this.visuals?.draw(m,`projectile.${member.profile.kit}.${m.kind}`,m.point,'walk',Math.atan2(m.direction.y,m.direction.x)))continue;g.fillStyle(member.profile.color);g.fillCircle(m.point.x,m.point.y,m.kind==='arrow'?10:6);}
      if(a.scout&&visiblePoint(a.scout)&&!this.visuals?.draw(a.scout,'zone.scout',a.scout)){g.lineStyle(2,0x86c9ec,.6);g.strokeCircle(a.scout.x,a.scout.y,SKILLS.frost.scout.radius);}
      const petVisible=!!a.pet&&(!enemyMember||!this.match||this.match.canSeePet('blue',member));
      if(a.pet&&petVisible){const p=a.pet;if(!this.visuals?.draw(p,`pet.${member.profile.kit}`,p)){g.fillStyle(0xa47258);g.fillRoundedRect(p.x-22,p.y-24,44,46,12);g.fillCircle(p.x-16,p.y-24,10);g.fillCircle(p.x+16,p.y-24,10);g.fillStyle(0xffd491);g.fillCircle(p.x-8,p.y-10,3);g.fillCircle(p.x+8,p.y-10,3);}g.fillStyle(0x89cca0);g.fillRect(p.x-22,p.y-40,44*Math.max(0,Math.min(1,p.hp/p.maxHp)),4);}
      const memberTarget=enemyMember&&this.match?this.match.championTargets.find(t=>t.id===member.profile.id):undefined;
      const ownerVisible=!enemyMember||!this.match||!!memberTarget&&this.match.canSee('blue',memberTarget);
      if(a.aura&&ownerVisible&&!this.visuals?.draw(a,`aura.${member.profile.kit}`,member.hero)){g.lineStyle(2,0x88b99d,.6);g.strokeCircle(member.hero.x,member.hero.y,SKILLS.curse.aura.range);}

      for (const p of member.projectiles) { if(!visiblePoint(p))continue;if(this.visuals?.draw(p,`projectile.${member.visualId}.basic`,p,'walk',Math.atan2(p.target.y-p.y,p.target.x-p.x)))continue;g.fillStyle(member.profile.color); g.fillCircle(p.x,p.y,5); }
    }
    for (const c of this.champions) {
    const enemy=this.session?.opponents.includes(c)??false;
    const target=enemy?this.match?.championTargets.find(t=>t.id===c.profile.id):undefined;
    if(enemy&&target&&!this.match!.canSee('blue',target))continue;
    const h=c.hero,last=this.lastPositions.get(c.profile.id),pose=this.poses.get(c.profile.id);
    const activePose=pose&&pose.until>c.elapsed?pose.kind:null;
    const motion=motionFor({alive:c.alive,moving:!!last&&distance(h,last)>.01,attacking:!!c.pending,casting:activePose==='cast',hurt:activePose==='hurt',recalling:c.command.kind==='recall'});
    this.lastPositions.set(c.profile.id,{x:h.x,y:h.y});
    const custom=this.visuals?.draw(c,actorVisual(c.visualId),h,motion,h.facing);
    if(!c.alive){if(custom)continue;g.lineStyle(2,0x8c8a83,.6);g.strokeCircle(h.x,h.y,23);continue;}
    if(enemy){g.lineStyle(3,0xed806e,.9);g.strokeEllipse(h.x,h.y+7,64,48);}
    if(this.combat.command.kind==='attack'&&this.combat.command.targetId===c.profile.id){g.lineStyle(2,0xffdf9c);g.strokeCircle(h.x,h.y,37);}
    if(h.shield>0){g.lineStyle(3,0x88cbed,.8);g.strokeCircle(h.x,h.y,34);}
    g.fillStyle(0x0b1915,.6);g.fillEllipse(h.x+4,h.y+24,63,26);
    if(c.ultimateRemaining>0){g.fillStyle(0xdaa549,.09);g.fillCircle(h.x,h.y,RULES.ultimate.range);g.lineStyle(1,0xdaba64,.45);g.strokeCircle(h.x,h.y,49);}
    if(c===this.combat){g.lineStyle(2,0x81d8b0,.85);g.strokeEllipse(h.x,h.y+7,64,48);}
    const size=c.ultimateRemaining>0?1.2:1;
    if(!custom){
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
    }
    g.fillStyle(0x10251e);g.fillRect(h.x-29,h.y-43,58,6);g.fillStyle(enemy?0xed806e:0x89cca0);g.fillRect(h.x-28,h.y-42,56*h.hp/h.maxHp,4);
    if(c.command.kind==='recall'){g.lineStyle(3,0x83ced2,.8);g.strokeCircle(h.x,h.y,42+Math.sin(c.elapsed*6)*4);}
    }
  }
  private renderLane(){
    const g=this.actors,match=this.match!;
    for(const u of match.units){
      if(u.team==='red'&&!match.canSee('blue',u))continue;
      const color=u.team==='blue'?0x79b9cc:0xd98b78;
      const previous=this.lastPositions.get(u.id),stats=LANE[u.role];
      const attacking='interval' in stats&&u.attackCooldown>stats.interval-.25;
      const custom=this.visuals?.draw(u,`unit.${u.team}.${u.role}`,u,!u.alive?'death':previous&&distance(previous,u)>.01?'walk':attacking?'attack':'idle',u.team==='blue'?0:Math.PI);
      this.lastPositions.set(u.id,{x:u.x,y:u.y});
      if(u.kind==='building'){
        if(!u.alive){g.lineStyle(2,color,.25);g.strokeCircle(u.x,u.y,30);continue;}
        if(u.role==='tower'){g.lineStyle(1,color,.25);g.strokeCircle(u.x,u.y,LANE.tower.range);}
        if(!custom){
        g.fillStyle(color,.25);g.fillCircle(u.x,u.y,38);
        g.fillStyle(color);u.role==='tower'?g.fillRoundedRect(u.x-19,u.y-28,38,55,7):g.fillTriangle(u.x,u.y-35,u.x-28,u.y+25,u.x+28,u.y+25);
        }
        if(u.protected){g.lineStyle(3,0xebe3b6,.8);g.strokeCircle(u.x,u.y,42);}
        g.fillStyle(0x112822);g.fillRect(u.x-40,u.y-55,80,8);g.fillStyle(color);g.fillRect(u.x-39,u.y-54,78*u.hp/u.maxHp,6);
      }else if(u.alive){
        const radius=u.role==='siege'?14:u.role==='melee'?10:8;
        g.fillStyle(0x11251d,.7);g.fillEllipse(u.x+3,u.y+9,radius*2.5,12);
        if(!custom){g.fillStyle(color);g.fillCircle(u.x,u.y,radius);g.lineStyle(2,0xd9d6ae,.7);g.lineBetween(u.x,u.y,u.x+(u.team==='blue'?1:-1)*(radius+6),u.y);}
        g.fillStyle(0x142a22);g.fillRect(u.x-16,u.y-22,32,4);g.fillStyle(color);g.fillRect(u.x-16,u.y-22,32*u.hp/u.maxHp,4);
      }
      if(this.combat.command.kind==='attack'&&this.combat.command.targetId===u.id&&u.alive){g.lineStyle(2,0xffdf9c);g.strokeCircle(u.x,u.y,u.kind==='building'?46:23);}
    }
    match.units.filter(u=>u.team==='red'&&u.kind==='building').forEach((u,i)=>{const visible=match.canSee('blue',u);this.labels[i].setVisible(visible);if(visible)this.labels[i].setPosition(u.x,u.y-78).setText(`${u.role==='tower'?'적 타워':'적 넥서스'} · ${!u.alive?'파괴됨':u.protected?'타워 보호':u.damageScale===.25?'공성 피해 25%':Math.ceil(u.hp)}`);});
    match.opponents.forEach((c,i)=>{
      const label=this.labels[i+2],h=c.hero,target=match.championTargets.find(t=>t.id===c.profile.id)!;
      const visible=match.canSee('blue',target);label.setVisible(visible);
      if(visible)label.setPosition(h.x,h.y-64).setText(c.alive?`적 ${c.profile.name} · Lv.${c.progression.level}${h.stunned>0?' · 기절':h.rooted>0?' · 속박':h.slowRemaining>0?' · 둔화':''}`:`${c.profile.name} · 부활 ${Math.ceil(c.respawnRemaining)}초`);
    });
    const liveIds=new Set([...match.units.map(u=>u.id),...match.actors.map(c=>c.profile.id)]);
    for(const id of this.lastPositions.keys())if(!liveIds.has(id))this.lastPositions.delete(id);
    for(const shot of match.towerShots.values()){g.lineStyle(3,0xef9273,.8);g.lineBetween(shot.tower.x,shot.tower.y,shot.target.point.x,shot.target.point.y);g.strokeCircle(shot.target.point.x,shot.target.point.y,25);}
  }
  private renderBattlefield(){
    const g=this.actors,match=this.battlefield!;
    for(const u of match.units){
      const color=u.team==='blue'?0x79b9cc:0xd98b78;
      const previous=this.lastPositions.get(u.id);
      const moving=!!previous&&distance(previous,u)>.01;
      const attacking=u.attackCooldown>0;
      const custom=this.visuals?.draw(u,`unit.${u.team}.${u.role}`,u,!u.alive?'death':moving?'walk':attacking?'attack':'idle',u.team==='blue'?0:Math.PI);
      this.lastPositions.set(u.id,{x:u.x,y:u.y});
      if(u.kind==='building'){
        if(!u.alive){g.lineStyle(2,color,.25);g.strokeCircle(u.x,u.y,25);continue;}
        if(u.role==='outer'||u.role==='inner'){g.lineStyle(1,color,.18);g.strokeCircle(u.x,u.y,BATTLEFIELD.structures[u.role].range);}
        if(!custom){
          if(u.role==='nexus'){g.fillStyle(color,.28);g.fillCircle(u.x,u.y,46);g.fillStyle(color);g.fillCircle(u.x,u.y,27);g.lineStyle(3,0xe7ddb4,.7);g.strokeCircle(u.x,u.y,34);}
          else if(u.role==='inhibitor'){g.fillStyle(color,.85);g.fillRoundedRect(u.x-22,u.y-22,44,44,8);g.lineStyle(3,0xe7ddb4,.65);g.strokeCircle(u.x,u.y,30);}
          else {const size=u.role==='outer'?32:27;g.fillStyle(color,.25);g.fillCircle(u.x,u.y,size+10);g.fillStyle(color);g.fillRoundedRect(u.x-size*.55,u.y-size,size*1.1,size*2,7);}
        }
        if(u.protected){g.lineStyle(3,0xebe3b6,.75);g.strokeCircle(u.x,u.y,u.role==='nexus'?54:40);}
        g.fillStyle(0x112822);g.fillRect(u.x-38,u.y-52,76,7);g.fillStyle(color);g.fillRect(u.x-37,u.y-51,74*Math.max(0,u.hp/u.maxHp),5);
      }else if(u.alive){
        const radius=u.role==='siege'?13:u.role==='melee'?9:7;
        if(!custom){g.fillStyle(0x10251d,.65);g.fillEllipse(u.x+3,u.y+8,radius*2.5,11);g.fillStyle(color);g.fillCircle(u.x,u.y,radius);g.lineStyle(2,0xd9d6ae,.65);g.lineBetween(u.x,u.y,u.x+(u.team==='blue'?1:-1)*(radius+5),u.y);}
        g.fillStyle(0x142a22);g.fillRect(u.x-14,u.y-20,28,4);g.fillStyle(color);g.fillRect(u.x-14,u.y-20,28*Math.max(0,u.hp/u.maxHp),4);
      }
      if(this.combat.command.kind==='attack'&&this.combat.command.targetId===u.id&&u.alive){g.lineStyle(2,0xffdf9c);g.strokeCircle(u.x,u.y,u.kind==='building'?44:21);}
    }
    const liveIds=new Set([...match.units.map(u=>u.id),...match.actors.map(c=>c.profile.id)]);
    for(const id of this.lastPositions.keys())if(!liveIds.has(id))this.lastPositions.delete(id);
  }

  private renderFog(){
    const g=this.fog;g.clear();const match=this.match;if(!match)return;
    const cell=LANE.vision.cell;
    for(let y=0;y<RULES.world.height;y+=cell)for(let x=0;x<RULES.world.width;x+=cell){
      const state=match.terrain('blue',{x:Math.min(RULES.world.width-.001,x+cell/2),y:Math.min(RULES.world.height-.001,y+cell/2)});
      if(state==='visible')continue;
      g.fillStyle(0x07100d,state==='unexplored'?.7:.32);g.fillRect(x,y,cell,cell);
    }
  }
  private renderGuide() {
    const g=this.guide;g.clear();
    const h=this.combat.hero;const a=this.combat.anchor;
    g.lineStyle(1,0xc6b977,.2);g.strokeCircle(a.x,a.y,RULES.hero.anchorRadius);
    g.lineStyle(1,0xe4cb80,.5);g.strokeCircle(a.x,a.y,7);
    if(this.combat.command.kind==='move'||this.combat.command.kind==='attack'||this.combat.command.kind==='attackMove'){g.lineStyle(2,0x96d8ad,.45);g.lineBetween(h.x,h.y,a.x,a.y);g.strokeCircle(a.x,a.y,13);}
    if((this.gesture?.mode==='hero'||this.gesture?.mode==='dash'||this.armed)&&this.aim){g.lineStyle(2,this.armed?0xf2d185:0xa1dfc1,.9);g.lineBetween(h.x,h.y,this.aim.x,this.aim.y);g.strokeCircle(this.aim.x,this.aim.y,16);}
    if(this.armed){g.lineStyle(1,0xe3ca89,.5);g.strokeCircle(h.x,h.y,this.combat.abilities.presentation(this.aimSlot??'manual').range);}
  }
  private drawMap() {
    this.mapLayer?.destroy(true);this.mapLayer=this.add.container(0,0).setDepth(0);
    const g=this.add.graphics();this.mapLayer.add(g);const w=RULES.world.width,h=RULES.world.height;
    if(this.battlefield){
      g.fillStyle(0x24392f);g.fillRect(0,0,w,h);
      for(const lane of ['top','mid','bottom'] as const){
        const route=battlefieldLaneRoute(lane,'blue');
        g.lineStyle(116,0x555c49,.5);
        for(let i=1;i<route.length;i++)g.lineBetween(route[i-1].x,route[i-1].y,route[i].x,route[i].y);
        g.lineStyle(82,0x77765d,.4);
        for(let i=1;i<route.length;i++)g.lineBetween(route[i-1].x,route[i-1].y,route[i].x,route[i].y);
        g.lineStyle(2,0xb4ae7b,.24);
        for(let i=1;i<route.length;i++)g.lineBetween(route[i-1].x,route[i-1].y,route[i].x,route[i].y);
      }
      const north=BATTLEFIELD_NAVIGATION.node('river-north').point,south=BATTLEFIELD_NAVIGATION.node('river-south').point;
      g.lineStyle(105,0x315d64,.3);g.lineBetween(north.x,north.y,south.x,south.y);
      for(const id of ['blue-jungle-top','blue-jungle-bottom','red-jungle-top','red-jungle-bottom']){
        const p=BATTLEFIELD_NAVIGATION.node(id).point;g.fillStyle(0x173b2a,.7);g.fillCircle(p.x,p.y,64);g.lineStyle(2,0x4d704d,.4);g.strokeCircle(p.x,p.y,64);
      }
      for(const team of ['blue','red'] as const){
        const p=BATTLEFIELD_NAVIGATION.node(team==='blue'?'blue-base':'red-base').point;
        const color=team==='blue'?0x345e60:0x664c48;g.fillStyle(color,.9);g.fillCircle(p.x,p.y,92);g.lineStyle(3,0xc4bc88,.45);g.strokeCircle(p.x,p.y,78);
      }
      this.mapLayer.add(this.add.text(800,500,'THREE LANE BATTLEFIELD',{fontFamily:'Georgia,serif',fontSize:'15px',color:'#abb28b'}).setOrigin(.5).setAlpha(.35));
      return;
    }
    if(this.match){
      g.fillStyle(0x263d32);g.fillRect(0,0,w,h);
      g.fillStyle(0x62604a);g.fillRoundedRect(60,LANE.y-110,w-120,220,65);
      g.lineStyle(2,0xa49b6b,.25);g.lineBetween(100,LANE.y,1500,LANE.y);
      for(let x=90;x<w-60;x+=48)for(let y=LANE.y-90;y<LANE.y+100;y+=45){g.lineStyle(1,0xabb19b,.12);g.strokeRoundedRect(x,y,40,35,5);}
      for(const x of [140,1460]){g.fillStyle(x<800?0x345e60:0x664c48,.8);g.fillCircle(x,LANE.y,100);}
      for(const bush of LANE.bushes){g.fillStyle(0x173c29,.9);g.fillRoundedRect(bush.x,bush.y,bush.width,bush.height,28);g.lineStyle(2,0x436d48,.65);g.strokeRoundedRect(bush.x,bush.y,bush.width,bush.height,28);}
      for(const p of LANE.spawns){g.lineStyle(1,0x84c9ab,.5);g.strokeCircle(p.x,p.y,40);}
      return;
    }
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
    this.mapLayer.add(this.add.text(760,790,'T R A I N I N G   G R O U N D S',{fontFamily:'Georgia,serif',fontSize:'16px',color:'#a0aa80'}).setOrigin(.5).setAlpha(.5));
  }
}
