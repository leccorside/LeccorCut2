const $ = (id) => document.getElementById(id);
const state = {
  media: [], clips: [], texts: [], audios: [], overlays: [], markers: [], selected: null, time: 0, playing: false,
  tracks: {
    video: { visible: true, mute: false },
    overlay: { visible: true },
    text: { visible: true },
    audio: { mute: false, solo: false }
  }
};
const player = $('player'), img = $('imgPlayer');
let pxPerSec = 60, uid = 1, raf = null, lastTs = 0;

const joinDur = (prev, cur, any) => (prev.transition && prev.transition !== 'none')
  ? Math.max(0.05, Math.min(0.5, prev.duration / 2, cur.duration / 2)) : (any ? 0.04 : 0);
function layout() {
  const any = state.clips.some(c => c.transition && c.transition !== 'none');
  const starts = []; let acc = 0;
  state.clips.forEach((c, i) => {
    if (i > 0) acc -= joinDur(state.clips[i - 1], c, any);
    starts.push(acc); acc += c.duration;
  });
  return { starts, end: acc };
}
const total = () => layout().end;
const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const toast = (m) => { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 3500); };
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

// --- Passo 1: cache e renderização de thumbnail strip ---
const imgCache = new Map();
function loadImg(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
  imgCache.set(src, p);
  return p;
}

async function drawThumbStrip(canvas, clip) {
  const thumbs = clip.thumbs;
  if (!thumbs?.length) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const srcDur = clip.srcDur || clip.duration;
  const sp = clip.speed || 1;
  const thumbInterval = srcDur / thumbs.length;
  ctx.fillStyle = '#12141c';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < thumbs.length; i++) {
    const srcTime = i * thumbInterval;
    const screenTime = (srcTime - (clip.in || 0)) / sp;
    const x = Math.round(screenTime * pxPerSec);
    const nextScreenTime = ((i + 1) * thumbInterval - (clip.in || 0)) / sp;
    const drawW = Math.max(1, Math.round(nextScreenTime * pxPerSec) - x);
    if (x + drawW < 0 || x > W) continue;
    const src = fileUrl(thumbs[i]);
    const im = await loadImg(src);
    if (!im) continue;
    const clipX = Math.max(0, x);
    const clipW = Math.min(W, x + drawW) - clipX;
    if (clipW <= 0) continue;
    const srcX = (clipX - x) * (im.naturalWidth / drawW);
    ctx.drawImage(im, srcX, 0, clipW * (im.naturalWidth / drawW), im.naturalHeight, clipX, 0, clipW, H);
  }
}
// --- fim Passo 1 ---

// --- Passo 2: waveform canvas ---
function drawWaveform(canvas, item, color = '#00e5c3', alpha = 0.88) {
  const data = item.waveData;
  if (!data?.length) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const srcDur = item.srcDur || item.max || item.duration;
  const sp = item.speed || 1;
  const inSec = item.in || 0;
  const clipDur = item.duration * sp;
  const startFrac = Math.max(0, inSec / srcDur);
  const endFrac = Math.min(1, (inSec + clipDur) / srcDur);
  const startIdx = Math.floor(startFrac * data.length);
  const endIdx = Math.max(startIdx + 1, Math.ceil(endFrac * data.length));
  const visible = data.slice(startIdx, endIdx);
  if (!visible.length) return;
  const barW = W / visible.length;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  visible.forEach((amp, i) => {
    const h = Math.max(1, amp * H * 0.88);
    ctx.fillRect(Math.floor(i * barW), Math.floor((H - h) / 2), Math.max(1, Math.round(barW)), Math.round(h));
  });
  ctx.globalAlpha = 1;
}
// --- fim Passo 2 ---

// --- Passo 3: keyframes ---
function kfGet(kfs, t, def) {
  if (!kfs?.length) return def;
  if (t <= kfs[0].t) return kfs[0].v;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < kfs.length - 1; i++) {
    if (t >= kfs[i].t && t < kfs[i + 1].t) {
      const p = (t - kfs[i].t) / (kfs[i + 1].t - kfs[i].t);
      const e = 3 * p * p - 2 * p * p * p; // smoothstep easeInOut
      return kfs[i].v + (kfs[i + 1].v - kfs[i].v) * e;
    }
  }
  return def;
}
function kfAdd(item, prop, value, localT) {
  if (!item.keyframes) item.keyframes = {};
  if (!item.keyframes[prop]) item.keyframes[prop] = [];
  const t = parseFloat(Math.max(0, localT).toFixed(3));
  const ex = item.keyframes[prop].findIndex(k => Math.abs(k.t - t) < 0.05);
  if (ex >= 0) item.keyframes[prop][ex].v = value;
  else { item.keyframes[prop].push({ t, v: value }); item.keyframes[prop].sort((a, b) => a.t - b.t); }
  renderTimeline(); renderProps();
}
function kfDel(item, prop, idx) {
  if (item.keyframes?.[prop]) { item.keyframes[prop].splice(idx, 1); renderTimeline(); renderProps(); }
}
function kfDiamonds(e, item) {
  const kfs = item.keyframes || {};
  Object.entries(kfs).forEach(([prop, arr]) => {
    arr.forEach((kf, ki) => {
      const d = document.createElement('div');
      d.className = 'kf-dot';
      d.style.left = (kf.t * pxPerSec) + 'px';
      d.title = `${prop}: ${typeof kf.v === 'number' ? kf.v.toFixed(2) : kf.v} @ ${kf.t.toFixed(2)}s — duplo clique para excluir`;
      d.ondblclick = (ev) => { ev.stopPropagation(); kfDel(item, prop, ki); };
      e.appendChild(d);
    });
  });
}
// --- fim Passo 3 ---

// --- Passo 4: speed ramp ---
function interpSC(curve, t) {
  if (!curve?.length) return 1;
  if (t <= curve[0].t) return curve[0].v;
  const last = curve[curve.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < curve.length - 1; i++) {
    if (t >= curve[i].t && t < curve[i + 1].t) {
      const p = (t - curve[i].t) / (curve[i + 1].t - curve[i].t);
      return curve[i].v + (curve[i + 1].v - curve[i].v) * p;
    }
  }
  return 1;
}
function scSrcTime(curve, tOut) {
  if (!curve?.length) return tOut;
  let src = 0, tPrev = 0, vPrev = interpSC(curve, 0);
  for (const pt of curve) {
    if (pt.t >= tOut) {
      const frac = (tOut - tPrev) / Math.max(0.0001, pt.t - tPrev);
      const vMid = vPrev + (pt.v - vPrev) * frac;
      return src + (vPrev + vMid) / 2 * (tOut - tPrev);
    }
    src += (vPrev + pt.v) / 2 * (pt.t - tPrev);
    tPrev = pt.t; vPrev = pt.v;
  }
  return src + vPrev * (tOut - tPrev);
}
let scDrag = null;
const SC_LOG_MIN = Math.log(0.25), SC_LOG_RANGE = Math.log(4) - Math.log(0.25);
function drawSpeedCurve(canvas, clip) {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth * dpr, ch = canvas.clientHeight * dpr;
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, dur = clip.duration;
  const xOf = (t) => t / dur * W;
  const yOf = (v) => (1 - (Math.log(Math.max(0.05, v)) - SC_LOG_MIN) / SC_LOG_RANGE) * H;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0d0f18'; ctx.fillRect(0, 0, W, H);
  [[4,'4×'],[2,'2×'],[1,'1×'],[0.5,'½×'],[0.25,'¼×']].forEach(([v, lbl]) => {
    const y = yOf(v);
    ctx.strokeStyle = v === 1 ? '#2a2e3f' : '#171a27'; ctx.lineWidth = v === 1 ? 1.5 : 1;
    ctx.setLineDash(v === 1 ? [] : [3, 3]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#8a90a8'; ctx.font = `${Math.round(9 * dpr)}px sans-serif`;
    ctx.fillText(lbl, 2, y - 2 * dpr);
  });
  const curve = (clip.speedCurve || []).slice().sort((a, b) => a.t - b.t);
  ctx.beginPath(); ctx.moveTo(0, yOf(1));
  for (let i = 0; i <= 120; i++) { const t = i / 120 * dur; ctx.lineTo(xOf(t), yOf(interpSC(curve, t))); }
  ctx.lineTo(W, yOf(1)); ctx.closePath();
  ctx.fillStyle = 'rgba(0,229,195,.06)'; ctx.fill();
  ctx.strokeStyle = '#00e5c3'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([]);
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) { const t = i / 120 * dur; i ? ctx.lineTo(xOf(t), yOf(interpSC(curve, t))) : ctx.moveTo(xOf(t), yOf(interpSC(curve, t))); }
  ctx.stroke();
  const clipStart = layout().starts[state.clips.indexOf(clip)] ?? 0;
  const localT = state.time - clipStart;
  if (localT >= 0 && localT <= dur) {
    const cx = xOf(localT);
    ctx.strokeStyle = 'rgba(0,229,195,.5)'; ctx.lineWidth = dpr; ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke(); ctx.setLineDash([]);
  }
  const r = 5 * dpr;
  curve.forEach(pt => {
    const x = xOf(pt.t), y = yOf(pt.v);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#7c5cff'; ctx.fill();
    ctx.strokeStyle = '#e8eaf2'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#e8eaf2'; ctx.font = `${Math.round(8 * dpr)}px sans-serif`;
    ctx.fillText(`${pt.v.toFixed(1)}×`, x + r + 2, y + r / 2);
  });
}
document.addEventListener('mousemove', (ev) => {
  if (!scDrag) return;
  const { pt, clip, canvas } = scDrag;
  const rect = canvas.getBoundingClientRect();
  const mx = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
  const my = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
  pt.t = mx * clip.duration;
  pt.v = Math.max(0.1, Math.min(4, Math.exp(SC_LOG_MIN + (1 - my) * SC_LOG_RANGE)));
  if (clip.speedCurve) clip.speedCurve.sort((a, b) => a.t - b.t);
  drawSpeedCurve(canvas, clip);
  renderPreview();
});
document.addEventListener('mouseup', () => { if (scDrag) { scDrag = null; renderProps(); } });
// --- fim Passo 4 ---

// --- Passo 5: color grading ---
const CG_CW_PX = 76;
let cgCurveDrag = null, cgWheelDrag = null;

function cgDefault() {
  const line = () => [{x:0,y:0},{x:255,y:255}];
  return { curves:{luma:line(),r:line(),g:line(),b:line()}, lift:{r:0,g:0,b:0}, gamma:{r:1,g:1,b:1}, gain:{r:1,g:1,b:1}, hue:0, saturation:0, lightness:0, lutPath:null };
}

function cgCurveY(pts, x) {
  if (!pts?.length) return x;
  if (x <= pts[0].x) return pts[0].y;
  const last = pts[pts.length-1];
  if (x >= last.x) return last.y;
  for (let i=0; i<pts.length-1; i++) {
    if (x >= pts[i].x && x <= pts[i+1].x) {
      const t = (x-pts[i].x)/(pts[i+1].x-pts[i].x);
      return pts[i].y*(1-t) + pts[i+1].y*t;
    }
  }
  return x;
}

function cgTableValues(luma, ch) {
  const vals = [];
  for (let i=0; i<=16; i++) {
    const x = i/16*255;
    const combined = cgCurveY(luma, cgCurveY(ch, x));
    vals.push((Math.max(0,Math.min(255,combined))/255).toFixed(4));
  }
  return vals.join(' ');
}

function cgHasEffect(cg) {
  if (!cg) return false;
  const line = (pts) => !pts || (pts.length===2 && pts[0].x===0 && pts[0].y===0 && pts[1].x===255 && pts[1].y===255);
  const c = cg.curves || {};
  if (!line(c.luma)||!line(c.r)||!line(c.g)||!line(c.b)) return true;
  if (cg.lift?.r||cg.lift?.g||cg.lift?.b) return true;
  if (cg.gamma?.r!==1||cg.gamma?.g!==1||cg.gamma?.b!==1) return true;
  if (cg.gain?.r!==1||cg.gain?.g!==1||cg.gain?.b!==1) return true;
  if (cg.hue||cg.saturation||cg.lightness) return true;
  if (cg.lutPath) return true;
  return false;
}

