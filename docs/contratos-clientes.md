# Controle do contrato no cliente

Usa client_contratos (o mesmo cadastro do Faturamento), producao_saidas, deliverables_criacao e deliverables_faturamento. Não replica projetos nem peças. Contratos antigos por nome em contratos_recorrentes e planos de catálogo não são vinculados automaticamente por correspondência de nomes.

## Aplicação

1. Aplicar a migration 20261013210000_painel_contrato_cliente.sql no Supabase autorizado.
2. IA desativada: não publicar ler-contrato nem o assistente GPT. O contrato é preenchido manualmente; o anexo continua disponível para consulta.
3. Publicar o frontend e verificar Clientes → cliente → Contrato.
4. Anexar o contrato real, preencher a vigência, as franquias e as regras e salvar. O contrato SLC foi conferido e cadastrado em 13/10/2026, com início operacional informado pelo usuário em 01/02/2026.

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

## Créditos por competência (migration 20261013230000)

- Contratos com `validade_creditos_dias` usam `calcularCreditos` (frontend); os demais preservam a janela legada. A migration configura apenas o contrato SLC de 01/02/2026 a 31/01/2027: 60 dias, teto 2 diárias/16 entregas, vídeos e fotos compartilhando as 8 entregas mensais conforme confirmação do usuário em 13/10/2026.
- Cada mês libera uma franquia integral, na competência (ou início da vigência se parcial). Validade conta do primeiro dia da competência; a data de expiração é exclusiva. Exemplo: crédito de 01/02/2026 pode ser usado até 01/04/2026; expira em 02/04/2026. Não é uma janela de dois meses.
- Processamento cronológico: expirar → liberar competência → aplicar teto → consumir. Consumo usa FIFO; quando a liberação excede o teto, remove o saldo mais antigo primeiro, registrado separadamente. Excedentes não são compensados por concessões futuras. Créditos também deixam de estar disponíveis após o fim da vigência.
- O mês atual abre com saldo na data de hoje; meses anteriores no último dia; datas futuras indicam projeção. Captações futuras ficam listadas sem consumir antes da data marcada. Datas de peças seguem `deliverables_criacao`, preservando a regra operacional existente.
- `deliverables.tipo_midia` confirma vídeo/foto/outro sem alterar faturamento, título ou status. Sem confirmação, títulos inequivocamente de foto/vídeo são classificados para cálculo; ambíguos ficam pendentes e tornam o saldo provisório. Registros que são tarefas/marcos não são vídeos. No modo `video_foto`, cada peça de fotos ou vídeo consome uma unidade do mesmo saldo. Uma peça de fotos não é multiplicada pelo número de imagens. No modo `video`, fotos não consomem créditos. Marcos, tarefas e outros tipos não consomem franquias de mídia.
- Extrato por competência mostra liberado, usado, expirado, retirado pelo teto e disponível. Auditoria: liberado = usado + expirado + retirado + saldo; consumo = usado nos lotes + excedente.
- O painel não gera cobranças. Fechamentos financeiros já salvos conservam os valores e o snapshot anterior, agora rotulado como tal e com link para o saldo atualizado no contrato. Esta mudança não recalcula cobranças antigas nem muda a geração financeira de excedentes.
- Publicação: aplicar a migration, publicar o frontend aprovado, confirmar SLC e classificar eventuais pendências históricas antes de cobrar excedentes. IA segue desativada.
- Testes: `npm test -- src/lib/creditosContrato.test.ts src/lib/consumoContrato.test.ts`; `supabase/tests/contrato_cliente/creditos.sql` no fixture isolado após a migration.

A visão geral distingue saldo utilizável agora, próximo vencimento, total nominal contratado, franquias já liberadas, consumo e liberações futuras. Não soma futuro ao saldo disponível. Vídeos e entregas de fotos têm contadores separados, mesmo quando compartilham os créditos. O saldo é sinalizado como provisório enquanto houver peças sem tipo definido.

## Execução do contrato inteiro (ajuste de 13/10/2026)

O destaque agora é **total contratado − execução concluída**: SLC tem 96 entregas compartilhadas (vídeos + entregas de fotos) e 12 diárias. O mês selecionado não altera esse resumo, consultado separadamente até hoje. `entregue` e o estado final legado `aprovado` contam como concluídos; `pronto`, `com_cliente`, edição e revisão não descontam. Diárias descontam somente a fração marcada como `realizada`; a migration `20261014000000` acrescenta a maior fração realizada por data/balde, sem mudar o agrupamento do extrato anterior. Trabalhos à parte e registros cancelados não entram.

A apuração usa os estados atuais dos registros e a vinculação à vigência pela data efetiva do projeto (peças) ou captação (diárias). Não é uma reconstrução histórica da data de aprovação. Peças concluídas sem tipo deixam o total provisório, com confirmação manual no painel. Créditos expirados e tetos não são subtraídos desse indicador de execução. O controle mensal e o extrato de validade permanecem recolhidos em “Uso por mês e validade dos créditos”, sem gerar cobranças ou mudar o fechamento financeiro.
