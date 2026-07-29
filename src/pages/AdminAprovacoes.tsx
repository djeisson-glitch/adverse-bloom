import { useState } from "react";
import { primeiroNome } from "@/lib/pessoa";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { IndicadorAutosave } from "@/components/autosave/AutosaveContext";
import { toast } from "sonner";

/**
 * Onda 6D — settings globais de aprovação de entregável.
 * N1 e N2 padrão + se o cliente aprova por padrão. Cada projeto pode
 * sobrescrever esses valores na própria ficha (aba Briefing).
 */
export default function AdminAprovacoes() {
  const qc = useQueryClient();

  const { data: profiles = [] } = useQuery({
    queryKey: ["aprov-profiles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email")
        .neq("ativo", false)
        .order("full_name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["approval-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("approval_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [form, setForm] = useState<any>(null);
  if (settings && (!form || !form.__loaded)) {
    setForm({
      __loaded: true,
      nivel1_user_id: settings.nivel1_user_id || "",
      nivel2_user_id: settings.nivel2_user_id || "",
      envio_cliente_user_id: settings.envio_cliente_user_id || "",
      cliente_aprova: settings.cliente_aprova ?? true,
    });
  }

  // Aqui só tem escolha (select/checkbox), não digitação — grava quase na hora.
  const auto = useFormAutosave<Record<string, unknown>>(
    async (patch) => {
      const { error } = await (supabase as any)
        .from("approval_settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) {
        toast.error("Não salvou os aprovadores", { description: error.message });
        throw error;
      }
      qc.invalidateQueries({ queryKey: ["approval-settings"] });
    },
    { delay: 150 },
  );

  const set = (patch: Record<string, unknown>) => {
    setForm({ ...form, ...patch });
    auto.agendar(patch);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Link to="/admin" className="rounded-lg p-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Aprovações</h1>
          <p className="text-sm text-muted-foreground">
            Quem aprova os entregáveis por padrão. Cada projeto pode sobrescrever na própria ficha.
          </p>
        </div>
      </div>

      {form && (
        <Card className="glass-card">
          <CardContent className="space-y-4 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Revisão 1 (revisão interna)</Label>
                <Select value={form.nivel1_user_id || "__none__"} onValueChange={(v) => set({ nivel1_user_id: v === "__none__" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="— definir —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— sem R1 —</SelectItem>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{primeiroNome(p.full_name || p.email)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Revisão 2 (aprovação final interna)</Label>
                <Select value={form.nivel2_user_id || "__none__"} onValueChange={(v) => set({ nivel2_user_id: v === "__none__" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="— definir —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— sem R2 —</SelectItem>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{primeiroNome(p.full_name || p.email)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="md:w-1/2 md:pr-2">
              <Label>Envia ao cliente</Label>
              <Select
                value={form.envio_cliente_user_id || "__none__"}
                onValueChange={(v) => set({ envio_cliente_user_id: v === "__none__" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="— definir —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— toda a coordenação —</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{primeiroNome(p.full_name || p.email)}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Quem recebe na Minha mesa o "pronto — falta enviar ao cliente". Sem definir, o item
                cai pra coordenação inteira.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.cliente_aprova}
                onChange={(e) => set({ cliente_aprova: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              Cliente aprova por padrão (depois da Revisão 2, no portal)
            </label>

            <div className="flex justify-end">
              <IndicadorAutosave status={auto.status} />
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        O fluxo: editor termina → <strong>Revisão 1</strong> aprova ou pede ajuste → <strong>Revisão 2</strong> aprova
        ou pede ajuste → <strong>Cliente</strong> (se ligado) aprova ou pede ajuste no portal → Entregue.
        "Pedir ajuste" interno é revisão (conta no indicador). Ajuste do cliente vira uma alteração
        rastreável.
      </p>
    </div>
  );
}
