import importlib.util
from pathlib import Path
import tempfile
import json
from unittest.mock import patch, Mock
import unittest

spec = importlib.util.spec_from_file_location('worker', Path(__file__).with_name('worker.py'))
w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)

class Folders(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)/'PROJETOS_ATIVOS'; self.root.mkdir()
        self.model = self.root/'_. Database 2026'/'Estrutura de pastas'
        (self.model/'01. Takes'/'01. Camera A').mkdir(parents=True)
        (self.model/'11. Entregas finais'/'02. Entregas cliente').mkdir(parents=True)
        (self.model/'nao-copiar.txt').write_text('modelo')
        self.job = {'project_id':'00000000-0000-4000-8000-000000000001', 'number':'0369', 'project_name':'[0369]_TESTE', 'year':2026,'month':10,'client_folder':'SLC Máquinas'}
    def run_job(self, apply=True): return w.create_folders(self.root,self.model,self.job,apply)
    def test_creates_structure_and_not_files(self):
        result=self.run_job(); dest=self.root/result['relative_path']
        self.assertTrue((dest/'01. Takes'/'01. Camera A').is_dir())
        self.assertFalse((dest/'nao-copiar.txt').exists())
    def test_creates_missing_client_in_correct_month(self):
        client = self.root/'_. Database 2026'/'01. Clientes - Projetos'/'10. Outubro'/'Novo cliente'
        self.job['client_folder'] = 'Novo cliente'
        self.assertFalse(client.exists())
        result = self.run_job()
        self.assertEqual(self.root/result['relative_path'], client/'[0369]_TESTE')
        self.assertTrue(client.is_dir())
    def test_share_can_use_different_physical_directory_name(self):
        physical = (self.root/'Pasta fisica').resolve(); physical.mkdir()
        with patch.object(w.subprocess, 'run', return_value=Mock(stdout=json.dumps(str(physical)))) as command:
            self.assertEqual(w.server_root({'root': str(physical)}), physical)
            self.assertIn("Get-SmbShare -Name 'PROJETOS_ATIVOS'", command.call_args.args[0][-1])
    def test_other_destination_is_rejected_before_polling_queue(self):
        with patch.object(w.subprocess, 'run', return_value=Mock(stdout=json.dumps(str(self.root.resolve())))):
            with patch.object(w, 'rpc') as rpc:
                with self.assertRaisesRegex(ValueError, 'destino'):
                    w.run({'root': str(self.root.parent/'BRUTOS')})
                rpc.assert_not_called()
    def test_missing_share_never_polls_queue(self):
        with patch.object(w.subprocess, 'run', return_value=Mock(stdout='null')):
            with patch.object(w, 'rpc') as rpc:
                with self.assertRaisesRegex(ValueError, 'não encontrado'):
                    w.run({'root': str(self.root)})
                rpc.assert_not_called()
    def test_repeat_preserves_files_and_creates_nothing(self):
        first=self.run_job(); file=self.root/first['relative_path']/'original.mov';file.write_bytes(b'original')
        self.assertEqual(self.run_job()['created'],0);self.assertEqual(file.read_bytes(),b'original')
    def test_preview_does_not_write(self):
        result=self.run_job(False);self.assertGreater(result['missing'],0);self.assertFalse((self.root/result['relative_path']).exists())
    def test_recognizes_prefix_and_unicode(self):
        import unicodedata
        existing=self.root/'_. Database 2026'/'01. Clientes - Projetos'/'10. Outubro'/unicodedata.normalize('NFD','02. SLC Máquinas')/'[0369] Título antigo'
        existing.mkdir(parents=True)
        self.assertEqual(self.root/self.run_job()['relative_path'],existing)
    def test_duplicate_other_month_stops_without_creating(self):
        other=self.root/'_. Database 2026'/'01. Clientes - Projetos'/'09. Setembro'/'SLC Máquinas'/'[0369]_ANTIGO';other.mkdir(parents=True)
        with self.assertRaisesRegex(ValueError,'outro mês'):self.run_job()
        self.assertFalse((other.parents[1].parent/'10. Outubro').exists())
    def test_invalid_names(self):
        for name in ['../fora','C:\\fora','CON','x.','x/fora','x\x00']:
            with self.subTest(name=name):
                self.job['client_folder']=name
                with self.assertRaises(ValueError):self.run_job()
    def test_template_link_rejected(self):
        (self.model/'atalho').symlink_to(self.root,target_is_directory=True)
        with self.assertRaises(ValueError):self.run_job()
    def test_destination_link_rejected(self):
        target=self.root/'_. Database 2026'/'01. Clientes - Projetos';target.symlink_to(Path(self.tmp.name),target_is_directory=True)
        with self.assertRaises(ValueError):self.run_job()
    def test_file_conflict_causes_no_partial_write(self):
        desired,plan=w.build_plan(self.root,self.model,self.job)
        desired.mkdir(parents=True);(desired/'01. Takes').write_text('não mexer')
        with self.assertRaises(ValueError):self.run_job()
        self.assertFalse((desired/'11. Entregas finais').exists())
    def test_disconnected_root_is_not_recreated(self):
        with self.assertRaises(ValueError):w.create_folders(self.root/'ausente',self.model,self.job,True)
        self.assertFalse((self.root/'ausente').exists())

if __name__=='__main__': unittest.main()
