-- =========================================================================
-- Assistente da equipe — chat por pessoa (histórico próprio)
--  Separado das `memories` (que é o assistente estratégico do CEO). Cada um
--  só lê/escreve o seu. A função assistente-equipe monta o contexto (as
--  tarefas DA PESSOA, sem dinheiro).
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.assistente_equipe_msgs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assistente_equipe_msgs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own assistente msgs" ON public.assistente_equipe_msgs;
CREATE POLICY "own assistente msgs" ON public.assistente_equipe_msgs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS assistente_equipe_msgs_user_idx
  ON public.assistente_equipe_msgs (user_id, created_at);
