import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  color: string;
  role_function: string | null;
  user_id: string | null;
  is_active: boolean;
  created_at: string;
}

export function useTeamMembers() {
  return useQuery({
    queryKey: ["team_members"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_members")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as TeamMember[];
    },
  });
}

export function useActiveTeamMembers() {
  const { data, ...rest } = useTeamMembers();
  return { data: data?.filter((m) => m.is_active), ...rest };
}

export function useSaveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (member: Partial<TeamMember> & { name: string }) => {
      if (member.id) {
        const { error } = await (supabase as any)
          .from("team_members")
          .update(member)
          .eq("id", member.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("team_members")
          .insert(member);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_members"] }),
  });
}

export function useDeleteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("team_members")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_members"] }),
  });
}
