# Fase 1 — Reconhecimento Estático: itens restantes

> Alvo: CapCut PC **9.6.0.4097** (`%LOCALAPPDATA%\CapCut\Apps\9.6.0.4097`), launcher `Apps\CapCut.exe` (SHA-256 `db0a1848…a70a`, conferido).
> Data: 2026-10-15. Análise 100% estática (nada foi executado nem modificado no CapCut).
> Ferramentas: `pefile` 2024.8.26 (tabelas PE) e extrator próprio de strings ASCII/UTF-16LE (`analise/scripts/`).

## Como reproduzir

```bash
python analise/scripts/pe_dump.py      analise/fase1 <binário...>   # imports/exports -> pe_resumo.json + raw/
python analise/scripts/strings_dump.py analise/fase1 <binário...>   # strings categorizadas -> strings_resumo.json + raw/
```

- `pe_resumo.json` (5 binários do roteiro), `pe_resumo_extras.json` (deepagents_capi, audioeffect) e `strings_resumo.json`: resumos versionados.
- `raw/` (13 MB, **fora do git**): listas completas por binário — `*.imports.json`, `*.exports.txt` (nome mangled + escopo), `*.strings.<categoria>.txt` (urls, dominios, fontes_cpp, classes_rtti, recursos, flags_config, mensagens).
- Credenciais embutidas em URLs (`?ak=`, `key=`, `token=`…) são mascaradas como `<REDACTED>` pelo extrator. Foi encontrada **uma** chave (`ak=` em `aidp-i18ntt-sg.tiktok-row.net/api/modelhub/online/v2/crawl`, dentro do `VECreator.dll`); o valor não é registrado em nenhum arquivo.

> **Ghidra vs. pefile:** o roteiro previa extrair imports/exports via Ghidra. As tabelas de import/export são estruturas fixas do PE e o `pefile` as lê de forma idêntica em ~16 s para os 5 binários, enquanto o Ghidra headless levaria horas só para importar o `VECreator.dll` (271 MB). O Ghidra fica reservado para a Fase 2 (análise de funções).

---

## 1.1 Tabelas de imports/exports

| Binário | Tamanho | DLLs importadas | Funções importadas | Exports | Observações |
|---|---|---|---|---|---|
| `CapCut.exe` (launcher) | 4,97 MB | 20 | 415 | 88 | Só Win32 (KERNEL32 252, ADVAPI32 55, USER32 33…). Exports = `base::*` / `switches::*` do Chromium + `GetHandleVerifier` → launcher construído sobre a base do Chromium. |
| `VECreator.dll` | 271 MB | 23 | 4.087 | 1.808 | **É o app Qt principal**: Qt6Core 1.901, Qt6Gui 789, FusionUI 342, Qt6Quick 266, Qt6Widgets 223, Qt6Network 163, Qt6Qml 132; mais `nuro`, `lynx`, `clipflow_sdk`, `EffectPlatform`, `TTPGeckoCppSDK`, `uploader`, `lyra_cli_client`. Único export C: `entryPoint`. Seções `.vmp0/.vmp1/.vmp2` (**VMProtect**) e `.detourc/.detourd` (**Microsoft Detours**). |
| `cccreator.dll` | 158 MB | 62 | 1.701 | 7.401 | Motor de efeitos/render. Importa FFmpeg (avcodec-61, avformat-61, avutil-59, avfilter-10, swscale-8, swresample-5), `audioeffect` 151, `jazz` 116, `sscronet` 105, `libvpl` (Intel QSV), `ByteVC1_dec`, `SvtAv1Enc`, `libraw`, `libmp3lame`, `ttheif_dec`, `lcms2`, D3D11/DXGI/OpenGL. Seções `.nv_fatb` (**kernels CUDA**). |
| `videoeditor.dll` | 72,5 MB | 28 | 854 | 13.722 | Núcleo do editor/draft. Importa `cccreator` 196 e `clipflow_sdk` 77. **5.536 exports só por ordinal** (sem nome); os nomeados são C++ `lvve::*` (5.720) e `lyra::*`. |
| `lens.dll` | 88,5 MB | 19 | 370 | 379 | Biblioteca de visão/tensores: 317 exports C `tl_*` (tensor lib com CUDA: `tl_alloc_cuda`, `tl_gemm_*`, `tl_lrelu_cuda_half`…) + `LENS::FRAMEWORK::*`. Importa `fastcv`, D3D11 e D3DCompiler. Exporta `NvOptimusEnablementCuda` (força GPU NVIDIA em notebooks). |

