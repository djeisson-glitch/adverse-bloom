import { emDiasISO } from "./dataLocal";

/**
 * A régua da nutrição de leads.
 *
 * Ela existe DUAS vezes de propósito: aqui e em `public.lead_cadencia_dias()`.
 * O banco é quem manda — ele aplica a cadência a cada interação, por qualquer
 * caminho. Esta cópia serve só pra tela poder mostrar a data JÁ PREENCHIDA no
 * formulário, que foi o pedido: "deixa um campo de data já preenchido com o
 * valor calculado e editável".
 *
 * Como toda regra duplicada, ela vale o que valem os testes: o
 * `leadCadencia.test.ts` trava os três números, e o dia em que alguém mudar a
 * cadência num lado só, o teste é o que avisa.
 */
export const CADENCIA_DIAS: Record<string, number> = {
  quente: 30,
  morno: 60,
  frio: 75,
};

/** Dias até o próximo toque. Temperatura desconhecida cai no mais frouxo. */
export function cadenciaDias(temperatura: string | null | undefined): number {
  return CADENCIA_DIAS[temperatura || ""] ?? 75;
}

/** A data que o formulário sugere: hoje + a cadência da temperatura. */
export function proximoToquePadrao(temperatura: string | null | undefined): string {
  return emDiasISO(cadenciaDias(temperatura));
}

/**
 * Dias de atraso de um toque. 0 = é hoje, negativo nunca sai daqui (futuro
 * vira 0), porque quem chama quer contar atraso, não adiantamento.
 */
export function diasDeAtraso(proximoToque: string | null | undefined, hoje: string): number {
  if (!proximoToque) return 0;
  const ms = new Date(hoje + "T00:00:00").getTime() - new Date(proximoToque + "T00:00:00").getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

/** "hoje" · "3 dias atrasado" — o que a Minha mesa mostra na linha do lead. */
export function rotuloAtraso(proximoToque: string | null | undefined, hoje: string): string {
  const d = diasDeAtraso(proximoToque, hoje);
  if (d === 0) return "hoje";
  return d === 1 ? "1 dia atrasado" : `${d} dias atrasado`;
}
