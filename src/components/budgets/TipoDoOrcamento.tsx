import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Repeat, Package, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

/**
 * Avulso ou plano — a escolha que muda o que o orçamento significa.
 *
 * Djêisson (13/08/2026): "eu quero que no modulo de orçamentos, eu selecione
 * se estou fazendo avulso ou plano. se for plano, ai sim ele habilita a opção
 * de colocarmos o prazo de contrato, precisamos tb pensar em desconto
 * progressivo, quanto mais longo for o contrato, e também as linhas da
 * planilha e isso ficar salvo como um plano."
 *
 * Num plano, o total da planilha deixa de ser "o preço do job" e passa a ser
 * A MENSALIDADE. O prazo desconta dela (contrato longo dá previsibilidade de
 * caixa, e o preço disso é mensalidade menor), e o contrato é mensal × meses.
 *
 * O botão de salvar copia as LINHAS DA PLANILHA pro plano — o escopo já foi
 * digitado uma vez, e digitar de novo em outra tela é como as duas versões
 * divergem.
 */

const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function TipoDoOrcamento({ budget, onChanged }: { budget: any; onChanged: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [salvando, setSalvando] = useState(false);
  const recorrente = !!budget.recorrente;
  const meses = budget.contrato_meses || 12;

  const { data: degraus = [] } = useQuery({
    queryKey: ["plano-descontos"],
    queryFn: async () => (await (supabase as any).from("plano_descontos").select("*").eq("ativo", true).order("meses")).data || [],
    staleTime: 10 * 60 * 1000,
  });

  // Mesma régua do banco (`desconto_contrato`): o MAIOR degrau que cabe no
  // prazo — 9 meses pega o de 6, não zero.
  const desconto = degraus.filter((d: any) => d.meses <= meses).map((d: any) => Number(d.percent)).pop() ?? 0;
  const cheio = Number(budget.total_value || 0);
  const mensal = Math.round(cheio * (1 - desconto / 100) * 100) / 100;

  const salvar = async (patch: any) => {
    const { error } = await (supabase as any).from("budgets").update(patch).eq("id", budget.id);
    if (error) return toast.error("Não salvou", { description: error.message });
    onChanged();
  };

  const virarPlano = async () => {
    setSalvando(true);
    const { data, error } = await (supabase as any).rpc("plano_do_orcamento", { _budget_id: budget.id });
    setSalvando(false);
    if (error) return toast.error("Não salvou o plano", { description: error.message });
    qc.invalidateQueries({ queryKey: ["planos"] });
    toast.success("Plano salvo", { description: "As horas de cada linha ficam pra preencher no plano." });
    if (data) navigate("/planos");
  };

  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-border/60">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              onClick={() => salvar({ recorrente: v, contrato_meses: v ? meses : null })}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                recorrente === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v ? <Repeat className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
              {v ? "Plano recorrente" : "Avulso"}
            </button>
          ))}
        </div>

        {recorrente && (
          <>
            <Select value={String(meses)} onValueChange={(v) => salvar({ contrato_meses: Number(v) })}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {degraus.map((d: any) => (
                  <SelectItem key={d.meses} value={String(d.meses)}>
                    {d.meses} meses{Number(d.percent) > 0 ? ` · -${Number(d.percent)}%` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button size="sm" variant="outline" className="h-8" onClick={virarPlano} disabled={salvando}>
              {salvando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Salvar como plano
            </Button>
          </>
        )}
      </div>

      {recorrente && (
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <Linha rot="Planilha (mensalidade cheia)" val={brl(cheio)} />
          <Linha
            rot={`Desconto de ${meses} meses`}
            val={desconto > 0 ? `−${desconto}% · ${brl(cheio - mensal)}` : "sem desconto"}
            tom={desconto > 0 ? "text-warning" : "text-muted-foreground"}
          />
          <Linha rot="Mensalidade" val={brl(mensal)} forte />
          <div className="sm:col-span-3">
            <p className="text-xs text-muted-foreground">
              Contrato de {meses} meses = <b className="text-foreground">{brl(mensal * meses)}</b>.
              O total da planilha vira a mensalidade, não o preço do job.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Linha({ rot, val, forte, tom }: { rot: string; val: string; forte?: boolean; tom?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{rot}</p>
      <p className={`${forte ? "text-base font-semibold text-foreground" : "text-sm"} ${tom || "text-foreground"}`}>{val}</p>
    </div>
  );
}
