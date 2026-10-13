import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import type { CrmActivity, CrmLead } from "@/lib/crm";
import { toast } from "sonner";

export function useCrmAgenda() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const leads = useQuery({
    queryKey: ["leads"], enabled: can("leads"),
    queryFn: async () => {
      const {data,error} = await supabase.from("leads").select("*, ultima:lead_interacoes(data)").order("proximo_toque", {nullsFirst:false});
      if(error) throw error;
      return (data || []) as CrmLead[];
    },
  });
  const tasks = useQuery({
    queryKey: ["crm-tasks"], enabled: can("orcamentos"),
    queryFn: async () => {
      const {data,error} = await supabase.from("tasks").select("*").not("deal_id", "is", null).is("project_id", null).eq("completed", false).order("due_date");
      if(error) throw error;
      return data || [];
    },
  });
  const followups = useQuery({
    queryKey: ["follow-ups-pendentes"], enabled: can("follow_ups"),
    queryFn: async () => {
      const {data,error} = await supabase.from("follow_ups").select("*, deal:deals(id, title, client:clients(name))").eq("status", "pendente").order("data_prevista");
      if(error) throw error;
      return data || [];
    },
  });
  const refresh = async () => {
    await Promise.all(["crm-tasks", "tasks", "tasks-all", "follow-ups", "follow-ups-pendentes", "minha-mesa-leads"].map(key => qc.invalidateQueries({queryKey:[key]})));
  };
  const complete = useMutation({
    mutationFn: async (a: CrmActivity) => {
      if (a.source === "lead") throw new Error("Registre o contato na ficha do lead.");
      if (!can(a.source === "task" ? "orcamentos" : "follow_ups", "edit")) throw new Error("Sem permissão para concluir esta atividade.");
      const result = a.source === "task"
        ? await supabase.from("tasks").update({completed:true, completed_at:new Date().toISOString()}).eq("id",a.id).select("id").single()
        : await supabase.from("follow_ups").update({status:"concluido",concluido_em:new Date().toISOString()}).eq("id",a.id).select("id").single();
      if(result.error) throw result.error;
    },
    onSuccess: async () => { await refresh(); toast.success("Atividade concluída"); },
    onError: (e: Error) => toast.error("Não foi possível concluir", {description:e.message}),
  });
  return {leads,tasks,followups,refresh,complete};
}
