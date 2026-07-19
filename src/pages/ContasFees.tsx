import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Building2, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { IndicadorAutosave } from "@/components/autosave/AutosaveContext";

type Client = { id: string; name: string };

type Conta = {
  id: string;
  client_id: string;
  nome: string;
  tipo: string;
  moeda: string;
  balde_mensal: number | null;
  ativo: boolean;
};

type ProjetoLite = { id: string; name: string; conta_fee_id: string | null };

const TIPOS = [
  { value: "fee_mensal", label: "Fee mensal" },
  { value: "retainer", label: "Retainer" },
  { value: "credito", label: "Crédito" },
];

const MOEDAS = [
  { value: "BRL", label: "BRL" },
  { value: "USD", label: "USD" },
];

export default function ContasFees() {
  const qc = useQueryClient();
  const { isAdmin, canSeeMoney } = usePermissions();

  const [nova, setNova] = useState({
    client_id: "",
    nome: "",
    tipo: "fee_mensal",
    moeda: "BRL",
    balde: "",
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clientes-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: contas = [] } = useQuery({
    queryKey: ["contas-fees"],
    enabled: canSeeMoney,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contas_fees")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Conta[];
    },
  });

  const { data: projetos = [] } = useQuery({
    queryKey: ["projetos-por-conta"],
    enabled: canSeeMoney,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("projects")
        .select("id, name, conta_fee_id");
      if (error) throw error;
      return data as ProjetoLite[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!nova.client_id || !nova.nome) throw new Error("Cliente e nome são obrigatórios");
      const { error } = await (supabase as any).from("contas_fees").insert({
        client_id: nova.client_id,
        nome: nova.nome,
        tipo: nova.tipo,
        moeda: nova.moeda,
        balde_mensal: nova.balde ? Number(nova.balde) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNova({ client_id: "", nome: "", tipo: "fee_mensal", moeda: "BRL", balde: "" });
      qc.invalidateQueries({ queryKey: ["contas-fees"] });
      toast.success("Conta criada");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  // Salva só o campo mexido (o autosave da linha manda o patch, não a conta inteira).
  const salvar = async (id: string, patch: Partial<Conta>) => {
    const { error } = await (supabase as any).from("contas_fees").update(patch).eq("id", id);
    if (error) {
      toast.error("Não salvou", { description: error.message });
      throw error;
    }
    qc.invalidateQueries({ queryKey: ["contas-fees"] });
  };

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("contas_fees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contas-fees"] });
      toast.success("Conta removida");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || "—";
  const projetosDaConta = (contaId: string) => projetos.filter((p) => p.conta_fee_id === contaId);

  if (!canSeeMoney) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center text-sm text-muted-foreground">
        Só admin e produtor têm acesso às contas / fees.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Contas / Fees</h1>
          <p className="text-sm text-muted-foreground">
            Contas guarda-chuva (fees recorrentes) que agregam vários projetos.
          </p>
        </div>
      </div>

      {/* Nova conta */}
      {isAdmin && (
        <Card className="glass-card">
          <CardContent className="grid gap-3 p-5 md:grid-cols-[1.2fr_1.4fr_1fr_100px_140px]">
            <Select value={nova.client_id} onValueChange={(v) => setNova({ ...nova, client_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="— cliente —" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Nome da conta"
              value={nova.nome}
              onChange={(e) => setNova({ ...nova, nome: e.target.value })}
            />
            <Select value={nova.tipo} onValueChange={(v) => setNova({ ...nova, tipo: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={nova.moeda} onValueChange={(v) => setNova({ ...nova, moeda: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOEDAS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => criar.mutate()}
              disabled={criar.isPending}
              className="bg-primary text-primary-foreground"
            >
              Criar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabela */}
      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="grid grid-cols-[1.4fr_1.2fr_100px_140px_120px_60px] items-center gap-2 border-b border-border/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Conta</span>
            <span>Tipo</span>
            <span>Balde (mês)</span>
            <span>Projetos</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          {contas.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhuma conta ainda.</div>
          ) : (
            contas.map((c) => (
              <ContaRow
                key={c.id}
                conta={c}
                clienteNome={clientName(c.client_id)}
                projetos={projetosDaConta(c.id)}
                editable={isAdmin}
                onSave={(patch) => salvar(c.id, patch)}
                onDelete={() => excluir.mutate(c.id)}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ContaRow({
  conta,
  clienteNome,
  projetos,
  editable,
  onSave,
  onDelete,
}: {
  conta: Conta;
  clienteNome: string;
  projetos: ProjetoLite[];
  editable: boolean;
  onSave: (patch: Partial<Conta>) => Promise<unknown>;
  onDelete: () => void;
}) {
  const [expand, setExpand] = useState(false);
  const [nome, setNome] = useState(conta.nome);
  const [tipo, setTipo] = useState(conta.tipo);
  const [moeda, setMoeda] = useState(conta.moeda);
  const [balde, setBalde] = useState<string>(conta.balde_mensal?.toString() || "");
  const [ativo, setAtivo] = useState(conta.ativo);

  // Salva ao digitar: manda só o campo mexido, ~0,8s depois da última tecla.
  const auto = useFormAutosave<Partial<Conta>>((patch) => onSave(patch));
  // Escolha em select/checkbox não é digitação: não tem o que esperar.
  const autoEscolha = useFormAutosave<Partial<Conta>>((patch) => onSave(patch), { delay: 150 });
  const status = auto.status !== "ocioso" ? auto.status : autoEscolha.status;

  return (
    <div className="border-b border-border/40 last:border-0">
      <div
        className="grid cursor-pointer grid-cols-[1.4fr_1.2fr_100px_140px_120px_60px] items-center gap-2 px-5 py-3 hover:bg-sidebar-accent/40"
        onClick={() => setExpand((v) => !v)}
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{conta.nome}</p>
          <p className="truncate text-xs text-muted-foreground">{clienteNome}</p>
        </div>
        <span className="text-xs text-muted-foreground">
          {TIPOS.find((t) => t.value === conta.tipo)?.label || conta.tipo} · {conta.moeda}
        </span>
        <span className="text-xs text-foreground">
          {conta.balde_mensal != null ? formatCurrency(conta.balde_mensal) : "—"}
        </span>
        <span className="text-xs text-foreground">{projetos.length}</span>
        <span className="text-right text-xs font-medium text-primary">
          {conta.balde_mensal != null ? formatCurrency(conta.balde_mensal) : "—"}
        </span>
        <span className="text-xs text-muted-foreground">{expand ? "−" : "+"}</span>
      </div>
      {expand && (
        <div className="border-t border-border/40 bg-muted/20 px-5 py-4">
          {editable ? (
            <div className="grid gap-3 md:grid-cols-5">
              <Input
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  auto.agendar({ nome: e.target.value });
                }}
                placeholder="Nome"
              />
              <Select
                value={tipo}
                onValueChange={(v) => {
                  setTipo(v);
                  autoEscolha.agendar({ tipo: v });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={moeda}
                onValueChange={(v) => {
                  setMoeda(v);
                  autoEscolha.agendar({ moeda: v });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOEDAS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                value={balde}
                onChange={(e) => {
                  setBalde(e.target.value);
                  // Balde vazio é "sem teto", não zero.
                  auto.agendar({ balde_mensal: e.target.value ? Number(e.target.value) : null });
                }}
                placeholder="Balde/mês"
              />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={ativo}
                    onChange={(e) => {
                      setAtivo(e.target.checked);
                      autoEscolha.agendar({ ativo: e.target.checked });
                    }}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className={ativo ? "text-success" : "text-muted-foreground"}>
                    {ativo ? "ativo" : "inativo"}
                  </span>
                </label>
              </div>
              <div className="md:col-span-5 flex items-center justify-end gap-2">
                <IndicadorAutosave status={status} />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remover
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Sem permissão de edição. Só admin pode editar contas.
            </p>
          )}

          {projetos.length > 0 && (
            <div className="mt-4 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Projetos vinculados
              </p>
              <ul className="space-y-1 text-sm">
                {projetos.map((p) => (
                  <li key={p.id} className="text-foreground">
                    · {p.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
