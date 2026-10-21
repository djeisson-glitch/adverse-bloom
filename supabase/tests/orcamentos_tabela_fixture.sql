-- Somente em banco PostgreSQL descartável vazio; nunca em produção.
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE TABLE clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text);
CREATE TABLE deals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,title text,numero int,objetivo text,tipo_orcamento text,local_filmagem text,formatos text[]);
CREATE TABLE client_faturamento(client_id uuid PRIMARY KEY,modelo text,precos_finais boolean,imposto_percent numeric,margem_percent numeric,comissoes jsonb);
CREATE TABLE client_precos(id uuid DEFAULT gen_random_uuid(),client_id uuid,tipo text,preco numeric,ativo boolean DEFAULT true,e_diaria boolean DEFAULT false,ordem int);
CREATE TABLE budget_categorias(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),codigo text,nome text,ordem int);
CREATE TABLE budget_item_templates(categoria_codigo text,descricao text,valor_unitario numeric DEFAULT 0,custo_unitario numeric DEFAULT 0,ordem int,no_medio boolean DEFAULT true);
CREATE TABLE budgets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),deal_id uuid,client_id uuid,parent_budget_id uuid,fechamento_mes date,created_by text,created_at timestamptz DEFAULT now(),is_latest_version boolean DEFAULT true,project_name text,client_name text,proposal_name text,status text DEFAULT 'draft',comissao_base text,notas text,internal_notes text,variante_nome text,markup_percent numeric DEFAULT 0,tax_percent numeric DEFAULT 0,bv_percent numeric DEFAULT 0,commission_percent numeric DEFAULT 0,discount numeric DEFAULT 0,addition numeric DEFAULT 0,capture_days numeric DEFAULT 0,project_count numeric DEFAULT 0,margem_produtora_percent numeric DEFAULT 0,imposto_percent numeric DEFAULT 0,direcao_cena_percent numeric DEFAULT 0,budget_number numeric DEFAULT 0,version numeric DEFAULT 0,total_value numeric DEFAULT 0,comissoes jsonb DEFAULT '[]',entregas jsonb DEFAULT '[]',categorias_ocultas jsonb DEFAULT '[]',proposta jsonb,not_included jsonb,condicoes jsonb,resumo_ia jsonb);
CREATE TABLE budget_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),budget_id uuid REFERENCES budgets(id) ON DELETE CASCADE,categoria_id uuid,category text,item_name text,descricao text,group_name text,unit_type text,observacoes text,delivery_duration text,quantity numeric DEFAULT 0,diaria numeric DEFAULT 0,client_price numeric DEFAULT 0,client_unit_price numeric DEFAULT 0,client_days numeric DEFAULT 0,client_people numeric DEFAULT 0,supplier_cost numeric DEFAULT 0,supplier_unit_price numeric DEFAULT 0,supplier_days numeric DEFAULT 0,supplier_people numeric DEFAULT 0,custo_unitario numeric DEFAULT 0,margin_value numeric DEFAULT 0,margin_percent numeric DEFAULT 0,ordem numeric DEFAULT 0,order_index numeric DEFAULT 0,has_supplier_cost boolean DEFAULT false,tira_taxa boolean DEFAULT false,is_deliverable boolean DEFAULT false,delivery_formats text[]);
CREATE TABLE budget_shares(id uuid DEFAULT gen_random_uuid(),budget_id uuid,token uuid DEFAULT gen_random_uuid(),nome text,revogado_em timestamptz,expira_em timestamptz,visitas int DEFAULT 0,visto_em timestamptz,mostrar jsonb);
INSERT INTO clients VALUES ('d3a96591-55b7-4b64-a445-72aaa28eb950','Sicredi Região da Produção'),('e5e9dee9-9a19-4eae-b49e-8fb14f3390c8','Sicredi Sul Minas');
INSERT INTO client_faturamento VALUES ('d3a96591-55b7-4b64-a445-72aaa28eb950','tabela',true,0,0,'[{"nome":"Djêisson","tipo":"%","valor":4}]');
INSERT INTO client_precos(client_id,tipo,preco,ordem,e_diaria) VALUES
 ('d3a96591-55b7-4b64-a445-72aaa28eb950','Pílula',446.6,0,false),
 ('d3a96591-55b7-4b64-a445-72aaa28eb950','Pílula +',761.25,1,false),
 ('d3a96591-55b7-4b64-a445-72aaa28eb950','Vídeo principal',1268.75,2,false),
 ('d3a96591-55b7-4b64-a445-72aaa28eb950','Edição urgente',497.35,3,false),
 ('d3a96591-55b7-4b64-a445-72aaa28eb950','Captação',1928.5,4,true);
INSERT INTO budget_categorias(codigo,nome,ordem) VALUES('007','Equipe',7),('011','Pós',11),('004','Transporte',4);
INSERT INTO budget_item_templates(categoria_codigo,descricao,valor_unitario,custo_unitario,ordem) VALUES
 ('007','Operador(a) de Câmera',100,50,1),('007','1º Assistente de Câmera',50,25,2),('011','Edição / Montagem',90,40,1),('004','Deslocamento',30,10,1);
-- Orçamento preexistente deve permanecer intacto.
INSERT INTO budgets(id,project_name,client_id,total_value,margem_produtora_percent) VALUES('00000000-0000-0000-0000-000000000001','Antigo','d3a96591-55b7-4b64-a445-72aaa28eb950',999,40);
