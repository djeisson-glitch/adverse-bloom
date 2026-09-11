import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

/**
 * Resumo do job — o parágrafo que responde "o que é isso?" sem ler a planilha.
 *
 * Os NÚMEROS não saem da IA: são contados no servidor com as mesmas regras
 * do quadro resumo (src/lib/resumoPlanilha.ts). A IA só escreve o texto em
 * cima deles. Na tela do orçamento os números aparecem no quadro, ao vivo —
 * aqui fica só o texto, pra não repetir a mesma grade duas vezes.
 */
export function ResumoJob({ budgetId, resumo, onChanged }: {
  budgetId: string;
  resumo: any;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [gerando, setGerando] = useState(false);

  const gerar = async () => {
    setGerando(true);
    const { data, error } = await supabase.functions.invoke("orcamento-resumo", {
      body: { budget_id: budgetId },
    });
    setGerando(false);
    if (error || data?.error) {
      return toast.error("Não gerou o resumo", { description: data?.error || error?.message });
    }
    qc.invalidateQueries({ queryKey: ["orcamento-budget"] });
    onChanged();
    toast.success("Resumo gerado");
  };

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Resumo do job
            {resumo?.gerado_em && (
              <span className="text-[11px] font-normal text-muted-foreground" title="Refaça depois de mexer na planilha">
                {formatDate(resumo.gerado_em)}
              </span>
            )}
          </h2>
          <Button size="sm" variant={resumo ? "outline" : "default"} onClick={gerar} disabled={gerando}>
            {gerando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                     : resumo ? <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                              : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            {gerando ? "Gerando…" : resumo ? "Refazer" : "Gerar com IA"}
          </Button>
        </div>

        {resumo && (
          <>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {resumo.texto}
            </p>
            {!!resumo.destaques?.length && (
              <div className="flex flex-wrap gap-1.5">
                {resumo.destaques.map((d: string, i: number) => (
                  <span key={i} className="rounded-md border border-border/60 bg-muted/20 px-2 py-0.5 text-[11px] text-muted-foreground">
                    {d}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
