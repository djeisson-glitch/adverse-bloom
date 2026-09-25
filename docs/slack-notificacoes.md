# Slack do Adverse OS

Workspace solicitado: **djeisson.slack.com**. Destinos: mensagens diretas e **#adverse-os** (criado: `C0C4C81TC3X`). A implementação começa desativada; não envia o histórico anterior à ativação. Instalar o plugin Slack no Codex não instala este aplicativo nem conecta o backend.

## Comportamento

- Usa os destinatários e as preferências existentes do sistema. `sino`, `off` e nível 3 não enviam pelo Slack. Não altera Web Push nem marca avisos como lidos.
- Nível 1: cron de um minuto, sujeito à fila / disponibilidade. Nível 2: resumos agrupados por destino nos horários globais de São Paulo; novas tentativas podem sair fora dessa janela.
- DM: todos os tipos elegíveis para a pessoa vinculada. Canal: apenas grupos `producao`, `prazos`, `conversas`. Comercial e resumo pessoal de IA ficam nas DMs.
- Vários destinatários do mesmo evento (mesma chave, conteúdo e timestamp da transação) geram uma única entrada de canal. Eventos de transações distintas continuam distintos.
- Registro individual por destino. Confirmação significa aceite pelo Slack, não leitura nem entrega de notificação pelo aplicativo no celular.
- Até oito tentativas, espera progressiva, `Retry-After` respeitado e falhas permanentes visíveis. Gestão pode reenfileirar uma falha após corrigir a causa.
- Um worker por workspace com reserva de cinco minutos; execução interrompida é retomada. Se o Slack aceitar e a confirmação no banco falhar, uma repetição é possível após recuperação: a API não oferece uma transação conjunta com o Postgres. Não há promessa de entrega exatamente uma vez.
- Antes do envio, cancela itens lidos/resolvidos, pessoas inativas, tipos silenciados e destinos trocados. Pausar globalmente retém a fila; novos eventos durante a pausa não são incluídos. Um envio já em andamento pode terminar.
- Lotes de dez entradas para limitar duração; cada grupo respeita intervalo de 1,1s. Volume alto pode criar mais de uma mensagem de resumo.

## Instalação e manutenção

1. Criar o app em https://api.slack.com/apps usando `docs/slack-app-manifest.json` no workspace **djeisson.slack.com**. Revisar e autorizar a instalação. Permissões: publicar como bot, abrir DMs, validar membros e consultar metadados de canais; não solicita leitura de histórico de mensagens.
2. O canal **#adverse-os** foi criado em 25/09/2026, público interno conforme autorização do usuário, no workspace `T0C4LR6MBB6`. Adicionar o app ao canal `C0C4C81TC3X` e escolher os membros da equipe que devem acompanhar. A aplicação recusa canais compartilhados externamente.
3. Guardar `SLACK_BOT_TOKEN` (Bot User OAuth Token), `SLACK_WORKER_SECRET` (segredo aleatório de pelo menos 32 bytes) e `APP_URL=https://adverse-bloom.vercel.app` nos **Edge Function Secrets** do Supabase **ythmkxudzaoaayxxlgqy**. Não colocar tokens no frontend, git, prints ou chat.
4. No Supabase Vault, criar um segredo chamado **slack_worker_secret** com o MESMO valor de `SLACK_WORKER_SECRET`. O cron usa esse segredo para autenticar; não usa a chave pública do aplicativo. O cron não faz nada sem o segredo no Vault.
5. Aplicar `20260925120000_slack_notificacoes.sql` após revisar a lista de migrações pendentes, e publicar a função `slack-notificacoes`. A configuração `verify_jwt=false` é intencional: ações administrativas validam JWT com `auth.getUser` e `pode_admin_notif`; o worker aceita somente seu segredo específico.
6. Publicar o frontend. Em **Notificações do time** (`/admin/notificacoes`), vincular IDs de membros, conferir os nomes retornados e salvar o ID do canal. O app precisa já ser membro do canal.
7. Usar **Enviar teste para mim** e **Enviar teste ao canal**. Esses botões enviam mensagens reais mesmo antes da ativação global. Depois, ativar os envios e criar uma pendência de teste controlada para confirmar o percurso completo pelo cron e a atualização no painel.
8. Confirmar no Slack os dois destinos e no painel as confirmações. Não declarar a integração ativa antes desse teste real.

## Verificação local

`npm run build` e `npm test` cobrem o frontend e o núcleo da integração.

Para as verificações de banco, usar exclusivamente um Postgres descartável:

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/slack_fixture.sql \
  -f supabase/migrations/20260925120000_slack_notificacoes.sql \
  -f supabase/tests/slack_fila.sql
```

A fixture simula as tabelas/funções preexistentes e a função de agendamento. Não valida o serviço pg_net, o Vault ou a execução hospedada. O teste transacional cobre reserva concorrente, reconhecimento por token, backoff, recuperação, privacidade do comercial, separação de destinos e cancelamento. Não executar a fixture em produção.

Referências: https://docs.slack.dev/reference/methods/chat.postMessage/ · https://docs.slack.dev/reference/methods/conversations.open/ · https://docs.slack.dev/apis/web-api/rate-limits/

## Estado verificado em 25/09/2026

- Workspace `T0C4LR6MBB6`; app instalado `A0C4HA50W5Q`; canal `C0C4C81TC3X`, público interno conforme autorização do usuário.
- Bot incluído no canal. Djêisson vinculado (`U0C4K3R5RQ9` no Slack). O workspace tem apenas esse membro humano ativo; José e Maiara ainda precisam entrar e ser vinculados para receber DMs.
- Migração aplicada e função publicada no Supabase. Credencial do bot e segredo exclusivo configurados nos Edge Secrets e Vault; cron habilitado.
- Build concluído, 174 testes passando (17 novos), 18 verificações SQL em Postgres descartável e verificação Deno aprovada.
- Função hospedada recusa chamadas anônimas de configuração e envio com HTTP 401; aceita o segredo específico do worker.
- Integração ativada. Teste controlado processado pelo cron em 25/09/2026 às 14h59 (São Paulo): DM e canal aceitos na primeira tentativa, sem erro. Confirmações Slack `1790359140.870639` (DM) e `1790359142.580779` (canal).
