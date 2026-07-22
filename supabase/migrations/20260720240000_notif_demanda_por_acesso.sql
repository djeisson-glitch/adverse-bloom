-- Demanda nova pelo formulário não notificava a coordenadora.
--
-- O gatilho chamava notificar_gestao(), que percorre uma LISTA FIXA de papéis
-- ('admin','manager','produtor'). Coordenadora não estava lá — e lista fixa não
-- acompanha papel novo no enum. Mesma armadilha que já apareceu na RLS.
--
-- Passa a notificar QUEM TEM ACESSO a demandas (admin/manager ou o módulo
-- concedido no painel) — a mesma régua do pode_ver_demandas(). Assim, quem
-- ganhar o módulo amanhã já entra sozinho.
--
-- notificar_gestao() segue como está pros eventos COMERCIAIS (carta aprovada,
-- etc.): esses a coordenadora não precisa receber.

CREATE OR REPLACE FUNCTION public.tg_notif_demanda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cli text;
  u uuid;
BEGIN
  SELECT c.name INTO cli FROM public.clients c WHERE c.id = NEW.client_id;

  FOR u IN
    SELECT ur.user_id
      FROM public.user_roles ur
     WHERE ur.role::text IN ('admin', 'manager')
    UNION
    SELECT up.user_id
      FROM public.user_permissions up
     WHERE up.module = 'demandas'
       AND up.permission <> 'none'
  LOOP
    PERFORM public.notificar(
      u,
      'demanda_nova',
      'importante',
      'Nova demanda' || coalesce(' — ' || cli, ''),
      NEW.nome_projeto || ' · ' || NEW.solicitante_nome,
      '/demandas',
      'demanda:' || NEW.id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;
