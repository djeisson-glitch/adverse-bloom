-- =========================================================================
-- Mural de avisos: corrige o "remover" (soft-delete) e adiciona data do evento.
-- =========================================================================

-- 1) O "remover" seta ativo=false. O PostgREST faz o UPDATE com RETURNING, e o
--    novo row (ativo=false) não passava na política de SELECT (using ativo=true)
--    → Postgres cuspia 42501 "new row violates RLS" e o remover falhava calado.
--    Agora quem pode publicar (admin/coordenadora) também ENXERGA os inativos,
--    então o novo row passa. Usuário comum continua vendo só os ativos, e o
--    front filtra ativo=true de qualquer jeito.
drop policy if exists avisos_select on public.avisos;
create policy avisos_select on public.avisos
  for select to authenticated
  using (ativo = true or public.pode_mural(auth.uid()));

-- 2) Data do evento (opcional): além da data de registro (created_at), quando o
--    aviso tem um evento marcado — reunião, gravação, prazo etc.
alter table public.avisos
  add column if not exists data_evento timestamptz;
