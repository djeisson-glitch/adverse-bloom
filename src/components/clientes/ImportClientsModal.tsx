import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, FileSpreadsheet, AlertCircle } from "lucide-react";

interface ParsedClient {
  name: string;
  company: string | null;
  trade_name: string | null;
  email: string | null;
  phone: string | null;
  document: string | null;
  selected: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Map common Conta Azul CSV column names to our fields
const COL_MAP: Record<string, keyof Omit<ParsedClient, "selected">> = {
  nome: "name",
  "razão social": "name",
  "razao social": "name",
  "nome fantasia": "trade_name",
  "nome_fantasia": "trade_name",
  empresa: "company",
  email: "email",
  "e-mail": "email",
  telefone: "phone",
  celular: "phone",
  fone: "phone",
  "cnpj/cpf": "document",
  cnpj: "document",
  cpf: "document",
  documento: "document",
};

function detectDelimiter(line: string): string {
  const semi = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  const tab = (line.match(/\t/g) || []).length;
  if (semi >= comma && semi >= tab) return ";";
  if (tab >= comma) return "\t";
  return ",";
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function ImportClientsModal({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [parsed, setParsed] = useState<ParsedClient[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const reset = () => { setStep("upload"); setParsed([]); setError(null); };

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    try {
      let text: string;

      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        // For XLSX, use a simple approach: read as array buffer and parse
        // We'll use a basic CSV-like approach by reading the file as text
        // For proper XLSX support, we parse the XML inside
        toast({ title: "Processando arquivo Excel..." });
        
        // Read as text (works for CSV saved as xlsx in some cases)
        // For real XLSX, we need to handle the binary format
        const arrayBuffer = await file.arrayBuffer();
        const decoder = new TextDecoder("utf-8");
        text = decoder.decode(arrayBuffer);
        
        // If it's a real XLSX (starts with PK), we can't parse it client-side without a library
        if (text.startsWith("PK")) {
          setError("Arquivos .xlsx precisam ser salvos como .csv antes de importar. No Excel, use Salvar Como → CSV (separado por ponto e vírgula).");
          return;
        }
      } else {
        text = await file.text();
      }

      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { setError("Arquivo vazio ou sem dados."); return; }

      const delimiter = detectDelimiter(lines[0]);
      const headers = parseCSVLine(lines[0], delimiter).map((h) => h.toLowerCase().replace(/"/g, ""));

      // Map columns
      const mapping: Record<number, keyof Omit<ParsedClient, "selected">> = {};
      headers.forEach((h, i) => {
        const key = COL_MAP[h];
        if (key) mapping[i] = key;
      });

      if (!Object.values(mapping).includes("name")) {
        setError(`Coluna de nome não encontrada. Colunas detectadas: ${headers.join(", ")}`);
        return;
      }

      const records: ParsedClient[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i], delimiter);
        const rec: ParsedClient = { name: "", company: null, email: null, phone: null, document: null, selected: true };
        for (const [idx, field] of Object.entries(mapping)) {
          const val = cols[Number(idx)]?.replace(/"/g, "").trim() || null;
          if (val) (rec as any)[field] = val;
        }
        if (rec.name) records.push(rec);
      }

      if (records.length === 0) { setError("Nenhum registro válido encontrado."); return; }

      setParsed(records);
      setStep("preview");
    } catch (e) {
      setError("Erro ao processar arquivo: " + String(e));
    }
  }, [toast]);

  const toggleAll = (checked: boolean) => {
    setParsed((prev) => prev.map((r) => ({ ...r, selected: checked })));
  };

  const toggleOne = (idx: number) => {
    setParsed((prev) => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };

  const handleImport = async () => {
    const selected = parsed.filter((r) => r.selected);
    if (selected.length === 0) { toast({ title: "Nenhum registro selecionado" }); return; }

    setImporting(true);
    try {
      // Check existing
      const { data: existing } = await supabase.from("clients").select("name").eq("type", "cliente");
      const existingNames = new Set((existing || []).map((c) => c.name.toLowerCase()));

      const toInsert = selected
        .filter((r) => !existingNames.has(r.name.toLowerCase()))
        .map((r) => ({
          name: r.name,
          company: r.company,
          email: r.email,
          phone: r.phone,
          origin: "Importação CSV",
          type: "cliente" as const,
        }));

      const alreadyExisted = selected.length - toInsert.length;

      if (toInsert.length > 0) {
        // Insert in batches of 50
        for (let i = 0; i < toInsert.length; i += 50) {
          const batch = toInsert.slice(i, i + 50);
          const { error } = await supabase.from("clients").insert(batch);
          if (error) throw error;
        }
        qc.invalidateQueries({ queryKey: ["clients"] });
      }

      toast({
        title: "Importação concluída!",
        description: `${toInsert.length} novos clientes importados${alreadyExisted > 0 ? ` · ${alreadyExisted} já existiam` : ""}`,
      });
      onOpenChange(false);
      reset();
    } catch (e) {
      toast({ title: "Erro ao importar", description: String(e), variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const selectedCount = parsed.filter((r) => r.selected).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Clientes
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex-1 flex flex-col items-center justify-center py-10 gap-4">
            <div className="border-2 border-dashed border-border rounded-xl p-10 text-center w-full">
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Arraste um arquivo .csv ou clique para selecionar
              </p>
              <input
                type="file"
                accept=".csv,.txt"
                className="hidden"
                id="import-file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" onClick={() => document.getElementById("import-file")?.click()}>
                Selecionar Arquivo
              </Button>
            </div>
            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg w-full">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Formatos aceitos: CSV (separado por vírgula, ponto-e-vírgula ou tab). 
              Exportado do Conta Azul ou similar.
            </p>
          </div>
        )}

        {step === "preview" && (
          <>
            <div className="text-sm text-muted-foreground mb-2">
              {parsed.length} registros encontrados · {selectedCount} selecionados para importar
            </div>
            <div className="flex-1 overflow-auto border border-border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedCount === parsed.length}
                        onCheckedChange={(c) => toggleAll(!!c)}
                      />
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Documento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.map((r, i) => (
                    <TableRow key={i} className={r.selected ? "" : "opacity-40"}>
                      <TableCell>
                        <Checkbox checked={r.selected} onCheckedChange={() => toggleOne(i)} />
                      </TableCell>
                      <TableCell className="font-medium text-sm">{r.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.company || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.email || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.phone || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.document || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter className="flex items-center justify-between gap-2 pt-3">
              <Button variant="outline" onClick={reset}>Voltar</Button>
              <Button onClick={handleImport} disabled={importing || selectedCount === 0}>
                {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Importar {selectedCount} clientes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
