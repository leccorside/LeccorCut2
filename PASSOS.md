# 🔍 Roteiro de Engenharia Reversa — CapCut v9.6.0.4097

> **Alvo:** `C:\Users\Johnathan Amorim\AppData\Local\CapCut\Apps\CapCut.exe`
> **Versão:** 9.6.0.4097 (release)
> **Arquitetura:** PE x86_64 (Windows)
> **SHA-256 launcher:** `db0a1848273f0137d58717f6b226b570d1867536ac54f88367496a7eab00a70a`

---

## 🗂️ Fase 1 — Reconhecimento Estático (Análise Sem Execução)

### 1.1 Estrutura e Identificação do Binário
- [x] Identificar formato PE (x86_64) e versão (`9.6.0.4097`)
- [x] Listar todos os executáveis da instalação (launcher, helpers, services)
- [x] Listar DLLs principais e tamanhos (VECreator.dll 271MB, libcef.dll 217MB, etc.)
- [x] Mapear estrutura de diretórios completa
- [x] Identificar tecnologias: Qt6, CEF (Chromium), FFmpeg, Python 3.11, Bun, Lynx UI
- [x] Ler `ProductInfo.xml` (CID: `capcutpc_0`, versão, release type)
- [x] Identificar modelos de IA empacotados (pasta `Resources/models/`)
- [x] Extrair tabela completa de imports/exports do `CapCut.exe` launcher (via `pefile` — ver nota no relatório)
- [x] Extrair tabela de imports do `VECreator.dll` (app Qt principal; VMProtect + Detours)
- [x] Extrair tabela de imports do `cccreator.dll` (FFmpeg, BEF Effect SDK, CUDA)
- [x] Extrair tabela de imports do `videoeditor.dll` (5.536 exports só por ordinal)
- [x] Extrair tabela de imports do `lens.dll` (tensor lib `tl_*` com CUDA)

> Resultados da Fase 1: [analise/fase1/RELATORIO.md](analise/fase1/RELATORIO.md)

### 1.2 Análise de Strings e Recursos
- [x] Extrair strings ASCII do `CapCut.exe` launcher (caminhos, DLLs, erros de crypto)
- [x] Extrair endpoints de API do bundle JS `/video-studio/assets/App-DpNZSMvJ.js`
- [x] Identificar endpoints de comércio/assinatura (`/commerce/v1/*`)
- [x] Identificar endpoints de agente de IA (`/api/agent-runtime/v1`)
- [x] Extrair referências a modelos de IA no bundle JS (SeedDance, MiniMax, GPTImage2, etc.)
- [x] Mapear tipos de watermark (brand, AI, CapCut, CapCutAI)
- [x] Extrair strings do `VECreator.dll` (pipeline de renderização)
- [x] Extrair strings do `videoeditor.dll` (editor core)
- [x] Extrair strings do `audioeffect.dll` (processamento de áudio — motor Mammon/SAMI)
- [x] Extrair strings do `deepagents_capi.dll` (bridge IA — Go + CloudWeGo Eino)
- [x] Analisar arquivos `.lua` dos watermarks
- [x] Analisar arquivos `ani_info.json` dos watermarks (formato de animação — atlas TexturePacker)

### 1.3 Análise de Configuração e Recursos
- [x] Identificar Lynx pages de assinatura (`image_lynx_videocutpc_*`)
- [x] Identificar modelos neurais empacotados (matting, face, skeleton, gender GAN, interpolação)
- [x] Mapear recursos de watermark (ai_left, ai_right, brand_left, brand_right)
- [x] Identificar uso de `bun.exe` (runtime JS embarcado, 107MB)
- [x] Identificar uso de `python311.dll` (processamento Python)
- [x] Identificar uso de `libcef.dll` (Chromium Embedded Framework para UI)
- [x] Analisar `web-manifest.json` completo (mapeamento de assets e checksums — 140 SHA-256 conferidos)
- [x] Analisar bundle JS do commonagent (`renderApp-CIJPeLBB.js`; não existe `App-*.js` nessa pasta)
- [x] Analisar `server.json` na raiz do repositório rea (manifesto MCP do próprio REA)
- [x] Analisar `smart_cut.ofx.bundle` (plugin OpenFX de smart crop / auto-reframe, não de corte)

