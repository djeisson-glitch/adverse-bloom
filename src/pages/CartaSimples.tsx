import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2, List, LayoutList } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { PRODUTORA, nomeArquivoProposta } from "@/lib/produtora";
import { useVoltar } from "@/hooks/useVoltar";
import { porBloco, comPadroes } from "@/lib/condicoes";

/**
 * Carta de orçamento SIMPLES — uma folha, tons de cinza.
 *
 * A carta que já existia é a peça de venda: capa, conceito, escopo escrito,
 * condições, elenco. Boa pra ganhar o job, longa demais pra tudo que vem
 * depois — confirmar valor, anexar num e-mail, mandar pro financeiro do
 * cliente. Pra isso o que se quer é a nota: itens, quantidade, unitário,
 * total, e acabou.
 *
 * MONOCROMÁTICA de propósito. O vermelho da Adverse é assinatura, não
 * decoração de tabela — e um documento de valor lido em tela, impresso em
 * laser preto-e-branco ou reencaminhado três vezes tem que sobreviver a
 * tudo isso sem perder hierarquia. Cinza resolve; cor vira ruído.
 *
 * E funciona DEPOIS de ganho ou perdido, que era o buraco: o menu de
 * proposta desabilita quando o negócio fecha, e justamente aí é quando mais
 * se pede o documento de volta.
 */

type Item = {
  id: string;
  item_name: string | null;
  descricao: string | null;
  quantity: number | null;
  diaria: number | null;
  client_unit_price: number | null;
  categoria_id: string | null;
  ordem: number | null;
};

const valorDaLinha = (i: Item) =>
  Number(i.quantity || 0) * Number(i.diaria ?? 1) * Number(i.client_unit_price || 0);

