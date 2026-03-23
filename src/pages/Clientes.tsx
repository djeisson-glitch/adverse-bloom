import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useClients } from "@/hooks/useDeals";
import { useDeals } from "@/hooks/useDeals";
import { useContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClientAvatar } from "@/components/clientes/ClientAvatar";
import { NewClientModal } from "@/components/clientes/NewClientModal";
import { Plus, Search, Loader2, ExternalLink, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const SEGMENTS = ["Todos", "Tecnologia", "Saúde", "Educação", "Varejo", "Indústria", "Serviços", "Entretenimento", "Outro"];

export default function Clientes() {
  const { clients, isLoading } = useClients();
  const { deals } = useDeals();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("Todos");
  const [newOpen, setNewOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data: receivablesCache } = useContaAzulCache("receivables");
  const { data: payablesCache } = useContaAzulCache("payables");
  const { data: salesCache } = useContaAzulCache("sales");
  const { data: transactionsCache } = useContaAzulCache("transactions");

  const enriched = useMemo(() => {
    return clients.map((c) => {
      const clientDeals = deals.filter((d) => d.client_id === c.id);
      const wonDeals = clientDeals.filter((d) => d.stage === "ganho");
      const totalFaturado = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
      const lastDeal = clientDeals[0];
      return {
        ...c,
        totalFaturado,
        numProjetos: wonDeals.length,
        lastContact: lastDeal?.updated_at || c.created_at,
      };
    });
  }, [clients, deals]);

  const filtered = useMemo(() => {
    let result = enriched;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) || (c.company || "").toLowerCase().includes(q)
      );
    }
    if (segment !== "Todos") {
      result = result.filter((c) => c.segment === segment);
    }
    return result.sort((a, b) => b.totalFaturado - a.totalFaturado);
  }, [enriched, search, segment]);

  const handleImportContaAzul = async () => {
    setImporting(true);
    try {
      // Helper to extract name strings from an item checking all possible fields
      const extractName = (item: any): string | null => {
        if (!item) return null;
        // Check nested objects: cliente.nome, fornecedor.nome, customer.name, destinatario.nome
        const nested = [
          item?.cliente?.nome,
          item?.cliente?.razao_social,
          item?.cliente?.name,
          item?.fornecedor?.nome,
          item?.fornecedor?.razao_social,
          item?.fornecedor?.name,
          item?.customer?.nome,
          item?.customer?.name,
          item?.customer?.razao_social,
          item?.destinatario?.nome,
          item?.destinatario?.razao_social,
          item?.destinatario?.name,
        ];
        for (const v of nested) {
          if (v && typeof v === "string" && v.trim()) return v.trim();
        }
        // Check top-level fields
        const topLevel = [item.razao_social, item.nome, item.name, item.cliente_nome, item.customer_name];
        for (const v of topLevel) {
          if (v && typeof v === "string" && v.trim()) return v.trim();
        }
        return null;
      };

      // Collect names by source for reporting
      const sourceNames: Record<string, Set<string>> = {
        receivables: new Set(),
        payables: new Set(),
        sales: new Set(),
        transactions: new Set(),
      };

      const allCaches = [
        { key: "receivables", data: receivablesCache },
        { key: "payables", data: payablesCache },
        { key: "sales", data: salesCache },
        { key: "transactions", data: transactionsCache },
      ];

      for (const { key, data } of allCaches) {
        const items = extractItems<any>(data?.payload);
        for (const item of items) {
          const name = extractName(item);
          if (name) sourceNames[key].add(name);
        }
      }

      // Merge all unique names (case-insensitive dedup)
      const uniqueMap = new Map<string, string>(); // lowercase -> original
      for (const names of Object.values(sourceNames)) {
        for (const name of names) {
          const lower = name.toLowerCase();
          if (!uniqueMap.has(lower)) uniqueMap.set(lower, name);
        }
      }

      // Check which already exist
      const existingNames = new Set(clients.map((c) => c.name.toLowerCase()));
      const existingCompanies = new Set(clients.filter((c) => c.company).map((c) => c.company!.toLowerCase()));

      const toInsert: { name: string; company: string | null; origin: string }[] = [];
      let alreadyExisted = 0;

      uniqueMap.forEach((name, lower) => {
        if (existingNames.has(lower) || existingCompanies.has(lower)) {
          alreadyExisted++;
        } else {
          toInsert.push({ name, company: name, origin: "Conta Azul" });
        }
      });

      if (toInsert.length > 0) {
        const { error } = await supabase.from("clients").insert(toInsert);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["clients"] });
      }

      const sourceSummary = Object.entries(sourceNames)
        .filter(([, s]) => s.size > 0)
        .map(([k, s]) => `${k}: ${s.size}`)
        .join(", ");

      toast({
        title: "Importação concluída",
        description: `${toInsert.length} importados, ${alreadyExisted} já existiam. Total únicos: ${uniqueMap.size} (${sourceSummary})`,
      });
    } catch (err) {
      toast({ title: "Erro ao importar clientes", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">{clients.length} clientes cadastrados</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleImportContaAzul} disabled={importing}>
            <Download className="mr-2 h-4 w-4" />
            {importing ? "Importando..." : "Importar do Conta Azul"}
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo Cliente
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
            {SEGMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Segmento</TableHead>
              <TableHead className="text-right">Total Faturado</TableHead>
              <TableHead className="text-right">Projetos</TableHead>
              <TableHead>Último Contato</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-secondary/30"
                  onClick={() => navigate(`/clientes/${c.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <ClientAvatar name={c.name} />
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.company || "—"}</TableCell>
                  <TableCell>
                    {c.segment ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{c.segment}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-heading font-semibold text-primary">
                    {formatCurrency(c.totalFaturado)}
                  </TableCell>
                  <TableCell className="text-right">{c.numProjetos}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {c.lastContact ? new Date(c.lastContact).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <NewClientModal open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => navigate(`/clientes/${id}`)} />
    </div>
  );
}
