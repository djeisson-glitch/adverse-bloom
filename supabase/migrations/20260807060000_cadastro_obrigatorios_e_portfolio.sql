-- =========================================================================
-- Cadastro de fornecedor e freela: campos obrigatórios + portfólio
--
-- Pedido do Djêisson (07/08/2026): "deixar alguns campos obrigatórios (os
-- mais importantes/relevantes) e adicionar um campo para portfólio, para que
-- a gente consiga visualizar de forma rápida o trabalho de cada um."
--
-- PORTFÓLIO
-- O freelancer já tinha `portfolio` e `instagram`; o fornecedor, nenhum dos
-- dois. Ganha os mesmos dois campos — a taxonomia dos dois bancos é a mesma
-- de propósito (senão "quem é color?" responde diferente em cada um), e não
-- há motivo pra "onde vejo o trabalho" ser a exceção.
--
-- OBRIGATÓRIOS
-- A régua que usei: exigir o que é preciso pra CHAMAR, CONTRATAR e (no caso
-- do freela) AVALIAR o trabalho — nome, e-mail, telefone, documento, função
-- e cidade/UF, mais portfólio-ou-Instagram no freelancer.
--
-- Fica FORA de propósito: dado bancário, PJ e valor de diária. É informação
-- sensível ou negociável, chegando por formulário público — travar o
-- cadastro nela custa fornecedor bom que preenche pela metade e desiste, e a
-- gestão completa esses campos na hora de pagar. Vale a pena revisitar se um
-- dia sobrar cadastro sem como pagar.
--
-- ONDE A REGRA MORA: aqui, na RPC. O formulário valida antes por educação —
-- pra pessoa ver tudo que falta de uma vez, com os campos marcados — mas o
-- formulário é público e a RPC é a única fronteira que ninguém contorna.
--
-- AS COLUNAS NÃO VIRAM NOT NULL: os cadastros que já entraram ficam como
-- estão. Rejeitar retroativamente não conserta nada e quebraria a tela pra
-- quem já está lá dentro; a medição no fim conta quantos são, pra saber o
-- tamanho do que falta completar à mão.
-- =========================================================================

ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS portfolio text,
  ADD COLUMN IF NOT EXISTS instagram text;

COMMENT ON COLUMN public.fornecedores.portfolio IS
  'Link pra ver o trabalho (site, Vimeo, Behance, Drive). Opcional: '
  'fornecedor também é transporte, catering e estúdio.';

/**
 * Mensagem única pros dois cadastros.
 *
 * A pessoa recebe a lista inteira do que faltou, não o primeiro erro: um
 * "faltou o CPF" por vez transforma o envio em quatro rodadas de tentativa.
 */
CREATE OR REPLACE FUNCTION public.cadastro_faltou(itens text[])
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'Faltou preencher: ' || array_to_string(itens, ', ') || '.'
$$;

