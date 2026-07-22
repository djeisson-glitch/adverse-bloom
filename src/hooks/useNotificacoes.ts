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

export const SOM_CHAVE = "notif:som";
export const somLigado = () => localStorage.getItem(SOM_CHAVE) !== "off";

/**
 * Toque curto de aviso, sintetizado na hora (sem arquivo de áudio pra carregar).
 * Duas notas rápidas — o suficiente pra puxar a atenção de quem está em outra
 * janela no computador, sem parecer alarme.
 */
export function tocarAviso() {
  if (!somLigado()) return;
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    [880, 1245].forEach((hz, i) => {
      const ini = t0 + i * 0.11;
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      vol.gain.setValueAtTime(0.0001, ini);
      vol.gain.exponentialRampToValueAtTime(0.12, ini + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, ini + 0.16);
      osc.connect(vol);
      vol.connect(ctx.destination);
      osc.start(ini);
      osc.stop(ini + 0.18);
    });
    setTimeout(() => ctx.close?.(), 900);
  } catch {
    /* som é bônus — nunca atrapalha o resto */
  }
}

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
    // Rede de segurança: se o Realtime não chegar (projeto sem realtime, aba
    // suspensa, reconexão), o sino ainda atualiza sozinho.
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  // Realtime: chegou notificação nova, o sino acende na hora — E, se a aba
  // estiver aberta (mesmo em outra janela/app), o balão de desktop dispara
  // DAQUI, direto pela API Notification. É o caminho mais robusto: não passa
  // por servidor, VAPID nem service worker, então quase não falha. O web push
  // (servidor → SW) só é necessário quando a aba está FECHADA.
  useEffect(() => {
    if (!user?.id) return;
    const canal = supabase
      .channel(`notif:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificacoes", filter: `user_id=eq.${user.id}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["notificacoes", user.id] });
          const n = payload.new as Notificacao;
          // Aviso sonoro curto: no computador é o que mais pega quando a
          // pessoa está em outra janela. Silenciável nas Notificações.
          if (n.prioridade !== "info") tocarAviso();
          // Só quando a pessoa NÃO está com a aba em foco — se está olhando o
          // sistema, o sino já basta; balão em cima viraria ruído.
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted" &&
            typeof document !== "undefined" &&
            !document.hasFocus()
          ) {
            try {
              const balao = new Notification(n.titulo, {
                body: n.corpo || "",
                icon: "/icon-192.png",
                // Fica na tela até dispensar — antes sumia em segundos e
                // passava despercebida.
                requireInteraction: true,
                // Tag ÚNICA por notificação (o id). Com a tag repetida (era o
                // tipo), a 2ª notificação do mesmo tipo substituía a 1ª em
                // silêncio — daí "funcionou uma vez e depois não". Cada linha
                // do banco já é um evento distinto (o dedupe é na criação).
                tag: n.id,
              });
              balao.onclick = () => {
                window.focus();
                if (n.link) window.location.href = n.link;
                balao.close();
              };
            } catch {
              /* alguns navegadores exigem o SW pra Notification; aí fica o web push */
            }
          }
        },
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
