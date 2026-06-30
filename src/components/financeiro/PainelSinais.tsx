import { AlertTriangle, TrendingUp, ArrowRight, CheckCircle2, Lightbulb } from "lucide-react";
import type { Sinal, SinalAcao, Severidade } from "@/lib/sinais";

// Mapa visual por severidade — cor = julgamento (bom/atenção/crítico), reforçada
// por ícone + barra lateral pra não depender só de cor (acessibilidade).
const ESTILO: Record<Severidade, { barra: string; texto: string; badge: string; rotulo: string }> = {
  critico:  { barra: "border-l-destructive",     texto: "text-destructive", badge: "text-destructive border-destructive/40", rotulo: "crítico" },
  alerta:   { barra: "border-l-orange-500",      texto: "text-orange-400",  badge: "text-orange-400 border-orange-500/40",  rotulo: "atenção" },
  leve:     { barra: "border-l-amber-400/60",    texto: "text-amber-300",   badge: "text-amber-300 border-amber-400/40",    rotulo: "de olho" },
  destaque: { barra: "border-l-green-400",       texto: "text-green-400",   badge: "text-green-400 border-green-400/40",    rotulo: "oportunidade" },
  normal:   { barra: "border-l-emerald-400/70",  texto: "text-emerald-400", badge: "text-emerald-400 border-emerald-400/40", rotulo: "oportunidade" },
};

function SinalCard({ sinal, onAcao }: { sinal: Sinal; onAcao: (a: SinalAcao) => void }) {
  const e = ESTILO[sinal.severidade];
  const Icon = sinal.tipo === "oportunidade" ? TrendingUp : AlertTriangle;
  const badgeTxt = sinal.urgencia ?? e.rotulo;
  return (
    <div className={`rounded-r-lg border border-border/50 border-l-[3px] ${e.barra} bg-card p-3 sm:p-3.5`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 shrink-0 ${e.texto}`} />
        <span className="text-sm font-semibold text-foreground leading-snug min-w-0">{sinal.titulo}</span>
        <span className={`ml-auto shrink-0 rounded-full border px-2 py-px text-[10px] font-medium ${e.badge}`}>{badgeTxt}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-snug mb-2">{sinal.frase}</p>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground">{sinal.prova}</span>
        {sinal.regime && (
          <span className={`shrink-0 text-[9px] font-medium uppercase tracking-wider ${sinal.regime === "competência" ? "text-emerald-400/70" : "text-sky-400/70"}`}>
            {sinal.regime}
          </span>
        )}
        {sinal.acao && (
          <button
            type="button"
            onClick={() => onAcao(sinal.acao!)}
            className="ml-auto shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {sinal.acao.texto} <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export function PainelSinais({ sinais, onAcao, loading }: { sinais: Sinal[]; onAcao: (a: SinalAcao) => void; loading?: boolean }) {
  const nAtencao = sinais.filter((s) => s.tipo === "atencao").length;
  const nOportunidade = sinais.filter((s) => s.tipo === "oportunidade").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground">
          <Lightbulb className="h-3.5 w-3.5 text-primary" /> O que olhar agora
        </h3>
        {!loading && sinais.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {nAtencao > 0 && `${nAtencao} ${nAtencao === 1 ? "atenção" : "atenções"}`}
            {nAtencao > 0 && nOportunidade > 0 && " · "}
            {nOportunidade > 0 && `${nOportunidade} ${nOportunidade === 1 ? "oportunidade" : "oportunidades"}`}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((k) => (
            <div key={k} className="h-[78px] rounded-r-lg border border-border/50 border-l-[3px] border-l-border bg-card animate-pulse" />
          ))}
        </div>
      ) : sinais.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/5 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />
          <div>
            <p className="text-sm font-semibold text-green-400">Está tudo em ordem</p>
            <p className="text-xs text-muted-foreground">Nenhum ponto exige sua atenção agora no período selecionado.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sinais.map((s) => (
            <SinalCard key={s.id} sinal={s} onAcao={onAcao} />
          ))}
        </div>
      )}
    </div>
  );
}
