-- =========================================================================
-- Banco de talentos e fornecedores (Fase 1: cadastro público + registro).
--
-- Dois bancos SEPARADOS (decisão do Djêisson), mas com a MESMA taxonomia de
-- funções — senão o filtro "quem é color?" sairia diferente nos dois.
--
-- Segurança: os formulários são públicos, então ninguém anônimo toca nas
-- tabelas. A entrada é por RPC SECURITY DEFINER liberada pro anon (mesmo
-- padrão do intake_submit). Dados bancários/PIX ficam em tabela LATERAL com
-- RLS própria — RLS protege linha, não coluna.
-- =========================================================================

-- ---------------------------------------------------------------- funções
create table if not exists public.funcoes_parceiro (
  id    text primary key,
  nome  text not null,
  grupo text,
  ordem int  not null default 0
);

insert into public.funcoes_parceiro (id, nome, grupo, ordem) values
  ('direcao',          'Direção',                  'Direção',   10),
  ('direcao_foto',     'Direção de fotografia',    'Captação',  20),
  ('camera',           'Câmera',                   'Captação',  30),
  ('assist_camera',    'Assistente de câmera',     'Captação',  40),
  ('drone',            'Drone',                    'Captação',  50),
  ('gaffer',           'Gaffer / Elétrica',        'Captação',  60),
  ('maquinista',       'Maquinista',               'Captação',  70),
  ('som_direto',       'Som direto',               'Captação',  80),
  ('still',            'Still / Fotografia',       'Captação',  90),
  ('producao',         'Produção',                 'Produção', 100),
  ('assist_producao',  'Assistente de produção',   'Produção', 110),
  ('casting',          'Casting / Elenco',         'Produção', 120),
  ('maquiagem',        'Maquiagem',                'Arte',     130),
  ('figurino',         'Figurino',                 'Arte',     140),
  ('cenografia',       'Cenografia / Arte',        'Arte',     150),
  ('editor',           'Editor',                   'Pós',      160),
  ('motion',           'Motion designer',          'Pós',      170),
  ('vfx',              'VFX',                      'Pós',      180),
  ('color',            'Color',                    'Pós',      190),
  ('mixagem',          'Edição de som / mixagem',  'Pós',      200),
  ('trilha',           'Trilha',                   'Pós',      210),
  ('locutor',          'Locutor',                  'Pós',      220),
  ('legendagem',       'Legendagem / Tradução',    'Pós',      230),
  ('estudio',          'Estúdio / Locação',        'Apoio',    240),
  ('transporte',       'Transporte',               'Apoio',    250),
  ('catering',         'Catering',                 'Apoio',    260),
  ('outro',            'Outro',                    'Apoio',    999)
on conflict (id) do nothing;

alter table public.funcoes_parceiro enable row level security;
drop policy if exists funcoes_parceiro_select on public.funcoes_parceiro;
create policy funcoes_parceiro_select on public.funcoes_parceiro
  for select to anon, authenticated using (true);   -- o formulário público lê a lista

