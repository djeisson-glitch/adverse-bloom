import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, X, Loader2 } from "lucide-react";
import { cru } from "@/lib/nomeCru";

/**
 * Comparativo lado a lado — o que cada plano inclui e o que não inclui.
 *
 * Djêisson (19/08/2026): "que inclusive tenha a opção de comparar todos com o
 * que inclui e não inclui."
 *
 * As LINHAS são os itens de escopo e as COLUNAS são os planos, como tabela de
 * preços. Pra isso funcionar, o mesmo item precisa ser reconhecido entre
 * planos — e é por isso que a chave é a descrição NORMALIZADA (`cru`):
 * "Vídeo 1min", "vídeo 1 min" e "VIDEO 1MIN" viram a mesma linha, senão a
 * tabela nasceria com uma linha por plano e não compararia nada.
 *
 * A célula diz três coisas diferentes:
 *   número   está incluso, nesta quantidade por mês
 *   ✗        o plano diz explicitamente que NÃO inclui
 *   —        o plano não fala disso (não é promessa nem recusa)
 *
 * A diferença entre ✗ e — importa na hora de vender: "não incluímos motion"
 * é uma resposta; silêncio é um mal-entendido esperando acontecer.
 */

const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function CompararPlanos() {
  const { data: planos = [], isLoading } = useQuery({
    queryKey: ["planos-comparar"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("planos_v").select("*").eq("ativo", true).order("valor_mensal");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: itens = [] } = useQuery({
    queryKey: ["plano-itens-todos"],
    queryFn: async () => (await (supabase as any)
      .from("plano_itens").select("plano_id, descricao, quantidade, incluso, diarias, ordem").order("ordem")).data || [],
  });

  // Linhas = itens únicos por descrição normalizada, na ordem em que aparecem.
  const linhas = useMemo(() => {
    const mapa = new Map<string, { rotulo: string; por: Map<string, any> }>();
    itens.forEach((it: any) => {
      const chave = cru(it.descricao) || it.descricao;
      if (!mapa.has(chave)) mapa.set(chave, { rotulo: it.descricao, por: new Map() });
      mapa.get(chave)!.por.set(it.plano_id, it);
    });
    return [...mapa.values()];
  }, [itens]);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!planos.length) return <p className="py-12 text-center text-sm text-muted-foreground">Nenhum plano ativo pra comparar.</p>;

  return (
    <div className="space-y-3">
      {/* A tabela rola sozinha: com 4 planos e nomes longos ela passa da tela,
          e é a TABELA que rola — não a página inteira. */}
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/20">
              <th className="w-[38%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                O que inclui
              </th>
              {planos.map((p: any) => (
                <th key={p.id} className="min-w-[130px] px-3 py-3 text-center">
                  <span className="block truncate font-semibold text-foreground" title={p.nome}>{p.nome}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {brl(p.valor_mensal)}/mês · {p.duracao_meses}m
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i} className="border-b border-border/30 last:border-0">
                <td className="px-4 py-2 text-foreground">{l.rotulo}</td>
                {planos.map((p: any) => {
                  const it = l.por.get(p.id);
                  return (
                    <td key={p.id} className="px-3 py-2 text-center">
                      {!it ? (
                        <span className="text-muted-foreground/40" title="Este plano não fala disso">—</span>
                      ) : it.incluso ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          {Number(it.quantidade) > 1
                            ? <b className="tabular-nums">{Number(it.quantidade)}</b>
                            : <Check className="h-4 w-4" />}
                        </span>
                      ) : (
                        <X className="mx-auto h-4 w-4 text-muted-foreground/50" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            <tr className="border-t border-border/60 bg-muted/10">
              <td className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Diárias inclusas / mês
              </td>
              {planos.map((p: any) => (
                <td key={p.id} className="px-3 py-2 text-center tabular-nums text-foreground">
                  {Number(p.diarias_mes || 0) || "—"}
                </td>
              ))}
            </tr>
            <tr className="bg-muted/10">
              <td className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total do contrato
              </td>
              {planos.map((p: any) => (
                <td key={p.id} className="px-3 py-2 text-center font-medium text-foreground">
                  {brl(p.valor_contrato)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        <b className="text-success">✓ / número</b> = incluso · <b>✗</b> = o plano diz que não inclui ·
        <b> —</b> = o plano não fala disso. A diferença entre ✗ e — importa na venda: "não incluímos motion"
        é resposta; silêncio é mal-entendido.
      </p>
    </div>
  );
}
