import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Run the actual geographic renderer against a drawing sink, without a browser.
const frames=new Map(), events={}, visibility={}, motionEvents={};
let frameId=0, drawCalls=0, selected=null, selectedRoute=null, error=false;
const canvasContext=new Proxy({}, {get(target,key) {
  if(key in target) return target[key];
  if(key==='measureText') return text=>({width:text.length*6});
  if(key==='createRadialGradient') return ()=>({addColorStop(){}});
  return (...args)=>{drawCalls++;for(const value of args) if(typeof value==='number') assert.ok(Number.isFinite(value),`${key} received a nonfinite coordinate`);};
}});
const canvas={clientWidth:600,width:600,height:430,style:{},getContext:()=>canvasContext,
  addEventListener:(name,fn)=>{events[name]=fn;},setPointerCapture(){},releasePointerCapture(){},hasPointerCapture:()=>false,
  getBoundingClientRect:()=>({left:0,top:0,width:600,height:410})};
const motion={matches:false,addEventListener:(name,fn)=>{motionEvents[name]=fn;}};
const document={hidden:false,addEventListener:(name,fn)=>{visibility[name]=fn;}};
const topology=JSON.parse(fs.readFileSync(new URL('../dist/assets/land-110m.json',import.meta.url)));
const context=vm.createContext({console,document,Math,canvas,matchMedia:()=>motion,devicePixelRatio:2,
  requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
  ResizeObserver:class {observe(){}},
  fetch:async()=>({ok:true,json:async()=>topology}),
  onSelect:id=>{selected=id;},onRouteSelect:id=>{selectedRoute=id;},onMotion:()=>{},onError:()=>{error=true;}});
for(const name of ['d3-array','d3-geo','topojson-client']) vm.runInContext(fs.readFileSync(new URL(`../dist/vendor/${name}.min.js`,import.meta.url),'utf8'),context);
vm.runInContext(fs.readFileSync(new URL('../dist/globe.js',import.meta.url),'utf8'),context);
const run=code=>vm.runInContext(code,context);
run('globalThis.globe=new SupplyGlobe(canvas,{onSelect,onRouteSelect,onMotion,onError}); globe.setActive(true);');
await new Promise(resolve=>setImmediate(resolve));
assert.equal(error,false);
assert.ok(run('globe.land.features.length')>0);
assert.ok(drawCalls>1000,'Actual sphere, graticule and land geometry were drawn');
assert.equal(run('globe.projectedMarkers().length'),2,'Atlantic view includes both coverage locations');
assert.equal(frames.size,1,'Only one animation frame is scheduled');
const tick=time=>{const [id,fn]=frames.entries().next().value;frames.delete(id);fn(time);};
tick(0);const before=run('globe.rotation[0]');tick(16);
assert.ok(run('globe.rotation[0]')>before);
assert.equal(frames.size,1);
document.hidden=true;visibility.visibilitychange();assert.equal(frames.size,0,'Background tabs stop animating');
document.hidden=false;visibility.visibilitychange();assert.equal(frames.size,1);
run('globe.setActive(false)');assert.equal(frames.size,0,'Hidden supply views stop animating');
run('globe.setActive(true); globe.rotation=[-100,0,0];globe.draw();');
assert.equal(run('globe.projectedMarkers().length'),0,'Back-side locations cannot show through the globe');
run(`globe.select('grid',true);`);
assert.equal(frames.size,0,'Selecting a country pauses and centers the globe');
assert.ok(run(`Math.hypot(...globe.projection([-98,39]).map((value,i)=>value-[globe.width/2,globe.height/2][i]))`)<1e-8);
const rotation=run('JSON.stringify(globe.rotation)');run(`globe.select('copper',true);`);
assert.equal(run('JSON.stringify(globe.rotation)'),rotation,'A global price is never mapped to a fabricated country');
const pointer={button:0,pointerId:1,clientX:300,clientY:205,type:'pointerup'};
events.pointerdown(pointer);events.pointerup(pointer);assert.equal(selected,'grid','Visible marker selects its indicator');
selected=null;events.pointerdown(pointer);events.pointermove({...pointer,clientX:370});events.pointerup({...pointer,clientX:370});
assert.equal(selected,null,'Dragging does not accidentally activate a marker');
let prevented=false;events.keydown({key:'ArrowUp',preventDefault(){prevented=true;}});assert.ok(prevented);
run('globe.setRunning(true)');assert.equal(frames.size,1);
motionEvents.change({matches:true});assert.equal(run('globe.running'),false,'Reduced-motion preference stops automatic rotation');
assert.equal(frames.size,0);
run(`globe.setData([{id:'NL',coordinates:[5.3,52.1],label:'Netherlands'},{id:'CN',coordinates:[104.2,35.9],label:'China'}],[{id:'exports',from:[5.3,52.1],to:[104.2,35.9]}]);globe.select('NL',true);globe.select('exports');`);
assert.equal(run('globe.selected'),'exports');
assert.equal(run('globe.routes.length'),1);
assert.equal(run('globe.locations.length'),2);
assert.ok(run(`Math.hypot(...globe.projection([5.3,52.1]).map((value,i)=>value-[globe.width/2,globe.height/2][i]))`)<1e-8);
const baseScale=run('globe.projection.scale()');
run('globe.setZoom(9)');assert.equal(run('globe.zoom'),5);assert.equal(run('globe.projection.scale()'),baseScale*5);
run('globe.setZoom(0)');assert.equal(run('globe.zoom'),1);
let wheelPrevented=false;events.wheel({deltaY:-100,deltaMode:0,preventDefault(){wheelPrevented=true;}});
assert.ok(wheelPrevented);assert.ok(run('globe.zoom')>1);
events.keydown({key:'0',preventDefault(){}});assert.equal(run('globe.zoom'),1);
events.pointerdown({...pointer,pointerId:11,clientX:250});events.pointerdown({...pointer,pointerId:12,clientX:350});
events.pointermove({...pointer,pointerId:12,clientX:450});assert.equal(run('globe.zoom'),2,'Two-finger distance controls zoom');
events.pointerup({...pointer,pointerId:12,clientX:450});events.pointerup({...pointer,pointerId:11,clientX:250});
assert.equal(run('globe.pointers.size'),0);assert.equal(run('globe.drag'),null);

