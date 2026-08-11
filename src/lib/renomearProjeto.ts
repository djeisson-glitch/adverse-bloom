/**
 * A janela pra renomear projeto.
 *
 * Djêisson (11/08/2026): "acho que podemos deixar com 30 min de tolerância
 * entre a criação pra editar o nome (assim evita que alguém tenha iniciado
 * com o nome antigo)."
 *
 * O nome do projeto vira pasta no Drive, timeline no DaVinci e assunto de
 * e-mail. Renomear depois que o trabalho começou não conserta nada — cria
 * duas verdades, uma no sistema e outra no HD de quem já baixou. Nos
 * primeiros 30 minutos ninguém começou, e é a janela em que o erro de
 * digitação aparece.
 *
 * Espelha `public.janela_renomear_minutos()`. Quem manda é o banco: a trava
 * está num trigger, porque esconder o botão não impede a API.
 */
export const JANELA_RENOMEAR_MIN = 30;

/** Minutos que ainda restam da janela. 0 = fechou. */
export function minutosRestantes(createdAt: string | null | undefined, agora = Date.now()): number {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 0;
  const passados = (agora - t) / 60000;
  return Math.max(0, Math.ceil(JANELA_RENOMEAR_MIN - passados));
}

/** A janela ainda está aberta? */
export function dentroDaJanela(createdAt: string | null | undefined, agora = Date.now()): boolean {
  return minutosRestantes(createdAt, agora) > 0;
}
