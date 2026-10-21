# Briefing: edição contínua

O componente `BriefingComVerMais` mantém o textarea durante o autosave e só encerra a edição pelo botão **Concluir edição**. Foco e seleção não são redefinidos a cada salvamento. Ao reabrir, restaura seleção e rolagem; na primeira abertura, posiciona no final. Campo vazio inicia em edição, evitando desmontar depois da primeira digitação. A sessão é reiniciada ao mudar o entregável.

Reutiliza o autosave existente, com gravação pendente solicitada ao concluir. Não altera dados nem exige migração. Se o salvamento falhar, o texto continua disponível.

Validação: seis testes com salvamento assíncrono, rerenderização, campo vazio, perda de foco, reabertura, erro e troca de entregável. A validação conjunta desta versão passou com 140 testes frontend e build isolado com TypeScript e lint de hooks.
