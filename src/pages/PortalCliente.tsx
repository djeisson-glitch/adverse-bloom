import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Send, Plus, Copy, Ban, Loader2, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Client = { id: string; name: string };
type Token = {
  id: string;
  client_id: string;
  token: string;
  ativo: boolean;
  expires_at: string | null;
  ultimo_acesso: string | null;
  created_at: string;
};

function gerarToken() {
  return (
    Math.random().toString(36).slice(2, 8) +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

export default function PortalCliente() {
  const qc = useQueryClient();
  const { canSeeMoney, isAdmin } = usePermissions();
  const [selecionado, setSelecionado] = useState<string>("");

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-lite-portal"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["portal-tokens"],
    enabled: canSeeMoney,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_portal_tokens")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Token[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!selecionado) throw new Error("Escolha um cliente");
      const { error } = await (supabase as any).from("client_portal_tokens").insert({
        client_id: selecionado,
        token: gerarToken(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSelecionado("");
      qc.invalidateQueries({ queryKey: ["portal-tokens"] });
      toast.success("Portal gerado");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const revogar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("client_portal_tokens")
        .update({ ativo: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-tokens"] });
      toast.success("Portal revogado");
    },
  });

  if (!canSeeMoney) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center text-sm text-muted-foreground">
        Só admin e produtor podem gerenciar portais de cliente.
      </div>
    );
  }

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || "—";

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Send className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Portal do Cliente</h1>
          <p className="text-sm text-muted-foreground">
            Gere um link isolado por cliente. Ele acessa via URL única, sem senha, e enxerga só os
            próprios projetos e entregáveis.
          </p>
        </div>
      </div>

      {isAdmin && (
        <Card className="glass-card">
          <CardContent className="grid gap-3 p-5 md:grid-cols-[2fr_1fr]">
            <Select value={selecionado} onValueChange={setSelecionado}>
              <SelectTrigger>
                <SelectValue placeholder="— cliente —" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => criar.mutate()}
              disabled={criar.isPending || !selecionado}
              className="bg-primary text-primary-foreground"
            >
              <Plus className="mr-1 h-4 w-4" />
              Gerar portal
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="glass-card">
          <CardContent className="p-0">
            <div className="grid grid-cols-[1fr_2fr_120px_120px_60px] items-center gap-2 border-b border-border/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Cliente</span>
              <span>Link</span>
              <span>Último acesso</span>
              <span>Status</span>
              <span />
            </div>
            {tokens.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                Nenhum portal gerado ainda.
              </div>
            ) : (
              tokens.map((t) => {
                const url = `${window.location.origin}/portal/${t.token}`;
                return (
                  <div
                    key={t.id}
                    className="grid grid-cols-[1fr_2fr_120px_120px_60px] items-center gap-2 border-b border-border/40 px-5 py-3 text-sm last:border-0"
                  >
                    <span className="font-medium text-foreground">{clientName(t.client_id)}</span>
                    <div className="flex items-center gap-2">
                      <code className="truncate rounded bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {url}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(url);
                          toast.success("Link copiado");
                        }}
                        className="text-muted-foreground hover:text-foreground"
                        title="Copiar"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-primary"
                        title="Abrir"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {t.ultimo_acesso ? new Date(t.ultimo_acesso).toLocaleDateString("pt-BR") : "nunca"}
                    </span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-center text-[10px] font-medium ${
                        t.ativo
                          ? "bg-success/15 text-success"
                          : "bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      {t.ativo ? "ativo" : "revogado"}
                    </span>
                    {isAdmin && t.ativo && (
                      <button
                        onClick={() => revogar.mutate(t.id)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Revogar"
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
