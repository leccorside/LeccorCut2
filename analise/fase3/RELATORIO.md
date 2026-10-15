# Fase 3 — Analise de Rede e APIs — Relatorio Estatico

> Alvo: CapCut v9.6.0.4097 (release, x86_64) — sem execucao, so strings/JS/bundles
> Data: 2026-10-15
> Fontes: analise/fase1/raw/*.urls|.dominios.txt (23 DLLs), analise/fase2/raw/bootstrap_ui/*, bundles em Resources/common_agent/

---

## 1) Base URL / Hosts principais (consolidado)

Conclusao: CapCut nao tem um host unico. O roteamento e por familia e por regiao via gateway ByteDance capcutapi.com / byteoversea.com, com espelhos *-sg.* (Singapura) e *-va.*/*-us-ttp* (Virginia/EUA) e gateways unificados *-v2-boot.*. A selecao vem de REGION/CHANNEL/PLATFORM_CODE nas ~150 vars COMMON_AGENT_*/AGENT_HOST_* (ver prova por fonte abaixo). Confirmacao de qual host fica ativo por regiao exige captura em runtime (Fase 4 / runbook MITM).

| Familia | Host principal | Variantes regionais/boot | Via |
|---|---|---|---|
| Editor / draft | editor-api.capcutapi.com | editor-api-sg.capcut.com, editor-api-va.capcutapi.com, editor-api-v2-boot.capcutapi.com, editor16-normal-us-ttp.capcutapi.us, editor32-normal-sg.capcutapi.com | sscronet.dll + ttnet |
| Feed / templates | feed-api.capcutapi.com | feed-api-sg.capcut.com, feed-api-va-us.capcutapi.com, feed-api-v2-boot.capcutapi.com | sscronet.dll |
| Comercio | commerce-api.capcutapi.com | commerce-api-sg.capcut.com, commerce-api-va.capcutapi.com, commerce-api-v2-boot.capcutapi.com | services-Bqx5Pz17.js (ICommercialBenefitService, fixo em commerce-api-sg.capcut.com) |
| Auth / login | passport-api.capcutapi.com | passport-api-sg.capcut.com, passport-api-sg.capcutapi.us, passport16-normal-us-ttp.capcutapi.us, tt-passport16-normal-sg.capcutapi.com, www.capcut.com/lvpc_web/*, www.capcutapi.com/lvpc_web/login | VECreator.dll, DeepAgentsService.dll |
| AIGC / geracao | heycan-api.capcutapi.com | heycan-v2-boot.capcutapi.com, api-heycan-pc-sg.capcut.com, aidp-i18ntt-sg.tiktok-row.net/api/modelhub/online/v2/crawl | VECreator.dll |
| Config / Gecko | gecko-sg.capcutapi.com | gecko-sg.byteoversea.com, gecko-v2-boot.capcutapi.com, tt-gecko-sg.capcutapi.com | VECreator.dll |
| Telemetria | mon-sg.capcutapi.com | mon-va.byteoversea.com, pc-mon-va.byteoversea.com, mon.isnssdk.com, pc-mon-v2-boot.capcutapi.com, mon-sg.capcutapi.com/monitor_browser/collect/batch/?biz_id=cc_web | Slardar (services-*) |
| Frontier / WS | frontier-va.byteoversea.com | frontier-sg.capcut.com, wss://frontier-va.byteoversea.com/ws/v2, wss://frontier-sg.capcut.com/ws/v2 | ttnet_frontier_addon.node |
| MCS / etc | sgali-mcs.byteoversea.com | mcs.byteoversea.net, mcs-normal-sg.capcutapi.com, pitaya-sg.capcutapi.com, vcs-sg.capcutapi.com, ug-sg.capcutapi.com, log-sg.capcutapi.com | VECreator.dll |
| Segurança/assinatura | mssdk-sg.byteoversea.com | mssdk-sg.capcutapi.com, mssdk-v2-boot.capcutapi.com, tnc-sg.capcutapi.com, tnc16-alisg.isnssdk.com | metasecml.dll (MSSDK) |
| Armazenamento | *.ibytedtos.com, *.tiktokcdn.com, *.bytevcloudapi.com (imagex-*, vod-*) | lf16-beecdn.ibytedtos.com, sf16-sg/va.tiktokcdn.com, imagex-ap-singapore-1.bytevcloudapi.com, vod-ap-singapore-1.bytevcloudapi.com | ever_cloud_sdk.dll, res_pool.dll, uploader-oversea-2.1.11.js |
| Local (IPC) | 127.0.0.1:5174 e 127.0.0.1:5175 | http://127.0.0.1:5174/.agent-host/health, http://127.0.0.1:5174/video-studio/, pipe \.\pipe\vecreator-lyra-cli-v1-* e \.\pipe\capcut-browser-* | bun.exe (app-server.mjs) |

Prova por fonte (estatico, sem execucao):
* `analise/fase1/raw/VECreator.dll.strings.dominios.txt` (189 dominios) + `VECreator.dll.strings.urls.txt` (157 urls): contem todas as familias acima — editor-api.*, feed-api.*, commerce-api.*, passport-api.*, heycan-*, gecko-*, mon-*, frontier-va, ttnet-sg, mssdk-sg, tnc-*, vcs-*/ug-*/pitaya-*/log-*/mcs-*, imagex-*/vod-*, lf16-*, sf16-*.
* `analise/fase2/raw/bootstrap_ui/*.all.txt` (contagem de linhas unicas com hosts CapCut): VECreator.dll 219, VEHelper.exe 82, DeepAgentsService.dll 81, CefCreator.dll 80, ttnet_frontier_addon.node 31, VEConfig.dll 27, agent_runtime_addon.node 9, videoeditor.dll 1 (só 127.0.0.1:7777/event).
* `analise/fase3/raw/dominios_agregado.txt` (299 linhas, 38 hosts CapCut apos filtro): lista completa das variantes -sg/-va/-us-ttp/-v2-boot.
* `analise/fase3/raw/urls_agregado.txt`: URLs completas com paths — ex. `https://editor-api.capcutapi.com/lv/v1/custom_service/get_entrance`, `https://feed-api.capcutapi.com/lv/v1/music_beat`, `https://heycan-api.capcutapi.com/artist/v1/aigc_effect/user_aigc_list`, `https://passport16-normal-us-ttp.capcutapi.us/passport/web/check_qrconnect/`, `https://mon-sg.capcutapi.com/monitor_browser/collect/batch/?biz_id=cc_web`, `wss://frontier-va.byteoversea.com/ws/v2`.
* `analise/fase3/raw/endpoints_por_host.json`: mapeia host -> paths (editor-api 5 paths, feed-api 7 paths, heycan-api 2, mon-sg 1, frontier-va 2, 127.0.0.1:5174 2, www.capcut.com ~35, open.tiktokapis.com 5).
* `analise/fase2/raw/bootstrap_ui/runtime_endpoints.json` (app-server.mjs): seletores de regiao `AGENT_HOST_DEV_REGION`, `AGENT_HOST_DEV_CHANNEL`, `AGENT_HOST_DEV_PLATFORM_CODE` (+ equivalentes `COMMON_AGENT_DEV_*`); base URLs configuraveis `COMMON_AGENT_PC_AGENT_BASE_URL`, `COMMON_AGENT_PC_AGENT_POLL_BASE_URL`, `COMMON_AGENT_MODEL_ENDPOINT`, `COMMON_AGENT_AILAB_AGENT_BASE_URL`, `COMMON_AGENT_AILAB_EDITOR_BASE_URL`; APIs locais `/api/agent-runtime/v1/host/auth-context`, `/host/app-context`, `/api/common-agent/opened-project:restore`.
* Nenhum web-manifest.json na versao instalada — em 9.6.0.4097 os assets foram movidos para Resources/common_agent/app/{video-studio,commonagent} + Resources/lynx_config.

