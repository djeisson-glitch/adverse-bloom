import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MODULES, type ModuleId, type PermissionLevel } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Shield, Eye, Edit, XCircle, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;

const LEVEL_OPTIONS: { value: PermissionLevel; label: string; icon: typeof Eye; color: string }[] = [
  { value: "none", label: "Sem acesso", icon: XCircle, color: "text-destructive" },
  { value: "view", label: "Visualizar", icon: Eye, color: "text-muted-foreground" },
  { value: "edit", label: "Editar", icon: Edit, color: "text-[hsl(var(--success))]" },
];

export default function ConfiguracoesPermissoes() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data as Profile[];
    },
  });

  const { data: userRoles } = useQuery({
    queryKey: ["all_user_roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: permissions, isLoading: permsLoading } = useQuery({
    queryKey: ["all_user_permissions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_permissions")
        .select("*");
      if (error) throw error;
      return data as { id: string; user_id: string; module: string; permission: PermissionLevel }[];
    },
  });

  const upsertPermission = useMutation({
    mutationFn: async ({ userId, module, permission }: { userId: string; module: string; permission: PermissionLevel }) => {
      const { error } = await (supabase as any)
        .from("user_permissions")
        .upsert(
          { user_id: userId, module, permission, updated_at: new Date().toISOString() },
          { onConflict: "user_id,module" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all_user_permissions"] });
      qc.invalidateQueries({ queryKey: ["user_permissions"] });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar permissão", description: err.message, variant: "destructive" });
    },
  });

  const nonAdminProfiles = useMemo(() => {
    if (!profiles || !userRoles) return [];
    const adminIds = new Set(userRoles.filter((r) => r.role === "admin").map((r) => r.user_id));
    return profiles.filter((p) => !adminIds.has(p.id));
  }, [profiles, userRoles]);

  const getPermission = (userId: string, module: string): PermissionLevel => {
    const perm = permissions?.find((p) => p.user_id === userId && p.module === module);
    return perm?.permission || "none";
  };

  const handleChange = (userId: string, module: string, level: PermissionLevel) => {
    upsertPermission.mutate({ userId, module, permission: level });
  };

  if (profilesLoading || permsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Permissões
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Defina o acesso de cada usuário aos módulos do sistema. Administradores sempre têm acesso total.
        </p>
      </motion.div>

      {nonAdminProfiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum usuário não-admin encontrado. Administradores já possuem acesso total.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 font-medium text-muted-foreground min-w-[180px]">Usuário</th>
                    {MODULES.map((m) => (
                      <th key={m.id} className="text-center p-4 font-medium text-muted-foreground min-w-[150px]">
                        <div>{m.label}</div>
                        <div className="text-[10px] font-normal opacity-70">{m.description}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {nonAdminProfiles.map((profile) => {
                    const role = userRoles?.find((r) => r.user_id === profile.id);
                    return (
                      <tr key={profile.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                        <td className="p-4">
                          <div className="font-medium text-foreground">{profile.full_name || profile.email || "—"}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-muted-foreground">{profile.email}</span>
                            {role && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                {role.role}
                              </Badge>
                            )}
                          </div>
                        </td>
                        {MODULES.map((mod) => {
                          const current = getPermission(profile.id, mod.id);
                          const opt = LEVEL_OPTIONS.find((o) => o.value === current)!;
                          return (
                            <td key={mod.id} className="p-4 text-center">
                              <Select
                                value={current}
                                onValueChange={(v) => handleChange(profile.id, mod.id, v as PermissionLevel)}
                              >
                                <SelectTrigger className={`h-8 text-xs w-[130px] mx-auto ${opt.color}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {LEVEL_OPTIONS.map((lo) => (
                                    <SelectItem key={lo.value} value={lo.value}>
                                      <span className={`flex items-center gap-1.5 ${lo.color}`}>
                                        <lo.icon className="h-3 w-3" />
                                        {lo.label}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