Extras (úteis para as seções 1.2/1.3):

| Binário | DLLs | Funções | Exports | Observações |
|---|---|---|---|---|
| `deepagents_capi.dll` | 9 | 159 | 77 | Só CRT/KERNEL32 (runtime Go autocontido); API C `da_*` de agente de IA (ver 1.2). |
| `audioeffect.dll` | 23 | 549 | 2.102 | Escopos `mammon` 285, `mammonengine` 184, `AudioCleaner` 78, `sami` 78; importa `sscronet` (rede) e FFmpeg (ver 1.2). |
| `smart_cut.ofx` | 14 | 203 | 2 | `OfxGetNumberOfPlugins` / `OfxGetPlugin` (ver 1.3). |

### API C do `cccreator.dll` (exports sem mangling, por prefixo)

`bef_effect_*` 559 · `tl_tensor_*` 242 · `bef_swing_*` 230 · `bef_info_*` 156 · `bef_ae_*` 146 · `amazingef_effect_*` 60 · `vesdk_player_*` 30 · `bef_bingo_*` 28 · `ByteVC*` 43 · `unqlite_*` 30 · `bef_portrait_*` 35 · `vesdk_recorder_*` 9 · `bef_FaceClusting_*` 10.
→ `bef_` = **ByteDance Effect SDK** (BEF); `AmazingEngine::*` (405 exports C++) é o motor de cena/efeitos; `Bach::*` (1.006) é o sistema de algoritmos; `unqlite` é usado como KV store.

### Principais escopos C++ exportados

- **VECreator:** `davinci::effectplatform::heycan` 275 · `vesdk::ccmodel::CCTextStickerFilter` 118 · `davinci::effectplatform::loki` 104 · `gecko_cpp` 63 · `vesdk::ccmodel::{CCTransformFilter, CCStickerAnimationFilter, CCAmazingFilter, CCClip, CCAiCutOutClipFilter, CCMotionBlurFilter, CCLensVFIFilter, CCObjectTrackerFilter, CCDigitalManFilter…}`.
- **cccreator:** `Bach` 1.006 · `AmazingEngine` 405 · `AmazingEngine::{VideoSegment, Segment, SwingManager, FeatureSegment, TextSegment, TransitionSegment}` · `vesdk::ccmodel` 250 · `LENS::FRAMEWORK` 42.
- **videoeditor:** `lvve` 5.720 · `lvve::{RuntimeTransfer, PersistentTransfer, preset, DraftEnumTransfer, PlayerWin, DraftQuery}` · `lyra::AIEdit` 123 · `draft_store` 112 · `lyra::{TextTemplateUtils, CaptionKeyWordStyles, CaptionCapital}`.

> Os filtros `vesdk::ccmodel::CC*Filter` são o mapa mais direto de "tipos de efeito" do CapCut — base para a Fase 2.3 (Track → Clip → Effect → Filter).

---

## 1.2 Strings e recursos

| DLL | Strings únicas | URLs | Domínios | Fontes C/C++ | Classes RTTI | Recursos | Flags/config | Mensagens |
|---|---|---|---|---|---|---|---|---|
| `VECreator.dll` | 340.567 | 157 | 189 | 1.766 | 38.303 | 1.173 | 26.403 | 23.384 |
| `videoeditor.dll` | 114.315 | 28 | 13 | 1.404 | 34.687 | 213 | 3.256 | 7.347 |
| `audioeffect.dll` | 17.321 | 16 | 8 | 268 | 1.729 | 69 | 628 | 2.476 |
| `deepagents_capi.dll` | 99.619 | 49 | 85 | 5 | 0 | 36 | 406 | 3.415 |

### `VECreator.dll` — app principal (pipeline de UI → render)

