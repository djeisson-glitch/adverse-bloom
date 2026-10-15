"""Conector de pastas ADVERSE. Somente diretórios; nunca remove ou sobrescreve arquivos."""
import argparse
import json
from pathlib import Path
import re
import stat
import subprocess
import unicodedata
import urllib.request
import uuid

MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']


def normalized(value):
    return unicodedata.normalize('NFC', value).casefold()


def client_key(value):
    return normalized(re.sub(r'^\d+\.\s*', '', value))


def segment(value):
    if not isinstance(value, str) or not value or len(value) > 150:
        raise ValueError('Nome de pasta inválido')
    if value in ('.', '..') or value[-1] in ' .' or re.search(r'[\\/:*?"<>|\x00-\x1f]', value):
        raise ValueError('Nome de pasta inválido')
    if re.match(r'^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)', value, re.I):
        raise ValueError('Nome reservado pelo Windows')
    return value


def regular(path):
    # Também bloqueia junctions/reparse points do Windows, além de links Unix.
    try:
        info = path.lstat()
    except FileNotFoundError:
        return
    if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
        raise ValueError('A estrutura contém um atalho ou link; confira a pasta no servidor')
    if not stat.S_ISDIR(info.st_mode):
        raise ValueError('Existe um arquivo no lugar de uma das pastas')


def lookup(parent, name, key=normalized):
    segment(name)
    regular(parent)
    if not parent.exists():
        return parent / name
    matches = [p for p in parent.iterdir() if key(p.name) == key(name)]
    if len(matches) > 1:
        raise ValueError('Mais de uma pasta corresponde ao mesmo nome; confira antes de criar')
    result = matches[0] if matches else parent / name
    regular(result)
    return result


def model_tree(template):
    regular(template)
    if not template.is_dir():
        raise ValueError('Pasta Estrutura de pastas não encontrada')
    result = []
    def visit(directory, relative=()):
        if len(relative) > 10:
            raise ValueError('Modelo excede dez níveis de subpastas')
        for entry in sorted(directory.iterdir()):
            if entry.name.startswith('.'):
                continue
            # Nunca seguir atalhos nem copiar arquivos do modelo.
            if entry.is_symlink() or getattr(entry.lstat(), 'st_file_attributes', 0) & 0x400:
                raise ValueError('O modelo contém um atalho ou link')
            if entry.is_dir():
                segment(entry.name)
                parts = relative + (entry.name,)
                result.append(parts)
                if len(result) > 500:
                    raise ValueError('Modelo excede 500 pastas')
                visit(entry, parts)
    visit(template)
    if not result:
        raise ValueError('O modelo não contém subpastas')
    return result


def build_plan(root, template, job):
    root = Path(root)
    regular(root)
    if not root.is_dir():
        raise ValueError('Servidor indisponível: pasta raiz não encontrada')
    uuid.UUID(job['project_id'])
    year, month = int(job['year']), int(job['month'])
    if not 2000 <= year <= 2200 or not 1 <= month <= 12:
        raise ValueError('Ano ou mês inválido')
    number = str(job['number'])
    if not re.fullmatch(r'\d{4,8}', number):
        raise ValueError('Número de projeto inválido')
    name = segment(job['project_name'])
    if not name.startswith('[' + number + ']'):
        raise ValueError('Nome não corresponde ao número do projeto')
    client = segment(job['client_folder'])
    structure = model_tree(Path(template))
    year_dir = lookup(root, f'_. Database {year}')
    projects = lookup(year_dir, '01. Clientes - Projetos')
    month_dir = lookup(projects, f'{month:02}. {MONTHS[month-1]}')
    client_dir = lookup(month_dir, client, client_key)
    desired = lookup(client_dir, name)
    # Um número existente em qualquer ano/mês/cliente é reaproveitado somente
    # no destino escolhido. Em outro destino, pedir revisão evita duplicação.
    found = []
    for yr in root.iterdir():
        if not re.fullmatch(r'_\. Database \d{4}', yr.name):
            continue
        regular(yr)
        collection = lookup(yr, '01. Clientes - Projetos')
        if not collection.exists():
            continue
        for mo in collection.iterdir():
            if not re.match(r'^\d{2}\. ', mo.name) or not mo.is_dir():
                continue
            regular(mo)
            for cl in mo.iterdir():
                if cl.name.startswith('.') or not cl.is_dir():
                    continue
                regular(cl)
                for pr in cl.iterdir():
                    if re.match(r'^\[' + re.escape(number) + r'\](?:[ _]|$)', pr.name):
                        regular(pr)
                        found.append(pr)
    if len(found) > 1:
        raise ValueError('Este número já aparece em mais de uma pasta; confira o servidor')
    if found:
        existing = found[0]
        if existing.parent != client_dir:
            raise ValueError('Este projeto já existe em outro mês ou cliente: ' + str(existing.relative_to(root)))
        desired = existing  # Preserva nome histórico, incluindo espaços e acentos.
    plan = [year_dir, projects, month_dir, client_dir, desired]
    for parts in structure:
        target = desired
        for part in parts:
            target = lookup(target, part)
        plan.append(target)
    # Validar TODOS os componentes antes da primeira criação.
    for target in plan:
        target.relative_to(root)
        regular(target)
    return desired, plan


