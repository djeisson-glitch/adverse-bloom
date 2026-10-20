# Rastreador DaVinci — edição e alterações

Este código atualiza o auxiliar existente no Mac. Mantém os envios idempotentes e os segundos pendentes. Não altera registros históricos já enviados.

- Edição original, ajustes internos e cada rodada do cliente têm sessões separadas, mesmo no mesmo dia e etapa.
- Alteração do cliente envia `alteracao_id`; o saldo e timesheet existentes reconhecem a associação. Ajuste interno recebe descrição própria, sem virar cobrança de alteração do cliente.
- Só monitora estados de trabalho. Revisão, envio ao cliente e conclusão suspendem novos registros.
- Ao enviar minutos do contexto atual, tenta marcar `em_edicao` com condição de status e `updated_at`, preservando mudanças concorrentes.
- O multiplicador existente no banco continua sendo aplicado; este auxiliar envia somente minutos medidos.
- Trocas de contexto podem descartar até um intervalo de 10 segundos para evitar atribuir tempo à rodada errada. Durante falha de rede mantém o último contexto confirmado para a mesma timeline e etapa; a mudança de rodada remota só será detectada quando a conexão voltar.
- Sessões antigas pendentes mantêm sua classificação original. Não tenta adivinhar retroativamente a qual rodada elas pertencem.

## Atualizar uma instalação existente

1. Execute `python3 install.py` neste diretório. Ele preserva backup privado, extrai a configuração da versão anterior e não substitui `tracking_state.json`.
2. Reinicie o agente existente com `launchctl kickstart -k gui/$(id -u)/com.user.davincitracker`.
3. A barra de menu indica Edição, Ajuste interno ou Alteração. Confirme após ao menos um minuto ativo no DaVinci.

A configuração fica em `~/.davinci_tracker/config.json` com acesso apenas do usuário. Nunca adicionar esse arquivo ao Git. Em outro Mac, use a configuração do próprio usuário.

## Testes sem API

`python3 -m unittest discover -s tools/davinci-tracker -p 'test_*.py' -v`