- **Módulos (diretórios de fonte):** `model/local_sdk_tools`, `Agent/module`, `TimeLine/segment`, `Algorithom/video_algrithom`, `Material/material_data_manager`, `Player/model`, `aigc/task`, `right_panel/home`, `async_task/executors`, `VEEMWrapper/em_black_screen_detect`, `Draft/DraftCloud`, `Editor/lyra_shell`, `ai_rough_cut2/ViewModels`, `template/publish`.
- **Namespaces RTTI:** `lyra` 1.166, `clipflow` 692, `lvve` 464, `agent` 314, `lvop` 293, `deepagents_service` 231, `draft_cloud` 139, `process_launcher` 86, `aigc` 80, `export_ns` 73, `vip` 59, `vmp_vip` 42, `enterprise_edition` 42.
- **Serviço local de agente:** `http://127.0.0.1:5174/.agent-host/health`, `http://127.0.0.1:5174|5175/video-studio/` (o front React é servido por um host local) e um KV local `http://{}:{}/{read,write,remove,clear}`.
- **Hosts de backend** (insumo para a Fase 3.1): famílias `editor-api*`, `commerce-api*`, `passport-api*`, `feed-api*`, `heycan-*`, `gecko-*`, `log-*`, `mon-*`, `mssdk-*`, `vcs-*`, `ug-*`, `pitaya-*`, `tnc-v2-boot` em `capcutapi.com` / `capcut.com` / `capcutapi.us`, com variantes regionais `-sg`, `-va`, `-us-ttp` e `-v2-boot`. Ex.: `editor-api.capcutapi.com/lv/v1/custom_service/get_entrance`, `edit-api-sg.capcut.com/cc/v1/workspace/get_brand_list`, `editor-api-va.capcutapi.com/lv/v2/`. Também `dreamina.capcut.com`, `fornax-i18n.byteintl.net`, `open.tiktokapis.com`, `imagex-*/vod-*.bytevcloudapi.com`.

### `videoeditor.dll` — editor core / draft

- **Módulos:** `generated/draft` 295 (código gerado do schema do draft), `attachment/model` 265, `action/params`, `video/video_keyframe`, `migration/tasks`, `repair/tasks`, `segment_prerender/high_complexity`, `template/json_parser`, `text_template/new_text_template`, `subtitle_recognize/node`, `ve_wrapper/{ccmodel_wrapper, algorithm}`.
- **Arquivos do draft** referenciados: `draft_content.json`, `draft_info.json`, `draft.json`, `draft_cloud_material.json` e uma família de **`attachment_*.json`** (`attachment_pc_timeline`, `attachment_pc_common`, `attachment_editing`, `attachment_ai_clipper`, `attachment_ai_reel`, `attachment_gen_ai_info`, `attachment_watermark_info`, `attachment_script_video`, `attachment_workflow`, …) — o draft é um conjunto de JSONs, não um único arquivo.
- **Bibliotecas embutidas:** LuaJIT (`bitop.luajit.org`), **Crypto++** (139 classes RTTI — candidato a cifra/assinatura do draft), nlohmann/json, fmt, ghc::filesystem.

### `audioeffect.dll` — motor de áudio "Mammon" / SAMI

- **Algoritmos (nomes de fonte):** denoise `ae_rnnoise_16k/48k`, `ae_ns`, `denoise_model`, `lv_speech_enhance_model`; loudness `ae_loudnorm`, `loudnorm2/3_impl`, `online_loudnorm`; dinâmica `ae_compressor`, `CLimiter(V2)`, `drc_wrapper`; tempo/pitch `ae_time_scaler`, `MusicStretcher`, `SpeechStretcher`, `ae_pitchshifter`, `audio_algorithm/retarget`; ritmo `ae_beat_tracking(_offline)`, `down_beat_tracking_dbn`, `bpm_model`, `OnsetDetection`; **separação de stems** `mss_model_tf/_trt`, `mss_acc_model_tf`; análise musical `chord_estimation_model`, `music_tagging_model_tf`, `music_similarity_*`, `ae_chorus_detection`; voz `ae_vad`, `ae_nnvad`, `online_vad_model`, `ae_aec`, `kws_model`, `mobile_asr_model`, `ctc_prefix_beamsearch`, `SingScoring`, `ae_karaoke_effect`; grafo de nós `me_graph`, `me_*_node` (inclui `ambisonic_binaural_decoder`, `convolver`, `sami_effector`); codec Opus (silk/celt); TTS/voice conversion por websocket (`websocket/tts`, `websocket/vc`).
- Relevância para o LeccorCut: confirma que beat sync, denoise e loudnorm são feitos **localmente** com modelos próprios (Passos 8 e 11 do LeccorCut02).

### `deepagents_capi.dll` — bridge de IA (Go)

