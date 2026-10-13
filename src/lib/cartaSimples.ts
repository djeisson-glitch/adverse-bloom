import { resumirPlanilha, type LinhaPlanilha, type CategoriaPlanilha } from "./resumoPlanilha";

export const EXIBICAO_CARTA = { itens: true, quantidade: false, valorLinha: false, unitario: false, criacao: true, emissao: true, validade: true, condicoes: true, inclusos: true, entregas: true };
export type TextosCartaSimples = { ac: string | null; briefing: string | null; condicoes: string | null; incl: string[] | null; naoIncl: string[] | null; entregas: string[] | null };
export type EdicaoCartaSimples = { textos: TextosCartaSimples; ver: typeof EXIBICAO_CARTA; detalhada: boolean };
export function edicaoCartaSimples(salvo?: Partial<EdicaoCartaSimples> | null): EdicaoCartaSimples {
  return {
    textos: { ac: null, briefing: null, condicoes: null, incl: null, naoIncl: null, entregas: null, ...salvo?.textos },
    ver: { ...EXIBICAO_CARTA, ...salvo?.ver }, detalhada: salvo?.detalhada ?? false,
  };
}

export function diariasDaCarta(budget: { entregas?: { diarias?: number | string | null }[]; capture_days?: number | null; categorias_ocultas?: string[] }, itens: LinhaPlanilha[], categorias: CategoriaPlanilha[]) {
  const escopo = (Array.isArray(budget.entregas) ? budget.entregas : []).reduce((n, e) => n + Math.max(0, Number(e.diarias) || 0), 0);
  // Mesma precedência usada ao converter o orçamento em projeto; a planilha
  // cobre orçamentos que ainda não preencheram as diárias no escopo.
  return escopo || Number(budget.capture_days) || resumirPlanilha(itens, categorias, [], new Set(budget.categorias_ocultas || [])).diarias;
}
