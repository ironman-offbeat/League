import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLEFIELD_NAVIGATION,
  BATTLEFIELD_LANE_NODES,
  PROTOTYPE_MID_ROUTE,
  advanceOnRoute,
  battlefieldLaneRoute,
  pointOnRoute,
  projectToRoute,
  routeForTeam,
  routeLength,
  routeProgress,
} from '../src/game/navigation.ts';

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('three battlefield lanes share bases and reverse cleanly for red',()=>{
  for(const lane of ['top','mid','bottom'] as const){
    const ids=BATTLEFIELD_LANE_NODES[lane];
    assert.equal(ids[0],'blue-base');
    assert.equal(ids.at(-1),'red-base');
    const blue=battlefieldLaneRoute(lane,'blue');
    const red=battlefieldLaneRoute(lane,'red');
    assert.deepEqual(red,[...blue].reverse());
    assert.ok(routeLength(blue)>1000);
  }
});

test('navigation graph finds connected routes and can constrain traversal by tags',()=>{
  const path=BATTLEFIELD_NAVIGATION.shortestPathIds('top-blue-outer','bottom-red-outer');
  assert.equal(path[0],'top-blue-outer');
  assert.equal(path.at(-1),'bottom-red-outer');
  assert.ok(path.includes('mid-center')||path.includes('blue-base')||path.includes('red-base'));

  const laneOnly=BATTLEFIELD_NAVIGATION.shortestPathIds(
    'mid-blue-inner','mid-red-inner',
    node=>node.tags.includes('lane')||node.tags.includes('base'),
  );
  assert.ok(laneOnly.includes('mid-center'));
  assert.ok(!laneOnly.some(id=>id.includes('jungle')));
});

test('graph snapshots do not expose internal node or neighbor mutation',()=>{
  const node=BATTLEFIELD_NAVIGATION.node('mid-center');
  node.point.x=0;
  const neighbors=BATTLEFIELD_NAVIGATION.neighbors('mid-center');
  neighbors[0].point.x=0;
  assert.equal(BATTLEFIELD_NAVIGATION.node('mid-center').point.x,800);
  assert.ok(BATTLEFIELD_NAVIGATION.neighbors('mid-center').every(n=>n.point.x!==0));
});

test('prototype route progress is symmetric and red orientation is reversed',()=>{
  const length=routeLength(PROTOTYPE_MID_ROUTE);
  near(length,1400);
  near(routeProgress(PROTOTYPE_MID_ROUTE,'blue',{x:540,y:530}),440);
  near(routeProgress(PROTOTYPE_MID_ROUTE,'red',{x:1060,y:470}),440);
  assert.deepEqual(routeForTeam(PROTOTYPE_MID_ROUTE,'red'),[...PROTOTYPE_MID_ROUTE].reverse());
});

test('polyline projection and advance preserve lateral formation offset',()=>{
  const projection=projectToRoute(PROTOTYPE_MID_ROUTE,{x:600,y:532});
  near(projection.distance,500);
  near(projection.lateral,32);
  const blue=advanceOnRoute(PROTOTYPE_MID_ROUTE,'blue',{x:600,y:532},120);
  near(blue.x,720);near(blue.y,532);
  const red=advanceOnRoute(PROTOTYPE_MID_ROUTE,'red',{x:1000,y:468},120);
  near(red.x,880);near(red.y,468);
});

test('point lookup clamps to route ends and supports signed lateral offset',()=>{
  const total=routeLength(PROTOTYPE_MID_ROUTE);
  assert.deepEqual(pointOnRoute(PROTOTYPE_MID_ROUTE,'blue',-50),{x:100,y:500});
  assert.deepEqual(pointOnRoute(PROTOTYPE_MID_ROUTE,'blue',total+50),{x:1500,y:500});
  assert.deepEqual(pointOnRoute(PROTOTYPE_MID_ROUTE,'red',0,25),{x:1500,y:475});
});
