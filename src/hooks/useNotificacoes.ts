import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type Notificacao = {
  id: string;
  tipo: string;
  prioridade: "critico" | "importante" | "info";
  titulo: string;
  corpo: string | null;
  link: string | null;
  lida_em: string | null;
  created_at: string;
};

/**
 * Caixa de notificações da pessoa logada.
 * O sino atualiza sozinho: escuta a tabela via Realtime, não fica dando poll.
 */
export function useNotificacoes(limite = 30) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: notificacoes = [], isLoading } = useQuery({
    queryKey: ["notificacoes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notificacoes")
        .select("id, tipo, prioridade, titulo, corpo, link, lida_em, created_at")
        .order("created_at", { ascending: false })
        .limit(limite);
      if (error) return [] as Notificacao[];   // sem migration ainda: não quebra a tela
      return data as Notificacao[];
    },
  });

  // Realtime: chegou notificação nova, o sino acende na hora.
  useEffect(() => {
    if (!user?.id) return;
    const canal = supabase
      .channel(`notif:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificacoes", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notificacoes", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [user?.id, qc]);

  const naoLidas = notificacoes.filter((n) => !n.lida_em);

  const marcarLidas = useMutation({
    mutationFn: async (ids?: string[]) => {
      const { error } = await (supabase as any).rpc("notificacoes_marcar_lidas", { _ids: ids ?? null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes", user?.id] }),
  });

  return { notificacoes, naoLidas, total: naoLidas.length, isLoading, marcarLidas };
}
