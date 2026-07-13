import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Link2, Copy, Loader2, Info } from "lucide-react";
import { toast } from "sonner";

/**
 * Config do formulário público de demandas de um cliente.
 * Define o slug do link, o editor responsável (pra calcular o prazo) e as
 * horas de edição/revisão usadas na estimativa.
 */

function slugify(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export default function IntakeConfig({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [form, setForm] = useState({
    intake_ativo: false,
    intake_slug: "",
    intake_editor_id: "",
    intake_edit_horas: "4",
    intake_revisao_horas: "2",
  });
  const [hidratado, setHidratado] = useState(false);

  const { data: cli, isLoading } = useQuery({
    queryKey: ["intake-cfg", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("intake_ativo, intake_slug, intake_editor_id, intake_edit_horas, intake_revisao_horas")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: editores = [] } = useQuery({
    queryKey: ["intake-editores"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("profiles").select("id, full_name").order("full_name");
      if (error) throw error;
      return data as { id: string; full_name: string | null }[];
    },
  });

  useEffect(() => {
    if (cli && !hidratado) {
      setForm({
        intake_ativo: !!cli.intake_ativo,
        intake_slug: cli.intake_slug || slugify(clientName),
        intake_editor_id: cli.intake_editor_id || "",
        intake_edit_horas: String(cli.intake_edit_horas ?? 4),
        intake_revisao_horas: String(cli.intake_revisao_horas ?? 2),
      });
      setHidratado(true);
    }
  }, [cli, hidratado, clientName]);

  const salvar = useMutation({
    mutationFn: async () => {
      const patch = {
        intake_ativo: form.intake_ativo,
        intake_slug: form.intake_slug.trim() ? slugify(form.intake_slug) : null,
        intake_editor_id: form.intake_editor_id || null,
        intake_edit_horas: Number(form.intake_edit_horas) || 0,
        intake_revisao_horas: Number(form.intake_revisao_horas) || 0,
      };
      const { error } = await (supabase as any).from("clients").update(patch).eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Formulário do cliente salvo"),
    onError: (e: any) =>
      toast.error("Não salvou", {
        description: /duplicate|unique|intake_slug/i.test(e.message || "")
          ? "Esse slug já está em uso por outro cliente."
          : /column|intake_/i.test(e.message || "")
          ? "Rode 'supabase db push' pra habilitar o formulário de demandas."
          : e.message,
      }),
  });

  const url = form.intake_slug ? `${window.location.origin}/solicitar/${slugify(form.intake_slug)}` : "";

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            O link abaixo é o formulário público pra <strong>{clientName}</strong> mandar demandas. Ao enviar, o sistema estima o prazo lendo a fila do <strong>editor responsável</strong>.
          </span>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.intake_ativo}
            onChange={(e) => setForm({ ...form, intake_ativo: e.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          Formulário ativo (o cliente consegue enviar demandas)
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Slug do link</Label>
            <div className="flex gap-2">
              <Input value={form.intake_slug} onChange={(e) => setForm({ ...form, intake_slug: e.target.value })} placeholder="sicredi-sul-minas" />
              <Button variant="outline" size="sm" onClick={() => setForm({ ...form, intake_slug: slugify(clientName) })}>Gerar</Button>
            </div>
          </div>
          <div>
            <Label>Editor responsável (pro cálculo de prazo)</Label>
            <Select value={form.intake_editor_id || "none"} onValueChange={(v) => setForm({ ...form, intake_editor_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="— selecionar —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— nenhum —</SelectItem>
                {editores.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name || "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Horas de edição por vídeo</Label>
            <Input type="number" value={form.intake_edit_horas} onChange={(e) => setForm({ ...form, intake_edit_horas: e.target.value })} />
          </div>
          <div>
            <Label>Buffer de revisão interna (horas)</Label>
            <Input type="number" value={form.intake_revisao_horas} onChange={(e) => setForm({ ...form, intake_revisao_horas: e.target.value })} />
          </div>
        </div>

        {url && (
          <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 p-2.5">
            <Link2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{url}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { navigator.clipboard?.writeText(url); toast.success("Link copiado"); }}
            >
              <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
            </Button>
          </div>
        )}

        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending} className="bg-primary text-primary-foreground">
          {salvar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Salvar formulário
        </Button>
      </CardContent>
    </Card>
  );
}
