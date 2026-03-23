import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Task = Tables<"tasks">;

export function useTasks(dealId?: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["tasks", dealId || "none"],
    queryFn: async () => {
      if (!dealId || dealId === "__all__") return [];
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Task[];
    },
  });

  const allTasksQuery = useQuery({
    queryKey: ["tasks-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").order("due_date", { ascending: true });
      if (error) throw error;
      return data as Task[];
    },
  });

  const createTask = useMutation({
    mutationFn: async (task: TablesInsert<"tasks">) => {
      const { data, error } = await supabase.from("tasks").insert(task).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks-all"] });
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"tasks"> & { id: string }) => {
      const { data, error } = await supabase.from("tasks").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks-all"] });
    },
  });

  return { ...query, tasks: query.data || [], allTasks: allTasksQuery.data || [], createTask, updateTask };
}
