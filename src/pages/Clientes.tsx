import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useClients } from "@/hooks/useDeals";
import { useDeals } from "@/hooks/useDeals";
import { formatCurrency } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClientAvatar } from "@/components/clientes/ClientAvatar";
import { NewClientModal } from "@/components/clientes/NewClientModal";
import { ImportClientsModal } from "@/components/clientes/ImportClientsModal";
import { Plus, Search, Loader2, ExternalLink, Upload } from "lucide-react";

const SEGMENTS = ["Todos", "Tecnologia", "Saúde", "Educação", "Varejo", "Indústria", "Serviços", "Entretenimento", "Outro"];

export default function Clientes() {
  const { clients, isLoading } = useClients();
  const { deals } = useDeals();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("Todos");
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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
        c.name.toLowerCase().includes(q) || (c.company || "").toLowerCase().includes(q) || ((c as any).trade_name || "").toLowerCase().includes(q)
      );
    }
    if (segment !== "Todos") {
      result = result.filter((c) => c.segment === segment);
    }
    return result.sort((a, b) => b.totalFaturado - a.totalFaturado);
  }, [enriched, search, segment]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">{clients.length} clientes cadastrados</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Importar
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
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
      <ImportClientsModal open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
