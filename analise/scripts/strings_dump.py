"""Fase 1.2 — extrai strings ASCII e UTF-16LE de binários e agrupa por categoria.

Uso: python strings_dump.py <saida_dir> <binario> [<binario> ...]
Gera raw/<nome>.strings.<categoria>.txt (completo) e <saida_dir>/strings_resumo.json (contagens + amostras).
"""
import json
import os
import re
import sys
from collections import Counter

MIN = 6
ASCII_RE = re.compile(rb'[\x20-\x7e]{%d,}' % MIN)
UTF16_RE = re.compile(rb'(?:[\x20-\x7e]\x00){%d,}' % MIN)

CATS = [
    ('urls', re.compile(r'https?://[^\s"\'<>]+|wss?://[^\s"\'<>]+')),
    ('dominios', re.compile(r'\b(?:[a-z0-9-]+\.)+(?:com|net|org|cn|io|be|tv|app|us|sg)\b')),
    ('fontes_cpp', re.compile(r'[\w./\\:-]+\.(?:cpp|cc|cxx|c|h|hpp|mm)\b')),
    ('classes_rtti', re.compile(r'\.\?A[VUW][\w@?$<>]+@@')),
    ('recursos', re.compile(r'[\w./\\-]+\.(?:json|lua|model|bytenn|onnx|png|jpg|glsl|frag|vert|shader|cube|xml|bin|dat|ttf|otf|mp4|wav|zip|so|dll)\b', re.I)),
    ('flags_config', re.compile(r'^[a-z][a-z0-9]*(?:_[a-z0-9]+){2,}$')),
    ('mensagens', re.compile(r'(?:%[-+ #0]*\d*(?:\.\d+)?(?:l|ll|z|h)?[sdufxXpgc]|\{\}).*\s|\s.*(?:%[sdufxp]|\{\})|^(?:[A-Za-z][\w,.:()\'-]*\s){3,}')),
]


# Credenciais embutidas em URLs (ex.: ?ak=...) nunca vão para os arquivos gerados
SECRET_RE = re.compile(r'([?&](?:ak|sk|key|api_key|apikey|token|access_token|secret|client_secret)=)[^&\s"\'<>]+', re.I)


def extract(path):
    data = open(path, 'rb').read()
    out = set(m.group().decode('ascii') for m in ASCII_RE.finditer(data))
    out.update(m.group().decode('utf-16le') for m in UTF16_RE.finditer(data))
    return {SECRET_RE.sub(r'\1<REDACTED>', s) for s in out}


def classify(strings):
    cats = {name: set() for name, _ in CATS}
    for s in strings:
        st = s.strip()
        for name, rx in CATS:
            if name in ('flags_config', 'mensagens'):
                if rx.search(st):
                    cats[name].add(st)
            else:
                for m in rx.findall(st):
                    cats[name].add(m)
    return cats


def fontes_por_dir(fontes):
    c = Counter()
    for f in fontes:
        parts = re.split(r'[\\/]', f)
        c['/'.join(parts[-3:-1]) if len(parts) > 2 else '(raiz)'] += 1
    return c.most_common(40)


if __name__ == '__main__':
    out = sys.argv[1]
    raw = os.path.join(out, 'raw')
    os.makedirs(raw, exist_ok=True)
    resumo_path = os.path.join(out, 'strings_resumo.json')
    resumo = json.load(open(resumo_path, encoding='utf-8')) if os.path.exists(resumo_path) else {}
    for p in sys.argv[2:]:
        name = os.path.basename(p)
        strings = extract(p)
        cats = classify(strings)
        r = {'total_strings': len(strings), 'categorias': {}}
        for cname, vals in cats.items():
            vals = sorted(vals)
            with open(os.path.join(raw, f'{name}.strings.{cname}.txt'), 'w', encoding='utf-8') as f:
                f.write('\n'.join(vals))
            r['categorias'][cname] = len(vals)
        r['fontes_por_diretorio'] = fontes_por_dir(cats['fontes_cpp'])
        r['dominios'] = sorted(cats['dominios'])[:200]
        r['urls'] = sorted(cats['urls'])[:200]
        resumo[name] = r
        print(name, r['total_strings'], r['categorias'])
    with open(resumo_path, 'w', encoding='utf-8') as f:
        json.dump(resumo, f, indent=1, ensure_ascii=False)
