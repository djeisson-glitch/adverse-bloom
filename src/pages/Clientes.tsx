import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useClients } from "@/hooks/useDeals";
import { useDeals } from "@/hooks/useDeals";
import { formatCurrency } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ClientAvatar } from "@/components/clientes/ClientAvatar";
import { NewClientModal } from "@/components/clientes/NewClientModal";
import { ImportClientsModal } from "@/components/clientes/ImportClientsModal";
import { Users, Plus, Search, Loader2, ExternalLink, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const SEGMENTS = ["Todos", "Tecnologia", "Saúde", "Educação", "Varejo", "Indústria", "Serviços", "Entretenimento", "Outro"];
const SEGMENTS_FORM = SEGMENTS.slice(1);

export default function Clientes() {
  const { clients, isLoading } = useClients();
  const { deals } = useDeals();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("Todos");
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [quick, setQuick] = useState({
    nome: "",
    segmento: "",
    contato_nome: "",
    contato_email: "",
    contato_telefone: "",
  });
  const [criando, setCriando] = useState(false);

  const enriched = useMemo(() => {
    return clients.map((c) => {
      const clientDeals = deals.filter((d) => d.client_id === c.id);
      const wonDeals = clientDeals.filter((d) => d.stage === "fechamento");
      const totalFaturado = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
      const lastDeal = clientDeals[0];
      return {
        ...c,
        totalFaturado,
        numProjetos: wonDeals.length,
        numOrcamentos: clientDeals.length,
        lastContact: lastDeal?.updated_at || c.created_at,
      };
    });
  }, [clients, deals]);

  const filtered = useMemo(() => {
    let result = enriched;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.company || "").toLowerCase().includes(q) ||
          ((c as any).trade_name || "").toLowerCase().includes(q),
      );
    }
    if (segment !== "Todos") {
      result = result.filter((c) => c.segment === segment);
    }
    return result.sort((a, b) => b.totalFaturado - a.totalFaturado);
  }, [enriched, search, segment]);

  const cadastroRapido = async () => {
    if (!quick.nome) {
      toast.error("Informe o nome do cliente");
      return;
    }
    setCriando(true);
    try {
      const { data, error } = await (supabase as any)
        .from("clients")
        .insert({
          name: quick.nome,
          segment: quick.segmento || null,
          contact_name: quick.contato_nome || null,
          email: quick.contato_email || null,
          phone: quick.contato_telefone || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Cliente criado");
      setQuick({ nome: "", segmento: "", contato_nome: "", contato_email: "", contato_telefone: "" });
      qc.invalidateQueries({ queryKey: ["clients"] });
      if (data?.id) navigate(`/clientes/${data.id}`);
    } catch (e: any) {
      toast.error("Erro ao criar", { description: e.message });
    } finally {
      setCriando(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground">{clients.length} clientes cadastrados</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Importar
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Cliente
          </Button>
        </div>
      </div>

      {/* Cadastro rápido inline */}
      <Card className="glass-card">
        <CardContent className="space-y-3 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Nome do cliente *"
              value={quick.nome}
              onChange={(e) => setQuick({ ...quick, nome: e.target.value })}
            />
            <Select value={quick.segmento} onValueChange={(v) => setQuick({ ...quick, segmento: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Segmento (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {SEGMENTS_FORM.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Contato (opcional)</p>
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Nome do contato"
              value={quick.contato_nome}
              onChange={(e) => setQuick({ ...quick, contato_nome: e.target.value })}
            />
            <Input
              placeholder="E-mail"
              type="email"
              value={quick.contato_email}
              onChange={(e) => setQuick({ ...quick, contato_email: e.target.value })}
            />
            <Input
              placeholder="Telefone"
              value={quick.contato_telefone}
              onChange={(e) => setQuick({ ...quick, contato_telefone: e.target.value })}
            />
            <Button
              onClick={cadastroRapido}
              disabled={criando}
              className="bg-primary text-primary-foreground"
            >
              <Plus className="mr-1 h-4 w-4" />
              {criando ? "Criando..." : "+ Cliente"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={segment} onValueChange={setSegment}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEGMENTS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela Catalunya-style */}
      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_150px_120px_100px_140px_40px] items-center gap-2 border-b border-border/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Cliente</span>
            <span className="text-right">Faturado</span>
            <span className="text-center">Projetos</span>
            <span className="text-center">Orçamentos</span>
            <span>Último contato</span>
            <span />
          </div>
          {filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              Nenhum cliente encontrado.
            </div>
          ) : (
            filtered.map((c) => (
              <div
                key={c.id}
                className="grid cursor-pointer grid-cols-[1fr_150px_120px_100px_140px_40px] items-center gap-2 border-b border-border/40 px-5 py-3 last:border-0 hover:bg-sidebar-accent/40"
                onClick={() => navigate(`/clientes/${c.id}`)}
              >
                <div className="flex items-center gap-3">
                  <ClientAvatar name={(c as any).trade_name || c.name} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{(c as any).trade_name || c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.segment || "—"}
                      {c.name !== ((c as any).trade_name || c.name) ? ` · ${c.name}` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-right font-medium text-primary">{formatCurrency(c.totalFaturado)}</span>
                <span className="text-center text-sm text-foreground">{c.numProjetos}</span>
                <span className="text-center text-sm text-foreground">{c.numOrcamentos}</span>
                <span className="text-xs text-muted-foreground">
                  {c.lastContact ? new Date(c.lastContact).toLocaleDateString("pt-BR") : "—"}
                </span>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <NewClientModal open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => navigate(`/clientes/${id}`)} />
      <ImportClientsModal open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
