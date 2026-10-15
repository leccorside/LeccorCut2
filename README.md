# LeccorCut02

Editor de vídeo desktop (Electron) com IA 100% local, construído tomando o **CapCut PC v9.6.0.4097** como referência de funcionalidades e arquitetura, mapeada por engenharia reversa estática.

O repositório tem duas frentes:

1. **App** (`src/`): o editor em si, com timeline multi-trilha, efeitos, legendas automáticas com Whisper, remoção de fundo por IA e exportação via FFmpeg.
2. **Análise** (`analise/` + `PASSOS.md` + `DOCUMENTACAO.md`): o estudo do CapCut que orienta o que implementar a seguir.

---

## Funcionalidades

### Timeline e edição

- Trilhas de vídeo principal, sobreposição (PiP), áudio e texto/legendas
- Corte na agulha, trim pelas alças, reordenação por drag-and-drop
- Congelar quadro, separar áudio do vídeo, snap magnético, marcadores
- Undo/Redo com até 100 estados

### Imagem e efeitos

- Escala, posição, opacidade, rotação, espelhamento e animações de entrada/movimento
- Correção de cor: curvas (luma/R/G/B), lift/gamma/gain, HSL e LUT 3D (`.cube`)
- Vinheta, brilho, contraste, saturação, desfoque
- Enquadramento em outro formato: ajustar, cortar ou fundo desfocado (Canvas Blur)
- Speed ramping com curva editável por pontos, visualizada em gráfico
- Transições entre clipes: fade, dissolve, wipeleft, slideleft, circleopen, pixelize

### Áudio

- Waveform na trilha, volume por clipe
- Redução de ruído (`afftdn`) e normalização EBU R128 (-14 LUFS)

### IA local (offline, via Transformers.js)

- **Legendas automáticas**: Whisper (`Xenova/whisper-base`) transcreve o áudio (português, inglês ou espanhol) e cria os clipes na trilha de texto
- **Remoção de fundo** em imagem e vídeo com dois modelos:
  - `fast`: `Xenova/modnet`
  - `quality`: `briaai/RMBG-1.4`
  - Gera PNG/WebM com transparência, roda num worker e fica em cache
- Importação de legendas `.srt`

### Exportação

- MP4 (H.264/AAC) via `filter_complex` montado em [src/ffmpegBuilder.js](src/ffmpegBuilder.js)
- Presets 9:16, 16:9, 1:1 e 4:5; resoluções de 720p a 4K; 24, 30 ou 60 fps
- Projetos salvos em `.lccut` (JSON)

---

## Requisitos

- Windows 10/11 x64
- Node.js 18+ e npm
- Internet só na **primeira** vez que cada modelo de IA é usado (download do Hugging Face). Depois disso, tudo roda offline.
- Opcional, só para a parte de análise: Python 3 com `pefile`

O FFmpeg e o FFprobe vêm pelos pacotes `ffmpeg-static` e `ffprobe-static`; não precisa instalar nada à parte.

## Como rodar

```bash
npm install
npm start
```

## Gerar o instalador

```bash
npm run dist
```

O `electron-builder` gera um instalador NSIS em `dist/`. Os binários do FFmpeg/FFprobe ficam fora do `app.asar` (`asarUnpack`), para poderem ser executados.

> ⚠️ O `package.json` aponta o ícone para `src/icon.ico`, que ainda não existe no repositório. Adicione o arquivo antes de rodar `npm run dist`.

---

## Estrutura

```text
leccorCut02/
├── src/
│   ├── main.js           # Processo principal: janela, IPC, FFmpeg/FFprobe, Whisper, orquestra a remoção de fundo
│   ├── preload.js        # contextBridge: expõe a API do main ao renderer
│   ├── renderer.js       # UI: timeline, preview, painel de propriedades, estado e histórico
│   ├── ffmpegBuilder.js  # Converte o projeto em argumentos do FFmpeg (filter_complex)
│   ├── rmbgWorker.js     # Worker thread da remoção de fundo, quadro a quadro
│   ├── index.html
│   └── styles.css
├── analise/
│   ├── scripts/pe_dump.py  # Extrai imports/exports de binários PE
│   └── fase1/              # Saída do pe_dump.py para CapCut.exe, VECreator, cccreator, videoeditor e lens
├── PASSOS.md         # Roteiro da engenharia reversa (5 fases, com checkboxes)
├── DOCUMENTACAO.md   # O que foi descoberto sobre o CapCut
└── CONTEXTO.md       # Estado atual, histórico, pendências (memória do projeto)
```

### Onde o app grava dados

Tudo fica em `userData` do Electron (`%APPDATA%\leccorcut02`):

| Pasta | Conteúdo |
| --- | --- |
| `models/` | Modelos de IA baixados (Whisper, MODNet, RMBG) |
| `thumbstrips/` | Miniaturas da timeline, em cache por arquivo |
| `rmbg/` | Resultados da remoção de fundo, em cache |
| `freeze/` | Quadros congelados |

---

## Análise do CapCut

O script [analise/scripts/pe_dump.py](analise/scripts/pe_dump.py) lê as tabelas de imports (normais e delay-load) e exports de executáveis/DLLs PE:

```bash
pip install pefile
python analise/scripts/pe_dump.py analise/fase1 "<caminho>\CapCut.exe" "<caminho>\VECreator.dll"
```

Para cada binário, ele gera `raw/<nome>.imports.json` e `raw/<nome>.exports.txt`, além de um resumo consolidado em `pe_resumo.json`. Os nomes C++ decorados (MSVC) são agrupados por namespace/classe.

O roteiro completo está em [PASSOS.md](PASSOS.md), e os achados em [DOCUMENTACAO.md](DOCUMENTACAO.md).

> A análise é estática e serve só para estudo de interoperabilidade e referência de arquitetura. O LeccorCut02 não inclui código, assets nem modelos do CapCut.

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Shell | Electron 33 |
| UI | HTML/CSS/JS vanilla |
| Vídeo | FFmpeg / FFprobe (CLI, via `ffmpeg-static`) |
| IA | `@huggingface/transformers` (ONNX Runtime) |
| Empacotamento | electron-builder + NSIS |

## Limitações conhecidas

- O preview é feito pelo `<video>` do navegador. Efeitos pesados só aparecem fielmente na exportação.
- A exportação é só MP4 (H.264/AAC).
- O script `npm test` aponta para `tests/export-smoke.js`, que ainda não existe neste repositório.
- O Whisper usa o modelo `base`: é rápido, mas menos preciso em áudio ruidoso.
