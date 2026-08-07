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
/** Status em que alguém está de fato com a peça na bancada. Mesma régua da
 *  função `status_em_producao` no banco — se divergirem, a tela oferece mover
 *  uma peça que o banco já soltou. */
const EM_PRODUCAO = ["pendente", "em_edicao", "em_pausa", "ajuste_interno", "ajuste_solicitado"];

export function EtapasPos({ did, podeMover, status }: { did: string; podeMover: boolean; status?: string }) {
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
      (await (supabase as any).from("deliverables").select("etapa_atual, responsavel_id, etapa_responsavel_id").eq("id", did).maybeSingle()).data,
  });

  // Peça fora da produção não está em bancada nenhuma: a etapa vira histórico
  // e os controles somem. Antes ela dizia "Color · com Djêisson" numa peça
  // que já estava COM O CLIENTE — dois eixos afirmando coisas incompatíveis
  // sobre a mesma peça, que é de onde vinha a sensação de fluxo confuso.
  const naBancada = !status || EM_PRODUCAO.includes(status);
  const mover_ok = podeMover && naBancada;

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
    // "com fulano" e não "responsável fulano": o responsável da peça continua
    // sendo quem era — a etapa só diz quem está com ela agora.
    toast.success(nome ? `Agora em ${nome} · com ${primeiroNome(dono?.full_name) || "ninguém"}` : "Fora das etapas");
    setAbrirTrilha(false);
    qc.invalidateQueries({ queryKey: ["etapa-atual", did] });
    qc.invalidateQueries({ queryKey: ["entregavel", did] });
  };

  // Sem nada a mostrar nem a fazer: some. Mas peça encerrada continua
  // exibindo por onde passou — é histórico, não controle, e é o que responde
  // "quem mexeu nisso" seis meses depois.
  if (!mover_ok && !atual && passou.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-border/40 pt-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Etapa</span>

        {atual ? (
          <span className="flex items-center gap-1.5">
            <span className={`rounded-md border px-2 py-0.5 font-medium ${
              naBancada ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/50 text-muted-foreground"
            }`}>
              {atual.nome}
            </span>
            {/* Quem está COM a peça nesta etapa — separado do responsável do
                entregável, que aparece no cabeçalho e não muda. Fora da
                produção ninguém está com ela, e o banco já limpou o dono. */}
            {naBancada && peca?.etapa_responsavel_id && (
              <span className="text-muted-foreground">
                com {primeiroNome(profiles.find((p: any) => p.id === peca.etapa_responsavel_id)?.full_name)}
              </span>
            )}
            {!naBancada && <span className="text-muted-foreground">— parou aqui</span>}
          </span>
        ) : mover_ok ? (
          <span className="text-muted-foreground">
            nenhuma — só separe se a peça passar por mais de uma mão
          </span>
        ) : (
          <span className="text-muted-foreground">não separada por etapas</span>
        )}

        {/* UM botão, não três. Antes havia "Continuo eu · X", "Passar pra X" e
            "outra etapa" lado a lado, competindo com o "Enviar para revisão"
            do fluxo — quatro coisas com cara de avançar, e nenhuma dizendo
            qual é a normal. O caminho comum (passar adiante pra próxima
            etapa, com a pessoa sugerida) fica no botão; os outros dois viram
            uma linha discreta, que é a frequência real deles. */}
        {mover_ok && proxima && (
          <Button size="sm" className="h-7 text-xs" onClick={() => mover(proxima.slug, false)}>
            <ArrowRight className="mr-1 h-3 w-3" /> Passar pra {proxima.nome}
          </Button>
        )}

        {mover_ok && (
          <button
            onClick={() => setAbrirTrilha((v) => !v)}
            className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            outra etapa, ou sigo eu <ChevronDown className={`h-3 w-3 transition-transform ${abrirTrilha ? "rotate-180" : ""}`} />
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
      {mover_ok && abrirTrilha && (
        <div className="flex flex-wrap items-center gap-1.5">
          {/* "Sigo eu" mora aqui, junto das outras etapas: é a mesma decisão
              (pra onde vai e com quem), e ter um botão irmão só pra isso
              fazia parecer duas decisões diferentes. */}
          {proxima && (
            <button
              onClick={() => mover(proxima.slug, true)}
              className="rounded-md border border-primary/40 px-2 py-1 text-[11px] text-primary hover:bg-primary/10"
            >
              <Check className="mr-1 inline h-3 w-3" /> {proxima.nome}, sigo eu
            </button>
          )}
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
