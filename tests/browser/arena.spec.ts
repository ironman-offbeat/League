import { test, expect } from '@playwright/test';
test('lane shop spends shared gold, upgrades only the selected hero and resets cleanly',async({page,isMobile},info)=>{
 test.setTimeout(150000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 const press=async(id:string)=>{if(isMobile)await page.locator(id).tap();else await page.locator(id).click();};
 await press('#mode');await expect(page.locator('#gear-summary')).toHaveText('무기 T1 · 방어 T1');
 await expect(page.locator('#rank-summary')).toHaveText('Q 1 · W 잠김 · E 잠김 · R 잠김');
 await expect(page.locator('#dash')).toBeDisabled();await expect(page.locator('#potion-use')).toBeDisabled();
 await press('#shop-toggle');await expect(page.locator('#shop-panel')).toBeVisible();
 await expect(page.locator('#buy-armor')).toBeDisabled();await expect(page.locator('#buy-health')).toBeDisabled();
 await page.screenshot({path:`test-results/shop-${info.project.name}.png`});
 const openedAt=await page.evaluate(()=>(window as any).leagueDebug.match.elapsed);
 await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.match.elapsed),{timeout:15000}).toBeGreaterThan(openedAt+2);
 await expect(page.locator('#buy-armor')).toBeEnabled({timeout:110000});
 await press('#buy-armor');await expect(page.locator('#gear-summary')).toHaveText('무기 T1 · 방어 T2');
 await expect(page.locator('#hp-text')).toHaveText('1070 / 1070');await expect(page.locator('#shop-status')).toContainText('구매 완료');
 await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.match.gold)).toBeLessThan(30);
 await page.locator('#shop-champion').selectOption('1');await expect(page.locator('#gear-summary')).toHaveText('무기 T1 · 방어 T1');
 await expect(page.locator('#buy-armor')).toBeDisabled();await expect(page.locator('#shop-stats')).toContainText('주문력 15');
 await press('#shop-close');await expect(page.locator('#shop-panel')).toBeHidden();
 await press('#rally');await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.hero.x)).toBeGreaterThan(230);
 await press('#shop-toggle');await expect(page.locator('#buy-armor')).toContainText('우물에서만 구매 가능');
 await press('#shop-close');await press('#reset');await expect(page.locator('#gear-summary')).toHaveText('무기 T1 · 방어 T1');
 await expect(page.locator('#team-gold')).toHaveText('팀 골드 200');await press('#mode');await expect(page.locator('#inventory')).toBeHidden();
 expect(errors).toEqual([]);
});
test('loads, accepts movement / forced attack / dash and freezes combat while paused',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await page.waitForTimeout(150);
  const point=async(x:number,y:number)=>page.evaluate(({x,y})=>{const r=document.querySelector('canvas')!.getBoundingClientRect();const d=(window as any).leagueDebug;return{x:r.left+x-d.camera.x,y:r.top+y-d.camera.y};},{x,y});
  const hero=await page.evaluate(()=>(window as any).leagueDebug.hero);
  const start=await point(hero.x,hero.y);const end=await point(hero.x+85,hero.y+20);
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();
  await expect(page.locator('#goal-move')).toHaveClass('done');
  await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.hero.x)).toBeGreaterThan(hero.x+65);
  const h=await page.evaluate(()=>(window as any).leagueDebug.hero);const from=await point(h.x,h.y);const enemy=await point(720,470);
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(enemy.x,enemy.y,{steps:8});await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.damage)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'일시정지',exact:true}).click();
  const elapsed=await page.evaluate(()=>(window as any).leagueDebug.elapsed);await page.waitForTimeout(350);
  expect(await page.evaluate(()=>(window as any).leagueDebug.elapsed)).toBe(elapsed);
  await page.getByRole('button',{name:'계속하기',exact:true}).click();
  await page.locator('#dash').click();
  await expect(page.locator('#dash')).toHaveClass(/armed/);
  const current=await page.evaluate(()=>(window as any).leagueDebug.hero);const dest=await point(current.x-90,current.y+40);
  await page.mouse.click(dest.x,dest.y);await expect(page.locator('#goal-dash')).toHaveClass('done');
  await page.locator('#ultimate').click();await expect(page.locator('#hp-text')).toContainText('1100');
  await page.getByRole('button',{name:'조작 안내'}).click();await expect(page.locator('#help-overlay')).toBeVisible();
  await page.getByRole('button',{name:'연습 시작'}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({path:`test-results/arena-${info.project.name}.png`});
});

