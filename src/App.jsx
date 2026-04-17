import { useState, useRef, useEffect, useCallback } from "react";

// ─── Config ────────────────────────────────────────────────
const PLANT_DEFS = {
  tree:    { fill: 'rgba(28,72,28,0.55)',   stroke: '#4a9a4a', label: 'T', r: 50 },
  shrub:   { fill: 'rgba(52,96,58,0.55)',   stroke: '#68be74', label: 'S', r: 28 },
  flower:  { fill: 'rgba(168,46,110,0.55)', stroke: '#de72b2', label: 'F', r: 16 },
  grass:   { fill: 'rgba(70,148,80,0.48)',  stroke: '#9cd29c', label: 'G', r: 22 },
  boulder: { fill: 'rgba(82,78,74,0.70)',   stroke: '#aeaaa2', label: 'B', r: 24 },
};

const BED_COLORS = [
  ['rgba(74,124,89,0.42)',  '#5a9e70'],
  ['rgba(90,145,195,0.42)','#6ea4c4'],
  ['rgba(196,138,60,0.42)','#c49040'],
  ['rgba(148,80,188,0.42)','#9a5ec0'],
  ['rgba(196,186,58,0.42)','#c4bc3a'],
  ['rgba(196,70,70,0.42)', '#c44646'],
];

const CLOSE_D = 18, NR = 7;
let _id = 0;
const uid = () => `s${++_id}`;

// ─── Geometry ───────────────────────────────────────────────
function pip(pts, p) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi) / (yj - yi) + xi)) ins = !ins;
  }
  return ins;
}

function dSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function offsetPolygon(pts, amount) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return pts.map(p => {
    const dx = p.x - cx, dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * amount, y: p.y + (dy / len) * amount };
  });
}

function prand(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Stone Edging ───────────────────────────────────────────
function drawStoneEdging(ctx, pts) {
  const STONE_LEN = 22;
  const STONE_W   = 13;
  const GAP       = 4;
  const SHADOW_DY = 5;
  const step      = STONE_LEN + GAP;

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const edgeLen = Math.hypot(ex, ey);
    if (edgeLen < 1) continue;
    const ux = ex / edgeLen, uy = ey / edgeLen;

    let t = GAP, stoneIdx = 0;
    while (t + STONE_LEN <= edgeLen) {
      const cx = a.x + ux * (t + STONE_LEN / 2);
      const cy = a.y + uy * (t + STONE_LEN / 2);
      const seed = i * 1000 + stoneIdx;
      const r1 = prand(seed), r2 = prand(seed + 0.31), r3 = prand(seed + 0.67);
      const sw = STONE_LEN * (0.82 + r1 * 0.28);
      const sh = STONE_W   * (0.82 + r2 * 0.22);
      const g  = 145 + Math.round(r3 * 38);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.atan2(uy, ux));

      // Side / shadow face
      roundRect(ctx, -sw / 2, -sh / 2 + SHADOW_DY, sw, sh, 3);
      ctx.fillStyle = `rgba(${g-38},${g-43},${g-36},0.88)`;
      ctx.fill();

      // Top face
      roundRect(ctx, -sw / 2, -sh / 2, sw, sh, 3);
      ctx.fillStyle = `rgba(${g},${g-4},${g-8},0.93)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${g-30},${g-34},${g-28},0.5)`;
      ctx.lineWidth = 0.75;
      ctx.stroke();

      // Highlight
      ctx.beginPath();
      ctx.moveTo(-sw / 2 + 4, -sh / 2 + 2);
      ctx.lineTo(sw / 2 - 4, -sh / 2 + 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
      t += step;
      stoneIdx++;
    }
  }
}

// ─── Berm (raised bed depth) ────────────────────────────────
function drawBerm(ctx, pts) {
  // Outer shadow
  const outer = offsetPolygon(pts, 6);
  ctx.beginPath();
  outer.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  ctx.fillStyle = 'rgba(55,34,12,0.62)';
  ctx.fill();

  // Soil wall face
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  ctx.fillStyle = 'rgba(88,58,22,0.52)';
  ctx.fill();

  // Top soil surface (inset)
  const inset = offsetPolygon(pts, -10);
  if (inset.length < 3) return;
  ctx.beginPath();
  inset.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  ctx.fillStyle = 'rgba(110,78,35,0.38)';
  ctx.fill();
}

