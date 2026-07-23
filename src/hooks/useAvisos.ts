import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

// Mural de avisos internos. Admin/coordenadora publica; todo mundo lê (a RLS
// garante o gate no banco — aqui a flag só decide o que a UI mostra).
export type Aviso = {
  id: string;
  titulo: string;
  corpo: string | null;
  autor_id: string | null;
  fixado: boolean;
  ativo: boolean;
  data_evento: string | null;   // quando é o evento (opcional), além do created_at
  created_at: string;
};

export function useAvisos() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isAdmin, isCoordenadora } = usePermissions();
  const podePublicar = isAdmin || isCoordenadora;

  const { data: avisos = [], isLoading } = useQuery({
    queryKey: ["avisos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("avisos")
        .select("*")
        .eq("ativo", true)
        .order("fixado", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Aviso[]) || [];
    },
    // Aparece pra todo mundo sem precisar recarregar a página.
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ["avisos"] });

  const aoErrar = (e: any) => toast.error("Não deu", { description: e?.message || "Erro no mural" });

  const publicar = useMutation({
    mutationFn: async (v: { titulo: string; corpo?: string; fixado?: boolean; data_evento?: string | null }) => {
      const titulo = v.titulo.trim();
      if (!titulo) throw new Error("Escreva o aviso");
      const { error } = await (supabase as any).from("avisos").insert({
        titulo,
        corpo: (v.corpo || "").trim() || null,
        fixado: !!v.fixado,
        data_evento: v.data_evento || null,
        autor_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: aoErrar,
  });

  const alternarFixado = useMutation({
    mutationFn: async (a: Aviso) => {
      const { error } = await (supabase as any)
        .from("avisos")
        .update({ fixado: !a.fixado, updated_at: new Date().toISOString() })
        .eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: aoErrar,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("avisos")
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: aoErrar,
  });

  return { avisos, isLoading, podePublicar, publicar, alternarFixado, remover };
}