- **Linguagem:** Go, compilado como `c-shared` (`_cgo_dummy_export`, `runtime.gopanic`, trampolines de SQLite). Nenhuma classe RTTI C++.
- **SDK interno:** `code.byted.org/cc-family-infra/carrier-agent-sdk/deepagents`, construído sobre **CloudWeGo Eino** (framework open-source de agentes LLM da ByteDance: `eino/compose`, `eino/schema`, `eino/components`) + `gonja` (templates Jinja), GORM + SQLite (persistência de conversas), gRPC/protobuf.
- **API C exportada (77):** ciclo de vida `da_agent_{create, create_with_callbacks, destroy, start, run, run_async, next, stream_run, stream_start, stream_next, execute_subagent}`; conversas `da_agent_{list,get,patch,delete}_conversation`, `..._history_page`, `..._execution_graph`, `da_agent_retrieve_deeplinks`; sessão `da_session_{create, cancel, destroy, rewrite_history, set_prompt_injections, set_thinking_override, set_event_callbacks, get_transcript_view, get_model_context_view, …}`; ferramentas `da_tool_call_{reply_impl, emit_event, report_result_info_json, get_thread_id, …}`, `da_tool_spec_array_{alloc,free}`; infraestrutura `da_get_api_table`, `da_get_abi_version`, `da_set_log_callback`, `da_set_crash_callbacks`, `da_buffer_{alloc,free}`, `da_stream_{read,close}`. Rastreamento via **Fornax** (`http://fornax-bridge.local`, `da_fornax_trace_send_reply_impl`).
- **Provedores de LLM/ferramentas referenciados:** OpenAI (`api.openai.com/v1`), Anthropic (`api.anthropic.com`), Google Gemini (AI Studio + Vertex `aiplatform.googleapis.com`), Volcengine Ark (`ark.cn-beijing.volces.com/api/v3`), Coze (`api.coze.cn`), OpenRouter (`openrouter.ai/api/v1`), busca Tavily (`api.tavily.com/search`) e DuckDuckGo HTML; autenticação AWS STS e Google OAuth/ADC.

### Watermarks — `.lua` e `ani_info.json` (`Resources/watermark/`)

- **9 variantes:** animadas `ai_left`, `ai_right`, `brand_left`, `brand_right`; estáticas `ai_left_static`, `ai_right_static`, `big_brand`, `normal_brand`; mais `CapCut.png` e `CapCutAI.png` na raiz.
- Cada variante = `config.json` (`{"effect":{"Link":[{"type":"InfoSticker"}]},"version":"4.0.0"}`) + `heycanInfo.json` (dimensões do atlas) + `infoSticker.lua` + imagem.
- **`infoSticker.lua`** (só 2 versões distintas, idênticas entre variantes do mesmo tipo):
  - *Animada:* material `materialType.autoAtlas` (`ani_info.json` + `SequenceMap.png`); escala = `largura_do_viewer / 720`; sprite + `AnimatorComponent` a **30 fps**, animação de frames sem loop e congelada no último frame, mais *ease-in/ease-out* de escala de 0,2 s (`EffectSdk.Line2D` com inclinação ±5). APIs usadas: `director`, `scene:createEntity`, `EffectSdk.AnimationFactory.{createFrameAnimation, createScaleAnimation}` — é o runtime Lua do Effect SDK (AmazingEngine).
  - *Estática:* apenas `materialType.image` com `singleImage.png`.
