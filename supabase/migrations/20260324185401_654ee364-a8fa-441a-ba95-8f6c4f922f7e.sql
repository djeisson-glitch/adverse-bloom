
ALTER TABLE public.memories DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own memories" ON public.memories;
DROP POLICY IF EXISTS "Users insert own memories" ON public.memories;
DROP POLICY IF EXISTS "Users delete own memories" ON public.memories;
