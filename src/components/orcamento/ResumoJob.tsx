import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RotateCcw, Users, CalendarRange, Clock, Film } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

/**
 * Resumo do job — o parágrafo que responde "o que é isso?" sem ler a planilha.
 *
 * Os NÚMEROS não saem da IA: são contados no servidor a partir das linhas
 * (pessoas nas categorias de produção, equipe e elenco; diárias pelo maior
 * número de diárias entre elas; horas de pós pela categoria 011). A IA só
 * escreve o texto em cima deles. Modelo de linguagem redige bem e conta mal,
 * e isto vai pro cliente e pro mentor com cara de número conferido.
 *
 * Por isso as funções contadas ficam à vista aqui dentro: número que não dá
 * pra conferir é número que ninguém usa.
 */
export function ResumoJob({ budgetId, resumo, onChanged }: {
  budgetId: string;
  resumo: any;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [gerando, setGerando] = useState(false);
  const [verFuncoes, setVerFuncoes] = useState(false);

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

  const n = resumo?.numeros || {};
  const funcoes: any[] = n.funcoes || [];

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Resumo do job
            </h2>
            <p className="text-xs text-muted-foreground">
              {resumo?.gerado_em
                ? `Gerado em ${formatDate(resumo.gerado_em)} — refaça depois de mexer na planilha.`
                : "Um parágrafo e os números do job, pra usar internamente e no link compartilhado."}
            </p>
          </div>
          <Button size="sm" variant={resumo ? "outline" : "default"} onClick={gerar} disabled={gerando}>
            {gerando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                     : resumo ? <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                              : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            {gerando ? "Gerando…" : resumo ? "Refazer" : "Gerar com IA"}
          </Button>
        </div>

        {!resumo && (
          <p className="rounded-lg border border-dashed border-border/50 px-4 py-3 text-xs text-muted-foreground">
            Ainda sem resumo. Preencha a planilha e o escopo de entregas primeiro — o texto é
            escrito em cima deles.
          </p>
        )}

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

            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/50 bg-muted/10 px-4 py-3 sm:grid-cols-4">
              <Numero icone={<Users className="h-3.5 w-3.5" />} rotulo="Pessoas" valor={n.pessoas}
                      detalhe={`${n.equipe || 0} equipe · ${n.elenco || 0} elenco`} />
              <Numero icone={<CalendarRange className="h-3.5 w-3.5" />} rotulo="Diárias" valor={n.diarias} />
              <Numero icone={<Clock className="h-3.5 w-3.5" />} rotulo="Horas de pós" valor={n.horas_pos}
                      detalhe={n.pos_fechados?.length
                        ? `+ ${n.pos_fechados.length} serviço${n.pos_fechados.length === 1 ? "" : "s"} fechado${n.pos_fechados.length === 1 ? "" : "s"}`
                        : undefined} />
              <Numero icone={<Film className="h-3.5 w-3.5" />} rotulo="Entregas" valor={n.entregas} />
            </div>

            {!!funcoes.length && (
              <div>
                <button
                  onClick={() => setVerFuncoes((v) => !v)}
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {verFuncoes ? "esconder" : "conferir"} de onde vêm as {n.pessoas} pessoas
                </button>
                {verFuncoes && (
                  <div className="mt-1.5 space-y-1.5">
                    <div className="flex flex-wrap gap-1">
                      {funcoes.map((f: any, i: number) => (
                        <span key={i} className="rounded bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {f.qtd}× {f.nome}
                        </span>
                      ))}
                    </div>
                    {/* A pós também precisa se explicar: serviço fechado
                        (acessibilidade, trilha) é lançado como "1 hora" só pra
                        multiplicar, e somar isso inventava uma hora que não
                        existe. Aqui dá pra ver o que entrou e o que não. */}
                    {(!!n.pos_horas?.length || !!n.pos_fechados?.length) && (
                      <p className="text-[11px] text-muted-foreground">
                        <span className="text-foreground">Pós:</span>{" "}
                        {n.pos_horas?.map((p: any) => `${p.nome} ${p.horas}h`).join(" · ") || "sem linha por hora"}
                        {!!n.pos_fechados?.length && (
                          <> · fora da conta de horas (serviço fechado): {n.pos_fechados.join(", ")}</>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Numero({ icone, rotulo, valor, detalhe }: {
  icone: React.ReactNode; rotulo: string; valor?: number; detalhe?: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icone} {rotulo}
      </p>
      <p className="text-lg font-semibold text-foreground">{Number(valor || 0)}</p>
      {detalhe && <p className="text-[10px] text-muted-foreground">{detalhe}</p>}
    </div>
  );
}
