# 🧠 Contexto — Projeto LeccorCut vs CapCut (Engenharia Reversa)

> Este documento serve como **memória de contexto** para sessões de IA.
> Resumo do que foi feito, o que está em andamento e o que falta.

---

## 🎯 Objetivo do Projeto

Desenvolver o **LeccorCut** — um editor de vídeo desktop moderno, independente e open-source —
tomando o **CapCut v9.6.0.4097** como referência de funcionalidades e arquitetura,
via engenharia reversa estática com as ferramentas **REA v6.4.0** + **Ghidra 12.1.4**.

---

## 🔬 Alvo da Engenharia Reversa

| Campo | Valor |
|---|---|
| Aplicativo | CapCut PC |
| Versão | **9.6.0.4097** |
| Path | `C:\Users\Johnathan Amorim\AppData\Local\CapCut\Apps\CapCut.exe` |
| Arquitetura | PE x86_64 (Windows) |
| SHA-256 | `db0a1848273f0137d58717f6b226b570d1867536ac54f88367496a7eab00a70a` |
| Ferramenta principal | REA MCP v6.4.0 (configurado globalmente) |
| Disassembler | Ghidra 12.1.4 @ `C:\tools\ghidra_12.1.4_PUBLIC` |
| Java | JDK 21 @ `C:\Program Files\Java\jdk-21` |

> ⚠️ **Limitação conhecida:** O addon nativo Windows do REA (`rea-windows-x64.node`)
> requer compilação cross em Linux/MinGW e não está disponível pré-compilado.
> O Ghidra headless está funcional — a análise por Ghidra direto pode ser usada como alternativa.

---

## ✅ O que já foi feito (Engenharia Reversa)

### Análise Estática — Concluído

- **Identificação completa do binário**: formato PE x86_64, versão, CID, SHA-256
- **Mapeamento de toda a estrutura de instalação**: todos os diretórios e arquivos
- **Inventário de executáveis**: 14 executáveis mapeados com tamanhos e funções
- **Inventário de DLLs**: 26+ DLLs críticas mapeadas com tamanhos e funções prováveis
- **Tecnologias identificadas**:
  - Qt 6.x (janela nativa)
  - CEF / Chromium Embedded (UI web)
  - Lynx framework ByteDance (UI mobile-style)
  - Bun runtime (JS embarcado, 107MB)
  - Python 3.11 (scripts)
  - FFmpeg (avcodec-61, avfilter-10)
  - Intel OpenVINO (inferência IA)
  - BoringSSL (criptografia)
  - Cronet/QUIC (rede)
  - C2PA SDK (proveniência de conteúdo)
  - SVT-AV1 (encoder AV1)
  - Lyra (codec áudio Google)
- **Extração de strings do launcher** (`CapCut.exe` 4.97MB): imports, DLLs, erros de crypto
- **Extração de 17.457 strings do `videoeditor.dll`** (72MB): formato de projeto interno mapeado
- **Extração de 150 strings do `cccreator.dll`** (158MB): feature flags do engine de efeitos
- **Extração de endpoints de API do bundle JS** (`App-DpNZSMvJ.js`, 3.2MB):
  - `/api/agent-runtime/v1`
  - `/commerce/v1/subscription/*`
  - `/commerce/v1/benefits/*`
  - `/lv/v1/commerce/get_entrances`
- **Extração de identificadores de modelos de IA cloud** (SeedDance 1.5/2.0/2.5, MiniMax H3, Gemini, GPT-Image2)
- **Mapeamento de 45+ modelos de IA locais empacotados** (matting, face, skeleton, audio, etc.)
- **Mapeamento da arquitetura de UI multi-framework** (Qt → CEF → React/Vite + Lynx)
- **Mapeamento do sistema de watermarks** (brand, AI, invisible, C2PA)
- **Identificação do formato interno de projeto** (campos JSON de segmento/clipe via strings do videoeditor.dll)
- **Identificação do sistema Lua de migração de versão** de projetos

### Arquivos Gerados
- [PASSOS.md](PASSOS.md) — Roteiro com checkboxes em 5 fases
- [DOCUMENTACAO.md](DOCUMENTACAO.md) — Documentação técnica completa
- [CONTEXTO.md](CONTEXTO.md) — Este arquivo (memória de contexto)

---

## ❌ O que ainda falta (Engenharia Reversa)