function cgApplyFilter(cg, clipId) {
  let svgEl = document.getElementById('cgSvgDefs');
  if (!svgEl) {
    svgEl = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svgEl.id='cgSvgDefs'; svgEl.setAttribute('width','0'); svgEl.setAttribute('height','0');
    svgEl.style.cssText='position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    svgEl.innerHTML='<defs></defs>'; document.body.appendChild(svgEl);
  }
  const defs = svgEl.querySelector('defs');
  const fid = 'cg_f_' + clipId;
  let filt = document.getElementById(fid);
  if (!filt) {
    filt = document.createElementNS('http://www.w3.org/2000/svg','filter');
    filt.id=fid; filt.setAttribute('color-interpolation-filters','sRGB');
    defs.appendChild(filt);
  }
  const c = cg.curves || {};
  const luma = c.luma || [{x:0,y:0},{x:255,y:255}];
  const tvR = cgTableValues(luma, c.r || luma);
  const tvG = cgTableValues(luma, c.g || luma);
  const tvB = cgTableValues(luma, c.b || luma);

  const lt = cg.lift || {r:0,g:0,b:0};
  const gam = cg.gamma || {r:1,g:1,b:1};
  const gn = cg.gain || {r:1,g:1,b:1};
  const lggR=[], lggG=[], lggB=[];
  for (let i=0;i<=16;i++) {
    const x=i/16;
    const lgg=(v,lift,gamma,gain)=>Math.max(0,Math.min(1,gain*Math.pow(Math.max(0,v),1/Math.max(0.01,gamma))+lift));
    lggR.push(lgg(x,lt.r,gam.r,gn.r).toFixed(4));
    lggG.push(lgg(x,lt.g,gam.g,gn.g).toFixed(4));
    lggB.push(lgg(x,lt.b,gam.b,gn.b).toFixed(4));
  }
  const sat = Math.max(0,1+(cg.saturation||0)/100);
  const lum = 1+(cg.lightness||0)/100;
  const hue = cg.hue||0;
  filt.innerHTML=`<feComponentTransfer><feFuncR type="table" tableValues="${tvR}"/><feFuncG type="table" tableValues="${tvG}"/><feFuncB type="table" tableValues="${tvB}"/></feComponentTransfer>
<feColorMatrix type="hueRotate" values="${hue}"/>
<feColorMatrix type="saturate" values="${sat}"/>
<feColorMatrix type="matrix" values="${lum} 0 0 0 0 0 ${lum} 0 0 0 0 0 ${lum} 0 0 0 0 0 1 0"/>
<feComponentTransfer><feFuncR type="table" tableValues="${lggR.join(' ')}"/><feFuncG type="table" tableValues="${lggG.join(' ')}"/><feFuncB type="table" tableValues="${lggB.join(' ')}"/></feComponentTransfer>`;
  return fid;
}

function cgRemoveFilter(clipId) {
  const filt = document.getElementById('cg_f_'+clipId);
  if (filt) filt.remove();
}

const CURVE_COLORS = {luma:'#e8eaf2',r:'#ff5555',g:'#55cc55',b:'#5599ff'};
function drawCurveCanvas(canvas, pts, ch) {
  const dpr = window.devicePixelRatio||1;
  const W=canvas.width, H=canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#0d0f18'; ctx.fillRect(0,0,W,H);
  // Grid
  ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=1;
  [64,128,192].forEach(v=>{
    const x=v/255*W, y=(1-v/255)*H;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  });
  // Diagonal reference
  ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,H); ctx.lineTo(W,0); ctx.stroke();
  // Curve
  const col = CURVE_COLORS[ch]||'#e8eaf2';
  ctx.strokeStyle=col; ctx.lineWidth=1.5*dpr; ctx.setLineDash([]);
  ctx.beginPath();
  for (let i=0;i<=128;i++) {
    const x=i/128*255, y=cgCurveY(pts,x);
    const px=x/255*W, py=(1-y/255)*H;
    i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
  }
  ctx.stroke();
  // Control points
  const r=4*dpr;
  pts.forEach((pt,i)=>{
    const px=pt.x/255*W, py=(1-pt.y/255)*H;
    ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2);
    ctx.fillStyle=col; ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
  });
}

function drawColorWheel(canvas, rg, gg, bg) {
  const dpr = window.devicePixelRatio||1;
  const sz = CG_CW_PX*dpr;
  if (canvas.width!==sz) { canvas.width=sz; canvas.height=sz; }
  const ctx=canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;
  const cx=W/2, cy=H/2, R=W/2-dpr;
  ctx.clearRect(0,0,W,H);
  // Draw hue ring with white center
  for (let a=0;a<360;a+=2) {
    const rad=a*Math.PI/180;
    const grad=ctx.createLinearGradient(cx,cy,cx+Math.cos(rad)*R,cy+Math.sin(rad)*R);
    grad.addColorStop(0,'rgba(128,128,128,1)');
    grad.addColorStop(1,`hsl(${a},100%,50%)`);
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,R,rad-Math.PI/90,rad+Math.PI/90);
    ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
  }
  // Clip to circle
  ctx.globalCompositeOperation='destination-in';
  ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fillStyle='#000'; ctx.fill();
  ctx.globalCompositeOperation='source-over';
  // Border
  ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2);
  ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=dpr; ctx.stroke();
  // Compute dot position from rgb
  // r→0°, g→120°, b→240°
  const dx = rg - (gg+bg)/2, dy = (gg-bg)*Math.sqrt(3)/2;
  const mag = Math.sqrt(dx*dx+dy*dy);
  const angle = Math.atan2(dy, dx);
  const dotR = Math.min(R-2*dpr, mag*R*3);
  const dotX=cx+Math.cos(angle)*dotR, dotY=cy+Math.sin(angle)*dotR;
  ctx.beginPath(); ctx.arc(dotX,dotY,3.5*dpr,0,Math.PI*2);
  ctx.fillStyle='#fff'; ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.8)'; ctx.lineWidth=1.5; ctx.stroke();
}

function cgWheelFromXY(mx, my, wheel, key) {
  // mx,my in -1..1 normalized (from center), key: 'lift','gamma','gain'
  const maxOff = key==='lift'?0.3:key==='gain'?1.5:1.5;
  const angle = Math.atan2(my, mx);
  const sat = Math.min(1, Math.sqrt(mx*mx+my*my));
  // Distribute to RGB via 120° spacing
  const r = sat*Math.cos(angle);
  const g = sat*Math.cos(angle-2*Math.PI/3);
  const b = sat*Math.cos(angle+2*Math.PI/3);
  const scale = maxOff;
  if (key==='lift') return {r:r*scale,g:g*scale,b:b*scale};
  // gamma/gain: neutral=1, offset around 1
  return {r:1+r*scale,g:1+g*scale,b:1+b*scale};
}

document.addEventListener('mousemove', (ev) => {
  if (!cgCurveDrag) return;
  const {pts,idx,canvas,ch} = cgCurveDrag;
  const rect = canvas.getBoundingClientRect();
  const rawX = (ev.clientX-rect.left)/rect.width*255;
  const rawY = (1-(ev.clientY-rect.top)/rect.height)*255;
  const clampX = idx===0?0:idx===pts.length-1?255:Math.max(1,Math.min(254,rawX));
  pts[idx] = {x:clampX, y:Math.max(0,Math.min(255,rawY))};
  if (idx>0&&idx<pts.length-1) pts.sort((a,b)=>a.x-b.x);
  drawCurveCanvas(canvas,pts,ch);
  renderPreview();
});
document.addEventListener('mouseup',()=>{ if(cgCurveDrag){cgCurveDrag=null;} });

document.addEventListener('mousemove',(ev)=>{
  if (!cgWheelDrag) return;
  const {canvas,cg,key} = cgWheelDrag;
  const rect=canvas.getBoundingClientRect();
  const mx = (ev.clientX-rect.left)/rect.width*2-1;
  const my = (ev.clientY-rect.top)/rect.height*2-1;
  cg[key] = cgWheelFromXY(mx,my,cg,key);
  drawColorWheel(canvas,cg[key].r,cg[key].g,cg[key].b);
  renderPreview();
});
document.addEventListener('mouseup',()=>{ if(cgWheelDrag){cgWheelDrag=null;renderProps();} });
// --- fim Passo 5 ---

// --- Passo 6: Remoção de fundo por IA ---
// item.bgRemoval = { enabled, path, srcIn, srcDur, model, bg: 'none'|'color'|'image', color, image }
const rmbgRunning = new Map(); // item.id -> { jobId, text, pct }
function rmbgNeed(item, kind) {
  if (kind === 'overlay') return item.duration;
  return item.speedCurve?.length ? scSrcTime(item.speedCurve, item.duration) : item.duration * (item.speed || 1);
}
function rmbgCovers(item, kind) {
  const b = item.bgRemoval;
  if (!b?.path) return false;
  if (item.isImage) return true;
  const inP = item.in || 0;
  return inP >= b.srcIn - 0.05 && inP + rmbgNeed(item, kind) <= b.srcIn + b.srcDur + 0.05;
}
// Fonte efetiva para o preview: { path, in } do recorte com alpha, ou null para usar o original
function rmbgSrc(item, kind) {
  if (!item.bgRemoval?.enabled || !rmbgCovers(item, kind)) return null;
  return { path: item.bgRemoval.path, in: item.isImage ? 0 : (item.in || 0) - item.bgRemoval.srcIn };
}
function rmbgBackdrop(view) {
  const el = $('rmbgBack'), b = view?.bgRemoval;
  if (!view || !rmbgSrc(view, 'clip')) { el.hidden = true; return; }
  el.hidden = false;
  el.className = b.bg === 'image' || b.bg === 'color' ? '' : 'rmbg-checker';
  el.style.background = b.bg === 'color' ? (b.color || '#00b140') : '';
  el.style.backgroundImage = b.bg === 'image' && b.image ? `url("${fileUrl(b.image)}")` : '';
}
async function rmbgRun(item, kind) {
  if (rmbgRunning.has(item.id)) return;
  const jobId = `${item.id}_${Date.now()}`;
  rmbgRunning.set(item.id, { jobId, text: 'Preparando modelo...', pct: 0 });
  renderProps();
  const model = item.bgRemoval?.model || 'fast';
  const r = await window.api.rmbgStart({ jobId, path: item.path, isImage: !!item.isImage, in: item.in || 0, dur: rmbgNeed(item, kind), hasAudio: !!item.hasAudio, model });
  rmbgRunning.delete(item.id);
  if (r.ok) {
    item.bgRemoval = { bg: 'none', color: '#00b140', ...item.bgRemoval, enabled: true, path: r.path, srcIn: r.srcIn, srcDur: r.srcDur, model };
    toast(r.cached ? 'Fundo removido (cache reutilizado)' : 'Fundo removido');
  } else toast(r.error === 'cancelado' ? 'Remoção de fundo cancelada' : 'Erro na remoção de fundo: ' + r.error);
  renderProps(); renderPreview();
}
window.api.onRmbg((m) => {
  const entry = [...rmbgRunning.entries()].find(([, v]) => v.jobId === m.jobId);
  if (!entry) return;
  const job = entry[1];
  if (m.phase === 'download') { job.text = `Baixando modelo... ${m.pct}%`; job.pct = m.pct; }
  else { job.pct = Math.round(m.done / m.total * 100); job.text = `Frame ${m.done}/${m.total} · ~${Math.ceil(m.eta)}s restantes`; }
  const st = $('rmbgStatus');
  if (st && +st.dataset.id === entry[0]) { st.textContent = job.text; $('rmbgBar').style.width = job.pct + '%'; }
});
function rmbgPanel(item, kind) {
  const head = `<hr style="border:none;border-top:1px solid var(--line);margin:10px 0"><span style="font-size:11px;color:#00e5c3;font-weight:700">Remover fundo (IA)</span>`;
  const job = rmbgRunning.get(item.id);
  if (job) return head + `<div class="prop" id="rmbgStatus" data-id="${item.id}">${job.text}</div><div class="rmbg-bar"><i id="rmbgBar" style="width:${job.pct}%"></i></div><button id="rmbgCancel" class="wide">Cancelar</button>`;
  const b = item.bgRemoval || {};
  const model = `<div class="prop">Modelo<select id="rmbgModel"><option value="fast" ${(b.model || 'fast') === 'fast' ? 'selected' : ''}>Pessoas (rápido · MODNet)</option><option value="quality" ${b.model === 'quality' ? 'selected' : ''}>Objetos em geral (lento · RMBG-1.4)</option></select></div>`;
  if (!b.path) return head + model + `<button id="rmbgRun" class="wide primary">✂ Remover fundo</button><p class="hint">Processa frame a frame localmente; vídeos longos levam alguns minutos.</p>`;
  const bgOpts = kind === 'clip' ? `<div class="prop">Fundo<select id="rmbgBg"><option value="none" ${(b.bg || 'none') === 'none' ? 'selected' : ''}>Transparente (preto no MP4)</option><option value="color" ${b.bg === 'color' ? 'selected' : ''}>Cor sólida</option><option value="image" ${b.bg === 'image' ? 'selected' : ''}>Imagem</option></select></div>`
    + (b.bg === 'color' ? `<div class="prop">Cor do fundo<input type="color" id="rmbgColor" value="${b.color || '#00b140'}"></div>` : '')
    + (b.bg === 'image' ? `<button id="rmbgImg" class="wide">${b.image ? '🖼 ' + b.image.split(/[\\/]/).pop() : 'Escolher imagem de fundo'}</button>` : '') : '';
  const warn = rmbgCovers(item, kind) ? '' : `<p class="hint" style="color:#ffb020">⚠ O trecho atual do clipe saiu da área processada — o original será usado até reprocessar.</p>`;
  return head + `<div class="prop"><label><input type="checkbox" id="rmbgOn" ${b.enabled ? 'checked' : ''}> Fundo removido ativo</label></div>` + warn + bgOpts + model
    + `<div style="display:flex;gap:4px"><button id="rmbgRun" style="flex:1">↻ Reprocessar</button><button id="rmbgSave" style="flex:1" title="Salvar o recorte com canal alpha">💾 Salvar alpha</button></div>`;
}
function rmbgBind(item, kind) {
  if ($('rmbgCancel')) $('rmbgCancel').onclick = () => { const j = rmbgRunning.get(item.id); if (j) window.api.rmbgCancel(j.jobId); };
  if ($('rmbgModel')) $('rmbgModel').onchange = (e) => { item.bgRemoval = { ...(item.bgRemoval || {}), model: e.target.value }; };
  if ($('rmbgRun')) $('rmbgRun').onclick = () => rmbgRun(item, kind);
  if ($('rmbgOn')) $('rmbgOn').onchange = (e) => { item.bgRemoval.enabled = e.target.checked; renderPreview(); };
  if ($('rmbgBg')) $('rmbgBg').onchange = (e) => { item.bgRemoval.bg = e.target.value; renderProps(); renderPreview(); };
  if ($('rmbgColor')) $('rmbgColor').oninput = (e) => { item.bgRemoval.color = e.target.value; renderPreview(); };
  if ($('rmbgImg')) $('rmbgImg').onclick = async () => { const p2 = await window.api.pickImage(); if (p2) { item.bgRemoval.image = p2; renderProps(); renderPreview(); } };
  if ($('rmbgSave')) $('rmbgSave').onclick = async () => { const out = await window.api.rmbgSave(item.bgRemoval.path); if (out) toast('Recorte salvo: ' + out); };
}
// --- fim Passo 6 ---