> PASSOS 3.1: Mapear base URL da API (host principal) -> concluido em estatico (multi-host, ver tabela). Confirmacao de host ativo por regiao exige captura em runtime (Fase 4).

---

## 2) Autenticacao / assinatura (consolidado)

Conclusao: login por QR + paginas lvpc_web + OAuth externo; sessao por identidade de maquina/instancia injetada via ENV no common-agent; assinatura de requisicoes via SDK MSSDK (metasecml.dll). Esquema de assinatura (headers, nonce, payload canonico) e detalhe do token de sessao exigem MITM/Fase 4.

| Camada | Mecanismo | Evidencia estatica |
|---|---|---|
| Login QR | `passport16-normal-us-ttp.capcutapi.us/passport/web/check_qrconnect/`, `www.capcut.net/imlv/scan-login?token=` | urls_agregado.txt |
| Login web | `www.capcut.com/lvpc_web/` + `login`, `login_proxy`, `login_status` (`?target=bind&platform=google`, `?target=upload&platform=google`, `?target=upload&platform=tiktok`), `login_success`, `share_oauth_success`, `tt_account_bind_guide`; `www.capcutapi.com/lvpc_web/login` | urls_agregado.txt, endpoints_por_host.json (`www.capcut.com` ~35 paths) |
| OAuth | Google (`accounts.google.com/o/oauth2/v2/auth`, client_ids `12865...`/`76708...` em `*.apps.googleusercontent.com`), Apple (`appleid.apple.com/auth/authorize`), Facebook (`www.facebook.com/v10.0/dialog/oauth`), TikTok (`www.tiktok.com/v2/auth/authorize`, `open.tiktokapis.com` 5 paths, `open-platform.tiktokapis.com` 3 paths) | urls_agregado.txt, dominios_agregado.txt |
| Token | strings `https://%1/tokenAuth`, `https://%1/token_auth`, `https://www.capcut.com/tokenAuth?` em VECreator.dll | VECreator.dll.strings.urls.txt |
| Sessao/identidade | `AGENT_HOST_DEV_APP_VERSION/CHANNEL/CLIENT_INSTANCE_ID/DEVICE_ID/LANGUAGE/PLATFORM_CODE/REGION` (+ equivalentes `COMMON_AGENT_DEV_*`); `COMMON_AGENT_FORNAX_REGION/SK`, `COMMON_AGENT_MODEL_TOKEN`; endpoints locais `/api/agent-runtime/v1/host/auth-context`, `/host/app-context` em app-server.mjs | runtime_endpoints.json |
| Assinatura | `metasecml.dll` = SDK MSSDK (nao e ML), 17x como MSSDK/mssdk/metasecml em VECreator.dll + metasecml.dll; consumidores commerce/passport/tnc (`tnc-sg.capcutapi.com`, `tnc16-alisg.isnssdk.com`, `tnc-boot/v2-boot`); `mssdk-sg.byteoversea.com`, `mssdk-sg.capcutapi.com`, `mssdk-v2-boot.capcutapi.com` tambem em CefCreator.dll/VECreator.dll/VEHelper.exe | strings VECreator, dominios_agregado.txt |
| Transporte | `sscronet.dll` (Cronet/QUIC/HTTP3) 338x em VECreator.dll, 229x em DeepAgentsService.dll (+ CefCreator, audioeffect, lynx, metasecml); cadeia sscronet -> ttnet (`ttnet-sg.byteoversea.com`, 7 binarios) -> frontier edge WS | Fase 2 + strings |

