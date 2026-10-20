"""Atualiza uma instalação existente sem expor a chave nem substituir as horas."""
import ast
import json
import os
from pathlib import Path
import shutil
from datetime import datetime

target = Path.home()/".davinci_tracker"
source = Path(__file__).parent
stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = target/("backup-"+stamp)
backup.mkdir(mode=0o700)
for name in ("tracker.py", "tracking.py", "config.json", "tracking_state.json"):
    path = target/name
    if path.exists():
        shutil.copy2(path, backup/name)
        (backup/name).chmod(0o600)
config = target/"config.json"
if not config.exists():
    values = {}
    for node in ast.parse((target/"tracker.py").read_text()).body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id in ("SUPABASE_URL", "SUPABASE_KEY", "MY_USER_ID"):
            values[node.targets[0].id] = ast.literal_eval(node.value)
    if len(values) != 3:
        raise RuntimeError("Configuração existente não encontrada; instalação preservada")
    fd = os.open(config, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd,"w") as f: json.dump(values,f)
for name in ("tracking.py", "tracker.py"):
    temporary = target/(name+".new")
    shutil.copy2(source/name, temporary)
    temporary.chmod(0o600)
    os.replace(temporary,target/name)
print("Auxiliar atualizado; histórico preservado. Backup:", backup)
