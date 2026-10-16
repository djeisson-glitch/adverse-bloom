-- Apenas em banco descartável, nunca em produção.
DO $$ BEGIN
  IF current_database() NOT LIKE 'adverse_review_test%' THEN
    RAISE EXCEPTION 'Use um banco adverse_review_test descartável';
  END IF;
END $$;
CREATE TABLE projects (id uuid PRIMARY KEY, name text, aprovador uuid);
CREATE TABLE deliverables (
  id uuid PRIMARY KEY, project_id uuid REFERENCES projects, titulo text,
  status text, responsavel_id uuid, retrabalho boolean DEFAULT false,
  rev_ajuste_pendente boolean DEFAULT false, rev_n1_ajuste boolean DEFAULT false,
  rev_n2_ajuste boolean DEFAULT false, aprovado_n1_em timestamptz,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE notificacoes (
  user_id uuid, tipo text, prioridade text, titulo text, corpo text,
  link text, dedupe_key text, lida_em timestamptz,
  UNIQUE (user_id, dedupe_key)
);
CREATE FUNCTION aprovador_efetivo(_project_id uuid, _nivel int) RETURNS uuid
LANGUAGE sql AS $$ SELECT aprovador FROM projects WHERE id = _project_id $$;
CREATE FUNCTION notificar(uuid, text, text, text, text, text, text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO notificacoes(user_id,tipo,prioridade,titulo,corpo,link,dedupe_key)
  VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING;
$$;
CREATE FUNCTION tg_revisao_interna_unica() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RETURN NEW; END $$;
CREATE FUNCTION tg_notif_deliverable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RETURN NEW; END $$;
CREATE TRIGGER trg_00_revisao_interna_unica BEFORE INSERT OR UPDATE OF status ON deliverables
FOR EACH ROW EXECUTE FUNCTION tg_revisao_interna_unica();
CREATE TRIGGER trg_notif_deliverable AFTER INSERT OR UPDATE ON deliverables
FOR EACH ROW EXECUTE FUNCTION tg_notif_deliverable();

INSERT INTO projects VALUES ('00000000-0000-0000-0000-000000000001', 'Projeto teste', '00000000-0000-0000-0000-000000000002');
INSERT INTO deliverables(id,project_id,titulo,status,aprovado_n1_em,rev_n1_ajuste) VALUES
('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','Legado','revisao',now(),true),
('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','Edição','em_edicao',NULL,false),
('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001','Cliente','com_cliente',now(),false);
