const fs = require('fs');
const pathMod = require('path');
const FONTS = {
  'Arial': ['arial.ttf', 'arialbd.ttf'], 'Impact': ['impact.ttf', 'impact.ttf'], 'Segoe UI': ['segoeui.ttf', 'segoeuib.ttf'],
  'Comic Sans MS': ['comic.ttf', 'comicbd.ttf'], 'Times New Roman': ['times.ttf', 'timesbd.ttf'], 'Courier New': ['cour.ttf', 'courbd.ttf']
};
function fontPath(name, bold) {
  const pair = FONTS[name || 'Arial'] || FONTS.Arial;
  const p = pathMod.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', pair[bold ? 1 : 0]);
  return fs.existsSync(p) ? p.replace(/\\/g, '/').replace(/:/g, '\\:') : null;
}
const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "’").replace(/%/g, '\\\\\\%');

function scInterpV(curve, t) {
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
function scBuildPairs(curve, dur) {
  const sorted = [...curve].sort((a, b) => a.t - b.t);
  const pairs = [{ s: 0, t: 0 }];
  let srcAcc = 0, tPrev = 0, vPrev = scInterpV(sorted, 0);
  for (const cp of sorted) {
    const dt = cp.t - tPrev;
    if (dt > 0) srcAcc += (vPrev + cp.v) / 2 * dt;
    pairs.push({ s: srcAcc, t: cp.t });
    tPrev = cp.t; vPrev = cp.v;
  }
  if (tPrev < dur - 0.001) {
    srcAcc += vPrev * (dur - tPrev);
    pairs.push({ s: srcAcc, t: dur });
  }
  return pairs;
}
function scSetptsExpr(pairs) {
  const S = '((PTS-STARTPTS)*TB)';
  if (pairs.length < 2) return `${S}`;
  let expr = pairs[pairs.length - 1].t.toFixed(6);
  for (let i = pairs.length - 2; i >= 0; i--) {
    const a = pairs[i], b = pairs[i + 1];
    const ds = b.s - a.s, dt = b.t - a.t;
    const lerp = ds > 0.00001 ? `(${a.t.toFixed(6)}+(${S}-${a.s.toFixed(6)})/${ds.toFixed(6)}*${dt.toFixed(6)})` : a.t.toFixed(6);
    expr = `if(lt(${S}\\,${b.s.toFixed(6)})\\,${lerp}\\,${expr})`;
  }
  return `(if(lt(${S}\\,0)\\,0\\,${expr}))/TB`;
}

function kfExpr(kfs, tVar, def) {
  if (!kfs?.length) return String(def);
  let expr = String(kfs[kfs.length - 1].v);
  for (let i = kfs.length - 2; i >= 0; i--) {
    const a = kfs[i], b = kfs[i + 1];
    const dur = b.t - a.t;
    const lerp = dur > 0 ? `(${a.v}+(${tVar}-${a.t})/${dur}*(${b.v}-${a.v}))` : String(b.v);
    expr = `if(lt(${tVar}\\,${b.t})\\,${lerp}\\,${expr})`;
  }
  return `if(lt(${tVar}\\,${kfs[0].t})\\,${kfs[0].v}\\,${expr})`;
}

// Passo 6: troca a fonte pelo recorte com alpha quando ele cobre o trecho usado do clipe
function withRmbg(item, srcNeed) {
  const b = item.bgRemoval;
  if (!b?.enabled || !b.path || !fs.existsSync(b.path)) return item;
  if (item.isImage) return { ...item, path: b.path, _rmbg: true };
  const inP = item.in || 0;
  if (inP < b.srcIn - 0.05 || inP + srcNeed > b.srcIn + b.srcDur + 0.05) return item;
  return { ...item, path: b.path, in: Math.max(0, inP - b.srcIn), _rmbg: true };
}
const clipSrcNeed = (c) => c.speedCurve?.length ? scBuildPairs(c.speedCurve, c.duration).slice(-1)[0].s : c.duration * (c.speed || 1);
const pushInput = (args, item) => {
  if (item.isImage) args.push('-loop', '1', '-t', String(item.duration), '-i', item.path);
  else if (item._rmbg) args.push('-c:v', 'libvpx-vp9', '-i', item.path);
  else args.push('-i', item.path);
};

const PRESETS = {
  sepia: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
  vintage: 'curves=preset=vintage',
  warm: 'colorbalance=rs=.15:gs=.05:bs=-.15',
  cool: 'colorbalance=rs=-.15:bs=.15',
  cinematic: 'eq=contrast=1.15:saturation=0.9,colorbalance=rs=-.05:bs=.08:rh=.08:bh=-.05',
  vivid: 'eq=saturation=1.6:contrast=1.1'
};

function buildFfmpeg(project, outPath) {
  const S = project.settings || {};
  const [ra, rb] = (S.aspect || '16:9').split(':').map(Number), r = ra / rb, res = S.height || 720;
  const ev = (n) => Math.round(n / 2) * 2;
  const H = r >= 1 ? ev(res) : ev(res / r), W = r >= 1 ? ev(res * r) : ev(res), FPS = S.fps || 30, CRF = S.crf || 18;
  const tracks = project.tracks || {};
  const isVideoVisible = tracks.video?.visible !== false;
  const isVideoMuted = !!tracks.video?.mute || !!tracks.audio?.solo;
  const isOverlayVisible = tracks.overlay?.visible !== false;
  const isTextVisible = tracks.text?.visible !== false;
  const isAudioMuted = !!tracks.audio?.mute;

  const clips = project.clips.map(c => withRmbg(c, clipSrcNeed(c)));
  const audios = isAudioMuted ? [] : (project.audios || []);
  const overlays = isOverlayVisible ? (project.overlays || []).map(o => withRmbg(o, o.duration)) : [];
  const args = [];
  const f = [];
  const extraInputs = [];
  const extraBase = clips.length + audios.length + overlays.length;
  clips.forEach((c) => pushInput(args, c));
  let concatIn = '';
  clips.forEach((c, i) => {
    const fl = c.filters || {};
    const speed = c.speed || 1;
    const fillMode = c._rmbg && fl.fillMode === 'blur' ? 'fit' : (fl.fillMode || 'fit');
    let trim;
    if (!c.isImage && c.speedCurve?.length) {
      const pairs = scBuildPairs(c.speedCurve, c.duration);
      const totalSrc = pairs[pairs.length - 1].s;
      trim = `trim=start=${c.in}:end=${(c.in + totalSrc).toFixed(6)},setpts='${scSetptsExpr(pairs)}',`;
    } else {
      trim = (c.isImage ? '' : `trim=start=${c.in}:end=${c.in + c.duration * speed},setpts=(PTS-STARTPTS)/${speed},`)
        + (c.isImage ? 'setpts=PTS-STARTPTS,' : '');
    }

    let inLabel = `[${i}:v]`;
    const preFilters = [];
    if (fillMode === 'blur') {
      f.push(`[${i}:v]${trim}split=2[raw_bg_${i}][raw_fg_${i}]`);
      f.push(`[raw_bg_${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=30,eq=brightness=-0.15,setsar=1,fps=${FPS}[bg_${i}]`);
      f.push(`[raw_fg_${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1,fps=${FPS}[fg_${i}]`);
      f.push(`[bg_${i}][fg_${i}]overlay=(W-w)/2:(H-h)/2[c_base_${i}]`);
      inLabel = `[c_base_${i}]`;
    } else if (fillMode === 'crop') {
      preFilters.push(trim + `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS}`);
    } else {
      preFilters.push(trim + `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2${c._rmbg ? ':color=black@0' : ''},setsar=1,fps=${FPS}`);
    }
    // Passo 6: compõe o recorte (com alpha) sobre o fundo escolhido antes dos ajustes de cor
    if (c._rmbg) {
      const bg = c.bgRemoval || {};
      let bgSrc;
      if (bg.bg === 'image' && bg.image && fs.existsSync(bg.image)) {
        const idx = extraBase + extraInputs.length;
        extraInputs.push('-loop', '1', '-t', String(c.duration), '-i', bg.image);
        bgSrc = `[${idx}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS},format=yuv420p`;
      } else {
        const col = bg.bg === 'color' ? (bg.color || '#00b140').replace('#', '0x') : 'black';
        bgSrc = `color=c=${col}:s=${W}x${H}:r=${FPS}:d=${c.duration},format=yuv420p`;
      }
      f.push(`${bgSrc}[rmbg_bg_${i}]`);
      f.push(`${inLabel}format=yuva420p,${preFilters.join(',')}[rmbg_fg_${i}]`);
      f.push(`[rmbg_bg_${i}][rmbg_fg_${i}]overlay=0:0:shortest=1,format=yuv420p[rmbg_${i}]`);
      inLabel = `[rmbg_${i}]`;
      preFilters.length = 0;
    }

    const postFilters = [];
    if ((fl.zoom || 1) > 1) postFilters.push(`scale=${Math.round(W * fl.zoom)}:${Math.round(H * fl.zoom)},crop=${W}:${H}`);
    if (fl.hflip) postFilters.push('hflip');
    if (fl.vflip) postFilters.push('vflip');
    if (fl.rotate === 180) postFilters.push('hflip,vflip');
    if (fl.rotate === 90) postFilters.push(`transpose=1,scale=${W}:${H}`);
    else if (fl.rotate === 270) postFilters.push(`transpose=2,scale=${W}:${H}`);
    postFilters.push(`eq=brightness=${(fl.brightness || 0) / 100}:contrast=${1 + (fl.contrast || 0) / 100}:saturation=${1 + (fl.saturation || 0) / 100}`);
    if (PRESETS[fl.preset]) postFilters.push(PRESETS[fl.preset]);
    if (fl.blur) postFilters.push(`gblur=sigma=${fl.blur}`);
    if (fl.grayscale) postFilters.push('hue=s=0');
    if (fl.vignette) postFilters.push('vignette=PI/4');
    if (fl.fade) postFilters.push(`fade=t=in:st=0:d=0.5,fade=t=out:st=${Math.max(0, c.duration - 0.5)}:d=0.5`);
    // Passo 5: color grading
    const cg = c.colorGrade;
    if (cg) {
      const cgCurveY = (pts, x) => {
        if (!pts?.length) return x;
        if (x <= pts[0].x) return pts[0].y;
        const last = pts[pts.length - 1];
        if (x >= last.x) return last.y;
        for (let i = 0; i < pts.length - 1; i++) {
          if (x >= pts[i].x && x <= pts[i + 1].x) {
            const t = (x - pts[i].x) / (pts[i + 1].x - pts[i].x);
            return pts[i].y * (1 - t) + pts[i + 1].y * t;
          }
        }
        return x;
      };
      const curvs = cg.curves || {};
      const luma = curvs.luma || [{x:0,y:0},{x:255,y:255}];
      const buildCurveStr = (ch) => {
        const pts = curvs[ch] || luma;
        const samples = [0, 64, 128, 192, 255].map(x => {
          const y = cgCurveY(luma, cgCurveY(pts, x));
          return (Math.max(0, Math.min(255, y)) / 255).toFixed(4);
        });
        return samples.join('/');
      };
      const isIdentity = (ch) => {
        const pts = curvs[ch]; if (!pts || pts.length === 2 && pts[0].x === 0 && pts[0].y === 0 && pts[1].x === 255 && pts[1].y === 255) return true;
        return false;
      };
      const lumaIdent = isIdentity('luma');
      if (!lumaIdent || !isIdentity('r') || !isIdentity('g') || !isIdentity('b')) {
        postFilters.push(`curves=master='${buildCurveStr('luma')}':red='${buildCurveStr('r')}':green='${buildCurveStr('g')}':blue='${buildCurveStr('b')}'`);
      }
      const lt = cg.lift || {r:0,g:0,b:0};
      const gam = cg.gamma || {r:1,g:1,b:1};
      const gn = cg.gain || {r:1,g:1,b:1};
      if (lt.r||lt.g||lt.b||gam.r!==1||gam.g!==1||gam.b!==1||gn.r!==1||gn.g!==1||gn.b!==1) {
        postFilters.push(`colorlevels=rimin=${(-lt.r).toFixed(4)}:gimin=${(-lt.g).toFixed(4)}:bimin=${(-lt.b).toFixed(4)}:romax=${gn.r.toFixed(4)}:gomax=${gn.g.toFixed(4)}:bomax=${gn.b.toFixed(4)}`);
        if (gam.r!==1||gam.g!==1||gam.b!==1) postFilters.push(`eq=gamma_r=${(1/gam.r).toFixed(4)}:gamma_g=${(1/gam.g).toFixed(4)}:gamma_b=${(1/gam.b).toFixed(4)}`);
      }
      if (cg.hue || cg.saturation) postFilters.push(`hue=h=${cg.hue||0}:s=${Math.max(0,1+(cg.saturation||0)/100).toFixed(4)}`);
      if (cg.lightness) postFilters.push(`eq=brightness=${((cg.lightness||0)/100*0.5).toFixed(4)}`);
      if (cg.lutPath && fs.existsSync(cg.lutPath)) postFilters.push(`lut3d='${cg.lutPath.replace(/\\/g,'/').replace(/:/g,'\\:')}'`);
    }
    if (!isVideoVisible) postFilters.push('drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill');

    const allFilters = [...preFilters, ...postFilters];
    f.push(`${inLabel}${allFilters.join(',')}[v${i}]`);
    if (c.hasAudio && !c.isImage && !isVideoMuted && !c.speedCurve?.length) {
      const tempo = speed !== 1 ? `,atempo=${speed}` : '';
      let af = `atrim=start=${c.in}:end=${c.in + c.duration * speed},asetpts=PTS-STARTPTS${tempo},volume=${c.volume ?? 1}`;
      if (fl.denoise) af += ',afftdn=nf=-25';
      if (fl.loudnorm) af += ',loudnorm=I=-14:TP=-1.5:LRA=11';
      af += ',aresample=44100,aformat=channel_layouts=stereo';
      f.push(`[${i}:a]${af}[a${i}]`);
    } else {
      f.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${c.duration}[a${i}]`);
    }
    concatIn += `[v${i}][a${i}]`;
  });
  const anyT = clips.some(c => c.transition && c.transition !== 'none');
  if (!anyT || clips.length === 1) {
    f.push(`${concatIn}concat=n=${clips.length}:v=1:a=1[vc][ac0]`);
  } else {
    let vP = 'v0', aP = 'a0', L = clips[0].duration;
    for (let i = 1; i < clips.length; i++) {
      const prev = clips[i - 1], cur = clips[i];
      const has = prev.transition && prev.transition !== 'none';
      const t = has ? prev.transition : 'fade';
      const d = has ? Math.max(0.05, Math.min(0.5, prev.duration / 2, cur.duration / 2)) : 0.04;
      f.push(`[${vP}][v${i}]xfade=transition=${t}:duration=${d}:offset=${(L - d).toFixed(3)}[xv${i}]`);
      f.push(`[${aP}][a${i}]acrossfade=d=${d}[xa${i}]`);
      vP = `xv${i}`; aP = `xa${i}`; L += cur.duration - d;
    }
    f.push(`[${vP}]null[vc]`, `[${aP}]anull[ac0]`);
  }
  let aOut = 'ac0';
  if (audios.length) {
    audios.forEach((a, j) => {
      const idx = clips.length + j; args.push('-i', a.path);
      const ms = Math.round(a.start * 1000);
      let af = `atrim=start=${a.in || 0}:end=${(a.in || 0) + a.duration},asetpts=PTS-STARTPTS,volume=${a.volume ?? 1}`;
      if (a.fadeIn) af += `,afade=t=in:st=0:d=${a.fadeIn}`;
      if (a.fadeOut) af += `,afade=t=out:st=${Math.max(0, a.duration - a.fadeOut)}:d=${a.fadeOut}`;
      if (a.denoise) af += ',afftdn=nf=-25';
      if (a.loudnorm) af += ',loudnorm=I=-14:TP=-1.5:LRA=11';
      af += `,aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms}`;
      f.push(`[${idx}:a]${af}[m${j}]`);
    });
    const n = audios.length + 1;
    f.push(`[ac0]${audios.map((_, j) => `[m${j}]`).join('')}amix=inputs=${n}:duration=first:dropout_transition=0,volume=${n}[acm]`);
    aOut = 'acm';
  }
  let last = 'vc';
  overlays.forEach((o, k) => {
    const idx = clips.length + audios.length + k;
    pushInput(args, o);
    const trim = o.isImage ? '' : `trim=start=${o.in || 0}:end=${(o.in || 0) + o.duration},`;
    const ck = o.chroma ? `colorkey=color=0x${(o.chromaColor || '#00ff00').slice(1)}:similarity=${o.chromaSim ?? 0.3}:blend=0.1,` : '';
    const flip = o.hflip ? 'hflip,' : '';
    const rot = o.rotate ? `rotate=${o.rotate}*PI/180:c=none:ow='rotw(${o.rotate}*PI/180)':oh='roth(${o.rotate}*PI/180)',` : '';
    const anim = o.anim || 'none';
    const kfo = o.keyframes || {}, kfTRel = `(t-${o.start})`;
    let alphaExpr = `aa=${o.opacity ?? 1}`;
    if (anim === 'fade') {
      alphaExpr = `aa='if(lt(t\\,${o.start}+0.4)\\,(t-${o.start})/0.4*${o.opacity ?? 1}\\,if(gt(t\\,${o.start + o.duration}-0.4)\\,(${o.start + o.duration}-t)/0.4*${o.opacity ?? 1}\\,${o.opacity ?? 1}))'`;
    }
    if (kfo.opacity?.length) alphaExpr = `aa='${kfExpr(kfo.opacity, kfTRel, o.opacity ?? 1)}'`;
    f.push(`[${idx}:v]${trim}setpts=PTS-STARTPTS+${o.start}/TB,scale=${Math.round(W * o.scale / 100 / 2) * 2}:-2,${flip}${rot}${ck}format=yuva420p,colorchannelmixer=${alphaExpr}[ov${k}]`);

    let pr = o.motion ? `min(1\\,max(0\\,(t-${o.start})/${o.duration}))` : '0';
    if (o.motion && o.easing === 'smooth') {
      pr = `(3*pow(${pr}\\,2)-2*pow(${pr}\\,3))`;
    }
    let ex = o.motion ? `(${o.x}+(${o.x2 ?? o.x}-${o.x})*${pr})` : `${o.x}`;
    let ey = o.motion ? `(${o.y}+(${o.y2 ?? o.y}-${o.y})*${pr})` : `${o.y}`;
    if (kfo.x?.length) ex = kfExpr(kfo.x, kfTRel, o.x);
    if (kfo.y?.length) ey = kfExpr(kfo.y, kfTRel, o.y);

    if (anim === 'slide_left') {
      ex = `if(lt(t\\,${o.start}+0.4)\\,${ex}-(1-(t-${o.start})/0.4)*0.35\\,${ex})`;
    } else if (anim === 'slide_right') {
      ex = `if(lt(t\\,${o.start}+0.4)\\,${ex}+(1-(t-${o.start})/0.4)*0.35\\,${ex})`;
    } else if (anim === 'float') {
      ey = `(${ey}+sin((t-${o.start})*PI)*0.03)`;
    }

    f.push(`[${last}][ov${k}]overlay=x='(W-w)*${ex}':y='(H-h)*${ey}':enable='between(t,${o.start},${o.start + o.duration})':eof_action=pass[o${k}]`);
    last = `o${k}`;
  });
  const texts = isTextVisible ? (project.texts || []) : [];
  texts.forEach((t, i) => {
    const fs0 = t.fontSize || t.size || 48;
    const fontFile = fontPath(t.font, t.bold !== false);
    const bw = t.outline ?? 2;
    const anim = t.anim || (t.fade ? 'fade' : 'none');
    let alpha = '';
    let yExpr = `(h-text_h)*${t.py ?? 0.88}`;
    let fsExpr = String(Math.round(fs0 * Math.min(W, H) / 720));

    if (anim === 'fade') {
      alpha = `:alpha='if(lt(t,${t.start}+0.3),(t-${t.start})/0.3,if(gt(t,${t.start + t.duration}-0.3),(${t.start + t.duration}-t)/0.3,1))'`;
    } else if (anim === 'slide') {
      alpha = `:alpha='if(lt(t,${t.start}+0.25),(t-${t.start})/0.25,1)'`;
      const slideDist = Math.round(35 * Math.min(W, H) / 720);
      yExpr = `if(lt(t\\,${t.start}+0.3)\\,(h-text_h)*${t.py ?? 0.88}+(1-(t-${t.start})/0.3)*${slideDist}\\,(h-text_h)*${t.py ?? 0.88})`;
    } else if (anim === 'pop') {
      alpha = `:alpha='if(lt(t,${t.start}+0.2),(t-${t.start})/0.2,1)'`;
      const baseFs = Math.round(fs0 * Math.min(W, H) / 720);
      fsExpr = `if(lt(t\\,${t.start}+0.25)\\,${baseFs}*(0.6+0.4*(t-${t.start})/0.25)\\,${baseFs})`;
    }

    // Passo 3: keyframe opacity override for texts
    const tkf = t.keyframes || {};
    if (tkf.opacity?.length) alpha = `:alpha='${kfExpr(tkf.opacity, `(t-${t.start})`, 1)}'`;
    const box = t.box ? `:box=1:boxcolor=${(t.boxColor || '#000000').replace('#', '0x')}@${t.boxOpacity ?? 0.6}:boxborderw=${Math.round(14 * Math.min(W, H) / 720)}` : '';
    f.push(`[${last}]drawtext=text='${esc(t.text)}'${fontFile ? `:fontfile='${fontFile}'` : ''}:fontcolor=${t.color || 'white'}:fontsize='${fsExpr}':x=(w-text_w)*${t.px ?? 0.5}:y='${yExpr}':borderw=${Math.round(bw * Math.min(W, H) / 720)}:bordercolor=black${box}${alpha}:enable='between(t,${t.start},${t.start + t.duration})'[t${i}]`);
    last = `t${i}`;
  });
  args.push(...extraInputs);
  args.push('-filter_complex', f.join(';'), '-map', `[${last}]`, '-map', `[${aOut}]`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(CRF), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-y', outPath);
  return { args };
}

module.exports = { buildFfmpeg };
