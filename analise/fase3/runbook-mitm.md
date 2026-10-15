# Runbook MITM — CapCut v9.6.0.4097 (Fase 3.1)

> Objetivo: capturar tráfego real do CapCut para confirmar host ativo por região,
> paths exatos de upload TOS e esquema de assinatura MSSDK.
> Pré-requisito: análise estática concluída (`analise/fase3/RELATORIO.md` §1).

## 1. Ferramenta instalada

- mitmproxy 12.2.3 (`C:\Program Files\mitmproxy\bin\mitmdump.exe`), Python 3.14.4, Windows 11.
- Nenhum proxy em modo transparente configurado ainda; usar modo proxy regular + bloqueio de QUIC.

## 2. Por que MITM no CapCut é difícil (achados estáticos)

1. **sscronet.dll (Cronet/QUIC/HTTP3)** é o stack principal (338 ocorrências em VECreator.dll,
   229 em DeepAgentsService.dll). QUIC roda sobre UDP e **ignora proxy HTTP do sistema**.
2. **ttnet → frontier** (edge WS `wss://frontier-va.byteoversea.com/ws/v2`) também pode
   fugir do proxy.
3. **MSSDK/metasecml.dll** assina requisições (commerce/passport/tnc); pode haver
   certificate pinning — esperar falhas TLS em `mssdk-sg.*` e `tnc-*` mesmo com CA instalada.
4. CEF/Chromium (PlatinumWebView, CEF 121) **respeita proxy do sistema** — login
   (`lvpc_web/*`), OAuth e `www.capcut.com/*` são os fluxos mais fáceis de capturar.

## 3. Preparação

```powershell
# 1. Gerar e instalar a CA do mitmproxy (uma vez)
& "C:\Program Files\mitmproxy\bin\mitmdump.exe"  # Ctrl+C após subir; gera ~/.mitmproxy/mitmproxy-ca-cert.cer
certutil -addstore -user root "$env:USERPROFILE\.mitmproxy\mitmproxy-ca-cert.cer"

# 2. Bloquear QUIC/UDP-443 para forçar fallback TCP/TLS (interceptável).
#    Regra temporária — remover após a captura:
New-NetFirewallRule -DisplayName "MITM-CapCut-block-QUIC" -Direction Outbound `
  -Protocol UDP -RemotePort 443 -Action Block

# 3. Excluir tráfego local do Bun (5174/5175) do filtro — ver §5.
```

## 4. Captura

```powershell
cd D:\0000000-PROJETOS\leccorCut02\analise\fase3\raw
& "C:\Program Files\mitmproxy\bin\mitmdump.exe" `
  -p 8080 `
  -w capcut-9.6.0.4097-$(Get-Date -Format yyyyMMdd-HHmm).mitm `
  -s ..\..\scripts\mitm_capcut.py `
  --set block_global=false `
  --ignore-hosts '^(127\.0\.0\.1|localhost)(:.*)?$'
```

Configurar proxy do sistema (ou só do launcher) para `127.0.0.1:8080`, depois
executar o CapCut e seguir o roteiro do §5. Ao final, desfazer:

```powershell
Remove-NetFirewallRule -DisplayName "MITM-CapCut-block-QUIC"
# remover proxy do sistema
```

## 5. Roteiro de ações no CapCut (um fluxo por família)

| # | Ação | Família/host esperado |
|---|------|----------------------|
| 1 | Abrir app frio, aguardar home | `gecko-*` (config), `mon-*` (telemetria), `mssdk-sg.*` |
| 2 | Login via QR (`passport16-normal-us-ttp.../check_qrconnect/`) | `passport-api.*`, `www.capcut.com/lvpc_web/*` |
| 3 | Abrir feed/templates, buscar música | `feed-api.*` (`/lv/v1/music_beat`, `/lv/v1/pc/replicate/get_collections`) |
| 4 | Criar draft, listar efeitos | `editor-api.*` (`/lv/v1/custom_service/get_entrance`, `/agent_edit_api/query_skills`) |
| 5 | Abrir loja/benefícios | `commerce-api.*`, `services-Bqx5Pz17.js` (fixo `commerce-api-sg.capcut.com`) |
| 6 | Gerar efeito IA (heycan) | `heycan-api.*` (`/artist/v1/aigc_effect/user_aigc_list`), `aidp-i18ntt-sg.tiktok-row.net` |
| 7 | Importar mídia p/ timeline (upload) | `*.ibytedtos.com`, `imagex-*/vod-*bytevcloudapi.com`, `i18n-api.faceueditor.com/artist/v1/upload/data` |
| 8 | Exportar com/sem watermark | flags `downloadWithoutWatermark`, `commercial_strategy_v2`; C2PA/invisible locais |
| 9 | Fechar app | `mon-*/pc-mon-*` flush final |

Manter cada passo em janela de ~2 min com pausa, para correlacionar timestamp × fluxo.

## 6. Pós-processamento

```powershell
# Extrair endpoints por host do .mitm salvo
& "C:\Program Files\mitmproxy\bin\mitmdump.exe" -nr <arquivo.mitm> -s ..\..\scripts\mitm_capcut.py --set mitm_capcut_dump_json=1
```

O addon (`analise/scripts/mitm_capcut.py`) já filtra os 38 hosts CapCut de
`dominios_agregado.txt` e grava `endpoints_mitm_por_host.json` — comparar com
`endpoints_por_host.json` (estático) para fechar os itens 3.1 pendentes.

## 7. Resultado esperado vs. fallback

- **Sucesso**: hosts ativos por região confirmados, paths PUT/GET TOS e headers
  de assinatura MSSDK documentados → alimenta itens autenticação, upload/download,
  efeitos, exportação, geração IA e licença.
- **Falha parcial (pinning/QUIC)**: documentar quais hosts falharam TLS e seguir
  para Fase 4 (hooks Frida em `sscronet.dll` + `metasecml.dll`).