function clipAt(t) {
  const { starts } = layout();
  for (let i = state.clips.length - 1; i >= 0; i--) {
    const c = state.clips[i];
    if (t >= starts[i] && t < starts[i] + c.duration) return { c, local: t - starts[i], start: starts[i] };
  }
  return null;
}

const CSS_PRESETS = { sepia: 'sepia(1)', vintage: 'sepia(.5) contrast(1.1)', warm: 'sepia(.3) saturate(1.2)', cool: 'hue-rotate(15deg) saturate(1.1)', cinematic: 'contrast(1.15) saturate(.9)', vivid: 'saturate(1.6) contrast(1.1)' };
function cssFilter(f = {}) {
  return `brightness(${1 + (f.brightness || 0) / 100}) contrast(${1 + (f.contrast || 0) / 100}) saturate(${1 + (f.saturation || 0) / 100}) blur(${f.blur || 0}px) grayscale(${f.grayscale ? 1 : 0}) ${CSS_PRESETS[f.preset] || ''}`;
}
function cssTransform(f = {}) {
  return `scale(${(f.hflip ? -1 : 1) * (f.zoom || 1)}, ${(f.vflip ? -1 : 1) * (f.zoom || 1)}) rotate(${f.rotate || 0}deg)`;
}

function syncOverlay() {
  const v = $('ovPlayer'), im = $('ovImg');
  if (state.tracks.overlay?.visible === false) { v.hidden = im.hidden = true; v.pause(); return; }
  const o = state.overlays.find(x => state.time >= x.start && state.time < x.start + x.duration);
  if (!o) { v.hidden = im.hidden = true; v.pause(); return; }
  const el = o.isImage ? im : v, other = o.isImage ? v : im;
  other.hidden = true; el.hidden = false; if (!o.isImage) {} else v.pause();
  const ors = rmbgSrc(o, 'overlay');
  const src = fileUrl(ors ? ors.path : o.path);
  if (el.dataset.src !== src) { el.src = src; el.dataset.src = src; }

  const dt = state.time - o.start;
  const rem = o.start + o.duration - state.time;
  let pr = Math.min(1, Math.max(0, dt / o.duration));
  if (o.easing === 'smooth') pr = 3 * pr * pr - 2 * pr * pr * pr;
  const kf = o.keyframes || {};
  let ox = kfGet(kf.x, dt, o.motion ? o.x + ((o.x2 ?? o.x) - o.x) * pr : o.x);
  let oy = kfGet(kf.y, dt, o.motion ? o.y + ((o.y2 ?? o.y) - o.y) * pr : o.y);
  let op = kfGet(kf.opacity, dt, o.opacity ?? 1);
  const kfScale = kfGet(kf.scale, dt, o.scale || 30);
  const kfRot = kfGet(kf.rotate, dt, o.rotate || 0);

  const anim = o.anim || 'none';
  if (anim === 'fade') {
    op *= Math.max(0, Math.min(1, dt / 0.4, rem / 0.4));
  } else if (anim === 'slide_left' && dt < 0.4) {
    const sPr = Math.max(0, dt / 0.4); ox = ox - (1 - sPr) * 0.35; op *= sPr;
  } else if (anim === 'slide_right' && dt < 0.4) {
    const sPr = Math.max(0, dt / 0.4); ox = ox + (1 - sPr) * 0.35; op *= sPr;
  } else if (anim === 'float') {
    oy += Math.sin(dt * Math.PI) * 0.03;
  }

  const flip = o.hflip ? -1 : 1;
  el.style.width = kfScale + '%';
  el.style.left = (ox * 100) + '%';
  el.style.top = (oy * 100) + '%';
  el.style.transform = `translate(${-ox * 100}%, ${-oy * 100}%) scaleX(${flip}) rotate(${kfRot}deg)`;
  el.style.opacity = op;
  if (!o.isImage) {
    const target = (ors ? ors.in : (o.in || 0)) + state.time - o.start;
    if (!state.playing || Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
    if (state.playing && v.paused) v.play().catch(() => {}); else if (!state.playing) v.pause();
  }
}

function syncAudio() {
  syncOverlay();
  const el = $('bgAudio');
  if (state.tracks.audio?.mute) { el.pause(); return; }
  const a = state.audios.find(x => state.time >= x.start && state.time < x.start + x.duration);
  if (!a) { el.pause(); return; }
  const src = fileUrl(a.path);
  if (el.dataset.src !== src) { el.src = src; el.dataset.src = src; }
  let vol = Math.min(1, a.volume ?? 1);
  const local = state.time - a.start;
  if (a.fadeIn && local < a.fadeIn) vol *= Math.max(0, local / a.fadeIn);
  if (a.fadeOut && local > a.duration - a.fadeOut) vol *= Math.max(0, (a.duration - local) / a.fadeOut);
  el.volume = Math.max(0, Math.min(1, vol));
  const target = (a.in || 0) + state.time - a.start;
  if (!state.playing || Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
  if (state.playing && el.paused) el.play().catch(() => {}); else if (!state.playing) el.pause();
}

let textDrag = null;
document.addEventListener('mousemove', (e) => {
  if (!textDrag) return;
  const r = $('stage').getBoundingClientRect();
  textDrag.px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  textDrag.py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  renderPreview();
});
document.addEventListener('mouseup', () => { if (textDrag) { textDrag = null; renderProps(); } });

function renderPreview() {
  const hit = clipAt(state.time);
  const view = hit ? hit.c : null;
  $('textLayer').innerHTML = '';
  if (state.tracks.text?.visible !== false) {
    state.texts.filter(t => state.time >= t.start && state.time < t.start + t.duration).forEach(t => {
      const tkf = t.keyframes || {}, tLocal = state.time - t.start;
      const s = document.createElement('span'); s.textContent = t.text; s.style.color = t.color;
      const kfSz = kfGet(tkf.size, tLocal, t.size);
      s.style.fontSize = (kfSz / 720 * Math.min($('stage').clientWidth, $('stage').clientHeight)) + 'px';
      const px = kfGet(tkf.px, tLocal, t.px ?? 0.5), py = kfGet(tkf.py, tLocal, t.py ?? 0.88);
      s.style.fontFamily = `'${t.font || 'Arial'}', sans-serif`; s.style.fontWeight = t.bold === false ? 400 : 700;
      const ow = (t.outline ?? 2) / 720 * Math.min($('stage').clientWidth, $('stage').clientHeight);
      s.style.textShadow = ow > 0 ? `0 0 ${ow * 1.5}px #000, 0 0 ${ow * 1.5}px #000, 0 0 ${ow}px #000` : 'none';
      if (t.box) { const h = (t.boxColor || '#000000').replace('#', ''); const rgb = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)).join(','); s.style.background = `rgba(${rgb},${t.boxOpacity ?? 0.6})`; s.style.padding = '0.2em 0.5em'; s.style.borderRadius = '4px'; }
      const anim = t.anim || (t.fade ? 'fade' : 'none');
      const dt = state.time - t.start, rem = t.start + t.duration - state.time;
      let animScale = 1, animY = 0, animOp = kfGet(tkf.opacity, tLocal, 1);
      if (anim === 'fade') animOp = Math.max(0, Math.min(1, dt / 0.3, rem / 0.3));
      else if (anim === 'slide' && dt < 0.3) { const pr = Math.max(0, dt / 0.3); animY = (1 - pr) * 25; animOp = Math.min(1, dt / 0.2); }
      else if (anim === 'pop' && dt < 0.25) { const pr = Math.max(0, dt / 0.25); animScale = 0.6 + 0.4 * pr; animOp = Math.min(1, dt / 0.15); }
      s.style.opacity = animOp;
      s.style.left = (px * 100) + '%'; s.style.top = (py * 100) + '%';
      s.style.transform = `translate(${-px * 100}%, ${-py * 100}%) translateY(${animY}px) scale(${animScale})`;
      if (state.selected?.id === t.id) s.style.outline = '1px dashed #00e5c3';
      s.onmousedown = (ev) => { ev.preventDefault(); textDrag = t; if (state.selected?.id !== t.id) select({ kind: 'text', id: t.id }); };
      $('textLayer').appendChild(s);
    });
  }
  const bgV = $('bgPlayer'), bgI = $('bgImg');
  if (!view || state.tracks.video?.visible === false) {
    player.removeAttribute('src'); img.hidden = true; player.style.visibility = 'hidden';
    if (bgV) { bgV.hidden = true; bgV.pause(); }
    if (bgI) bgI.hidden = true;
    $('vignetteLayer').hidden = true; rmbgBackdrop(null); syncAudio(); updateTime(); return;
  }
  $('vignetteLayer').hidden = !view.filters?.vignette;
  player.style.visibility = 'visible';
  const rs = rmbgSrc(view, 'clip');
  rmbgBackdrop(view);
  const src = fileUrl(rs ? rs.path : view.path);
  const srcIn = rs ? rs.in : view.in;
  const f = cssFilter(view.filters);
  const fillMode = rs && view.filters?.fillMode === 'blur' ? 'fit' : (view.filters?.fillMode || 'fit');
  const kfClip = view.keyframes || {};
  const kfZoom = kfGet(kfClip.zoom, hit.local, view.filters?.zoom || 1);
  const kfOp = kfGet(kfClip.opacity, hit.local, 1);
  const kfXform = `scale(${(view.filters?.hflip ? -1 : 1) * kfZoom}, ${(view.filters?.vflip ? -1 : 1) * kfZoom}) rotate(${view.filters?.rotate || 0}deg)`;

  if (fillMode === 'blur' && state.tracks.video?.visible !== false) {
    if (view.isImage) {
      if (bgI) { bgI.hidden = false; if (bgI.src !== src) bgI.src = src; }
      if (bgV) { bgV.hidden = true; bgV.pause(); }
    } else {
      if (bgI) bgI.hidden = true;
      if (bgV) {
        bgV.hidden = false;
        if (bgV.dataset.src !== src) { bgV.src = src; bgV.dataset.src = src; }
        const scSpdBg = view.speedCurve?.length ? interpSC(view.speedCurve, hit.local) : (view.speed || 1);
        bgV.playbackRate = Math.max(0.07, Math.min(16, scSpdBg));
        const target = view.in + (view.speedCurve?.length ? scSrcTime(view.speedCurve, hit.local) : hit.local * (view.speed || 1));
        if (!state.playing || Math.abs(bgV.currentTime - target) > 0.3) bgV.currentTime = target;
        if (state.playing && bgV.paused) bgV.play().catch(() => {});
        else if (!state.playing) bgV.pause();
      }
    }
  } else {
    if (bgV) { bgV.hidden = true; bgV.pause(); }
    if (bgI) bgI.hidden = true;
  }

  const objFit = fillMode === 'crop' ? 'cover' : 'contain';
  player.style.objectFit = img.style.objectFit = objFit;

  // Passo 5: build color grade CSS filter suffix
  let cgFilterSuffix = '';
  if (cgHasEffect(view.colorGrade)) {
    const fid = cgApplyFilter(view.colorGrade, view.id);
    cgFilterSuffix = ` url(#${fid})`;
  } else {
    cgRemoveFilter(view.id);
  }

  if (view.isImage) { img.hidden = false; player.style.visibility = 'hidden'; if (img.dataset.src !== src) { img.src = src; img.dataset.src = src; } img.style.filter = f+cgFilterSuffix; img.style.transform = kfXform; img.style.opacity = kfOp; }
  else {
    img.hidden = true;
    if (player.dataset.src !== src) { player.src = src; player.dataset.src = src; }
    const scSpd = view.speedCurve?.length ? interpSC(view.speedCurve, hit.local) : (view.speed || 1);
    const scSrc = view.speedCurve?.length ? scSrcTime(view.speedCurve, hit.local) : hit.local * (view.speed || 1);
    player.style.filter = f+cgFilterSuffix; player.style.transform = kfXform; player.style.opacity = kfOp; player.playbackRate = Math.max(0.07, Math.min(16, scSpd));
    const isMuted = !!state.tracks.video?.mute || !!state.tracks.audio?.solo;
    player.muted = isMuted; player.volume = isMuted ? 0 : Math.min(1, view.volume ?? 1);
    const target = srcIn + scSrc;
    if (!state.playing || Math.abs(player.currentTime - target) > 0.3) player.currentTime = target;
    if (state.playing && player.paused) player.play().catch(() => {});
  }
  syncAudio();
  updateTime();
}

