import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ProposalLetter {
  id: string;
  budget_id: string;
  token: string;
  template_type: "completa" | "reduzida";
  contact_name: string;
  contact_company: string;
  project_description: string | null;
  tags: string[];
  deliverables: { name: string; description: string }[];
  payment_conditions: string;
  validity_days: number;
  status: "pending" | "approved" | "expired";
  approved_name: string | null;
  approved_email: string | null;
  approved_ip: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
}

export function useProposalLetters(budgetId?: string) {
  return useQuery({
    queryKey: ["proposal_letters", budgetId],
    enabled: !!budgetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposal_letters" as any)
        .select("*")
        .eq("budget_id", budgetId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]).map((p) => ({
        ...p,
        tags: p.tags ?? [],
        deliverables: p.deliverables ?? [],
      })) as ProposalLetter[];
    },
  });
}

export function useCreateProposalLetter() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (letter: {
      budget_id: string;
      template_type: "completa" | "reduzida";
      contact_name: string;
      contact_company: string;
      project_description?: string;
      tags?: string[];
      deliverables?: { name: string; description: string }[];
      payment_conditions?: string;
      validity_days?: number;
      created_by?: string;
    }) => {
      const { data, error } = await supabase
        .from("proposal_letters" as any)
        .insert({
          budget_id: letter.budget_id,
          template_type: letter.template_type,
          contact_name: letter.contact_name,
          contact_company: letter.contact_company,
          project_description: letter.project_description || null,
          tags: letter.tags || [],
          deliverables: JSON.parse(JSON.stringify(letter.deliverables || [])),
          payment_conditions: letter.payment_conditions || "À vista — 30 dias após aprovação",
          validity_days: letter.validity_days ?? 15,
          created_by: letter.created_by || null,
        } as any)
        .select("id, token")
        .single();
      if (error) throw error;
      return data as { id: string; token: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposal_letters"] });
      toast({ title: "Carta de proposta gerada!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao gerar proposta", description: err.message, variant: "destructive" });
    },
  });
}
