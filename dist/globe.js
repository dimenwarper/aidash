"use strict";

// Geographic data are Natural Earth land boundaries; markers represent the
// coverage of national indicators, not facility locations or causal AI effects.
class SupplyGlobe {
  static locations = [
    {id:"grid", coordinates:[-98,39], label:"United States"},
    {id:"power", coordinates:[-8,53], label:"Ireland"},
  ];

  constructor(canvas, {onSelect, onMotion, onError, onZoom=()=>{}, onRouteSelect=()=>{}, locations=SupplyGlobe.locations, routes=[]}) {
    this.canvas=canvas;
    this.context=canvas.getContext("2d");
    if (!this.context || !globalThis.d3?.geoOrthographic || !globalThis.topojson) throw new Error("Globe renderer unavailable");
    this.onSelect=onSelect; this.onMotion=onMotion; this.onError=onError;
    this.onZoom=onZoom;this.onRouteSelect=onRouteSelect;this.zoom=1;this.pointers=new Map();this.pinch=null;this.hoveredRoute=null;this.hoverBounds=null;
    this.locations=locations; this.routes=routes;
    this.rotation=[35,-25,0]; this.selected="power"; this.active=false; this.frame=null;
    this.visible=true; this.drag=null; this.lastTime=null; this.land=null;
    this.reducedMotion=matchMedia("(prefers-reduced-motion: reduce)");
    this.running=!this.reducedMotion.matches;
    this.projection=d3.geoOrthographic().clipAngle(90).precision(.4);
    this.graticule=d3.geoGraticule10();
    this.bindEvents();
    this.resizeObserver=new ResizeObserver(()=>this.draw());
    this.resizeObserver.observe(canvas);
    if (globalThis.IntersectionObserver) {
      this.intersectionObserver=new IntersectionObserver(([entry])=>{this.visible=entry.isIntersecting;this.sync();});
      this.intersectionObserver.observe(canvas);
    }
    fetch("assets/land-110m.json").then(response=>{if(!response.ok) throw new Error("Map geometry unavailable");return response.json();})
      .then(data=>{this.land=topojson.feature(data,data.objects.land);this.draw();})
      .catch(()=>this.onError());
    this.onMotion(this.running);
    this.onZoom(this.zoom);
  }

