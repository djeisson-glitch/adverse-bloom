# Controle do contrato no cliente

Usa client_contratos (o mesmo cadastro do Faturamento), producao_saidas, deliverables_criacao e deliverables_faturamento. Não replica projetos nem peças. Contratos antigos por nome em contratos_recorrentes e planos de catálogo não são vinculados automaticamente por correspondência de nomes.

## Aplicação

1. Aplicar a migration 20261013210000_painel_contrato_cliente.sql no Supabase autorizado.
2. IA desativada: não publicar ler-contrato nem o assistente GPT. O contrato é preenchido manualmente; o anexo continua disponível para consulta.
3. Publicar o frontend e verificar Clientes → cliente → Contrato.
4. Anexar o contrato real, preencher a vigência, as franquias e as regras e salvar. Nenhum contrato real foi lido na implementação.

Salvar usa a mesma tabela operacional, configura client_faturamento.modelo=contrato e é transacional. Salvar novamente reutiliza o contrato ativo mais recente. Contratos encerrados continuam no banco. Documento privado, até 10 MB, PDF/TXT; download autenticado/signed URL de 60s. Nenhuma leitura por IA está disponível nesta versão.

## Regras operacionais

- Diárias não canceladas contam pela maior fração por data/cliente/balde, igual ao fechamento. Inclui programadas e realizadas.
- Entregáveis não cancelados/reprovados contam por registro, com o mês determinado pela data efetiva do projeto. Não somar quantidade de orçamento: a fonte é a peça cadastrada.
- A view de faturamento resolve exceção da peça antes da classificação do projeto.
- O painel respeita início/fim. Franquias integrais por mês-calendário; janela móvel de acumulo_meses. Não implementa rateio ou regras arbitrárias extraídas de texto. Estas ficam explícitas para conferência. O painel não gera cobranças nem modifica o cálculo financeiro existente.
- Sem início informado, mostra apenas o mês selecionado, sem supor crédito de meses anteriores.
- Orçamento armazena cobrança em proposta.faturamento. Novo projeto herda o balde. Uma mudança explícita do orçamento atualiza os projetos vinculados; edições de texto não reclassificam. Exceções individuais nas peças permanecem.

## Validação

Testes unitários do saldo/janelas e handler real de IA com rede simulada. Teste SQL reproduzível em supabase/tests/contrato_cliente (banco vazio descartável, não produção). Prévia com dados fictícios validou filtro, revisão obrigatória e salvamento. Integração com o provedor real e RLS no Supabase de destino dependem da publicação e teste com o anexo autorizado.
