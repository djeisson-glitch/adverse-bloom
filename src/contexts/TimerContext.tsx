import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type Sessao = {
  // project_id null = "sem projeto (atribuir depois)" — padrão Catalunya
  project_id: string | null;
  project_name: string;
  task_id?: string | null;
  task_title?: string;
  // Onda 6A — apontamento no nível do entregável / alteração do cliente
  deliverable_id?: string | null;
  alteracao_id?: string | null;
  description?: string;
  start_at: string;
};

type Ctx = {
  sessao: Sessao | null;
  start: (input: Omit<Sessao, "start_at">) => void;
  stop: () => Promise<void>;
  cancel: () => void;
  elapsedSec: number;
};

const KEY = "adverse-timer";
const TimerCtx = createContext<Ctx | null>(null);

export function TimerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [tick, setTick] = useState(0);

  // Hidrata do localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSessao(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  // Hidrata do BANCO. É o que faz o cronômetro sobreviver a fechar o
  // navegador ou trocar de máquina — o localStorage sozinho não sabia disso.
  // Regra: se o banco tem sessão, ela manda (é a compartilhada). Se o banco
  // está vazio mas a máquina tem uma local, a local sobe pro banco em vez de
  // ser apagada — senão uma gravação que falhou no start (offline) viraria
  // tempo perdido.
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    (async () => {
      const { data } = await (supabase as any)
        .from("time_sessions").select("*").eq("user_id", user.id).maybeSingle();
      if (!vivo) return;
      if (data) {
        let nome = "Sem projeto";
        if (data.project_id) {
          const { data: pr } = await supabase
            .from("projects").select("name").eq("id", data.project_id).maybeSingle();
          if (pr?.name) nome = pr.name;
        }
        if (!vivo) return;
        setSessao({
          project_id: data.project_id,
          project_name: nome,
          task_id: data.task_id,
          deliverable_id: data.deliverable_id,
          description: data.description || undefined,
          start_at: data.start_at,
        });
        return;
      }
      // Banco vazio: sobe a local, se houver.
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      try {
        const local = JSON.parse(raw) as Sessao;
        await (supabase as any).from("time_sessions").upsert({
          user_id: user.id,
          project_id: local.project_id || null,
          deliverable_id: local.deliverable_id || null,
          task_id: local.task_id || null,
          description: local.description || null,
          billable: true,
          start_at: local.start_at,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      } catch {
        // ignore
      }
    })();
    return () => { vivo = false; };
  }, [user]);

  // Persiste
  useEffect(() => {
    if (sessao) localStorage.setItem(KEY, JSON.stringify(sessao));
    else localStorage.removeItem(KEY);
  }, [sessao]);

  // Tick a cada segundo enquanto rodando
  useEffect(() => {
    if (!sessao) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [sessao]);

  const start: Ctx["start"] = useCallback((input) => {
    const start_at = new Date().toISOString();
    setSessao({ ...input, start_at });
    toast.success(`Cronômetro iniciado · ${input.project_name}`);
    // A sessão também vai pro banco: é o que permite ver quem está rodando
    // agora no painel de Horas, e o que salva o timer de quem fecha o
    // navegador ou troca de máquina. O localStorage segue como resposta
    // instantânea da UI; o banco é a fonte compartilhada.
    // Precisa de await: o builder do supabase-js só dispara a requisição
    // quando alguém dá then/await nele. Sem isso o upsert nunca saía — a
    // sessão ficava só no localStorage, que é o problema que isto resolve.
    if (user) {
      void (async () => {
        const { error } = await (supabase as any).from("time_sessions").upsert({
          user_id: user.id,
          project_id: input.project_id || null,
          deliverable_id: input.deliverable_id || null,
          task_id: input.task_id || null,
          description: input.description || null,
          billable: true,
          start_at,
          updated_at: start_at,
        }, { onConflict: "user_id" });
        // Falhar aqui não pode parar o cronômetro (o local segue valendo e a
        // hidratação repara depois), mas tem que aparecer.
        if (error) console.warn("Sessão do timer não subiu pro banco:", error.message);
      })();
    }
  }, [user]);

  /** Some com a sessão aberta do banco (parou ou cancelou). */
  const limparSessaoRemota = useCallback(async () => {
    if (!user) return;
    await (supabase as any).from("time_sessions").delete().eq("user_id", user.id);
  }, [user]);

  const cancel = useCallback(() => {
    setSessao(null);
    void limparSessaoRemota();
    toast.info("Cronômetro cancelado (nada foi lançado)");
  }, [limparSessaoRemota]);

  const stop = useCallback(async () => {
    if (!sessao || !user) { void limparSessaoRemota(); return setSessao(null); }
    await limparSessaoRemota();
    const start = new Date(sessao.start_at).getTime();
    const duration_min = Math.max(1, Math.round((Date.now() - start) / 60000));
    try {
      const { error } = await (supabase as any).from("time_entries").insert({
        user_id: user.id,
        project_id: sessao.project_id || null,
        task_id: sessao.task_id || null,
        deliverable_id: sessao.deliverable_id || null,
        alteracao_id: sessao.alteracao_id || null,
        start_at: sessao.start_at,
        duration_min,
        description: sessao.description || null,
        billable: true,
        source: "timer",
      });
      if (error) throw error;
      toast.success(`Lançado · ${duration_min} min em ${sessao.project_name}`);
      // Faz o timesheet e os totais de horas atualizarem NA HORA, por qualquer
      // caminho de parada (botão do fluxo OU Apontar do topo). Antes o stop não
      // invalidava nada — o tempo só aparecia depois de recarregar a página.
      if (sessao.deliverable_id) {
        qc.invalidateQueries({ queryKey: ["entregavel-horas", sessao.deliverable_id] });
        qc.invalidateQueries({ queryKey: ["entregavel", sessao.deliverable_id] });
      }
      if (sessao.project_id) {
        qc.invalidateQueries({ queryKey: ["projeto-horas-total", sessao.project_id] });
      }
      // Grades de horas gerais (timesheet semanal, minhas horas, home).
      qc.invalidateQueries({ predicate: (q) => {
        const k = String(q.queryKey?.[0] ?? "");
        return k.includes("hora") || k.includes("timesheet") || k.startsWith("home");
      }});
    } catch (e: any) {
      toast.error("Erro ao lançar horas", { description: e.message });
    } finally {
      setSessao(null);
    }
  }, [sessao, user, qc, limparSessaoRemota]);

  const elapsedSec = sessao
    ? Math.floor((Date.now() - new Date(sessao.start_at).getTime()) / 1000) + tick * 0
    : 0;

  return (
    <TimerCtx.Provider value={{ sessao, start, stop, cancel, elapsedSec }}>
      {children}
    </TimerCtx.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerCtx);
  if (!ctx) throw new Error("useTimer precisa estar dentro de <TimerProvider>");
  return ctx;
}

export function formatElapsed(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
