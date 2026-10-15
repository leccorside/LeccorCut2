"""Fase 1.1 — extrai tabelas de imports (normais + delay-load) e exports de binários PE.

Uso: python pe_dump.py <saida_dir> <binario> [<binario> ...]
Gera, por binário: raw/<nome>.imports.json, raw/<nome>.exports.txt e um resumo em <saida_dir>/pe_resumo.json.
"""
import json
import os
import re
import sys
from collections import Counter

import pefile


def msvc_scope(name):
    """'?func@Class@ns@@QEAA...' -> 'ns::Class::func' (aproximação, suficiente para agrupar)."""
    if not name.startswith('?'):
        return name
    m = re.match(r'\?+([^@]+)@((?:[^@]+@)*)@', name)
    if not m:
        return name
    parts = [p for p in m.group(2).split('@') if p]
    return '::'.join(list(reversed(parts)) + [m.group(1)])


def dump(path, out_raw):
    pe = pefile.PE(path, fast_load=True)
    pe.parse_data_directories(directories=[
        pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_IMPORT'],
        pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_EXPORT'],
        pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_DELAY_IMPORT'],
    ])
    name = os.path.basename(path)
    imports = {}
    for kind, attr in (('normal', 'DIRECTORY_ENTRY_IMPORT'), ('delay', 'DIRECTORY_ENTRY_DELAY_IMPORT')):
        for entry in getattr(pe, attr, []):
            dll = entry.dll.decode(errors='replace')
            funcs = [(i.name.decode(errors='replace') if i.name else f'#ordinal_{i.ordinal}') for i in entry.imports]
            imports.setdefault(dll, {'tipo': kind, 'funcoes': []})['funcoes'].extend(funcs)
    exports = []
    if hasattr(pe, 'DIRECTORY_ENTRY_EXPORT'):
        for s in pe.DIRECTORY_ENTRY_EXPORT.symbols:
            exports.append(s.name.decode(errors='replace') if s.name else f'#ordinal_{s.ordinal}')

    with open(os.path.join(out_raw, f'{name}.imports.json'), 'w', encoding='utf-8') as f:
        json.dump(imports, f, indent=1, ensure_ascii=False)
    with open(os.path.join(out_raw, f'{name}.exports.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(f'{e}\t{msvc_scope(e)}' for e in exports))

    scopes = Counter()
    for e in exports:
        s = msvc_scope(e).split('::')
        scopes['::'.join(s[:-1]) if len(s) > 1 else '(C / global)'] += 1
    return {
        'arquivo': name,
        'tamanho': os.path.getsize(path),
        'maquina': hex(pe.FILE_HEADER.Machine),
        'timestamp_pe': pe.FILE_HEADER.TimeDateStamp,
        'secoes': [(s.Name.rstrip(b'\0').decode(errors='replace'), s.SizeOfRawData) for s in pe.sections],
        'dlls_importadas': len(imports),
        'funcoes_importadas': sum(len(v['funcoes']) for v in imports.values()),
        'imports_por_dll': {k: {'tipo': v['tipo'], 'qtd': len(v['funcoes'])} for k, v in sorted(imports.items(), key=lambda kv: -len(kv[1]['funcoes']))},
        'exports': len(exports),
        'exports_top_escopos': scopes.most_common(40),
        'exports_amostra': exports[:60],
    }


if __name__ == '__main__':
    out = sys.argv[1]
    raw = os.path.join(out, 'raw')
    os.makedirs(raw, exist_ok=True)
    resumo = []
    for p in sys.argv[2:]:
        r = dump(p, raw)
        resumo.append(r)
        print(f"{r['arquivo']}: {r['dlls_importadas']} DLLs / {r['funcoes_importadas']} funções importadas, {r['exports']} exports")
    with open(os.path.join(out, 'pe_resumo.json'), 'w', encoding='utf-8') as f:
        json.dump(resumo, f, indent=1, ensure_ascii=False)
