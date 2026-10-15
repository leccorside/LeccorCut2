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

### Fase 1 — Itens restantes concluídos (2026-10-15)

- **Imports/exports** de `CapCut.exe`, `VECreator.dll`, `cccreator.dll`, `videoeditor.dll`, `lens.dll` (+ `deepagents_capi.dll`, `audioeffect.dll`, `smart_cut.ofx`) via `pefile` — o Ghidra headless foi deixado para a Fase 2 porque só importar o VECreator (271 MB) levaria horas, e as tabelas PE são idênticas.
- **Strings categorizadas** de VECreator, videoeditor, audioeffect e deepagents_capi (~570 mil strings).
- **Watermarks**: `infoSticker.lua` e `ani_info.json` (atlas TexturePacker) documentados.
- **web-manifest.json** (140 SHA-256 conferidos), bundle `renderApp-CIJPeLBB.js` (ponte `cefQuery`), `server.json` do rea e `smart_cut.ofx`.
- Relatório: `analise/fase1/RELATORIO.md`; resumo na seção 12 da `DOCUMENTACAO.md`; scripts em `analise/scripts/` (`pe_dump.py`, `strings_dump.py`).

**Descobertas que corrigem hipóteses anteriores:**
- `VECreator.dll` é o **app Qt principal** (não só o renderer); protegido com **VMProtect** (seções `.vmp0-2`) e usa Detours.
- `lyra_cli_client.dll` **não** é o codec Lyra do Google — `lyra` é um framework interno de edição/IA da ByteDance.
- `smart_cut.ofx` é **smart crop / auto-reframe** (OpenFX), não corte por silêncio/cena.
- `deepagents_capi.dll` é **Go** (CloudWeGo Eino), com API C `da_*` e provedores OpenAI/Anthropic/Gemini/Ark/Coze/OpenRouter.
- O roteiro citava `commonagent/assets/App-*.js`, que não existe; a lógica do commonagent está em `renderApp-*.js`.

### Fase 2 — Arquitetura e componentes (2026-10-15)

- Relatórios: `analise/fase2/2.1-2.2-bootstrap-ui.md`, `2.3-motor-edicao.md`, `2.4-2.5-ia-audio.md`; resumo na seção 13 da `DOCUMENTACAO.md`.
- Método: 2.1/2.2 e 2.4/2.5 feitas por dois agentes em paralelo (estático, sem executar o CapCut); 2.3 feita a partir do **esquema** dos drafts locais do usuário (`analise/scripts/draft_schema.py` — não grava caminhos/nomes/textos) + strings do cccreator/lens + Ghidra headless no `videoeditor.dll` (`analise/scripts/ghidra/DraftRefs.java`).
- Principais conclusões: launcher = JianyingLauncher renomeado, que despacha para `VECreator.dll!entryPoint`/`CefCreator.dll`/serviços; Bun em 127.0.0.1:5174/5175; UI Qt 6.2.2 + CEF 121 (`PlatinumWebView`) + Lynx 3.9; draft em JSON com tempos em µs (cifra opcional KV2 não usada localmente); motor em grafo `TE*` Bins/Units; FFmpeg 7 modificado + `ffmpeg_main` como biblioteca; modelos via ByteNN; stems/TTS/ASR na nuvem.
- Correções a hipóteses anteriores: `metasecml.dll` é SDK de segurança (não ML); `SegmentJS` é runtime de texto animado (não segmentação); `nn_denoise.bytenn` é denoise de vídeo; imports do VECreator lidos pelo pefile estavam incompletos (VMProtect).
- Pendente: confirmar em qual processo roda cada serviço Mojo (só com análise dinâmica — Fase 4).

