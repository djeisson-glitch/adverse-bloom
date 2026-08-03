import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { fmtDuracao } from "@/lib/duracao";
import { toast } from "sonner";

/**
 * Como esta peça é cobrada — o tipo da tabela do cliente e quanto dele.
 *
 * Estava só na revisão do fechamento, o que era metade certo: o editor não
 * tem que pensar em preço enquanto edita. Mas escondia também de quem cobra,
 * que perguntou "não entendi onde seleciono o tipo de edição por vídeo".
 *
 * Aqui aparece SÓ pra quem pode ver dinheiro, e só quando o cliente tem
 * tabela de preço. Pro editor a peça continua sem valor nenhum na tela.
 *
 * Não é obrigatório preencher: deixando em branco, o fechamento decide pelo
 * nome ou pelas horas. Isto é o atalho de quem já sabe o que a peça é.
 */
export function CobrancaEntregavel({
  did, clientId, tipo, percent, horasMin, onChanged,
}: {
  did: string; clientId?: string | null;
  tipo?: string | null; percent?: number | null;
  horasMin: number; onChanged: () => void;
}) {
  const qc = useQueryClient();

  const { data: precos = [] } = useQuery({
    queryKey: ["precos-cliente", clientId],
    enabled: !!clientId,
    queryFn: async () =>
      (await (supabase as any).from("client_precos").select("tipo, preco, horas_ref")
        .eq("client_id", clientId).eq("ativo", true).order("ordem")).data || [],
  });

  if (!clientId || precos.length === 0) return null;

  const pct = Number(percent ?? 100);
  const linha = precos.find((p: any) => p.tipo === tipo);
  const valor = linha ? Number(linha.preco) * pct / 100 : null;
  // Estourou a faixa: a peça consumiu mais do que o tipo prevê. Não impede
  // nada — só avisa que o preço ficou barato pro trabalho que deu.
  const estourou = linha?.horas_ref && horasMin / 60 > Number(linha.horas_ref);

  const gravar = async (patch: Record<string, unknown>) => {
    const { data, error } = await (supabase as any)
      .from("deliverables").update(patch).eq("id", did).select("id");
    if (error) return toast.error("Não salvou", { description: error.message });
    if (!data?.length) return toast.error("Não salvou — sem permissão pra mexer nesta peça?");
    qc.invalidateQueries({ queryKey: ["entregavel", did] });
    onChanged();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3 text-xs">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cobrança</span>

      <Select value={tipo || "auto"} onValueChange={(v) => gravar({ tipo_cobranca: v === "auto" ? null : v })}>
        <SelectTrigger className="h-7 w-[170px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">decidir no fechamento</SelectItem>
          {precos.map((p: any) => (
            <SelectItem key={p.tipo} value={p.tipo}>
              {p.tipo} · {formatCurrency(Number(p.preco))}
              {p.horas_ref ? ` · ${p.horas_ref}h` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={String(pct)} onValueChange={(v) => gravar({ cobranca_percent: Number(v) })}>
        <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="100">cheia</SelectItem>
          <SelectItem value="50">meia (50%)</SelectItem>
          <SelectItem value="0">cortesia</SelectItem>
        </SelectContent>
      </Select>

      {valor !== null && (
        <span className={`font-semibold tabular-nums ${pct === 100 ? "text-foreground" : "text-warning"}`}>
          {formatCurrency(valor)}
        </span>
      )}

      {estourou && (
        <span className="text-[11px] text-warning" title={`a tabela prevê ${linha.horas_ref}h para "${tipo}"`}>
          {fmtDuracao(horasMin)} · passou das {linha.horas_ref}h do tipo
        </span>
      )}

      {!tipo && (
        <span className="text-[11px] text-muted-foreground">
          em branco, o fechamento decide pelo nome ou pelas horas
        </span>
      )}
    </div>
  );
}
