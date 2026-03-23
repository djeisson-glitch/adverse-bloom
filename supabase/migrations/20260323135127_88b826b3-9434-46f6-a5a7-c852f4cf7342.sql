
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'operator');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for user_roles
CREATE POLICY "Authenticated read user_roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin delete user_roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert user_roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update user_roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Admin delete profiles" ON public.profiles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- Clients table
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  email text,
  phone text,
  segment text,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read clients" ON public.clients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert clients" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update clients" ON public.clients
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin delete clients" ON public.clients
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Deals table
CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'lead',
  value numeric DEFAULT 0,
  expected_close_date date,
  probability int DEFAULT 50,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read deals" ON public.deals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert deals" ON public.deals
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update deals" ON public.deals
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin delete deals" ON public.deals
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Proposals table
CREATE TABLE public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  number text,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho',
  total_value numeric DEFAULT 0,
  margin_percent numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read proposals" ON public.proposals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert proposals" ON public.proposals
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update proposals" ON public.proposals
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin delete proposals" ON public.proposals
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