def create_folders(root, template, job, apply=False):
    destination, plan = build_plan(root, template, job)
    missing = [path for path in plan if not path.exists()]
    if apply:
        for path in plan:
            # Revalida os pais para evitar seguir junctions introduzidos durante a execução.
            for parent in reversed(path.parents):
                if parent == Path(root) or Path(root) in parent.parents:
                    regular(parent)
            regular(path)
            path.mkdir(exist_ok=True)
    return {'relative_path': destination.relative_to(Path(root)).as_posix(), 'created': len(missing) if apply else 0, 'missing': len(missing)}


def rpc(config, function, data):
    url = config['url'].rstrip('/')
    if not re.fullmatch(r'https://[a-z0-9]+\.supabase\.co', url):
        raise ValueError('Endereço do Adverse OS inválido')
    request = urllib.request.Request(url + '/rest/v1/rpc/' + function,
        data=json.dumps(data).encode(), headers={'apikey': config['public_key'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def server_root(config):
    # Resolve o compartilhamento pelo nome: o diretório físico pode ter outro nome.
    result = subprocess.run([
        'powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
        "(Get-SmbShare -Name 'PROJETOS_ATIVOS' -ErrorAction Stop).Path | ConvertTo-Json -Compress",
    ], check=True, capture_output=True, encoding='utf-8-sig', timeout=30)
    value = json.loads(result.stdout)
    if not isinstance(value, str) or not value:
        raise ValueError('Compartilhamento PROJETOS_ATIVOS não encontrado')
    root = Path(value)
    if not root.is_absolute() or value.startswith('\\\\') or root != Path(config['root']):
        raise ValueError('O destino de PROJETOS_ATIVOS mudou; reinstale o conector')
    for parent in reversed((root, *root.parents)):
        regular(parent)
    if not root.is_dir():
        raise ValueError('PROJETOS_ATIVOS indisponível')
    return root


def run(config):
    # Sem servidor/modelo, não retira pedidos da fila. Serão atendidos quando voltar.
    root = server_root(config)
    model_tree(Path(config['template']))
    job = rpc(config, 'pastas_buscar_pedido', {'_token': config['token']})
    if not job:
        return
    result, error = None, None
    try:
        result = create_folders(root, config['template'], job['payload'], apply=True)
    except (OSError, ValueError, KeyError) as exc:
        # Apenas erros locais de estrutura; nunca registrar token ou resposta de autenticação.
        error = str(exc)[:500]
    rpc(config, 'pastas_concluir', {'_token': config['token'], '_project_id': job['payload']['project_id'],
        '_lease_id': job['lease_id'], '_path': result['relative_path'] if result else None, '_error': error})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    try:
        run(json.loads(Path(args.config).read_text(encoding='utf-8-sig')))
    except Exception:
        # O Agendador repete; nada de credenciais nos logs do Windows.
        raise SystemExit('Conector indisponível. Confira rede, configuração e permissões; nova tentativa em um minuto.')
