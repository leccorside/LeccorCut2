const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const { Worker } = require('worker_threads');

const unpacked = (p) => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const ffmpegPath = unpacked(require('ffmpeg-static'));
const ffprobePath = unpacked(require('ffprobe-static').path);
const { buildFfmpeg } = require('./ffmpegBuilder');

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, backgroundColor: '#0e0f14',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, webSecurity: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

function ffBuf(args) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, args); const b = [];
    p.stdout.on('data', d => b.push(d)); p.on('error', () => resolve(Buffer.alloc(0))); p.on('close', () => resolve(Buffer.concat(b)));
  });
}

async function generateThumbStrip(filePath, duration) {
  if (duration <= 0) return [];
  const count = Math.min(60, Math.max(3, Math.ceil(duration / 2)));
  const fpsVal = (count / duration).toFixed(5);
  const hash = crypto.createHash('md5').update(filePath).digest('hex').slice(0, 12);
  const stripDir = path.join(app.getPath('userData'), 'thumbstrips', hash);
  if (!fs.existsSync(stripDir)) fs.mkdirSync(stripDir, { recursive: true });
  const existing = fs.readdirSync(stripDir).filter(f => f.endsWith('.jpg'));
  if (existing.length >= Math.max(1, count - 2)) {
    return existing.sort().map(f => path.join(stripDir, f));
  }
  await new Promise((resolve) => {
    execFile(ffmpegPath, [
      '-v', 'error', '-i', filePath,
      '-vf', `fps=${fpsVal},scale=160:-2:flags=fast_bilinear`,
      '-q:v', '8', '-y', path.join(stripDir, 'f%04d.jpg')
    ], () => resolve());
  });
  return fs.readdirSync(stripDir).filter(f => f.endsWith('.jpg')).sort().map(f => path.join(stripDir, f));
}

async function generateWaveData(filePath, duration) {
  if (duration <= 0) return [];
  const sampleRate = Math.max(2, Math.min(200, Math.round(2000 / duration)));
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, ['-v', 'error', '-i', filePath, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1']);
    const bufs = [];
    p.stdout.on('data', d => bufs.push(d));
    p.on('error', () => resolve([]));
    p.on('close', () => {
      try {
        const b = Buffer.concat(bufs);
        if (!b.length) return resolve([]);
        const floats = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
        const data = Array.from(floats).map(Math.abs);
        const max = Math.max(...data, 0.001);
        resolve(data.map(v => v / max));
      } catch { resolve([]); }
    });
  });
}

async function decorateMedia(info) {
  if (info.hasVideo) {
    const ss = info.isImage ? 0 : Math.min(1, info.duration / 2);
    const b = await ffBuf(['-v', 'error', '-ss', String(ss), '-i', info.path, '-frames:v', '1', '-vf', 'scale=160:-2', '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '5', '-']);
    if (b.length) info.thumb = 'data:image/jpeg;base64,' + b.toString('base64');

    if (!info.isImage && info.duration > 0) {
      info.thumbs = await generateThumbStrip(info.path, info.duration);
      info.srcDur = info.duration;
    }
  }
  if (info.hasAudio) {
    const b = await ffBuf(['-v', 'error', '-i', info.path, '-filter_complex', 'aformat=channel_layouts=mono,showwavespic=s=1200x48:colors=0x06121a', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-']);
    if (b.length) info.wave = 'data:image/png;base64,' + b.toString('base64');
    info.waveData = await generateWaveData(info.path, info.duration);
  }
  return info;
}

ipcMain.handle('freeze-frame', async (_e, videoPath, timeSec) => {
  const freezeDir = path.join(app.getPath('userData'), 'freeze');
  if (!fs.existsSync(freezeDir)) fs.mkdirSync(freezeDir, { recursive: true });
  const outPath = path.join(freezeDir, `freeze_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.png`);
  await new Promise((resolve, reject) => {
    execFile(ffmpegPath, ['-v', 'error', '-ss', String(timeSec), '-i', videoPath, '-frames:v', '1', '-y', outPath], (err) => {
      if (err) reject(err); else resolve();
    });
  });
  return outPath;
});

ipcMain.handle('import-media', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Mídia', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'mp3', 'wav', 'm4a', 'png', 'jpg', 'jpeg'] }]
  });
  if (r.canceled) return [];
  const out = [];
  for (const p of r.filePaths) out.push(await decorateMedia(await probe(p)));
  return out;
});

function probe(p) {
  return new Promise((resolve) => {
    execFile(ffprobePath, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', p], (err, stdout) => {
      let info = { path: p, name: path.basename(p), duration: 5, hasVideo: false, hasAudio: false, isImage: false };
      try {
        const j = JSON.parse(stdout);
        info.hasVideo = j.streams.some(s => s.codec_type === 'video');
        info.hasAudio = j.streams.some(s => s.codec_type === 'audio');
        info.isImage = /\.(png|jpe?g)$/i.test(p);
        if (!info.isImage) info.duration = parseFloat(j.format.duration) || 5;
      } catch (e) {}
      resolve(info);
    });
  });
}

