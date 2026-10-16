"""Regressão local: cria e encerra um PostgreSQL descartável, sem conexão remota.

Uso: PG_BINDIR=/caminho/postgresql/bin python3 supabase/tests/revisao_interna/run.py
"""
import os
from pathlib import Path
import subprocess
import tempfile

repo = Path(__file__).resolve().parents[3]
pg = Path(os.environ.get("PG_BINDIR", "/opt/homebrew/opt/postgresql@15/bin"))


def run(*args):
    result = subprocess.run([str(arg) for arg in args], text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError(result.stdout)
    return result.stdout


with tempfile.TemporaryDirectory(prefix="adverse-review-test-") as directory:
    base = Path(directory)
    data, sock = base / "data", base / "sock"
    sock.mkdir()
    started = False
    try:
        run(pg / "initdb", "-D", data, "-A", "trust", "--no-locale", "-E", "UTF8")
        run(pg / "pg_ctl", "-D", data, "-l", base / "postgres.log", "-o",
            f"-k {sock} -p 55439 -c listen_addresses=''", "-w", "start")
        started = True
        run(pg / "createdb", "-h", sock, "-p", "55439", "adverse_review_test")
        psql = [pg / "psql", "-X", "-h", sock, "-p", "55439", "-d",
                "adverse_review_test", "-v", "ON_ERROR_STOP=1"]
        run(*psql, "-f", repo / "supabase/tests/revisao_interna/schema.sql")
        # Usa o resolver real já instalado em produção, não uma simulação dele.
        source = (repo / "supabase/migrations/20260728190000_notif_resolve_sozinha.sql").read_text()
        start = source.index("CREATE OR REPLACE FUNCTION public.tg_notif_resolver_entregavel()")
        end = source.index("-- ---- Alteração do cliente:", start)
        resolver = base / "resolver.sql"
        resolver.write_text(source[start:end])
        run(*psql, "-f", resolver)
        run(*psql, "-f", repo / "supabase/migrations/20261016110000_reenvio_revisao_interna.sql")
        print(run(*psql, "-f", repo / "supabase/tests/revisao_interna/check.sql"))
    finally:
        if started:
            run(pg / "pg_ctl", "-D", data, "-m", "fast", "-w", "stop")