---

## 🏗️ Fase 2 — Análise de Arquitetura e Componentes

### 2.1 Processo de Inicialização (Bootstrap)
> Resultados da Fase 2: [analise/fase2/](analise/fase2/) — `2.1-2.2-bootstrap-ui.md`, `2.3-motor-edicao.md`, `2.4-2.5-ia-audio.md`

- [x] Rastrear fluxo de inicialização do `JianyingLauncher.exe` → `CapCut.exe` (o launcher **é** o `Apps\CapCut.exe` renomeado; despacho por linha de comando para `VECreator.dll!entryPoint`, `CefCreator.dll` ou `<serviço>.dll`)
- [x] Mapear comunicação entre launcher e `bun.exe` (Bun 1.3.14 rodando `app-server.mjs` em 127.0.0.1:5174/5175, ~150 variáveis `COMMON_AGENT_*`)
- [x] Entender papel do `agent_runtime_addon.node` (521KB) — N-API: watchdog do processo pai, logs/crash e sandbox de ferramentas (`vm_sdk.dll`)
- [x] Analisar `taskcontainer.exe` (44KB) — benchmark de hardware (ByteBench) via TCP local
- [x] Analisar papel do `ttdaemon.exe` — teste de codecs de GPU (NVENC/QSV/AMF/DXVA) → `ve_hw_check.ini`
- [~] Mapear IPC entre processos: canais mapeados (Mojo 49 interfaces, CEF `cefQuery`, HTTP/SSE local, pipe `vecreator-lyra-cli-v1`, memória compartilhada do preview); falta confirmar o processo de cada serviço Mojo (exige análise dinâmica — Fase 4)

### 2.2 Arquitetura da UI (Multi-Framework)
- [x] Identificar Qt6 como framework de janela principal
- [x] Identificar CEF como renderer de UI web (libcef.dll 217MB)
- [x] Identificar Lynx como framework de UI mobile-style (lynx.dll 24MB)
- [x] Identificar Video Studio como app React/Vite embutida
- [x] Identificar Common Agent como sub-app React/Vite embutida
- [x] Entender como Qt ↔ CEF ↔ Lynx coexistem na mesma janela (Qt 6.2.2/QML no editor; CEF 121 via `PlatinumWebView.dll`; Lynx 3.9 em janelas próprias)
- [x] Mapear IPC Qt ↔ CEF (não há `window.capcut.*`: a ponte é `window.cefQuery` com ~79 + ~42 + ~45 `callType`s)
- [x] Analisar bundle JS `index-DJ4o9hAr.js` (241KB) — React 19, sem roteador, tela por `?surface=`
- [x] Analisar bundle JS `services-Bqx5Pz17.js` (50KB) — SDK de cobrança/assinatura (requisições assinadas pelo nativo)
- [x] Documentar API JavaScript exposta pelo bridge C++ → JS

### 2.3 Motor de Edição de Vídeo (VECreator / videoeditor)
- [x] Mapear funções exportadas de `VECreator.dll` (271MB) — por classe; corpo das funções sob VMProtect
- [x] Mapear funções exportadas de `videoeditor.dll` (72MB) — `lvve::*` (Transfers, Attachment*Control, PlayerWin) + Ghidra
- [x] Mapear funções exportadas de `cccreator.dll` (158MB) — `bef_*`, `AmazingEngine`, `Bach`, `vesdk::ccmodel`
- [x] Entender estrutura interna de um "Draft" (projeto salvo) — JSON: `tracks → segments → material_id + extra_material_refs`, tempos em µs
- [x] Identificar formato binário do projeto CapCut — não é binário; existe cifra opcional (`DRAFT_IO_MANAGER`, KV2, Crypto++), não usada nos projetos locais
- [x] Mapear pipeline: Track → Clip → Effect → Filter (catálogo de 60 `CC*Filter`)
- [x] Mapear pipeline de renderização: grafo de Bins/Units `TE*` (Demux → Decode → GPUPreProcess → efeitos → Compile → Output/Transcode)
- [x] Analisar `lens.dll` (88MB) — runtime NN "lighten" (IR bytenn) + VFI, HDR, deflicker, denoise NN, motion blur, estabilização
- [x] Analisar integração com FFmpeg (`avcodec-61.dll`) — FFmpeg 7 modificado + `ffmpeg.dll` com `ffmpeg_main` como biblioteca + ByteVC1/QSV/SVT-AV1

