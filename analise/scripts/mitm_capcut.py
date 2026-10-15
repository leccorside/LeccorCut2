"""Addon mitmdump p/ CapCut 9.6.0.4097 — Fase 3.1 (runbook-mitm.md).

Uso em captura:
    mitmdump -p 8080 -w out.mitm -s analise/scripts/mitm_capcut.py --ignore-hosts '^(127\\.0\\.0\\.1|localhost)(:.*)?$'

Uso em pós-processamento:
    mitmdump -nr out.mitm -s analise/scripts/mitm_capcut.py --set mitm_capcut_dump_json=1

Gera analise/fase3/raw/endpoints_mitm_por_host.json no formato do
endpoints_por_host.json (estático), só com hosts CapCut + TOS/CDN + frontier.
"""

import json
import os
from urllib.parse import urlsplit

from mitmproxy import ctx

SUFFIXES = (
    ".capcutapi.com", ".capcut.com", ".capcutapi.us", ".capcut.net",
    ".byteoversea.com", ".byteoversea.net", ".tiktok-row.net",
    ".isnssdk.com", ".tiktokcdn.com", ".ibytedtos.com",
    ".bytevcloudapi.com", ".faceueditor.com", ".faceulv.com",
    ".capcutstatic.com", ".tiktokapis.com",
)

seen: dict[str, set[str]] = {}


def _interesting(host: str) -> bool:
    return host.endswith(SUFFIXES)


def request(flow):
    if _interesting(urlsplit(flow.request.pretty_url).hostname or ""):
        host = urlsplit(flow.request.pretty_url).hostname
        seen.setdefault(host, set()).add(flow.request.path.split("?")[0])


def done():
    if not ctx.options.mitm_capcut_dump_json:
        return
    out = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..", "fase3", "raw", "endpoints_mitm_por_host.json",
    )
    with open(os.path.normpath(out), "w", encoding="utf-8") as fh:
        json.dump({h: sorted(p) for h, p in sorted(seen.items())}, fh,
                  ensure_ascii=False, indent=2)
    ctx.log.info("endpoints MITM gravados em %s (%d hosts)", out, len(seen))


def load(loader):
    loader.add_option(
        name="mitm_capcut_dump_json",
        typespec=bool,
        default=False,
        help="Grava endpoints_mitm_por_host.json ao final (modo -nr).",
    )
