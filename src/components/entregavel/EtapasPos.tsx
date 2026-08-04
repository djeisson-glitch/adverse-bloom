import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { fmtDuracao } from "@/lib/duracao";
import { primeiroNome } from "@/lib/pessoa";
import { toast } from "sonner";

/**
 * Etapa de pós da peça — dentro do card de fluxo, não num card à parte.
 *
 * Estava separado do Status e o Djêisson reclamou com razão: viravam DOIS
 * lugares dizendo onde a peça está, e dois campos pra manter. Aqui é uma
 * linha só, embaixo dos mesmos botões — quem não usa etapa nem repara nela,
 * e quem usa faz tudo sem trocar de card.
 *
 * Os dois eixos continuam existindo e são coisas diferentes: o STATUS é o
 * fluxo de aprovação (edição → revisão → cliente), a ETAPA é o ofício
 * (decupagem, color, sound). O que não pode é cobrar duas atualizações — por
 * isso "Passar pra X" já troca a etapa E o responsável de uma vez.
 *
 * "Passou por" sai das HORAS, não de campo preenchido: é o que de fato
 * aconteceu. Hora lançada antes disso existir aparece como "não separado".
 */
export function EtapasPos({ did, podeMover }: { did: string; podeMover: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [abrirTrilha, setAbrirTrilha] = useState(false);

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
    queryFn: async () => (await (supabase as any).from("profiles").select("id, full_name, avatar_url")).data || [],
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
    toast.success(nome ? `Agora em ${nome} · ${primeiroNome(dono?.full_name) || "sem dono"}` : "Fora das etapas");
    setAbrirTrilha(false);
    qc.invalidateQueries({ queryKey: ["etapa-atual", did] });
    qc.invalidateQueries({ queryKey: ["entregavel", did] });
  };

  // Sem nada a mostrar nem a fazer: some. Mas peça encerrada continua
  // exibindo por onde passou — é histórico, não controle, e é o que responde
  // "quem mexeu nisso" seis meses depois.
  if (!podeMover && !atual && passou.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-border/40 pt-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Etapa</span>

        {atual ? (
          <span className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 font-medium text-primary">
            {atual.nome}
          </span>
        ) : podeMover ? (
          <span className="text-muted-foreground">
            nenhuma — só separe se a peça passar por mais de uma mão
          </span>
        ) : (
          <span className="text-muted-foreground">não separada por etapas</span>
        )}

        {podeMover && proxima && (
          <>
            {/* Dois caminhos, um clique cada: quem faz de ponta a ponta
                continua com a peça; quem entrega, entrega. "Passar pra"
                troca a etapa E o responsável — uma ação, não duas. */}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => mover(proxima.slug, true)}>
              <Check className="mr-1 h-3 w-3" /> Continuo eu · {proxima.nome}
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={() => mover(proxima.slug, false)}>
              <ArrowRight className="mr-1 h-3 w-3" /> Passar pra {proxima.nome}
            </Button>
          </>
        )}

        {podeMover && (
          <button
            onClick={() => setAbrirTrilha((v) => !v)}
            className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            outra etapa <ChevronDown className={`h-3 w-3 transition-transform ${abrirTrilha ? "rotate-180" : ""}`} />
          </button>
        )}

        {/* Passou por: o histórico fica na mesma linha enquanto couber — é
            informação de apoio, não decisão. */}
        {passou.length > 0 && (
          <span className="ml-auto flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {passou.slice(0, 4).map((r: any, i: number) => (
              <span key={i}>
                {primeiroNome(r.pessoa)} <span className="opacity-70">{r.etapa_nome} {fmtDuracao(r.minutos)}</span>
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Trilha completa: pular etapa que não se aplica, ou tirar a peça das
          etapas. Fechada por padrão — abrir é a exceção. */}
      {podeMover && abrirTrilha && (
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
    </div>
  );
}