-- ----------------------------------------------------------- fornecedores
create table if not exists public.fornecedores (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cpf_cnpj    text,
  razao_social text,
  email       text not null,
  telefone    text,
  funcoes     text[] not null default '{}',
  cep         text, logradouro text, numero text, complemento text,
  bairro      text, cidade text, estado text,
  observacoes text,
  status      text not null default 'novo',        -- novo | ativo | inativo
  origem      text not null default 'formulario',  -- formulario | manual
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists fornecedores_funcoes_idx on public.fornecedores using gin (funcoes);

create table if not exists public.fornecedores_bancarios (
  fornecedor_id uuid primary key references public.fornecedores(id) on delete cascade,
  banco_codigo  text, banco_nome text, agencia text, conta text, pix text,
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------ freelancers
create table if not exists public.freelancers (
  id              uuid primary key default gen_random_uuid(),
  nome_completo   text not null,
  nome_artistico  text,
  instagram       text,
  portfolio       text,
  funcao_principal text,
  funcoes         text[] not null default '{}',
  especialidades  text,
  equipamento_proprio text,          -- sim | nao | nao_informado
  valor_diaria    numeric(12,2),
  condicoes_comerciais text,
  cpf             text,
  rg              text,
  orgao_emissor   text,
  data_nascimento date,
  email           text not null,
  whatsapp        text,
  cidade          text, estado text,
  -- dados jurídicos (quando emite nota por PJ)
  cnpj            text, razao_social text, nome_fantasia text,
  inscricao_municipal text,
  pj_cep text, pj_endereco text, pj_numero text, pj_complemento text,
  pj_bairro text, pj_cidade text, pj_estado text, email_fiscal text,
  -- informações gerais de produção
  restricao_alimentar text,
  sem_restricao   boolean not null default false,
  tam_camiseta    text, tam_calcado text,
  carro_modelo    text, carro_cor text, carro_placa text,
  status          text not null default 'novo',
  origem          text not null default 'formulario',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists freelancers_funcoes_idx on public.freelancers using gin (funcoes);

create table if not exists public.freelancers_bancarios (
  freelancer_id uuid primary key references public.freelancers(id) on delete cascade,
  banco_nome text, banco_codigo text, agencia text, conta text,
  tipo_conta text, titular text, pix text,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- RLS
alter table public.fornecedores           enable row level security;
alter table public.fornecedores_bancarios enable row level security;
alter table public.freelancers            enable row level security;
alter table public.freelancers_bancarios  enable row level security;

-- Quem pode ver dado bancário/PIX: só quem paga.
create or replace function public.pode_ver_bancario(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_uid,'admin') or public.has_role(_uid,'manager')
$$;

-- O cadastro em si: qualquer pessoa do time logada vê e edita.
drop policy if exists fornecedores_rw on public.fornecedores;
create policy fornecedores_rw on public.fornecedores
  for all to authenticated using (true) with check (true);

drop policy if exists freelancers_rw on public.freelancers;
create policy freelancers_rw on public.freelancers
  for all to authenticated using (true) with check (true);

-- Bancário: leitura e escrita só pra quem paga.
drop policy if exists fornecedores_banc_rw on public.fornecedores_bancarios;
create policy fornecedores_banc_rw on public.fornecedores_bancarios
  for all to authenticated
  using (public.pode_ver_bancario(auth.uid()))
  with check (public.pode_ver_bancario(auth.uid()));

drop policy if exists freelancers_banc_rw on public.freelancers_bancarios;
create policy freelancers_banc_rw on public.freelancers_bancarios
  for all to authenticated
  using (public.pode_ver_bancario(auth.uid()))
  with check (public.pode_ver_bancario(auth.uid()));

-- ------------------------------------------- entrada pública (só por RPC)
-- O anônimo NÃO tem policy nenhuma nas tabelas: só consegue entrar por aqui.
create or replace function public.cadastro_fornecedor_submit(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(btrim(p->>'nome'), '') = '' or coalesce(btrim(p->>'email'), '') = '' then
    raise exception 'Nome e e-mail são obrigatórios';
  end if;

  insert into public.fornecedores (
    nome, cpf_cnpj, razao_social, email, telefone, funcoes,
    cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes
  ) values (
    btrim(p->>'nome'), nullif(btrim(p->>'cpf_cnpj'),''), nullif(btrim(p->>'razao_social'),''),
    btrim(p->>'email'), nullif(btrim(p->>'telefone'),''),
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(p->'funcoes')), '{}'),
    nullif(btrim(p->>'cep'),''), nullif(btrim(p->>'logradouro'),''), nullif(btrim(p->>'numero'),''),
    nullif(btrim(p->>'complemento'),''), nullif(btrim(p->>'bairro'),''), nullif(btrim(p->>'cidade'),''),
    nullif(btrim(p->>'estado'),''), nullif(btrim(p->>'observacoes'),'')
  ) returning id into v_id;

  insert into public.fornecedores_bancarios (fornecedor_id, banco_codigo, banco_nome, agencia, conta, pix)
  values (v_id, nullif(btrim(p->>'banco_codigo'),''), nullif(btrim(p->>'banco_nome'),''),
          nullif(btrim(p->>'agencia'),''), nullif(btrim(p->>'conta'),''), nullif(btrim(p->>'pix'),''));

  return v_id;
end;
$$;

create or replace function public.cadastro_freelancer_submit(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(btrim(p->>'nome_completo'), '') = '' or coalesce(btrim(p->>'email'), '') = '' then
    raise exception 'Nome e e-mail são obrigatórios';
  end if;

  insert into public.freelancers (
    nome_completo, nome_artistico, instagram, portfolio, funcao_principal, funcoes,
    especialidades, equipamento_proprio, valor_diaria, condicoes_comerciais,
    cpf, rg, orgao_emissor, data_nascimento, email, whatsapp, cidade, estado,
    cnpj, razao_social, nome_fantasia, inscricao_municipal,
    pj_cep, pj_endereco, pj_numero, pj_complemento, pj_bairro, pj_cidade, pj_estado, email_fiscal,
    restricao_alimentar, sem_restricao, tam_camiseta, tam_calcado,
    carro_modelo, carro_cor, carro_placa
  ) values (
    btrim(p->>'nome_completo'), nullif(btrim(p->>'nome_artistico'),''), nullif(btrim(p->>'instagram'),''),
    nullif(btrim(p->>'portfolio'),''), nullif(btrim(p->>'funcao_principal'),''),
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(p->'funcoes')), '{}'),
    nullif(btrim(p->>'especialidades'),''), nullif(btrim(p->>'equipamento_proprio'),''),
    nullif(p->>'valor_diaria','')::numeric, nullif(btrim(p->>'condicoes_comerciais'),''),
    nullif(btrim(p->>'cpf'),''), nullif(btrim(p->>'rg'),''), nullif(btrim(p->>'orgao_emissor'),''),
    nullif(p->>'data_nascimento','')::date, btrim(p->>'email'), nullif(btrim(p->>'whatsapp'),''),
    nullif(btrim(p->>'cidade'),''), nullif(btrim(p->>'estado'),''),
    nullif(btrim(p->>'cnpj'),''), nullif(btrim(p->>'razao_social'),''), nullif(btrim(p->>'nome_fantasia'),''),
    nullif(btrim(p->>'inscricao_municipal'),''),
    nullif(btrim(p->>'pj_cep'),''), nullif(btrim(p->>'pj_endereco'),''), nullif(btrim(p->>'pj_numero'),''),
    nullif(btrim(p->>'pj_complemento'),''), nullif(btrim(p->>'pj_bairro'),''), nullif(btrim(p->>'pj_cidade'),''),
    nullif(btrim(p->>'pj_estado'),''), nullif(btrim(p->>'email_fiscal'),''),
    nullif(btrim(p->>'restricao_alimentar'),''), coalesce((p->>'sem_restricao')::boolean, false),
    nullif(btrim(p->>'tam_camiseta'),''), nullif(btrim(p->>'tam_calcado'),''),
    nullif(btrim(p->>'carro_modelo'),''), nullif(btrim(p->>'carro_cor'),''), nullif(btrim(p->>'carro_placa'),'')
  ) returning id into v_id;

  insert into public.freelancers_bancarios (freelancer_id, banco_nome, banco_codigo, agencia, conta, tipo_conta, titular, pix)
  values (v_id, nullif(btrim(p->>'banco_nome'),''), nullif(btrim(p->>'banco_codigo'),''),
          nullif(btrim(p->>'agencia'),''), nullif(btrim(p->>'conta'),''), nullif(btrim(p->>'tipo_conta'),''),
          nullif(btrim(p->>'titular'),''), nullif(btrim(p->>'pix'),''));

  return v_id;
end;
$$;

grant execute on function public.cadastro_fornecedor_submit(jsonb) to anon, authenticated;
grant execute on function public.cadastro_freelancer_submit(jsonb)  to anon, authenticated;