test('HUD aim survives release, can cancel, and drag casts without arming again',async({page})=>{
  await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  const dash=page.locator('#dash');
  await dash.click();await expect(dash).toHaveClass(/armed/);
  await dash.click();await expect(dash).not.toHaveClass(/armed/);
  await dash.click();await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await page.getByRole('button',{name:'계속하기',exact:true}).click();
  await expect(dash).not.toHaveClass(/armed/);
  const box=(await dash.boundingBox())!;
  const destination=await page.evaluate(()=>{
    const d=(window as any).leagueDebug;const r=document.querySelector('canvas')!.getBoundingClientRect();
    return {x:r.left+d.hero.x-d.camera.x+70,y:r.top+d.hero.y-d.camera.y};
  });
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(destination.x,destination.y,{steps:10});await page.mouse.up();
  await expect(page.locator('#goal-dash')).toHaveClass('done');
  await expect(dash).not.toHaveClass(/armed/);
  expect(await page.evaluate(()=>(window as any).leagueDebug.dashCooldown)).toBeGreaterThan(0);
});

test('touch tap arms E then a canvas tap casts',async({page,isMobile})=>{
  test.skip(!isMobile,'Touch-enabled mobile projects only');
  await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await page.locator('#dash').tap();await expect(page.locator('#dash')).toHaveClass(/armed/);
  const p=await page.evaluate(()=>{
    const d=(window as any).leagueDebug;const r=document.querySelector('canvas')!.getBoundingClientRect();
    return {x:r.left+d.hero.x-d.camera.x+60,y:r.top+d.hero.y-d.camera.y};
  });
  await page.touchscreen.tap(p.x,p.y);await expect(page.locator('#goal-dash')).toHaveClass('done');
});

test('portrait blocks play, landscape recovers and cancelled gestures do not move',async({page})=>{
  await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await page.setViewportSize({width:390,height:844});await expect(page.locator('#rotate')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.paused)).toBe(true);
  await page.setViewportSize({width:844,height:390});await expect(page.locator('#rotate')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.paused)).toBe(false);
  await page.locator('#dash').click();await page.locator('#dash').click();
  expect(await page.evaluate(()=>(window as any).leagueDebug.dashCooldown)).toBe(0);
});

test('switching champions keeps previous orders and independent HUD',async({page,isMobile},info)=>{
 await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 const choose=async(id:string)=>{if(isMobile)await page.locator(`#champion-${id}`).tap();else await page.locator(`#champion-${id}`).click();};
 const command=async(x:number,y:number)=>{
  const p=await page.evaluate(({x,y})=>{const d=(window as any).leagueDebug;const r=document.querySelector('canvas')!.getBoundingClientRect();return{sx:r.left+d.hero.x-d.camera.x,sy:r.top+d.hero.y-d.camera.y,x:r.left+x-d.camera.x,y:r.top+y-d.camera.y};},{x,y});
  await page.mouse.move(p.sx,p.sy);await page.mouse.down();await page.mouse.move(p.x,p.y,{steps:8});await page.mouse.up();
 };
 await command(720,470);await choose('annie');
 await expect(page.locator('#champion-name')).toHaveText('애니');await expect(page.locator('#dash')).toBeEnabled();await expect(page.locator('#dash span')).toHaveText('화염');await expect(page.locator('#fury-text')).toContainText('420');
 await command(720,470);await choose('ashe');
 await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.members[0].damage),{timeout:10000}).toBeGreaterThan(0);
 await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.members[1].damage),{timeout:10000}).toBeGreaterThan(0);
 expect(await page.evaluate(()=>(window as any).leagueDebug.members[0].command)).toBe('attack');
 await choose('amumu');await expect(page.locator('#hp-text')).toContainText('900');
 await page.locator('#pause').click();const before=await page.evaluate(()=>(window as any).leagueDebug.members.map((m:any)=>m.elapsed));await page.waitForTimeout(300);
 expect(await page.evaluate(()=>(window as any).leagueDebug.members.map((m:any)=>m.elapsed))).toEqual(before);
 await page.locator('#resume').click();await choose('renekton');await expect(page.locator('#dash')).toBeEnabled();
 await page.screenshot({path:`test-results/squad-${info.project.name}.png`});
});

test('all three new kits accept touch aim and ultimate input',async({page,isMobile})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 const press=async(selector:string)=>{if(isMobile)await page.locator(selector).tap();else await page.locator(selector).click();};
 const aim=async(selector:string)=>{
  await press(selector);await expect(page.locator(selector)).toHaveClass(/armed/);
  const point=await page.evaluate(()=>{const d=(window as any).leagueDebug,r=document.querySelector('canvas')!.getBoundingClientRect();return{x:r.left+d.hero.x-d.camera.x+80,y:r.top+d.hero.y-d.camera.y};});
  if(isMobile)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
  await expect(page.locator(selector)).not.toHaveClass(/armed/);
 };
 await press('#retaliation');await expect(page.locator('#retaliation')).toHaveAttribute('aria-pressed','false');
 await press('#champion-annie');await aim('#dash');await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.skillCooldowns.dash)).toBeGreaterThan(0);
 await aim('#ultimate');await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.pet?.hp??0)).toBeGreaterThan(0);
 await press('#champion-ashe');await aim('#dash');await aim('#ultimate');await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.skillCooldowns.ultimate)).toBeGreaterThan(0);
 await press('#champion-amumu');await aim('#dash');await press('#ultimate');await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.skillCooldowns.ultimate)).toBeGreaterThan(0);
 await press('#champion-renekton');await press('#dash');await expect(page.locator('#dash')).toHaveClass(/armed/);await press('#champion-annie');await expect(page.locator('#dash')).not.toHaveClass(/armed/);
 expect(errors).toEqual([]);
});

