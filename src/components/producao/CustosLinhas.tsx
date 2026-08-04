import { Input } from "@/components/ui/input";
import { Plus, Trash2, Fuel, UtensilsCrossed, BedDouble } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export type ItemCusto = { cat: string; descricao: string; valor: number };

export const CATS = [
  { cat: "logistica", rotulo: "Logística", exemplo: "aluguel de carro, combustível, pedágio", icone: Fuel },
  { cat: "alimentacao", rotulo: "Alimentação", exemplo: "almoço da equipe, craft, água", icone: UtensilsCrossed },
  { cat: "hospedagem", rotulo: "Hospedagem", exemplo: "diária de hotel, taxa", icone: BedDouble },
] as const;

export const somaCustos = (itens?: ItemCusto[] | null) =>
  (itens || []).reduce((s, i) => s + (Number(i.valor) || 0), 0);

/**
 * Custos da diária lançados LINHA A LINHA.
 *
 * Antes eram três caixas de total: quem lançava somava de cabeça aluguel +
 * combustível + pedágio e escrevia R$ 520. Some errado e ninguém descobre;
 * some certo e em dois meses ninguém lembra o que tinha dentro — e é esse
 * número que vai repassado pro cliente.
 *
 * Cada linha é descrição + valor. O total por categoria e o geral são
 * calculados aqui e no banco (trigger), então não tem como divergirem.
 */
export function CustosLinhas({ itens, onChange, compacto }: {
  itens: ItemCusto[];
  onChange: (novos: ItemCusto[]) => void;
  compacto?: boolean;
}) {
  const doCat = (cat: string) => itens.filter((i) => i.cat === cat);

  const mudar = (alvo: ItemCusto, patch: Partial<ItemCusto>) =>
    onChange(itens.map((i) => (i === alvo ? { ...i, ...patch } : i)));

  const remover = (alvo: ItemCusto) => onChange(itens.filter((i) => i !== alvo));

  const adicionar = (cat: string) =>
    onChange([...itens, { cat, descricao: "", valor: 0 }]);

  const total = somaCustos(itens);

  return (
    <div className="space-y-3">
      {CATS.map(({ cat, rotulo, exemplo, icone: Icone }) => {
        const linhas = doCat(cat);
        const subtotal = somaCustos(linhas);
        return (
          <div key={cat} className="rounded-lg border border-border/50 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Icone className="h-3.5 w-3.5 text-muted-foreground" /> {rotulo}
              </p>
              <span className={`text-xs tabular-nums ${subtotal > 0 ? "font-medium text-foreground" : "text-muted-foreground/60"}`}>
                {formatCurrency(subtotal)}
              </span>
            </div>

            {linhas.length === 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">{exemplo}</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {linhas.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={l.descricao}
                      onChange={(e) => mudar(l, { descricao: e.target.value })}
                      placeholder={exemplo.split(",")[0]}
                      className={compacto ? "h-7 flex-1 text-xs" : "h-8 flex-1 text-sm"}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={l.valor || ""}
                      onChange={(e) => mudar(l, { valor: Number(e.target.value) || 0 })}
                      placeholder="0,00"
                      className={compacto ? "h-7 w-24 text-xs" : "h-8 w-28 text-sm"}
                    />
                    <button
                      onClick={() => remover(l)}
                      title="Remover esta linha"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => adicionar(cat)}
              className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> adicionar linha
            </button>
          </div>
        );
      })}

      {total > 0 && (
        <div className="flex items-baseline justify-between border-t border-border/50 pt-2 text-sm">
          <span className="text-muted-foreground">Total de custos</span>
          <span className="font-semibold tabular-nums text-foreground">{formatCurrency(total)}</span>
        </div>
      )}
    </div>
  );
}
