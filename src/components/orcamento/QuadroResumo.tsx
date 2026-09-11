import { useMemo, useState } from "react";
import {
  resumirPlanilha, type Funcao, type LinhaPlanilha, type CategoriaPlanilha,
} from "@/lib/resumoPlanilha";

const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

const rotulo = (f: Funcao, unidade: "d" | "h") =>
  `${f.qtd > 1 ? `${num(f.qtd)}× ` : ""}${f.nome} · ${num(f.diarias)}${unidade}`;

/** Quantas "pílulas" por linha antes do "+N" — o quadro tem que ser curto. */
const LIMITE = 8;

/**
 * Djêisson (11/09): "quantas diárias, quantas entregas, pessoas envolvidas e
 * outros custos... pra que fique fácil visualizar e não precise abrir um a um
 * dos grupos". Ao vivo, direto da planilha — sem IA e sem botão. As regras de
 * contagem ficam em src/lib/resumoPlanilha.ts.
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

  const pessoas = [...r.equipe, ...r.elenco].map((f) => rotulo(f, "d"));
  const pos = [
    ...r.posHoras.map((f) => rotulo(f, "h")),
    ...r.posFechados.map((f) => `${f.qtd > 1 ? `${num(f.qtd)}× ` : ""}${f.nome} · fechado`),
  ];
  const qtdElenco = r.elenco.reduce((s, f) => s + f.qtd, 0);
  const outros = r.outros.flatMap((g) => g.itens.map((f) => ({ grupo: g.categoria.nome, texto: rotulo(f, "d") })));

  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero
          rotulo="Diárias"
          valor={num(r.diarias)}
          ajuda="Maior número de diárias entre as funções de equipe e elenco (dias de set, não soma por pessoa)"
        />
        <Numero
          rotulo="Pessoas"
          valor={num(r.pessoas)}
          detalhe={qtdElenco > 0 ? `${num(r.pessoas - qtdElenco)} equipe · ${num(qtdElenco)} elenco` : undefined}
          ajuda="Soma das quantidades em Equipe técnica e Elenco"
        />
        <Numero
          rotulo="Horas de pós"
          valor={`${num(r.horasPos)}h`}
          detalhe={r.posFechados.length ? `+ ${r.posFechados.length} serviço${r.posFechados.length === 1 ? "" : "s"} fechado${r.posFechados.length === 1 ? "" : "s"}` : undefined}
          ajuda="Linhas de pós com mais de 1 hora. Serviço fechado (lançado como 1h) fica à parte"
        />
        <Numero rotulo="Entregas" valor={num(r.entregas)} ajuda="Soma das quantidades do escopo de entregas" />
      </div>

      <div className="space-y-1.5 border-t border-border/40 pt-3">
        <Linha titulo="Equipe e elenco" itens={pessoas.map((texto) => ({ texto }))} verTudo={verTudo} onVerTudo={() => setVerTudo(true)} />
        <Linha titulo="Pós" itens={pos.map((texto) => ({ texto }))} verTudo={verTudo} onVerTudo={() => setVerTudo(true)} />
        <Linha titulo="Outros custos" itens={outros} verTudo={verTudo} onVerTudo={() => setVerTudo(true)} />
      </div>

      {r.semValor > 0 && (
        <p className="text-[11px] text-warning">
          {r.semValor} linha{r.semValor === 1 ? "" : "s"} em uso ainda sem valor
        </p>
      )}
    </div>
  );
}

function Linha({ titulo, itens, verTudo, onVerTudo }: {
  titulo: string;
  itens: { grupo?: string; texto: string }[];
  verTudo: boolean;
  onVerTudo: () => void;
}) {
  if (!itens.length) return null;
  const visiveis = verTudo ? itens : itens.slice(0, LIMITE);
  const resto = itens.length - visiveis.length;
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[11px]">
      <span className="w-24 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{titulo}</span>
      {visiveis.map((p, i) => (
        <span key={i} title={p.grupo} className="rounded bg-muted/40 px-1.5 py-0.5 text-foreground">
          {p.texto}
        </span>
      ))}
      {resto > 0 && (
        <button onClick={onVerTudo} className="text-muted-foreground hover:text-foreground">
          +{resto}
        </button>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, detalhe, ajuda }: { rotulo: string; valor: string; detalhe?: string; ajuda: string }) {
  return (
    <div title={ajuda}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</p>
      <p className="text-lg font-semibold text-foreground">{valor}</p>
      {detalhe && <p className="text-[10px] text-muted-foreground">{detalhe}</p>}
    </div>
  );
}
