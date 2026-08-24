import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { usePrompt } from "@/components/ui/confirm";
import { formatCurrency } from "@/lib/format";

/**
 * As opções que estão na mesa para o mesmo filme.
 *
 * Não é histórico de versão — o formulário legado já tem isso, e ali a versão 2
 * sucede a 1. Aqui as duas estão vivas ao mesmo tempo: a completa e a enxuta,
 * pro cliente escolher. Por isso a barra só aparece quando existe mais de uma;
 * com um orçamento só, ela seria ruído a explicar um conceito que ninguém usou
 * ainda.
 */

type Variante = {
  id: string; variante_nome: string | null; principal: boolean;
  total_value: number | null; status: string; itens: number;
};

export function SeletorVariantes({ dealId, atual, onTrocar }: {
  dealId: string;
  atual: string | null;
  onTrocar: (id: string | null) => void;
}) {
  const qc = useQueryClient();
  const perguntar = usePrompt();
  const [criando, setCriando] = useState(false);

  const { data: variantes = [] } = useQuery({
    queryKey: ["orcamento-variantes", dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("orcamento_variantes", { _deal_id: dealId });
      if (error) throw error;
      return (data ?? []) as Variante[];
    },
  });

  const principal = variantes.find((v) => v.principal);
  const selecionada = atual ?? principal?.id ?? null;

  async function duplicar() {
    const base = variantes.find((v) => v.id === selecionada) ?? principal;
    if (!base) return;
    const nome = await perguntar({
      title: "Nova opção para este filme",
      description:
        "Ela nasce como cópia desta, com todos os itens — depois você tira ou acrescenta o que quiser. " +
        "O nome é como ela aparece pro cliente.",
      placeholder: "Com drone",
      confirmText: "Criar opção",
    });
    if (!nome?.trim()) return;
    setCriando(true);
    const { data, error } = await (supabase as any).rpc("orcamento_criar_variante", {
      _budget_id: base.id, _nome: nome.trim(),
    });
    setCriando(false);
    if (error) {
      // Dois erros de "duplicate key" MUITO diferentes chegavam aqui, e o
      // teste genérico por /duplicate key/ dizia sempre "já existe uma opção
      // com esse nome". Quando o que estourava era o índice de número+versão
      // (bug corrigido em 20260820100000), a pessoa trocava o nome pra sempre
      // sem nunca conseguir criar. Só o índice do NOME fala sobre o nome.
      const nomeRepetido = /budgets_variante_unica/.test(error.message ?? "");
      return toast.error(nomeRepetido ? "Já existe uma opção com esse nome" : "Não criou a opção", {
        description: nomeRepetido
          ? "Use outro nome — é assim que o cliente distingue as duas."
          : error.message,
      });
    }
    await qc.invalidateQueries({ queryKey: ["orcamento-variantes", dealId] });
    onTrocar(data as string);
    toast.success(`Opção "${nome.trim()}" criada`, { description: "Agora ajuste o que muda nela." });
  }

  // Uma opção só: nada a escolher. O botão de criar vive no menu do orçamento.
  if (variantes.length <= 1) {
    return (
      <Button size="sm" variant="outline" onClick={duplicar} disabled={criando}>
        <Copy className="mr-1.5 h-3.5 w-3.5" />
        {criando ? "Criando…" : "Criar outra opção"}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Opções na mesa</span>
      {variantes.map((v) => {
        const ativa = v.id === selecionada;
        return (
          <button
            key={v.id}
            onClick={() => onTrocar(v.principal ? null : v.id)}
            className={`rounded-md border px-2.5 py-1 text-left text-xs transition-colors ${
              ativa ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            <span className="block font-medium">{v.variante_nome ?? "Principal"}</span>
            <span className="block tabular-nums text-[10px] opacity-70">
              {formatCurrency(Number(v.total_value || 0))} · {v.itens} itens
            </span>
          </button>
        );
      })}
      <Button size="sm" variant="ghost" onClick={duplicar} disabled={criando} title="Duplicar a opção aberta">
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
