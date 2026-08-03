import { useState } from "react";
import { useVoltar } from "@/hooks/useVoltar";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Repeat, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { useContratos } from "@/hooks/useContratos";

export default function ConfiguracoesContratos() {
  const navigate = useNavigate();
  const voltar = useVoltar("/configuracoes");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: contratos } = useContratos();
  const [cliente, setCliente] = useState("");
  const [valor, setValor] = useState("");

  const mrr = (contratos ?? []).filter((c) => c.ativo).reduce((s, c) => s + (c.valor_mensal || 0), 0);

  const refresh = () => qc.invalidateQueries({ queryKey: ["contratos_recorrentes"] });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("contratos_recorrentes").insert({ cliente: cliente.trim(), valor_mensal: Number(valor) || 0 });
      if (error) throw error;
    },
    onSuccess: () => { setCliente(""); setValor(""); refresh(); toast({ title: "Contrato adicionado" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggle = useMutation({
    mutationFn: async (v: { id: string; ativo: boolean }) => {
      const { error } = await (supabase as any).from("contratos_recorrentes").update({ ativo: v.ativo }).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("contratos_recorrentes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast({ title: "Contrato removido" }); },
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={voltar}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="font-heading text-2xl font-bold flex items-center gap-2"><Repeat className="h-5 w-5 text-primary" /> Contratos recorrentes (MRR)</h1>
          <p className="text-sm text-muted-foreground">Cadastre o valor mensal de cada contrato fixo. O MRR é a soma dos ativos.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>MRR atual</span>
            <span className="text-primary">{formatCurrency(mrr)}/mês</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-2 flex-1 min-w-[180px]">
            <Label>Cliente / contrato</Label>
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ex.: Sicredi Sul Minas" />
          </div>
          <div className="space-y-2 w-36">
            <Label>Valor mensal (R$)</Label>
            <Input type="number" value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <Button onClick={() => add.mutate()} disabled={!cliente.trim() || add.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Contratos</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(contratos ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum contrato cadastrado ainda.</p>
          ) : (
            (contratos ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Switch checked={c.ativo} onCheckedChange={(v) => toggle.mutate({ id: c.id, ativo: v })} />
                  <span className={`truncate ${c.ativo ? "" : "text-muted-foreground line-through"}`}>{c.cliente}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-semibold text-primary">{formatCurrency(c.valor_mensal)}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