// ─── Canvas Draw Functions ──────────────────────────────────
function drawBed(ctx, s, sel, sn) {
  if (!s.points || s.points.length < 3) return;
  const [f, stroke] = BED_COLORS[s.ci % BED_COLORS.length];
  const pts = s.points;

  drawBerm(ctx, pts);

  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  ctx.fillStyle = f;
  ctx.fill();

  drawStoneEdging(ctx, pts);

  if (sel) {
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    ctx.strokeStyle = '#ffffffcc';
    ctx.lineWidth = 2;
    ctx.stroke();
    pts.forEach((p, i) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, NR, 0, Math.PI * 2);
      ctx.fillStyle = sn === i ? '#fff' : stroke; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  }
}

function drawPath(ctx, s, sel, sn) {
  if (!s.points || s.points.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Open trace — NO closePath, path has a start and a finish
  const openTrace = () => {
    ctx.beginPath();
    s.points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
  };

  openTrace();
  ctx.strokeStyle = 'rgba(212,192,155,0.52)';
  ctx.lineWidth = s.w;
  ctx.stroke();

  openTrace();
  ctx.strokeStyle = sel ? '#ffffffaa' : 'rgba(220,205,170,0.55)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([9, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Endpoint dots to show the path is open
  [s.points[0], s.points[s.points.length - 1]].forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = sel ? '#fff' : 'rgba(220,205,170,0.75)';
    ctx.fill();
  });

  if (sel) {
    s.points.forEach((p, i) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, NR, 0, Math.PI * 2);
      ctx.fillStyle = sn === i ? '#fff' : '#c8b880'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  }
}

