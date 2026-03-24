-- SECURITY HARDENING: Remove anonymous access and tighten RLS

-- 1. CRITICAL: Remove anonymous (unauthenticated) read access to conta_azul_cache
DROP POLICY IF EXISTS "Allow anon read" ON public.conta_azul_cache;

-- 2. Fix next_budget_number function search_path
CREATE OR REPLACE FUNCTION public.next_budget_number()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(MAX(budget_number), 157) + 1 FROM public.budgets;
$$;

-- 3. Tighten DELETE policies - only admins should delete sensitive data

-- budgets: restrict DELETE to admin only
DROP POLICY IF EXISTS "Authenticated delete budgets" ON public.budgets;
CREATE POLICY "Admin delete budgets" ON public.budgets
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- budget_items: restrict DELETE to admin only  
DROP POLICY IF EXISTS "Authenticated delete budget_items" ON public.budget_items;
CREATE POLICY "Admin delete budget_items" ON public.budget_items
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- projects: restrict DELETE to admin only
DROP POLICY IF EXISTS "Authenticated users can delete projects" ON public.projects;
CREATE POLICY "Admin delete projects" ON public.projects
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- project_costs: restrict DELETE to admin only
DROP POLICY IF EXISTS "Authenticated delete project_costs" ON public.project_costs;
CREATE POLICY "Admin delete project_costs" ON public.project_costs
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- suppliers: restrict DELETE to admin only
DROP POLICY IF EXISTS "Authenticated delete suppliers" ON public.suppliers;
CREATE POLICY "Admin delete suppliers" ON public.suppliers
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- supplier_contacts: restrict DELETE to admin only
DROP POLICY IF EXISTS "Authenticated delete supplier_contacts" ON public.supplier_contacts;
CREATE POLICY "Admin delete supplier_contacts" ON public.supplier_contacts
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- budget_item_suppliers: restrict DELETE to admin only
DROP POLICY IF EXISTS "Authenticated delete budget_item_suppliers" ON public.budget_item_suppliers;
CREATE POLICY "Admin delete budget_item_suppliers" ON public.budget_item_suppliers
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- budget_preset_items: restrict DELETE to admin only
DROP POLICY IF EXISTS "Authenticated delete budget_preset_items" ON public.budget_preset_items;
CREATE POLICY "Admin delete budget_preset_items" ON public.budget_preset_items
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- conta_azul_cache: restrict DELETE to admin only
DROP POLICY IF EXISTS "Authenticated users can delete cache" ON public.conta_azul_cache;
CREATE POLICY "Admin delete conta_azul_cache" ON public.conta_azul_cache
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));