run(`globe.setZoom(1);globe.rotation=[-70,-35,0];globe.setData([
 {id:'NL',coordinates:[5.3,52.1],label:'Netherlands'}, {id:'CN',coordinates:[104.2,35.9],label:'China'}
],[{id:'out',from:[5.3,52.1],to:[104.2,35.9],label:'Netherlands → China',annotation:'$9.69bn · 2024',valueLabel:'$9.69bn'},
 {id:'back',from:[104.2,35.9],to:[5.3,52.1],label:'China → Netherlands',annotation:'$1.20bn · 2024',valueLabel:'$1.20bn'}]);globe.select('out');`);
assert.ok(run('globe.routeLabels.length')>0,'Measured routes draw annotated boxes');
const centerDistance=run(`Math.hypot(...globe.drawnRoutes[0].anchors[0].point.map((p,i)=>p-globe.drawnRoutes[1].anchors[0].point[i]))`);
assert.ok(centerDistance>=9.9,'Reciprocal routes are visibly separated');
for(const box of run('globe.routeLabels')) {
  for(const marker of run('globe.markers')) assert.ok(!(marker.point[0]>=box.x && marker.point[0]<=box.x+box.width && marker.point[1]>=box.y && marker.point[1]<=box.y+box.height),'Labels do not cover country markers');
}
const box=run('globe.routeLabels.find(b=>b.id!==globe.selected) || globe.routeLabels[0]');
const labelPointer={...pointer,clientX:box.x+box.width/2,clientY:box.y+box.height/2,pointerId:20};
events.pointermove(labelPointer);context.labelPointer=labelPointer;
assert.equal(run('globe.hitRoute(labelPointer)'),box.id,'Hover expansion retains the original label target');
events.pointerdown(labelPointer);events.pointerup(labelPointer);
assert.equal(selectedRoute,box.id,'Clicking an expanded annotation selects its route');
console.log('Globe geometry, clipping, rotation, drag/select controls and motion lifecycle passed.');