function updateTime() {
  $('timeLabel').textContent = `${fmt(state.time)} / ${fmt(total())}`;
  $('playhead').style.left = (12 + state.time * pxPerSec) + 'px';
}

function tick(ts) {
  if (!state.playing) return;
  state.time += (ts - lastTs) / 1000; lastTs = ts;
  if (state.time >= total()) { state.time = total(); setPlaying(false); }
  renderPreview(); raf = requestAnimationFrame(tick);
}
function setPlaying(p) {
  state.playing = p && total() > 0; $('btnPlay').textContent = state.playing ? '⏸' : '▶';
  if (state.playing) { if (state.time >= total()) state.time = 0; lastTs = performance.now(); raf = requestAnimationFrame(tick); }
  else { player.pause(); if ($('bgPlayer')) $('bgPlayer').pause(); $('bgAudio').pause(); $('ovPlayer').pause(); cancelAnimationFrame(raf); }
}

let tlDrag = null;
let snapEnabled = true;
const snapGuide = $('snapGuide');
function toggleSnap(val) {
  snapEnabled = typeof val === 'boolean' ? val : !snapEnabled;
  $('btnSnap').classList.toggle('active', snapEnabled);
  toast(`Alinhamento magnético (Snap): ${snapEnabled ? 'Ativado' : 'Desativado'}`);
}
$('btnSnap').onclick = () => toggleSnap();

function showSnap(t) {
  if (snapGuide) { snapGuide.style.left = (12 + t * pxPerSec) + 'px'; snapGuide.hidden = false; }
}
function hideSnap() { if (snapGuide) snapGuide.hidden = true; }

function getSnapTargets(excludeItem) {
  const pts = [0, state.time];
  const { starts } = layout();
  state.clips.forEach((c, i) => { pts.push(starts[i], starts[i] + c.duration); });
  state.overlays.forEach(o => { if (o !== excludeItem) pts.push(o.start, o.start + o.duration); });
  state.texts.forEach(t => { if (t !== excludeItem) pts.push(t.start, t.start + t.duration); });
  state.audios.forEach(a => { if (a !== excludeItem) pts.push(a.start, a.start + a.duration); });
  (state.markers || []).forEach(m => pts.push(m.time));
  return pts;
}

function trySnap(val, targets, threshSec) {
  if (!snapEnabled) return { val, snapped: false };
  let best = val, minDiff = threshSec, hit = null;
  for (const p of targets) {
    const diff = Math.abs(val - p);
    if (diff < minDiff) { minDiff = diff; best = p; hit = p; }
  }
  return { val: best, snapped: hit !== null, point: hit };
}

function decorate(e, kind, item) {
  ['l', 'r'].forEach(side => {
    const h = document.createElement('span'); h.className = 'h ' + side;
    h.onmousedown = (ev) => startDrag(ev, kind, item, side); e.appendChild(h);
  });
  e.onmousedown = (ev) => startDrag(ev, kind, item, 'move');
}
function startDrag(ev, kind, item, mode) {
  ev.preventDefault(); ev.stopPropagation();
  const s0 = kind === 'clip' ? layout().starts[state.clips.indexOf(item)] : item.start;
  select({ kind, id: item.id });
  tlDrag = { kind, item, mode, x0: ev.clientX, s0, o: { start: item.start, duration: item.duration, in: item.in || 0 } };
}
document.addEventListener('mousemove', (ev) => {
  if (!tlDrag) return;
  const { kind, item: it, mode, o } = tlDrag, dx = (ev.clientX - tlDrag.x0) / pxPerSec, MIN = 0.2;
  const thresh = 8 / pxPerSec;
  if (kind === 'clip') {
    const sp = it.speed || 1, srcDur = it.isImage ? 1e9 : (it.srcDur || (o.in + o.duration * sp));
    if (mode === 'move') {
      const others = state.clips.filter(c => c !== it); const center = tlDrag.s0 + o.duration / 2 + dx;
      let acc = 0, n = 0; for (const c of others) { if (acc + c.duration / 2 < center) n++; acc += c.duration; }
      if (n !== state.clips.indexOf(it)) { state.clips = others; state.clips.splice(n, 0, it); }
      hideSnap();
    } else if (mode === 'r') {
      let tEnd = tlDrag.s0 + o.duration + dx;
      const snapR = trySnap(tEnd, getSnapTargets(it), thresh);
      if (snapR.snapped) { tEnd = snapR.val; showSnap(snapR.point); } else { hideSnap(); }
      const newDur = Math.max(MIN, tEnd - tlDrag.s0);
      it.duration = Math.min(newDur, (srcDur - o.in) / sp);
    } else {
      let tStart = tlDrag.s0 + dx;
      const snapL = trySnap(tStart, getSnapTargets(it), thresh);
      if (snapL.snapped) { tStart = snapL.val; showSnap(snapL.point); } else { hideSnap(); }
      const d = Math.min(Math.max(tStart - tlDrag.s0, -o.in / sp), o.duration - MIN);
      it.in = o.in + d * sp; it.duration = o.duration - d;
    }
  } else {
    const hasIn = kind !== 'text', cap = hasIn && it.max ? it.max : 1e9;
    const targets = getSnapTargets(it);
    if (mode === 'move') {
      let tStart = Math.max(0, o.start + dx);
      const snapL = trySnap(tStart, targets, thresh);
      if (snapL.snapped) {
        tStart = snapL.val; showSnap(snapL.point);
      } else {
        const snapR = trySnap(tStart + o.duration, targets, thresh);
        if (snapR.snapped) { tStart = Math.max(0, snapR.val - o.duration); showSnap(snapR.point); } else { hideSnap(); }
      }
      it.start = tStart;
    } else if (mode === 'r') {
      let tEnd = o.start + o.duration + dx;
      const snapR = trySnap(tEnd, targets, thresh);
      if (snapR.snapped) { tEnd = snapR.val; showSnap(snapR.point); } else { hideSnap(); }
      it.duration = Math.min(Math.max(MIN, tEnd - o.start), cap - o.in);
    } else {
      let tStart = Math.max(0, o.start + dx);
      const snapL = trySnap(tStart, targets, thresh);
      if (snapL.snapped) { tStart = snapL.val; showSnap(snapL.point); } else { hideSnap(); }
      const d = Math.min(Math.max(tStart - o.start, hasIn ? -o.in : -1e9), o.duration - MIN);
      it.start = o.start + d; it.duration = o.duration - d; if (hasIn) it.in = o.in + d;
    }
  }
  renderTimeline(); renderPreview();
});
document.addEventListener('mouseup', () => { if (tlDrag) { tlDrag = null; hideSnap(); renderProps(); } });

function renderTimeline() {
  const tv = $('trackVideo'), to = $('trackOverlay'), tt = $('trackText'), ta = $('trackAudio'), ru = $('ruler');
  tv.innerHTML = to.innerHTML = tt.innerHTML = ta.innerHTML = ru.innerHTML = '';
  const dur = Math.max(total(), 30);
  ru.style.width = tv.style.width = to.style.width = tt.style.width = ta.style.width = (dur * pxPerSec) + 'px';
  for (let s = 0; s < dur; s += 5) { const k = document.createElement('div'); k.className = 'tick'; k.style.left = s * pxPerSec + 'px'; k.textContent = s + 's'; ru.appendChild(k); }
  (state.markers || []).forEach(m => {
    const el = document.createElement('div'); el.className = 'marker';
    el.style.left = (m.time * pxPerSec) + 'px';
    el.title = `${m.label || 'Marcador'} (${fmt(m.time)}) - Clique para ir / Duplo clique para excluir`;
    el.innerHTML = `<span class="marker-flag">🏷️</span><span class="marker-label">${m.label || ''}</span>`;
    el.onclick = (ev) => { ev.stopPropagation(); state.time = m.time; renderPreview(); };
    el.ondblclick = (ev) => { ev.stopPropagation(); removeMarker(m.id); };
    ru.appendChild(el);
  });
  const { starts } = layout();
  state.clips.forEach((c, i) => {
    const acc = starts[i];
    const e = document.createElement('div'); e.className = 'clip' + (state.selected?.id === c.id ? ' sel' : '');
    e.style.left = acc * pxPerSec + 'px'; e.style.width = c.duration * pxPerSec + 'px';

    // Passo 1: thumbnail strip para clipes de vídeo
    if (!c.isImage && c.thumbs?.length) {
      const canvas = document.createElement('canvas');
      canvas.className = 'thumb-strip';
      canvas.width = Math.max(1, Math.round(c.duration * pxPerSec));
      canvas.height = 48;
      e.appendChild(canvas);
      drawThumbStrip(canvas, c);
    } else if (c.thumb) {
      e.style.backgroundImage = `linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.4)),url(${c.thumb})`;
      e.style.backgroundSize = 'auto 100%';
      e.style.backgroundRepeat = 'repeat-x';
    }

    // Passo 2: mini-waveform na parte inferior dos clipes de vídeo com áudio
    if (!c.isImage && c.hasAudio && c.waveData?.length) {
      const mw = document.createElement('canvas');
      mw.className = 'mini-wave-canvas';
      mw.width = Math.max(1, Math.round(c.duration * pxPerSec));
      mw.height = 12;
      e.appendChild(mw);
      drawWaveform(mw, c, '#ffffff', 0.45);
    }

    const label = document.createElement('span');
    label.className = 'clip-label';
    label.textContent = (c.transition && c.transition !== 'none' ? '⇆ ' : '') + c.name;
    e.appendChild(label);

    kfDiamonds(e, c);
    decorate(e, 'clip', c);
    tv.appendChild(e);
  });
  state.texts.forEach(t => {
    const e = document.createElement('div'); e.className = 'clip text' + (state.selected?.id === t.id ? ' sel' : '');
    e.style.left = t.start * pxPerSec + 'px'; e.style.width = t.duration * pxPerSec + 'px'; e.textContent = 'T: ' + t.text;
    kfDiamonds(e, t);
    decorate(e, 'text', t);
    tt.appendChild(e);
  });
  state.overlays.forEach(o => {
    const e = document.createElement('div'); e.className = 'clip overlay' + (state.selected?.id === o.id ? ' sel' : '');
    e.style.left = o.start * pxPerSec + 'px'; e.style.width = o.duration * pxPerSec + 'px'; e.textContent = 'PiP: ' + o.name;
    if (o.thumb) { e.style.backgroundImage = `linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.4)),url(${o.thumb})`; e.style.backgroundSize = 'auto 100%'; e.style.backgroundRepeat = 'repeat-x'; }
    kfDiamonds(e, o);
    decorate(e, 'overlay', o);
    to.appendChild(e);
  });
  state.audios.forEach(a => {
    const e = document.createElement('div'); e.className = 'clip audio' + (state.selected?.id === a.id ? ' sel' : '');
    e.style.left = a.start * pxPerSec + 'px'; e.style.width = a.duration * pxPerSec + 'px';

    // Passo 2: canvas waveform para clipes de áudio
    if (a.waveData?.length) {
      const wc = document.createElement('canvas');
      wc.className = 'wave-canvas';
      wc.width = Math.max(1, Math.round(a.duration * pxPerSec));
      wc.height = 48;
      e.appendChild(wc);
      drawWaveform(wc, a, '#00e5c3', 0.85);
    } else if (a.wave) {
      e.style.backgroundImage = `url(${a.wave}), linear-gradient(135deg,#00b894,#00e5c3)`;
      e.style.backgroundSize = `${(a.max || a.duration) * pxPerSec}px 100%, 100% 100%`;
      e.style.backgroundPosition = `${-(a.in || 0) * pxPerSec}px 0, 0 0`;
      e.style.backgroundRepeat = 'no-repeat';
    }

    const label = document.createElement('span');
    label.className = 'clip-label';
    label.textContent = '♪ ' + a.name;
    e.appendChild(label);

    decorate(e, 'audio', a);
    ta.appendChild(e);
  });
  updateTime();
}

