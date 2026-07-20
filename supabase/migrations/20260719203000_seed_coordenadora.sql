-- Padrões de acesso da coordenadora: coordena produção (projetos, pauta,
-- calendário, pós), mas SEM horas/timesheet e SEM nada de dinheiro. É o mesmo
-- recorte da equipe menos as horas — ela acompanha o trabalho, não o tempo.
CREATE OR REPLACE FUNCTION public.seed_acessos_padrao(_uid uuid, _papel text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mods text[];
BEGIN
  IF _papel IN ('admin', 'manager', 'cliente') THEN
    RETURN;  -- admin vê tudo por papel; cliente é caso à parte (só portal)
  ELSIF _papel = 'produtor' THEN
    mods := ARRAY[
      'inicio','minha_mesa',
      'demandas','leads','orcamentos','clientes','follow_ups',
      'projetos','pauta','pos_producao','calendario',
      'horas','timesheet','capacidade','planejamento','previsao',
      'faturamento','fechamento','contas_fees','relatorios','financeiro',
      'time','fornecedores'
    ];
  ELSIF _papel = 'coordenadora' THEN
    mods := ARRAY['inicio','minha_mesa','projetos','pauta','calendario','pos_producao'];
  ELSE  -- equipe / edicao / operator: execução (mesmo recorte de antes)
    mods := ARRAY['inicio','minha_mesa','projetos','calendario','horas','timesheet','pos_producao'];
  END IF;

  INSERT INTO public.user_permissions (user_id, module, permission)
  SELECT _uid, unnest(mods), 'view'::permission_level
  ON CONFLICT (user_id, module) DO NOTHING;   -- nunca pisa num toggle explícito
END;
$$;
