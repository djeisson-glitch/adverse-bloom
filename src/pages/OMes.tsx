import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useAllContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { useEmpresaContexto } from "@/hooks/useEmpresaContexto";
import { formatCurrency } from "@/lib/format";
import {
  type CAItem, calcReceitaTotal, calcSaldoEmConta,
  calcAReceberNoMes, calcAPagarNoMes, calcAPagarVencido,
} from "@/lib/financial";

/**
 * O mês — a tela que responde três perguntas e para.
 *
 * O financeiro tinha 13 itens de menu, ~38 StatCards e 26 gráficos espalhados
 * por 14 páginas. Boa parte era o mesmo número com nome diferente: "Saldo em
 * Conta", "Saldo atual" e "Saldo Atual" em três páginas; "Faturamento",
 * "Receita Total" e "Entradas do Mês" em outras três. Havia até dois pontos de
 * equilíbrio com valores diferentes — um retrovisor e um prospectivo.
 *
 * O problema nunca foi falta de informação; era não existir um lugar canônico.
 * Aqui ficam três perguntas, dez números e um link para a profundidade de cada
 * uma. Se a resposta for "sim, vou fechar o mês", não é preciso abrir mais nada.
 */

type Meta = { mes: string; piso: number; break_even: number; meta: number };

function mesAtual() {
  const h = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const ini = `${h.getFullYear()}-${p(h.getMonth() + 1)}-01`;
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0);
  return { from: ini, to: `${fim.getFullYear()}-${p(fim.getMonth() + 1)}-${p(fim.getDate())}` };
}

/** Um número com o que ele quer dizer embaixo. Sem legenda, número vira ruído. */
function Numero({ rotulo, valor, nota, tom = "neutro", grande = false }: {
  rotulo: string; valor: string; nota?: string;
  tom?: "neutro" | "bom" | "atencao" | "ruim"; grande?: boolean;
}) {
  const cor = { neutro: "", bom: "text-emerald-600", atencao: "text-amber-600", ruim: "text-red-600" }[tom];
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{rotulo}</p>
      <p className={`font-mono tabular-nums font-medium ${grande ? "text-3xl" : "text-xl"} ${cor}`}>{valor}</p>
      {nota && <p className="text-xs text-muted-foreground mt-1 leading-snug">{nota}</p>}
    </div>
  );
}

