import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check } from "lucide-react";
import { fmtDuracao } from "@/lib/duracao";
import { primeiroNome } from "@/lib/pessoa";
import { toast } from "sonner";

/**
 * Etapas de pós da peça — quem está com ela agora e por quem já passou.
 *
 * A trilha NÃO é declarada no início: a peça anda e quem está nela decide.
 * Conteúdo pequeno (spot de rádio, foto) nunca mexe aqui — segue o fluxo de
 * sempre. Filme grande passa por seis mãos, e cada troca custa um clique.
 *
 * "Passou por" sai das HORAS, não de campo preenchido: é o que de fato
 * aconteceu. Hora lançada antes disso existir aparece como "não separado" —
 * a verdade, em vez de um chute retroativo.
 */
export function EtapasPos({ did, podeMover }: { did: string; podeMover: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: etapas = [] } = useQuery({
    queryKey: ["etapas-pos"],
    queryFn: async () => (await (supabase as any).from("etapas_pos").select("*").order("ordem")).data || [],
  });

  const { data: peca } = useQuery({
    queryKey: ["etapa-atual", did],
    queryFn: async () =>
      (await (supabase as any).from("deliverables").select("etapa_atual, responsavel_id").eq("id", did).maybeSingle()).data,
  });

  const { data: passou = [] } = useQuery({
    queryKey: ["passou-por", did],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("passou_por", { _deliverable_id: did });
      return (data as any[]) || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["etapas-profiles"],
    queryFn: async () => (await (supabase as any).from("profiles").select("id, full_name")).data || [],
  });

  const atual = etapas.find((e: any) => e.slug === peca?.etapa_atual);
  const proxima = etapas.find((e: any) => e.ordem === (atual?.ordem ?? 0) + 1);

  const mover = async (slug: string | null, eu: boolean) => {
    const { data, error } = await (supabase as any).rpc("mover_etapa", {
      _deliverable_id: did, _etapa: slug, _user_id: eu ? user?.id : null,
    });
    if (error || data?.erro) return toast.error("Não deu", { description: error?.message || data?.erro });
    const nome = etapas.find((e: any) => e.slug === slug)?.nome;
    const dono = profiles.find((p: any) => p.id === data?.responsavel);
    toast.success(nome ? `Agora em ${nome} · ${primeiroNome(dono?.full_name) || "sem dono"}` : "Etapa limpa");
    qc.invalidateQueries({ queryKey: ["etapa-atual", did] });
    qc.invalidateQueries({ queryKey: ["entregavel", did] });
  };

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Etapas de pós</p>
            <p className="text-xs text-muted-foreground">
              {atual
                ? `Agora em ${atual.nome}`
                : "Sem etapa — a peça segue o fluxo normal. Separe só se passar por mais de uma mão."}
            </p>
          </div>
          {podeMover && proxima && (
            <div className="flex flex-wrap gap-2">
              {/* Dois caminhos, um clique cada: quem faz de ponta a ponta
                  continua com a peça; quem entrega, entrega. */}
              <Button size="sm" variant="outline" onClick={() => mover(proxima.slug, true)}>
                <Check className="mr-1 h-3.5 w-3.5" /> Continuo eu · {proxima.nome}
              </Button>
              <Button size="sm" onClick={() => mover(proxima.slug, false)}>
                <ArrowRight className="mr-1 h-3.5 w-3.5" /> Passar pra {proxima.nome}
              </Button>
            </div>
          )}
        </div>

        {/* Trilha: clicar pula direto pra qualquer etapa (as que não se
            aplicam simplesmente não são visitadas). */}
        {podeMover && (
          <div className="flex flex-wrap gap-1.5">
            {etapas.map((e: any) => (
              <button
                key={e.slug}
                onClick={() => mover(e.slug === peca?.etapa_atual ? null : e.slug, false)}
                title={e.slug === peca?.etapa_atual ? "Clique pra tirar a peça das etapas" : `Mover pra ${e.nome}`}
                className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                  e.slug === peca?.etapa_atual
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {e.nome}
              </button>
            ))}
          </div>
        )}

        {passou.length > 0 && (
          <div className="space-y-1 border-t border-border/40 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Passou por</p>
            {passou.map((r: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 truncate text-foreground">{primeiroNome(r.pessoa)}</span>
                <span className="flex-1 truncate text-muted-foreground">{r.etapa_nome}</span>
                <span className="tabular-nums text-muted-foreground">{fmtDuracao(r.minutos)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
