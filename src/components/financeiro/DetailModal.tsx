import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type CAItem, displayCat } from "@/lib/financial";

interface DetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: CAItem[];
  valueField?: "total" | "pago" | "nao_pago";
}

export function DetailModal({ open, onOpenChange, title, items, valueField = "total" }: DetailModalProps) {
  const val = (r: CAItem) => r?.[valueField] ?? r?.total ?? 0;
  const sorted = [...items].sort((a, b) => val(b) - val(a));
  const total = sorted.reduce((s, r) => s + val(r), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{title}</span>
            <span className="text-base font-bold text-primary">{formatCurrency(total)}</span>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2 font-medium">Descrição</th>
                <th className="pb-2 font-medium">Categoria</th>
                <th className="pb-2 font-medium" title="Mês em que o fato aconteceu (base das margens)">Competência</th>
                <th className="pb-2 font-medium" title="Mês em que vence/paga (como aparece no Conta Azul)">Vencimento</th>
                <th className="pb-2 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, i) => (
                <tr key={item?.id || i} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="py-2 max-w-[180px] truncate">
                    {item?.descricao || item?.cliente?.nome || item?.fornecedor?.nome || "—"}
                  </td>
                  <td className="py-2 text-muted-foreground text-xs">
                    {displayCat(item?.categorias?.[0]?.nome || "—")}
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {formatDate(item?.data_competencia || null)}
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {formatDate(item?.data_vencimento || null)}
                  </td>
                  <td className="py-2 text-right font-medium">
                    {formatCurrency(val(item))}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    Nenhum lançamento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