function Bloco({ pergunta, resposta, tom, children, para, paraRotulo }: {
  pergunta: string; resposta: string; tom: "bom" | "atencao" | "ruim";
  children: React.ReactNode; para: string; paraRotulo: string;
}) {
  const borda = { bom: "border-l-emerald-600", atencao: "border-l-amber-600", ruim: "border-l-red-600" }[tom];
  const cor = { bom: "text-emerald-600", atencao: "text-amber-600", ruim: "text-red-600" }[tom];
  return (
    <section className={`rounded-lg border border-l-[3px] ${borda} bg-card p-5 md:p-6`}>
      <p className="text-sm text-muted-foreground">{pergunta}</p>
      <p className={`text-lg md:text-xl font-semibold mt-0.5 ${cor}`}>{resposta}</p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 mt-5">{children}</div>
      <Link to={para} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-5">
        {paraRotulo} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}

export default function OMes() {
  const { canSeeMoney } = usePermissions();
  const { receivables, payables } = useAllContaAzulCache();
  const { data: ctx } = useEmpresaContexto();
  const periodo = useMemo(mesAtual, []);
  const hoje = new Date().toISOString().slice(0, 10);

  const recItems = useMemo(() => extractItems<CAItem>(receivables.data?.payload), [receivables.data]);
  const payItems = useMemo(() => extractItems<CAItem>(payables.data?.payload), [payables.data]);

  const { data: metas = [] } = useQuery({
    queryKey: ["metas-12m"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("metas_12m").select("*").order("mes");
      if (error) throw error;
      return (data ?? []) as Meta[];
    },
    enabled: canSeeMoney,
  });

  const meta = metas.find((m) => String(m.mes).slice(0, 7) === periodo.from.slice(0, 7)) ?? metas[0] ?? null;

  const faturado = useMemo(() => calcReceitaTotal(recItems, periodo), [recItems, periodo]);
  const saldo = useMemo(
    () => calcSaldoEmConta(recItems, payItems, ctx?.saldo_inicial, ctx?.saldo_inicial_data),
    [recItems, payItems, ctx],
  );
  const aReceber = useMemo(() => calcAReceberNoMes(recItems, periodo), [recItems, periodo]);
  const aPagar = useMemo(() => calcAPagarNoMes(payItems, periodo), [payItems, periodo]);
  const vencido = useMemo(() => calcAPagarVencido(payItems, hoje), [payItems, hoje]);
  const projetado = saldo + aReceber - aPagar;

  if (!canSeeMoney) {
    return <div className="p-8 text-muted-foreground">Esta área mostra valores financeiros.</div>;
  }

  const nomeMes = new Date(periodo.from + "T12:00:00")
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // ---- pergunta 1
  const falta = meta ? meta.break_even - faturado : 0;
  const tom1: "bom" | "atencao" | "ruim" = !meta ? "atencao" : falta <= 0 ? "bom" : faturado >= meta.piso ? "atencao" : "ruim";
  const resposta1 = !meta
    ? "Sem meta cadastrada para este mês"
    : falta <= 0
      ? (faturado >= meta.meta ? "Sim — e bateu a meta" : "Sim, o mês fecha")
      : faturado >= meta.piso
        ? `Ainda não — faltam ${formatCurrency(falta)}`
        : `Não — faltam ${formatCurrency(falta)}`;

  // ---- pergunta 2
  const tom2: "bom" | "atencao" | "ruim" = projetado < 0 ? "ruim" : vencido > 0 ? "atencao" : "bom";
  const resposta2 = projetado < 0
    ? `Não — o mês projeta ${formatCurrency(projetado)}`
    : vencido > 0
      ? `Sim, mas há ${formatCurrency(vencido)} vencido`
      : "Sim, o mês fecha positivo";

  const pctBarra = meta && meta.meta > 0 ? Math.min(100, (faturado / meta.meta) * 100) : 0;
  const pctBE = meta && meta.meta > 0 ? (meta.break_even / meta.meta) * 100 : 0;

  return (
    <div className="p-6 md:p-8 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold capitalize">{nomeMes}</h1>
        <p className="text-muted-foreground">Três perguntas. O resto está a um clique.</p>
      </div>

      <Bloco pergunta="Vou fechar o mês?" resposta={resposta1} tom={tom1}
        para="/financeiro/metas" paraRotulo="Ver as metas dos próximos meses">
        <Numero rotulo="Faturado" valor={formatCurrency(faturado)} grande
          nota="notas emitidas neste mês" />
        <Numero rotulo="Ponto de equilíbrio" valor={meta ? formatCurrency(meta.break_even) : "—"}
          nota="cobre custo, imposto, parcelas e seu pró-labore" />
        <Numero rotulo={falta > 0 ? "Falta" : "Sobra"} valor={formatCurrency(Math.abs(falta))}
          tom={falta > 0 ? "atencao" : "bom"} nota={falta > 0 ? "para o mês fechar" : "acima do equilíbrio"} />
        <Numero rotulo="Meta" valor={meta ? formatCurrency(meta.meta) : "—"}
          nota="paga seu cachê e alimenta a reserva" />
        {meta && (
          <div className="sm:col-span-2 lg:col-span-4">
            <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
              <div className={`absolute inset-y-0 left-0 rounded-full ${
                  tom1 === "bom" ? "bg-emerald-600" : tom1 === "atencao" ? "bg-amber-500" : "bg-red-600"}`}
                style={{ width: `${pctBarra}%` }} />
              <div className="absolute inset-y-0 w-0.5 bg-foreground/40" style={{ left: `${pctBE}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
              <span>0</span>
              <span>equilíbrio {formatCurrency(meta.break_even)}</span>
              <span>meta {formatCurrency(meta.meta)}</span>
            </div>
          </div>
        )}
      </Bloco>

      <Bloco pergunta="Tenho dinheiro para o que vem?" resposta={resposta2} tom={tom2}
        para="/financeiro/fluxo" paraRotulo="Ver o fluxo de caixa">
        <Numero rotulo="Saldo em conta" valor={formatCurrency(saldo)} grande
          tom={saldo < 0 ? "ruim" : "neutro"} nota="hoje, somando as contas" />
        <Numero rotulo="A receber no mês" valor={formatCurrency(aReceber)} nota="ainda em aberto" />
        <Numero rotulo="A pagar no mês" valor={formatCurrency(aPagar)} nota="ainda em aberto" />
        <Numero rotulo="Saldo projetado" valor={formatCurrency(projetado)}
          tom={projetado < 0 ? "ruim" : "bom"} nota="se tudo entrar e sair como previsto" />
      </Bloco>

      {vencido > 0 && (
        <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-muted-foreground">
            <strong className="text-foreground">{formatCurrency(vencido)} vencidos</strong> e não pagos.
            Dívida tributária e fornecedor atrasado travam certidão negativa — e certidão é o que o
            cliente grande pede na hora de assinar contrato.{" "}
            <Link to="/financeiro/contas" className="text-primary hover:underline">Ver contas a pagar</Link>
          </p>
        </div>
      )}

      <Bloco pergunta="A operação está saudável?" resposta="Veja o resultado dos 12 meses" tom="bom"
        para="/financeiro/dre" paraRotulo="Abrir o DRE gerencial">
        <Numero rotulo="Margem de contribuição" valor="73,8%"
          nota="o que sobra de cada real, depois do variável e do imposto" />
        <Numero rotulo="Custo fixo do mês" valor={meta ? formatCurrency(meta.piso * 0.738) : "—"}
          nota="sai com projeto ou sem" />
        <Numero rotulo="Piso da empresa" valor={meta ? formatCurrency(meta.piso) : "—"}
          nota="faturamento que paga a empresa, sem retirada" />
        <Numero rotulo="Entre piso e equilíbrio" valor={meta ? formatCurrency(meta.break_even - meta.piso) : "—"}
          nota="a faixa em que a empresa se paga mas você não" />
      </Bloco>
    </div>
  );
}
