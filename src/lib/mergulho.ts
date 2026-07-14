/**
 * Estrutura do Briefing (cliente) + Leitura interna (Adverse).
 * As perguntas do cliente são detalhistas mas práticas. As "lentes" profundas
 * do Método (zeitgeist, tensão…) são INTERNAS — o cliente não vê.
 */

export type CampoTipo = "texto" | "entregas";
/**
 * escopo "marca": pergunta do CLIENTE, não do projeto — respondida uma vez e
 * herdada nos projetos seguintes (não perguntamos de novo). O resto é do projeto.
 */
export type CampoEscopo = "marca" | "projeto";
export type MergulhoCampo = { key: string; label: string; hint?: string; tipo?: CampoTipo; escopo?: CampoEscopo };
export type MergulhoSecao = {
  id: string;
  titulo: string;
  descricao?: string;
  interno?: boolean; // seção só da Adverse (não vai pro formulário do cliente)
  campos: MergulhoCampo[];
};

export const MERGULHO_ESTRUTURA: MergulhoSecao[] = [
  {
    id: "cliente",
    titulo: "Briefing",
    descricao: "Quanto mais contexto você der, melhor a ideia — pode ser detalhista à vontade.",
    campos: [
      { key: "marca", label: "Sobre a marca / empresa", escopo: "marca", hint: "O que vocês fazem, como se posicionam, o tom de voz, o que te diferencia da concorrência." },
      { key: "objetivo", label: "Objetivo deste projeto", hint: "O que precisa acontecer depois que esse material for ao ar? Que resultado vocês querem (vendas, reconhecimento, engajamento…)?" },
      { key: "publico", label: "Quem vocês querem impactar", hint: "O público-alvo: idade, contexto, o que essa pessoa sente, quer ou precisa." },
      { key: "mensagem", label: "Mensagem-chave", hint: "Se a pessoa só puder sair com uma ideia na cabeça, qual é?" },
      { key: "entregas", label: "Quais são as entregas?", tipo: "entregas", hint: "Liste cada vídeo/peça com formato e duração. Adicione quantas precisar." },
      { key: "tom", label: "Tom e referências", hint: "Sério, divertido, emocional, institucional? Cole links de filmes/campanhas que vocês curtem — e por quê." },
      { key: "veiculacao", label: "Onde vai ser veiculado", hint: "Instagram, YouTube, TV, telão de evento, site, treinamento interno…" },
      { key: "nao_pode_faltar", label: "O que não pode faltar / o que evitar", hint: "Elementos obrigatórios (logo, pessoas, produto), restrições de marca, e o que vocês NÃO curtem." },
      { key: "materiais", label: "Vocês já têm algum material?", hint: "Roteiro, logo, fotos, vídeos antigos, manual de marca, dados… (a gente combina como enviar)." },
      { key: "verba_prazo", label: "Verba e prazo (aproximados)", hint: "Ajuda a calibrar a ambição do projeto ao que é viável. Pode ser uma faixa." },
    ],
  },
  {
    id: "interno",
    titulo: "Leitura interna (Adverse)",
    descricao: "As lentes do Método — só do time, o cliente não vê.",
    interno: true,
    campos: [
      { key: "consolidacao", label: "Consolidação do projeto", hint: "Resumo do time com o entendimento do briefing." },
      { key: "pessoa_gesto", label: "A pessoa e o gesto", hint: "Quem é a pessoa real do outro lado? Que gesto/ação concreta a gente quer provocar?" },
      { key: "produto_imaginario", label: "O produto no imaginário", hint: "Que lugar a marca/produto ocupa (ou queremos que ocupe) na cabeça das pessoas?" },
      { key: "momento_marca", label: "O momento da marca", hint: "O que está acontecendo com a marca agora? (lançamento, virada, crise, consolidação)" },
      { key: "zeitgeist", label: "O zeitgeist", hint: "O que está no ar na cultura / no mercado que conversa com isso?" },
      { key: "tensao", label: "A tensão", hint: "O conflito central: eles querem X, mas Y. Qual a verdade incômoda?" },
    ],
  },
];

export const SECOES_CLIENTE = MERGULHO_ESTRUTURA.filter((s) => !s.interno);
export const CAMPOS_CLIENTE = SECOES_CLIENTE.flatMap((s) => s.campos);

/** Perguntas da marca (uma vez por cliente) e do projeto (toda vez). */
export const CAMPOS_MARCA = CAMPOS_CLIENTE.filter((c) => c.escopo === "marca");
export const CAMPOS_PROJETO = CAMPOS_CLIENTE.filter((c) => c.escopo !== "marca");

/**
 * O mergulho é jsonb: um campo de texto pode chegar como objeto/array/número se
 * alguma versão antiga (ou a IA) gravou torto. Renderizar isso cru derruba o
 * React ("Objects are not valid as a React child") e a tela fica preta.
 * Aqui a gente sempre devolve string.
 */
export function textoDoCampo(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Uma resposta conta como preenchida? (texto não-vazio ou ao menos 1 entrega) */
export function campoRespondido(dados: Record<string, any>, campo: MergulhoCampo) {
  const v = dados?.[campo.key];
  if (campo.tipo === "entregas") return Array.isArray(v) && v.length > 0;
  return textoDoCampo(v).trim().length > 0;
}

export function secaoRespondida(dados: Record<string, any>, secao: MergulhoSecao) {
  return secao.campos.some((c) => campoRespondido(dados || {}, c));
}
