
-- Module permission levels
CREATE TYPE public.permission_level AS ENUM ('none', 'view', 'edit');

-- User permissions per module
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  permission permission_level NOT NULL DEFAULT 'none',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Only admins can manage permissions
CREATE POLICY "Admin manage permissions"
  ON public.user_permissions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can read their own permissions
CREATE POLICY "Users read own permissions"
  ON public.user_permissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Security definer function to check module permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _min_level permission_level)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Admins always have full access
    public.has_role(_user_id, 'admin')
    OR
    EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = _user_id
        AND module = _module
        AND (
          (_min_level = 'view' AND permission IN ('view', 'edit'))
          OR (_min_level = 'edit' AND permission = 'edit')
          OR (_min_level = 'none')
        )
    )
$$;
