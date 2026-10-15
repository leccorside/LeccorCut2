// Passo 6: remoção de fundo por IA — roda fora da thread principal do Electron.
// Decodifica o trecho via FFmpeg (rgb24), aplica o modelo de segmentação frame a frame
// e reencoda com canal alpha (WebM VP9 yuva420p para vídeo, PNG para imagem).
const { parentPort, workerData } = require('worker_threads');
const { spawn } = require('child_process');

const { ffmpegPath, input, ssIn, dur, isImage, w, h, fps, outPath, modelId, cacheDir, hasAudio } = workerData;
let cancelled = false;
const procs = [];
parentPort.on('message', (m) => { if (m === 'cancel') { cancelled = true; procs.forEach(p => { try { p.kill('SIGKILL'); } catch {} }); } });

function run(args, opts) { const p = spawn(ffmpegPath, args, opts); procs.push(p); return p; }
function waitClose(p) { return new Promise((resolve) => { let err = ''; p.stderr?.on('data', d => err += d); p.on('close', code => resolve({ code, err })); p.on('error', e => resolve({ code: -1, err: String(e) })); }); }
const writeAsync = (stream, buf) => new Promise((resolve, reject) => { stream.write(buf, (e) => e ? reject(e) : resolve()); });

(async () => {
  const { pipeline, env, RawImage } = await import('@huggingface/transformers');
  env.cacheDir = cacheDir;
  const seg = await pipeline('background-removal', modelId, {
    dtype: 'fp32',
    progress_callback: (p) => { if (p.status === 'progress') parentPort.postMessage({ type: 'download', pct: Math.round(p.progress || 0) }); }
  });
  if (cancelled) throw new Error('cancelado');

  const frameSize = w * h * 3;
  const total = isImage ? 1 : Math.max(1, Math.round(dur * fps));
  const decArgs = ['-v', 'error'];
  if (!isImage) decArgs.push('-ss', String(ssIn), '-t', String(dur));
  decArgs.push('-i', input, '-vf', `${isImage ? '' : `fps=${fps},`}scale=${w}:${h}:flags=bicubic`, '-an', '-pix_fmt', 'rgb24', '-f', 'rawvideo');
  if (isImage) decArgs.push('-frames:v', '1');
  decArgs.push('pipe:1');

  const encArgs = ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-framerate', String(fps), '-i', 'pipe:0'];
  if (isImage) encArgs.push('-frames:v', '1', '-y', outPath);
  else {
    if (hasAudio) encArgs.push('-ss', String(ssIn), '-t', String(dur), '-i', input, '-map', '0:v', '-map', '1:a?', '-c:a', 'libopus', '-b:a', '128k');
    encArgs.push('-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '0', '-crf', '28',
      '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-y', outPath);
  }

  const dec = run(decArgs);
  const enc = run(encArgs);
  const decDone = waitClose(dec), encDone = waitClose(enc);
  enc.stdin.on('error', () => {});

  let acc = Buffer.alloc(0), done = 0, t0 = Date.now();
  for await (const chunk of dec.stdout) {
    if (cancelled) break;
    acc = acc.length ? Buffer.concat([acc, chunk]) : chunk;
    while (acc.length >= frameSize && !cancelled) {
      const frame = new Uint8ClampedArray(acc.subarray(0, frameSize));
      acc = acc.subarray(frameSize);
      const [out] = await seg(new RawImage(frame, w, h, 3));
      await writeAsync(enc.stdin, Buffer.from(out.data.buffer, out.data.byteOffset, out.data.byteLength));
      done++;
      const el = (Date.now() - t0) / 1000;
      parentPort.postMessage({ type: 'frame', done, total: Math.max(total, done), eta: done ? el / done * Math.max(0, total - done) : 0 });
    }
  }
  enc.stdin.end();
  const [d, e] = await Promise.all([decDone, encDone]);
  if (cancelled) throw new Error('cancelado');
  if (!done) throw new Error('Nenhum frame decodificado. ' + d.err.slice(-300));
  if (e.code !== 0) throw new Error('Falha ao codificar com alpha: ' + e.err.slice(-300));
  parentPort.postMessage({ type: 'done', frames: done });
})().catch((err) => parentPort.postMessage({ type: 'error', error: String(err.message || err) }));
