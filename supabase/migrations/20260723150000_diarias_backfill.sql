-- Backfill do saldo de diárias contratadas nos projetos JÁ ganhos, a partir do
-- orçamento vinculado. Só seta a coluna (não cria entregáveis nos existentes).

-- 1) soma de entregas[].diarias do orçamento
update public.projects p
set diarias_contratadas = coalesce((
  select sum(greatest(coalesce(nullif(e->>'diarias', '')::int, 0), 0))
  from public.budgets b
  cross join lateral jsonb_array_elements(coalesce(b.entregas, '[]'::jsonb)) e
  where b.id = p.budget_id
), 0)
where p.budget_id is not null;

-- 2) fallback: quando o orçamento não detalha diárias por entrega, usa capture_days
update public.projects p
set diarias_contratadas = b.capture_days
from public.budgets b
where p.budget_id = b.id
  and coalesce(p.diarias_contratadas, 0) = 0
  and coalesce(b.capture_days, 0) > 0;