test('lane mode starts waves, rallies four heroes, pauses clocks and resets cleanly',async({page,isMobile},info)=>{
 test.setTimeout(60000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 const press=async(id:string)=>{if(isMobile)await page.locator(id).tap();else await page.locator(id).click();};
 await press('#dash');await press('#mode');
 await expect(page.locator('#match-hud')).toBeVisible();await expect(page.locator('#retaliation')).toBeHidden();
 await expect(page.locator('#xp-track')).toBeVisible();await expect(page.locator('#xp-text')).toHaveText('XP 0 / 100');
 await expect(page.locator('#team-gold')).toHaveText('팀 골드 200');await expect(page.locator('#ultimate')).toBeDisabled();await expect(page.locator('#ult-cd')).toHaveText('Lv. 4 해금');
 await expect(page.locator('#dash')).not.toHaveClass(/armed/);
 expect(await page.evaluate(()=>(window as any).leagueDebug.mode)).toBe('lane');
 await press('#rally');
 await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.members.filter((m:any)=>m.command==='move').length)).toBe(4);
 await press('#pause');const frozen=await page.evaluate(()=>(window as any).leagueDebug.match.elapsed);await page.waitForTimeout(300);
 expect(await page.evaluate(()=>(window as any).leagueDebug.match.elapsed)).toBe(frozen);
 await press('#resume');
 await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.paused)).toBe(false);
 await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.match.elapsed)).toBeGreaterThan(frozen);
 // CI WebKit software rendering advanced only 8 simulation seconds in 15 wall seconds.
 // Keep the game's bounded fixed-step clock; allow the actual 10s wave threshold to be reached.
 await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.match.wave),{timeout:35000}).toBe(1);
 await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.match.gold)).toBeGreaterThan(200);
 await press('#front-camera');
 expect(await page.evaluate(()=>(window as any).leagueDebug.match.units.filter((u:any)=>u.kind==='minion').length)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/lane-${info.project.name}.png`});
 await press('#reset');await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.match.wave)).toBe(0);
 await expect(page.locator('#team-gold')).toHaveText('팀 골드 200');await expect(page.locator('#xp-text')).toHaveText('XP 0 / 100');
 await press('#mode');await expect(page.locator('#retaliation')).toBeVisible();await expect(page.locator('#match-hud')).toBeHidden();
 expect(await page.evaluate(()=>(window as any).leagueDebug.enemies.length)).toBe(3);
 expect(await page.evaluate(()=>(window as any).leagueDebug.hero.x)).toBe(470);
 await expect(page.locator('#xp-track')).toBeHidden();await expect(page.locator('#ultimate')).toBeEnabled();
 expect(errors).toEqual([]);
});

test('target defeat continues toward the attacked location instead of returning to spawn',async({page,isMobile})=>{
 test.setTimeout(90000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 const press=async(id:string)=>{if(isMobile)await page.locator(id).tap();else await page.locator(id).click();};
 await press('#retaliation');
 const attack=async()=>{
  // Selection recenters the Phaser camera; its inverse matrix updates on render.
  // Start the gesture only after the displayed frame matches the new scroll.
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const p=await page.evaluate(()=>{const d=(window as any).leagueDebug,r=document.querySelector('canvas')!.getBoundingClientRect();return{sx:r.left+d.hero.x-d.camera.x,sy:r.top+d.hero.y-d.camera.y,x:r.left+720-d.camera.x,y:r.top+470-d.camera.y};});
  await page.mouse.move(p.sx,p.sy);await page.mouse.down();await page.mouse.move(p.x,p.y,{steps:8});await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>(window as any).leagueDebug.command)).toBe('attack');
 };
 await attack();
 // Mobile pointer coordinates can round by half a pixel. Compare against the
 // actual accepted order, then ensure combat never changes that destination.
 const destination=await page.evaluate(()=>(window as any).leagueDebug.anchor);
 expect(Math.hypot(destination.x-720,destination.y-470)).toBeLessThan(2);
 await press('#champion-annie');await attack();await press('#champion-renekton');
 await expect.poll(()=>page.evaluate(()=>{const e=(window as any).leagueDebug.enemies[0];return !e.alive||e.generation>0;}),{timeout:60000}).toBe(true);
 await expect.poll(()=>page.evaluate(p=>{const h=(window as any).leagueDebug.hero;return Math.hypot(h.x-p.x,h.y-p.y);},destination),{timeout:15000}).toBeLessThan(1);
 const d=await page.evaluate(()=>(window as any).leagueDebug);
 expect(d.anchor).toEqual(destination);
 expect(d.hero.x).toBeGreaterThan(700);expect(errors).toEqual([]);
});
