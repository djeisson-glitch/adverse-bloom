import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface JobAllocation {
  id: string;
  budget_id: string;
  team_member_id: string;
  allocation_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  description: string | null;
  role_function: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  google_calendar_event_id?: string | null;
  // joined
  team_member?: { id: string; name: string; color: string; email: string | null };
  budget?: { id: string; project_name: string; client_name: string; capture_days: number };
}

async function syncCalendar(action: "upsert" | "delete", allocationId: string) {
  try {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    await fetch(`https://${projectId}.supabase.co/functions/v1/google-calendar-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, allocation_id: allocationId }),
    });
  } catch (e) {
    console.warn("Calendar sync skipped:", e);
  }
}

export function useJobAllocations(filters?: { budgetId?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ["job_allocations", filters],
    queryFn: async () => {
      let q = (supabase as any)
        .from("job_allocations")
        .select("*, team_member:team_members(id, name, color, email), budget:budgets(id, project_name, client_name, capture_days)")
        .order("allocation_date");
      if (filters?.budgetId) q = q.eq("budget_id", filters.budgetId);
      if (filters?.from) q = q.gte("allocation_date", filters.from);
      if (filters?.to) q = q.lte("allocation_date", filters.to);
      const { data, error } = await q;
      if (error) throw error;
      return data as JobAllocation[];
    },
  });
}

export function useSaveJobAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alloc: Partial<JobAllocation> & { budget_id: string; team_member_id: string; allocation_date: string }) => {
      let allocId = alloc.id;
      if (alloc.id) {
        const { error } = await (supabase as any)
          .from("job_allocations")
          .update({
            budget_id: alloc.budget_id,
            team_member_id: alloc.team_member_id,
            allocation_date: alloc.allocation_date,
            start_time: alloc.start_time,
            end_time: alloc.end_time,
            location: alloc.location,
            description: alloc.description,
            role_function: alloc.role_function,
            updated_at: new Date().toISOString(),
          })
          .eq("id", alloc.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("job_allocations")
          .insert({
            budget_id: alloc.budget_id,
            team_member_id: alloc.team_member_id,
            allocation_date: alloc.allocation_date,
            start_time: alloc.start_time,
            end_time: alloc.end_time,
            location: alloc.location,
            description: alloc.description,
            role_function: alloc.role_function,
          })
          .select("id")
          .single();
        if (error) throw error;
        allocId = data.id;
      }
      // Sync to Google Calendar (fire-and-forget)
      if (allocId) syncCalendar("upsert", allocId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_allocations"] }),
  });
}

export function useDeleteJobAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Sync delete to Google Calendar first
      await syncCalendar("delete", id);
      const { error } = await (supabase as any)
        .from("job_allocations")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_allocations"] }),
  });
}