Prova por fonte (estatico, sem execucao):
* `analise/fase3/raw/urls_agregado.txt`: todas as URLs de login/QR/OAuth/tokenAuth acima.
* `analise/fase3/raw/endpoints_por_host.json`: `www.capcut.com` (~35 paths lvpc_web), `passport16-normal-us-ttp.capcutapi.us` (`/passport/web/check_qrconnect/`), `open.tiktokapis.com` (5), `open-platform.tiktokapis.com` (3).
* `analise/fase2/raw/bootstrap_ui/runtime_endpoints.json`: `/api/agent-runtime/v1/host/auth-context`, `/host/app-context` + ENVs de identidade.
* `analise/fase3/raw/dominios_agregado.txt`: `mssdk-sg.*` (3), `tnc-*` (4), `passport-api-*` (5), `*.apps.googleusercontent.com` (2 client_ids).

> PASSOS 3.1: Documentar mecanismo de autenticacao (token/sessao) -> concluido em estatico (fluxos e pontos de assinatura mapeados). Detalhe do esquema de assinatura (headers, nonce, payload canonico) e do token de sessao so com MITM/Fase 4.

---

## 3) Midia — upload / download (consolidado)

Conclusao: nao ha um unico /upload documentado nos paths estaticos — o upload e via SDK TOS (ByteDance Object Storage), com lado JS (uploader-oversea + BytedUploader) e lado nativo (ever_cloud_sdk.dll 8,4 MB, res_pool.dll 8,4 MB, uploader.dll 1,2 MB). Paths exatos de PUT/GET do objeto exigem MITM (roteiro pronto no runbook-mitm.md, fluxo 7).

