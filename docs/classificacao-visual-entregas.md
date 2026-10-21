# Classificação visual de entregáveis

Implementada nesta versão. Migração `20261021170000_classificacao_visual_entregas.sql` deve preceder o frontend. Não habilita IA nem faz chamadas a serviços de classificação.

- Projetos: grupos por categoria e filtros com contagem. O modo lista corrida continua disponível. Filtro preservado na URL e na sessão por projeto.
- Entregas do mês: mesmo filtro, combinado com cliente e mês. Contagem do filtro considera o cliente selecionado.
- Minha mesa: etiquetas; prioridade e ordem por urgência permanecem iguais.
- Dentro do entregável: etiquetas e **Classificar**, com escolha múltipla manual e retorno a **Automático pelo nome e formato**. A gravação envia exclusivamente `classificacao_visual` e usa as políticas de acesso já existentes.

Categorias: 16×9, Reels, Story, YouTube, Vertical 9×16, Fotos e Outros. Sem sinal explícito, fica **A classificar**. 9×16 não implica Reels ou Story; YouTube não implica 16×9. Peças com vários formatos têm todas as etiquetas e aparecem uma vez no total/grupo, embora possam corresponder a mais de um filtro. Mosaico de fotos não é tratado como entrega fotográfica.

`deliverables.classificacao_visual` é um array opcional: NULL significa classificação automática na leitura; array significa escolha manual. Não há preenchimento em massa, trigger de classificação ou alteração em nome, formato, quantidade, cobrança, contratos, horas ou aprovações. Ao renomear ou ajustar o formato, a classificação automática acompanha; a manual permanece até ser retirada.

Validação: testes de regra, filtros, edição manual, retorno ao automático, falha de gravação e fluxo de edição. Build isolado de produção com TypeScript e lint de hooks. Teste SQL descartável em `supabase/tests/classificacao_visual_entregas.sql`. Prévia com dados demonstrativos, usando a mesma linha e componentes de categoria do sistema, em `http://127.0.0.1:5204/categorias-preview.html`.

Também validado no banco real, em transação revertida: classificação múltipla, retorno ao automático e preservação dos demais dados do entregável.
