import { test, expect } from '@playwright/test';
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
 await expect(page.locator('#champion-name')).toHaveText('애니');await expect(page.locator('#dash')).toBeDisabled();await expect(page.locator('#fury-text')).toContainText('420');
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
