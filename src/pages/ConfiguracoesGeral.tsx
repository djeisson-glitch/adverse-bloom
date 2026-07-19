import { motion } from "framer-motion";
import { ArrowLeft, Upload, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { IndicadorAutosave } from "@/components/autosave/AutosaveContext";
import { useState } from "react";

const timezones = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Belem", label: "Belém (GMT-3)" },
  { value: "America/Fortaleza", label: "Fortaleza (GMT-3)" },
  { value: "America/Recife", label: "Recife (GMT-3)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
];

export default function ConfiguracoesGeral() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Nome e fuso moram na linha única de contexto da empresa (id = 1).
  const { data: contexto, isLoading } = useQuery({
    queryKey: ["empresa_contexto"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("empresa_contexto")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [form, setForm] = useState<{ nome_empresa: string; timezone: string } | null>(null);
  // Hidrata uma vez: a tela atualiza sozinha em segundo plano e não pode
  // apagar o que está sendo digitado.
  if (contexto !== undefined && form === null) {
    setForm({
      nome_empresa: contexto?.nome_empresa || "",
      timezone: contexto?.timezone || "America/Sao_Paulo",
    });
  }

  const auto = useFormAutosave<Record<string, unknown>>(async (patch) => {
    const { error } = await (supabase as any)
      .from("empresa_contexto")
      .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() });
    if (error) {
      toast.error("Não salvou", { description: error.message });
      throw error;
    }
    qc.invalidateQueries({ queryKey: ["empresa_contexto"] });
  });

  const set = (campo: string, valor: string) => {
    setForm((f) => (f ? { ...f, [campo]: valor } : f));
    auto.agendar({ [campo]: valor });
  };

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Geral</h1>
          <p className="text-sm text-muted-foreground">Informações básicas da empresa</p>
        </div>
        <div className="ml-auto">
          <IndicadorAutosave status={auto.status} />
        </div>
      </motion.div>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Empresa</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nome da empresa</Label>
            <Input
              value={form.nome_empresa}
              onChange={(e) => set("nome_empresa", e.target.value)}
              placeholder="Adverse"
            />
          </div>
          <div>
            <Label>Logo</Label>
            <div className="mt-1 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 border border-border">
                <span className="text-xl font-bold text-primary">A</span>
              </div>
              {/* Sem upload ainda: o botão existia mas não fazia nada. Desabilitado
                  até ter storage pra logo, pra não prometer o que não entrega. */}
              <Button variant="outline" size="sm" disabled title="Ainda não dá pra trocar a logo por aqui">
                <Upload className="h-4 w-4 mr-2" />
                Alterar logo
              </Button>
            </div>
          </div>
          <div>
            <Label>Fuso horário</Label>
            <Select value={form.timezone} onValueChange={(v) => set("timezone", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {timezones.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
