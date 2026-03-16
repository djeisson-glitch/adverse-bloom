import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SupplierContact {
  id: string;
  name: string;
  document: string | null;
  type: string | null;
  is_generic: boolean;
  created_at: string;
  last_used_at: string | null;
}

export function useSupplierContacts() {
  return useQuery({
    queryKey: ["supplier_contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_contacts")
        .select("*")
        .order("is_generic", { ascending: false })
        .order("last_used_at", { ascending: false, nullsFirst: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return data as SupplierContact[];
    },
  });
}

export function useCreateSupplierContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contact: { name: string; document?: string; type?: string }) => {
      const { data, error } = await supabase
        .from("supplier_contacts")
        .insert({ name: contact.name, document: contact.document || null, type: contact.type || "individual" })
        .select()
        .single();
      if (error) throw error;
      return data as SupplierContact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier_contacts"] });
    },
  });
}

export function useTouchSupplierContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("supplier_contacts")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier_contacts"] });
    },
  });
}
