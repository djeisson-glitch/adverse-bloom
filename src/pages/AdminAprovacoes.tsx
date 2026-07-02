import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
      cliente_aprova: settings.cliente_aprova ?? true,
    });
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("approval_settings")
        .update({
          nivel1_user_id: form.nivel1_user_id || null,
          nivel2_user_id: form.nivel2_user_id || null,
          cliente_aprova: form.cliente_aprova,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval-settings"] });
      toast.success("Aprovadores salvos");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

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
                <Label>Nível 1 (revisão interna)</Label>
                <Select value={form.nivel1_user_id || "__none__"} onValueChange={(v) => setForm({ ...form, nivel1_user_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="— definir —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— sem N1 —</SelectItem>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nível 2 (aprovação final interna)</Label>
                <Select value={form.nivel2_user_id || "__none__"} onValueChange={(v) => setForm({ ...form, nivel2_user_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="— definir —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— sem N2 —</SelectItem>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.cliente_aprova}
                onChange={(e) => setForm({ ...form, cliente_aprova: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              Cliente aprova por padrão (depois do N2, no portal)
            </label>

            <div className="flex justify-end">
              <Button onClick={() => salvar.mutate()} disabled={salvar.isPending} className="bg-primary text-primary-foreground">
                <Save className="mr-1 h-3.5 w-3.5" />
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        O fluxo: editor termina → <strong>N1</strong> aprova ou pede ajuste → <strong>N2</strong> aprova
        ou pede ajuste → <strong>Cliente</strong> (se ligado) aprova ou pede ajuste no portal → Entregue.
        "Pedir ajuste" interno é revisão (conta no indicador). Ajuste do cliente vira uma alteração
        rastreável.
      </p>
    </div>
  );
}
