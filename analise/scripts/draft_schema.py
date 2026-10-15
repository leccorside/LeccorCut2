"""Fase 2.3 — infere o esquema do draft do CapCut a partir de projetos reais.

Uso: python draft_schema.py <pasta_com.lveditor.draft> <saida_dir>
Percorre todos os draft_content.json (+ draft_meta_info.json, attachment_*.json, project.json),
une os esquemas e grava <saida_dir>/draft_schema.json e um resumo.
Privacidade: strings livres (caminhos, nomes, textos, ids) NUNCA são gravadas; só tipos,
contagens e valores curtos de campos que se comportam como enum (poucos valores distintos).
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

UUID_RE = re.compile(r'^[0-9A-Fa-f-]{32,36}$')
ENUM_MAX = 12          # campos string com até N valores distintos são tratados como enum
ENUM_LEN = 40          # e cada valor com no máximo N caracteres


class Schema:
    def __init__(self):
        self.types = defaultdict(Counter)       # caminho -> tipos
        self.strings = defaultdict(Counter)     # caminho -> valores (candidatos a enum)
        self.numbers = {}                        # caminho -> (min, max)
        self.list_len = defaultdict(list)

    def walk(self, o, path):
        t = type(o).__name__
        self.types[path][t] += 1
        if isinstance(o, dict):
            for k, v in o.items():
                self.walk(v, f'{path}.{k}')
        elif isinstance(o, list):
            self.list_len[path].append(len(o))
            for v in o:
                self.walk(v, f'{path}[]')
        elif isinstance(o, str):
            if o and len(o) <= ENUM_LEN and not UUID_RE.match(o) and '/' not in o and '\\' not in o:
                self.strings[path][o] += 1
            elif UUID_RE.match(o):
                self.strings[path]['<uuid>'] += 1
            elif o:
                self.strings[path]['<texto/caminho>'] += 1
        elif isinstance(o, (int, float)) and not isinstance(o, bool):
            lo, hi = self.numbers.get(path, (o, o))
            self.numbers[path] = (min(lo, o), max(hi, o))

    def export(self):
        out = {}
        for path, types in sorted(self.types.items()):
            e = {'tipos': dict(types)}
            vals = self.strings.get(path)
            if vals:
                real = [v for v in vals if not v.startswith('<')]
                if 0 < len(real) <= ENUM_MAX and len(vals) <= ENUM_MAX + 2:
                    e['enum'] = dict(vals.most_common())
                else:
                    e['strings'] = {'distintos': len(vals)} | {k: v for k, v in vals.items() if k.startswith('<')}
            if path in self.numbers:
                e['faixa'] = list(self.numbers[path])
            if path in self.list_len:
                ls = self.list_len[path]
                e['tamanho_lista'] = [min(ls), max(ls)]
            out[path] = e
        return out


def main(root, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    groups = defaultdict(Schema)
    files = Counter()
    versions = Counter()
    for dirpath, _, fnames in os.walk(root):
        for fn in fnames:
            if not fn.endswith('.json') and fn != 'draft_settings':
                continue
            if fn.endswith('.bak'):
                continue
            key = 'Timelines/' + fn if os.sep + 'Timelines' in dirpath else fn
            if 'common_attachment' in dirpath:
                key = 'common_attachment/' + fn
            files[key] += 1
            try:
                data = json.load(open(os.path.join(dirpath, fn), encoding='utf-8'))
            except Exception:
                groups[key].types['$']['<nao-json>'] += 1
                continue
            if fn == 'draft_content.json':
                versions[(data.get('version'), data.get('new_version'))] += 1
            groups[key].walk(data, '$')
    result = {
        'arquivos_por_tipo': dict(files.most_common()),
        'versoes_draft_content': {f'{v}|{nv}': n for (v, nv), n in versions.items()},
        'esquemas': {k: s.export() for k, s in sorted(groups.items())},
    }
    with open(os.path.join(out_dir, 'draft_schema.json'), 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=1, ensure_ascii=False)
    print('arquivos:', dict(files.most_common()))
    print('versoes:', result['versoes_draft_content'])
    for k, s in result['esquemas'].items():
        print(f'{k}: {len(s)} caminhos')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
