import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Timer, Plus, Trash2, CalendarCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDuracaoMin, fmtDuracao, ETAPAS_TRABALHO } from "@/lib/duracao";
import { toast } from "sonner";

type Entry = {
  id: string;
  project_id: string;
  start_at: string;
  duration_min: number;
  description: string | null;
  billable: boolean;
  source: string;
  project?: { name: string; client_name?: string | null } | null;
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** "2026-06" -> "junho/2026" (pro toast e o rótulo do período). */
function rotuloMes(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}


export default function Horas() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isAdmin } = usePermissions();

  const [form, setForm] = useState({
    project_id: "",
    pessoa: "",          // admin lança pra outra pessoa; vazio = eu
    data: iso(new Date()),
    inicio: "09:00",
    duracao: "60",
    descricao: "",
    faturavel: true,
  });

  // Vê as horas de quem está sendo lançado (admin), senão as próprias.
  const viewUserId = (isAdmin && form.pessoa) ? form.pessoa : user?.id;
  const suasHoras = viewUserId === user?.id;

  // Mês que a lista mostra (YYYY-MM). Começa no atual. O lançamento retroativo
  // (horas antigas do ClickUp) grava certo, mas com a janela travada no mês
  // corrente ele SUMIA da lista — dava "registrei mas não aparece". Agora dá
  // pra escolher o mês e conferir, e o lançamento recua a janela sozinho.
  const mesAtual = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const [verMes, setVerMes] = useState(mesAtual);
  const ehMesAtual = verMes === mesAtual;

  // Janela do mês escolhido. No mês corrente recua 14 dias pra pegar o
  // apontamento que cruza a virada; em mês passado, o mês inteiro.
  const fromDate = useMemo(() => {
    const [y, m] = verMes.split("-").map(Number);
    const inicioMes = new Date(y, m - 1, 1, 0, 0, 0, 0);
    if (verMes === mesAtual) {
      const d14 = new Date();
      d14.setDate(d14.getDate() - 14);
      d14.setHours(0, 0, 0, 0);
      return (inicioMes < d14 ? inicioMes : d14).toISOString();
    }
    return inicioMes.toISOString();
  }, [verMes, mesAtual]);
  // Mês passado tem teto (só aquele mês); mês atual segue em aberto (pega hoje
  // e futuro). Sem teto, escolher junho traria junho+julho+... misturado.
  const toDate = useMemo(() => {
    if (verMes === mesAtual) return null;
    const [y, m] = verMes.split("-").map(Number);
    return new Date(y, m, 1, 0, 0, 0, 0).toISOString();
  }, [verMes, mesAtual]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["horas-profiles"],
    enabled: isAdmin,
    queryFn: async () => (await (supabase as any).from("profiles").select("id, full_name, email").order("full_name")).data || [],
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["horas-me", viewUserId, verMes],
    enabled: !!viewUserId,
    queryFn: async () => {
      let q = (supabase as any)
        .from("time_entries")
        .select("*, project:projects(name, client_name)")
        .eq("user_id", viewUserId)
        .gte("start_at", fromDate);
      if (toDate) q = q.lt("start_at", toDate);
      const { data, error } = await q.order("start_at", { ascending: false });
      if (error) throw error;
      return data as Entry[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["horas-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, client_name")
        .not("status", "in", "(finalizado,entregue,faturado)")
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const totalHoras = useMemo(
    () => entries.reduce((sum, e) => sum + e.duration_min, 0) / 60,
    [entries],
  );
  // O que o campo de duração vira em minutos, pro feedback ao vivo e pra
  // travar o botão quando o texto não faz sentido.
  const duracaoMin = parseDuracaoMin(form.duracao);

  const lancar = useMutation({
    mutationFn: async () => {
      if (!form.project_id) throw new Error("Escolha um projeto");
      if (!form.data) throw new Error("Informe a data");
      const min = parseDuracaoMin(form.duracao);
      if (!min || min <= 0) throw new Error('Duração não entendida — tente "2h10", "90min" ou "1:30".');
      const [h, m] = form.inicio.split(":").map(Number);
      const start = new Date(`${form.data}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
      const alvo = (isAdmin && form.pessoa) ? form.pessoa : null;   // null = eu (o RPC resolve)
      const { error } = await (supabase as any).rpc("lancar_horas_manual", {
        _project_id: form.project_id,
        _start_at: start.toISOString(),
        _duration_min: min,
        _description: form.descricao || null,
        _billable: form.faturavel,
        _user_id: alvo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Lançou antes do mês que a lista mostra? Pula a janela pra lá, senão o
      // registro fica invisível e parece que não gravou. (form.data sobrevive
      // ao reset abaixo — só descrição/duração são limpos.)
      const mesLancado = form.data?.slice(0, 7);
      const foraDaJanela = mesLancado && mesLancado < verMes;
      if (foraDaJanela) setVerMes(mesLancado);
      setForm({ ...form, descricao: "", duracao: "60" });
      qc.invalidateQueries({ queryKey: ["horas-me"] });
      const nome = form.pessoa ? (profiles.find((p: any) => p.id === form.pessoa)?.full_name || "a pessoa") : "você";
      toast.success(
        foraDaJanela
          ? `Horas lançadas para ${nome} — mostrando ${rotuloMes(mesLancado)}`
          : `Horas lançadas para ${nome}`,
      );
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["horas-me"] }),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Timer className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {suasHoras ? "Minhas horas" : `Horas — ${profiles.find((p: any) => p.id === viewUserId)?.full_name || "pessoa"}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {ehMesAtual ? "Este mês" : rotuloMes(verMes)} · total <strong>{totalHoras.toFixed(1)}h</strong>. Lance manualmente abaixo —
              a <strong>data passada</strong> lança retroativo (ex.: horas do ClickUp).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Escolher o mês pra conferir o retroativo que foi lançado. Sem
              isso, só dava pra ver o mês corrente. */}
          <div className="flex flex-col">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Ver mês</Label>
            <Input
              type="month"
              value={verMes}
              max={mesAtual}
              onChange={(e) => setVerMes(e.target.value || mesAtual)}
              className="h-8 w-[150px] text-xs"
            />
          </div>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => toast.info("Importar da agenda chega em melhoria futura")}>
            <CalendarCheck className="mr-1 h-3.5 w-3.5" />
            Importar da agenda
          </Button>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="space-y-4 p-5">
          {isAdmin && (
            <div>
              <Label>Lançar para</Label>
              <Select value={form.pessoa || "__me__"} onValueChange={(v) => setForm({ ...form, pessoa: v === "__me__" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__me__">Eu mesmo</SelectItem>
                  {profiles.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">Só admin lança horas de outra pessoa (ex.: retroativo do ClickUp por editor).</p>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Projeto</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="— selecione —" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.client_name || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </div>
              <div>
                <Label>Início</Label>
                <Input type="time" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
              </div>
              <div>
                <Label>Duração</Label>
                <Input
                  type="text"
                  inputMode="text"
                  placeholder="2h10, 90min, 1:30"
                  value={form.duracao}
                  onChange={(e) => setForm({ ...form, duracao: e.target.value })}
                />
                {/* Feedback ao vivo do que o sistema entendeu — sem isso, digitar
                    "2h10" e não saber se virou 130min ou erro é um tiro no escuro. */}
                {form.duracao.trim() && (
                  duracaoMin
                    ? <p className="mt-1 text-[11px] text-success">= {fmtDuracao(duracaoMin)} · {duracaoMin} min</p>
                    : <p className="mt-1 text-[11px] text-destructive">não entendi — tente 2h10, 90min ou 1:30</p>
                )}
              </div>
            </div>
          </div>
          <div>
            <Label>Etapa</Label>
            <Select
              value={form.descricao || undefined}
              onValueChange={(v) => setForm({ ...form, descricao: v })}
            >
              <SelectTrigger><SelectValue placeholder="— o que foi feito —" /></SelectTrigger>
              <SelectContent>
                {ETAPAS_TRABALHO.map((etapa) => (
                  <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={form.faturavel}
                onChange={(e) => setForm({ ...form, faturavel: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              Faturável
            </label>
            <Button onClick={() => lancar.mutate()} disabled={lancar.isPending || !duracaoMin} className="bg-primary text-primary-foreground">
              <Plus className="mr-1 h-4 w-4" /> Lançar horas
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum apontamento ainda. Inicie o timer ou lance manualmente acima.
            </div>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[100px_1fr_120px_60px_60px_40px] items-center gap-3 border-b border-border/40 px-5 py-3 text-sm last:border-0"
              >
                <span className="text-xs text-muted-foreground">
                  {new Date(e.start_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-foreground">{e.project?.name || "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.description || "—"}</p>
                </div>
                <span className="text-xs text-muted-foreground">{e.source}</span>
                <span className="text-right text-xs">
                  {fmtDuracao(e.duration_min)}
                </span>
                <span className={`text-xs ${e.billable ? "text-success" : "text-muted-foreground"}`}>
                  {e.billable ? "R$" : "—"}
                </span>
                {suasHoras ? (
                  <button onClick={() => excluir.mutate(e.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : <span />}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
