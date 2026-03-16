import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/lib/format";
import { type CAItem, getCat } from "@/lib/financial";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  recItems: CAItem[];
  payItems: CAItem[];
}

function groupByRange(items: CAItem[], today: string) {
  const d7 = new Date(new Date(today).getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const d15 = new Date(new Date(today).getTime() + 15 * 86400000).toISOString().slice(0, 10);
  const d30 = new Date(new Date(today).getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const pending = items.filter(r => r?.data_vencimento && r.data_vencimento >= today && r.data_vencimento <= d30);
  return {
    "0-7 dias": pending.filter(r => r.data_vencimento! <= d7),
    "8-15 dias": pending.filter(r => r.data_vencimento! > d7 && r.data_vencimento! <= d15),
    "16-30 dias": pending.filter(r => r.data_vencimento! > d15 && r.data_vencimento! <= d30),
  };
}

function RangeGroup({ label, items, type }: { label: string; items: CAItem[]; type: "rec" | "pay" }) {
  const [open, setOpen] = useState(false);
  const total = items.reduce((s, r) => s + (r?.total ?? 0), 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">({items.length} itens)</span>
        </div>
        <span className="text-sm font-semibold">{formatCurrency(total)}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {items.length > 0 ? (
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2 font-medium text-xs">Vencimento</th>
                <th className="pb-2 font-medium text-xs">{type === "rec" ? "Cliente" : "Descrição"}</th>
                <th className="pb-2 font-medium text-xs text-right">Valor</th>
                <th className="pb-2 font-medium text-xs text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.sort((a, b) => (a.data_vencimento || "").localeCompare(b.data_vencimento || "")).map((item, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="py-1.5 text-xs">{formatDate(item.data_vencimento || null)}</td>
                  <td className="py-1.5 text-xs max-w-[180px] truncate">
                    {type === "rec" ? (item.cliente?.nome || "—") : (item.descricao || item.categorias?.[0]?.nome || "—")}
                  </td>
                  <td className="py-1.5 text-xs text-right">{formatCurrency(item.total ?? 0)}</td>
                  <td className="py-1.5 text-xs text-right">{item.status_traduzido || item.status || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-muted-foreground py-3 text-center">Nenhum item neste período.</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AccountsDetail({ recItems, payItems }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const recGroups = useMemo(() => {
    const filtered = recItems.filter(r => getCat(r) !== "Empréstimos de Bancos");
    return groupByRange(filtered, today);
  }, [recItems, today]);

  const payGroups = useMemo(() => groupByRange(payItems, today), [payItems, today]);

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="glass-card p-6">
      <h2 className="font-heading text-lg font-semibold mb-4">Detalhamento — Próximos 30 Dias</h2>
      <Tabs defaultValue="pagar">
        <TabsList className="mb-4">
          <TabsTrigger value="pagar">A Pagar</TabsTrigger>
          <TabsTrigger value="receber">A Receber</TabsTrigger>
        </TabsList>
        <TabsContent value="pagar" className="space-y-2">
          {Object.entries(payGroups).map(([label, items]) => (
            <RangeGroup key={label} label={label} items={items} type="pay" />
          ))}
        </TabsContent>
        <TabsContent value="receber" className="space-y-2">
          {Object.entries(recGroups).map(([label, items]) => (
            <RangeGroup key={label} label={label} items={items} type="rec" />
          ))}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
