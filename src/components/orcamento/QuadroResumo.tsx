import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Users, Clock, Film, AlertTriangle } from "lucide-react";
import {
  resumirPlanilha, type Funcao, type LinhaPlanilha, type CategoriaPlanilha,
} from "@/lib/resumoPlanilha";

const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Linhas por coluna antes do "+N" — o quadro tem que caber de relance. */
const LIMITE = 6;

type Linha = { tipo: "grupo"; nome: string } | { tipo: "item"; nome: string; qtd: number; medida: string };

const item = (f: Funcao, medida: string): Linha => ({ tipo: "item", nome: f.nome, qtd: f.qtd, medida });

/**
 * Djêisson (11/09): "quantas diárias, quantas entregas, pessoas envolvidas e
 * outros custos... pra não precisar abrir um a um dos grupos" — e depois:
 * "precisa estar mais bonito". Ao vivo, direto da planilha. Regras de
 * contagem em src/lib/resumoPlanilha.ts; a explicação de cada número fica no
 * tooltip, não na tela.
 */
export function QuadroResumo({
  itens, categorias, entregas, ocultas,
}: {
  itens: LinhaPlanilha[];
  categorias: CategoriaPlanilha[];
  entregas: { quantidade?: number | string | null }[];
  ocultas: Set<string>;
}) {
  const [verTudo, setVerTudo] = useState(false);
  const r = useMemo(
    () => resumirPlanilha(itens, categorias, entregas, ocultas),
    [itens, categorias, entregas, ocultas],
  );

  if (r.linhasEmUso === 0 && r.entregas === 0) return null;

  const qtdElenco = r.elenco.reduce((s, f) => s + f.qtd, 0);
  const colunas: { titulo: string; linhas: Linha[] }[] = [
    { titulo: "Equipe e elenco", linhas: [...r.equipe, ...r.elenco].map((f) => item(f, `${num(f.diarias)}d`)) },
    {
      titulo: "Pós",
      linhas: [
        ...r.posHoras.map((f) => item(f, `${num(f.diarias)}h`)),
        ...r.posFechados.map((f) => item(f, "fechado")),
      ],
    },
    {
      titulo: "Outros custos",
      linhas: r.outros.flatMap((g) => [
        { tipo: "grupo" as const, nome: g.categoria.nome },
        ...g.itens.map((f) => item(f, `${num(f.diarias)}d`)),
      ]),
    },
  ].filter((c) => c.linhas.length > 0);

  return (
    <div className="space-y-4 rounded-xl border border-border/50 bg-muted/10 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Numero icone={<CalendarDays className="h-4 w-4" />} rotulo="Diárias" valor={num(r.diarias)}
                ajuda="Dias de set: o maior número de diárias entre equipe e elenco" />
        <Numero icone={<Users className="h-4 w-4" />} rotulo="Pessoas" valor={num(r.pessoas)}
                detalhe={qtdElenco > 0 ? `${num(r.pessoas - qtdElenco)} equipe · ${num(qtdElenco)} elenco` : undefined}
                ajuda="Equipe técnica + elenco" />
        <Numero icone={<Clock className="h-4 w-4" />} rotulo="Pós" valor={`${num(r.horasPos)}h`}
                detalhe={r.posFechados.length ? `+${r.posFechados.length} fechado${r.posFechados.length === 1 ? "" : "s"}` : undefined}
                ajuda="Horas de ilha. Serviço fechado (lançado como 1h) fica à parte" />
        <Numero icone={<Film className="h-4 w-4" />} rotulo="Entregas" valor={num(r.entregas)}
                ajuda="Soma do escopo de entregas" />
      </div>

      {colunas.length > 0 && (
        <div className={`grid gap-x-6 gap-y-4 ${colunas.length === 3 ? "md:grid-cols-3" : colunas.length === 2 ? "md:grid-cols-2" : ""}`}>
          {colunas.map((c) => {
            const visiveis = verTudo ? c.linhas : c.linhas.slice(0, LIMITE);
            const resto = c.linhas.filter((l) => l.tipo === "item").length
              - visiveis.filter((l) => l.tipo === "item").length;
            return (
              <div key={c.titulo} className="min-w-0">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{c.titulo}</p>
                <ul className="space-y-1">
                  {visiveis.map((l, i) =>
                    l.tipo === "grupo" ? (
                      <li key={i} className="pt-1 text-[10px] text-muted-foreground/70 first:pt-0">{l.nome.toLowerCase()}</li>
                    ) : (
                      <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="truncate text-foreground">
                          {l.qtd > 1 && <span className="text-muted-foreground">{num(l.qtd)}× </span>}
                          {l.nome}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{l.medida}</span>
                      </li>
                    ),
                  )}
                </ul>
                {resto > 0 && (
                  <button onClick={() => setVerTudo(true)} className="mt-1 text-[11px] text-primary hover:underline">
                    +{resto}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {r.semValor > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-warning">
          <AlertTriangle className="h-3 w-3" />
          {r.semValor} sem valor
        </p>
      )}
    </div>
  );
}

function Numero({ icone, rotulo, valor, detalhe, ajuda }: {
  icone: ReactNode; rotulo: string; valor: string; detalhe?: string; ajuda: string;
}) {
  return (
    <div title={detalhe ? `${ajuda}\n${detalhe}` : ajuda} className="flex items-center gap-3 rounded-lg bg-background/60 px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{icone}</span>
      <div className="min-w-0">
        <p className="text-xl font-semibold leading-none tabular-nums text-foreground">{valor}</p>
        <p className="mt-1 truncate text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</p>
      </div>
    </div>
  );
}