export default function CartaSimples() {
  const { id } = useParams<{ id: string }>();
  const voltar = useVoltar(`/orcamentos/${id}`);
  /** Resumida = uma linha por categoria. É o padrão: é o que "simples" quer dizer. */
  const [detalhada, setDetalhada] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["carta-simples", id],
    enabled: !!id,
    queryFn: async () => {
      const [deal, cats] = await Promise.all([
        (supabase as any).from("deals")
          .select("id, title, objetivo, stage, value, valor_proposta, created_at, client:clients(name, contact_name, email, phone)")
          .eq("id", id).maybeSingle(),
        (supabase as any).from("budget_categorias").select("id, codigo, nome, ordem").order("ordem"),
      ]);
      const budget = await (supabase as any).from("budgets")
        .select("id, budget_number, total_value, condicoes, created_at")
        .eq("deal_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const itens = budget.data?.id
        ? await (supabase as any).from("budget_items")
            .select("id, item_name, descricao, quantity, diaria, client_unit_price, categoria_id, ordem")
            .eq("budget_id", budget.data.id).order("ordem")
        : { data: [] };
      return {
        deal: deal.data,
        budget: budget.data,
        categorias: new Map<string, any>((cats.data || []).map((c: any) => [c.id, c])),
        itens: (itens.data || []) as Item[],
      };
    },
  });

  const calc = useMemo(() => {
    if (!data) return null;
    // Linha sem valor não vira linha de nota. O orçamento tem dezenas de itens
    // zerados (o template inteiro), e listá-los faria o cliente procurar o que
    // ele está comprando no meio do que não está.
    const comValor = data.itens.filter((i) => valorDaLinha(i) > 0);

    const porCategoria = new Map<string, { nome: string; ordem: number; total: number; itens: Item[] }>();
    for (const i of comValor) {
      const cat = data.categorias.get(i.categoria_id || "");
      const chave = cat?.id || "sem";
      const atual = porCategoria.get(chave) || {
        nome: cat?.nome || "Outros", ordem: cat?.ordem ?? 999, total: 0, itens: [],
      };
      atual.total += valorDaLinha(i);
      atual.itens.push(i);
      porCategoria.set(chave, atual);
    }
    const grupos = [...porCategoria.values()].sort((a, b) => a.ordem - b.ordem);
    const somaItens = comValor.reduce((s, i) => s + valorDaLinha(i), 0);

    // O total do orçamento manda sobre a soma das linhas: ele já passou pelo
    // arredondamento e pelos ajustes do editor. A soma serve de conferência.
    const total = Number(data.budget?.total_value) || somaItens
      || Number(data.deal?.valor_proposta) || Number(data.deal?.value) || 0;

    return { comValor, grupos, somaItens, total, difere: Math.abs(total - somaItens) > 0.5 };
  }, [data]);

  // Nome do arquivo no "Salvar como PDF".
  const titulo = data?.deal?.title;
  const numero = data?.budget?.budget_number;
  useEffect(() => {
    if (!titulo) return;
    const antes = document.title;
    document.title = nomeArquivoProposta(titulo, numero);
    return () => { document.title = antes; };
  }, [titulo, numero]);

  if (isLoading || !data || !calc) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const cli = data.deal?.client || {};
  const emissao = new Date();
  const validade = new Date(emissao.getTime() + 15 * 86400000);
  const fmtD = (d: Date) => d.toLocaleDateString("pt-BR");
  const cond = porBloco(comPadroes(data.budget?.condicoes));

  const linhas: { n: number; desc: string; qtd: string; unit: number | null; total: number }[] = detalhada
    ? calc.comValor.map((i, n) => ({
        n: n + 1,
        desc: (i.descricao || i.item_name || "Item").trim(),
        qtd: `${Number(i.quantity || 0)}${Number(i.diaria ?? 1) > 1 ? ` × ${Number(i.diaria)}` : ""}`,
        unit: Number(i.client_unit_price || 0),
        total: valorDaLinha(i),
      }))
    : calc.grupos.map((g, n) => ({
        n: n + 1,
        desc: g.nome,
        qtd: `${g.itens.length} ${g.itens.length === 1 ? "item" : "itens"}`,
        unit: null,
        total: g.total,
      }));

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          .nota { max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .nota, .nota * { color: #1a1a1a !important; border-color: #d8d8d8 !important; }
          .nota .faixa { background: #1a1a1a !important; color: #fff !important; }
          .nota .zebra { background: #f4f4f4 !important; }
          .nota tr { break-inside: avoid; }
          .nota thead { display: table-header-group; }
          .nota .bloco { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border/50 bg-background/95 px-4 py-3 backdrop-blur">
        <button onClick={voltar} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>
        <span className="text-xs text-muted-foreground">Carta simples · {data.deal?.title}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setDetalhada((v) => !v)}>
            {detalhada ? <List className="mr-1.5 h-3.5 w-3.5" /> : <LayoutList className="mr-1.5 h-3.5 w-3.5" />}
            {detalhada ? "Resumir por categoria" : "Detalhar item a item"}
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir / Salvar PDF
          </Button>
        </div>
      </div>

      {/* Tudo em cinza: #1a1a1a no texto forte, #666 no apoio, #d8d8d8 nas
          linhas. Sem cor nenhuma — a hierarquia vem de peso e espaço. */}
      <div className="nota mx-auto my-6 max-w-3xl bg-white px-12 py-10 text-[#1a1a1a] shadow-sm">
        {/* Faixa superior fina: o único elemento "cheio" da folha. */}
        <div className="faixa -mx-12 -mt-10 mb-10 h-2 bg-[#1a1a1a]" />

        <div className="mb-10 text-center">
          <p className="text-2xl font-extrabold tracking-tight">{PRODUTORA.wordmark}</p>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#8a8a8a]">{PRODUTORA.descricao}</p>
        </div>

        <div className="bloco mb-10 flex items-start justify-between gap-8">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a8a8a]">Para</p>
            <p className="mt-1 text-lg font-bold leading-tight">{cli.name || "—"}</p>
            {cli.contact_name && <p className="text-sm text-[#555]">A/C {cli.contact_name}</p>}
            {cli.email && <p className="text-xs text-[#777]">{cli.email}</p>}
            {cli.phone && <p className="text-xs text-[#777]">{cli.phone}</p>}
          </div>
          <div className="shrink-0 text-right">
            <table className="ml-auto text-xs">
              <tbody className="text-[#555]">
                <tr><td className="pr-4 text-left">Orçamento</td><td className="font-semibold text-[#1a1a1a]">#{numero || "—"}</td></tr>
                <tr><td className="pr-4 text-left">Emissão</td><td className="tabular-nums">{fmtD(emissao)}</td></tr>
                <tr><td className="pr-4 text-left">Validade</td><td className="tabular-nums">{fmtD(validade)}</td></tr>
              </tbody>
            </table>
            <p className="mt-3 text-3xl font-extrabold uppercase tracking-tight">Orçamento</p>
          </div>
        </div>

        {data.deal?.title && (
          <div className="bloco mb-6 border-t border-[#d8d8d8] pt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a8a8a]">Projeto</p>
            <p className="mt-0.5 text-sm font-semibold">{data.deal.title}</p>
            {data.deal.objetivo && <p className="mt-1 text-xs leading-relaxed text-[#555]">{data.deal.objetivo}</p>}
          </div>
        )}

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-[#1a1a1a] text-left text-[10px] uppercase tracking-wider">
              <th className="w-8 py-2 font-bold">Nº</th>
              <th className="py-2 font-bold">Descrição</th>
              <th className="w-20 py-2 text-right font-bold">Qtd.</th>
              {detalhada && <th className="w-28 py-2 text-right font-bold">Unitário</th>}
              <th className="w-28 py-2 text-right font-bold">Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={l.n} className={i % 2 === 1 ? "zebra bg-[#f4f4f4]" : ""}>
                <td className="py-2 pl-1 tabular-nums text-[#8a8a8a]">{l.n}</td>
                <td className="py-2 pr-3">{l.desc}</td>
                <td className="py-2 pr-2 text-right tabular-nums text-[#555]">{l.qtd}</td>
                {detalhada && (
                  <td className="py-2 pr-2 text-right tabular-nums text-[#555]">
                    {l.unit != null ? formatCurrency(l.unit) : "—"}
                  </td>
                )}
                <td className="py-2 pr-1 text-right font-medium tabular-nums">{formatCurrency(l.total)}</td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr><td colSpan={detalhada ? 5 : 4} className="py-6 text-center text-[#8a8a8a]">
                Nenhum item com valor na planilha deste orçamento.
              </td></tr>
            )}
          </tbody>
        </table>

        <div className="bloco mt-6 flex justify-end">
          <div className="w-64">
            {calc.difere && (
              // Diferença entre a soma das linhas e o total do orçamento é
              // arredondamento ou ajuste manual no editor. Mostrar em vez de
              // esconder: cliente que soma a coluna e não bate liga perguntando.
              <div className="flex justify-between border-b border-[#e8e8e8] py-1 text-xs text-[#777]">
                <span>Soma dos itens</span>
                <span className="tabular-nums">{formatCurrency(calc.somaItens)}</span>
              </div>
            )}
            <div className="faixa mt-2 flex items-baseline justify-between bg-[#1a1a1a] px-4 py-3 text-white">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Total</span>
              <span className="text-xl font-extrabold tabular-nums">{formatCurrency(calc.total)}</span>
            </div>
          </div>
        </div>

        {(cond.inclusos.length > 0 || cond.naoInclusos.length > 0) && (
          <div className="bloco mt-10 grid gap-6 border-t border-[#d8d8d8] pt-5 sm:grid-cols-2">
            {cond.inclusos.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a8a8a]">Incluso</p>
                <ul className="mt-1 space-y-0.5 text-xs text-[#333]">
                  {cond.inclusos.map((c) => <li key={c.chave}>· {c.rotulo}{c.obs ? ` — ${c.obs}` : ""}</li>)}
                </ul>
              </div>
            )}
            {cond.naoInclusos.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a8a8a]">Não incluso</p>
                <ul className="mt-1 space-y-0.5 text-xs text-[#333]">
                  {cond.naoInclusos.map((c) => <li key={c.chave}>· {c.rotulo}{c.obs ? ` — ${c.obs}` : ""}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="bloco mt-8 border-t border-[#d8d8d8] pt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a8a8a]">Condições</p>
          <p className="mt-1 text-xs leading-relaxed text-[#555]">
            Proposta válida até {fmtD(validade)}. Início da produção mediante aprovação formal.
            Valores em reais, impostos inclusos.
          </p>
        </div>

        <p className="mt-10 text-center text-[10px] text-[#9a9a9a]">
          {PRODUTORA.nome} · {PRODUTORA.site} · {PRODUTORA.email}
        </p>
      </div>
    </>
  );
}