- **`ani_info.json`** = atlas no **formato TexturePacker (JSON hash/array)**: `frames[]` com `filename` (`ccail_00000.png`…), `frame{x,y,w,h}`, `rotated`, `trimmed`, `spriteSourceSize`, `sourceSize{w:200,h:60}`; `meta{format:"RGBA8888", image:"SequenceMap.png", size:1024×1024}`. **90 frames** de 200×60 → 3 s a 30 fps.
- `heycanInfo.json` confirma: animadas `type:"bigPng"`, 200×60, atlas 1024×1024, 90 frames; `big_brand` 1600×256 estático.
- Também existem `Resources/VideoWaterMark/` (efeito AmazingFeature com `main.scene` e máscaras `ic_mask_<locale>.png` por idioma) e o modelo `models/invisible_watermark/win_lens_wm_embed_model_c4_v2.bytenn` (marca d'água invisível).

---

## 1.3 Configuração e recursos

### `Resources/common_agent/app/web-manifest.json`

- `schema: "common-agent.web-manifest.v1"`, `webVersion: "0.1.0"`, `packageStamp: "20261008-043846"`.
- `requires`: `native.minVersion "0.0.0"`, `productHostApi` **min 1 / max 1** (contrato de versão entre o app nativo e o front web).
- `entries`: `commonagent → commonagent/index.html`, `videoStudio → video-studio/index.html`.
- `hashes`: **140 arquivos** (commonagent: 23 JS, 4 CSS, 27 JSON, 3 **WASM**, 5 TTF, 7 PNG…; video-studio: 4 JS, 2 CSS, 27 JSON; `locale/` 26 JSON). **Verificado: todos são SHA-256 do conteúdo e os 140 conferem**; o único arquivo sem hash é o próprio manifest. → mecanismo de verificação de integridade do pacote web.

### Bundle do commonagent

O roteiro citava `commonagent/assets/App-*.js`, mas esse arquivo **não existe**: `App-DpNZSMvJ.js` é do `video-studio`. A lógica principal do commonagent está em **`renderApp-CIJPeLBB.js`** (1,6 MB). Outros bundles grandes: `reportTrackingEvent` (2,3 MB), três `render-worker-*` (0,8–1,4 MB), `AgentHubTask`, `services-D23s7fHS.js` e visualizadores de `docx`/`xlsx`/`pptx`.

- **Rotas de API:** `/api/common-agent/v1/{skills, skills:refresh, user-skills, user-skills:{preview,update,delete}, mcp-connections, agent-profiles}`, `/api/common-agent/voice-input/v1`, `/api/common-agent/opened-project:restore`, `/api/common-agent/automation/v1/session-events/latest`, `/api/agent-runtime/v1/debug/{pc-login-poll, canvas-cli, ailab-test-login}`. → o agente suporta **skills** e **conexões MCP** configuráveis pelo usuário.
- **Ponte web → nativo (CEF):** `window.cefQuery({request: JSON.stringify({callType, data:{params}})})`. `callType` encontrados: `openAgentHubDeepLink`, `setAgentHubSidebarWidth`, `ackAgentHubHostModeLayout`, `finishAgentHubMediaDrag`, `notifyAgentRuntimeEvent`, `setAgentHubDebugReloadState`, `showToast`, `trackCommonAgentSandboxEvent`.
- **Ponte video-studio:** mensagens `{version:1, type, payload}` enviadas para `window.videoStudioNativeBridge.postMessage`, `window.webkit.messageHandlers.videoStudioBridge` (macOS) e como `CustomEvent("videoStudioBridgeMessage")`. Tipos: `videoStudioChat.{ready, sessionSelected, turnStarted, turnCompleted, error}`. Eventos de sessão: `session.{created, updated, deleted}`, `host.draining`.
- Detecção do host: query `?nativeShell=1` ou `nativeHost === true`.

### `server.json` (raiz do repositório `rea`)

Não é do CapCut: é o **manifesto MCP do próprio REA** (schema `modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`): `io.github.morluto/rea` v6.4.0, pacote npm `rea-agents@6.4.0`, executado com `npx rea-agents mcp` via transporte **stdio**. Confirma como o REA é registrado como servidor MCP; não traz informação sobre o alvo.

### `smart_cut.ofx.bundle`

- Plugin **OpenFX** padrão (`Contents/Win64/smart_cut.ofx`, 604 KB; exports `OfxGetNumberOfPlugins` e `OfxGetPlugin`).
- Apesar do nome, **não faz corte por silêncio/cena: é smart crop / auto-reframe**. Classe `TEPSmartCutImpl`; parâmetros `param_output_ratio`, `param_crop_coordinate`, `param_need_crop`, `param_track_speed`, `param_video_sample`, `param_draft_path`, `param_unique_key`, `param_algorithm_eof`; logs `smart_crop, currentCoord: left/right/top/bottom`, `updateAlgorithmRatioParam ratio`, `instanceChanged scenes = %d`, `parseDraftEx path`.
- Usa o sistema de algoritmos **Bach** do `cccreator.dll` (`vepluginalgo::TECommonAlgorithmBach`, 36 funções importadas do cccreator) e renderiza via **GLES/ANGLE** (`libGLESv2.dll`, classes `GLFrameCut`, `ITEGPUCut`).
- Relevância para o LeccorCut: é a referência direta para o **Passo 15 (Auto-Reframe)** — coordenadas de crop por cena, razão de saída e suavização (`track_speed`).