  setActive(active) { this.active=active; this.sync(); if(active) this.draw(); }
  setData(locations, routes=[]) { this.locations=locations;this.routes=routes;this.hoveredRoute=null;this.hoverBounds=null;this.draw(); }
  setZoom(value) {
    if(!Number.isFinite(value)) return;
    this.zoom=Math.max(1,Math.min(5,value));this.setRunning(false);this.onZoom(this.zoom);this.draw();
  }
  setRunning(running) { this.running=running;this.lastTime=null;this.onMotion(running);this.sync(); }
  select(id, center=false) {
    this.selected=id;
    const marker=this.locations.find(item=>item.id===id);
    if(center && marker) { this.rotation=[-marker.coordinates[0],-marker.coordinates[1],0];this.setRunning(false); }
    this.draw();
  }
  sync() {
    const animate=this.active && this.visible && this.running && !document.hidden && !this.drag && !this.hoveredRoute;
    if(!animate) { if(this.frame!==null) cancelAnimationFrame(this.frame);this.frame=null;this.lastTime=null;return; }
    if(this.frame===null) this.frame=requestAnimationFrame(time=>this.tick(time));
  }
  tick(time) {
    this.frame=null;
    if(this.lastTime!==null) this.rotation[0]=(this.rotation[0]+Math.min(time-this.lastTime,100)*.006)%360;
    this.lastTime=time;this.draw();this.sync();
  }
  resize() {
    const width=this.canvas.clientWidth;
    if(!width) return false;
    this.width=width;this.height=Math.min(410,width*.78);
    const pixelRatio=Math.min(globalThis.devicePixelRatio || 1,2);
    if(this.canvas.width!==Math.round(width*pixelRatio) || this.canvas.height!==Math.round(this.height*pixelRatio)) {
      this.canvas.width=Math.round(width*pixelRatio);this.canvas.height=Math.round(this.height*pixelRatio);
    }
    this.context.setTransform(pixelRatio,0,0,pixelRatio,0,0);
    this.radius=Math.min(width*.43,this.height*.46)*this.zoom;
    this.projection.translate([width/2,this.height/2]).scale(this.radius).rotate(this.rotation);
    return true;
  }
  projectedMarkers() {
    const center=this.projection.invert([this.width/2,this.height/2]);
    return this.locations.filter(marker=>d3.geoDistance(marker.coordinates,center)<Math.PI/2-.035)
      .map(marker=>({...marker,point:this.projection(marker.coordinates)}))
      .filter(marker=>this.inViewport(marker.point,8));
  }
  inViewport(point,margin=0) { return point[0]>=margin && point[0]<=this.width-margin && point[1]>=margin && point[1]<=this.height-margin; }
  routeGeometry(route) {
    const interpolate=d3.geoInterpolate(route.from,route.to),center=this.projection.invert([this.width/2,this.height/2]);
    const reciprocal=this.routes.some(other=>other.id!==route.id && other.from.every((v,i)=>v===route.to[i]) && other.to.every((v,i)=>v===route.from[i]));
    // Reciprocal exports use opposite sides of the same geodesic. The fixed
    // pixel separation distinguishes direction without encoding trade volume.
    const points=Array.from({length:81},(_,i)=>{
      const t=i/80,coordinates=interpolate(t),point=this.projection(coordinates),a=this.projection(interpolate(Math.max(0,t-.005))),b=this.projection(interpolate(Math.min(1,t+.005))),angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
      if(reciprocal) {point[0]-=Math.sin(angle)*5;point[1]+=Math.cos(angle)*5;}
      return {t,point,angle,visible:d3.geoDistance(coordinates,center)<Math.PI/2-.025};
    });
    const segments=points.slice(1).flatMap((p,i)=>p.visible && points[i].visible?[[points[i].point,p.point]]:[]);
    const anchors=points.filter(p=>p.visible && p.t>.08 && p.t<.92 && this.inViewport(p.point,24)).sort((a,b)=>Math.abs(a.t-.5)-Math.abs(b.t-.5));
    return {...route,segments,anchors};
  }
  drawRouteLabels(routes,occupied) {
    const ctx=this.context;this.routeLabels=[];
    const focus=this.hoveredRoute || this.selected;
    const ordered=[...routes].sort((a,b)=>Number(b.id===focus)-Number(a.id===focus));
    for(const route of ordered) {
      if(!route.annotation || !route.anchors.length) continue;
      const selected=route.id===focus;
      const lines=selected?[route.label,route.annotation]:[route.valueLabel || route.annotation];
      ctx.font=(selected?"500 13px":"13px")+" 'DM Sans', Arial, sans-serif";
      const width=Math.min(this.width-16,Math.max(...lines.map(line=>ctx.measureText(line).width))+16),height=lines.length*17+10;
      let box=null,anchor=null;
      for(const candidate of route.anchors.filter((_,i)=>i%4===0)) {
        for(const [dx,dy] of [[0,-height-10],[0,12],[-width/2-12,-height/2],[width/2+12,-height/2]]) {
          const x=candidate.point[0]-width/2+dx,y=candidate.point[1]+dy;
          const overlaps=occupied.some(b=>x<b.x+b.width+5 && x+width+5>b.x && y<b.y+b.height+4 && y+height+4>b.y);
          if(x<5 || x+width>this.width-5 || y<5 || y+height>this.height-5 || overlaps) continue;
          box={x,y,width,height};anchor=candidate.point;break;
        }
        if(box) break;
      }
      if(!box) continue;
      ctx.beginPath();ctx.moveTo(...anchor);ctx.lineTo(Math.max(box.x,Math.min(box.x+width,anchor[0])),Math.max(box.y,Math.min(box.y+height,anchor[1])));ctx.strokeStyle=selected?"#315b72":"#9aa997";ctx.lineWidth=.8;ctx.stroke();
      ctx.fillStyle=selected?"#f8f7f3":"rgba(248,247,243,.94)";ctx.fillRect(box.x,box.y,width,height);
      ctx.strokeStyle=selected?"#315b72":"#d6d5ce";ctx.strokeRect(box.x,box.y,width,height);
      ctx.fillStyle="#20211f";lines.forEach((line,i)=>ctx.fillText(line,box.x+8,box.y+18+i*17,width-16));
      occupied.push(box);this.routeLabels.push({...box,id:route.id});
    }
  }
  hitRoute(event) {
    const [x,y]=this.pointerPosition(event);
    // Keep a hovered label clickable if expanding it moved its drawn box.
    const previous=this.hoverBounds;
    if(this.hoveredRoute && previous && x>=previous.x && x<=previous.x+previous.width && y>=previous.y && y<=previous.y+previous.height) return this.hoveredRoute;
    const label=(this.routeLabels || []).find(b=>x>=b.x && x<=b.x+b.width && y>=b.y && y<=b.y+b.height);
    if(label) return label.id;
    let nearest=null,best=8;
    const focus=this.hoveredRoute || this.selected;
    for(const route of [...(this.drawnRoutes || [])].sort((a,b)=>Number(b.id===focus)-Number(a.id===focus))) {
      let distance=Infinity;
      for(const [a,b] of route.segments) {
        const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy || 1)));
        distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));
      }
      if(distance<best && (!nearest || distance<best-1)) {nearest=route.id;best=distance;}
    }
    return nearest;
  }
  draw() {
    if(!this.active || !this.resize()) return;
    const ctx=this.context, path=d3.geoPath(this.projection,ctx);
    ctx.clearRect(0,0,this.width,this.height);
    ctx.beginPath();path({type:"Sphere"});ctx.fillStyle="#eff0eb";ctx.fill();
    ctx.beginPath();path(this.graticule);ctx.strokeStyle="#d5d9d2";ctx.lineWidth=.6;ctx.stroke();
    if(this.land) {ctx.beginPath();path(this.land);ctx.fillStyle="#c4cfc1";ctx.fill();ctx.strokeStyle="#9aa997";ctx.lineWidth=.55;ctx.stroke();}
    const shade=ctx.createRadialGradient(this.width*.4,this.height*.35,this.radius*.2,this.width*.5,this.height*.5,this.radius);
    shade.addColorStop(0,"rgba(248,247,243,0)");shade.addColorStop(.82,"rgba(32,33,31,.015)");shade.addColorStop(1,"rgba(32,33,31,.13)");
    ctx.beginPath();path({type:"Sphere"});ctx.fillStyle=shade;ctx.fill();ctx.strokeStyle="#929c91";ctx.lineWidth=.8;ctx.stroke();
    this.drawnRoutes=this.routes.map(route=>this.routeGeometry(route));
    const focus=this.hoveredRoute || this.selected;
    for(const route of [...this.drawnRoutes].sort((a,b)=>Number(a.id===focus)-Number(b.id===focus))) {
      ctx.beginPath();for(const [a,b] of route.segments) {ctx.moveTo(...a);ctx.lineTo(...b);}
      ctx.strokeStyle=route.id===focus?"#315b72":"rgba(49,91,114,.40)";
      ctx.lineWidth=route.id===focus?2.8:1.3;ctx.stroke();
      const arrow=route.anchors.find(p=>p.t>=.55) || route.anchors[0];
      if(arrow) {
        const angle=arrow.angle;
        const [x,y]=arrow.point,size=route.id===focus?8:6;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-size*Math.cos(angle-.5),y-size*Math.sin(angle-.5));ctx.lineTo(x-size*Math.cos(angle+.5),y-size*Math.sin(angle+.5));ctx.closePath();ctx.fillStyle=route.id===focus?"#315b72":"#668293";ctx.fill();
      }
    }
    this.markers=this.projectedMarkers();
    const occupied=[{x:this.width-130,y:4,width:125,height:44}];
    for(const marker of this.markers) {
      const [x,y]=marker.point, selected=marker.id===this.selected;
      occupied.push({x:x-19,y:y-19,width:38,height:38});
      ctx.beginPath();ctx.arc(x,y,selected?10:8,0,Math.PI*2);ctx.fillStyle="rgba(49,91,114,.13)";ctx.fill();
      ctx.beginPath();ctx.arc(x,y,selected?4.5:3.5,0,Math.PI*2);ctx.fillStyle="#315b72";ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle="#f8f7f3";ctx.stroke();
      ctx.font="12px 'DM Sans', Arial, sans-serif";
      const textWidth=ctx.measureText(marker.label).width;
      const tx=Math.min(this.width-textWidth-8,Math.max(8,x+13)),ty=y-9;
      ctx.fillStyle="rgba(248,247,243,.91)";ctx.fillRect(tx-4,ty-13,textWidth+8,19);
      ctx.fillStyle="#20211f";ctx.fillText(marker.label,tx,ty);
      occupied.push({x:tx-4,y:ty-13,width:textWidth+8,height:19});
    }
    this.drawRouteLabels(this.drawnRoutes,occupied);
  }
  pointerPosition(event) {
    const rect=this.canvas.getBoundingClientRect();
    return [(event.clientX-rect.left)*this.width/rect.width,(event.clientY-rect.top)*this.height/rect.height];
  }
  hit(event) {
    const [x,y]=this.pointerPosition(event);
    return (this.markers || []).find(marker=>Math.hypot(marker.point[0]-x,marker.point[1]-y)<18);
  }
  bindEvents() {
    const canvas=this.canvas;
    canvas.addEventListener("pointerdown",event=>{
      if(event.button!==0) return;
      const route=this.hitRoute(event);
      this.setRunning(false);this.hoveredRoute=null;this.hoverBounds=null;
      this.pointers.set(event.pointerId,[event.clientX,event.clientY]);
      if(this.pointers.size>1) {const [a,b]=[...this.pointers.values()];this.pinch={distance:Math.max(1,Math.hypot(a[0]-b[0],a[1]-b[1])),zoom:this.zoom};if(this.drag) this.drag.moved=true;canvas.setPointerCapture(event.pointerId);return;}
      this.drag={x:event.clientX,y:event.clientY,rotation:[...this.rotation],moved:false,id:event.pointerId,route};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove",event=>{
      if(this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId,[event.clientX,event.clientY]);
      if(this.pinch && this.pointers.size>1) {const [a,b]=[...this.pointers.values()];this.setZoom(this.pinch.zoom*Math.hypot(a[0]-b[0],a[1]-b[1])/this.pinch.distance);return;}
      if(!this.drag) {
        const route=this.hitRoute(event);canvas.style.cursor=this.hit(event) || route?"pointer":"grab";
        canvas.title=this.routes.find(r=>r.id===route)?.tooltip || "";
        if(route!==this.hoveredRoute) {this.hoverBounds=(this.routeLabels || []).find(b=>b.id===route) || null;this.hoveredRoute=route;this.draw();this.sync();}return;
      }
      if(event.pointerId!==this.drag.id) return;
      const dx=event.clientX-this.drag.x,dy=event.clientY-this.drag.y;
      this.drag.moved=this.drag.moved || Math.hypot(dx,dy)>4;
      this.rotation=[this.drag.rotation[0]+dx*.3/this.zoom,Math.max(-80,Math.min(80,this.drag.rotation[1]-dy*.3/this.zoom)),0];
      canvas.style.cursor="grabbing";this.draw();
    });
    const release=event=>{
      this.pointers.delete(event.pointerId);
      if(this.pinch) {this.pinch=null;const remaining=[...this.pointers.entries()][0];this.drag=remaining?{id:remaining[0],x:remaining[1][0],y:remaining[1][1],rotation:[...this.rotation],moved:true}:null;if(canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);return;}
      if(!this.drag || this.drag.id!==event.pointerId) return;
      const marker=!this.drag.moved && event.type==="pointerup" ? this.hit(event) : null;
      const route=!this.drag.moved && event.type==="pointerup" && !marker?this.drag.route || this.hitRoute(event):null;
      this.drag=null;canvas.style.cursor="grab";
      if(canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if(marker) this.onSelect(marker.id);
      if(route) this.onRouteSelect(route);
    };
    canvas.addEventListener("pointerup",release);canvas.addEventListener("pointercancel",release);
    canvas.addEventListener("pointerleave",()=>{this.hoveredRoute=null;this.hoverBounds=null;canvas.title="";this.draw();this.sync();});
    canvas.addEventListener("wheel",event=>{if(!this.active) return;event.preventDefault();const scale=event.deltaMode===1?16:event.deltaMode===2?this.height:1;this.setZoom(this.zoom*Math.exp(-Math.max(-500,Math.min(500,event.deltaY*scale))*.002));},{passive:false});
    canvas.addEventListener("keydown",event=>{
      const moves={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,10],ArrowDown:[0,-10]};
      if(moves[event.key]) {event.preventDefault();this.setRunning(false);this.rotation[0]+=moves[event.key][0];this.rotation[1]=Math.max(-80,Math.min(80,this.rotation[1]+moves[event.key][1]));this.draw();}
      if(event.key===" ") {event.preventDefault();this.setRunning(!this.running);}
      if(["+","=","-","_","0"].includes(event.key)) {event.preventDefault();this.setZoom(event.key==="0"?1:this.zoom*(["-","_"].includes(event.key)?1/1.25:1.25));}
    });
    document.addEventListener("visibilitychange",()=>this.sync());
    this.reducedMotion.addEventListener("change",event=>{if(event.matches) this.setRunning(false);});
  }
}