| Camada | Componente | Evidencia estatica |
|---|---|---|
| SDK JS | `app/commonagent/vendor/uploader-oversea-2.1.11.js` expoe `Blob`, `FileReader`, `FormData`, `LogPluginObject`, `ProgressEvent`; `BytedUploader` em `app/commonagent/assets/AgentHubTask-CF1zzZ02.js` | js_bridge_scan.json |
| SDK nativo | `ever_cloud_sdk.dll` (8,4 MB), `res_pool.dll` (8,4 MB), `uploader.dll` (1,2 MB) | instalacao 9.6.0.4097 |
| TOS/CDN (hosts) | `lf16-beecdn.ibytedtos.com`, `lf16-capcut.faceulv.com`, `sf16-sg.tiktokcdn.com`, `sf16-va.tiktokcdn.com`, `sf16-web-tos-buz.capcutstatic.com`, `imagex-ap-singapore-1.bytevcloudapi.com` + variante `imagex-us-east-1`, `vod-ap-singapore-1.bytevcloudapi.com` + variante `vod-us-east-1` | dominios_agregado.txt |
| Objetos (paths) | `/obj/ies-fe-bee-sg/bee_prod/biz_141/tos_*.mp4` (lf16-beecdn), `/obj/capcutpc-packages-sg/CCWinConfig/` (lf16-capcut), `/obj/eden-sg/.../mute_audio_{4,8,12}_second.mp3` + `/obj/eden-sg/.../text_style_pic.png` (sf16-sg), `/obj/eden-va2/.../EffectUpload/GifGenRes/en` (sf16-va), `/obj/capcut-web-buz-sg/common/others/vocab.txt` (sf16-web-tos-buz) | urls_agregado.txt, endpoints_por_host.json |
| Endpoints indiretos | `cloudspace-normal.capcutapi.com` (drive) e `i18n-api.faceueditor.com/artist/v1/upload/data` | urls_agregado.txt |

Download de assets segue o mesmo TOS + imagex/vod + capcutstatic.com. Padrao de path observado: `/obj/<bucket>-<regiao>/<app>/<recurso>` (ex. `eden-sg`, `capcut-web-buz-sg`).

> PASSOS 3.1: Mapear APIs de upload/download de midia -> parcial em estatico (SDK JS+nativo, familias TOS e padrao de path confirmados; PUT/GET exatos pendentes de runtime via MITM).

---

## 4) Efeitos / templates / stickers (cloud assets) (consolidado)

Conclusao: catalogo remoto por familia editorial (editor-api + feed-api), gate comercial via commerce-api, AIGC via heycan-api + Dreamina; recursos locais em Resources/ espelham o catalogo remoto. Catalogo completo exige crawling autenticado (MITM fluxo 3/4/6).

| Familia | Endpoints / hosts | Evidencia estatica |
|---|---|---|
| Editoriais | `editor-api.capcutapi.com`: `/agent_edit_api/query_skills`, `/lv/v1/custom_service/get_entrance{,_allow_guest}` (+ variante com typo `get_eentrance_allow_guest`); `editor-api-va.capcutapi.com/lv/v2/` | endpoints_por_host.json, urls_agregado.txt |
| Feed/home | `feed-api.capcutapi.com`: `/lv/v1/ad_maker/digital_human/get_config`, `/get_panel_data`, `/lv/v1/music_beat`, `/lv/v2/music_beat`, `/lv/v1/pc/replicate/get_collections`, `/lv/v1/homepage/profile` (via -sg), `/cc/v1/workspace` (via -va-us) | endpoints_por_host.json |
| Comercio (gate pagos) | `commerce-api.capcutapi.com` (hosts confirmados; paths `/commerce/v1/subscription/*`, `/benefits/*`, `/purchase/*`, `/lv/v1/commerce/get_entrances` vindos do bundle `App-DpNZSMvJ.js` Fase 1); `services-Bqx5Pz17.js` (ICommercialBenefitService, video-studio); `www.capcut.com/commerce/vip-redeem` | Fase 1, js_bridge_scan.json |
| AIGC catalogo | `heycan-api.capcutapi.com/artist/v1/aigc_effect/user_aigc_list`; `dreamina.capcut.com/ai-tool/{asset,home}` (asset exige login); strings `aigc/task` e `aigc_text_template` em VECreator.dll/Resources | urls_agregado.txt |
| Assets binarios | `/obj/eden-va2/.../EffectUpload/GifGenRes/en` (sf16-va); padrao `/obj/<bucket>/<app>/EffectUpload/...` | urls_agregado.txt |
| Espelho local | `Resources/CloudMaterial/` (3 icones default), `Resources/template_sticker/` (`config.json` plugin `lv_plugin_com.lv.template_gray-filter` v10.1.0 + `js/template/template.js`), `Resources/aigc_text_template/` (`content.json`, `extra.json` com `depend_resource_list`, `depends`), `Resources/lynx_config/` (29 arquivos, telas de subscription/credits/message-center) | instalacao 9.6.0.4097 |

