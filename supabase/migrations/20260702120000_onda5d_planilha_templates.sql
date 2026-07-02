-- =========================================================================
-- Onda 5D · Itens pré-estabelecidos da planilha de produção
-- Pedido do Djeisson (2026-07-02): planilha nasce populada por categoria,
-- como no Catalunya OS. Baseado nos prints + prática de produtora.
-- =========================================================================

-- ---------- 1. Templates de item por categoria ------------------------------
CREATE TABLE IF NOT EXISTS public.budget_item_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_codigo text NOT NULL,
  descricao text NOT NULL,
  ordem int NOT NULL DEFAULT 0,
  UNIQUE (categoria_codigo, descricao)
);
ALTER TABLE public.budget_item_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budget_item_templates select" ON public.budget_item_templates;
CREATE POLICY "budget_item_templates select" ON public.budget_item_templates
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "budget_item_templates admin" ON public.budget_item_templates;
CREATE POLICY "budget_item_templates admin" ON public.budget_item_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.budget_item_templates (categoria_codigo, descricao, ordem) VALUES
  -- 001 · PRÉ-PRODUÇÃO
  ('001', 'Verba de Produção', 1),
  ('001', 'Alimentação Pré (Prod/ Fig/ Arte/ Locação)', 2),
  ('001', 'Story Board', 3),
  ('001', 'Uber (Equipe pré - pesquisa e Tech Scout)', 4),
  ('001', 'Roteiro', 5),
  ('001', 'Pesquisador', 6),
  ('001', 'Tratamento', 7),
  ('001', 'Mapas Meteorológicos', 8),
  ('001', 'Transf. Borderô', 9),
  -- 002 · TESTE DE VT
  ('002', 'Estúdio para Teste', 1),
  ('002', 'Equipe de Teste', 2),
  ('002', 'Elenco para Teste', 3),
  ('002', 'Maquiagem Teste', 4),
  ('002', 'Alimentação Teste', 5),
  ('002', 'Transporte Teste', 6),
  ('002', 'Edição do Teste', 7),
  ('002', 'Material / Mídia', 8),
  -- 003 · PRODUÇÃO
  ('003', 'Aluguel Locação', 1),
  ('003', 'Aluguel Base Locação', 2),
  ('003', 'Autorizações (Prefeitura/ Museus/ Etc)', 3),
  ('003', 'Estúdio Pré', 4),
  ('003', 'Estúdio Pré Light', 5),
  ('003', 'Estúdio Filmagem', 6),
  ('003', 'Aluguel Carro de Cena', 7),
  ('003', 'Estrutura de Produção', 8),
  ('003', 'Caixa de Produção', 9),
  ('003', 'Rádios', 10),
  ('003', 'Reembolso Celular', 11),
  ('003', 'Verba Alimentação Cena', 12),
  ('003', 'Segurança', 13),
  ('003', 'Segurança de Trânsito', 14),
  ('003', 'Efeitos Especiais', 15),
  ('003', 'Gerador', 16),
  ('003', 'Banheiro Químico', 17),
  ('003', 'Tenda / Cobertura', 18),
  ('003', 'Limpeza de Locação', 19),
  ('003', 'Ambulância / Brigadista', 20),
  ('003', 'Drone (operação)', 21),
  ('003', 'Contingência', 22),
  -- 004 · TRANSPORTE
  ('004', 'Van de Produção', 1),
  ('004', 'Van de Elenco', 2),
  ('004', 'Caminhão de Câmera', 3),
  ('004', 'Caminhão de Luz', 4),
  ('004', 'Caminhão de Arte', 5),
  ('004', 'Carro de Apoio', 6),
  ('004', 'Combustível', 7),
  ('004', 'Pedágio', 8),
  ('004', 'Estacionamento', 9),
  ('004', 'Uber / Táxi', 10),
  ('004', 'Frete / Motoboy', 11),
  -- 005 · PASSAGEM E HOSPEDAGEM
  ('005', 'Passagens Aéreas Equipe', 1),
  ('005', 'Passagens Aéreas Elenco', 2),
  ('005', 'Hotel Equipe', 3),
  ('005', 'Hotel Elenco', 4),
  ('005', 'Per Diem', 5),
  ('005', 'Traslados', 6),
  ('005', 'Bagagem Extra / Excesso', 7),
  -- 006 · ELENCO
  ('006', 'Ator/Atriz Principal', 1),
  ('006', 'Ator/Atriz Coadjuvante', 2),
  ('006', 'Figuração', 3),
  ('006', 'Modelo', 4),
  ('006', 'Casting (produtora de elenco)', 5),
  ('006', 'Assistente de Casting', 6),
  ('006', 'Cachê Locutor', 7),
  ('006', 'Direitos de Uso / Renovação', 8),
  ('006', 'Agenciamento (20%)', 9),
  -- 007 · EQUIPE TÉCNICA
  ('007', 'Diretor(a)', 1),
  ('007', '1º Assistente de Direção', 2),
  ('007', 'Produtor(a) Executivo(a)', 3),
  ('007', 'Coordenador(a) de Produção', 4),
  ('007', 'Produtor(a) de Set', 5),
  ('007', 'Assistente de Produção', 6),
  ('007', 'Diretor(a) de Fotografia', 7),
  ('007', '1º Assistente de Câmera', 8),
  ('007', '2º Assistente de Câmera', 9),
  ('007', 'Operador(a) de Câmera', 10),
  ('007', 'Gaffer', 11),
  ('007', 'Elétrico', 12),
  ('007', 'Maquinista', 13),
  ('007', 'Técnico(a) de Som Direto', 14),
  ('007', 'Microfonista', 15),
  ('007', 'Diretor(a) de Arte', 16),
  ('007', 'Assistente de Arte', 17),
  ('007', 'Figurinista', 18),
  ('007', 'Maquiador(a)', 19),
  ('007', 'Still / Fotógrafo(a)', 20),
  ('007', 'Making Of', 21),
  ('007', 'Video Assist', 22),
  ('007', 'DIT / Data Manager', 23),
  ('007', 'Operador(a) de Drone', 24),
  -- 008 · EQUIPAMENTOS
  ('008', 'Câmera Principal (corpo + acessórios)', 1),
  ('008', 'Lentes', 2),
  ('008', 'Câmera B / Segunda Unidade', 3),
  ('008', 'Iluminação', 4),
  ('008', 'Maquinária (dolly/grip)', 5),
  ('008', 'Steadicam / Gimbal', 6),
  ('008', 'Drone (equipamento)', 7),
  ('008', 'Som (kit direto)', 8),
  ('008', 'Video Assist / Monitores', 9),
  ('008', 'HDs / Mídias', 10),
  ('008', 'Comunicação (rádios/intercom)', 11),
  ('008', 'Consumíveis (fita/gelatina/bateria)', 12),
  -- 009 · ALIMENTAÇÃO
  ('009', 'Café da Manhã', 1),
  ('009', 'Almoço Equipe', 2),
  ('009', 'Almoço Elenco', 3),
  ('009', 'Jantar / Hora Extra', 4),
  ('009', 'Craft / Lanche de Set', 5),
  ('009', 'Água / Gelo / Café', 6),
  -- 010 · ARTE / FIGURINO
  ('010', 'Cenografia', 1),
  ('010', 'Objetos de Cena', 2),
  ('010', 'Figurino', 3),
  ('010', 'Consumíveis de Arte', 4),
  -- 011 · PÓS PRODUÇÃO
  ('011', 'Edição / Montagem', 1),
  ('011', 'Assistente de Edição', 2),
  ('011', 'Color Grading', 3),
  ('011', 'Motion / GC', 4),
  ('011', 'VFX / Composição', 5),
  ('011', 'Finalização / Conform', 6),
  ('011', 'Áudio / Mixagem', 7),
  ('011', 'Trilha Original', 8),
  ('011', 'Trilha Licenciada (biblioteca)', 9),
  ('011', 'Locução (estúdio)', 10),
  ('011', 'Legendagem / Acessibilidade', 11),
  ('011', 'Masterização / Cópias', 12),
  ('011', 'Storage / Backup', 13),
  ('011', 'Versões / Cutdowns', 14)
ON CONFLICT (categoria_codigo, descricao) DO NOTHING;

-- ---------- 2. RPC: popular planilha com os itens padrão --------------------
-- Chamada quando um budget é criado (ou pelo botão "Carregar itens padrão").
-- Não duplica: só popula se a planilha estiver vazia.
CREATE OR REPLACE FUNCTION public.seed_budget_items(_budget_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inserted int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.budget_items WHERE budget_id = _budget_id) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.budget_items
    (budget_id, categoria_id, descricao, item_name, quantity, diaria, unit_price, tira_taxa, ordem)
  SELECT
    _budget_id, c.id, t.descricao, t.descricao, 1, 0, 0, false, t.ordem
  FROM public.budget_item_templates t
  JOIN public.budget_categorias c ON c.codigo = t.categoria_codigo
  ORDER BY c.ordem, t.ordem;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;
