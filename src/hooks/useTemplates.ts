import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface TemplateItem {
  category: string;
  item_name: string;
  client_days: number;
  client_people: number;
  client_unit_price: number;
  has_supplier_cost: boolean;
  supplier_days: number;
  supplier_people: number;
  supplier_unit_price: number;
}

export interface ProposalTemplate {
  id: string;
  name: string;
  description: string | null;
  categories: TemplateItem[];
  markup_default: number;
  tax_default: number;
  commission_default: number;
  bv_default: number;
  not_included: string[];
  created_by: string | null;
  created_at: string;
}

export function useTemplates() {
  return useQuery({
    queryKey: ["proposal_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposal_templates")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data as any[]).map((t) => ({
        ...t,
        categories: (t.categories ?? []) as TemplateItem[],
        not_included: (t.not_included ?? []) as string[],
      })) as ProposalTemplate[];
    },
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (template: Omit<ProposalTemplate, "id" | "created_at">) => {
      const { error } = await supabase.from("proposal_templates").insert({
        name: template.name,
        description: template.description,
        categories: JSON.parse(JSON.stringify(template.categories)),
        markup_default: template.markup_default,
        tax_default: template.tax_default,
        commission_default: template.commission_default,
        bv_default: template.bv_default,
        not_included: JSON.parse(JSON.stringify(template.not_included)),
        created_by: template.created_by,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposal_templates"] });
      toast({ title: "Template salvo!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar template", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proposal_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposal_templates"] });
      toast({ title: "Template excluído." });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    },
  });
}
