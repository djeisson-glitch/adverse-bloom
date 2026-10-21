# Classificação visual de entregáveis

Implementada nesta versão. Migração `20261021170000_classificacao_visual_entregas.sql` deve preceder o frontend. Não habilita IA nem faz chamadas a serviços de classificação.

- Projetos: cidade → tipos de entregáveis. Sem faixa de filtros por formato no topo. Filtros antigos de categoria na URL/sessão não escondem itens.
- Entregas do mês: a mesma hierarquia dentro de cada projeto; filtros de cliente e mês preservados.
- Minha mesa: etiquetas; prioridade e ordem por urgência permanecem iguais.
- Dentro do entregável: etiquetas e **Classificar**, com escolha múltipla manual e retorno a **Automático pelo nome e formato**. A gravação envia exclusivamente `classificacao_visual` e usa as políticas de acesso já existentes.

Categorias: 16×9, Reels, Story, YouTube, Vertical 9×16, Fotos e Outros. Sem sinal explícito, fica **A classificar**. 9×16 não implica Reels ou Story; YouTube não implica 16×9. Peças com vários formatos têm todas as etiquetas e aparecem uma vez no total/grupo, embora possam corresponder a mais de um filtro. Mosaico de fotos não é tratado como entrega fotográfica.

`deliverables.classificacao_visual` é um array opcional: NULL significa classificação automática na leitura; array significa escolha manual. Não há preenchimento em massa, trigger de classificação ou alteração em nome, formato, quantidade, cobrança, contratos, horas ou aprovações. Ao renomear ou ajustar o formato, a classificação automática acompanha; a manual permanece até ser retirada.

Validação: testes de regra, filtros, edição manual, retorno ao automático, falha de gravação e fluxo de edição. Build isolado de produção com TypeScript e lint de hooks. Teste SQL descartável em `supabase/tests/classificacao_visual_entregas.sql`. Prévia com dados demonstrativos, usando a mesma linha e componentes de categoria do sistema, em `http://127.0.0.1:5204/categorias-preview.html`.

Também validado no banco real, em transação revertida: classificação múltipla, retorno ao automático e preservação dos demais dados do entregável.

## Agrupamento por cidade
Reconhecimento local, sem IA e sem chamadas de rede durante uso. A lista de municípios vem da [API de localidades do IBGE](https://servicodados.ibge.gov.br/api/docs/localidades), consultada em 21/10/2026 e incluída em `src/data/municipiosBR.ts`. Apenas segmentos explícitos do título, separados por ` - `, travessão ou `|`, são reconhecidos; aceita UF e variações de acento/caixa. “Campanha de Natal” não implica cidade de Natal. Nomes com mais de uma cidade ficam sem atribuição. Cidades homônimas com UFs explicitamente distintas são separadas.
Peças não reconhecidas ficam em **Sem cidade identificada** quando outras peças têm cidade; se nenhuma tiver, a tela mantém somente os blocos por formato. Não altera os dados persistidos, o número de entregas, o fluxo ou a cobrança.

Cada cidade começa recolhida. O cabeçalho mostra o nome e a contagem e permite expandir/recolher independentemente com clique ou teclado. Atualizações da lista preservam as seções abertas enquanto a tela permanece montada.