CREATE OR REPLACE FUNCTION public.cadastro_fornecedor_submit(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  faltou text[] := '{}';
  vazio  boolean;
BEGIN
  IF coalesce(btrim(p->>'nome'), '') = ''       THEN faltou := faltou || 'Nome'::text; END IF;
  -- E-mail com cara de e-mail. Não confere se existe — confere se dá pra
  -- tentar; um cadastro sem contato válido é um cadastro que não serve.
  IF coalesce(btrim(p->>'email'), '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
    THEN faltou := faltou || 'E-mail'::text; END IF;
  IF coalesce(btrim(p->>'telefone'), '') = ''   THEN faltou := faltou || 'Telefone / WhatsApp'::text; END IF;
  IF coalesce(btrim(p->>'cpf_cnpj'), '') = ''   THEN faltou := faltou || 'CPF / CNPJ'::text; END IF;
  IF coalesce(btrim(p->>'cidade'), '') = ''     THEN faltou := faltou || 'Cidade'::text; END IF;
  IF coalesce(btrim(p->>'estado'), '') = ''     THEN faltou := faltou || 'Estado'::text; END IF;

  SELECT count(*) = 0 INTO vazio FROM jsonb_array_elements_text(coalesce(p->'funcoes', '[]'::jsonb));
  IF vazio THEN faltou := faltou || 'Funções'::text; END IF;

  IF array_length(faltou, 1) > 0 THEN
    RAISE EXCEPTION '%', public.cadastro_faltou(faltou);
  END IF;

  INSERT INTO public.fornecedores (
    nome, cpf_cnpj, razao_social, email, telefone, funcoes,
    portfolio, instagram,
    cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes
  ) VALUES (
    btrim(p->>'nome'), nullif(btrim(p->>'cpf_cnpj'),''), nullif(btrim(p->>'razao_social'),''),
    btrim(p->>'email'), nullif(btrim(p->>'telefone'),''),
    coalesce((SELECT array_agg(value::text) FROM jsonb_array_elements_text(p->'funcoes')), '{}'),
    nullif(btrim(p->>'portfolio'),''), nullif(btrim(p->>'instagram'),''),
    nullif(btrim(p->>'cep'),''), nullif(btrim(p->>'logradouro'),''), nullif(btrim(p->>'numero'),''),
    nullif(btrim(p->>'complemento'),''), nullif(btrim(p->>'bairro'),''), nullif(btrim(p->>'cidade'),''),
    nullif(btrim(p->>'estado'),''), nullif(btrim(p->>'observacoes'),'')
  ) RETURNING id INTO v_id;

  INSERT INTO public.fornecedores_bancarios (fornecedor_id, banco_codigo, banco_nome, agencia, conta, pix)
  VALUES (v_id, nullif(btrim(p->>'banco_codigo'),''), nullif(btrim(p->>'banco_nome'),''),
          nullif(btrim(p->>'agencia'),''), nullif(btrim(p->>'conta'),''), nullif(btrim(p->>'pix'),''));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cadastro_freelancer_submit(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  faltou text[] := '{}';
  vazio  boolean;
BEGIN
  IF coalesce(btrim(p->>'nome_completo'), '') = '' THEN faltou := faltou || 'Nome completo'::text; END IF;
  IF coalesce(btrim(p->>'email'), '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
    THEN faltou := faltou || 'E-mail'::text; END IF;
  IF coalesce(btrim(p->>'whatsapp'), '') = ''   THEN faltou := faltou || 'WhatsApp'::text; END IF;
  IF coalesce(btrim(p->>'cpf'), '') = ''        THEN faltou := faltou || 'CPF'::text; END IF;
  IF coalesce(btrim(p->>'cidade'), '') = ''     THEN faltou := faltou || 'Cidade'::text; END IF;
  IF coalesce(btrim(p->>'estado'), '') = ''     THEN faltou := faltou || 'Estado'::text; END IF;

  -- Um dos dois basta: o que se quer é conseguir VER o trabalho. Exigir link
  -- de portfólio excluiria quem só tem Instagram; exigir os dois é papelada.
  IF coalesce(btrim(p->>'portfolio'), '') = '' AND coalesce(btrim(p->>'instagram'), '') = ''
    THEN faltou := faltou || 'Portfólio ou Instagram'::text; END IF;

  SELECT count(*) = 0 INTO vazio FROM jsonb_array_elements_text(coalesce(p->'funcoes', '[]'::jsonb));
  IF vazio THEN faltou := faltou || 'Funções'::text; END IF;

  IF array_length(faltou, 1) > 0 THEN
    RAISE EXCEPTION '%', public.cadastro_faltou(faltou);
  END IF;

  INSERT INTO public.freelancers (
    nome_completo, nome_artistico, instagram, portfolio, funcao_principal, funcoes,
    especialidades, equipamento_proprio, valor_diaria, condicoes_comerciais,
    cpf, rg, orgao_emissor, data_nascimento, email, whatsapp, cidade, estado,
    cnpj, razao_social, nome_fantasia, inscricao_municipal,
    pj_cep, pj_endereco, pj_numero, pj_complemento, pj_bairro, pj_cidade, pj_estado, email_fiscal,
    restricao_alimentar, sem_restricao, tam_camiseta, tam_calcado,
    carro_modelo, carro_cor, carro_placa
  ) VALUES (
    btrim(p->>'nome_completo'), nullif(btrim(p->>'nome_artistico'),''), nullif(btrim(p->>'instagram'),''),
    nullif(btrim(p->>'portfolio'),''), nullif(btrim(p->>'funcao_principal'),''),
    coalesce((SELECT array_agg(value::text) FROM jsonb_array_elements_text(p->'funcoes')), '{}'),
    nullif(btrim(p->>'especialidades'),''), nullif(btrim(p->>'equipamento_proprio'),''),
    nullif(p->>'valor_diaria','')::numeric, nullif(btrim(p->>'condicoes_comerciais'),''),
    nullif(btrim(p->>'cpf'),''), nullif(btrim(p->>'rg'),''), nullif(btrim(p->>'orgao_emissor'),''),
    nullif(p->>'data_nascimento','')::date, btrim(p->>'email'), nullif(btrim(p->>'whatsapp'),''),
    nullif(btrim(p->>'cidade'),''), nullif(btrim(p->>'estado'),''),
    nullif(btrim(p->>'cnpj'),''), nullif(btrim(p->>'razao_social'),''), nullif(btrim(p->>'nome_fantasia'),''),
    nullif(btrim(p->>'inscricao_municipal'),''),
    nullif(btrim(p->>'pj_cep'),''), nullif(btrim(p->>'pj_endereco'),''), nullif(btrim(p->>'pj_numero'),''),
    nullif(btrim(p->>'pj_complemento'),''), nullif(btrim(p->>'pj_bairro'),''), nullif(btrim(p->>'pj_cidade'),''),
    nullif(btrim(p->>'pj_estado'),''), nullif(btrim(p->>'email_fiscal'),''),
    nullif(btrim(p->>'restricao_alimentar'),''), coalesce((p->>'sem_restricao')::boolean, false),
    nullif(btrim(p->>'tam_camiseta'),''), nullif(btrim(p->>'tam_calcado'),''),
    nullif(btrim(p->>'carro_modelo'),''), nullif(btrim(p->>'carro_cor'),''), nullif(btrim(p->>'carro_placa'),'')
  ) RETURNING id INTO v_id;

  INSERT INTO public.freelancers_bancarios (freelancer_id, banco_nome, banco_codigo, agencia, conta, tipo_conta, titular, pix)
  VALUES (v_id, nullif(btrim(p->>'banco_nome'),''), nullif(btrim(p->>'banco_codigo'),''),
          nullif(btrim(p->>'agencia'),''), nullif(btrim(p->>'conta'),''), nullif(btrim(p->>'tipo_conta'),''),
          nullif(btrim(p->>'titular'),''), nullif(btrim(p->>'pix'),''));

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cadastro_fornecedor_submit(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cadastro_freelancer_submit(jsonb)  TO anon, authenticated;

-- ---------------------------------------------------------------- medição
-- Prova as DUAS pontas: a regra REJEITA um cadastro capenga e ACEITA um
-- completo. Testar só a rejeição deixaria passar uma regra escrita ao
-- contrário, que barra todo mundo — e o formulário público é a porta de
-- entrada do banco de talentos: quebrado, ninguém avisa, só para de chegar
-- gente. O cadastro de teste é apagado no fim.
DO $medicao$
DECLARE
  passou boolean := false;
  novo_id uuid;
  velhos_f int; velhos_l int;
BEGIN
  BEGIN
    PERFORM public.cadastro_fornecedor_submit('{"nome":"__teste__","email":"a@b.com"}'::jsonb);
    passou := true;   -- não deveria chegar aqui
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE 'Faltou preencher:%' THEN
      RAISE EXCEPTION 'rejeitou pelo motivo errado: %', SQLERRM;
    END IF;
  END;
  IF passou THEN RAISE EXCEPTION 'cadastro incompleto FOI aceito — a regra não está valendo'; END IF;

  novo_id := public.cadastro_fornecedor_submit(
    '{"nome":"__teste__","email":"a@b.com","telefone":"51999999999","cpf_cnpj":"000",
      "cidade":"Passo Fundo","estado":"RS","funcoes":["camera"],"portfolio":"vimeo.com/x"}'::jsonb);
  IF novo_id IS NULL THEN RAISE EXCEPTION 'cadastro completo não entrou'; END IF;

  -- Sai do banco: o teste não pode virar linha no banco de talentos dele.
  DELETE FROM public.fornecedores WHERE id = novo_id;
  IF EXISTS (SELECT 1 FROM public.fornecedores WHERE id = novo_id) THEN
    RAISE EXCEPTION 'o cadastro de teste não foi apagado';
  END IF;

  -- Quanto do que JÁ existe não passaria pelas regras novas: é o tamanho do
  -- que a gestão vai precisar completar à mão. Ninguém é expulso — as
  -- colunas seguem aceitando null, e a regra vale só pra quem entra agora.
  SELECT count(*) INTO velhos_f FROM public.fornecedores
   WHERE coalesce(telefone,'') = '' OR coalesce(cpf_cnpj,'') = ''
      OR coalesce(cidade,'') = '' OR coalesce(array_length(funcoes,1),0) = 0;
  SELECT count(*) INTO velhos_l FROM public.freelancers
   WHERE coalesce(whatsapp,'') = '' OR coalesce(cpf,'') = ''
      OR coalesce(cidade,'') = '' OR coalesce(array_length(funcoes,1),0) = 0
      OR (coalesce(portfolio,'') = '' AND coalesce(instagram,'') = '');

  RAISE NOTICE 'regra rejeita incompleto e aceita completo | cadastros antigos incompletos: fornecedores=% freelancers=%',
    velhos_f, velhos_l;
END $medicao$;
