-- =========================================================================
-- Mural de avisos internos — admin e coordenadora publicam, todo o time vê.
-- Aparece na Início (gestão e equipe) e na Minha mesa.
-- =========================================================================

create table if not exists public.avisos (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  corpo      text,
  autor_id   uuid references auth.users(id) on delete set null,
  fixado     boolean not null default false,   -- fixa no topo do mural
  ativo      boolean not null default true,    -- "remover" é soft-delete (ativo=false)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.avisos enable row level security;

-- Quem pode publicar/editar/remover: admin, manager (legado) ou coordenadora.
create or replace function public.pode_mural(_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(_uid, 'admin')
      or public.has_role(_uid, 'manager')
      or public.has_role(_uid, 'coordenadora')
$$;

-- Todo mundo logado lê os avisos ativos.
drop policy if exists avisos_select on public.avisos;
create policy avisos_select on public.avisos
  for select to authenticated
  using (ativo = true);

drop policy if exists avisos_insert on public.avisos;
create policy avisos_insert on public.avisos
  for insert to authenticated
  with check (public.pode_mural(auth.uid()));

drop policy if exists avisos_update on public.avisos;
create policy avisos_update on public.avisos
  for update to authenticated
  using (public.pode_mural(auth.uid()))
  with check (public.pode_mural(auth.uid()));

drop policy if exists avisos_delete on public.avisos;
create policy avisos_delete on public.avisos
  for delete to authenticated
  using (public.pode_mural(auth.uid()));

-- Ordem do mural: fixados primeiro, depois os mais recentes.
create index if not exists avisos_mural_idx on public.avisos (ativo, fixado desc, created_at desc);
