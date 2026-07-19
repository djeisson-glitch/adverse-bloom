import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  useReportarSalvamento,
  type StatusSalvamento,
} from "@/components/autosave/AutosaveContext";

/**
 * Autosave pra telas que já têm um `form` único com um patcher (`set({campo: v})`).
 *
 * Junta os patches de uma rajada de digitação e grava UMA vez, mandando só os
 * campos que mudaram — nunca a linha inteira. Isso evita sobrescrever com valor
 * velho um campo que outra pessoa mexeu ao mesmo tempo.
 *
 * Se a gravação falhar, o patch volta pra fila: a próxima tentativa leva junto
 * o que não foi, em vez de perder a edição.
 */
export function useFormAutosave<P extends Record<string, unknown>>(
  salvar: (patch: Partial<P>) => Promise<unknown> | unknown,
  opts: { delay?: number } = {},
) {
  const { delay = 800 } = opts;
  const id = useId();
  const reportar = useReportarSalvamento();
  const [status, setStatus] = useState<StatusSalvamento>("ocioso");

  const pendenteRef = useRef<Partial<P>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const limpaRef = useRef<ReturnType<typeof setTimeout>>();
  const montadoRef = useRef(true);
  const salvarRef = useRef(salvar);
  salvarRef.current = salvar;

  const mudarStatus = useCallback(
    (s: StatusSalvamento) => {
      if (!montadoRef.current) return;
      setStatus(s);
      reportar?.(id, s);
    },
    [id, reportar],
  );

  const gravarAgora = useCallback(async () => {
    const patch = pendenteRef.current;
    if (!Object.keys(patch).length) return;
    pendenteRef.current = {};
    // Cancela o "some daqui a 2s" do salvamento anterior — senão ele apagaria
    // o "Salvando…" desta gravação.
    clearTimeout(limpaRef.current);
    mudarStatus("salvando");
    try {
      await salvarRef.current(patch);
      mudarStatus("salvo");
      limpaRef.current = setTimeout(() => mudarStatus("ocioso"), 2000);
    } catch {
      // Devolve pra fila, mas sem passar por cima do que foi digitado depois.
      pendenteRef.current = { ...patch, ...pendenteRef.current };
      mudarStatus("erro");
    }
  }, [mudarStatus]);

  const agendar = useCallback(
    (patch: Partial<P>) => {
      pendenteRef.current = { ...pendenteRef.current, ...patch };
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(gravarAgora, delay);
    },
    [delay, gravarAgora],
  );

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      clearTimeout(timerRef.current);
      clearTimeout(limpaRef.current);
      // Saiu da tela com edição pendente: dispara e deixa correr.
      const patch = pendenteRef.current;
      if (Object.keys(patch).length) {
        pendenteRef.current = {};
        try {
          void salvarRef.current(patch);
        } catch {
          /* a tela já foi */
        }
      }
    };
  }, []);

  return { agendar, gravarAgora, status, salvando: status === "salvando" };
}

/** Campo vazio na tela é NULL no banco (data vazia quebra o insert se virar ""). */
export function vaziosParaNull<T extends Record<string, unknown>>(
  patch: T,
  manterTexto: string[] = [],
): T {
  return Object.fromEntries(
    Object.entries(patch).map(([k, v]) => [
      k,
      v === "" && !manterTexto.includes(k) ? null : v,
    ]),
  ) as T;
}
