import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  useReportarSalvamento,
  type StatusSalvamento,
} from "@/components/autosave/AutosaveContext";

/**
 * Campo que salva sozinho enquanto se digita — sem botão "Salvar".
 *
 * Dois cuidados que fazem a diferença na prática:
 *
 * 1. Enquanto o campo está sendo editado ele NÃO acompanha o servidor. Como a
 *    tela atualiza em segundo plano a cada 30s, sem isso um refetch no meio da
 *    digitação apagaria o que a pessoa acabou de escrever. Ao terminar de salvar,
 *    o campo volta a seguir o servidor.
 * 2. Se a pessoa sair do campo ou da tela antes do tempo do debounce, grava na
 *    hora — nada de perder edição por sair rápido.
 */
export function useCampoAutosave<T>(
  valorServidor: T,
  salvar: (valor: T) => Promise<unknown> | unknown,
  opts: { delay?: number; ativo?: boolean } = {},
) {
  const { delay = 700, ativo = true } = opts;
  const id = useId();
  const reportar = useReportarSalvamento();

  const [valor, setValor] = useState<T>(valorServidor);
  const [status, setStatus] = useState<StatusSalvamento>("ocioso");

  const sujoRef = useRef(false);
  const valorRef = useRef(valor);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const limpaRef = useRef<ReturnType<typeof setTimeout>>();
  const montadoRef = useRef(true);
  const salvarRef = useRef(salvar);
  salvarRef.current = salvar;
  valorRef.current = valor;

  useEffect(() => {
    if (!sujoRef.current) setValor(valorServidor);
  }, [valorServidor]);

  const mudarStatus = useCallback(
    (s: StatusSalvamento) => {
      if (!montadoRef.current) return;
      setStatus(s);
      reportar?.(id, s);
    },
    [id, reportar],
  );

  const gravar = useCallback(
    async (v: T) => {
      // Cancela o "some daqui a 2s" da gravação anterior — senão ele apagaria
      // o "Salvando…" desta.
      clearTimeout(limpaRef.current);
      mudarStatus("salvando");
      try {
        await salvarRef.current(v);
        sujoRef.current = false;
        mudarStatus("salvo");
        limpaRef.current = setTimeout(() => mudarStatus("ocioso"), 2000);
      } catch {
        // Continua "sujo" de propósito: a edição fica na tela pra não se perder.
        mudarStatus("erro");
      }
    },
    [mudarStatus],
  );

  const aoMudar = useCallback(
    (v: T) => {
      sujoRef.current = true;
      setValor(v);
      valorRef.current = v;
      if (!ativo) return;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => gravar(v), delay);
    },
    [ativo, delay, gravar],
  );

  /** Grava na hora — use no onBlur, quem clica fora já espera que salvou. */
  const aoSair = useCallback(() => {
    if (!sujoRef.current || !ativo) return;
    clearTimeout(timerRef.current);
    gravar(valorRef.current);
  }, [ativo, gravar]);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      clearTimeout(timerRef.current);
      clearTimeout(limpaRef.current);
      // Saiu da tela com edição pendente: dispara e deixa correr.
      if (sujoRef.current) {
        try {
          void salvarRef.current(valorRef.current);
        } catch {
          /* nada a fazer, a tela já foi */
        }
      }
    };
  }, []);

  return { valor, aoMudar, aoSair, status, salvando: status === "salvando" };
}