### Alta Prioridade
- [ ] Extrair imports/exports do `VECreator.dll` (271MB) via Ghidra headless
- [ ] Extrair imports/exports do `videoeditor.dll` (72MB) via Ghidra headless
- [ ] Identificar e documentar o formato completo do arquivo de draft (projeto salvo)
- [ ] Mapear a base URL da API principal (domínio de produção)
- [ ] Analisar o bridge JavaScript C++ → JS no CEF (`window.capcut.*`)
- [ ] Analisar `agent_runtime_addon.node` (521KB) — bridge Node.js/Nativo

### Média Prioridade
- [ ] Capturar tráfego de rede real via proxy MITM durante uso do CapCut
- [ ] Analisar `deepagents_capi.dll` (42MB) — API C de modelos de IA
- [ ] Analisar `smart_cut.ofx.bundle` — plugin de corte inteligente
- [ ] Mapear como modelos `.model` e `.bytenn` são carregados
- [ ] Instrumentação com Frida para análise dinâmica

### Baixa Prioridade
- [ ] Analisar sistema de crash reporting (Breakpad/Parfait)
- [ ] Investigar `tt_c2pa_sdk.dll` em detalhe (padrão C2PA)
- [ ] Documentar formato completo de animação de watermark (`.lua` + `ani_info.json`)

---

## ✅ O que já foi implementado no LeccorCut

O LeccorCut (`D:\0000000-PROJETOS\LeccorCut`) já implementa:

### Timeline e Edição
- ✅ Timeline multi-trilha: Vídeo Principal, Sobreposição (PiP), Áudio, Texto/Legendas
- ✅ Track headers com botões de visibilidade e mute
- ✅ Corte preciso (`S`), split na agulha
- ✅ Reorganização por drag-and-drop
- ✅ Redimensionamento/trim pelas alças laterais
- ✅ Congelar quadro (Freeze Frame, tecla `F`)
- ✅ Separar áudio do vídeo (unlink)
- ✅ Alinhamento magnético / Snap (tecla `N`)
- ✅ Marcadores na timeline (tecla `M`)
- ✅ Histórico completo: Undo/Redo até 100 estados (`Ctrl+Z`, `Ctrl+Y`)

### Sobreposição e PiP
- ✅ Múltiplos vídeos e imagens sobrepostos
- ✅ Escala (10%–100%), posicionamento, opacidade
- ✅ Rotação angular (-180° a +180°)
- ✅ Espelhamento horizontal (Flip)
- ✅ Animações de entrada e movimento (Fade In/Out, Slide, Zoom In, Float)
- ✅ Suavização Smoothstep
- ✅ Chroma Key (remoção por cor)

### Áudio
- ✅ Trilha de áudio independente com waveform
- ✅ Fade In / Fade Out
- ✅ Redução de ruído (Denoise / afftdn)
- ✅ Normalização EBU R128 (-14 LUFS)
- ✅ Controle de volume dedicado

### Texto e Legendas
- ✅ Trilha de texto/legendas arrastável no preview
- ✅ Animações (Fade, Slide Up, Pop/Zoom In)
- ✅ Estilos avançados

### IA e Transcrição
- ✅ Transcrição local com Whisper (OpenAI / Transformers.js) — 100% offline
- ✅ Legendas Karaokê (Word Highlight)
- ✅ Legendas Palavra por Palavra (Acumulativo)
- ✅ Estilo Viral / Hormozi (Single Word)
- ✅ Smart Cutout (remoção de fundo por IA — briaai/RMBG-1.4)
- ✅ Importação de `.srt`
- ✅ Estilização em massa de legendas

### Efeitos e Ajustes
- ✅ Speed Ramping com curvas (Heroico, Bala, Montagem, Flash In, Flash Out)
- ✅ Gráfico SVG de curva de velocidade em tempo real
- ✅ Transições: fade, dissolve, wipeleft, slideleft, circleopen, pixelize
- ✅ Filtros e presets de cor (sepia, vintage, warm, cool, cinematic, vivid)
- ✅ Vinheta cinematográfica
- ✅ Canvas Blur (enquadramento com desfoque de fundo para Reels/Shorts)
- ✅ Brilho, contraste, saturação, desfoque, P&B, velocidade linear
- ✅ Espelhamento H/V, rotações 90°/180°/270°, zoom digital

### Exportação e Formatos
- ✅ Quick Presets: TikTok/Reels/Shorts (9:16), YouTube (16:9), Feed (1:1), Retrato (4:5)
- ✅ Resoluções: 720p, 1080p, 1440p (2K), 2160p (4K)
- ✅ FPS: 24, 30, 60
- ✅ Renderização via FFmpeg nativo (H.264/AAC)
- ✅ Pipeline filter_complex modular (ffmpegBuilder.js)
- ✅ Projetos salváveis em `.lccut`
- ✅ Atalhos de teclado completos