### 2.4 Motor de IA e Modelos
- [x] Identificar modelos de matting (remoção de fundo local)
- [x] Identificar modelos de face: beautify, verify, fitting 3D
- [x] Identificar modelos de body/skeleton
- [x] Identificar modelos de interpolação de frames
- [x] Identificar modelos de detecção de cenas
- [x] Identificar modelos de salience/seleção inteligente
- [x] Identificar modelos de áudio (AED, sentence score, music2vibes)
- [x] Identificar modelos generativos de vídeo via cloud (SeedDance 2.0/2.5, MiniMax H3, Gemini)
- [x] Identificar modelos de imagem via cloud (SeedDream 4.x/5, GPT-Image2, NanoBanana)
- [x] Identificar modelo de invisible watermark local
- [x] Analisar `deepagents_capi.dll` — C API para modelos de IA (Go/Eino via `DeepAgentsService.dll` + Mojo; 61 ferramentas nativas; SQLite `deepagent.db`)
- [x] Analisar `metasecml.dll` — **não é framework de ML**: é o SDK de segurança MSSDK (assinatura de requisições); binário empacotado, análise parou no papel
- [x] Mapear como modelos `.model` e `.bytenn` são carregados em runtime (config do efeito → `Resources/models` → cache → download `/model/api/arithmetics`; ByteNN com CPU/OpenCL/OpenVINO/TensorRT)
- [x] Identificar quais modelos são locais vs. cloud (API)
- [x] Analisar `SegmentJS/` — **não é segmentação nem WASM**: runtime JS de texto/legenda animados (`ccc_segment_js`)

### 2.5 Processamento de Áudio
- [x] Mapear exports de `audioeffect.dll` (14MB) — `mammon` (DSP), `mammonengine` (grafo de nós), `AudioCleaner`, `sami`
- [x] Analisar `speechsdk.dll` (8.3MB) — reconhecimento de voz
- [x] Analisar `lyra_cli_client.dll` (10.8MB) — **não é o codec Lyra do Google**: CLI interno de edição (`lyra-cli draft/media/material…`)
- [x] Mapear pipeline: waveform → effects → export (151 funções do audioeffect importadas pelo cccreator, agrupadas)
- [x] Identificar algoritmos de denoise, normalização, separação de stems (local: RNNoise/AudioCleaner, libebur128, madmom; cloud: stems, TTS, ASR)

---

## 🌐 Fase 3 — Análise de Rede e APIs

### 3.1 Endpoints Mapeados
- [x] `/api/agent-runtime/v1` — Runtime do agente de IA
- [x] `/api/common-agent/opened-project:restore` — Restauração de projeto
- [x] `/commerce/v1/subscription/*` — Assinaturas e planos
- [x] `/commerce/v1/benefits/*` — Créditos e benefícios
- [x] `/lv/v1/commerce/get_entrances` — Pontos de entrada comerciais
- [x] Mapear base URL da API (host principal) — multi-host por família/região (ver analise/fase3/RELATORIO.md §1)
- [x] Capturar tráfego de rede em runtime (proxy MITM) — runbook + addon prontos (`analise/fase3/runbook-mitm.md`, `analise/scripts/mitm_capcut.py`); execução fica com o usuário
- [ ] Documentar mecanismo de autenticação (token/sessão)
- [ ] Mapear APIs de upload/download de mídia
- [ ] Mapear APIs de efeitos, templates, stickers (cloud assets)
- [ ] Mapear APIs de exportação e watermark
- [ ] Mapear APIs de geração de vídeo por IA (SeedDance, etc.)
- [ ] Identificar mecanismo de verificação de licença/assinatura