> PASSOS 3.1: Mapear APIs de efeitos/templates/stickers -> parcial em estatico (hosts, familias e espelho local confirmados; catalogo completo exige crawling autenticado via MITM).

---

## 5) Exportacao e watermark (consolidado)

Conclusao: export sem marca e um beneficio comercial (gate em /commerce/v1/benefits/*); watermark invisivel e C2PA sao aplicados localmente no export (modelo + SDK nativo). Nenhum endpoint de rede dedicado a exportacao foi encontrado — o fluxo e local + gate comercial.

| Camada | Mecanismo | Evidencia estatica |
|---|---|---|
| Gate comercial | flags `downloadWithoutWatermark` / `downloadWithWatermark` (`pc_omni_agent_export_without_watermark` / `with_watermark`), `commercial_strategy_v2`, `material_user_assets`, `credit_strategy`, `limitfree_strategy`, `subscribe_strategy`, `kmp_commercial_http_api_setting_service`, preview `previewMediaWatermarkFreeUrl` vs `previewMediaWatermarkUrl` | `App-DpNZSMvJ.js` via video_studio_scan.json |
| Brand/AI visivel | `CapCut.png` (logo animado nos exports gratuitos), `CapCutAI.png` (conteudo gerado por IA); animacoes em `ani_info.json` + `infoSticker.lua` | DOCUMENTACAO §10.2, Fase 1 |
| Invisible | modelo local `Resources/models/invisible_watermark/` + 6 ocorrencias em VECreator.dll, 3 em cccreator.dll, 2 em ttdaemon.exe; lado nativo em lens/pipeline TE (Fase 2); draft tem `attachment_watermark_info.json` | strings Fase 1, Fase 2 |
| C2PA | `tt_c2pa_sdk.dll` (8 MB); 37 ocorrencias C2PA/c2pa em VECreator.dll + namespaces XMP `http://ns.adobe.com/*`, `creatorAtom/1.0` — proveniencia embarcada no export | strings VECreator (classes_rtti 15, flags_config 11, mensagens/recursos 1+1), DOCUMENTACAO |

> PASSOS 3.1: Mapear APIs de exportacao e watermark + 3.2: investigar invisible_watermark / C2PA -> concluido em estatico (gate comercial + mecanismos locais identificados; detalhe do payload C2PA/invisible requer amostra exportada).

---

## 6) Geracao de video/imagem por IA (cloud) (consolidado)

Conclusao: geracao 100% cloud via gateway heycan + modelhub + Dreamina; catalogo de modelos extraido da Fase 1 (bundle JS). Agente LLM local (deepagents_capi.dll, Go/Eino) orquestra via provedores Ark/OpenAI/Gemini/Coze/OpenRouter. Endpoints de job (submit/poll) exigem MITM (roteiro fluxo 6).

| Camada | Modelos / endpoints | Evidencia estatica |
|---|---|---|
| Video (SeedDance) | 1.5 T2V 720p (`ai_hub_video_seedance15_720`); 2.0 I2V/R2V/Fast/Mini (480p–4K); 2.5 I2V/R2V (480p–1080p) | DOCUMENTACAO §7.2 (Fase 1, bundle) |
| Video (terceiros) | MiniMax H3 768p/2K; Gemini Omni Flash 720p; DreamActor avatar 480p/720p | DOCUMENTACAO §7.2 |
| Imagem | SeedDream 4.3/4.5/5/5Pro (1K–4K); NanoBanana 1/2 (1K–4K); GPT-Image2 medium (1K/2K) | DOCUMENTACAO §7.2 |
| Gateway geracao | `heycan-api.capcutapi.com` (`/artist/v1/aigc_effect/user_aigc_list`), `heycan-v2-boot`, `api-heycan-pc-sg.capcut.com`; `aidp-i18ntt-sg.tiktok-row.net/api/modelhub/online/v2/crawl` (ak=<REDACTED> no extrator); `dreamina.capcut.com/ai-tool/{asset,home}` | urls_agregado.txt, dominios_agregado.txt |
| Agente LLM | `deepagents_capi.dll` Go 42 MB (CloudWeGo Eino; API C `da_*`: `da_loader_configure`, `da_get_api_table`, `da_set_log_callback`); adaptadores `model/ark` (Volcengine `ark.cn-beijing.volces.com/api/v3`), `model/openai` (`api.openai.com/v1`), `model/gemini`, refs Coze (`api.coze.cn`) e OpenRouter (`openrouter.ai/api/v1`) | Fase 2 (2.4-2.5), strings deepagents_capi |
| Skills/MCP | `/api/common-agent/v1/{skills, user-skills, mcp-connections, agent-profiles}`, `/api/agent-runtime/v1/debug/{pc-login-poll, canvas-cli, ailab-test-login}`; base URLs `COMMON_AGENT_MODEL_ENDPOINT`, `COMMON_AGENT_AILAB_AGENT_BASE_URL`, `COMMON_AGENT_AILAB_EDITOR_BASE_URL` | renderApp bundle (Fase 1), runtime_endpoints.json |

> PASSOS 3.1: Mapear APIs de geracao de video por IA (SeedDance, etc.) -> parcial em estatico (catalogo de modelos + gateways + agente LLM mapeados; endpoints de job submit/poll exigem MITM autenticado).

---

## 7) Verificacao de licenca / assinatura / integridade (consolidado)

Conclusao: nao ha servidor de licenca dedicado — o modelo e freemium com gate comercial (login + beneficios/assinatura via commerce-api) + camadas locais de anti-tamper. A verificacao de "licenca" de um recurso (ex. template, overdub) e feita via login + entrance verify + assinatura MSSDK da resposta.

| Camada | Mecanismo | Evidencia estatica |
|---|---|---|
| Gate de recurso pago | `[CommerceHttpClientMgr] response %s: sign empty` / `verify sign error` / `response null`; `[VIMO_BANNER] skip single resource by entrance verify, resource_key=%s, plan_id=%s`; `tryEnterOverdub LoginAndPhoneLicenseCheck {login, phone license} failed/succeed` | VECreator.dll.strings.mensagens.txt |
| TNC (rede de confianca) | hosts `tnc-sg.capcutapi.com`, `tnc-boot/v2-boot.capcutapi.com`, `tnc16-alisg.isnssdk.com`; log `[Network Dispatch State] When the TNC changes for the first time, it is not initialized` | dominios_agregado.txt, mensagens.txt |
| Assinatura PE | cadeia DigiCert G4 CodeSigning RSA4096 (`cacerts.digicert.com`, `crl3/crl4.digicert.com`, `ocsp.digicert.com`) + Sectigo timestamping (`crt/crl.sectigo.com`, `ocsp.sectigo.com`) + USERTrust (`crl.usertrust.com`) | urls_agregado.txt |
| Anti-tamper local | VMProtect (secoes `.vmp0-2` no VECreator), `VESafeGuard.dll` (chamado no stub antes do app), `metasecml.dll` (SDK seguranca/anti-tamper), Microsoft Detours (`.detourc/.detourd`), `IsDebuggerPresent` (encontrado, ver PASSOS 3.2) | Fase 2 (2.1, 2.3) |
| Integridade de assets | `web-manifest.json` (140 SHA-256, Fase 1) + `package_info.json`/`version.json` por modelo (ex. `ccc_segment_js` com lista SHA-256); `<verify enable="0"/>` em `ProductInfo.xml` (verificacao de pacote desligada nesta build) | Fase 1, Fase 2 (2.1.2, 2.4) |
| Launcher | `Apps\CapCut.exe` = JianyingLauncher renomeado (`JianyingLauncher.pdb`, export `JianyingLauncher.exe`); falha de carga: `JianyingPro load ve creator dll failed!!! error_code(%d), path(%s)!` | Fase 2 (2.1.1) |

> PASSOS 3.1: Identificar mecanismo de verificacao de licenca/assinatura -> concluido em estatico (modelo freemium + gate comercial + anti-tamper mapeados). Bypass/hook fica para Fase 4 (Frida em `metasecml.dll` + `sscronet.dll`, ver PASSOS 4.1). 
