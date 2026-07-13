/**
 * Estrutura do Mergulho / Briefing estratégico (Método Adverse).
 * Base enxuta (sempre) + Mergulho profundo (opcional, as 5 lentes).
 * Usada pelo formulário público, pela edição interna e pela leitura no projeto.
 */

export type MergulhoCampo = { key: string; label: string; hint?: string };
export type MergulhoSecao = {
  id: string;
  titulo: string;
  descricao?: string;
  opcional?: boolean;
  campos: MergulhoCampo[];
};

export const MERGULHO_ESTRUTURA: MergulhoSecao[] = [
  {
    id: "base",
    titulo: "O essencial",
    descricao: "O suficiente pra gente entender o projeto e orçar com segurança.",
    campos: [
      { key: "marca", label: "Sobre a marca / empresa", hint: "O que vocês fazem, como se posicionam, o tom de voz." },
      { key: "objetivo", label: "Objetivo do projeto", hint: "O que precisa acontecer depois que esse material for ao ar? Qual resultado?" },
      { key: "publico", label: "Público-alvo", hint: "Quem a gente precisa impactar? (idade, contexto, o que sente/quer)" },
      { key: "mensagem", label: "Mensagem-chave", hint: "A única coisa que a pessoa tem que sair sabendo ou sentindo." },
      { key: "nao_pode_faltar", label: "O que não pode faltar / o que evitar", hint: "Elementos obrigatórios, restrições de marca, o que vocês não curtem." },
      { key: "referencias", label: "Referências", hint: "Links, filmes, campanhas que vocês admiram (e por quê)." },
      { key: "entregas", label: "Entregas desejadas e onde vai veicular", hint: "Quantos vídeos, formatos, canais (Instagram, TV, evento, YouTube…)." },
      { key: "verba_prazo", label: "Verba e prazo (aproximados)", hint: "Ajuda a calibrar a ambição do projeto ao que é viável." },
    ],
  },
  {
    id: "mergulho",
    titulo: "Mergulho profundo",
    descricao: "As lentes do Método Adverse — pra projetos maiores, quando queremos cair de cabeça na marca. Opcional.",
    opcional: true,
    campos: [
      { key: "pessoa_gesto", label: "A pessoa e o gesto", hint: "Quem é a pessoa real do outro lado? Que gesto/ação concreta a gente quer provocar nela?" },
      { key: "produto_imaginario", label: "O produto no imaginário", hint: "Que lugar a marca/produto ocupa (ou queremos que ocupe) na cabeça das pessoas?" },
      { key: "momento_marca", label: "O momento da marca", hint: "O que está acontecendo com a marca agora? (lançamento, virada, crise, consolidação)" },
      { key: "zeitgeist", label: "O zeitgeist", hint: "O que está no ar na cultura / no mercado que conversa com isso?" },
      { key: "tensao", label: "A tensão", hint: "O conflito central: eles querem X, mas Y. Qual a verdade incômoda que ninguém diz?" },
    ],
  },
];

/** Retorna true se houver ao menos uma resposta preenchida na seção. */
export function secaoRespondida(dados: Record<string, any>, secao: MergulhoSecao) {
  return secao.campos.some((c) => (dados?.[c.key] || "").toString().trim().length > 0);
}
