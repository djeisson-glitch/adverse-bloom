import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, ChevronRight, ChevronDown, Plus, Trash2, Loader2, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

type Cat = { id: string; codigo: string; nome: string; ordem: number };
type Tpl = { id: string; categoria_codigo: string; descricao: string; ordem: number; valor_unitario: number; no_medio: boolean };

export default function CatalogoItens() {
  const qc = useQueryClient();
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  const { data: cats = [] } = useQuery({
    queryKey: ["catalogo-cats"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("budget_categorias").select("*").order("ordem");
      if (error) throw error;
      return data as Cat[];
    },
  });
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["catalogo-templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("budget_item_templates")
        .select("*")
        .order("categoria_codigo")
        .order("ordem");
      if (error) throw error;
      return data as Tpl[];
    },
  });

  const porCat = useMemo(() => {
    const m = new Map<string, Tpl[]>();
    templates.forEach((t) => m.set(t.categoria_codigo, [...(m.get(t.categoria_codigo) || []), t]));
    return m;
  }, [templates]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["catalogo-templates"] });

  const adicionar = useMutation({
    mutationFn: async (codigo: string) => {
      const n = (porCat.get(codigo) || []).length;
      const { error } = await (supabase as any).from("budget_item_templates").insert({
        categoria_codigo: codigo, descricao: "Novo item", ordem: n + 1, valor_unitario: 0, no_medio: false,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const toggle = (codigo: string) => setAbertas((s) => { const n = new Set(s); n.has(codigo) ? n.delete(codigo) : n.add(codigo); return n; });

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <div className="flex items-center gap-3">
        <Package className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Catálogo de itens</h1>
          <p className="text-sm text-muted-foreground">Valor unitário padrão de cada item e o que entra no orçamento "médio".</p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span>
          O <strong>valor unitário</strong> já vem preenchido no orçamento novo (com quantidade 0 — você só coloca as quantidades).
          Marque <strong>"no médio"</strong> nos itens que devem aparecer no orçamento de porte <strong>médio</strong>; o <strong>grande</strong> traz tudo.
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-2">
          {cats.map((c) => {
            const itens = porCat.get(c.codigo) || [];
            const aberta = abertas.has(c.codigo);
            const nMedio = itens.filter((t) => t.no_medio).length;
            return (
              <div key={c.id} className="rounded-lg border border-border/50">
                <button onClick={() => toggle(c.codigo)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
                  {aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-mono text-[10px] text-muted-foreground">{c.codigo}</span>
                  <span className="text-sm font-medium text-foreground">{c.nome}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{itens.length} itens · {nMedio} no médio</span>
                </button>
                {aberta && (
                  <div className="border-t border-border/40">
                    <div className="grid grid-cols-[1fr_130px_70px_36px] gap-2 border-b border-border/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <span>Descrição</span><span>Valor unitário</span><span className="text-center">No médio</span><span />
                    </div>
                    {itens.map((t) => <ItemRow key={t.id} tpl={t} onChanged={invalidate} />)}
                    <div className="px-4 py-2">
                      <Button size="sm" variant="ghost" onClick={() => adicionar.mutate(c.codigo)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar item
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ItemRow({ tpl, onChanged }: { tpl: Tpl; onChanged: () => void }) {
  const [desc, setDesc] = useState(tpl.descricao);
  const [valor, setValor] = useState(String(tpl.valor_unitario ?? 0));
  const [noMedio, setNoMedio] = useState(tpl.no_medio);

  const salvar = (patch: any) =>
    (supabase as any).from("budget_item_templates").update(patch).eq("id", tpl.id).then(({ error }: any) => {
      if (error) toast.error("Não salvou", { description: error.message });
      else onChanged();
    });

  const excluir = () =>
    (supabase as any).from("budget_item_templates").delete().eq("id", tpl.id).then(({ error }: any) => {
      if (error) toast.error("Erro", { description: error.message });
      else onChanged();
    });

  return (
    <div className="grid grid-cols-[1fr_130px_70px_36px] items-center gap-2 border-b border-border/30 px-4 py-1.5 last:border-0">
      <Input value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== tpl.descricao && salvar({ descricao: desc })} className="h-7 text-xs" />
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground">R$</span>
        <Input type="number" value={valor} onChange={(e) => setValor(e.target.value)} onBlur={() => Number(valor) !== Number(tpl.valor_unitario) && salvar({ valor_unitario: Number(valor) || 0 })} className="h-7 text-xs" />
      </div>
      <div className="flex justify-center">
        <input type="checkbox" checked={noMedio} onChange={(e) => { setNoMedio(e.target.checked); salvar({ no_medio: e.target.checked }); }} className="h-3.5 w-3.5 accent-primary" />
      </div>
      <button onClick={excluir} className="justify-self-end text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}