ipcMain.handle('export', async (_e, project) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: 'leccorcut.mp4', filters: [{ name: 'MP4', extensions: ['mp4'] }] });
  if (r.canceled) return { ok: false };
  const { args } = buildFfmpeg(project, r.filePath);
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, args);
    let log = '';
    p.stderr.on('data', d => {
      log += d; const m = /time=(\d+):(\d+):([\d.]+)/.exec(d.toString());
      if (m) win.webContents.send('export-progress', (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]));
    });
    p.on('close', code => resolve({ ok: code === 0, path: r.filePath, log: code === 0 ? '' : log.slice(-1500) }));
  });
});

let asrPromise = null;
async function getAsr() {
  if (!asrPromise) {
    asrPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = path.join(app.getPath('userData'), 'models');
      return pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
        progress_callback: (p) => { if (p.status === 'progress') win.webContents.send('whisper-progress', `Baixando modelo... ${Math.round(p.progress)}%`); }
      });
    })().catch((e) => { asrPromise = null; throw e; });
  }
  return asrPromise;
}

function extractPcm(clip) {
  return new Promise((resolve, reject) => {
    const sp = clip.speed || 1;
    const p = spawn(ffmpegPath, ['-v', 'error', '-ss', String(clip.in), '-t', String(clip.duration * sp), '-i', clip.path, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-']);
    const bufs = []; let err = '';
    p.stdout.on('data', d => bufs.push(d)); p.stderr.on('data', d => err += d);
    p.on('close', code => {
      if (code !== 0) return reject(new Error(err.slice(-300)));
      const b = Buffer.concat(bufs);
      resolve(new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)));
    });
  });
}

ipcMain.handle('transcribe', async (_e, clip, language) => {
  try {
    const asr = await getAsr();
    win.webContents.send('whisper-progress', 'Transcrevendo...');
    const audio = await extractPcm(clip);
    const out = await asr(audio, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, language: language || 'portuguese', task: 'transcribe' });
    const chunks = (out.chunks || []).map(c => ({ text: c.text.trim(), start: c.timestamp[0] || 0, end: c.timestamp[1] ?? (c.timestamp[0] + 2) })).filter(c => c.text);
    return { ok: true, chunks };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

ipcMain.handle('import-srt', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Legendas SRT', extensions: ['srt'] }], properties: ['openFile'] });
  if (r.canceled) return null;
  return fs.readFileSync(r.filePaths[0], 'utf8');
});

ipcMain.handle('save-project', async (_e, data) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: 'projeto.lccut', filters: [{ name: 'LeccorCut', extensions: ['lccut'] }] });
  if (r.canceled) return false;
  fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2)); return true;
});

ipcMain.handle('open-project', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'LeccorCut', extensions: ['lccut'] }], properties: ['openFile'] });
  if (r.canceled) return null;
  return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
});

ipcMain.handle('import-lut', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'LUT 3D', extensions: ['cube'] }], properties: ['openFile'] });
  if (r.canceled) return null;
  return r.filePaths[0];
});

// --- Passo 6: remoção de fundo por IA ---
const RMBG_MODELS = { fast: 'Xenova/modnet', quality: 'briaai/RMBG-1.4' };
const RMBG_MAX_SIDE = 1280;
const rmbgJobs = new Map();

