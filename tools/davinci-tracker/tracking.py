"""Contextos imutáveis para não misturar edição e rodadas de alteração."""
EDITABLE = {"pendente", "pronto_editar", "em_pausa", "em_edicao", "ajuste_interno", "ajuste_solicitado"}

def work_context(deliverable, alterations):
    opened = [a for a in alterations if a["status"] == "aberta"]
    latest = max(opened, key=lambda a: (a.get("numero", 0), a.get("created_at", "")), default=None)
    if latest:
        return "alteracao_cliente", latest["id"], latest["id"]
    # Do not silently put a requested client change into original editing.
    if deliverable["status"] == "ajuste_solicitado":
        return None
    internal = deliverable["status"] == "ajuste_interno" or any(deliverable.get(k) for k in ("rev_n1_ajuste", "rev_n2_ajuste", "rev_ajuste_pendente"))
    cycle = str(deliverable.get("revisoes_internas") or 0)
    last_change = max(alterations, key=lambda a: (a.get("numero", 0), a.get("created_at", "")), default={})
    cycle += ":" + last_change.get("id", "original")
    return ("ajuste_interno" if internal else "edicao"), cycle, None

def context_key(day, code, stage, context):
    kind, cycle, _ = context
    return f"{day}:{code}:{stage}:{kind}:{cycle}"

def eligible_seconds(elapsed, idle):
    if elapsed < 0 or elapsed > 60:
        return 0
    return max(0, min(elapsed, 180 - idle + elapsed))

def entry_payload(session):
    payload = {k: session[k] for k in ("id", "user_id", "project_id", "deliverable_id", "start_at", "etapa")}
    payload.update(duration_min=int(session["seconds"] / 60), source="davinci", billable=True)
    # Old pending records retain their old classification. Never attach a new
    # alteration to cumulative hours that were recorded before that alteration.
    if "alteracao_id" in session:
        payload["alteracao_id"] = session["alteracao_id"]
    if session.get("natureza"):
        payload["description"] = {"edicao": "Edição · DaVinci", "ajuste_interno": "Ajuste interno · DaVinci", "alteracao_cliente": "Alteração do cliente · DaVinci"}[session["natureza"]]
    return payload
