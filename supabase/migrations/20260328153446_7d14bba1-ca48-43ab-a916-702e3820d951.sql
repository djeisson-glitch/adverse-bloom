
CREATE TABLE public.google_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  google_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_member_id)
);

ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage google_tokens" ON public.google_tokens
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Members read own google_tokens" ON public.google_tokens
  FOR SELECT TO authenticated
  USING (
    team_member_id IN (
      SELECT id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

ALTER TABLE public.job_allocations ADD COLUMN google_calendar_event_id text;
