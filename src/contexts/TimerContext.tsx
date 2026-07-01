import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type Sessao = {
  project_id: string;
  project_name: string;
  task_id?: string | null;
  task_title?: string;
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
        project_id: sessao.project_id,
        task_id: sessao.task_id || null,
        start_at: sessao.start_at,
        duration_min,
        description: sessao.description || null,
        billable: true,
        source: "timer",
      });
      if (error) throw error;
      toast.success(`Lançado · ${duration_min} min em ${sessao.project_name}`);
    } catch (e: any) {
      toast.error("Erro ao lançar horas", { description: e.message });
    } finally {
      setSessao(null);
    }
  }, [sessao, user]);

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
