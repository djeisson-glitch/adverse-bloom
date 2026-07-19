-- Configurações → Geral não gravava nada: o "Salvar" era um setTimeout com toast
-- de sucesso, e nome da empresa / fuso viviam só no estado da tela. Dá as duas
-- colunas na linha que já guarda o contexto da empresa (id = 1).
alter table public.empresa_contexto
  add column if not exists nome_empresa text,
  add column if not exists timezone text not null default 'America/Sao_Paulo';

comment on column public.empresa_contexto.nome_empresa is
  'Nome da empresa exibido no sistema. Antes só existia como texto fixo na tela.';
comment on column public.empresa_contexto.timezone is
  'Fuso usado pra datas de produção. Default = America/Sao_Paulo (onde a produtora opera).';