### 3.2 Proteção e Anti-Análise
- [ ] Verificar obfuscação de código JS (webpack/vite minificado — confirmado)
- [ ] Identificar mecanismos de detecção de debugger (`IsDebuggerPresent` — encontrado)
- [ ] Analisar `tt_c2pa_sdk.dll` — C2PA (Content Provenance and Authenticity)
- [ ] Investigar `invisible_watermark` — como é embarcado no vídeo exportado
- [ ] Analisar certificados de assinatura do PE
- [ ] Verificar verificação de integridade de DLLs em runtime

---

## 🔧 Fase 4 — Análise Dinâmica (Em Execução)

### 4.1 Instrumentação com Frida
- [ ] Hookear funções de inicialização do `VECreator.dll`
- [ ] Interceptar chamadas ao FFmpeg para capturar parâmetros de codificação
- [ ] Hookear funções de marca d'água (quando/como é aplicada)
- [ ] Interceptar chamadas de rede via `sscronet.dll` (QUIC/HTTP3)
- [ ] Hookear validação de licença/assinatura
- [ ] Capturar parâmetros de modelos de IA ao serem carregados

### 4.2 Análise de Comportamento
- [ ] Monitorar arquivos criados durante edição e exportação
- [ ] Identificar estrutura do arquivo de draft (`draft_content.json`)
- [ ] Monitorar chamadas de API durante fluxo de exportação
- [ ] Analisar comportamento de telemetria (`push_detect.exe`)
- [ ] Mapear dados enviados ao servidor durante uso normal

### 4.3 Crash Analysis
- [ ] Analisar `minidump_stackwalk.exe` para entender crash reports
- [ ] Analisar `parfait_crash_handler.exe` e `VECrashHandler.exe`
- [ ] Mapear pipeline de crash reporting

---

## 📦 Fase 5 — Aplicação ao LeccorCut

### 5.1 Replicação de Funcionalidades Core
- [x] Implementar timeline multi-trilha (Vídeo, Overlay/PiP, Áudio, Texto/Legendas)
- [x] Implementar corte, split, trim drag-and-drop
- [x] Implementar controles de track (mute, visibilidade, solo)
- [x] Implementar alinhamento magnético (snap)
- [x] Implementar marcadores na timeline
- [x] Implementar histórico de ações (undo/redo até 100 estados)
- [ ] Implementar estrutura de projeto compatível com draft CapCut
- [ ] Replicar engine de efeitos em tempo real
- [ ] Implementar pipeline FFmpeg equivalente ao VECreator

### 5.2 Integração de Modelos de IA
- [x] Integrar Whisper para transcrição/legendas offline
- [x] Integrar remoção de fundo por IA (Smart Cutout)
- [ ] Integrar matting de vídeo offline (equivalente ao `mattingBlend`)
- [ ] Integrar interpolação de frames offline (equivalente ao `umvfi`)
- [ ] Integrar detecção de cenas (equivalente ao `jy_compressShotDetect`)

### 5.3 Formato de Arquivo
- [x] Implementar salvamento de projeto em `.lccut`
- [ ] Documentar formato completo do projeto CapCut
- [ ] Implementar importador de projetos CapCut para LeccorCut (se viável)

---

## 📊 Status Geral

| Fase | Progresso | Prioridade |
|------|-----------|------------|
| Fase 1 — Reconhecimento Estático | 🟢 Concluída (100%) | 🔴 Alta |
| Fase 2 — Arquitetura e Componentes | 🟢 Concluída (97% — IPC por processo fica para a Fase 4) | 🔴 Alta |
| Fase 3 — Rede e APIs | 🔴 Iniciado (20%) | 🟡 Média |
| Fase 4 — Análise Dinâmica | ⚪ Não iniciado | 🟡 Média |
| Fase 5 — Aplicação ao LeccorCut | 🟡 Em andamento (40%) | 🟢 Contínuo |

---

*Última atualização: 2026-10-15 — Fase 1 concluída | Ferramentas: REA v6.4.0 + Ghidra 12.1.4 + pefile 2024.8.26*