function drawPlant(ctx, s, sel, sn) {
  const d = PLANT_DEFS[s.pt] ?? PLANT_DEFS.tree;
  ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
  ctx.fillStyle = d.fill; ctx.fill();
  ctx.strokeStyle = sel ? '#ffffffcc' : d.stroke;
  ctx.lineWidth = sel ? 2 : 1.5; ctx.stroke();
  if (s.pt === 'tree' || s.pt === 'shrub') {
    const r2 = s.r * 0.47;
    for (let a = 0; a < Math.PI * 2; a += 1.1) {
      ctx.beginPath(); ctx.arc(s.x + Math.cos(a)*r2, s.y + Math.sin(a)*r2, s.r*0.22, 0, Math.PI*2);
      ctx.fillStyle = d.stroke + '40'; ctx.fill();
    }
  }
  const fs = Math.max(9, Math.min(s.r * 0.52, 20));
  ctx.save();
  ctx.font = `700 ${fs}px Helvetica Neue, Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(d.label, s.x, s.y);
  ctx.restore();
  if (sel) {
    ctx.beginPath(); ctx.arc(s.x + s.r, s.y, NR, 0, Math.PI * 2);
    ctx.fillStyle = sn === 'rz' ? '#fff' : d.stroke; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

// ─── Main Component ─────────────────────────────────────────
export default function App() {
  const cvs = useRef(null);
  const imgEl = useRef(null);
  const isDragRef = useRef(false);
  const dragMRef = useRef(null);

  const [hasPhoto, setHasPhoto] = useState(false);
  const [shapes, setShapes] = useState([]);
  const [selId, setSelId] = useState(null);
  const [selNode, setSelNode] = useState(null);
  const [tool, setTool] = useState('select');
  const [pType, setPType] = useState('tree');
  const [pathW, setPathW] = useState(40);
  const [drawing, setDrawing] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [isDragCursor, setIsDragCursor] = useState(false);

  const R = useRef({});
  R.current = { shapes, selId, selNode, tool, pType, pathW, drawing, cursor };

  useEffect(() => {
    const c = cvs.current; if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (imgEl.current) ctx.drawImage(imgEl.current, 0, 0, c.width, c.height);
    else { ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, c.width, c.height); }

    const { shapes, selId, selNode, drawing: dp, cursor: cp, tool } = R.current;
    shapes.forEach(s => {
      const sel = s.id === selId, sn = sel ? selNode : null;
      if (s.type === 'bed') drawBed(ctx, s, sel, sn);
      else if (s.type === 'path') drawPath(ctx, s, sel, sn);
      else if (s.type === 'plant') drawPlant(ctx, s, sel, sn);
    });

    if (dp.length && cp && (tool === 'bed' || tool === 'path')) {
      const col = tool === 'bed' ? '#7fffaa' : '#ffdd70';
      ctx.save();
      ctx.setLineDash([5, 4]); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath();
      dp.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.lineTo(cp.x, cp.y); ctx.stroke();
      if (tool === 'bed' && dp.length >= 3) {
        const dist = Math.hypot(cp.x - dp[0].x, cp.y - dp[0].y);
        ctx.setLineDash([]);
        ctx.strokeStyle = dist < CLOSE_D ? 'rgba(255,255,255,0.9)' : col + '50';
        ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(dp[0].x, dp[0].y, CLOSE_D, 0, Math.PI*2); ctx.stroke();
      }
      ctx.restore();
      dp.forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, NR - 1, 0, Math.PI*2);
        ctx.fillStyle = i === 0 ? '#fff' : col; ctx.fill();
      });
    }
  }, [hasPhoto, shapes, selId, selNode, drawing, cursor, tool]);

  const toPos = useCallback(e => {
    const c = cvs.current, r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }, []);

  const findHit = useCallback(pos => {
    const { shapes, selId } = R.current;
    const sel = shapes.find(s => s.id === selId);
    if (sel) {
      if (sel.type === 'plant') {
        if (Math.hypot(sel.x + sel.r - pos.x, sel.y - pos.y) < NR + 5) return { s: sel, part: 'rz' };
        if (Math.hypot(sel.x - pos.x, sel.y - pos.y) < sel.r) return { s: sel, part: 'body' };
      } else {
        const ni = (sel.points || []).findIndex(p => Math.hypot(p.x - pos.x, p.y - pos.y) < NR + 5);
        if (ni !== -1) return { s: sel, part: 'node', ni };
      }
    }
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.type === 'plant' && Math.hypot(s.x - pos.x, s.y - pos.y) < s.r) return { s, part: 'body' };
      if (s.type === 'bed' && s.points?.length >= 3 && pip(s.points, pos)) return { s, part: 'body' };
      if (s.type === 'path' && s.points?.length >= 2) {
        for (let j = 0; j < s.points.length - 1; j++)
          if (dSeg(pos, s.points[j], s.points[j+1]) < s.w / 2 + 4) return { s, part: 'body' };
      }
    }
    return null;
  }, []);

  const onDown = useCallback(e => {
    const pos = toPos(e);
    const { tool, drawing, pType, pathW } = R.current;
    if (tool === 'select') {
      const h = findHit(pos);
      if (h) {
        setSelId(h.s.id);
        setSelNode(h.part === 'node' ? h.ni : h.part === 'rz' ? 'rz' : null);
        isDragRef.current = true;
        dragMRef.current = { sp: pos, orig: JSON.parse(JSON.stringify(h.s)), part: h.part, ni: h.ni };
        setIsDragCursor(true);
      } else { setSelId(null); setSelNode(null); }
      return;
    }
    if (tool === 'bed') {
      if (drawing.length >= 3 && Math.hypot(pos.x - drawing[0].x, pos.y - drawing[0].y) < CLOSE_D) {
        const ns = { id: uid(), type: 'bed', points: [...drawing], ci: R.current.shapes.filter(s => s.type === 'bed').length };
        setShapes(p => [...p, ns]); setSelId(ns.id); setDrawing([]); setCursor(null); setTool('select');
      } else setDrawing(p => [...p, pos]);
      return;
    }
    // Path — just add point, no close detection
    if (tool === 'path') { setDrawing(p => [...p, pos]); return; }
    if (tool === 'plant') {
      const ns = { id: uid(), type: 'plant', x: pos.x, y: pos.y, pt: pType, r: PLANT_DEFS[pType].r };
      setShapes(p => [...p, ns]); setSelId(ns.id); setTool('select');
    }
  }, [toPos, findHit]);

  const onMove = useCallback(e => {
    const pos = toPos(e);
    setCursor(pos);
    if (!isDragRef.current || !dragMRef.current) return;
    const dm = dragMRef.current, dx = pos.x - dm.sp.x, dy = pos.y - dm.sp.y, o = dm.orig;
    setShapes(prev => prev.map(s => {
      if (s.id !== o.id) return s;
      if (dm.part === 'node') return { ...s, points: o.points.map((p, i) => i === dm.ni ? { x: p.x+dx, y: p.y+dy } : {...p}) };
      if (dm.part === 'body' && s.type === 'plant') return { ...s, x: o.x+dx, y: o.y+dy };
      if (dm.part === 'body' && s.points) return { ...s, points: o.points.map(p => ({ x: p.x+dx, y: p.y+dy })) };
      if (dm.part === 'rz' && s.type === 'plant') return { ...s, r: Math.max(10, Math.hypot(pos.x - o.x, pos.y - o.y)) };
      return s;
    }));
  }, [toPos]);

  const onUp = useCallback(() => { isDragRef.current = false; dragMRef.current = null; setIsDragCursor(false); }, []);

  useEffect(() => {
    const kd = e => {
      if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
      const { selId, tool, drawing, pathW } = R.current;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selId) {
        setShapes(p => p.filter(s => s.id !== selId)); setSelId(null); setSelNode(null);
      }
      if (e.key === 'Escape') { setDrawing([]); setCursor(null); setTool('select'); }
      if (e.key === 'Enter') {
        if (tool === 'path' && drawing.length >= 2) {
          const ns = { id: uid(), type: 'path', points: [...drawing], w: pathW };
          setShapes(p => [...p, ns]); setSelId(ns.id); setDrawing([]); setCursor(null); setTool('select');
        }
        if (tool === 'bed' && drawing.length >= 3) {
          const ns = { id: uid(), type: 'bed', points: [...drawing], ci: R.current.shapes.filter(s => s.type === 'bed').length };
          setShapes(p => [...p, ns]); setSelId(ns.id); setDrawing([]); setCursor(null); setTool('select');
        }
      }
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, []);

  useEffect(() => { setDrawing([]); setCursor(null); }, [tool]);

  const loadImg = useCallback(file => {
    if (!file?.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgEl.current = img;
      const c = cvs.current;
      const sc = Math.min(1, 1200 / img.naturalWidth, 750 / img.naturalHeight);
      c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
      setHasPhoto(true);
    };
    img.src = url;
  }, []);

  const onExport = useCallback(() => {
    const a = document.createElement('a');
    a.download = 'garden-plan.png'; a.href = cvs.current.toDataURL('image/png'); a.click();
  }, []);

  const selShape = shapes.find(s => s.id === selId);
  const bedC = shapes.filter(s => s.type === 'bed').length;
  const pathC = shapes.filter(s => s.type === 'path').length;
  const plantC = shapes.filter(s => s.type === 'plant').length;

  const S = {
    toolBtn: (active) => ({
      background: active ? '#6ea4c4' : 'transparent',
      border: `1px solid ${active ? '#6ea4c4' : '#242424'}`,
      color: active ? '#000' : '#545454',
      padding: '9px 5px', cursor: 'pointer', borderRadius: '2px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
      fontFamily: 'Helvetica Neue, Arial, sans-serif', width: '100%',
      transition: 'background 0.1s, border-color 0.1s, color 0.1s',
    }),
    plantBtn: (id) => ({
      background: pType === id ? '#181818' : 'transparent',
      border: `1px solid ${pType === id ? PLANT_DEFS[id].stroke : '#222'}`,
      color: pType === id ? '#ddd' : '#484848',
      padding: '5px 8px', cursor: 'pointer', borderRadius: '2px',
      display: 'flex', alignItems: 'center', gap: '7px',
      fontFamily: 'Helvetica Neue, Arial, sans-serif', width: '100%', marginBottom: '3px',
      transition: 'all 0.1s',
    }),
    deleteBtn: {
      background: 'transparent', border: '1px solid #2e1414', color: '#8a2e2e',
      padding: '5px', cursor: 'pointer', borderRadius: '2px',
      fontSize: '8px', letterSpacing: '0.12em', fontWeight: 700,
      width: '100%', fontFamily: 'Helvetica Neue, Arial, sans-serif',
    },
    label: { fontSize: '8px', letterSpacing: '0.18em', color: '#3a3a3a', marginBottom: '8px', fontWeight: 700 },
    hint: { fontSize: '8px', color: '#2e2e2e', letterSpacing: '0.08em', lineHeight: 1.85 },
  };

  const ToolBtn = ({ id, icon, label }) => (
    <button onClick={() => setTool(id)} style={S.toolBtn(tool === id)}>
      <span style={{ fontSize: '17px', lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: '7px', letterSpacing: '0.14em', fontWeight: 700 }}>{label}</span>
    </button>
  );

  const PlantBtn = ({ id, label }) => (
    <button onClick={() => setPType(id)} style={S.plantBtn(id)}>
      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: PLANT_DEFS[id].stroke, flexShrink: 0 }} />
      <span style={{ fontSize: '8px', letterSpacing: '0.13em', fontWeight: 700 }}>{label}</span>
    </button>
  );

  const Hint = ({ lines }) => (
    <div style={S.hint}>{lines.map((l, i) => <div key={i}>{l}</div>)}</div>
  );

  const Label = ({ text }) => <div style={S.label}>{text}</div>;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#0d0d0d', color: '#ccc',
      fontFamily: 'Helvetica Neue, Arial, sans-serif',
      userSelect: 'none', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', padding: '0 16px',
        height: '42px', borderBottom: '1px solid #1a1a1a', gap: '10px', flexShrink: 0,
      }}>
        <span style={{ fontSize: '10px', letterSpacing: '0.22em', fontWeight: 700, color: '#d8d8d8' }}>GARDEN PLAN</span>
        <div style={{ width: '1px', height: '18px', background: '#1e1e1e' }} />
        <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: '#383838' }}>
          {bedC} BED{bedC !== 1 ? 'S' : ''} · {pathC} PATH{pathC !== 1 ? 'S' : ''} · {plantC} PLANT{plantC !== 1 ? 'S' : ''}
        </span>
        <div style={{ flex: 1 }} />
        <label style={{ background: 'transparent', border: '1px solid #242424', color: '#585858', padding: '4px 10px', cursor: 'pointer', borderRadius: '2px', fontSize: '8px', letterSpacing: '0.13em', fontWeight: 700 }}>
          LOAD PHOTO
          <input type="file" accept="image/*" onChange={e => loadImg(e.target.files[0])} style={{ display: 'none' }} />
        </label>
        <button onClick={onExport} disabled={!hasPhoto} style={{
          background: hasPhoto ? '#6ea4c4' : 'transparent',
          border: `1px solid ${hasPhoto ? '#6ea4c4' : '#242424'}`,
          color: hasPhoto ? '#000' : '#2e2e2e',
          padding: '4px 10px', cursor: hasPhoto ? 'pointer' : 'default',
          borderRadius: '2px', fontSize: '8px', letterSpacing: '0.13em', fontWeight: 700,
        }}>EXPORT PNG</button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: '62px', borderRight: '1px solid #1a1a1a', padding: '10px 5px', display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
          <ToolBtn id="select" icon="↖" label="SELECT" />
          <ToolBtn id="bed"    icon="⬡" label="BED" />
          <ToolBtn id="path"   icon="↝" label="PATH" />
          <ToolBtn id="plant"  icon="✿" label="PLANT" />
          <div style={{ flex: 1 }} />
          <button onClick={() => { setShapes([]); setSelId(null); setSelNode(null); }} style={{
            background: 'transparent', border: '1px solid #1a1a1a', color: '#303030',
            padding: '6px', cursor: 'pointer', borderRadius: '2px',
            fontSize: '7px', letterSpacing: '0.12em', fontWeight: 700, fontFamily: 'Helvetica Neue, Arial, sans-serif',
          }}>CLEAR</button>
        </div>

        <div
          style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080808', position: 'relative' }}
          onDrop={e => { e.preventDefault(); loadImg(e.dataTransfer.files[0]); }}
          onDragOver={e => e.preventDefault()}
        >
          {!hasPhoto && (
            <div style={{ position: 'absolute', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: '28px', color: '#1a1a1a', marginBottom: '10px' }}>↓</div>
              <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#222', fontWeight: 700, marginBottom: '5px' }}>DROP A PHOTO TO BEGIN</div>
              <div style={{ fontSize: '8px', letterSpacing: '0.15em', color: '#1a1a1a' }}>OR USE LOAD PHOTO ABOVE</div>
            </div>
          )}
          <canvas
            ref={cvs} width={1000} height={650}
            style={{ cursor: isDragCursor ? 'grabbing' : tool !== 'select' ? 'crosshair' : 'default', display: 'block', maxWidth: '100%', maxHeight: '100%' }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          />
        </div>

        <div style={{ width: '152px', borderLeft: '1px solid #1a1a1a', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '14px', flexShrink: 0, overflowY: 'auto' }}>
          {tool === 'plant' && (
            <div>
              <Label text="PLANT TYPE" />
              <PlantBtn id="tree" label="TREE" />
              <PlantBtn id="shrub" label="SHRUB" />
              <PlantBtn id="flower" label="FLOWER" />
              <PlantBtn id="grass" label="GRASS" />
              <PlantBtn id="boulder" label="BOULDER" />
            </div>
          )}
          {tool === 'path' && (
            <div>
              <Label text="PATH WIDTH" />
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#6ea4c4', textAlign: 'center', marginBottom: '5px', lineHeight: 1 }}>{pathW}</div>
              <input type="range" min={10} max={120} value={pathW} onChange={e => setPathW(+e.target.value)} style={{ width: '100%', accentColor: '#6ea4c4', marginBottom: '10px' }} />
              <Hint lines={['CLICK TO ADD POINTS', 'ENTER TO FINISH', 'ESC TO CANCEL']} />
            </div>
          )}
          {tool === 'bed' && (
            <div>
              <Label text="FLOWER BED" />
              <Hint lines={['CLICK TO ADD POINTS', 'CLICK FIRST POINT', 'OR ENTER TO CLOSE', 'ESC TO CANCEL']} />
            </div>
          )}
          {tool === 'select' && selShape && (
            <div>
              <Label text="SELECTED" />
              <div style={{ fontSize: '9px', color: '#686868', letterSpacing: '0.1em', lineHeight: 1.5, marginBottom: '10px', marginTop: '-4px' }}>
                {selShape.type.toUpperCase()}{selShape.type === 'plant' ? ` · ${selShape.pt.toUpperCase()}` : ''}
              </div>
              {selShape.type === 'path' && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '7px', color: '#383838', letterSpacing: '0.12em', marginBottom: '5px' }}>PATH WIDTH: {selShape.w}</div>
                  <input type="range" min={10} max={120} value={selShape.w}
                    onChange={e => setShapes(p => p.map(s => s.id === selId ? { ...s, w: +e.target.value } : s))}
                    style={{ width: '100%', accentColor: '#6ea4c4' }} />
                </div>
              )}
              <Hint lines={['DRAG NODES TO RESHAPE', 'DRAG BODY TO MOVE', ...(selShape.type === 'plant' ? ['DRAG RING TO RESIZE'] : [])]} />
              <button onClick={() => { setShapes(p => p.filter(s => s.id !== selId)); setSelId(null); setSelNode(null); }} style={{ ...S.deleteBtn, marginTop: '10px' }}>
                DELETE SHAPE
              </button>
            </div>
          )}
          {tool === 'select' && !selShape && (
            <div>
              <Label text="SELECT" />
              <Hint lines={['CLICK TO SELECT', 'DRAG BODY TO MOVE', 'DRAG NODES TO EDIT', 'DEL TO DELETE']} />
            </div>
          )}
          <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid #1a1a1a' }}>
            <Label text="LEGEND" />
            {Object.entries(PLANT_DEFS).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: v.stroke, flexShrink: 0 }} />
                <span style={{ fontSize: '7px', color: '#363636', letterSpacing: '0.1em' }}>{k.toUpperCase()}</span>
              </div>
            ))}
            <div style={{ height: '6px' }} />
            {BED_COLORS.slice(0, 3).map(([f, s], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
                <div style={{ width: '12px', height: '7px', background: f, border: `1px solid ${s}`, borderRadius: '1px', flexShrink: 0 }} />
                <span style={{ fontSize: '7px', color: '#363636', letterSpacing: '0.1em' }}>BED {i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #141414', padding: '4px 16px', display: 'flex', gap: '18px', fontSize: '7px', color: '#282828', letterSpacing: '0.13em', flexShrink: 0, background: '#080808' }}>
        <span style={{ color: '#353535' }}>TOOL: {tool.toUpperCase()}</span>
        {drawing.length > 0 && (
          <span style={{ color: '#484848' }}>
            {drawing.length} PTS · {tool === 'bed' ? 'CLICK ORIGIN / ENTER TO CLOSE · ESC CANCEL' : 'ENTER TO FINISH · ESC CANCEL'}
          </span>
        )}
        {selId && !drawing.length && <span>BACKSPACE OR DEL TO REMOVE SELECTED</span>}
      </div>
    </div>
  );
}
