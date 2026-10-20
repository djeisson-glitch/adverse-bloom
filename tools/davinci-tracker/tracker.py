import sys, os, re, subprocess, time, json, uuid
from pathlib import Path
from datetime import datetime, timezone
import requests
import rumps
from tracking import EDITABLE, work_context, context_key, eligible_seconds, entry_payload

CONFIG = json.loads(Path(__file__).with_name("config.json").read_text())
SUPABASE_KEY = CONFIG["SUPABASE_KEY"]
SUPABASE_URL = CONFIG["SUPABASE_URL"]
MY_USER_ID = CONFIG["MY_USER_ID"]
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json"}
RESOLVE_SCRIPT_API = "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting"
RESOLVE_SCRIPT_LIB = "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so"
os.environ["RESOLVE_SCRIPT_API"] = RESOLVE_SCRIPT_API
os.environ["RESOLVE_SCRIPT_LIB"] = RESOLVE_SCRIPT_LIB
sys.path.append(os.path.join(RESOLVE_SCRIPT_API, "Modules"))

def get_idle_time():
    try:
        output = subprocess.check_output(["ioreg", "-c", "IOHIDSystem"], text=True)
        return int(re.search(r'"HIDIdleTime"\s*=\s*(\d+)', output).group(1)) / 1e9
    except Exception:
        return 0

class DaVinciTracker(rumps.App):
    def __init__(self):
        super().__init__("⏳ Iniciando...")
        self.resolve = None
        self.last_tick = time.monotonic()
        self.previous_context = None
        self.current_deliverable = None
        self.state_path = Path(__file__).with_name("tracking_state.json")
        self.sessions = json.loads(self.state_path.read_text()) if self.state_path.exists() else {}

    def save(self):
        temporary = self.state_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(self.sessions))
        os.replace(temporary, self.state_path)

    def sync(self):
        for key, session in self.sessions.items():
            minutes = int(session["seconds"] / 60)
            if minutes <= session.get("uploaded", 0):
                continue
            headers = dict(HEADERS, Prefer="resolution=merge-duplicates,return=minimal")
            response = requests.post(f"{SUPABASE_URL}/rest/v1/time_entries", params={"on_conflict": "id"}, json=entry_payload(session), headers=headers, timeout=8)
            response.raise_for_status()
            # Only the current work may start editing. The optimistic condition
            # preserves a review/approval that happened during the upload.
            d = self.current_deliverable
            if key == self.previous_context and d and d["status"] in EDITABLE and d["status"] != "em_edicao":
                response = requests.patch(f"{SUPABASE_URL}/rest/v1/deliverables", params={"id": "eq." + d["id"], "status": "eq." + d["status"], "updated_at": "eq." + d["updated_at"]}, json={"status": "em_edicao"}, headers=HEADERS, timeout=8)
                response.raise_for_status()
            session["uploaded"] = minutes
            self.save()

    def fetch_context(self, code):
        response = requests.get(f"{SUPABASE_URL}/rest/v1/deliverables", params={"codigo": f"eq.{code}", "select": "id,status,project_id,updated_at,rev_n1_ajuste,rev_n2_ajuste,rev_ajuste_pendente,revisoes_internas", "limit": "1"}, headers=HEADERS, timeout=8)
        response.raise_for_status()
        data = response.json()
        if not data or not data[0].get("project_id"):
            return None, None
        d = data[0]
        if d["status"] not in EDITABLE:
            return d, None
        response = requests.get(f"{SUPABASE_URL}/rest/v1/deliverable_alteracoes", params={"deliverable_id": "eq." + d["id"], "select": "id,numero,status,created_at", "order": "numero.desc"}, headers=HEADERS, timeout=8)
        response.raise_for_status()
        return d, work_context(d, response.json())

    def advance(self, key, d, context, stage, elapsed, idle, previous):
        if key not in self.sessions:
            self.sessions[key] = dict(id=str(uuid.uuid4()), user_id=MY_USER_ID, project_id=d["project_id"], deliverable_id=d["id"], start_at=datetime.now(timezone.utc).isoformat(), etapa=stage, natureza=context[0], alteracao_id=context[2], seconds=0, uploaded=0)
        # A changed timeline, stage or revision gets a new session; do not
        # reclassify the seconds from the previous context at the boundary.
        if key == previous:
            self.sessions[key]["seconds"] += eligible_seconds(elapsed, idle)
        self.previous_context = key
        self.current_deliverable = d
        self.save()

    @rumps.timer(10)
    def track(self, _):
        now = time.monotonic()
        elapsed = max(0, now - self.last_tick)
        self.last_tick = now
        previous = self.previous_context
        self.previous_context = None
        self.current_deliverable = None
        code = stage = None
        idle = 999
        try:
            import AppKit
            active_app = AppKit.NSWorkspace.sharedWorkspace().frontmostApplication().localizedName()
            idle = get_idle_time()
            if active_app != "DaVinci Resolve":
                self.title = "⏸️ 2º Plano"
            elif idle > 180:
                self.title = "⏸️ Ocioso"
            else:
                if not self.resolve:
                    import DaVinciResolveScript as dvr_script
                    self.resolve = dvr_script.scriptapp("Resolve")
                project = self.resolve.GetProjectManager().GetCurrentProject() if self.resolve else None
                timeline = project.GetCurrentTimeline() if project else None
                match = re.search(r"^\[(ADVR-\d+)\]", timeline.GetName().strip(), re.I) if timeline else None
                if not match:
                    self.title = "⏳ Sem timeline com código"
                else:
                    code = match.group(1).upper()
                    stage = {"edit": "edicao", "cut": "edicao", "color": "color", "fairlight": "audio", "deliver": "render", "fusion": "vfx"}.get(str(self.resolve.GetCurrentPage()).lower(), "edicao")
                    d, context = self.fetch_context(code)
                    if not d:
                        self.title = "⚠️ Cód ñ no banco"
                    elif d["status"] not in EDITABLE:
                        self.title = "⏸️ Em aprovação / concluído"
                    elif context is None:
                        self.title = "⚠️ Alteração sem pedido cadastrado"
                    else:
                        key = context_key(str(datetime.now().date()), code, stage, context)
                        self.advance(key, d, context, stage, elapsed, idle, previous)
                        label = "Edição" if context[0] == "edicao" else "Alteração" if context[0] == "alteracao_cliente" else "Ajuste interno"
                        self.title = f"🔴 [{code}] {label} · {int(self.sessions[key]['seconds'] / 60)}m"
            self.sync()
        except requests.RequestException:
            # Keep counting locally during an outage only when the timeline and
            # stage still match. Existing context stays immutable until online.
            if previous and code and previous.startswith(f"{datetime.now().date()}:{code}:{stage}:") and self.previous_context is None:
                self.sessions[previous]["seconds"] += eligible_seconds(elapsed, idle)
                self.previous_context = previous
                self.save()
            self.title = "⚠️ Horas salvas · envio pendente"
        except Exception:
            self.resolve = None
            self.title = "⏳ Aguardando DaVinci"

if __name__ == "__main__":
    import AppKit
    AppKit.NSBundle.mainBundle().infoDictionary()["LSUIElement"] = "1"
    DaVinciTracker().run()
