import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Loader2, Save, ExternalLink, FolderOpen, Film, CalendarClock, CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ComentariosSection } from "./ProjetoDetalhe";

/**
 * Detalhe do entregável — página própria com todos os campos e chat.
 * Pedido do Djeisson (prints do sistema de referência): status de execução,
 * responsável, aprovador, prazos interno/cliente, pasta de renders, link
 * Frame.io e "Canal da peça" (comentários só deste entregável).
 */

const STATUS_EXECUCAO = [
  { id: "pendente", label: "Pendente", tone: "muted" },
  { id: "em_edicao", label: "Em edição", tone: "primary" },
  { id: "em_revisao", label: "Revisão interna", tone: "warning" },
  { id: "aguardando_cliente", label: "Aguardando cliente", tone: "primary" },
  { id: "alteracao_solicitada", label: "Alteração solicitada", tone: "destructive" },
  { id: "aprovado", label: "Aprovado", tone: "success" },
  { id: "reprovado", label: "Reprovado", tone: "destructive" },
] as const;

function statusTone(id: string) {
  const s = STATUS_EXECUCAO.find((x) => x.id === id);
  const map: Record<string, string> = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
    primary: "bg-primary/15 text-primary",
    muted: "bg-muted text-muted-foreground",
  };
  return map[s?.tone || "muted"];
}

export default function EntregavelDetalhe() {
  const { id: projectId, did } = useParams<{ id: string; did: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: entregavel, isLoading } = useQuery({
    queryKey: ["entregavel", did],
    enabled: !!did,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("*, project:projects(id, numero, name)")
        .eq("id", did!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["entregavel-profiles"],
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

  const [form, setForm] = useState<any>(null);
  // Hidrata o form quando o entregável carrega
  if (entregavel && !form) {
    setForm({
      titulo: entregavel.titulo || "",
      status: entregavel.status || "pendente",
      formato: entregavel.formato || "",
      duracao: entregavel.duracao || "",
      responsavel_id: entregavel.responsavel_id || "",
      aprovador_id: entregavel.aprovador_id || "",
      data_entrega: entregavel.data_entrega || "",
      prazo_interno: entregavel.prazo_interno || "",
      pasta_renders: entregavel.pasta_renders || "",
      arquivo_url: entregavel.arquivo_url || "",
      descricao: entregavel.descricao || "",
    });
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("deliverables")
        .update({
          titulo: form.titulo,
          status: form.status,
          formato: form.formato || null,
          duracao: form.duracao || null,
          responsavel_id: form.responsavel_id || null,
          aprovador_id: form.aprovador_id || null,
          data_entrega: form.data_entrega || null,
          prazo_interno: form.prazo_interno || null,
          pasta_renders: form.pasta_renders || null,
          arquivo_url: form.arquivo_url || null,
          descricao: form.descricao || null,
        })
        .eq("id", did);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entregavel", did] });
      toast.success("Entregável salvo");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  if (isLoading || !entregavel || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 py-6">
      <button
        onClick={() => navigate(`/projetos/${projectId}`)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {entregavel.project?.name || "Projeto"}
      </button>

      {/* Header */}
      <Card className="glass-card">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${statusTone(form.status)}`}>
                  {STATUS_EXECUCAO.find((s) => s.id === form.status)?.label || form.status}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Film className="h-3 w-3" /> Entregável
                </span>
              </div>
              <Input
                value={form.titulo}
                onChange={(e) => set({ titulo: e.target.value })}
                className="border-transparent bg-transparent px-0 text-2xl font-semibold tracking-tight hover:border-border focus:border-border"
              />
            </div>
            <div className="flex gap-2">
              <Select value={form.status} onValueChange={(v) => set({ status: v })}>
                <SelectTrigger className="h-9 w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_EXECUCAO.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => salvar.mutate()} disabled={salvar.isPending} className="bg-primary text-primary-foreground">
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Salvar
              </Button>
            </div>
          </div>

          <div className="grid gap-4 text-sm md:grid-cols-4">
            <Campo label="Projeto">
              <Link to={`/projetos/${projectId}`} className="text-primary hover:underline">
                {entregavel.project?.numero} · {entregavel.project?.name}
              </Link>
            </Campo>
            <Campo label="Formato">
              <Input value={form.formato} onChange={(e) => set({ formato: e.target.value })} placeholder="16x9" className="h-8" />
            </Campo>
            <Campo label="Duração">
              <Input value={form.duracao} onChange={(e) => set({ duracao: e.target.value })} placeholder='30"' className="h-8" />
            </Campo>
            <Campo label="Pasta de renders">
              {form.pasta_renders ? (
                <a
                  href={form.pasta_renders}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <FolderOpen className="h-3.5 w-3.5" /> Abrir pasta
                </a>
              ) : (
                <Input
                  value={form.pasta_renders}
                  onChange={(e) => set({ pasta_renders: e.target.value })}
                  placeholder="Link da pasta"
                  className="h-8"
                />
              )}
            </Campo>
          </div>
        </CardContent>
      </Card>

      {/* Corpo + chat lado a lado */}
      <div className="grid gap-5 lg:grid-cols-[1fr_380px] lg:items-start">
        <div className="min-w-0 space-y-5">
          {/* Responsáveis e prazos */}
          <Card className="glass-card">
            <CardContent className="grid gap-4 p-6 md:grid-cols-2">
              <div>
                <Label>Responsável</Label>
                <Select value={form.responsavel_id || "__none__"} onValueChange={(v) => set({ responsavel_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— sem responsável —</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Aprovador</Label>
                <Select value={form.aprovador_id || "__none__"} onValueChange={(v) => set({ aprovador_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— sem aprovador —</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" /> Prazo interno
                </Label>
                <Input type="date" value={form.prazo_interno} onChange={(e) => set({ prazo_interno: e.target.value })} />
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Prazo do cliente
                </Label>
                <Input type="date" value={form.data_entrega} onChange={(e) => set({ data_entrega: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Link do arquivo / Frame.io</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.arquivo_url}
                    onChange={(e) => set({ arquivo_url: e.target.value })}
                    placeholder="https://frame.io/…"
                  />
                  {form.arquivo_url && (
                    <a
                      href={form.arquivo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center rounded-md border border-border px-3 text-muted-foreground hover:text-primary"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Briefing do entregável */}
          <Card className="glass-card">
            <CardContent className="space-y-2 p-6">
              <Label>Briefing / observações deste entregável</Label>
              <Textarea
                rows={6}
                value={form.descricao}
                onChange={(e) => set({ descricao: e.target.value })}
                placeholder="Direcionamento, referências, o que precisa entregar…"
              />
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                  <Save className="mr-1 h-3.5 w-3.5" />
                  Salvar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Canal da peça — chat só deste entregável */}
        <Card className="glass-card lg:sticky lg:top-20">
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Canal da peça</p>
              <p className="text-[10px] text-muted-foreground">
                Conversa operacional só deste entregável. Use @nome pra mencionar.
              </p>
            </div>
            <ComentariosSection
              entityType="deliverable"
              entityId={did!}
              profiles={profiles}
              compact
              vazio="Sem mensagens ainda. A conversa do entregável começa aqui."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
