import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { fmtDuracao } from "@/lib/duracao";
import { PRODUTORA } from "@/lib/produtora";
import { useVoltar } from "@/hooks/useVoltar";
import { primeiroDiaISO } from "@/lib/dataLocal";

/**
 * Carta de fechamento do mês — o documento que vai pro cliente.
 *
 * Dois formatos, porque os dois contratos respondem perguntas diferentes:
 *
 *  • TABELA (Sicredi Região): o cliente compra PEÇAS. O relatório mostra o
 *    que foi entregue, de que tipo, e o resumo por tipo. Alteração aparece
 *    como número — não é cobrada, mas o cliente precisa ver que existiu.
 *
 *  • HORAS (Sicredi Sul Minas): o cliente compra TEMPO. O relatório mostra a
 *    hora por entregável, separando edição de alteração, e quem pediu o quê.
 *
 * Impressão: `window.print()` com @media print escondendo a barra. O papel é
 * A4 e o preto vira branco — carta de cobrança se imprime, se assina e se
 * arquiva; fundo escuro gasta tinta e fica ilegível no fax do financeiro.
 */
/** 2026-07-30 → 30/07/26. Fora do componente: a célula abaixo também usa. */
const fmtISO = (iso?: string | null) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "—";

/**
 * Data de solicitação. Só a demanda é fonte confiável — `created_at` da peça
 * é data de CADASTRO, e nas peças importadas do ClickUp isso é o dia da
 * importação (todas iguais, o que o Djêisson viu no fechamento). Sem demanda,
 * mostra o início do trabalho com "~", que diz ao leitor que é referência e
 * não o pedido.
 */
function CelulaSolicitado({ linha }: { linha: any }) {
  if (linha.veioDeDemanda && linha.solicitadoEm) {
    return <>{fmtISO(String(linha.solicitadoEm).slice(0, 10))}</>;
  }
  if (linha.inicioEm) {
    return (
      <span title="Sem registro de solicitação pelo formulário — data em que o job entrou no sistema, que é a mesma que define o período">
        ~{fmtISO(String(linha.inicioEm).slice(0, 10))}
      </span>
    );
  }
  return <>—</>;
}

