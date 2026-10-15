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
- [ ] Extrair tabela completa de imports/exports do `CapCut.exe` launcher via Ghidra
- [ ] Extrair tabela de imports do `VECreator.dll` via Ghidra
- [ ] Extrair tabela de imports do `cccreator.dll` via Ghidra
- [ ] Extrair tabela de imports do `videoeditor.dll` via Ghidra
- [ ] Extrair tabela de imports do `lens.dll` via Ghidra

### 1.2 Análise de Strings e Recursos
- [x] Extrair strings ASCII do `CapCut.exe` launcher (caminhos, DLLs, erros de crypto)
- [x] Extrair endpoints de API do bundle JS `/video-studio/assets/App-DpNZSMvJ.js`
- [x] Identificar endpoints de comércio/assinatura (`/commerce/v1/*`)
- [x] Identificar endpoints de agente de IA (`/api/agent-runtime/v1`)
- [x] Extrair referências a modelos de IA no bundle JS (SeedDance, MiniMax, GPTImage2, etc.)
- [x] Mapear tipos de watermark (brand, AI, CapCut, CapCutAI)
- [ ] Extrair strings do `VECreator.dll` (pipeline de renderização)
- [ ] Extrair strings do `videoeditor.dll` (editor core)
- [ ] Extrair strings do `audioeffect.dll` (processamento de áudio)
- [ ] Extrair strings do `deepagents_capi.dll` (bridge IA)
- [ ] Analisar arquivos `.lua` dos watermarks
- [ ] Analisar arquivos `ani_info.json` dos watermarks (formato de animação)

### 1.3 Análise de Configuração e Recursos
- [x] Identificar Lynx pages de assinatura (`image_lynx_videocutpc_*`)
- [x] Identificar modelos neurais empacotados (matting, face, skeleton, gender GAN, interpolação)
- [x] Mapear recursos de watermark (ai_left, ai_right, brand_left, brand_right)
- [x] Identificar uso de `bun.exe` (runtime JS embarcado, 107MB)
- [x] Identificar uso de `python311.dll` (processamento Python)
- [x] Identificar uso de `libcef.dll` (Chromium Embedded Framework para UI)
- [ ] Analisar `web-manifest.json` completo (mapeamento de assets e checksums)
- [ ] Analisar bundle JS `commonagent/assets/App-*.js` (lógica da UI principal)
- [ ] Analisar `server.json` na raiz do repositório rea
- [ ] Analisar `smart_cut.ofx.bundle` (plugin de corte inteligente)

---

## 🏗️ Fase 2 — Análise de Arquitetura e Componentes

### 2.1 Processo de Inicialização (Bootstrap)
- [ ] Rastrear fluxo de inicialização do `JianyingLauncher.exe` → `CapCut.exe`
- [ ] Mapear comunicação entre launcher e `bun.exe` (runtime JS)
- [ ] Entender papel do `agent_runtime_addon.node` (521KB) — bridge Node.js/Nativo
- [ ] Analisar `taskcontainer.exe` (44KB) — container de processos filhos
- [ ] Analisar papel do `ttdaemon.exe` (daemon TikTok services)
- [ ] Mapear IPC entre processos: launcher ↔ renderer ↔ native services

### 2.2 Arquitetura da UI (Multi-Framework)
- [x] Identificar Qt6 como framework de janela principal
- [x] Identificar CEF como renderer de UI web (libcef.dll 217MB)
- [x] Identificar Lynx como framework de UI mobile-style (lynx.dll 24MB)
- [x] Identificar Video Studio como app React/Vite embutida
- [x] Identificar Common Agent como sub-app React/Vite embutida
- [ ] Entender como Qt ↔ CEF ↔ Lynx coexistem na mesma janela
- [ ] Mapear IPC Qt ↔ CEF (JavaScript Bridge, `window.capcut.*` APIs)
- [ ] Analisar bundle JS `index-DJ4o9hAr.js` (241KB) — entry point lógica
- [ ] Analisar bundle JS `services-Bqx5Pz17.js` (50KB) — serviços de API
- [ ] Documentar API JavaScript exposta pelo bridge C++ → JS

### 2.3 Motor de Edição de Vídeo (VECreator / videoeditor)
- [ ] Mapear funções exportadas de `VECreator.dll` (271MB)
- [ ] Mapear funções exportadas de `videoeditor.dll` (72MB)
- [ ] Mapear funções exportadas de `cccreator.dll` (158MB)
- [ ] Entender estrutura interna de um "Draft" (projeto salvo)
- [ ] Identificar formato binário do projeto CapCut
- [ ] Mapear pipeline: Track → Clip → Effect → Filter
- [ ] Mapear pipeline de renderização: Timeline → Compositor → FFmpeg encoder
- [ ] Analisar `lens.dll` (88MB) — engine de filtros e efeitos em tempo real
- [ ] Analisar integração com FFmpeg (`avcodec-61.dll`)

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
- [ ] Analisar `deepagents_capi.dll` — C API para modelos de IA
- [ ] Analisar `metasecml.dll` — framework ML
- [ ] Mapear como modelos `.model` e `.bytenn` são carregados em runtime
- [ ] Identificar quais modelos são locais vs. cloud (API)
- [ ] Analisar `SegmentJS/` — segmentação via JavaScript/WASM

### 2.5 Processamento de Áudio
- [ ] Mapear exports de `audioeffect.dll` (14MB)
- [ ] Analisar `speechsdk.dll` (8.3MB) — reconhecimento de voz
- [ ] Analisar `lyra_cli_client.dll` (10.8MB) — codec Lyra (Google)
- [ ] Mapear pipeline: waveform → effects → export
- [ ] Identificar algoritmos de denoise, normalização, separação de stems

---

## 🌐 Fase 3 — Análise de Rede e APIs

### 3.1 Endpoints Mapeados
- [x] `/api/agent-runtime/v1` — Runtime do agente de IA
- [x] `/api/common-agent/opened-project:restore` — Restauração de projeto
- [x] `/commerce/v1/subscription/*` — Assinaturas e planos
- [x] `/commerce/v1/benefits/*` — Créditos e benefícios
- [x] `/lv/v1/commerce/get_entrances` — Pontos de entrada comerciais
- [ ] Mapear base URL da API (host principal)
- [ ] Capturar tráfego de rede em runtime (proxy MITM)
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
| Fase 1 — Reconhecimento Estático | 🟡 Em andamento (60%) | 🔴 Alta |
| Fase 2 — Arquitetura e Componentes | 🔴 Iniciado (25%) | 🔴 Alta |
| Fase 3 — Rede e APIs | 🔴 Iniciado (20%) | 🟡 Média |
| Fase 4 — Análise Dinâmica | ⚪ Não iniciado | 🟡 Média |
| Fase 5 — Aplicação ao LeccorCut | 🟡 Em andamento (40%) | 🟢 Contínuo |

---

*Última atualização: 2026-10-15 | Ferramenta: REA v6.4.0 + Ghidra 12.1.4*
