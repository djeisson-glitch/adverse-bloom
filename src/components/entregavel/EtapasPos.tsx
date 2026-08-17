import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronDown } from "lucide-react";
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
const EM_PRODUCAO = ["pendente", "pronto_editar", "em_edicao", "em_pausa", "ajuste_interno", "ajuste_solicitado"];

export function EtapasPos({ did, podeMover, status }: { did: string; podeMover: boolean; status?: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [abrirTrilha, setAbrirTrilha] = useState(false);
  const [destino, setDestino] = useState<string>("");
  const [quem, setQuem] = useState<string>("");

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
    queryFn: async () => (await (supabase as any).from("profiles")
      .select("id, full_name, avatar_url, ativo").neq("ativo", false).order("full_name")).data || [],
  });

  // Quem faz cada etapa. Serve pra pôr os candidatos no topo da lista — o
  // resto do time continua escolhível, porque a vida real tem substituição.
  const { data: candidatos = [] } = useQuery({
    queryKey: ["etapa-candidatos"],
    queryFn: async () => (await (supabase as any).from("etapa_candidatos")
      .select("etapa, user_id, preferencia").order("preferencia")).data || [],
    staleTime: 60 * 60 * 1000,
  });

  const atual = etapas.find((e: any) => e.slug === peca?.etapa_atual);
  const proxima = etapas.find((e: any) => e.ordem === (atual?.ordem ?? 0) + 1);

  // Quem faz a etapa escolhida vem primeiro na lista; o resto do time continua
  // lá embaixo, porque a vida real tem substituição e férias.
  const ehCandidato = (uid: string) =>
    candidatos.some((c: any) => c.etapa === (destino || proxima?.slug) && c.user_id === uid);
  const ordenados = [...profiles].sort(
    (a: any, b: any) => Number(ehCandidato(b.id)) - Number(ehCandidato(a.id)),
  );

  // Abre o painel já apontando pro caminho comum: a próxima etapa, sugerido.
  const abrirPainel = () => {
    setDestino(proxima?.slug || atual?.slug || etapas[0]?.slug || "");
    setQuem("");
    setAbrirTrilha(true);
  };

  /** `pessoa` explícita vence tudo; null deixa o sistema sugerir. */
  const mover = async (slug: string | null, eu: boolean, pessoa?: string | null) => {
    const { data, error } = await (supabase as any).rpc("mover_etapa", {
      _deliverable_id: did, _etapa: slug, _user_id: pessoa ?? (eu ? user?.id : null),
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
            qual é a normal. Agora é uma decisão só, e ela abre onde a decisão
            de fato mora: pra qual etapa e COM QUEM. */}
        {mover_ok && (
          <Button size="sm" className="h-7 text-xs" onClick={() => (abrirTrilha ? setAbrirTrilha(false) : abrirPainel())}>
            <ArrowRight className="mr-1 h-3 w-3" /> Passar adiante
            <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${abrirTrilha ? "rotate-180" : ""}`} />
          </Button>
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

      {/* Escolher A ETAPA e A PESSOA — pedido do Djêisson. Antes o sistema
          decidia quem pegava (o candidato com menos fila) e só dava a opção
          "ou continuo eu"; na prática quem coordena sabe pra quem vai antes
          do sistema. A sugestão continua, agora como valor inicial da lista,
          não como decisão. */}
      {mover_ok && abrirTrilha && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Etapa
            <select
              value={destino}
              onChange={(e) => { setDestino(e.target.value); setQuem(""); }}
              className="mt-0.5 block h-7 w-36 rounded border border-border bg-background px-1 text-xs text-foreground"
            >
              {etapas.map((e: any) => <option key={e.slug} value={e.slug}>{e.nome}</option>)}
            </select>
          </label>

          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Com quem
            <select
              value={quem}
              onChange={(e) => setQuem(e.target.value)}
              className="mt-0.5 block h-7 w-40 rounded border border-border bg-background px-1 text-xs text-foreground"
            >
              <option value="">sugerido pelo sistema</option>
              <option value={user?.id || ""}>eu mesmo</option>
              {ordenados.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {primeiroNome(p.full_name)}{ehCandidato(p.id) ? " ✓" : ""}
                </option>
              ))}
            </select>
          </label>

          <Button size="sm" className="h-7 text-xs" onClick={() => mover(destino, null, quem || null)}>
            <ArrowRight className="mr-1 h-3 w-3" /> Passar
          </Button>

          {atual && (
            <button
              onClick={() => mover(null, false, null)}
              className="h-7 rounded border border-border/60 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              title="A peça deixa de ser separada por etapas"
            >
              tirar das etapas
            </button>
          )}
          <span className="text-[10px] text-muted-foreground">✓ = faz esta etapa</span>
        </div>
      )}

    </div>
  );
}
