import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { PRODUTORA } from "@/lib/produtora";

/**
 * Orçamento aberto por link, sem login.
 *
 * É a planilha vista por fora — mentor, sócio, quem o Djêisson escolher — com
 * as camadas que o link autoriza. O filtro é feito no banco
 * (`orcamento_compartilhado`): o que este link não mostra não chega aqui nem
 * pelo DevTools.
 *
 * Fundo claro e sem menu: é documento pra ler e imprimir, não tela do sistema.
 */
export default function OrcamentoPublico() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["orcamento-publico", token],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("orcamento_compartilhado", { _token: token });
      return data as any;
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="max-w-sm text-center">
          <Lock className="mx-auto h-8 w-8 text-neutral-300" />
          <h1 className="mt-4 text-lg font-semibold text-neutral-800">Link indisponível</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Este link foi revogado, expirou, ou nunca existiu. Peça um novo a quem enviou.
          </p>
        </div>
      </div>
    );
  }

  const m = data.mostra || {};
  const itens: any[] = data.itens || [];
  const grupos: any[] = (data.grupos || []).filter((g: any) => Number(g.total) !== 0);
  const t = data.totais || {};
  const comissoes: any[] = data.comissoes || [];

  // Agrupa por categoria mantendo a ordem que veio do banco.
  const porGrupo = new Map<string, any[]>();
  for (const i of itens) {
    const k = `${i.cat_codigo || "—"} ${i.cat_nome || "Sem grupo"}`;
    if (!porGrupo.has(k)) porGrupo.set(k, []);
    porGrupo.get(k)!.push(i);
  }
  // Grupo sem nenhuma linha com valor não entra: numa vista sem preço ainda
  // vale mostrar a estrutura, mas com preço à vista o grupo zerado é ruído.
  const gruposVisiveis = [...porGrupo.entries()].filter(([, linhas]) =>
    m.valores ? linhas.some((l) => Number(l.valor) !== 0) : true,
  );

  const custoTotal = m.custos
    ? itens.reduce((s, i) => s + Number(i.custo || 0), 0)
    : 0;

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-900 print:bg-white print:py-0">
      <div className="mx-auto max-w-4xl rounded-lg bg-white p-8 shadow-sm print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">{PRODUTORA.nome}</p>
            <h1 className="mt-1 text-xl font-semibold">{data.job?.titulo}</h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              {data.job?.numero && <span className="font-mono">#{data.job.numero} · </span>}
              {data.job?.cliente || "Sem cliente"}
              {data.job?.tipo && ` · ${String(data.job.tipo).replace(/_/g, " ")}`}
            </p>
          </div>
          <div className="text-right text-xs text-neutral-400">
            <p>compartilhado com</p>
            <p className="text-sm font-medium text-neutral-700">{data.compartilhado_com}</p>
          </div>
        </header>

        {m.briefing && (data.job?.objetivo || data.job?.local || data.job?.formatos?.length) && (
          <section className="border-b border-neutral-200 py-5">
            <h2 className="text-[11px] uppercase tracking-wider text-neutral-400">Briefing</h2>
            {data.job.objetivo && (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                {data.job.objetivo}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
              {data.job.local && <span>Local: {data.job.local}</span>}
              {!!data.job.formatos?.length && <span>Formatos: {data.job.formatos.join(", ")}</span>}
            </div>
          </section>
        )}

        {/* Planilha */}
        <section className="py-5">
          {gruposVisiveis.map(([nome, linhas]) => {
            const totalGrupo = linhas.reduce((s: number, l: any) => s + Number(l.valor || 0), 0);
            return (
              <div key={nome} className="mb-5 break-inside-avoid">
                <div className="flex items-baseline justify-between border-b border-neutral-200 pb-1">
                  <h3 className="text-sm font-semibold">{nome}</h3>
                  {m.valores && (
                    <span className="text-sm font-medium tabular-nums">{formatCurrency(totalGrupo)}</span>
                  )}
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {linhas
                      .filter((l: any) => (m.valores ? Number(l.valor) !== 0 : true))
                      .map((l: any) => (
                        <tr key={l.id} className="border-b border-neutral-100 last:border-0">
                          <td className="py-1.5 pr-3">
                            {l.descricao}
                            {l.tira_taxa && (
                              <span className="ml-2 rounded bg-neutral-100 px-1 text-[10px] text-neutral-500">
                                fora da taxa
                              </span>
                            )}
                            {m.observacoes && l.observacoes && (
                              <span className="block text-xs text-neutral-400">{l.observacoes}</span>
                            )}
                          </td>
                          <td className="w-20 py-1.5 text-right text-xs tabular-nums text-neutral-500">
                            {Number(l.quantity || 0)} × {Number(l.diaria ?? 1)}
                          </td>
                          {m.valores && (
                            <td className="w-28 py-1.5 text-right tabular-nums">
                              {formatCurrency(Number(l.valor || 0))}
                              {m.custos && (
                                <span className="block text-[10px] text-neutral-400">
                                  custo {formatCurrency(Number(l.custo || 0))}
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          {!gruposVisiveis.length && (
            <p className="text-sm text-neutral-400">Nenhuma linha para mostrar.</p>
          )}
        </section>

        {/* Fechamento da conta — cada bloco só aparece se o link deixar */}
        {(m.valores || m.comissoes || m.impostos) && (
          <section className="space-y-1.5 border-t border-neutral-200 pt-5 text-sm">
            {m.valores && (
              <Linha label="Custo de produção" valor={Number(t.custo_producao || 0)} />
            )}
            {m.rentabilidade && t.margem_percent != null && (
              <Linha label={`Taxa da produtora (${Number(t.margem_percent)}%)`} sutil />
            )}
            {m.comissoes && !!comissoes.length && (
              <>
                {comissoes.map((c: any, i: number) => (
                  <Linha
                    key={i}
                    label={`Comissão · ${c.nome}${c.tipo === "%" ? ` (${c.valor}%)` : ""}`}
                    sutil
                  />
                ))}
              </>
            )}
            {m.impostos && t.imposto_percent != null && (
              <Linha label={`Imposto (${Number(t.imposto_percent)}%)`} sutil />
            )}
            {m.valores && (
              <div className="flex items-baseline justify-between border-t border-neutral-300 pt-2 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(Number(t.total || 0))}</span>
              </div>
            )}
          </section>
        )}

        {/* Rentabilidade: o número que só faz sentido pra quem está do lado de cá */}
        {m.rentabilidade && (
          <section className="mt-5 rounded-md bg-neutral-50 p-4">
            <h2 className="text-[11px] uppercase tracking-wider text-neutral-400">Rentabilidade</h2>
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <Numero rotulo="Valor cobrado" valor={Number(t.custo_producao || 0)} />
              {m.custos && <Numero rotulo="Custo real" valor={custoTotal} />}
              {m.custos && (
                <Numero rotulo="Sobra das linhas" valor={Number(t.custo_producao || 0) - custoTotal} />
              )}
            </div>
          </section>
        )}

        <footer className="mt-8 border-t border-neutral-200 pt-4 text-[11px] text-neutral-400">
          Documento gerado pelo {PRODUTORA.nome} OS para consulta. Link de acesso restrito — não
          publique nem repasse.
        </footer>
      </div>
    </div>
  );
}

function Linha({ label, valor, sutil }: { label: string; valor?: number; sutil?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${sutil ? "text-neutral-500" : ""}`}>
      <span>{label}</span>
      {valor != null && <span className="tabular-nums">{formatCurrency(valor)}</span>}
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-neutral-400">{rotulo}</p>
      <p className="text-lg font-semibold tabular-nums">{formatCurrency(valor)}</p>
    </div>
  );
}
