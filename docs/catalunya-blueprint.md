# Blueprint Catalunya OS — fonte de verdade do rebuild

Captura sistemática do catalunyaos.com (conta do Djeisson) para reconstruir
fiel dentro do adverse-bloom. Cada seção descreve a tela real: estrutura,
campos, estados e o que cada ação faz.

> **Legenda**
> - ✅ = já bate no adverse-bloom
> - ⚠️ = existe mas diferente do Catalunya (corrigir)
> - ❌ = falta
> - ➕ = **extensão do Djeisson além do Catalunya** (não existe no Catalunya; veio do outro sistema de referência)

---

## 0. Navegação (sidebar)

**PRODUÇÃO**: Início · Orçamentos · Projetos (`/jobs`) · Fechamento · Pós-Produção · Pauta · Calendário (`/jobs?view=calendar`) · Horas · Timesheet · Capacidade · Planejamento · Previsão
**GESTÃO**: Clientes · Contas / Fees (`/contas`) · Fornecedores · Follow-ups · Faturamento · Relatórios · Time (`/funcionarios`) · Admin
**Rodapé**: Portal Publi Advisor (`/portal`) · Guia
**Topbar**: busca · botão **Apontar** (timer global, popover) · Notificações · Minha conta · Sair

Rotas reais: projetos = `/jobs`, `/jobs/:id`; peças = `/jobs/:id/pecas`;
relatório do projeto = `/relatorios/projeto/:id`; time = `/funcionarios`;
contas/fees = `/contas`.

---

## 1. Orçamentos (`/orcamentos`)

Board com **7 colunas** (não 5!):
1. 🟢 **Lead / Pedido Recebido**
2. ✍️ **Em Elaboração**
3. 📤 **Proposta Enviada**
4. 🤝 **Negociação**
5. ☑️ **Aceite**
6. 🏆 **Fechado – Ganho**  ← ✅ adicionado como estágio separado (helper `isWonStage`)
7. **Perdido**

Header: "N abertos · pipeline R$ X". Toggle **Board / Lista** (`?view=list`). Botão **Novo**.
Card mostra: cliente (linha pequena), título do orçamento, valor.

### 1a. Novo orçamento (`/orcamentos/novo`)
"Entrada do pedido — o orçamento começa no estágio 'lead'." Campos:
- **Título do orçamento*** (texto)
- **Cliente** (select) **ou novo cliente** (texto)
- **Canal de entrada**: E-mail · Indicação · Site · Redes sociais · Whatsapp · Cliente ativo · Prospecção BDR · Outro
- **Tipo de orçamento**: Geral · Só produção · Só pós-produção · Fotos · IA
- **Roteiro**: Já possui · Precisa de produção · Não precisa · Em construção
- **Elenco**: Sim · Não · Modelo de mão
- **Local da filmagem** (texto) · **Moeda** (BRL/USD)
- **Objetivo do vídeo** (textarea)
- **Formatos** (checkboxes): 16x9 · 9x16 · 1x1 · 4x5 · outro
- **Meio de veiculação** (checkboxes): Internet · Televisão · TV Fechada · Rádio · Mídia outdoor · Cinema · Festivais · PDV · Streaming (Spotify) · Eventos internos e externos · Todos os meios · full buyout
- **Verba estimada** · botão **Criar orçamento**

Diferenças vs adverse-bloom: ✅ opções de canal/tipo/roteiro/elenco corrigidas em `src/lib/orcamento-constants.ts` pra bater exatamente com as de cima.

### 1b. Editor do orçamento (`/orcamentos/:id`)
Blocos, de cima pra baixo:
- **Header**: cliente · título · badge do estágio. Botões: **Enviar proposta** · **Ganhar → gerar Job** (vira "Job #0001 gerado" quando ganho, com banner "Job #0001 gerado a partir deste orçamento") · **Perder**. Texto: "Ganhar/Perder geram automaticamente um follow-up para +60 dias na agenda."
- **Discussão do orçamento** (contador) — chat com "Tire dúvidas, alinhe valores e anexe documentos aqui." (tem anexo)
- **Planilha de produção** — badge "Salvo" · botão **Usar como proposta**. Cabeçalho de cálculo:
  - CUSTO DE PRODUÇÃO (soma) · MARGEM DA PRODUTORA `%` = R$ (sobre custo fora dos itens "tirar da taxa") · DIREÇÃO DE CENA `%` = R$ (sobre custo de produção) · IMPOSTO `%` = R$ (sobre custos+margem+direção) · **VALOR TOTAL**
  - **13 categorias** numeradas (001…013), colapsáveis, cada uma com contagem de itens e total. Valores podem ser **negativos** (ex.: crédito/desconto). Colunas por item: descrição · QTD · **DIÁRIA** (ou **HORAS** na categoria de pós) · VALOR UNIT. · VALOR (= qtd×diária×unit; diária 0 → R$0) · OBSERVAÇÕES · **T. TAXA** (tirar da taxa). Row "Adicionar item em [categoria]".
  - ⚠️ eu tinha 11 categorias; são 13. Preciso capturar os nomes das 13 (expandir cada uma).
  - ⚠️ bug atual: insert usa `unit_price` (dropado) e omite `category` (NOT NULL) → não salva.
  - ⚠️ `diária||1` faz 0 virar 1 — errado, deve ser 0→R$0.