---

## ❌ O que falta implementar no LeccorCut

### Funcionalidades de Edição
- [ ] Speed ramping com keyframes individuais (curvas customizadas, não apenas presets)
- [ ] Rastreamento de objetos (Object Tracking) na timeline
- [ ] Detecção automática de cenas (Shot Detection)
- [ ] Interpolação de frames (Frame Interpolation / VFI)
- [ ] Matting de vídeo em tempo real (Background Removal em vídeo)
- [ ] Efeitos de face em tempo real (beautify, stickers faciais)
- [ ] Estabilização de vídeo (Video Stabilization)
- [ ] Redimensionamento inteligente (Smart Crop / Auto Reframe)

### IA Avançada (Local)
- [ ] Separação de stems de áudio (voz + fundo musical)
- [ ] Dubbing / Clonagem de voz por IA
- [ ] Tradução automática de legendas
- [ ] Geração de música por IA (Music2Vibes / AI beats)
- [ ] Super-resolução / Upscale de vídeo

### Recursos de Mídia
- [ ] Biblioteca de templates de efeitos
- [ ] Biblioteca de stickers e assets
- [ ] Importação de projetos CapCut (`.capcut` / draft)
- [ ] Exportação para formatos adicionais (WebM, ProRes, etc.)
- [ ] Suporte a múltiplas câmeras / multicam

### UX e Interface
- [ ] Preview de alta qualidade em tempo real (GPU-accelerated)
- [ ] Painel de propriedades contextual completo
- [ ] Histórico visual de versões do projeto
- [ ] Integração com cloud storage
- [ ] Interface em tela cheia / modo cinema

---

## 🗺️ Arquitetura Atual do LeccorCut

```
LeccorCut/
├── src/
│   ├── main.js          # Processo Electron principal + IPC + IA (Whisper, RMBG)
│   ├── preload.js       # Context bridge Node ↔ Renderer
│   ├── index.html       # UI (layout dark mode)
│   ├── styles.css       # Design system HSL
│   ├── renderer.js      # Timeline, preview, estado reativo, interações
│   └── ffmpegBuilder.js # Montador modular do filter_complex FFmpeg
├── tests/
│   ├── export-smoke.js  # Teste de renderização FFmpeg
│   └── cutout-smoke.js  # Teste do pipeline Smart Cutout
└── scripts/
    └── generate-icons.js
```

### Stack Tecnológica do LeccorCut
| Camada | Tecnologia |
|---|---|
| Shell | Electron |
| UI | HTML/CSS/JS vanilla |
| Vídeo nativo | FFmpeg (CLI) |
| IA local | Transformers.js (Whisper + RMBG-1.4) |
| Empacotamento | electron-builder + NSIS |

---

## 🔑 Diferenças de Arquitetura: LeccorCut vs CapCut

| Aspecto | LeccorCut | CapCut |
|---|---|---|
| Shell | Electron (Node.js) | Qt6 + CEF + Lynx |
| UI | HTML/CSS/JS vanilla | React/Vite (web) + Qt (nativo) |
| Render engine | FFmpeg CLI | VECreator.dll (C++ nativo) |
| Efeitos tempo real | ❌ Não implementado | lens.dll (GPU AGFX) |
| IA local | Transformers.js | deepagents_capi.dll + OpenVINO |
| Modelos locais | 2 (Whisper + RMBG) | 45+ modelos |
| Cloud AI | ❌ Não | SeedDance, MiniMax, Gemini, etc. |
| Rede | ❌ Offline | Cronet (HTTP3/QUIC) |
| Watermark | Opcional/sem | 4 tipos (brand, AI, invisible, C2PA) |
| Tamanho aprox. | ~50 MB | ~1.2 GB |

---

## 📋 Próximos Passos Recomendados

1. **Imediato**: Usar Ghidra headless para extrair exports do `videoeditor.dll` e mapear o formato de draft completo
2. **Curto prazo**: Capturar tráfego de rede do CapCut com proxy MITM para documentar APIs completas
3. **Médio prazo**: Implementar detecção de cenas e object tracking no LeccorCut
4. **Longo prazo**: Migrar engine de renderização de FFmpeg CLI para pipeline nativo C++/WebGPU

---

*Atualizado em: 2026-10-15 | Versão da análise: REA v6.4.0 + Ghidra 12.1.4*