import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import {
  CATALOGO, REGIMES_ANCINE, STATUS_LABEL, comPadroes,
  type Condicoes, type ItemCondicao, type StatusCondicao,
} from "@/lib/condicoes";

const ORDEM_STATUS: StatusCondicao[] = ["incluso", "nao_incluso", "sob_consulta", "nao_se_aplica"];

/**
 * O que está e o que NÃO está incluso — preenchido aqui, impresso na carta.
 *
 * "Não inclui" em texto livre falha justamente onde dói: o cliente aprova e
 * três semanas depois pergunta cadê a janela de Libras, ou descobre na entrega
 * que o filme não pode ir pra TV porque ninguém registrou na ANCINE. Item
 * escrito como "não incluso" na proposta vira upsell; item não escrito vira
 * discussão.
 *
 * Tudo já nasce preenchido com o padrão da casa — a tela é pra CORRIGIR o
 * padrão, não pra preencher do zero, senão ninguém preenche.
 */
export function CondicoesEntrega({ budgetId, condicoes, onChanged }: {
  budgetId: string;
  condicoes: Condicoes | null;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<Condicoes>(() => comPadroes(condicoes));

  const auto = useFormAutosave<{ condicoes: Condicoes }>(
    async (patch) => {
      if (!patch.condicoes) return;
      const { error } = await (supabase as any)
        .from("budgets").update({ condicoes: patch.condicoes }).eq("id", budgetId);
      if (error) {
        toast.error("Não salvou as condições", { description: error.message });
        throw error;
      }
      onChanged();
    },
    { delay: 400 },
  );

  const aplicar = (novo: Condicoes) => {
    setForm(novo);
    auto.agendar({ condicoes: novo });
  };

  const mudarItem = (chave: string, patch: Partial<ItemCondicao>) =>
    aplicar({ ...form, itens: form.itens.map((i) => (i.chave === chave ? { ...i, ...patch } : i)) });

  const alternarRegime = (chave: string, regime: string) => {
    const item = form.itens.find((i) => i.chave === chave);
    const atuais = item?.regimes || [];
    const novos = atuais.includes(regime) ? atuais.filter((r) => r !== regime) : [...atuais, regime];
    mudarItem(chave, { regimes: novos });
  };

  const [novo, setNovo] = useState("");
  const adicionar = () => {
    if (!novo.trim()) return;
    aplicar({
      ...form,
      itens: [...form.itens, {
        chave: `livre_${form.itens.length}_${novo.trim().toLowerCase().replace(/\W+/g, "_")}`,
        rotulo: novo.trim(), status: "nao_incluso",
      }],
    });
    setNovo("");
  };

  const remover = (chave: string) =>
    aplicar({ ...form, itens: form.itens.filter((i) => i.chave !== chave) });

  const ajudaDe = (chave: string) => CATALOGO.find((c) => c.chave === chave)?.ajuda;
  const doCatalogo = (chave: string) => CATALOGO.some((c) => c.chave === chave);

  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Condições e direitos
          </h2>
          <p className="text-xs text-muted-foreground">
            O que está e o que não está incluso. Vai impresso na carta do cliente — é aqui que se
            evita a discussão de "eu achei que tinha Libras".
          </p>
        </div>

        {/* Período e praça primeiro: é o que define se ANCINE e direitos de
            elenco fazem sentido, e é o que mais falta na proposta. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Período de veiculação orçado</Label>
            <Input
              value={form.veiculacao?.periodo || ""}
              onChange={(e) => aplicar({ ...form, veiculacao: { ...form.veiculacao, periodo: e.target.value } })}
              placeholder="Ex.: 12 meses a partir da entrega"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Praça de veiculação orçada</Label>
            <Input
              value={form.veiculacao?.praca || ""}
              onChange={(e) => aplicar({ ...form, veiculacao: { ...form.veiculacao, praca: e.target.value } })}
              placeholder="Ex.: RS, SC e MG"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          {form.itens.map((item) => (
            <div key={item.chave} className="rounded-lg border border-border/50 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-[180px] text-sm text-foreground">{item.rotulo}</span>

                <div className="flex flex-wrap gap-1">
                  {ORDEM_STATUS.map((s) => (
                    <button
                      key={s}
                      onClick={() => mudarItem(item.chave, { status: s })}
                      className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                        item.status === s
                          ? s === "incluso"
                            ? "bg-success/15 font-medium text-success"
                            : s === "nao_incluso"
                              ? "bg-warning/15 font-medium text-warning"
                              : "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>

                <Input
                  value={item.obs || ""}
                  onChange={(e) => mudarItem(item.chave, { obs: e.target.value })}
                  placeholder={ajudaDe(item.chave) || "observação (aparece na carta)"}
                  className="h-7 flex-1 text-xs"
                />

                {!doCatalogo(item.chave) && (
                  <button onClick={() => remover(item.chave)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* ANCINE só pergunta o regime quando há registro a fazer —
                  perguntar "em qual TV?" para quem marcou "não se aplica" é
                  ruído. */}
              {item.chave === "ancine" && item.status !== "nao_se_aplica" && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Regime</span>
                  {REGIMES_ANCINE.map((r) => (
                    <button
                      key={r}
                      onClick={() => alternarRegime(item.chave, r)}
                      className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                        item.regimes?.includes(r)
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionar()}
            placeholder="Outra condição (ex.: making of, fotos de still)"
            className="h-8 text-sm"
          />
          <Button size="sm" variant="outline" onClick={adicionar}>Adicionar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
