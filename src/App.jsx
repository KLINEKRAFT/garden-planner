import { useState, useRef, useEffect, useCallback } from "react";

const GW=18,GH=14,TILE=26,TH=TILE*0.5,ZS=TILE*0.84;
const BED_Z=0.75,FENCE_Z=3.2,STONE_H=0.22;
const CW=1000,CH=620,OX=500,OY=128;
const CLOSE_W=0.9,HIT_W=0.55;
let _id=0; const uid=()=>`s${++_id}`;

const iso=(wx,wy,wz=0)=>({x:OX+(wx-wy)*TILE,y:OY+(wx+wy)*TH-wz*ZS});
const toWorld=(sx,sy)=>{const rx=(sx-OX)/TILE,ry=(sy-OY)/TH;return{x:(rx+ry)/2,y:(ry-rx)/2};};
const clamp=p=>({x:Math.max(0.05,Math.min(GW-0.05,p.x)),y:Math.max(0.05,Math.min(GH-0.05,p.y))});

const pip=(pts,p)=>{let ins=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const xi=pts[i].x,yi=pts[i].y,xj=pts[j].x,yj=pts[j].y;if((yi>p.y)!==(yj>p.y)&&p.x<((xj-xi)*(p.y-yi)/(yj-yi)+xi))ins=!ins;}return ins;};
const dSeg=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(!l2)return Math.hypot(p.x-a.x,p.y-a.y);const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
const prand=s=>{const x=Math.sin(s*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const centroid=pts=>({x:pts.reduce((s,p)=>s+p.x,0)/pts.length,y:pts.reduce((s,p)=>s+p.y,0)/pts.length});

const PLANTS={
  tree:   {c1:'#1e5c1e',c2:'#2a7a2a',c3:'#3a9a3a',trunk:'#6b4020',h:5.5,r:1.9,label:'T'},
  shrub:  {c1:'#2a5e2a',c2:'#3a7e3a',c3:'#4ea04e',trunk:null,      h:1.6,r:1.1,label:'S'},
  flower: {c1:'#9e2060',c2:'#c83880',c3:'#e060a0',trunk:null,      h:0.7,r:0.45,label:'F'},
  grass:  {c1:'#3a7a30',c2:'#52a040',c3:'#6ac050',trunk:null,      h:0.55,r:0.7,label:'G'},
  boulder:{c1:'#5e5a52',c2:'#7a7468',c3:'#9e9688',trunk:null,      h:0.75,r:0.6,label:'B'},
};
const BED_TOPS=['#4e8060','#5e9ab8','#b87830','#8850b0','#b0a028','#b03838'];

function isoPolygon(ctx,pts,z){ctx.beginPath();pts.forEach((p,i)=>{const s=iso(p.x,p.y,z);i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y);});ctx.closePath();}

function drawGround(ctx){
  const corners=[[0,0],[GW,0],[GW,GH],[0,GH]].map(([x,y])=>iso(x,y,0));
  ctx.beginPath();corners.forEach((c,i)=>i?ctx.lineTo(c.x+8,c.y+6):ctx.moveTo(c.x+8,c.y+6));ctx.closePath();
  ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fill();
  ctx.beginPath();corners.forEach((c,i)=>i?ctx.lineTo(c.x,c.y):ctx.moveTo(c.x,c.y));ctx.closePath();
  ctx.fillStyle='#3a7828';ctx.fill();
  ctx.save();ctx.beginPath();corners.forEach((c,i)=>i?ctx.lineTo(c.x,c.y):ctx.moveTo(c.x,c.y));ctx.closePath();ctx.clip();
  ctx.strokeStyle='rgba(0,0,0,0.04)';ctx.lineWidth=1;
  for(let i=1;i<GW+GH;i+=2){
    const ax=Math.min(i,GW),ay=Math.max(0,i-GW),bx=Math.max(0,i-GH),by=Math.min(i,GH);
    const a=iso(ax,ay,0),b=iso(bx,by,0);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();corners.forEach((c,i)=>i?ctx.lineTo(c.x,c.y):ctx.moveTo(c.x,c.y));ctx.closePath();
  ctx.strokeStyle='rgba(80,160,50,0.3)';ctx.lineWidth=1.5;ctx.stroke();
}

function drawFence(ctx){
  const planks=0.3;
  const drawWall=(ax,ay,bx,by,lit)=>{
    const at=iso(ax,ay,FENCE_Z),bt=iso(bx,by,FENCE_Z),ab=iso(ax,ay,0),bb=iso(bx,by,0);
    ctx.beginPath();ctx.moveTo(at.x,at.y);ctx.lineTo(bt.x,bt.y);ctx.lineTo(bb.x,bb.y);ctx.lineTo(ab.x,ab.y);ctx.closePath();
    ctx.fillStyle=lit?'#9b6e42':'#7a5230';ctx.fill();
    const len=Math.hypot(bx-ax,by-ay),steps=Math.max(1,Math.round(len/planks));
    for(let i=1;i<steps;i++){const t=i/steps,px=ax+(bx-ax)*t,py=ay+(by-ay)*t,pt=iso(px,py,FENCE_Z),pb=iso(px,py,0);ctx.beginPath();ctx.moveTo(pt.x,pt.y);ctx.lineTo(pb.x,pb.y);ctx.strokeStyle='rgba(0,0,0,0.12)';ctx.lineWidth=0.8;ctx.stroke();}
    ctx.beginPath();ctx.moveTo(at.x,at.y);ctx.lineTo(bt.x,bt.y);ctx.strokeStyle='#5c3a20';ctx.lineWidth=3;ctx.stroke();
    const mz=FENCE_Z*0.48,am=iso(ax,ay,mz),bm=iso(bx,by,mz);
    ctx.beginPath();ctx.moveTo(am.x,am.y);ctx.lineTo(bm.x,bm.y);ctx.strokeStyle='#5c3a20';ctx.lineWidth=2;ctx.stroke();
    if(lit){ctx.beginPath();ctx.moveTo(at.x,at.y-1);ctx.lineTo(bt.x,bt.y-1);ctx.strokeStyle='rgba(200,160,100,0.35)';ctx.lineWidth=1;ctx.stroke();}
  };
  drawWall(0,0,GW,0,false);
  drawWall(GW,0,GW,GH,true);
  drawWall(0,0,0,GH,false);
  drawWall(0,GH,GW,GH,true);
}

function drawPath(ctx,s){
  if(!s.points||s.points.length<2)return;
  const w=s.w*0.5;
  for(let i=0;i<s.points.length-1;i++){
    const a=s.points[i],b=s.points[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
    const nx=(-dy/len)*w,ny=(dx/len)*w;
    const c1=iso(a.x+nx,a.y+ny,0.02),c2=iso(b.x+nx,b.y+ny,0.02),c3=iso(b.x-nx,b.y-ny,0.02),c4=iso(a.x-nx,a.y-ny,0.02);
    ctx.beginPath();ctx.moveTo(c1.x,c1.y);ctx.lineTo(c2.x,c2.y);ctx.lineTo(c3.x,c3.y);ctx.lineTo(c4.x,c4.y);ctx.closePath();
    ctx.fillStyle='rgba(196,176,136,0.75)';ctx.fill();ctx.strokeStyle='rgba(160,140,100,0.5)';ctx.lineWidth=1;ctx.stroke();
  }
}

function drawBedSides(ctx,pts){
  for(let i=0;i<pts.length;i++){
    const a=pts[i],b=pts[(i+1)%pts.length],dx=b.x-a.x,dy=b.y-a.y;
    if(dy<=dx)continue;
    const lit=Math.abs(dy)>Math.abs(dx);
    const at=iso(a.x,a.y,BED_Z),bt=iso(b.x,b.y,BED_Z),ab=iso(a.x,a.y,0),bb=iso(b.x,b.y,0);
    ctx.beginPath();ctx.moveTo(at.x,at.y);ctx.lineTo(bt.x,bt.y);ctx.lineTo(bb.x,bb.y);ctx.lineTo(ab.x,ab.y);ctx.closePath();
    ctx.fillStyle=lit?'#7a4820':'#4a2810';ctx.fill();ctx.strokeStyle='rgba(0,0,0,0.15)';ctx.lineWidth=0.5;ctx.stroke();
  }
}

function drawBedTop(ctx,pts,ci){
  isoPolygon(ctx,pts,BED_Z);ctx.fillStyle='#5a3215';ctx.fill();
  ctx.fillStyle=BED_TOPS[ci%BED_TOPS.length]+'28';ctx.fill();
  const cen=centroid(pts);
  for(let i=0;i<26;i++){
    const r1=prand(ci*100+i),r2=prand(ci*100+i+0.5),r3=prand(ci*100+i+0.7);
    const wx=cen.x+(r1-0.5)*3.5,wy=cen.y+(r2-0.5)*3;
    if(!pip(pts,{x:wx,y:wy}))continue;
    const p=iso(wx,wy,BED_Z+0.02);
    ctx.beginPath();ctx.arc(p.x,p.y,1.2+r3*2,0,Math.PI*2);ctx.fillStyle=`rgba(36,18,6,${0.22+r3*0.18})`;ctx.fill();
  }
}

function drawBedStones(ctx,pts){
  const SLEN=0.52,SWID=0.26,GAP=0.09,step=SLEN+GAP;
  for(let i=0;i<pts.length;i++){
    const a=pts[i],b=pts[(i+1)%pts.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<0.1)continue;
    const ux=dx/len,uy=dy/len,nx=uy,ny=-ux;
    let t=GAP,si=0;
    while(t+SLEN<=len){
      const cx=a.x+ux*(t+SLEN/2),cy=a.y+uy*(t+SLEN/2),seed=i*200+si;
      const r1=prand(seed),r2=prand(seed+0.3),r3=prand(seed+0.7);
      const sl=SLEN*(0.8+r1*0.3),sw=SWID*(0.8+r2*0.2),g=148+Math.round(r3*36);
      const off=sw*0.25;
      const c1={x:cx-ux*sl/2+nx*off,y:cy-uy*sl/2+ny*off};
      const c2={x:cx+ux*sl/2+nx*off,y:cy+uy*sl/2+ny*off};
      const c3={x:cx+ux*sl/2-nx*(sw-off),y:cy+uy*sl/2-ny*(sw-off)};
      const c4={x:cx-ux*sl/2-nx*(sw-off),y:cy-uy*sl/2-ny*(sw-off)};
      const topZ=BED_Z+STONE_H;
      const p1=iso(c1.x,c1.y,topZ),p2=iso(c2.x,c2.y,topZ),p3=iso(c3.x,c3.y,topZ),p4=iso(c4.x,c4.y,topZ);
      if(dy>dx){
        const p1b=iso(c1.x,c1.y,BED_Z),p2b=iso(c2.x,c2.y,BED_Z);
        ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.lineTo(p2b.x,p2b.y);ctx.lineTo(p1b.x,p1b.y);ctx.closePath();
        ctx.fillStyle=`rgba(${g-40},${g-44},${g-38},0.9)`;ctx.fill();
      }
      ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.lineTo(p3.x,p3.y);ctx.lineTo(p4.x,p4.y);ctx.closePath();
      ctx.fillStyle=`rgba(${g},${g-4},${g-8},0.93)`;ctx.fill();
      ctx.strokeStyle=`rgba(${g-28},${g-32},${g-26},0.5)`;ctx.lineWidth=0.5;ctx.stroke();
      ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=0.8;ctx.stroke();
      t+=step;si++;
    }
  }
}

function drawPlant(ctx,s){
  const cfg=PLANTS[s.pt]??PLANTS.tree;
  const {x,y,r}=s;
  const base=iso(x,y,0.05);
  ctx.save();ctx.translate(base.x+r*TILE*0.35,base.y+r*TH*0.5);ctx.scale(1,0.35);
  ctx.beginPath();ctx.arc(0,0,r*TILE*0.75,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.2)';ctx.fill();ctx.restore();

  if(s.pt==='boulder'){
    const tp=iso(x,y,cfg.h);
    [[Math.PI*0.5,Math.PI,false],[0,Math.PI*0.5,true]].forEach(([aA,bA,lit])=>{
      const ax=x+Math.cos(aA)*r*0.9,ay=y+Math.sin(aA)*r*0.5,bx=x+Math.cos(bA)*r*0.9,by=y+Math.sin(bA)*r*0.5;
      const at=iso(ax,ay,cfg.h),bt=iso(bx,by,cfg.h),ab=iso(ax,ay,0.05),bb=iso(bx,by,0.05);
      ctx.beginPath();ctx.moveTo(at.x,at.y);ctx.lineTo(bt.x,bt.y);ctx.lineTo(bb.x,bb.y);ctx.lineTo(ab.x,ab.y);ctx.closePath();
      ctx.fillStyle=lit?cfg.c2:cfg.c1;ctx.fill();
    });
    ctx.beginPath();ctx.ellipse(tp.x,tp.y,r*TILE*0.85,r*TILE*0.44,0,0,Math.PI*2);
    ctx.fillStyle=cfg.c3;ctx.fill();ctx.strokeStyle='rgba(0,0,0,0.18)';ctx.lineWidth=1;ctx.stroke();
    return;
  }

  if(cfg.trunk){
    const tt=iso(x,y,cfg.h*0.55),tb=iso(x,y,0.05),tw=Math.max(3,r*TILE*0.18);
    ctx.fillStyle=cfg.trunk;ctx.fillRect(tt.x-tw/2,tt.y,tw,tb.y-tt.y);
  }

  const layers=s.pt==='tree'?3:2;
  for(let li=0;li<layers;li++){
    const t=li/(layers-1);
    const lz=BED_Z+cfg.h*(0.52+t*0.52);
    const lPos=iso(x,y,lz);
    const lr=r*TILE*(1.0-t*0.38);
    ctx.beginPath();ctx.ellipse(lPos.x,lPos.y,lr,lr*0.52,0,0,Math.PI*2);
    ctx.fillStyle=[cfg.c1,cfg.c2,cfg.c3][Math.min(li,2)];ctx.fill();
    if(li===layers-1){
      ctx.beginPath();ctx.ellipse(lPos.x-lr*0.2,lPos.y-lr*0.15,lr*0.28,lr*0.15,-0.4,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,0.12)';ctx.fill();
    }
  }

  if(s.pt==='grass'){
    const gp=iso(x,y,BED_Z+0.1);
    for(let gi=0;gi<8;gi++){
      const angle=(gi/8)*Math.PI*2,gr=prand(gi+x*10)*0.5+0.5;
      const gx=gp.x+Math.cos(angle)*r*TILE*gr*0.7,gy=gp.y+Math.sin(angle)*r*TH*gr*0.7;
      const gTop=iso(x+Math.cos(angle)*r*gr*0.7,y+Math.sin(angle)*r*gr*0.7,BED_Z+cfg.h*(0.7+gr*0.4));
      ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(gTop.x,gTop.y);ctx.strokeStyle=cfg.c3;ctx.lineWidth=1.5;ctx.stroke();
    }
  }
}

function drawSelectionOverlay(ctx,s){
  if(s.type==='plant'){
    const p=iso(s.x,s.y,PLANTS[s.pt].h);
    ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.strokeStyle='#ffffffcc';ctx.lineWidth=2;ctx.stroke();
  } else if(s.points){
    s.points.forEach(p=>{
      const sp=iso(p.x,p.y,s.type==='bed'?BED_Z+0.05:0.05);
      ctx.beginPath();ctx.arc(sp.x,sp.y,7,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fill();ctx.strokeStyle='#6ea4c4';ctx.lineWidth=1.5;ctx.stroke();
    });
  }
}

export default function App(){
  const cvs=useRef(null),isDragRef=useRef(false),dragMRef=useRef(null);
  const [shapes,setShapes]=useState([]);
  const [selId,setSelId]=useState(null);
  const [selNode,setSelNode]=useState(null);
  const [tool,setTool]=useState('select');
  const [pType,setPType]=useState('tree');
  const [pathW,setPathW]=useState(1.4);
  const [drawing,setDrawing]=useState([]);
  const [cursor,setCursor]=useState(null);
  const [isDragCursor,setIsDragCursor]=useState(false);
  const R=useRef({});
  R.current={shapes,selId,selNode,tool,pType,pathW,drawing,cursor};

  useEffect(()=>{
    const c=cvs.current;if(!c)return;
    const ctx=c.getContext('2d');
    ctx.clearRect(0,0,CW,CH);ctx.fillStyle='#111';ctx.fillRect(0,0,CW,CH);
    const{shapes,selId,selNode,drawing:dp,cursor:cp,tool}=R.current;
    const sorted=[...shapes].sort((a,b)=>{
      const da=a.type==='plant'?a.x+a.y:(a.points?centroid(a.points).x+centroid(a.points).y:0);
      const db=b.type==='plant'?b.x+b.y:(b.points?centroid(b.points).x+centroid(b.points).y:0);
      return da-db;
    });
    drawGround(ctx);
    sorted.filter(s=>s.type==='path').forEach(s=>drawPath(ctx,s));
    sorted.filter(s=>s.type==='bed').forEach(s=>drawBedSides(ctx,s.points,s.ci));
    sorted.filter(s=>s.type==='bed').forEach(s=>{drawBedTop(ctx,s.points,s.ci);drawBedStones(ctx,s.points);});
    sorted.filter(s=>s.type==='plant').forEach(s=>drawPlant(ctx,s));
    drawFence(ctx);
    const sel=shapes.find(s=>s.id===selId);if(sel)drawSelectionOverlay(ctx,sel);
    if(dp.length&&cp&&(tool==='bed'||tool==='path')){
      const col=tool==='bed'?'#7fffaa':'#ffdd70';
      ctx.setLineDash([5,4]);ctx.strokeStyle=col;ctx.lineWidth=1.5;
      ctx.beginPath();dp.forEach((p,i)=>{const sp=iso(p.x,p.y,tool==='bed'?BED_Z:0.05);i?ctx.lineTo(sp.x,sp.y):ctx.moveTo(sp.x,sp.y);});
      const csp=iso(cp.x,cp.y,tool==='bed'?BED_Z:0.05);ctx.lineTo(csp.x,csp.y);ctx.stroke();ctx.setLineDash([]);
      if(tool==='bed'&&dp.length>=3){
        const d=Math.hypot(cp.x-dp[0].x,cp.y-dp[0].y),sp0=iso(dp[0].x,dp[0].y,BED_Z);
        ctx.strokeStyle=d<CLOSE_W?'#fff':col+'55';ctx.lineWidth=1;ctx.beginPath();ctx.arc(sp0.x,sp0.y,14,0,Math.PI*2);ctx.stroke();
      }
      dp.forEach((p,i)=>{const sp=iso(p.x,p.y,tool==='bed'?BED_Z:0.05);ctx.beginPath();ctx.arc(sp.x,sp.y,5,0,Math.PI*2);ctx.fillStyle=i===0?'#fff':col;ctx.fill();});
    }
    if(tool==='plant'&&cp){
      const cfg=PLANTS[R.current.pType],p=iso(cp.x,cp.y,BED_Z+cfg.h);
      ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.fillStyle=cfg.c2+'88';ctx.fill();ctx.strokeStyle='#ffffffaa';ctx.lineWidth=1.5;ctx.stroke();
    }
  },[shapes,selId,selNode,drawing,cursor,tool,pType]);

  const toPos=useCallback(e=>{
    const c=cvs.current,r=c.getBoundingClientRect();
    return clamp(toWorld((e.clientX-r.left)*(CW/r.width),(e.clientY-r.top)*(CH/r.height)));
  },[]);

  const findHit=useCallback(pos=>{
    const{shapes,selId}=R.current,sel=shapes.find(s=>s.id===selId);
    if(sel?.points){const ni=sel.points.findIndex(p=>Math.hypot(p.x-pos.x,p.y-pos.y)<HIT_W);if(ni!==-1)return{s:sel,part:'node',ni};}
    for(let i=shapes.length-1;i>=0;i--){
      const s=shapes[i];
      if(s.type==='plant'&&Math.hypot(s.x-pos.x,s.y-pos.y)<s.r*1.4)return{s,part:'body'};
      if(s.type==='bed'&&s.points?.length>=3&&pip(s.points,pos))return{s,part:'body'};
      if(s.type==='path'&&s.points?.length>=2){for(let j=0;j<s.points.length-1;j++)if(dSeg(pos,s.points[j],s.points[j+1])<s.w*0.6)return{s,part:'body'};}
    }
    return null;
  },[]);

  const onDown=useCallback(e=>{
    const pos=toPos(e);const{tool,drawing,pType,pathW}=R.current;
    if(tool==='select'){
      const h=findHit(pos);
      if(h){setSelId(h.s.id);setSelNode(h.part==='node'?h.ni:null);isDragRef.current=true;setIsDragCursor(true);dragMRef.current={sp:pos,orig:JSON.parse(JSON.stringify(h.s)),part:h.part,ni:h.ni};}
      else{setSelId(null);setSelNode(null);}
      return;
    }
    if(tool==='bed'){
      if(drawing.length>=3&&Math.hypot(pos.x-drawing[0].x,pos.y-drawing[0].y)<CLOSE_W){
        const ns={id:uid(),type:'bed',points:[...drawing],ci:R.current.shapes.filter(s=>s.type==='bed').length};
        setShapes(p=>[...p,ns]);setSelId(ns.id);setDrawing([]);setCursor(null);setTool('select');
      }else setDrawing(p=>[...p,pos]);
      return;
    }
    if(tool==='path'){setDrawing(p=>[...p,pos]);return;}
    if(tool==='plant'){
      const cfg=PLANTS[pType];
      const ns={id:uid(),type:'plant',x:pos.x,y:pos.y,pt:pType,r:cfg.r};
      setShapes(p=>[...p,ns]);setSelId(ns.id);setTool('select');
    }
  },[toPos,findHit]);

  const onMove=useCallback(e=>{
    const pos=toPos(e);setCursor(pos);
    if(!isDragRef.current||!dragMRef.current)return;
    const dm=dragMRef.current,dx=pos.x-dm.sp.x,dy=pos.y-dm.sp.y,o=dm.orig;
    setShapes(prev=>prev.map(s=>{
      if(s.id!==o.id)return s;
      if(dm.part==='node')return{...s,points:o.points.map((p,i)=>i===dm.ni?clamp({x:p.x+dx,y:p.y+dy}):{...p})};
      if(dm.part==='body'&&s.type==='plant'){const np=clamp({x:o.x+dx,y:o.y+dy});return{...s,x:np.x,y:np.y};}
      if(dm.part==='body'&&s.points)return{...s,points:o.points.map(p=>clamp({x:p.x+dx,y:p.y+dy}))};
      return s;
    }));
  },[toPos]);

  const onUp=useCallback(()=>{isDragRef.current=false;dragMRef.current=null;setIsDragCursor(false);},[]);

  useEffect(()=>{
    const kd=e=>{
      if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
      const{selId,tool,drawing,pathW}=R.current;
      if((e.key==='Delete'||e.key==='Backspace')&&selId){setShapes(p=>p.filter(s=>s.id!==selId));setSelId(null);setSelNode(null);}
      if(e.key==='Escape'){setDrawing([]);setCursor(null);setTool('select');}
      if(e.key==='Enter'){
        if(tool==='path'&&drawing.length>=2){const ns={id:uid(),type:'path',points:[...drawing],w:pathW};setShapes(p=>[...p,ns]);setSelId(ns.id);setDrawing([]);setCursor(null);setTool('select');}
        if(tool==='bed'&&drawing.length>=3){const ns={id:uid(),type:'bed',points:[...drawing],ci:R.current.shapes.filter(s=>s.type==='bed').length};setShapes(p=>[...p,ns]);setSelId(ns.id);setDrawing([]);setCursor(null);setTool('select');}
      }
    };
    window.addEventListener('keydown',kd);return()=>window.removeEventListener('keydown',kd);
  },[]);

  useEffect(()=>{setDrawing([]);setCursor(null);},[tool]);
  const onExport=useCallback(()=>{const a=document.createElement('a');a.download='garden-iso.png';a.href=cvs.current.toDataURL('image/png');a.click();},[]);

  const selShape=shapes.find(s=>s.id===selId);
  const bedC=shapes.filter(s=>s.type==='bed').length,pathC=shapes.filter(s=>s.type==='path').length,plantC=shapes.filter(s=>s.type==='plant').length;

  const TB=({id,icon,label})=>(<button onClick={()=>setTool(id)} style={{background:tool===id?'#6ea4c4':'transparent',border:`1px solid ${tool===id?'#6ea4c4':'#242424'}`,color:tool===id?'#000':'#545454',padding:'9px 5px',cursor:'pointer',borderRadius:'2px',display:'flex',flexDirection:'column',alignItems:'center',gap:'4px',fontFamily:'Helvetica Neue,Arial,sans-serif',width:'100%'}}><span style={{fontSize:'17px',lineHeight:1}}>{icon}</span><span style={{fontSize:'7px',letterSpacing:'0.14em',fontWeight:700}}>{label}</span></button>);
  const PB=({id,label})=>(<button onClick={()=>setPType(id)} style={{background:pType===id?'#181818':'transparent',border:`1px solid ${pType===id?PLANTS[id].c2:'#222'}`,color:pType===id?'#ddd':'#484848',padding:'5px 8px',cursor:'pointer',borderRadius:'2px',display:'flex',alignItems:'center',gap:'7px',fontFamily:'Helvetica Neue,Arial,sans-serif',width:'100%',marginBottom:'3px'}}><div style={{width:'7px',height:'7px',borderRadius:'50%',background:PLANTS[id].c2,flexShrink:0}}/><span style={{fontSize:'8px',letterSpacing:'0.13em',fontWeight:700}}>{label}</span></button>);
  const Lbl=({t})=>(<div style={{fontSize:'8px',letterSpacing:'0.18em',color:'#3a3a3a',marginBottom:'8px',fontWeight:700}}>{t}</div>);
  const Hint=({lines})=>(<div style={{fontSize:'8px',color:'#2e2e2e',letterSpacing:'0.08em',lineHeight:1.85}}>{lines.map((l,i)=><div key={i}>{l}</div>)}</div>);

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#0d0d0d',color:'#ccc',fontFamily:'Helvetica Neue,Arial,sans-serif',userSelect:'none',overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',padding:'0 16px',height:'42px',borderBottom:'1px solid #1a1a1a',gap:'10px',flexShrink:0}}>
        <span style={{fontSize:'10px',letterSpacing:'0.22em',fontWeight:700,color:'#d8d8d8'}}>GARDEN PLAN</span>
        <div style={{fontSize:'7px',letterSpacing:'0.15em',color:'#6ea4c4',padding:'2px 7px',border:'1px solid #6ea4c4',borderRadius:'2px',fontWeight:700}}>ISO</div>
        <div style={{width:'1px',height:'18px',background:'#1e1e1e'}}/>
        <span style={{fontSize:'8px',letterSpacing:'0.1em',color:'#383838'}}>{bedC} BED{bedC!==1?'S':''} · {pathC} PATH{pathC!==1?'S':''} · {plantC} PLANT{plantC!==1?'S':''}</span>
        <div style={{flex:1}}/>
        <button onClick={onExport} style={{background:'#6ea4c4',border:'1px solid #6ea4c4',color:'#000',padding:'4px 10px',cursor:'pointer',borderRadius:'2px',fontSize:'8px',letterSpacing:'0.13em',fontWeight:700}}>EXPORT PNG</button>
      </div>
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div style={{width:'62px',borderRight:'1px solid #1a1a1a',padding:'10px 5px',display:'flex',flexDirection:'column',gap:'5px',flexShrink:0}}>
          <TB id="select" icon="↖" label="SELECT"/>
          <TB id="bed"    icon="⬡" label="BED"/>
          <TB id="path"   icon="↝" label="PATH"/>
          <TB id="plant"  icon="✿" label="PLANT"/>
          <div style={{flex:1}}/>
          <button onClick={()=>{setShapes([]);setSelId(null);setSelNode(null);}} style={{background:'transparent',border:'1px solid #1a1a1a',color:'#303030',padding:'6px',cursor:'pointer',borderRadius:'2px',fontSize:'7px',letterSpacing:'0.12em',fontWeight:700,fontFamily:'inherit'}}>CLEAR</button>
        </div>
        <div style={{flex:1,overflow:'auto',display:'flex',alignItems:'center',justifyContent:'center',background:'#0a0a0a'}}>
          <canvas ref={cvs} width={CW} height={CH} style={{cursor:isDragCursor?'grabbing':tool!=='select'?'crosshair':'default',display:'block',maxWidth:'100%',maxHeight:'100%'}} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}/>
        </div>
        <div style={{width:'152px',borderLeft:'1px solid #1a1a1a',padding:'12px 10px',display:'flex',flexDirection:'column',gap:'14px',flexShrink:0,overflowY:'auto'}}>
          {tool==='plant'&&<div><Lbl t="PLANT TYPE"/><PB id="tree" label="TREE"/><PB id="shrub" label="SHRUB"/><PB id="flower" label="FLOWER"/><PB id="grass" label="GRASS"/><PB id="boulder" label="BOULDER"/></div>}
          {tool==='path'&&<div><Lbl t="PATH WIDTH"/><div style={{fontSize:'22px',fontWeight:700,color:'#6ea4c4',textAlign:'center',marginBottom:'5px',lineHeight:1}}>{pathW.toFixed(1)}</div><input type="range" min={0.5} max={4} step={0.1} value={pathW} onChange={e=>setPathW(+e.target.value)} style={{width:'100%',accentColor:'#6ea4c4',marginBottom:'10px'}}/><Hint lines={['CLICK TO ADD POINTS','ENTER TO FINISH','ESC TO CANCEL']}/></div>}
          {tool==='bed'&&<div><Lbl t="FLOWER BED"/><Hint lines={['CLICK TO ADD POINTS','CLICK FIRST POINT','OR ENTER TO CLOSE','ESC TO CANCEL']}/></div>}
          {tool==='select'&&selShape&&<div>
            <Lbl t="SELECTED"/>
            <div style={{fontSize:'9px',color:'#686868',letterSpacing:'0.1em',lineHeight:1.5,marginBottom:'10px',marginTop:'-4px'}}>{selShape.type.toUpperCase()}{selShape.type==='plant'?` · ${selShape.pt.toUpperCase()}`:''}</div>
            {selShape.type==='path'&&<div style={{marginBottom:'10px'}}><div style={{fontSize:'7px',color:'#383838',letterSpacing:'0.12em',marginBottom:'5px'}}>PATH WIDTH: {selShape.w.toFixed(1)}</div><input type="range" min={0.5} max={4} step={0.1} value={selShape.w} onChange={e=>setShapes(p=>p.map(s=>s.id===selId?{...s,w:+e.target.value}:s))} style={{width:'100%',accentColor:'#6ea4c4'}}/></div>}
            <Hint lines={['DRAG NODES TO RESHAPE','DRAG BODY TO MOVE']}/>
            <button onClick={()=>{setShapes(p=>p.filter(s=>s.id!==selId));setSelId(null);setSelNode(null);}} style={{background:'transparent',border:'1px solid #2e1414',color:'#8a2e2e',padding:'5px',cursor:'pointer',borderRadius:'2px',fontSize:'8px',letterSpacing:'0.12em',fontWeight:700,width:'100%',fontFamily:'inherit',marginTop:'10px'}}>DELETE SHAPE</button>
          </div>}
          {tool==='select'&&!selShape&&<div><Lbl t="SELECT"/><Hint lines={['CLICK TO SELECT','DRAG BODY TO MOVE','DRAG NODES TO EDIT','DEL TO DELETE']}/></div>}
          <div style={{marginTop:'auto',paddingTop:'10px',borderTop:'1px solid #1a1a1a'}}>
            <Lbl t="LEGEND"/>
            {Object.entries(PLANTS).map(([k,v])=>(<div key={k} style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'5px'}}><div style={{width:'7px',height:'7px',borderRadius:'50%',background:v.c2,flexShrink:0}}/><span style={{fontSize:'7px',color:'#363636',letterSpacing:'0.1em'}}>{k.toUpperCase()}</span></div>))}
          </div>
        </div>
      </div>
      <div style={{borderTop:'1px solid #141414',padding:'4px 16px',display:'flex',gap:'18px',fontSize:'7px',color:'#282828',letterSpacing:'0.13em',flexShrink:0,background:'#080808'}}>
        <span style={{color:'#353535'}}>TOOL: {tool.toUpperCase()}</span>
        {drawing.length>0&&<span style={{color:'#484848'}}>{drawing.length} PTS · {tool==='bed'?'CLICK ORIGIN / ENTER TO CLOSE':'ENTER TO FINISH'} · ESC CANCEL</span>}
        {selId&&!drawing.length&&<span>BACKSPACE OR DEL TO REMOVE</span>}
      </div>
    </div>
  );
}