- **Composição por horas** — "+ função…" (do rate card) + custos. Total de horas · Preço (receita) · Custo estimado · Margem prevista.
- **Follow-ups agendados** — lista (data · tipo · descrição).
- **BRIEFING** (mesmos campos do Novo) + **Verba estimada · Valor de proposta · Valor final aprovado** · Salvar alterações.

Status adverse-bloom: ✅ estrutura próxima; ✅ estágios (7, com "Fechado – Ganho"); ✅ bug de save e falsy-zero corrigidos (PR #38); ⚠️ ainda 11 categorias (faltam 012/013 — capturar nomes).

---

## 2. Projeto / Job (`/jobs/:id`)  ← CORAÇÃO

**Header**: `0001` · Cliente · Título. Botões: **Peças** · **Horas por pessoa/tarefa** · **Apontar no projeto**.
Linha de infos: **Status** (aguardando início) · **Valor** · **Custo/hora** (R$ 40,00) · **Diretor**. **Equipe:** avatares.

- **LISTA DE TAREFAS (N)** — tarefas inline com: nome (emoji+texto), responsável, prazo, prioridade (Urgente/Alta/Normal/Baixa), ESTIM., RASTREADO (timer), status próprio (aguardando início → em andamento → aprovação interna → aguardando cliente → aprovado → finalizado). Row "Adicionar".
- **ENTREGÁVEIS** — no Catalunya é **inline e simples**: nome · formato (16x9) · duração (60 Segundos / 30") · dropdown de status (pendente/aguardando início/em andamento/aprovação interna/aguardando cliente/aprovado/finalizado). Botão "+ Entregável" (nome/formato/duração/link Frame.io). **Sem página de detalhe própria, sem timesheet por entregável, sem alterações, sem aprovação em níveis.** ➕ Tudo isso é extensão do Djeisson.
- **Fechamento — Orçado × Realizado** (inline no job): tabela Horas/Receita/Custo/Margem em 2 colunas. "Realizado = valor do projeto − (custo de cada pessoa: horas × custo/hora dela) − custos diretos. Orçado vem da composição do orçamento de origem."
- **CUSTO DA EQUIPE (REALIZADO)**: Pessoa · Horas · Custo/hora (BRL, editável) · Custo. Pessoa aparece mesmo sem horas. Custo/hora é DA PESSOA (vale em todos os projetos). **Custo/hora padrão do projeto — fallback**.
- **CUSTOS DIRETOS LANÇADOS**: tipo (Fornecedor/Produção/Equipamento/Outro) · descrição · valor · "+ Custo".
- **Faturamento**: "Falta faturar: R$ X" + gerar fatura.
- **Comentários (N)**: "@nome para mencionar."

Status adverse-bloom: ✅ recriado bem (single-page); ⚠️ eu troquei entregáveis-inline por página de detalhe (que é a extensão ➕). Manter as duas visões: linha simples no job + detalhe rico (extensão).

### 2a. Peças (`/jobs/:id/pecas`)
Grid: PEÇA · STATUS · CARTELA · VERSÃO · VIGÊNCIA · LOCUTOR · HORAS · RESP. Editável na célula; horas vêm do apontamento. ✅

### 2b. Relatório do projeto (`/relatorios/projeto/:id`)
KPIs: Horas mapeadas · Pessoas · Tarefas com horas · Valor. Barras por pessoa e por tarefa. ✅

---

## 3. Fechamento (`/fechamento`)
Lista por projeto: PROJETO · ESTADO (Em previsão/Fechado) · HORAS · CUSTOS TOTAIS · VALOR TOTAL · MARGEM FINAL. "Custos totais = realizado lançado (ou planejado da planilha enquanto em previsão)." ✅ (⚠️ bug de linha duplicada no adverse-bloom)

---

## 4. Horas / Timesheet / Capacidade / Planejamento / Previsão / Pós-Produção / Pauta / Calendário
_(a capturar em detalhe — já tenho visão geral das versões anteriores; revisar campo a campo)_

## 5. Clientes / Contas-Fees / Fornecedores / Follow-ups / Faturamento / Relatórios / Time / Admin / Portal / Guia
_(a capturar)_

---

## Extensões do Djeisson (além do Catalunya) ➕

Vêm do outro sistema de referência (tela "Oportunidade teste / Filme principal 60\"") + pedidos diretos:
1. **Entregável como página própria** com: timesheet próprio, **alterações do cliente** rastreáveis (R1/R2), **aprovação em 2 níveis** (N1/N2 + cliente), card **edição pura × alteração cliente**, "Canal da peça" (chat do entregável).
2. **Minha mesa** — painel do editor (meus vídeos por etapa) e do aprovador (aguardando minha aprovação).
3. **Portal do cliente** logável — aprovar / pedir ajuste / ver etapa.
4. **Settings de aprovação** (N1/N2 global + override por projeto).
5. **Projeto**: seções Briefing macro + Documentos (links); comentários por contexto (projeto/tarefa).

Status: já construído nas Ondas 5–6 (precisa migration aplicada + ajustes de fidelidade).

---

## Próximos passos da captura
- [ ] Nomes exatos das 13 categorias da planilha (expandir cada)
- [ ] Horas, Timesheet, Capacidade, Planejamento, Previsão (campo a campo)
- [ ] Pós-Produção, Pauta, Calendário
- [ ] Clientes, Contas/Fees, Fornecedores, Follow-ups, Faturamento, Relatórios
- [ ] Time (/funcionarios), Admin, Portal, Guia
- [ ] Início (dashboard) — KPIs e widgets
