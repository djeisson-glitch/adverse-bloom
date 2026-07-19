import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Clapperboard, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { IndicadorAutosave } from "@/components/autosave/AutosaveContext";

type Row = {
  id: string;
  name: string;
  document: string | null;
  type: string | null;
  funcoes: string[];
  cidade: string | null;
  email: string | null;
  telefone: string | null;
  observacoes: string | null;
  ativo: boolean;
};

export default function Fornecedores() {
  const qc = useQueryClient();
  const { isAdmin } = usePermissions();

  const [filtroFuncao, setFiltroFuncao] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [novo, setNovo] = useState({
    name: "",
    funcoes: "",
    cidade: "",
    email: "",
    telefone: "",
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["fornecedores"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("supplier_contacts")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Row[];
    },
  });

  const funcoesDisponiveis = useMemo(() => {
    const all = new Set<string>();
    rows.forEach((r) => r.funcoes?.forEach((f) => all.add(f)));
    return Array.from(all).sort();
  }, [rows]);

  const filtrados = useMemo(() => {
    if (!filtroFuncao) return rows;
    return rows.filter((r) => r.funcoes?.includes(filtroFuncao));
  }, [rows, filtroFuncao]);

  const criar = useMutation({
    mutationFn: async () => {
      if (!novo.name.trim()) throw new Error("Informe o nome");
      const funcoes = novo.funcoes
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      const { error } = await (supabase as any).from("supplier_contacts").insert({
        name: novo.name,
        funcoes,
        cidade: novo.cidade || null,
        email: novo.email || null,
        telefone: novo.telefone || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovo({ name: "", funcoes: "", cidade: "", email: "", telefone: "" });
      setOpenForm(false);
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
      toast.success("Fornecedor adicionado");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  // Salva só o campo mexido (o autosave da linha manda o patch, não a linha inteira).
  const salvar = async (id: string, patch: Partial<Row>) => {
    const { error } = await (supabase as any).from("supplier_contacts").update(patch).eq("id", id);
    if (error) {
      toast.error("Não salvou", { description: error.message });
      throw error;
    }
    qc.invalidateQueries({ queryKey: ["fornecedores"] });
  };

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("supplier_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
      toast.success("Removido");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Clapperboard className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Fornecedores / Equipe</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} cadastrados · diretório interno
          </p>
        </div>
      </div>

      {/* Filtros por função */}
      <div className="flex flex-wrap gap-2">
        <FiltroChip
          label="Todas"
          active={filtroFuncao === null}
          onClick={() => setFiltroFuncao(null)}
        />
        {funcoesDisponiveis.map((f) => (
          <FiltroChip
            key={f}
            label={f}
            active={filtroFuncao === f}
            onClick={() => setFiltroFuncao(f)}
          />
        ))}
      </div>

      {/* Novo fornecedor (collapsible) */}
      {isAdmin && (
        <Card className="glass-card">
          <CardContent className="p-4">
            <button
              className="flex w-full items-center gap-2 text-left"
              onClick={() => setOpenForm((v) => !v)}
            >
              {openForm ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Plus className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Novo fornecedor</span>
            </button>
            {openForm && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="Nome *"
                  value={novo.name}
                  onChange={(e) => setNovo({ ...novo, name: e.target.value })}
                />
                <Input
                  placeholder="Funções (separadas por vírgula) ex: Câmera, Direção"
                  value={novo.funcoes}
                  onChange={(e) => setNovo({ ...novo, funcoes: e.target.value })}
                />
                <Input
                  placeholder="Cidade"
                  value={novo.cidade}
                  onChange={(e) => setNovo({ ...novo, cidade: e.target.value })}
                />
                <Input
                  placeholder="E-mail"
                  type="email"
                  value={novo.email}
                  onChange={(e) => setNovo({ ...novo, email: e.target.value })}
                />
                <Input
                  placeholder="Telefone"
                  value={novo.telefone}
                  onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
                />
                <Button
                  onClick={() => criar.mutate()}
                  disabled={criar.isPending}
                  className="bg-primary text-primary-foreground"
                >
                  Adicionar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabela */}
      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="grid grid-cols-[1.5fr_2fr_1fr_1.5fr_60px] items-center gap-2 border-b border-border/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Nome</span>
            <span>Funções</span>
            <span>Cidade</span>
            <span>Contato</span>
            <span />
          </div>
          {filtrados.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              Nenhum fornecedor com esse filtro.
            </div>
          ) : (
            filtrados.map((r) => (
              <FornecedorRow
                key={r.id}
                row={r}
                editable={isAdmin}
                onSave={(patch) => salvar(r.id, patch)}
                onDelete={() => excluir.mutate(r.id)}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FiltroChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary/40 bg-primary text-primary-foreground"
          : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function FornecedorRow({
  row,
  editable,
  onSave,
  onDelete,
}: {
  row: Row;
  editable: boolean;
  onSave: (patch: Partial<Row>) => Promise<unknown>;
  onDelete: () => void;
}) {
  const [expand, setExpand] = useState(false);
  const [nome, setNome] = useState(row.name);
  const [funcoes, setFuncoes] = useState((row.funcoes || []).join(", "));
  const [cidade, setCidade] = useState(row.cidade || "");
  const [email, setEmail] = useState(row.email || "");
  const [telefone, setTelefone] = useState(row.telefone || "");

  // Salva ao digitar: manda só o campo mexido, ~0,8s depois da última tecla.
  const auto = useFormAutosave<Partial<Row>>((patch) => onSave(patch));

  return (
    <div className="border-b border-border/40 last:border-0">
      <div
        className="grid cursor-pointer grid-cols-[1.5fr_2fr_1fr_1.5fr_60px] items-center gap-2 px-5 py-3 hover:bg-sidebar-accent/40"
        onClick={() => setExpand((v) => !v)}
      >
        <span className="font-medium text-foreground">{row.name}</span>
        <div className="flex flex-wrap gap-1">
          {(row.funcoes || []).map((f) => (
            <span key={f} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              {f}
            </span>
          ))}
          {(!row.funcoes || row.funcoes.length === 0) && <span className="text-xs text-muted-foreground">—</span>}
        </div>
        <span className="text-xs text-muted-foreground">{row.cidade || "—"}</span>
        <span className="truncate text-xs text-muted-foreground">
          {row.email || row.telefone || "—"}
        </span>
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform ${expand ? "rotate-90" : ""}`}
        />
      </div>
      {expand && editable && (
        <div className="grid gap-3 border-t border-border/40 bg-muted/20 px-5 py-4 md:grid-cols-2">
          <Input
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              auto.agendar({ name: e.target.value });
            }}
            placeholder="Nome"
          />
          <Input
            value={funcoes}
            onChange={(e) => {
              setFuncoes(e.target.value);
              // Na tela é texto com vírgula; no banco é array.
              auto.agendar({ funcoes: e.target.value.split(",").map((f) => f.trim()).filter(Boolean) });
            }}
            placeholder="Funções (vírgula)"
          />
          <Input
            value={cidade}
            onChange={(e) => {
              setCidade(e.target.value);
              auto.agendar({ cidade: e.target.value || null });
            }}
            placeholder="Cidade"
          />
          <Input
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              auto.agendar({ email: e.target.value || null });
            }}
            placeholder="E-mail"
          />
          <Input
            value={telefone}
            onChange={(e) => {
              setTelefone(e.target.value);
              auto.agendar({ telefone: e.target.value || null });
            }}
            placeholder="Telefone"
          />
          <div className="flex items-center justify-end gap-2">
            <IndicadorAutosave status={auto.status} />
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
      )}
    </div>
  );
}
