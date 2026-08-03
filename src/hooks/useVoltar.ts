import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Voltar de verdade: desfaz o último passo, em vez de pular pra uma tela fixa.
 *
 * O padrão até aqui era `navigate("/projetos")` — o botão dizia "voltar" e
 * fazia "ir para". Quem entrou numa peça pela lista de Entregas do mês
 * aterrissava no projeto, não na lista, e tinha que refazer o caminho a cada
 * item. Em trabalho repetitivo (revisar 26 entregas de um mês) isso é a
 * diferença entre um clique e cinco.
 *
 * O fallback existe porque nem sempre há passo anterior: link colado no
 * WhatsApp, aba nova, F5 na página. O react-router mantém um índice no
 * history.state; quando ele é 0, esta é a primeira tela da sessão e não há
 * pra onde voltar — aí vale o destino declarado.
 */
export function useVoltar(destinoPadrao: string) {
  const navigate = useNavigate();

  const temHistorico = () => {
    const idx = (window.history.state as any)?.idx;
    return typeof idx === "number" && idx > 0;
  };

  const voltar = useCallback(() => {
    if (temHistorico()) navigate(-1);
    else navigate(destinoPadrao);
  }, [navigate, destinoPadrao]);

  return voltar;
}
