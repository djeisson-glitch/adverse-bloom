import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('prepare', Path(__file__).with_name('prepare_unraid.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class Prepare(unittest.TestCase):
    def setUp(self):
        self.source={'url':'https://example.supabase.co','token':'a'*64,'public_key':'public-test', 'root':'D:\\BRUTOS','platform':'windows'}
    def test_preserves_credentials_but_pins_unraid_destination(self):
        value=m.prepare(self.source,'_. Database 2026/Estrutura de pastas')
        self.assertEqual(value['token'], self.source['token'])
        self.assertEqual(value['root'],'/projects/PROJETOS_ATIVOS')
        self.assertEqual(value['template'],'/projects/PROJETOS_ATIVOS/_. Database 2026/Estrutura de pastas')
        self.assertEqual(value['platform'],'unraid')
    def test_rejects_template_escape(self):
        for path in ['../BRUTOS', '/mnt/user/BRUTOS', 'x/../../BRUTOS', 'D:\\BRUTOS','']:
            with self.subTest(path=path), self.assertRaises(ValueError):m.prepare(self.source,path)
    def test_rejects_wrong_origin_and_malformed_secret(self):
        for key,value in [('url','https://other.example.com'),('token','bad'),('public_key','')]:
            with self.subTest(key=key), self.assertRaises(ValueError):m.prepare({**self.source,key:value},'modelo')
