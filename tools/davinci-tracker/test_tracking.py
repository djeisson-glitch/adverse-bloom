import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch
from tracking import work_context, context_key, eligible_seconds, entry_payload

rumps = types.ModuleType("rumps")
rumps.App = object
rumps.timer = lambda _: lambda f: f
requests = types.ModuleType("requests")
requests.RequestException = RuntimeError
requests.get, requests.post, requests.patch = Mock(), Mock(), Mock()
spec = importlib.util.spec_from_file_location("tracker_test_module", Path(__file__).with_name("tracker.py"))
module = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"rumps": rumps, "requests": requests}), patch.object(Path, "read_text", return_value=json.dumps({"SUPABASE_URL":"https://example.test", "SUPABASE_KEY":"test", "MY_USER_ID":"editor"})):
    spec.loader.exec_module(module)

D = {"id":"d", "project_id":"p", "status":"em_edicao", "updated_at":"2026-10-19T12:00:00Z"}
def alt(id="a", status="aberta", numero=1):
    return {"id":id,"status":status,"numero":numero,"created_at":"2026-10-19T10:00:00Z"}
def response(data=None):
    r=Mock(); r.json.return_value=data; return r

class TrackingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.app = object.__new__(module.DaVinciTracker)
        self.app.sessions = {}
        self.app.previous_context = None
        self.app.current_deliverable = None
        self.app.state_path = Path(self.tmp.name)/"state.json"
        for m in (requests.get,requests.post,requests.patch):
            m.reset_mock(); m.side_effect=None; m.return_value=response()
    def advance(self, context, previous=None, d=None):
        k=context_key("2026-10-19","ADVR-1","edicao",context)
        self.app.advance(k,d or D,context,"edicao",60,0,previous)
        return k
    def test_edit_and_two_client_rounds_same_day_are_separate(self):
        edit=work_context(D,[]); k1=self.advance(edit); self.advance(edit,k1)
        first=work_context(D,[alt()]); k2=self.advance(first,k1); self.advance(first,k2)
        second=work_context(D,[alt(status="resolvida"),alt("b",numero=2)])
        k3=self.advance(second,k2); self.advance(second,k3)
        self.assertEqual(len(self.app.sessions),3)
        self.assertEqual([entry_payload(s)["alteracao_id"] for s in self.app.sessions.values()],[None,"a","b"])
        self.assertEqual([s["seconds"] for s in self.app.sessions.values()],[60,60,60])
        self.app.sync()
        self.assertEqual([c.kwargs["json"]["alteracao_id"] for c in requests.post.call_args_list],[None,"a","b"])
    def test_edit_after_resolved_change_does_not_reopen_original_session(self):
        self.assertNotEqual(work_context(D,[]),work_context(D,[alt(status="resolvida")]))
    def test_internal_is_identified_without_billing_as_client_change(self):
        c=work_context(dict(D,rev_n1_ajuste=True,revisoes_internas=2),[])
        k=self.advance(c); self.advance(c,k)
        p=entry_payload(self.app.sessions[k])
        self.assertIsNone(p["alteracao_id"])
        self.assertEqual(p["description"],"Ajuste interno · DaVinci")
    def test_requested_client_change_without_record_is_not_original_editing(self):
        self.assertIsNone(work_context(dict(D,status="ajuste_solicitado"),[]))
    def test_internal_rounds_are_separate(self):
        self.assertNotEqual(work_context(dict(D,status="ajuste_interno",revisoes_internas=1),[]), work_context(dict(D,status="ajuste_interno",revisoes_internas=2),[]))
    def test_failed_upload_retries_same_id_without_duplicate(self):
        c=work_context(D,[alt()]); k=self.advance(c); self.advance(c,k)
        requests.post.side_effect=RuntimeError("offline")
        with self.assertRaises(RuntimeError): self.app.sync()
        self.assertEqual(self.app.sessions[k]["uploaded"],0)
        requests.post.side_effect=None; self.app.sync(); self.app.sync()
        self.assertEqual(requests.post.call_count,2)
        self.assertEqual(requests.post.call_args_list[0].kwargs["json"]["id"],requests.post.call_args_list[1].kwargs["json"]["id"])
    def test_guarded_status_update_after_client_hours(self):
        d=dict(D,status="ajuste_solicitado");c=work_context(d,[alt()])
        k=self.advance(c,d=d);self.advance(c,k,d=d);self.app.sync()
        self.assertEqual(requests.patch.call_args.kwargs["params"],{"id":"eq.d","status":"eq.ajuste_solicitado","updated_at":"eq."+d["updated_at"]})
        self.assertEqual(requests.patch.call_args.kwargs["json"],{"status":"em_edicao"})
    def test_pending_old_session_does_not_patch_status(self):
        c=work_context(D,[]);k=self.advance(c);self.advance(c,k)
        self.app.previous_context=None;self.app.current_deliverable=None
        self.app.sync();requests.patch.assert_not_called()
    def test_review_is_not_tracked(self):
        requests.get.return_value=response([dict(D,status="revisao_n1")])
        d,c=self.app.fetch_context("ADVR-1")
        self.assertIsNone(c);self.assertEqual(requests.get.call_count,1)
    def test_client_context_query(self):
        requests.get.side_effect=[response([D]),response([alt()])]
        self.assertEqual(self.app.fetch_context("ADVR-1")[1],("alteracao_cliente","a","a"))
    def test_legacy_pending_payload_not_reclassified(self):
        c=work_context(D,[]);k=self.advance(c);s=self.app.sessions[k];del s["alteracao_id"]
        self.assertNotIn("alteracao_id",entry_payload(s))
    def test_idle_and_sleep_gaps_not_counted(self):
        self.assertEqual(eligible_seconds(300,0),0)
        self.assertEqual(eligible_seconds(10,200),0)
        self.assertEqual(eligible_seconds(10,185),5)
        self.assertEqual(eligible_seconds(10,0),10)

if __name__ == "__main__": unittest.main()
