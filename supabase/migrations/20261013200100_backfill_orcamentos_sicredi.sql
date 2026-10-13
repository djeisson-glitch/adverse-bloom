-- Atualização retroativa autorizada para os dois clientes Sicredi.
BEGIN;
DO $$ DECLARE projeto record; BEGIN
  FOR projeto IN SELECT id FROM public.projects
    WHERE client_id IN ('d3a96591-55b7-4b64-a445-72aaa28eb950'::uuid,'e5e9dee9-9a19-4eae-b49e-8fb14f3390c8'::uuid)
    ORDER BY id
  LOOP PERFORM public.garantir_orcamento_projeto_interno(projeto.id); END LOOP;
END $$;
UPDATE public.faturamento_mensal SET detalhe=coalesce(detalhe,'{}'::jsonb)
WHERE client_id IN ('d3a96591-55b7-4b64-a445-72aaa28eb950'::uuid,'e5e9dee9-9a19-4eae-b49e-8fb14f3390c8'::uuid)
  AND NOT coalesce(detalhe,'{}'::jsonb) ? 'orcamentos_projetos';
COMMIT;
