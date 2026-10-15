"""Prepara a configuração local sem imprimir chaves ou alterar o Adverse OS."""
import json
from pathlib import Path, PurePosixPath
import re
import sys


def prepare(source, template):
    if not isinstance(source, dict):
        raise ValueError('Configuração inválida')
    url, token, key = (source.get(k) for k in ('url', 'token', 'public_key'))
    if not isinstance(url, str) or not re.fullmatch(r'https://[a-z0-9]+\.supabase\.co', url):
        raise ValueError('Endereço inválido')
    if not isinstance(token, str) or not re.fullmatch(r'[a-f0-9]{64}', token):
        raise ValueError('Chave inválida')
    if not isinstance(key, str) or not key.strip() or len(key) > 4096:
        raise ValueError('Chave pública inválida')
    relative = PurePosixPath(template)
    if not template or relative.is_absolute() or '..' in relative.parts or '\\' in template:
        raise ValueError('Modelo fora de PROJETOS_ATIVOS')
    return {'url': url, 'token': token, 'public_key': key, 'platform': 'unraid',
            'root': '/projects/PROJETOS_ATIVOS',
            'template': str(PurePosixPath('/projects/PROJETOS_ATIVOS') / relative)}


if __name__ == '__main__':
    try:
        source = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
        config = prepare(source, sys.argv[3])
        dest = Path(sys.argv[2])
        dest.write_text(json.dumps(config, ensure_ascii=False, indent=2))
        dest.chmod(0o600)
        print('Configuração preparada.')
    except Exception:
        raise SystemExit('Configuração inválida. Use o JSON baixado no Adverse OS; não envie a chave no chat.')