export default function RelatorioCliente() {
  const { clientId, mes } = useParams();
  const voltar = useVoltar("/faturamento-mensal");
  const ref = `${mes}-01`;
  const [ano, m] = (mes || "").split("-").map(Number);
  const fim = primeiroDiaISO(ano, m + 1);

  const { data, isLoading } = useQuery({
    queryKey: ["relatorio-cliente", clientId, mes],
    queryFn: async () => {
      // Projetos primeiro: o resto filtra por eles. Antes as horas vinham
      // filtradas por `start_at` no mês, e era daí que o relatório divergia
      // da fatura — o fechamento passou a cortar o mês pela CRIAÇÃO do job, e
      // aqui continuava cortando por quando a hora foi lançada.
      const proj = await (supabase as any)
        .from("projects").select("id, name, numero, client_id, faturamento, criado_em, created_at")
        .eq("client_id", clientId);
      const meus = new Set((proj.data || []).filter((p: any) => p.faturamento === "mensal").map((p: any) => p.id));
      const ids = [...meus] as string[];

      const [cli, fat, ent, criacao, alt, dem, dia, hrs, prof] = await Promise.all([
        (supabase as any).from("clients").select("*").eq("id", clientId).maybeSingle(),
        (supabase as any).from("faturamento_mensal").select("*").eq("client_id", clientId).eq("ref_mes", ref).maybeSingle(),
        ids.length
          ? (supabase as any).from("deliverables")
              .select("id, codigo, titulo, project_id, data_entrega, created_at, tipo_cobranca, cobranca_percent, status, solicitado_por")
              .in("project_id", ids)
          : Promise.resolve({ data: [] }),
        // A data que decide o mês — a mesma fonte que o fechamento usa.
        (supabase as any).from("deliverables_criacao").select("id, criacao_efetiva")
          .gte("criacao_efetiva", ref).lt("criacao_efetiva", fim),
        (supabase as any).from("deliverable_alteracoes").select("id, deliverable_id, titulo, created_at, criado_por"),
        (supabase as any).from("demandas").select("id, projeto_id, solicitante_nome, created_at").eq("client_id", clientId),
        (supabase as any).from("diarias_por_dia").select("*").eq("client_id", clientId).gte("data", ref).lt("data", fim),
        // TODAS as horas dos projetos do cliente, sem corte de data: quem
        // decide o mês é a peça, não o dia do apontamento. Hora de alteração
        // lançada depois do virar do mês estava sumindo da carta.
        ids.length
          ? (supabase as any).from("time_entries")
              .select("deliverable_id, project_id, duration_min, alteracao_id, billable, start_at")
              .in("project_id", ids)
          : Promise.resolve({ data: [] }),
        (supabase as any).from("profiles").select("id, full_name, avatar_url"),
      ]);
      return {
        cliente: cli.data, fatura: fat.data,
        projetos: new Map<string, any>((proj.data || []).map((p: any) => [p.id, p])),
        entregas: ((ent.data || []) as any[]).filter((e: any) => meus.has(e.project_id)),
        projetosMensais: meus,
        // Peças cuja criação cai no mês — o recorte do fechamento.
        idsDoMes: new Set(((criacao.data || []) as any[]).map((r: any) => r.id)),
        alteracoes: (alt.data || []) as any[],
        demandas: (dem.data || []) as any[],
        diarias: (dia.data || []) as any[],
        horas: ((hrs.data || []) as any[]).filter((t: any) => t.billable),
        pessoas: new Map<string, string>((prof.data || []).map((p: any) => [p.id, p.full_name])),
      };
    },
  });

  const calc = useMemo(() => {
    if (!data) return null;
    const { entregas, alteracoes, demandas, horas } = data;
    const demPorProjeto = new Map<string, any>(demandas.filter((d: any) => d.projeto_id).map((d: any) => [d.projeto_id, d]));
    const idsEnt = new Set(entregas.map((e: any) => e.id));   // todas as peças do cliente

    // Alterações do mês, só das peças deste relatório.
    const altDoMes = alteracoes.filter(
      (a: any) => idsEnt.has(a.deliverable_id) && (a.created_at || "") >= ref && (a.created_at || "") < fim,
    );   // idsEnt = todas as peças do cliente, não só as do mês
    const altPorEnt = new Map<string, any[]>();
    for (const a of altDoMes) {
      if (!altPorEnt.has(a.deliverable_id)) altPorEnt.set(a.deliverable_id, []);
      altPorEnt.get(a.deliverable_id)!.push(a);
    }

    // Referência de "quando entrou" pra quem não veio de demanda: a data de
    // CRIAÇÃO do job — a mesma que define o mês. Era o primeiro apontamento
    // de hora, e por isso o ADVR-4288 saía com "~29/07" numa carta de julho
    // sendo de 12/06: a data mostrada contradizia o próprio período.
    const inicio = new Map<string, string>();
    for (const e of entregas) {
      const p = data.projetos.get(e.project_id);
      const criacao = p?.criado_em || p?.created_at || e.created_at;
      if (criacao) inicio.set(e.id, criacao);
    }

    // Horas por peça, separando edição de alteração.
    const hPorEnt = new Map<string, { edic: number; alt: number }>();
    for (const t of horas) {
      if (!t.deliverable_id) continue;
      const cur = hPorEnt.get(t.deliverable_id) || { edic: 0, alt: 0 };
      if (t.alteracao_id) cur.alt += t.duration_min || 0;
      else cur.edic += t.duration_min || 0;
      hPorEnt.set(t.deliverable_id, cur);
    }

    // Peça entra na carta quando FOI CRIADA no período — o mesmo recorte da
    // fatura. Antes entrava por hora lançada no mês ou entrega no mês, e por
    // isso a carta listava um trabalho e a fatura cobrava outro: o ADVR-4288
    // (criado em 12/06) aparecia em julho porque a hora dele foi apontada em
    // 29/07, e o total embaixo — que vem do fechamento — não o incluía.
    const doPeriodo = entregas.filter((e: any) => data.idsDoMes.has(e.id));

    const linhas: any[] = doPeriodo.map((e: any) => {
      const dem = demPorProjeto.get(e.project_id);
      const h = hPorEnt.get(e.id) || { edic: 0, alt: 0 };
      return {
        ...e,
        projeto: data.projetos.get(e.project_id)?.name || "",
        // Data de SOLICITAÇÃO: a da demanda quando o pedido entrou pelo
        // formulário; senão a data em que a peça foi criada no sistema, que
        // é o mais perto disso que existe.
        // Só a demanda é fonte de "quando pediram". Sem ela, mostramos o
        // início do trabalho, marcado como aproximado — melhor um dado
        // honesto e rotulado do que uma data errada com cara de certa.
        solicitadoEm: dem?.created_at || null,
        inicioEm: inicio.get(e.id) || null,
        veioDeDemanda: !!dem,
        // Prioriza o que está NA PEÇA: a demanda diz quem abriu o projeto,
        // a peça diz quem pediu aquele material — quando são pessoas
        // diferentes, é a segunda que responde a dúvida do fechamento.
        solicitante: e.solicitado_por || dem?.solicitante_nome || null,
        alteracoes: altPorEnt.get(e.id) || [],
        minEdic: h.edic, minAlt: h.alt,
      };
    }).sort((a: any, b: any) => (a.data_entrega || "").localeCompare(b.data_entrega || ""));

    const porTipo = new Map<string, { n: number; meias: number }>();
    for (const l of linhas) {
      const t = l.tipo_cobranca || "sem tipo";
      const cur = porTipo.get(t) || { n: 0, meias: 0 };
      cur.n += 1;
      if (Number(l.cobranca_percent ?? 100) !== 100) cur.meias += 1;
      porTipo.set(t, cur);
    }

    const ranking = (campo: (l: any) => string | null, peso: (l: any) => number) => {
      const m = new Map<string, number>();
      for (const l of linhas) {
        const k = campo(l);
        if (!k) continue;
        m.set(k, (m.get(k) || 0) + peso(l));
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };

    // Hora lançada no projeto sem peça vinculada: aparece como uma linha
    // própria em vez de sumir. O fechamento cobra, a carta mostra. Sem peça,
    // quem dá o mês é a criação do PROJETO — mesma regra da função.
    const minSemPeca = horas
      .filter((t: any) => {
        if (t.deliverable_id) return false;
        const p = data.projetos.get(t.project_id);
        const criacao = p?.criado_em || p?.created_at || "";
        return criacao >= ref && criacao < fim;
      })
      .reduce((s: number, t: any) => s + (t.duration_min || 0), 0);

    return {
      linhas, porTipo, minSemPeca,
      totalAlt: altDoMes.length,
      minEdic: linhas.reduce((s: number, l: any) => s + l.minEdic, 0) + minSemPeca,
      minAlt: linhas.reduce((s: number, l: any) => s + l.minAlt, 0),
      quemSolicita: ranking((l) => l.solicitante, () => 1),
      quemAltera: ranking((l) => l.solicitante, (l) => l.alteracoes.length).filter(([, n]) => n > 0),
      semSolicitante: linhas.filter((l: any) => !l.solicitante).length,
    };
  }, [data, ref, fim]);

  if (isLoading || !data || !calc) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const modelo = data.fatura?.modelo || "tabela";
  const emissao = new Date();
  const venc = new Date(emissao.getTime() + 7 * 86400000);
  const fmtD = (d: Date) => d.toLocaleDateString("pt-BR");
  const periodo = new Date(ano, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const ultimoDia = new Date(ano, m, 0).getDate();
  const custoLogistica = data.diarias.reduce(
    (s: number, d: any) => s + Number(d.custo_logistica || 0) + Number(d.custo_alimentacao || 0) + Number(d.custo_hospedagem || 0), 0);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 14mm; }
          body { background: #fff !important; }
          .folha { color: #111 !important; background: #fff !important; }
          .folha * { color: inherit !important; border-color: #ddd !important; }
          .folha .destaque { color: #111 !important; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border/50 bg-background/95 px-4 py-3 backdrop-blur">
        <button onClick={voltar} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>
        <span className="text-xs text-muted-foreground">
          Relatório de {data.cliente?.name} · {periodo}
        </span>
        <Button size="sm" className="ml-auto" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir / Salvar PDF
        </Button>
      </div>

      <div className="folha mx-auto max-w-4xl bg-white p-10 text-[#111]">
        {/* Cabeçalho: quem manda, pra quem, e de que período. */}
        <div className="flex items-start justify-between gap-6 border-b border-[#ddd] pb-5">
          <div>
            <p className="text-xl font-bold tracking-tight">{PRODUTORA.wordmark}</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#888]">{PRODUTORA.descricao}</p>
          </div>
          <div className="text-right text-xs leading-relaxed text-[#555]">
            <p className="text-sm font-semibold text-[#111]">{data.cliente?.name}</p>
            {data.cliente?.contact_name && <p>A/C {data.cliente.contact_name}</p>}
            <p className="mt-1">Emitido em {fmtD(emissao)}</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#888]">Fechamento do período</p>
          <h1 className="text-2xl font-bold capitalize tracking-tight">{periodo}</h1>
          <p className="mt-1 text-xs text-[#555]">
            Apuração de 01/{String(m).padStart(2, "0")}/{ano} a {ultimoDia}/{String(m).padStart(2, "0")}/{ano}
          </p>
        </div>

        {/* ---------- TABELA: o cliente compra peças ---------- */}
        {modelo === "tabela" && (
          <>
            <Secao titulo="Entregas do período">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#ddd] text-left text-[10px] uppercase tracking-wider text-[#888]">
                    <th className="py-1.5 font-medium">Cód.</th>
                    <th className="py-1.5 font-medium">Entrega</th>
                    <th className="py-1.5 font-medium">Solicitado</th>
                    <th className="py-1.5 font-medium">Por</th>
                    <th className="py-1.5 font-medium">Tipo</th>
                    <th className="py-1.5 text-right font-medium">Entregue</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.linhas.map((l: any) => (
                    <tr key={l.id} className="border-b border-[#f0f0f0]">
                      <td className="py-1.5 pr-3 font-mono text-[10px] text-[#888]">{l.codigo || "—"}</td>
                      <td className="py-1.5 pr-3">{l.titulo}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-[#555]"><CelulaSolicitado linha={l} /></td>
                      <td className="py-1.5 pr-3 text-[#555]">{l.solicitante || "—"}</td>
                      <td className="py-1.5 pr-3">
                        {l.tipo_cobranca || "—"}
                        {Number(l.cobranca_percent ?? 100) !== 100 && ` (${Number(l.cobranca_percent)}%)`}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-[#555]">{fmtISO(l.data_entrega)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Secao>

            <Secao titulo="Resumo por tipo">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs sm:grid-cols-3">
                {[...calc.porTipo.entries()].map(([tipo, v]) => (
                  <div key={tipo} className="flex justify-between border-b border-[#f0f0f0] py-1">
                    <span>{tipo}</span>
                    <span className="tabular-nums font-medium">
                      {v.n}{v.meias > 0 && <span className="text-[#888]"> ({v.meias} pela metade)</span>}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-[#555]">
                <b>{calc.totalAlt}</b> {calc.totalAlt === 1 ? "alteração solicitada" : "alterações solicitadas"} no período —
                sem custo adicional, informado para acompanhamento.
              </p>
            </Secao>
          </>
        )}

        {/* ---------- HORAS: o cliente compra tempo ---------- */}
        {modelo === "horas" && (
          <>
            <Secao titulo="Entregas e horas do período">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#ddd] text-left text-[10px] uppercase tracking-wider text-[#888]">
                    <th className="py-1.5 font-medium">Cód.</th>
                    <th className="py-1.5 font-medium">Entregável</th>
                    <th className="py-1.5 font-medium">Solicitado</th>
                    <th className="py-1.5 font-medium">Por</th>
                    <th className="py-1.5 text-right font-medium">Edição</th>
                    <th className="py-1.5 text-right font-medium">Alterações</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.linhas.map((l: any) => (
                    <tr key={l.id} className="border-b border-[#f0f0f0]">
                      <td className="py-1.5 pr-3 font-mono text-[10px] text-[#888]">{l.codigo || "—"}</td>
                      <td className="py-1.5 pr-3">{l.titulo}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-[#555]"><CelulaSolicitado linha={l} /></td>
                      <td className="py-1.5 pr-3 text-[#555]">{l.solicitante || "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">{l.minEdic > 0 ? fmtDuracao(l.minEdic) : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {l.alteracoes.length > 0
                          ? `${l.alteracoes.length}× · ${l.minAlt > 0 ? fmtDuracao(l.minAlt) : "—"}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {calc.minSemPeca > 0 && (
                    <tr className="border-b border-[#f0f0f0] text-[#555]">
                      <td className="py-1.5 pr-3">—</td>
                      <td className="py-1.5 pr-3 italic">Horas de projeto sem peça específica</td>
                      <td className="py-1.5 pr-3">—</td>
                      <td className="py-1.5 pr-3">—</td>
                      <td className="py-1.5 text-right tabular-nums">{fmtDuracao(calc.minSemPeca)}</td>
                      <td className="py-1.5 text-right">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Secao>

            <Secao titulo="Resumo do período">
              <div className="grid grid-cols-3 gap-6 text-xs">
                <Kpi rot="Horas de edição" v={fmtDuracao(calc.minEdic)} />
                <Kpi rot="Horas de alteração" v={fmtDuracao(calc.minAlt)} />
                <Kpi rot="Alterações pedidas" v={String(calc.totalAlt)} />
              </div>
              {(calc.quemSolicita.length > 0 || calc.quemAltera.length > 0) && (
                <div className="mt-4 grid gap-6 sm:grid-cols-2">
                  {calc.quemSolicita.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#888]">Quem mais solicitou</p>
                      {calc.quemSolicita.slice(0, 5).map(([q, n]) => (
                        <div key={q} className="flex justify-between border-b border-[#f0f0f0] py-1 text-xs">
                          <span>{q}</span><span className="tabular-nums">{n}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {calc.quemAltera.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#888]">Quem mais pediu alteração</p>
                      {calc.quemAltera.slice(0, 5).map(([q, n]) => (
                        <div key={q} className="flex justify-between border-b border-[#f0f0f0] py-1 text-xs">
                          <span>{q}</span><span className="tabular-nums">{n}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Secao>
          </>
        )}

        {/* Diárias: valem pros dois formatos quando existem. */}
        {data.diarias.length > 0 && (
          <Secao titulo="Diárias de gravação">
            <div className="space-y-1 text-xs">
              {data.diarias.map((d: any) => (
                <div key={d.data} className="flex justify-between border-b border-[#f0f0f0] py-1">
                  <span>
                    {fmtISO(d.data)}
                    {Number(d.fracao) < 1 && <span className="text-[#888]"> · meia diária</span>}
                    {d.projetos > 1 && <span className="text-[#888]"> · {d.projetos} projetos no mesmo dia</span>}
                  </span>
                  <span className="tabular-nums">{String(d.fracao).replace(".", ",")}</span>
                </div>
              ))}
            </div>
            {/* Duas parcelas na carta também: o dia é serviço, os custos do
                dia são repasse. Somar os dois numa linha só faria o cliente
                perguntar de onde veio o número. */}
            <div className="mt-2 space-y-0.5 text-xs">
              {Number(data.fatura?.detalhe?.diarias_valor || 0) > 0 && (
                <p className="flex justify-between">
                  <span>
                    {String(Number(data.fatura.detalhe.diarias_cobradas || 0)).replace(".", ",")} diária(s) ×{" "}
                    {formatCurrency(Number(data.fatura.detalhe.diarias_valor_unitario || 0))}
                    {Number(data.fatura.detalhe.diarias_saldo_abatido || 0) > 0 &&
                      ` · ${String(Number(data.fatura.detalhe.diarias_saldo_abatido)).replace(".", ",")} abatida(s) do saldo`}
                  </span>
                  <b className="tabular-nums">{formatCurrency(Number(data.fatura.detalhe.diarias_valor))}</b>
                </p>
              )}
              {custoLogistica > 0 && (
                <p className="flex justify-between">
                  <span>Logística, alimentação e hospedagem</span>
                  <b className="tabular-nums">
                    {formatCurrency(Number(data.fatura?.detalhe?.diarias_repasse || custoLogistica))}
                  </b>
                </p>
              )}
            </div>
          </Secao>
        )}

        {/* Valor e prazo — o motivo do documento. */}
        <div className="mt-8 border-t-2 border-[#111] pt-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="text-xs text-[#555]">
              <p>Vencimento: <b className="text-[#111]">{fmtD(venc)}</b></p>
              <p className="mt-0.5">7 dias corridos a partir da emissão.</p>
              {Number(data.fatura?.detalhe?.saldo?.usado || 0) > 0 && (
                <p className="mt-1.5">
                  Saldo abatido: <b className="text-[#111]">{formatCurrency(Number(data.fatura.detalhe.saldo.usado))}</b>
                  {Number(data.fatura.detalhe.saldo.sobra) > 0 &&
                    ` · restam ${formatCurrency(Number(data.fatura.detalhe.saldo.sobra))} para o próximo período`}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#888]">Total do período</p>
              <p className="destaque text-3xl font-bold tracking-tight">
                {formatCurrency(Number(data.fatura?.total || 0))}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-[10px] text-[#999]">
          {PRODUTORA.nome} · {PRODUTORA.site} · {PRODUTORA.email}
        </p>
      </div>

      {calc.semSolicitante > 0 && (
        <p className="no-print mx-auto max-w-4xl px-10 py-4 text-xs text-muted-foreground">
          {calc.semSolicitante} de {calc.linhas.length} entregas estão sem solicitante: elas não vieram
          pelo formulário de demandas. Nesses casos a coluna “Solicitado” mostra{" "}
          <b>~a data em que o trabalho começou</b> (primeira hora lançada), não a data do pedido — o
          til está lá pra dizer isso. Antes aparecia a data de cadastro da peça, que nas importadas do
          ClickUp é o dia da importação: todas iguais.
        </p>
      )}
    </>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-7">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#888]">{titulo}</p>
      {children}
    </div>
  );
}

function Kpi({ rot, v }: { rot: string; v: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[#888]">{rot}</p>
      <p className="text-lg font-semibold tabular-nums">{v}</p>
    </div>
  );
}