function probeVideoStream(p) {
  return new Promise((resolve) => {
    // ffprobe-static é 4.0.2: -show_entries não conhece stream_side_data, então lê o stream inteiro
    execFile(ffprobePath, ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-of', 'json', p], (err, stdout) => {
      try {
        const s = JSON.parse(stdout).streams[0];
        const rot = Math.abs(parseFloat(s.side_data_list?.find(d => d.rotation != null)?.rotation ?? s.tags?.rotate ?? 0)) % 180;
        const [n, d] = String(s.r_frame_rate || '30/1').split('/').map(Number);
        const fps = n && d ? n / d : 30;
        resolve({ w: rot === 90 ? s.height : s.width, h: rot === 90 ? s.width : s.height, fps: fps > 0 && fps <= 120 ? fps : 30 });
      } catch { resolve(null); }
    });
  });
}

ipcMain.handle('rmbg-start', async (_e, job) => {
  const info = await probeVideoStream(job.path);
  if (!info) return { ok: false, error: 'Não foi possível ler o vídeo de origem.' };
  const k = Math.min(1, RMBG_MAX_SIDE / Math.max(info.w, info.h));
  const w = Math.max(2, Math.round(info.w * k / 2) * 2), h = Math.max(2, Math.round(info.h * k / 2) * 2);
  const modelId = RMBG_MODELS[job.model] || RMBG_MODELS.fast;
  const ssIn = job.isImage ? 0 : Math.max(0, job.in || 0), dur = job.isImage ? 0 : job.dur;
  const st = fs.statSync(job.path);
  const hash = crypto.createHash('md5').update([job.path, st.size, st.mtimeMs, ssIn.toFixed(3), (dur || 0).toFixed(3), modelId, w, h].join('|')).digest('hex').slice(0, 16);
  const dir = path.join(app.getPath('userData'), 'rmbg');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `${hash}.${job.isImage ? 'png' : 'webm'}`);
  const result = { ok: true, path: outPath, srcIn: ssIn, srcDur: dur, model: job.model, w, h };
  if (fs.existsSync(outPath)) return { ...result, cached: true };

  const tmpPath = outPath.replace(/\.(\w+)$/, '.tmp.$1');
  const worker = new Worker(path.join(__dirname, 'rmbgWorker.js'), { workerData: {
    ffmpegPath, input: job.path, ssIn, dur, isImage: !!job.isImage, w, h, fps: info.fps, outPath: tmpPath,
    modelId, cacheDir: path.join(app.getPath('userData'), 'models'), hasAudio: !!job.hasAudio
  } });
  rmbgJobs.set(job.jobId, worker);
  return new Promise((resolve) => {
    const finish = (r) => { rmbgJobs.delete(job.jobId); worker.terminate(); if (!r.ok) fs.rmSync(tmpPath, { force: true }); resolve(r); };
    worker.on('message', (m) => {
      if (m.type === 'download') win.webContents.send('rmbg-progress', { jobId: job.jobId, phase: 'download', pct: m.pct });
      else if (m.type === 'frame') win.webContents.send('rmbg-progress', { jobId: job.jobId, phase: 'frames', done: m.done, total: m.total, eta: m.eta });
      else if (m.type === 'done') { fs.renameSync(tmpPath, outPath); finish(result); }
      else if (m.type === 'error') finish({ ok: false, error: m.error });
    });
    worker.on('error', (err) => finish({ ok: false, error: String(err.message || err) }));
  });
});

ipcMain.handle('rmbg-cancel', (_e, jobId) => { rmbgJobs.get(jobId)?.postMessage('cancel'); });

ipcMain.handle('rmbg-save', async (_e, srcPath) => {
  const ext = path.extname(srcPath).slice(1);
  const r = await dialog.showSaveDialog(win, { defaultPath: `recorte.${ext}`, filters: [{ name: ext === 'png' ? 'PNG com transparência' : 'WebM com transparência', extensions: [ext] }] });
  if (r.canceled) return null;
  fs.copyFileSync(srcPath, r.filePath); return r.filePath;
});

ipcMain.handle('pick-image', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Imagem', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], properties: ['openFile'] });
  return r.canceled ? null : r.filePaths[0];
});
