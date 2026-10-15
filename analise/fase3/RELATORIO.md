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

## 2) Autenticacao / assinatura

* Login: QR (passport16-normal-us-ttp.capcutapi.us/passport/web/check_qrconnect/, www.capcut.net/imlv/scan-login?token=), paginas www.capcut.com/lvpc_web/login*, OAuth Google (accounts.google.com/o/oauth2/v2/auth, client_ids 12865.../76708...), Apple (appleid.apple.com/auth/authorize), Facebook (www.facebook.com/v10.0/dialog/oauth), TikTok (www.tiktok.com/v2/auth/authorize, open.tiktokapis.com). Strings tokenAuth/token_auth (https://%1/tokenAuth, https://%1/token_auth, https://www.capcut.com/tokenAuth?) aparecem em VECreator.dll.
* Sessao: AGENT_HOST_*/COMMON_AGENT_* injetam APP_ID, DEVICE_ID, CLIENT_INSTANCE_ID, REGION, LANGUAGE; o common-agent expoe host/auth-context e host/app-context em app-server.mjs (/api/agent-runtime/v1/host/auth-context).
* Assinatura de requisicoes: metasecml.dll e o SDK MSSDK (nao e ML). Ocorre 17x em VECreator.dll e metasecml.dll como MSSDK/mssdk/metasecml; commerce/passport/tnc sao os consumidores (tnc-sg.capcutapi.com, tnc16-alisg.isnssdk.com). CefCreator.dll/VECreator.dll/VEHelper.exe tambem carregam mssdk-sg.* (mssdk-sg.byteoversea.com, mssdk-sg.capcutapi.com, mssdk-v2-boot.capcutapi.com).
* Transporte: sscronet.dll (Cronet/QUIC/HTTP3) e o stack de rede principal — 338 ocorrencias em VECreator.dll, 229 em DeepAgentsService.dll, tambem em CefCreator.dll, audioeffect.dll, lynx.dll, metasecml.dll. A cadeia e sscronet -> ttnet -> frontier (frontier = edge WS). ttnet-sg.byteoversea.com aparece em 7 binarios; frontier-va.byteoversea.com em VECreator.dll (113x) e ttnet_frontier_addon.node (31x).

> PASSOS 3.1: Documentar mecanismo de autenticacao -> concluido em estatico. Detalhe do esquema de assinatura (headers, nonce, payload canonico) so com engenharia do metasecml.dll/trafego (Fase 4).

---

## 3) Midia — upload / download

Nao ha um unico /upload documentado nos paths estaticos — o upload e via SDK TOS (ByteDance Object Storage):

* uploader-oversea-2.1.11.js (app/commonagent/vendor) + BytedUploader expoem Blob/FileReader/FormData (analise/fase2/raw/bootstrap_ui/js_bridge_scan.json).
* Hosts TOS/CDN: lf16-beecdn.ibytedtos.com, lf16-capcut.faceulv.com, sf16-sg.tiktokcdn.com, sf16-va.tiktokcdn.com, sf16-web-tos-buz.capcutstatic.com, imagex-ap-singapore-1.bytevcloudapi.com, vod-ap-singapore-1.bytevcloudapi.com (e variantes *-us-east-1). DLLs ever_cloud_sdk.dll (9 MB) e res_pool.dll (9 MB) sao o lado nativo.
* Endpoints indiretos: cloudspace-normal.capcutapi.com (drive) e i18n-api.faceueditor.com/artist/v1/upload/data.

Download de assets segue o mesmo TOS + imagex/vod + capcutstatic.com. Sem trafego, os paths exatos de PUT/GET do objeto nao sao recuperaveis — ficam para MITM.

> PASSOS 3.1: Mapear APIs de upload/download de midia -> parcial em estatico (familia identificada, hosts TOS confirmados, paths exatos pendentes de runtime).

---

## 4) Efeitos / templates / stickers (cloud assets)

* Familias editoriais: editor-api.* (/lv/v1/custom_service/get_entrance*, /lv/v2/, /agent_edit_api/query_skills) e feed-api.* (/lv/v1/ad_maker/digital_human/*, /lv/v1/pc/replicate/get_collections, /lv/v1/music_beat, /lv/v2/music_beat).
* Comercio (gate de assets pagos): /commerce/v1/subscription/*, /commerce/v1/benefits/*, /commerce/v1/purchase/*, /lv/v1/commerce/get_entrances, services-Bqx5Pz17.js (ICommercialBenefitService).
* AIGC catalog: heycan-api.capcutapi.com/artist/v1/aigc_effect/user_aigc_list, alem de aigc/task e aigc_text_template em VECreator.dll/Resources.
* Recursos locais espelham o catalogo remoto: Resources/CloudMaterial, Resources/template_sticker, Resources/aigc_text_template, Resources/lynx_config.

> PASSOS 3.1: Mapear APIs de efeitos/templates/stickers -> parcial em estatico (hosts e familias confirmados, catalogo completo exige crawling autenticado).

---

## 5) Exportacao e watermark

* Flags de exportacao: em App-DpNZSMvJ.js ha downloadWithoutWatermark / downloadWithWatermark (pc_omni_agent_export_without_watermark / with_watermark) e commercial_strategy_v2 / material_user_assets / credit_strategy — a permissao de export sem marca e um beneficio comercial (/commerce/v1/benefits/*).
* Invisible watermark: modelo local Resources/models/invisible_watermark/ + 6 ocorrencias em VECreator.dll e 3 em cccreator.dll / 2 em ttdaemon.exe; lado nativo em lens/pipeline TE (Fase 2).
* C2PA: tt_c2pa_sdk.dll (8 MB). Em VECreator.dll ha 37 ocorrencias C2PA/c2pa e namespaces XMP http://ns.adobe.com/*, http://ns.adobe.com/creatorAtom/1.0/ etc., indicando proveniencia C2PA embarcada no export.

> PASSOS 3.1: Mapear APIs de exportacao e watermark + 3.2: investigar invisible_watermark / C2PA -> concluido em estatico (mecanismo identificado, detalhe do payload C2PA/invisible requer amostra exportada).

---

## 6) Geracao de video/imagem por IA (cloud)

Catalogo ja extraido na Fase 1 (bundle 