function select(s) { state.selected = s; renderTimeline(); renderProps(); }

function slider(label, key, min, max, obj) {
  return `<div class="prop">${label}<input type="range" min="${min}" max="${max}" value="${obj[key] || 0}" data-k="${key}"></div>`;
}

function renderProps() {
  const p = $('props'); const s = state.selected;
  if (!s) { p.innerHTML = '<p class="hint">Selecione um clipe na timeline.</p>'; return; }
  if (s.kind === 'overlay') {
    const o = state.overlays.find(x => x.id === s.id); if (!o) return;
    const r = (id, label, min, max, step, val) => `<div class="prop">${label}<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
    p.innerHTML = `<div class="prop">Início (s)<input type="number" id="oStart" value="${o.start.toFixed(1)}" min="0" step="0.5"></div>`
      + `<div class="prop">Duração (s)<input type="number" id="oDur" value="${o.duration.toFixed(1)}" min="0.5" step="0.5"></div>`
      + `<div class="prop">Animação<select id="oAnim">
        <option value="none" ${(o.anim || 'none') === 'none' ? 'selected' : ''}>Nenhuma</option>
        <option value="fade" ${o.anim === 'fade' ? 'selected' : ''}>Fade In / Out</option>
        <option value="slide_left" ${o.anim === 'slide_left' ? 'selected' : ''}>Deslizar da Esquerda</option>
        <option value="slide_right" ${o.anim === 'slide_right' ? 'selected' : ''}>Deslizar da Direita</option>
        <option value="zoom_in" ${o.anim === 'zoom_in' ? 'selected' : ''}>Zoom In (Pop)</option>
        <option value="float" ${o.anim === 'float' ? 'selected' : ''}>Flutuar (Sticker Float)</option>
      </select></div>`
      + r('oScale', 'Tamanho (%)', 10, 100, 1, o.scale)
      + r('oRot', 'Rotação (°)', -180, 180, 1, o.rotate || 0)
      + `<div class="prop"><label><input type="checkbox" id="oFlip" ${o.hflip ? 'checked' : ''}> Espelhar horizontalmente</label></div>`
      + r('oX', 'Posição horizontal', 0, 1, 0.01, o.x)
      + r('oY', 'Posição vertical', 0, 1, 0.01, o.y)
      + r('oOp', 'Opacidade', 0.1, 1, 0.05, o.opacity)
      + `<div class="prop"><label><input type="checkbox" id="oMot" ${o.motion ? 'checked' : ''}> Animar posição (início → fim)</label></div>`
      + `<div class="prop">Movimento<select id="oEase">
        <option value="linear" ${(o.easing || 'linear') === 'linear' ? 'selected' : ''}>Linear</option>
        <option value="smooth" ${o.easing === 'smooth' ? 'selected' : ''}>Suave (Cinemático)</option>
      </select></div>`
      + r('oX2', 'Posição horizontal final', 0, 1, 0.01, o.x2 ?? o.x)
      + r('oY2', 'Posição vertical final', 0, 1, 0.01, o.y2 ?? o.y)
      + `<div class="prop"><label><input type="checkbox" id="oChroma" ${o.chroma ? 'checked' : ''}> Chroma key (remover cor)</label></div>`
      + `<div class="prop">Cor<input type="color" id="oCColor" value="${o.chromaColor || '#00ff00'}"></div>`
      + r('oCSim', 'Tolerância', 0.05, 0.6, 0.01, o.chromaSim ?? 0.3)
      + `<div class="prop" style="margin-top:10px"><span style="font-size:11px;color:#00e5c3;font-weight:700">◆ Gravar Keyframe</span><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">`
      + ['x', 'y', 'scale', 'opacity', 'rotate'].map(pp => `<button class="kf-add-btn" data-prop="${pp}" style="padding:2px 8px;font-size:11px;flex:none" title="Gravar keyframe de ${pp} no tempo atual">◆ ${pp}</button>`).join('')
      + `</div></div>`
      + rmbgPanel(o, 'overlay');
    rmbgBind(o, 'overlay');
    $('oAnim').onchange = (e) => { o.anim = e.target.value; renderPreview(); };
    $('oRot').oninput = (e) => { o.rotate = +e.target.value; renderPreview(); };
    $('oFlip').onchange = (e) => { o.hflip = e.target.checked; renderPreview(); };
    $('oMot').onchange = (e) => { o.motion = e.target.checked; renderPreview(); };
    $('oEase').onchange = (e) => { o.easing = e.target.value; renderPreview(); };
    $('oX2').oninput = (e) => { o.x2 = +e.target.value; renderPreview(); };
    $('oY2').oninput = (e) => { o.y2 = +e.target.value; renderPreview(); };
    $('oChroma').onchange = (e) => { o.chroma = e.target.checked; };
    $('oCColor').oninput = (e) => { o.chromaColor = e.target.value; };
    $('oCSim').oninput = (e) => { o.chromaSim = +e.target.value; };
    $('oStart').onchange = (e) => { o.start = Math.max(0, +e.target.value); renderTimeline(); renderPreview(); };
    $('oDur').onchange = (e) => { o.duration = Math.min(o.max, +e.target.value); renderTimeline(); renderPreview(); };
    $('oScale').oninput = (e) => { o.scale = +e.target.value; renderPreview(); };
    $('oX').oninput = (e) => { o.x = +e.target.value; renderPreview(); };
    $('oY').oninput = (e) => { o.y = +e.target.value; renderPreview(); };
    $('oOp').oninput = (e) => { o.opacity = +e.target.value; renderPreview(); };
    // Passo 3: KF buttons overlay
    p.querySelectorAll('.kf-add-btn').forEach(btn => {
      btn.onclick = () => {
        const prop = btn.dataset.prop;
        const localT = state.time - o.start;
        const vals = { x: o.x, y: o.y, scale: o.scale || 30, opacity: o.opacity ?? 1, rotate: o.rotate || 0 };
        if (prop in vals) { kfAdd(o, prop, vals[prop], localT); toast(`◆ KF: ${prop} = ${vals[prop].toFixed(2)} @ ${localT.toFixed(2)}s`); }
      };
    });
    return;
  }
  if (s.kind === 'audio') {
    const a = state.audios.find(x => x.id === s.id); if (!a) return;
    p.innerHTML = `<div class="prop">Início (s)<input type="number" id="aStart" value="${a.start.toFixed(1)}" min="0" step="0.5"></div>
      <div class="prop">Duração (s)<input type="number" id="aDur" value="${a.duration.toFixed(1)}" min="0.5" step="0.5"></div>
      <div class="prop">Volume<input type="range" id="aVol" min="0" max="1" step="0.05" value="${a.volume ?? 1}"></div>
      <div class="prop">Fade in (s)<input type="number" id="aFadeIn" value="${a.fadeIn || 0}" min="0" max="10" step="0.2"></div>
      <div class="prop">Fade out (s)<input type="number" id="aFadeOut" value="${a.fadeOut || 0}" min="0" max="10" step="0.2"></div>
      <div class="prop"><label><input type="checkbox" id="aDenoise" ${a.denoise ? 'checked' : ''}> Redução de ruído (chiado)</label></div>
      <div class="prop"><label><input type="checkbox" id="aLoudnorm" ${a.loudnorm ? 'checked' : ''}> Normalizar volume (-14 LUFS)</label></div>`;
    $('aStart').onchange = (e) => { a.start = Math.max(0, +e.target.value); renderTimeline(); };
    $('aDur').onchange = (e) => { a.duration = Math.min(a.max, +e.target.value); renderTimeline(); };
    $('aVol').oninput = (e) => { a.volume = +e.target.value; syncAudio(); };
    $('aFadeIn').onchange = (e) => { a.fadeIn = Math.max(0, +e.target.value); };
    $('aFadeOut').onchange = (e) => { a.fadeOut = Math.max(0, +e.target.value); };
    $('aDenoise').onchange = (e) => { a.denoise = e.target.checked; };
    $('aLoudnorm').onchange = (e) => { a.loudnorm = e.target.checked; };
    return;
  }
  if (s.kind === 'text') {
    const t = state.texts.find(x => x.id === s.id); if (!t) return;
    p.innerHTML = `<div class="prop">Texto<input type="text" id="tText" value="${t.text.replace(/"/g, '&quot;')}"></div>`
      + `<div class="prop">Tamanho<input type="number" id="tSize" value="${t.size}" min="10" max="200"></div>`
      + `<div class="prop">Cor<input type="color" id="tColor" value="${t.color}"></div>`
      + `<div class="prop">Fonte<select id="tFont">${['Arial', 'Impact', 'Segoe UI', 'Comic Sans MS', 'Times New Roman', 'Courier New'].map(v => `<option ${(t.font || 'Arial') === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`
      + `<div class="prop">Animação<select id="tAnim">${[['none', 'Nenhuma'], ['fade', 'Fade In/Out'], ['slide', 'Deslizar (Slide Up)'], ['pop', 'Pop / Zoom In']].map(([k, label]) => `<option ${(t.anim || (t.fade ? 'fade' : 'none')) === k ? 'selected' : ''} value="${k}">${label}</option>`).join('')}</select></div>`
      + `<div class="prop"><label><input type="checkbox" id="tBold" ${t.bold !== false ? 'checked' : ''}> Negrito</label></div>`
      + `<div class="prop">Contorno<input type="range" id="tOut" min="0" max="8" step="1" value="${t.outline ?? 2}"></div>`
      + `<div class="prop"><label><input type="checkbox" id="tBox" ${t.box ? 'checked' : ''}> Fundo (caixa)</label> <input type="color" id="tBoxColor" value="${t.boxColor || '#000000'}"></div>`
      + `<div class="prop">Opacidade do fundo<input type="range" id="tBoxOp" min="0.1" max="1" step="0.05" value="${t.boxOpacity ?? 0.6}"></div>`
      + `<div class="prop">Início (s)<input type="number" id="pStart" value="${t.start.toFixed(1)}" min="0" step="0.5"></div>`
      + `<div class="prop">Duração (s)<input type="number" id="pDur" value="${t.duration.toFixed(1)}" min="0.5" step="0.5"></div>`
      + `<button id="btnApplyAllTexts" class="wide primary">Aplicar estilo a todas as legendas</button>`
      + `<div class="prop" style="margin-top:10px"><span style="font-size:11px;color:#00e5c3;font-weight:700">◆ Gravar Keyframe</span><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">`
      + ['px', 'py', 'size', 'opacity'].map(pp => `<button class="kf-add-btn" data-prop="${pp}" style="padding:2px 8px;font-size:11px;flex:none" title="Gravar keyframe de ${pp} no tempo atual">◆ ${pp}</button>`).join('')
      + `</div></div>`
      + `<p class="hint">Arraste o texto no preview para posicionar.</p>`;
    $('tText').oninput = (e) => { t.text = e.target.value; renderTimeline(); renderPreview(); };
    $('tSize').oninput = (e) => { t.size = +e.target.value || 48; renderPreview(); };
    $('tColor').oninput = (e) => { t.color = e.target.value; renderPreview(); };
    $('tFont').onchange = (e) => { t.font = e.target.value; renderPreview(); };
    $('tAnim').onchange = (e) => { t.anim = e.target.value; t.fade = (e.target.value === 'fade'); renderPreview(); };
    $('tBold').onchange = (e) => { t.bold = e.target.checked; renderPreview(); };
    $('tOut').oninput = (e) => { t.outline = +e.target.value; renderPreview(); };
    $('tBox').onchange = (e) => { t.box = e.target.checked; renderPreview(); };
    $('tBoxColor').oninput = (e) => { t.boxColor = e.target.value; };
    $('tBoxOp').oninput = (e) => { t.boxOpacity = +e.target.value; renderPreview(); };
    $('pStart').onchange = (e) => { t.start = Math.max(0, +e.target.value); renderTimeline(); renderPreview(); };
    $('pDur').onchange = (e) => { t.duration = +e.target.value; renderTimeline(); renderPreview(); };
    $('btnApplyAllTexts').onclick = () => {
      state.texts.forEach(other => {
        other.size = t.size; other.color = t.color; other.font = t.font;
        other.bold = t.bold; other.anim = t.anim; other.fade = t.fade; other.outline = t.outline;
        other.box = t.box; other.boxColor = t.boxColor; other.boxOpacity = t.boxOpacity;
        other.px = t.px; other.py = t.py;
      });
      renderTimeline(); renderPreview(); toast('Estilo aplicado a ' + state.texts.length + ' textos');
    };
    // Passo 3: KF buttons text
    p.querySelectorAll('.kf-add-btn').forEach(btn => {
      btn.onclick = () => {
        const prop = btn.dataset.prop;
        const localT = state.time - t.start;
        const vals = { px: t.px ?? 0.5, py: t.py ?? 0.88, size: t.size, opacity: kfGet(t.keyframes?.opacity, localT, 1) };
        if (prop in vals) { kfAdd(t, prop, vals[prop], localT); toast(`◆ KF: ${prop} = ${typeof vals[prop] === 'number' ? vals[prop].toFixed(2) : vals[prop]} @ ${localT.toFixed(2)}s`); }
      };
    });
    return;
  }
  const c = state.clips.find(x => x.id === s.id); if (!c) return;
  c.filters = c.filters || {};
  const fillMode = c.filters.fillMode || 'fit';
  p.innerHTML = `<div class="prop">Enquadramento<select id="pFill">
      <option value="fit" ${fillMode === 'fit' ? 'selected' : ''}>Ajustar (Barras pretas)</option>
      <option value="blur" ${fillMode === 'blur' ? 'selected' : ''}>Desfoque de Fundo (Canvas Blur)</option>
      <option value="crop" ${fillMode === 'crop' ? 'selected' : ''}>Preencher (Cortar bordas)</option>
    </select></div>`
    + slider('Brilho', 'brightness', -50, 50, c.filters) + slider('Contraste', 'contrast', -50, 100, c.filters)
    + slider('Saturação', 'saturation', -100, 100, c.filters) + slider('Desfoque', 'blur', 0, 20, c.filters)
    + `<div class="prop">Zoom<input type="range" id="pZoom" min="1" max="3" step="0.05" value="${c.filters.zoom || 1}"></div>
       <div class="prop">Rotação<select id="pRot">${[0, 90, 180, 270].map(v => `<option ${(c.filters.rotate || 0) === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
       <div class="prop"><label><input type="checkbox" id="pH" ${c.filters.hflip ? 'checked' : ''}> Espelhar horizontal</label></div>
       <div class="prop"><label><input type="checkbox" id="pV" ${c.filters.vflip ? 'checked' : ''}> Espelhar vertical</label></div>
       <div class="prop"><label><input type="checkbox" id="pGray" ${c.filters.grayscale ? 'checked' : ''}> P&B</label></div>
       <div class="prop"><label><input type="checkbox" id="pVin" ${c.filters.vignette ? 'checked' : ''}> Vinheta (bordas escuras)</label></div>
       <div class="prop"><label><input type="checkbox" id="pFade" ${c.filters.fade ? 'checked' : ''}> Fade in/out</label></div>
       <div class="prop">Filtro de cor<select id="pPreset">${['none', 'sepia', 'vintage', 'warm', 'cool', 'cinematic', 'vivid'].map(v => `<option ${(c.filters.preset || 'none') === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
       <div class="prop">Transição para o próximo clipe<select id="pTrans">${['none', 'fade', 'dissolve', 'wipeleft', 'slideleft', 'circleopen', 'pixelize'].map(v => `<option ${(c.transition || 'none') === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
       <div class="prop">Velocidade<select id="pSpeed">${[0.5, 1, 1.5, 2].map(v => `<option ${c.speed === v || (!c.speed && v === 1) ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
       <div class="prop">Volume<input type="range" id="pVol" min="0" max="1" step="0.05" value="${c.volume ?? 1}"></div>
       <div class="prop"><label><input type="checkbox" id="pDenoise" ${c.filters.denoise ? 'checked' : ''}> Redução de ruído (chiado)</label></div>
       <div class="prop"><label><input type="checkbox" id="pLoudnorm" ${c.filters.loudnorm ? 'checked' : ''}> Normalizar volume (-14 LUFS)</label></div>
       <div class="prop" style="margin-top:10px">Curva de Velocidade <span style="font-size:10px;color:${c.speedCurve?.length ? '#00e5c3' : 'var(--mut)'}">${c.speedCurve?.length ? `◆ ativa (${c.speedCurve.length} pts)` : '(inativa)'}</span><canvas id="scCanvas" width="240" height="72" style="width:100%;height:72px;display:block;cursor:crosshair;border-radius:4px;margin-top:6px"></canvas><div style="display:flex;gap:4px;margin-top:4px"><button id="scRamp1" style="flex:1;font-size:10px;padding:3px" title="Início e fim lentos">↓ Slow in/out</button><button id="scRamp2" style="flex:1;font-size:10px;padding:3px" title="Câmera lenta no meio">◎ Bullet time</button><button id="scClear" style="font-size:10px;padding:3px 8px">✕</button></div><p class="hint" style="margin-top:3px">Clique: add ponto · Arrastar: mover · Duplo clique: excluir</p></div>`
       + (c.hasAudio && !c.isImage ? `<button id="btnDetach" class="wide">Separar Áudio do Vídeo</button>` : '')
       + `<div class="prop" style="margin-top:10px"><span style="font-size:11px;color:#00e5c3;font-weight:700">◆ Gravar Keyframe</span><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">`
       + ['zoom', 'opacity'].map(pp => `<button class="kf-add-btn" data-prop="${pp}" style="padding:2px 8px;font-size:11px;flex:none" title="Gravar keyframe de ${pp} no tempo atual">◆ ${pp}</button>`).join('')
       + `</div></div>`
       + rmbgPanel(c, 'clip')
       + `<hr style="border:none;border-top:1px solid var(--line);margin:10px 0">
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
  <span style="font-size:11px;color:#00e5c3;font-weight:700">Color Grading</span>
  <div style="display:flex;gap:4px">
    <button id="cgResetAll" class="cg-reset-btn" title="Resetar tudo">↺ reset</button>
    <button id="cgImportLut" class="cg-reset-btn" title="Importar LUT .cube">LUT</button>
  </div>
</div>
<div id="cgLutInfo" style="font-size:10px;color:var(--mut);margin-bottom:4px">${c.colorGrade?.lutPath ? '◉ LUT: '+c.colorGrade.lutPath.split(/[\\/]/).pop() : '◯ Sem LUT'}</div>
<div class="cg-tabs">
  <div class="cg-tab${(c._cgCh||'luma')==='luma'?' active':''}" data-ch="luma">Luma</div>
  <div class="cg-tab${(c._cgCh||'luma')==='r'?' active':''}" data-ch="r">R</div>
  <div class="cg-tab${(c._cgCh||'luma')==='g'?' active':''}" data-ch="g">G</div>
  <div class="cg-tab${(c._cgCh||'luma')==='b'?' active':''}" data-ch="b">B</div>
</div>
<div class="cg-curve-wrap"><canvas id="cgCurveCanvas"></canvas></div>
<p class="hint" style="margin:2px 0 6px">Clique: add · Arrastar: mover · Duplo clique: excluir</p>
<div style="font-size:10px;color:var(--mut);margin:4px 0 2px">Rodas de Cor</div>
<div class="cg-wheels">
  <div class="cg-wheel-col"><label>Lift (Sombras)</label><canvas id="cgWheelLift" width="${CG_CW_PX}" height="${CG_CW_PX}" style="width:${CG_CW_PX}px;height:${CG_CW_PX}px"></canvas><input type="range" class="cg-wheel-v" id="cgLiftV" min="-0.3" max="0.3" step="0.005" value="${((c.colorGrade?.lift?.r||0)+(c.colorGrade?.lift?.g||0)+(c.colorGrade?.lift?.b||0))/3}"></div>
  <div class="cg-wheel-col"><label>Gamma (Meios)</label><canvas id="cgWheelGamma" width="${CG_CW_PX}" height="${CG_CW_PX}" style="width:${CG_CW_PX}px;height:${CG_CW_PX}px"></canvas><input type="range" class="cg-wheel-v" id="cgGammaV" min="0.2" max="3" step="0.02" value="${((c.colorGrade?.gamma?.r||1)+(c.colorGrade?.gamma?.g||1)+(c.colorGrade?.gamma?.b||1))/3}"></div>
  <div class="cg-wheel-col"><label>Gain (Altas)</label><canvas id="cgWheelGain" width="${CG_CW_PX}" height="${CG_CW_PX}" style="width:${CG_CW_PX}px;height:${CG_CW_PX}px"></canvas><input type="range" class="cg-wheel-v" id="cgGainV" min="0" max="2.5" step="0.02" value="${((c.colorGrade?.gain?.r||1)+(c.colorGrade?.gain?.g||1)+(c.colorGrade?.gain?.b||1))/3}"></div>
</div>
<div class="prop">Matiz (Hue) <span id="cgHueVal">${(c.colorGrade?.hue||0).toFixed(0)}°</span><input type="range" id="cgHue" min="-180" max="180" step="1" value="${c.colorGrade?.hue||0}" style="margin-top:4px"></div>
<div class="prop">Saturação <span id="cgSatVal">${(c.colorGrade?.saturation||0).toFixed(0)}</span><input type="range" id="cgSat" min="-100" max="100" step="1" value="${c.colorGrade?.saturation||0}" style="margin-top:4px"></div>
<div class="prop">Luminosidade <span id="cgLumVal">${(c.colorGrade?.lightness||0).toFixed(0)}</span><input type="range" id="cgLum" min="-100" max="100" step="1" value="${c.colorGrade?.lightness||0}" style="margin-top:4px"></div>`;
  p.querySelectorAll('input[data-k]').forEach(i => i.oninput = () => { c.filters[i.dataset.k] = +i.value; renderPreview(); });
  rmbgBind(c, 'clip');
  $('pFill').onchange = (e) => { c.filters.fillMode = e.target.value; renderPreview(); };
  if ($('btnDetach')) $('btnDetach').onclick = () => detachAudio(c);
  $('pDenoise').onchange = (e) => { c.filters.denoise = e.target.checked; };
  $('pLoudnorm').onchange = (e) => { c.filters.loudnorm = e.target.checked; };
  $('pGray').onchange = (e) => { c.filters.grayscale = e.target.checked; renderPreview(); };
  $('pVin').onchange = (e) => { c.filters.vignette = e.target.checked; renderPreview(); };
  $('pZoom').oninput = (e) => { c.filters.zoom = +e.target.value; renderPreview(); };
  $('pRot').onchange = (e) => { c.filters.rotate = +e.target.value; renderPreview(); };
  $('pH').onchange = (e) => { c.filters.hflip = e.target.checked; renderPreview(); };
  $('pV').onchange = (e) => { c.filters.vflip = e.target.checked; renderPreview(); };
  $('pPreset').onchange = (e) => { c.filters.preset = e.target.value; renderPreview(); };
  $('pTrans').onchange = (e) => { c.transition = e.target.value; renderTimeline(); renderPreview(); };
  $('pFade').onchange = (e) => { c.filters.fade = e.target.checked; };
  $('pVol').oninput = (e) => { c.volume = +e.target.value; renderPreview(); };
  $('pSpeed').onchange = (e) => {
    const sp = +e.target.value, old = c.speed || 1;
    c.duration = c.duration * old / sp; c.speed = sp; renderTimeline(); renderPreview();
  };
  // Passo 4: speed curve canvas
  const scC = $('scCanvas');
  if (scC) {
    drawSpeedCurve(scC, c);
    const nearPt = (mx, my) => (c.speedCurve || []).find(pt => {
      const px = pt.t / c.duration;
      const py = 1 - (Math.log(Math.max(0.05, pt.v)) - SC_LOG_MIN) / SC_LOG_RANGE;
      return Math.hypot(px - mx, py - my) < 0.09;
    });
    scC.addEventListener('mousedown', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const rect = scC.getBoundingClientRect();
      const mx = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const my = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
      const existing = nearPt(mx, my);
      if (existing) {
        scDrag = { pt: existing, clip: c, canvas: scC };
      } else {
        const t = mx * c.duration;
        const v = Math.max(0.1, Math.min(4, Math.exp(SC_LOG_MIN + (1 - my) * SC_LOG_RANGE)));
        const pt = { t, v };
        if (!c.speedCurve) c.speedCurve = [];
        c.speedCurve.push(pt); c.speedCurve.sort((a, b) => a.t - b.t);
        scDrag = { pt, clip: c, canvas: scC };
        drawSpeedCurve(scC, c);
      }
    });
    scC.addEventListener('dblclick', (ev) => {
      const rect = scC.getBoundingClientRect();
      const mx = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const my = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
      const idx = (c.speedCurve || []).findIndex(pt => {
        const px = pt.t / c.duration;
        const py = 1 - (Math.log(Math.max(0.05, pt.v)) - SC_LOG_MIN) / SC_LOG_RANGE;
        return Math.hypot(px - mx, py - my) < 0.09;
      });
      if (idx >= 0) { c.speedCurve.splice(idx, 1); if (!c.speedCurve.length) delete c.speedCurve; drawSpeedCurve(scC, c); renderTimeline(); }
    });
  }
  if ($('scRamp1')) $('scRamp1').onclick = () => {
    const d = c.duration;
    c.speedCurve = [{t:0,v:0.5},{t:d*.2,v:0.5},{t:d*.5,v:1},{t:d*.8,v:0.5},{t:d,v:0.5}];
    renderProps(); renderPreview();
  };
  if ($('scRamp2')) $('scRamp2').onclick = () => {
    const d = c.duration;
    c.speedCurve = [{t:0,v:1},{t:d*.3,v:1},{t:d*.42,v:0.25},{t:d*.58,v:0.25},{t:d*.7,v:1},{t:d,v:1}];
    renderProps(); renderPreview();
  };
  if ($('scClear')) $('scClear').onclick = () => { delete c.speedCurve; renderTimeline(); renderProps(); renderPreview(); };
  // Passo 3: KF buttons clip
  const { starts: kfStarts } = layout();
  const kfClipStart = kfStarts[state.clips.indexOf(c)] ?? 0;
  p.querySelectorAll('.kf-add-btn').forEach(btn => {
    btn.onclick = () => {
      const prop = btn.dataset.prop;
      const localT = state.time - kfClipStart;
      const vals = { zoom: c.filters?.zoom || 1, opacity: kfGet(c.keyframes?.opacity, localT, 1) };
      if (prop in vals) { kfAdd(c, prop, vals[prop], localT); toast(`◆ KF: ${prop} = ${vals[prop].toFixed(2)} @ ${localT.toFixed(2)}s`); }
    };
  });

  // Passo 5: Color Grading bindings
  if (!c.colorGrade) c.colorGrade = cgDefault();
  const cg = c.colorGrade;
  if (!c._cgCh) c._cgCh = 'luma';

  // Curve canvas
  const cgC = $('cgCurveCanvas');
  if (cgC) {
    const wrap = cgC.parentElement;
    const dpr = window.devicePixelRatio||1;
    cgC.width = wrap.clientWidth*dpr; cgC.height = wrap.clientHeight*dpr;
    const getChPts = () => cg.curves[c._cgCh] || (cg.curves[c._cgCh]=[{x:0,y:0},{x:255,y:255}]);
    drawCurveCanvas(cgC, getChPts(), c._cgCh);

    cgC.onmousedown = (ev) => {
      ev.preventDefault();
      const rect=cgC.getBoundingClientRect();
      const rawX=(ev.clientX-rect.left)/rect.width*255;
      const rawY=(1-(ev.clientY-rect.top)/rect.height)*255;
      const pts=getChPts();
      const near=pts.findIndex(pt=>Math.hypot((pt.x-rawX)/255*rect.width,(pt.y-rawY)/255*rect.height)<8);
      if (near>=0) { cgCurveDrag={pts,idx:near,canvas:cgC,ch:c._cgCh}; return; }
      const newPt={x:Math.max(1,Math.min(254,rawX)),y:Math.max(0,Math.min(255,rawY))};
      pts.push(newPt); pts.sort((a,b)=>a.x-b.x);
      const ni=pts.indexOf(newPt);
      cgCurveDrag={pts,idx:ni,canvas:cgC,ch:c._cgCh};
      drawCurveCanvas(cgC,pts,c._cgCh);
    };
    cgC.ondblclick = (ev) => {
      const rect=cgC.getBoundingClientRect();
      const rawX=(ev.clientX-rect.left)/rect.width*255;
      const rawY=(1-(ev.clientY-rect.top)/rect.height)*255;
      const pts=getChPts();
      const idx=pts.findIndex((pt,i)=>i>0&&i<pts.length-1&&Math.hypot((pt.x-rawX)/255*rect.width,(pt.y-rawY)/255*rect.height)<8);
      if (idx>0&&idx<pts.length-1) { pts.splice(idx,1); drawCurveCanvas(cgC,pts,c._cgCh); renderPreview(); }
    };
  }

  // Curve channel tabs
  p.querySelectorAll('.cg-tab').forEach(tab=>{
    tab.onclick=()=>{
      c._cgCh=tab.dataset.ch;
      p.querySelectorAll('.cg-tab').forEach(t=>t.classList.toggle('active',t===tab));
      const cgC2=$('cgCurveCanvas');
      if (cgC2) {
        const pts=cg.curves[c._cgCh]||(cg.curves[c._cgCh]=[{x:0,y:0},{x:255,y:255}]);
        drawCurveCanvas(cgC2,pts,c._cgCh);
      }
    };
  });

  // Color wheels
  const wheelKeys = [{id:'cgWheelLift',key:'lift',vId:'cgLiftV'},{id:'cgWheelGamma',key:'gamma',vId:'cgGammaV'},{id:'cgWheelGain',key:'gain',vId:'cgGainV'}];
  wheelKeys.forEach(({id,key,vId})=>{
    const wc=$(id); if(!wc) return;
    const vals=cg[key]||(key==='lift'?{r:0,g:0,b:0}:{r:1,g:1,b:1});
    drawColorWheel(wc,vals.r-(key==='lift'?0:1),vals.g-(key==='lift'?0:1),vals.b-(key==='lift'?0:1));
    wc.onmousedown=(ev)=>{
      ev.preventDefault();
      cgWheelDrag={canvas:wc,cg,key};
      // initial apply
      const rect=wc.getBoundingClientRect();
      const mx=(ev.clientX-rect.left)/rect.width*2-1;
      const my=(ev.clientY-rect.top)/rect.height*2-1;
      cg[key]=cgWheelFromXY(mx,my,cg,key);
      // adjust for neutral offset in gamma/gain
      if (key!=='lift') { const v=$(vId)?.value||1; cg[key].r+=parseFloat(v)-1; cg[key].g+=parseFloat(v)-1; cg[key].b+=parseFloat(v)-1; }
      drawColorWheel(wc,cg[key].r-(key==='lift'?0:1),cg[key].g-(key==='lift'?0:1),cg[key].b-(key==='lift'?0:1));
      renderPreview();
    };
    const vSlider=$(vId); if(!vSlider) return;
    vSlider.oninput=(ev)=>{
      const v=parseFloat(ev.target.value);
      if (key==='lift') {
        const prev=(cg.lift.r+cg.lift.g+cg.lift.b)/3;
        cg.lift.r+=v-prev; cg.lift.g+=v-prev; cg.lift.b+=v-prev;
      } else {
        const prev=(cg[key].r+cg[key].g+cg[key].b)/3;
        const delta=v-prev;
        cg[key].r+=delta; cg[key].g+=delta; cg[key].b+=delta;
      }
      drawColorWheel(wc,cg[key].r-(key==='lift'?0:1),cg[key].g-(key==='lift'?0:1),cg[key].b-(key==='lift'?0:1));
      renderPreview();
    };
  });

  // HSL sliders
  if ($('cgHue')) { $('cgHue').oninput=(e)=>{ cg.hue=+e.target.value; $('cgHueVal').textContent=cg.hue.toFixed(0)+'°'; renderPreview(); }; }
  if ($('cgSat')) { $('cgSat').oninput=(e)=>{ cg.saturation=+e.target.value; $('cgSatVal').textContent=cg.saturation.toFixed(0); renderPreview(); }; }
  if ($('cgLum')) { $('cgLum').oninput=(e)=>{ cg.lightness=+e.target.value; $('cgLumVal').textContent=cg.lightness.toFixed(0); renderPreview(); }; }

  // LUT import
  if ($('cgImportLut')) $('cgImportLut').onclick=async()=>{
    const p2=await window.api.importLut();
    if (!p2) return;
    cg.lutPath=p2; $('cgLutInfo').textContent='◉ LUT: '+p2.split(/[\\/]/).pop();
    toast('LUT importada: '+p2.split(/[\\/]/).pop());
  };

  // Reset all
  if ($('cgResetAll')) $('cgResetAll').onclick=()=>{ c.colorGrade=cgDefault(); renderProps(); renderPreview(); toast('Color grading resetado'); };
}

function detachAudio(c) {
  if (!c || !c.hasAudio || c.isImage) return;
  const { starts } = layout();
  const idx = state.clips.indexOf(c);
  const clipStart = starts[idx] || 0;
  const sp = c.speed || 1;
  state.audios.push({
    id: uid++, path: c.path, name: 'Áudio - ' + c.name, wave: c.wave, start: clipStart, in: c.in,
    duration: c.duration, max: c.srcDur || (c.in + c.duration * sp), volume: c.volume ?? 1, fadeIn: 0, fadeOut: 0
  });
  c.hasAudio = false; c.volume = 0;
  renderTimeline(); renderProps(); renderPreview();
  toast('Áudio separado e movido para a trilha de áudio');
}

async function freezeFrame() {
  const hit = clipAt(state.time);
  if (!hit) return toast('Posicione o cursor dentro de um clipe');
  const c = hit.c;
  if (c.isImage) return toast('O clipe atual já é uma imagem estática');
  toast('Extraindo quadro congelado...');
  const sp = c.speed || 1;
  const timeInSource = c.in + (c.speedCurve?.length ? scSrcTime(c.speedCurve, hit.local) : hit.local * sp);
  try {
    const framePath = await window.api.freezeFrame(c.path, timeInSource);
    const idx = state.clips.indexOf(c);
    const b = { ...c, id: uid++, filters: { ...(c.filters || {}) }, in: c.in + hit.local * sp, duration: c.duration - hit.local };
    const freezeClip = {
      id: uid++, path: framePath, name: '❄ Freeze - ' + c.name, duration: 3, srcDur: 3, in: 0,
      hasVideo: true, hasAudio: false, isImage: true, filters: { ...(c.filters || {}) }, speed: 1, volume: 0,
      thumb: 'file:///' + framePath.replace(/\\/g, '/')
    };
    c.duration = hit.local; c.transition = 'none';
    state.clips.splice(idx + 1, 0, freezeClip, b);
    renderTimeline(); renderPreview();
    toast('Quadro congelado inserido (3s)');
  } catch (err) { toast('Erro ao congelar quadro: ' + (err.message || err)); }
}

function addOrToggleMarker() {
  if (!state.markers) state.markers = [];
  const idx = state.markers.findIndex(m => Math.abs(m.time - state.time) < 0.15);
  if (idx >= 0) { state.markers.splice(idx, 1); toast('Marcador removido'); }
  else {
    state.markers.push({ id: uid++, time: state.time, label: `M${state.markers.length + 1}` });
    state.markers.sort((a, b) => a.time - b.time);
    toast(`Marcador adicionado em ${fmt(state.time)}`);
  }
  renderTimeline();
}
function removeMarker(id) { state.markers = (state.markers || []).filter(m => m.id !== id); renderTimeline(); toast('Marcador removido'); }

function jumpCut(dir) {
  const { starts } = layout();
  const cuts = [0];
  state.clips.forEach((c, i) => { cuts.push(starts[i], starts[i] + c.duration); });
  (state.markers || []).forEach(m => cuts.push(m.time));
  const sorted = [...new Set(cuts.map(n => Math.round(n * 100) / 100))].sort((a, b) => a - b);
  if (dir < 0) { const prev = sorted.filter(t => t < state.time - 0.05); state.time = prev.length ? prev[prev.length - 1] : 0; }
  else { const next = sorted.find(t => t > state.time + 0.05); state.time = next !== undefined ? next : total(); }
  renderPreview();
}

function split() {
  const hit = clipAt(state.time); if (!hit || hit.local < 0.1 || hit.c.duration - hit.local < 0.1) return toast('Posicione o cursor dentro de um clipe');
  const c = hit.c, sp = c.speed || 1, idx = state.clips.indexOf(c);
  const splitSrc = c.speedCurve?.length ? scSrcTime(c.speedCurve, hit.local) : hit.local * sp;
  let bCurve;
  if (c.speedCurve?.length) {
    const vAtSplit = interpSC(c.speedCurve, hit.local);
    const aCurve = c.speedCurve.filter(pt => pt.t < hit.local);
    if (!aCurve.length || Math.abs(aCurve[aCurve.length - 1].t - hit.local) > 0.01) aCurve.push({ t: hit.local, v: vAtSplit });
    bCurve = c.speedCurve.filter(pt => pt.t > hit.local).map(pt => ({ t: pt.t - hit.local, v: pt.v }));
    if (!bCurve.length || bCurve[0].t > 0.01) bCurve.unshift({ t: 0, v: vAtSplit });
    c.speedCurve = aCurve;
  }
  const b = { ...c, id: uid++, filters: { ...(c.filters || {}) }, keyframes: {}, in: c.in + splitSrc, duration: c.duration - hit.local, speedCurve: bCurve };
  c.duration = hit.local; c.transition = 'none'; state.clips.splice(idx + 1, 0, b); renderTimeline();
}
function del() {
  const s = state.selected; if (!s) return;
  if (s.kind === 'clip') state.clips = state.clips.filter(c => c.id !== s.id);
  else if (s.kind === 'audio') state.audios = state.audios.filter(a => a.id !== s.id);
  else if (s.kind === 'overlay') state.overlays = state.overlays.filter(o => o.id !== s.id);
  else state.texts = state.texts.filter(t => t.id !== s.id);
  state.selected = null; renderTimeline(); renderProps(); renderPreview();
}

function renderMedia() {
  const l = $('mediaList'); l.innerHTML = '';
  state.media.forEach(m => {
    const e = document.createElement('div'); e.className = 'media-item';
    e.innerHTML = `${m.thumb ? `<img src="${m.thumb}" style="width:100%;border-radius:6px;margin-bottom:4px">` : ''}${m.name}<small>${m.duration.toFixed(1)}s${m.hasAudio ? ' · áudio' : ''}</small>`;
    e.onclick = () => {
      if (m.hasAudio && !m.hasVideo) state.audios.push({ id: uid++, path: m.path, name: m.name, wave: m.wave, start: state.time, in: 0, duration: m.duration, max: m.duration, volume: 1 });
      else state.clips.push({ id: uid++, ...m, srcDur: m.duration, in: 0, filters: {}, speed: 1, volume: 1 });
      renderTimeline(); renderPreview();
    };
    l.appendChild(e);
    if (m.hasVideo) {
      const b = document.createElement('button'); b.className = 'pip'; b.textContent = 'PiP'; b.title = 'Adicionar como sobreposição (picture-in-picture)';
      b.onclick = (ev) => {
        ev.stopPropagation();
        state.overlays.push({ id: uid++, path: m.path, name: m.name, thumb: m.thumb, isImage: m.isImage, start: state.time, in: 0, duration: m.duration, max: m.duration, x: 1, y: 0, scale: 30, opacity: 1 });
        renderTimeline(); renderPreview();
      };
      e.prepend(b);
    }
  });
}

function renderTrackHeaders() {
  const tr = state.tracks;
  const setBtn = (id, active, isOff) => { const el = $(id); if (!el) return; el.classList.toggle('active', !!active); el.classList.toggle('off', !!isOff); };
  setBtn('thEyeVideo', false, tr.video.visible === false);
  setBtn('thMuteVideo', tr.video.mute, tr.video.mute);
  if ($('thGroupVideo')) $('thGroupVideo').style.opacity = tr.video.visible === false ? '0.5' : '1';
  setBtn('thEyeOverlay', false, tr.overlay.visible === false);
  if ($('thGroupOverlay')) $('thGroupOverlay').style.opacity = tr.overlay.visible === false ? '0.5' : '1';
  setBtn('thEyeText', false, tr.text.visible === false);
  if ($('thGroupText')) $('thGroupText').style.opacity = tr.text.visible === false ? '0.5' : '1';
  setBtn('thMuteAudio', tr.audio.mute, tr.audio.mute);
  setBtn('thSoloAudio', tr.audio.solo, false);
  if ($('thGroupAudio')) $('thGroupAudio').style.opacity = tr.audio.mute ? '0.5' : '1';
}

function initTrackHeaders() {
  if ($('thEyeVideo')) $('thEyeVideo').onclick = () => { state.tracks.video.visible = !(state.tracks.video.visible !== false); renderTrackHeaders(); renderPreview(); };
  if ($('thMuteVideo')) $('thMuteVideo').onclick = () => { state.tracks.video.mute = !state.tracks.video.mute; renderTrackHeaders(); renderPreview(); };
  if ($('thEyeOverlay')) $('thEyeOverlay').onclick = () => { state.tracks.overlay.visible = !(state.tracks.overlay.visible !== false); renderTrackHeaders(); renderPreview(); };
  if ($('thEyeText')) $('thEyeText').onclick = () => { state.tracks.text.visible = !(state.tracks.text.visible !== false); renderTrackHeaders(); renderPreview(); };
  if ($('thMuteAudio')) $('thMuteAudio').onclick = () => { state.tracks.audio.mute = !state.tracks.audio.mute; renderTrackHeaders(); renderPreview(); };
  if ($('thSoloAudio')) $('thSoloAudio').onclick = () => { state.tracks.audio.solo = !state.tracks.audio.solo; renderTrackHeaders(); renderPreview(); };
  renderTrackHeaders();
}

$('btnImport').onclick = async () => { state.media.push(...await window.api.importMedia()); renderMedia(); };
$('btnPlay').onclick = () => setPlaying(!state.playing);
$('btnSplit').onclick = split;
$('btnFreeze').onclick = freezeFrame;
$('btnDelete').onclick = del;
$('btnAddText').onclick = () => {
  const v = $('txtInput').value.trim(); if (!v) return;
  state.texts.push({ id: uid++, text: v, color: $('txtColor').value, size: +$('txtSize').value, start: state.time, duration: 3 });
  renderTimeline(); renderPreview();
};
$('btnSrt').onclick = async () => {
  const srt = await window.api.importSrt(); if (!srt) return;
  const toSec = (s) => { const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; };
  let n = 0;
  srt.replace(/\r/g, '').split(/\n\n+/).forEach(b => {
    const l = b.trim().split('\n'); const i = l.findIndex(x => x.includes('-->')); if (i < 0) return;
    const [a, z] = l[i].split('-->'); const text = l.slice(i + 1).join(' ').trim(); if (!text) return;
    state.texts.push({ id: uid++, text, color: $('txtColor').value, size: +$('txtSize').value, start: toSec(a), duration: toSec(z) - toSec(a) }); n++;
  });
  renderTimeline(); renderPreview(); toast(n + ' legendas importadas');
};
$('btnAuto').onclick = async () => {
  const withAudio = state.clips.map((c, i) => ({ c, i })).filter(x => x.c.hasAudio && !x.c.isImage);
  if (!withAudio.length) return toast('Nenhum clipe com áudio na timeline');
  const btn = $('btnAuto'); btn.disabled = true;
  window.api.onWhisper(m => toast(m));
  const { starts } = layout(); let n = 0;
  for (const { c, i } of withAudio) {
    toast('Preparando áudio...');
    const r = await window.api.transcribe(c, $('asrLang').value);
    if (!r.ok) { toast('Erro: ' + r.error.slice(0, 200)); btn.disabled = false; return; }
    const sp = c.speed || 1;
    r.chunks.forEach(k => {
      const s = starts[i] + k.start / sp, d = Math.max(0.5, (k.end - k.start) / sp);
      state.texts.push({ id: uid++, text: k.text, color: $('txtColor').value, size: +$('txtSize').value, start: s, duration: d }); n++;
    });
  }
  btn.disabled = false; renderTimeline(); renderPreview(); toast(n + ' legendas geradas');
};
$('zoom').oninput = (e) => { pxPerSec = +e.target.value; renderTimeline(); };
$('ruler').onclick = (e) => { state.time = Math.max(0, (e.clientX - $('ruler').getBoundingClientRect().left) / pxPerSec); renderPreview(); };
$('btnMarker').onclick = addOrToggleMarker;
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  const fps = +$('expFps').value || 30;
  const frameDur = 1 / fps;
  if (e.key === 's' || e.key === 'S') split();
  else if (e.key === 'Delete') del();
  else if (e.key === 'f' || e.key === 'F') freezeFrame();
  else if (e.key === 'm' || e.key === 'M') addOrToggleMarker();
  else if (e.key === 'n' || e.key === 'N') toggleSnap();
  else if (e.key === 'ArrowLeft') { e.preventDefault(); state.time = Math.max(0, state.time - (e.shiftKey ? 1 : frameDur)); renderPreview(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); state.time = Math.min(total(), state.time + (e.shiftKey ? 1 : frameDur)); renderPreview(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); jumpCut(-1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); jumpCut(1); }
  else if (e.key === 'j' || e.key === 'J') { state.time = Math.max(0, state.time - 2); renderPreview(); }
  else if (e.key === 'k' || e.key === 'K') { setPlaying(false); }
  else if (e.key === 'l' || e.key === 'L') { state.time = Math.min(total(), state.time + 2); renderPreview(); }
  else if (e.key === ' ') { e.preventDefault(); setPlaying(!state.playing); }
});

const PRESET_CONFIGS = {
  tiktok: { aspect: '9:16', res: '1080', fps: '30', crf: '18' },
  youtube: { aspect: '16:9', res: '1080', fps: '60', crf: '18' },
  youtube4k: { aspect: '16:9', res: '2160', fps: '60', crf: '14' },
  instagram_feed: { aspect: '1:1', res: '1080', fps: '30', crf: '18' },
  instagram_portrait: { aspect: '4:5', res: '1080', fps: '30', crf: '18' }
};
if ($('quickPreset')) {
  $('quickPreset').onchange = (e) => {
    const cfg = PRESET_CONFIGS[e.target.value]; if (!cfg) return;
    $('expAspect').value = cfg.aspect; $('expRes').value = cfg.res; $('expFps').value = cfg.fps; $('expQ').value = cfg.crf;
    applyAspect(); toast(`Predefinição aplicada: ${e.target.options[e.target.selectedIndex].text}`);
  };
  ['expAspect', 'expRes', 'expFps', 'expQ'].forEach(id => { const el = $(id); if (el) el.addEventListener('change', () => { $('quickPreset').value = 'custom'; }); });
}

$('btnSave').onclick = async () => {
  if (await window.api.saveProject({
    media: state.media, clips: state.clips, texts: state.texts, audios: state.audios, overlays: state.overlays, tracks: state.tracks, markers: state.markers,
    settings: { aspect: $('expAspect').value, res: $('expRes').value, fps: $('expFps').value, crf: $('expQ').value }
  })) toast('Projeto salvo');
};
$('btnOpen').onclick = async () => {
  const d = await window.api.openProject(); if (!d) return;
  Object.assign(state, {
    media: d.media, clips: d.clips, texts: d.texts, audios: d.audios || [], overlays: d.overlays || [], markers: d.markers || [],
    tracks: d.tracks || { video: { visible: true, mute: false }, overlay: { visible: true }, text: { visible: true }, audio: { mute: false, solo: false } },
    selected: null, time: 0
  });
  uid = 1 + Math.max(0, ...state.clips.map(c => c.id), ...state.texts.map(t => t.id), ...state.audios.map(a => a.id), ...state.overlays.map(o => o.id), ...(state.markers || []).map(m => m.id));
  if (d.settings) { $('expAspect').value = d.settings.aspect; $('expRes').value = d.settings.res; $('expFps').value = d.settings.fps; $('expQ').value = d.settings.crf; }
  renderMedia(); renderTrackHeaders(); renderTimeline(); renderProps(); applyAspect();
};
$('btnExport').onclick = async () => {
  if (!state.clips.length) return toast('Adicione clipes à timeline');
  toast('Exportando...'); window.api.onProgress(s => toast(`Exportando... ${Math.min(99, Math.round(s / total() * 100))}%`));
  const r = await window.api.exportVideo({
    clips: state.clips, texts: state.texts, audios: state.audios, overlays: state.overlays, tracks: state.tracks,
    settings: { height: +$('expRes').value, fps: +$('expFps').value, crf: +$('expQ').value, aspect: $('expAspect').value }
  });
  toast(r.ok ? 'Exportado: ' + r.path : (r.log ? 'Erro: ' + r.log.slice(-200) : 'Cancelado'));
};

function applyAspect() {
  const [a, b] = $('expAspect').value.split(':').map(Number), st = $('stage');
  st.style.aspectRatio = `${a} / ${b}`;
  if (a >= b) { st.style.width = '100%'; st.style.height = 'auto'; } else { st.style.width = 'auto'; st.style.height = '50vh'; }
  renderPreview();
}
$('expAspect').onchange = applyAspect;

const snapshot = () => JSON.stringify({ clips: state.clips, texts: state.texts, audios: state.audios, overlays: state.overlays, tracks: state.tracks, markers: state.markers });
let hLast = snapshot(); const undoStack = [], redoStack = [];
function hCheck() { const cur = snapshot(); if (cur !== hLast) { undoStack.push(hLast); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; hLast = cur; } }
function hApply(json) {
  const d = JSON.parse(json); Object.assign(state, d, { selected: null });
  if (!state.tracks) state.tracks = { video: { visible: true, mute: false }, overlay: { visible: true }, text: { visible: true }, audio: { mute: false, solo: false } };
  if (!state.markers) state.markers = [];
  hLast = json; renderTrackHeaders(); renderTimeline(); renderProps(); renderPreview();
}
function undo() { hCheck(); if (!undoStack.length) return; redoStack.push(snapshot()); hApply(undoStack.pop()); }
function redo() { hCheck(); if (!redoStack.length) return; undoStack.push(snapshot()); hApply(redoStack.pop()); }
setInterval(hCheck, 300);
$('btnUndo').onclick = undo; $('btnRedo').onclick = redo;
document.addEventListener('keydown', (e) => {
  const t = e.target; if (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && ['text', 'number'].includes(t.type))) return;
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
});
initTrackHeaders();
applyAspect();
renderTimeline(); renderPreview();