### Arquivos Gerados
- [README.md](README.md) — Visão geral do repositório (app + análise), como rodar/empacotar, estrutura, limitações. Escrito a partir do código real de `src/` em 2026-10-15
- [PASSOS.md](PASSOS.md) — Roteiro com checkboxes em 5 fases
- [DOCUMENTACAO.md](DOCUMENTACAO.md) — Documentação técnica completa
- [CONTEXTO.md](CONTEXTO.md) — Este arquivo (memória de contexto)

---

## ❌ O que ainda falta (Engenharia Reversa)

### Alta Prioridade
- [x] Extrair imports/exports do `VECreator.dll` e `videoeditor.dll` (Fase 1, via pefile)
- [x] Análise de funções no Ghidra (Fase 2) — `videoeditor.dll` (VECreator.dll tem VMProtect)
- [x] Identificar e documentar o formato completo do arquivo de draft — JSON, ver `analise/fase2/2.3-motor-edicao.md`
- [ ] Fase 3 — rede/APIs (hosts já levantados na Fase 1) e Fase 4 — análise dinâmica (IPC por processo)
- [x] Mapear a base URL da API principal — concluído no estático: multi-host por família/região (`capcutapi.com`/`byteoversea.com`, espelhos `-sg`/`-va`/`-us-ttp`, gateways `-v2-boot`); ver `analise/fase3/RELATORIO.md` §1. Host ativo por região exige MITM (Fase 4)
- [ ] Analisar o bridge JavaScript C++ → JS no CEF (`window.capcut.*`)
- [ ] Analisar `agent_runtime_addon.node` (521KB) — bridge Node.js/Nativo

### Média Prioridade
- [x] Capturar tráfego de rede real via proxy MITM — runbook pronto (mitmproxy 12.2.3 instalado; bloqueio QUIC temporário p/ forçar fallback TCP; roteiro de 9 fluxos por família de host; addon `mitm_capcut.py` gera `endpoints_mitm_por_host.json`). Execução da captura fica com o usuário
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

## ⚠️ Divergências encontradas ao escrever o README (2026-10-15)

A lista "O que já foi implementado" acima descreve o projeto antigo (`D:\0000000-PROJETOS\LeccorCut`). Comparando com o código deste repositório (`leccorCut02/src`):

- **Não existem aqui**: estilos de legenda karaokê/palavra a palavra/viral, presets de speed ramp (Heroico, Bala...), chroma key na UI (só há `colorkey` no `ffmpegBuilder.js`) e fade de áudio.
- **Existem aqui e não estão na lista**: correção de cor com curvas, lift/gamma/gain, HSL e LUT `.cube`; curva de velocidade editável por pontos; dois modelos de remoção de fundo (`Xenova/modnet` e `briaai/RMBG-1.4`).
- `package.json` referencia `tests/export-smoke.js` (`npm test`) e `src/icon.ico` (`npm run dist`), mas nenhum dos dois existe neste repositório.
- A pasta `analise/fase1/` já tem os imports/exports de `CapCut.exe`, `VECreator.dll`, `cccreator.dll`, `videoeditor.dll` e `lens.dll` (gerados por `analise/scripts/pe_dump.py`), mas os checkboxes correspondentes do item 1.1 do `PASSOS.md` continuam desmarcados.
- No histórico do git, `node_modules/` tinha entrado no stage antes do `.gitignore`. Foi removido do índice com `git rm -r --cached node_modules`.

---

## 📋 Próximos Passos Recomendados

1. **Imediato**: Fase 5.3 — importador de projetos CapCut (`draft_content.json`) para `.lccut`, usando o esquema documentado na Fase 2; ou Fase 3 (rede/APIs)
2. **Curto prazo**: Capturar tráfego de rede do CapCut com proxy MITM para documentar APIs completas
3. **Médio prazo**: Implementar detecção de cenas e object tracking no LeccorCut
4. **Longo prazo**: Migrar engine de renderização de FFmpeg CLI para pipeline nativo C++/WebGPU

---

*Atualizado em: 2026-10-15 | Versão da análise: REA v6.4.0 + Ghidra 12.1.4*