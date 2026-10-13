import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { edicaoCartaSimples, type EdicaoCartaSimples } from "@/lib/cartaSimples";
import { salvarPropostaCampos } from "@/lib/salvarProposta";
import type { StatusSalvamento } from "@/components/autosave/AutosaveContext";

/** Montar com key=budget.id: cada opção mantém sua própria edição. */
export function useEdicaoCartaSimples(budgetId: string, salvo?: Partial<EdicaoCartaSimples>) {
  const qc = useQueryClient();
  const [edicao, setEdicao] = useState(() => edicaoCartaSimples(salvo));
  const atual = useRef(edicao);
  const pendente = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const gravando = useRef<Promise<boolean> | null>(null);
  const [status, setStatus] = useState<StatusSalvamento>("ocioso");

  const salvar = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    if (gravando.current) return gravando.current;
    if (!pendente.current) return Promise.resolve(true);
    gravando.current = (async () => {
      setStatus("salvando");
      // Serializa a digitação durante uma gravação e espera o último texto
      // antes de liberar voltar, imprimir ou exportar.
      while (pendente.current) {
        const snapshot = atual.current;
        pendente.current = false;
        try {
          const proposta = await salvarPropostaCampos(budgetId, { carta_simples: snapshot });
          qc.setQueriesData({ queryKey: ["carta-simples"] }, (old: any) => old?.budget?.id === budgetId ? { ...old, budget: { ...old.budget, proposta } } : old);
        } catch (error: any) {
          pendente.current = true;
          setStatus("erro");
          toast.error("Não foi possível salvar a carta", { description: error?.message || "Tente novamente antes de sair ou exportar." });
          return false;
        }
      }
      qc.invalidateQueries({ queryKey: ["carta-orcamento"] });
      qc.invalidateQueries({ queryKey: ["orcamento-budget"] });
      setStatus("salvo");
      return true;
    })().finally(() => { gravando.current = null; });
    return gravando.current;
  }, [budgetId, qc]);

  const alterar = useCallback((patch: Partial<EdicaoCartaSimples>) => {
    atual.current = { ...atual.current, ...patch };
    setEdicao(atual.current);
    pendente.current = true;
    setStatus("salvando");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void salvar(); }, 600);
  }, [salvar]);

  useEffect(() => {
    const antesDeSair = (e: BeforeUnloadEvent) => {
      if (pendente.current || gravando.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", antesDeSair);
    return () => {
      window.removeEventListener("beforeunload", antesDeSair);
      clearTimeout(timer.current);
      void salvar();
    };
  }, [salvar]);
  return { edicao, alterar, salvar, status };
}
