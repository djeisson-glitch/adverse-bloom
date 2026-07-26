import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Preferências de notificação.
 *
 * Dois conceitos que NÃO se misturam:
 *  • nível  — propriedade do TIPO de evento (1 na hora / 2 agrupado / 3 só sino).
 *             Diz QUANDO o push sai. Quem muda é o admin, no catálogo.
 *  • modo   — por pessoa e por tipo (push / sino / off).
 *             Diz SE aquilo chega naquela pessoa.
 */

export type Modo = "push" | "sino" | "off";

export type TipoNotif = {
  tipo: string;
  rotulo: string;
  descricao: string | null;
  grupo: string;
  nivel_padrao: number;
  ordem: number;
};

export const ROTULO_NIVEL: Record<number, string> = {
  1: "Na hora",
  2: "No resumo",
  3: "Só no sino",
};

export const ROTULO_GRUPO: Record<string, string> = {
  producao: "Produção",
  comercial: "Comercial",
  prazos: "Prazos",
  conversas: "Conversas",
  sistema: "Sistema",
  geral: "Geral",
};

/** Catálogo de tipos — o que existe e qual o nível de cada um. */
export function useTiposNotif() {
  return useQuery({
    queryKey: ["notif-tipos"],
    staleTime: 5 * 60_000,   // catálogo muda muito raramente
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notificacao_tipos")
        .select("tipo, rotulo, descricao, grupo, nivel_padrao, ordem")
        .order("ordem");
      if (error) throw error;
      return (data as TipoNotif[]) || [];
    },
  });
}

/** Minhas preferências (só o que foi explicitamente gravado). */
export function useMinhasPrefs() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const prefs = useQuery({
    queryKey: ["notif-prefs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notificacao_prefs").select("tipo, modo").eq("user_id", user!.id);
      if (error) throw error;
      const mapa: Record<string, Modo> = {};
      for (const p of (data as any[]) || []) mapa[p.tipo] = p.modo;
      return mapa;
    },
  });

  const salvarModo = useMutation({
    mutationFn: async ({ tipo, modo }: { tipo: string; modo: Modo }) => {
      const { error } = await (supabase as any)
        .rpc("notif_pref_salvar", { _user_id: user!.id, _tipo: tipo, _modo: modo });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-prefs", user?.id] }),
    onError: (e: any) => toast.error("Não salvou", { description: e.message }),
  });

  return { prefs, salvarModo };
}

/**
 * Horários do resumo — GLOBAIS. Quem define é a gestão; pra todo mundo mais
 * é informação (aparece na tela como "chega às 9h, 14h e 17h").
 */
export function useHorasResumo() {
  return useQuery({
    queryKey: ["notif-horas-resumo"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notificacao_ajustes").select("digest_horas").maybeSingle();
      if (error) throw error;
      return ((data as any)?.digest_horas as number[]) || [9, 14, 17];
    },
  });
}

/** Só a gestão salva os horários. */
export function useSalvarHorasResumo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (horas: number[]) => {
      const { error } = await (supabase as any)
        .rpc("notif_ajustes_salvar", { _digest_horas: horas });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-horas-resumo"] }),
    onError: (e: any) => toast.error("Não salvou", { description: e.message }),
  });
}

/**
 * Modo efetivo de um tipo: o que a pessoa gravou, senão o padrão do nível.
 * Mesma regra do SQL (notif_modo) — mantida idêntica de propósito, pra tela e
 * banco nunca discordarem sobre o que a pessoa recebe.
 */
export function modoEfetivo(tipo: TipoNotif, gravado?: Modo): Modo {
  if (gravado) return gravado;
  return tipo.nivel_padrao === 3 ? "sino" : "push";
}

/* ------------------------------------------------------------------ admin */

export type LinhaMatriz = {
  user_id: string; nome: string; email: string;
  tipo: string; rotulo: string; grupo: string; nivel: number; ordem: number;
  modo: Modo; explicito: boolean;
};

export type PessoaMatriz = {
  user_id: string; nome: string; email: string;
  modos: Record<string, Modo>;
};

/** Matriz do painel: uma chamada devolve todo mundo × todos os tipos. */
export function useMatrizNotif() {
  const qc = useQueryClient();

  const matriz = useQuery({
    queryKey: ["notif-matriz"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("notif_matriz");
      if (error) throw error;
      const linhas = (data as LinhaMatriz[]) || [];

      const porPessoa = new Map<string, PessoaMatriz>();
      for (const l of linhas) {
        const p = porPessoa.get(l.user_id) || { user_id: l.user_id, nome: l.nome, email: l.email, modos: {} };
        p.modos[l.tipo] = l.modo;
        porPessoa.set(l.user_id, p);
      }
      return [...porPessoa.values()];
    },
  });

  const salvar = useMutation({
    mutationFn: async ({ userId, tipo, modo }: { userId: string; tipo: string; modo: Modo }) => {
      const { error } = await (supabase as any)
        .rpc("notif_pref_salvar", { _user_id: userId, _tipo: tipo, _modo: modo });
      if (error) throw error;
    },
    // Otimista: a matriz tem dezenas de células, esperar o round-trip a cada
    // clique deixaria a tela travada.
    onMutate: async ({ userId, tipo, modo }) => {
      await qc.cancelQueries({ queryKey: ["notif-matriz"] });
      const antes = qc.getQueryData<PessoaMatriz[]>(["notif-matriz"]);
      qc.setQueryData<PessoaMatriz[]>(["notif-matriz"], (atual) =>
        (atual || []).map((p) => (p.user_id === userId ? { ...p, modos: { ...p.modos, [tipo]: modo } } : p)),
      );
      return { antes };
    },
    onError: (e: any, _v, ctx) => {
      qc.setQueryData(["notif-matriz"], ctx?.antes);
      toast.error("Não salvou", { description: e.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notif-matriz"] }),
  });

  return { matriz, salvar };
}
