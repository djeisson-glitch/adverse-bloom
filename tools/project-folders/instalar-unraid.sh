#!/bin/bash
# Instala exclusivamente o conector de pastas. Não altera shares nem arquivos de projetos.
set -euo pipefail
umask 077
[[ $EUID -eq 0 && -f /etc/unraid-version ]] || { echo 'Execute no terminal do servidor Unraid.'; exit 1; }
command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo 'Ative o Docker no Unraid primeiro.'; exit 1; }
root='/mnt/user/PROJETOS_ATIVOS'
app='/mnt/user/appdata/adverse-pastas'
name='adverse-pastas'
image='python:3.13-slim'
bundle="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$bundle/worker.py" && -f "$bundle/prepare_unraid.py" ]] || { echo 'Extraia o pacote completo antes de instalar.'; exit 1; }
mountpoint -q /mnt/user || { echo 'Inicie o array do Unraid primeiro.'; exit 1; }
[[ -d "$root" && ! -L "$root" && -d /mnt/user/appdata ]] || { echo 'Confira os shares PROJETOS_ATIVOS e appdata.'; exit 1; }
[[ ! -L "$app" ]] || { echo 'O destino da configuração é um link. Instalação interrompida.'; exit 1; }
if docker container inspect "$name" >/dev/null 2>&1; then
  echo 'O conector já está instalado. Use Docker > adverse-pastas > Logs para conferir. Nenhum contêiner foi alterado.'
  exit 1
fi
if [[ -e "$app/config.json" ]]; then
  echo 'Já existe uma configuração salva. Preserve-a e peça orientação para reinstalar.'
  exit 1
fi
uid="$(id -u nobody)"
gid="$(getent group users | cut -d: -f3)"
[[ "$uid" =~ ^[0-9]+$ && "$gid" =~ ^[0-9]+$ && "$uid" != 0 ]] || { echo 'Usuário nobody/grupo users indisponível.'; exit 1; }
printf 'Destino: %s\n' "$root"
read -r -p 'Modelo dentro de PROJETOS_ATIVOS [_. Database 2026/Estrutura de pastas]: ' model
model="${model:-_. Database 2026/Estrutura de pastas}"
[[ -d "$root/$model" ]] || { echo 'Pasta modelo não encontrada. Nenhum projeto foi alterado.'; exit 1; }
echo 'Baixando o Python oficial para o conector...'
docker pull "$image"
stage="$(mktemp -d /tmp/adverse-pastas.XXXXXX)"
echo_state=''
cleanup() {
  [[ -z "$echo_state" ]] || stty "$echo_state" </dev/tty
  rm -rf -- "$stage"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
read -r -p 'Caminho do JSON no NAS (ou Enter para colar o conteúdo): ' source_file
if [[ -n "$source_file" ]]; then
  [[ -f "$source_file" ]] || { echo 'Arquivo JSON não encontrado.'; exit 1; }
  cp -- "$source_file" "$stage/source.json"
else
  echo 'Cole o conteúdo completo do JSON. Depois pressione Enter em uma linha vazia. A chave ficará oculta.'
  echo_state="$(stty -g </dev/tty)"
  stty -echo </dev/tty
  while IFS= read -r line; do
    [[ -n "$line" ]] || break
    printf '%s\n' "$line" >> "$stage/source.json"
  done
  stty "$echo_state" </dev/tty
  echo_state=''
  printf '\n'
fi
[[ -s "$stage/source.json" ]] || { echo 'Configuração não informada.'; exit 1; }
chmod 600 "$stage/source.json"
chown "$uid:$gid" "$stage" "$stage/source.json"
base=(--read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 128m --cpus 0.25 --user "$uid:$gid" --env PYTHONDONTWRITEBYTECODE=1 --env PYTHONUNBUFFERED=1)
docker run --rm --network none "${base[@]}" \
  --mount "type=bind,src=$stage,dst=/setup" \
  --mount "type=bind,src=$bundle/prepare_unraid.py,dst=/prepare.py,readonly" \
  "$image" python /prepare.py /setup/source.json /setup/config.json "$model"
# Verifica permissões e modelo sem consumir a fila nem criar pastas.
docker run --rm --network none "${base[@]}" \
  --mount "type=bind,src=$stage/config.json,dst=/config.json,readonly" \
  --mount "type=bind,src=$bundle/worker.py,dst=/worker.py,readonly" \
  --mount "type=bind,src=$root,dst=/projects/PROJETOS_ATIVOS" \
  "$image" python /worker.py --config /config.json --check
install -d -m 750 -o root -g "$gid" "$app"
install -m 644 -o root -g root "$bundle/worker.py" "$app/worker.py"
install -m 400 -o "$uid" -g "$gid" "$stage/config.json" "$app/config.json"
docker run -d --name "$name" --restart unless-stopped --network bridge "${base[@]}" \
  --label net.unraid.docker.managed=dockerman \
  --log-opt max-size=1m --log-opt max-file=2 \
  --mount "type=bind,src=$app/worker.py,dst=/worker.py,readonly" \
  --mount "type=bind,src=$app/config.json,dst=/config.json,readonly" \
  --mount "type=bind,src=$root,dst=/projects/PROJETOS_ATIVOS" \
  "$image" python /worker.py --config /config.json --loop
printf '\nConector instalado.\nNo Unraid: Docker > adverse-pastas > ative Auto-Start.\nNo Adverse OS: confira Servidor conectado antes de solicitar as pastas.\nSe não conectar: Docker > adverse-pastas > Logs.\n'
