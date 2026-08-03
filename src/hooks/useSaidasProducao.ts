import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataISO } from "@/lib/dataLocal";
import { supabase } from "@/integrations/supabase/client";

export type TipoSaida = "diaria" | "visita_tecnica" | "saida";
export type StatusSaida = "agendada" | "confirmada" | "realizada" | "cancelada";

export interface SaidaProducao {
  id: string;
  tipo: TipoSaida;
  titulo: string;
  project_id: string | null;
  data: string;            // YYYY-MM-DD
  hora_inicio: string | null;
  hora_fim: string | null;
  dia_inteiro: boolean;
  local: string | null;
  responsavel_id: string | null;
  equipe: string[];
  observacoes: string | null;
  status: StatusSaida;
  gcal_event_id: string | null;
  gcal_sync_status: string | null;
  gcal_synced_at: string | null;
  created_at: string;
  project?: { name: string } | null;
}

export const TIPO_SAIDA_META: Record<TipoSaida, { label: string; emoji: string; color: string }> = {
  diaria: { label: "Diária de gravação", emoji: "🎥", color: "#f59e0b" },
  visita_tecnica: { label: "Visita técnica", emoji: "🔎", color: "#3b82f6" },
  saida: { label: "Saída de produção", emoji: "🚐", color: "#a855f7" },
};

export const STATUS_SAIDA_META: Record<StatusSaida, { label: string; className: string }> = {
  agendada: { label: "Agendada", className: "bg-muted text-muted-foreground" },
  confirmada: { label: "Confirmada", className: "bg-emerald-500/20 text-success border-emerald-500/30" },
  realizada: { label: "Realizada", className: "bg-blue-500/20 text-info border-blue-500/30" },
  cancelada: { label: "Cancelada", className: "bg-destructive/20 text-destructive border-destructive/30" },
};

/** Saídas de hoje pra frente (agenda) + as dos últimos 30 dias (histórico curto). */
export function useSaidasProducao() {
  return useQuery({
    queryKey: ["producao_saidas"],
    queryFn: async () => {
      const limite = new Date();
      limite.setDate(limite.getDate() - 30);
      const { data, error } = await (supabase as any)
        .from("producao_saidas")
        .select("*, project:projects(name)")
        .gte("data", dataISO(limite))
        .order("data", { ascending: true })
        .order("hora_inicio", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return data as SaidaProducao[];
    },
  });
}

async function sincronizar(action: "upsert" | "delete", saida_id: string) {
  // Best-effort: a saída já foi salva; se o Google falhar, a UI mostra "pendente".
  try {
    await supabase.functions.invoke("gcal-sync", { body: { action, saida_id } });
  } catch (e) {
    console.error("gcal-sync", e);
  }
}

export function useSalvarSaida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (saida: Partial<SaidaProducao> & { titulo: string; data: string; tipo: TipoSaida }) => {
      const { project, ...campos } = saida as any;
      let id = saida.id;
      if (id) {
        const { error } = await (supabase as any).from("producao_saidas").update(campos).eq("id", id);
        if (error) throw error;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { data, error } = await (supabase as any)
          .from("producao_saidas")
          .insert({ ...campos, created_by: userData.user?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }
      await sincronizar("upsert", id!);
      return id!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["producao_saidas"] }),
  });
}

export function useCancelarSaida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("producao_saidas")
        .update({ status: "cancelada" })
        .eq("id", id);
      if (error) throw error;
      await sincronizar("delete", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["producao_saidas"] }),
  });
}

export function useExcluirSaida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await sincronizar("delete", id); // tira do Google primeiro
      const { error } = await (supabase as any).from("producao_saidas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["producao_saidas"] }),
  });
}

/** Estado da integração Google (secrets configurados?). */
export function useGcalStatus() {
  return useQuery({
    queryKey: ["gcal_status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("gcal-sync", { body: { action: "status" } });
      if (error) throw error;
      return data as { configured: boolean; calendarId: string | null };
    },
    staleTime: 60_000,
  });
}

export function useSyncTodas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("gcal-sync", { body: { action: "sync_all" } });
      if (error) throw error;
      return data as { sincronizadas: number; erros: number; total: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["producao_saidas"] }),
  });
}
