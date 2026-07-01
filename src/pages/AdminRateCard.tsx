import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { ArrowLeft, Coins, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Row = {
  id: string;
  funcao: string;
  preco_hora: number;
  custo_hora: number;
  ativo: boolean;
  ordem: number;
};

export default function AdminRateCard() {
  const qc = useQueryClient();
  const [nova, setNova] = useState({ funcao: "", preco_hora: "", custo_hora: "" });

  const { data: rows = [] } = useQuery({
    queryKey: ["rate-card-all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("rate_card")
        .select("*")
        .order("ordem");
      if (error) throw error;
      return data as Row[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!nova.funcao) throw new Error("Informe a função");
      const { error } = await (supabase as any).from("rate_card").insert({
        funcao: nova.funcao,
        preco_hora: Number(nova.preco_hora || 0),
        custo_hora: Number(nova.custo_hora || 0),
        ordem: (rows.at(-1)?.ordem ?? 0) + 10,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNova({ funcao: "", preco_hora: "", custo_hora: "" });
      qc.invalidateQueries({ queryKey: ["rate-card-all"] });
      qc.invalidateQueries({ queryKey: ["rate-card"] });
      toast.success("Função adicionada");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const salvar = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await (supabase as any)
        .from("rate_card")
        .update({
          funcao: r.funcao,
          preco_hora: r.preco_hora,
          custo_hora: r.custo_hora,
          ativo: r.ativo,
        })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate-card-all"] });
      qc.invalidateQueries({ queryKey: ["rate-card"] });
      toast.success("Salvo");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("rate_card").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate-card-all"] });
      toast.success("Removido");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Link to="/admin" className="rounded-lg p-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Coins className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Rate card</h1>
          <p className="text-sm text-muted-foreground">
            Preço/hora por função (usado como sugestão em orçamentos) e custo/hora padrão (base do fechamento).
          </p>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="grid gap-3 p-6 md:grid-cols-[1fr_1fr_1fr_auto]">
          <Input
            placeholder="Função (ex.: Câmera)"
            value={nova.funcao}
            onChange={(e) => setNova({ ...nova, funcao: e.target.value })}
          />
          <Input
            type="number"
            placeholder="Preço/hora (R$)"
            value={nova.preco_hora}
            onChange={(e) => setNova({ ...nova, preco_hora: e.target.value })}
          />
          <Input
            type="number"
            placeholder="Custo/hora (R$)"
            value={nova.custo_hora}
            onChange={(e) => setNova({ ...nova, custo_hora: e.target.value })}
          />
          <Button
            onClick={() => criar.mutate()}
            disabled={criar.isPending}
            className="bg-primary text-primary-foreground"
          >
            <Plus className="mr-1 h-4 w-4" />
            Adicionar
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_140px_140px_100px_140px] items-center gap-2 border-b border-border/50 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Função</span>
            <span>Preço/hora</span>
            <span>Custo/hora</span>
            <span>Ativo</span>
            <span className="text-right">Ações</span>
          </div>
          {rows.map((r) => (
            <RateCardRow key={r.id} row={r} onSave={(p) => salvar.mutate({ ...r, ...p })} onDelete={() => excluir.mutate(r.id)} />
          ))}
          {rows.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhuma função cadastrada.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RateCardRow({
  row,
  onSave,
  onDelete,
}: {
  row: Row;
  onSave: (patch: Partial<Row>) => void;
  onDelete: () => void;
}) {
  const [funcao, setFuncao] = useState(row.funcao);
  const [preco, setPreco] = useState(row.preco_hora?.toString() || "0");
  const [custo, setCusto] = useState(row.custo_hora?.toString() || "0");
  const [ativo, setAtivo] = useState(row.ativo);

  const dirty =
    funcao !== row.funcao ||
    Number(preco) !== Number(row.preco_hora) ||
    Number(custo) !== Number(row.custo_hora) ||
    ativo !== row.ativo;

  return (
    <div className="grid grid-cols-[1fr_140px_140px_100px_140px] items-center gap-2 border-b border-border/40 px-5 py-2.5 last:border-0">
      <Input value={funcao} onChange={(e) => setFuncao(e.target.value)} className="h-8 text-sm" />
      <Input
        type="number"
        value={preco}
        onChange={(e) => setPreco(e.target.value)}
        className="h-8 text-sm"
      />
      <Input
        type="number"
        value={custo}
        onChange={(e) => setCusto(e.target.value)}
        className="h-8 text-sm"
      />
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={ativo}
          onChange={(e) => setAtivo(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        {ativo ? "sim" : "não"}
      </label>
      <div className="flex justify-end gap-1">
        {dirty && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSave({ funcao, preco_hora: Number(preco), custo_hora: Number(custo), ativo })}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            Salvar
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
