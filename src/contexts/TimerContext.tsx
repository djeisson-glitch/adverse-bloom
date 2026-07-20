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
    setSessao({ ...input, start_at: new Date().toISOString() });
    toast.success(`Cronômetro iniciado · ${input.project_name}`);
  }, []);

  const cancel = useCallback(() => {
    setSessao(null);
    toast.info("Cronômetro cancelado (nada foi lançado)");
  }, []);

  const stop = useCallback(async () => {
    if (!sessao || !user) return setSessao(null);
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
  }, [sessao, user, qc]);

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
