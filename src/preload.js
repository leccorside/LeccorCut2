const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  importMedia: () => ipcRenderer.invoke('import-media'),
  importSrt: () => ipcRenderer.invoke('import-srt'),
  freezeFrame: (p, t) => ipcRenderer.invoke('freeze-frame', p, t),
  exportVideo: (proj) => ipcRenderer.invoke('export', proj),
  transcribe: (c, lang) => ipcRenderer.invoke('transcribe', c, lang),
  saveProject: (d) => ipcRenderer.invoke('save-project', d),
  openProject: () => ipcRenderer.invoke('open-project'),
  importLut: () => ipcRenderer.invoke('import-lut'),
  rmbgStart: (job) => ipcRenderer.invoke('rmbg-start', job),
  rmbgCancel: (jobId) => ipcRenderer.invoke('rmbg-cancel', jobId),
  rmbgSave: (p) => ipcRenderer.invoke('rmbg-save', p),
  pickImage: () => ipcRenderer.invoke('pick-image'),
  onRmbg: (fn) => ipcRenderer.on('rmbg-progress', (_e, m) => fn(m)),
  onProgress: (fn) => ipcRenderer.on('export-progress', (_e, v) => fn(v)),
  onWhisper: (fn) => ipcRenderer.on('whisper-progress', (_e, m) => fn(m)),
});
