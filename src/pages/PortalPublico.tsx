import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, Send, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type PortalData = {
  client?: { id: string; name: string };
  projects?: {
    id: string;
    numero: string | null;
    name: string;
    status: string;
    progress: number;
    delivery_date: string | null;
    start_date: string | null;
  }[];
  deliverables?: {
    id: string;
    project_id: string;
    titulo: string;
    data_entrega: string | null;
    status: string;
    arquivo_url: string | null;
    tipo: string;
  }[];
  error?: string;
};

/** Portal público sem auth. Só entra quem tem o token na URL. */
export default function PortalPublico() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const [aprovador, setAprovador] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-data", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("portal_client_data", { _token: token });
      if (error) throw error;
      return data as PortalData;
    },
  });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "aprovado" | "reprovado" }) => {
      if (!aprovador) throw new Error("Informe seu nome");
      const { data, error } = await (supabase as any).rpc("portal_deliverable_review", {
        _token: token,
        _deliverable_id: id,
        _status: status,
        _aprovador: aprovador,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["portal-data", token] });
      toast.success(vars.status === "aprovado" ? "Aprovado" : "Reprovado — vamos revisar");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data || data.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md glass-card">
          <CardContent className="space-y-2 p-6 text-center">
            <XCircle className="mx-auto h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Link inválido ou expirado. Fale com a produtora pra receber um link novo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const client = data.client!;
  const projects = data.projects || [];
  const deliverables = data.deliverables || [];
  const pendentes = deliverables.filter((d) => d.status === "pendente" || d.status === "em_revisao");
  const aprovados = deliverables.filter((d) => d.status === "aprovado");

  const groupedByProject = new Map<string, typeof deliverables>();
  deliverables.forEach((d) => {
    groupedByProject.set(d.project_id, [...(groupedByProject.get(d.project_id) || []), d]);
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <span className="text-lg font-bold text-primary">A</span>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Adverse Produtora
            </p>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{client.name}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <Card className="glass-card">
          <CardContent className="grid gap-3 p-5 md:grid-cols-3">
            <Kpi label="Projetos ativos" value={String(projects.length)} />
            <Kpi label="Entregas pendentes" value={String(pendentes.length)} />
            <Kpi label="Entregas aprovadas" value={String(aprovados.length)} />
          </CardContent>
        </Card>

        {projects.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
              Ainda não temos projetos ativos com você. Assim que rolar o kickoff, aparecem aqui.
            </CardContent>
          </Card>
        ) : (
          projects.map((p) => (
            <Card key={p.id} className="glass-card">
              <CardContent className="space-y-4 p-5">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {p.numero || "—"} · {p.status}
                  </p>
                  <h2 className="text-lg font-semibold text-foreground">{p.name}</h2>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/40">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${p.progress || 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{p.progress || 0}%</span>
                    {p.delivery_date && (
                      <span className="text-xs text-muted-foreground">
                        entrega em{" "}
                        {new Date(p.delivery_date).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    )}
                  </div>
                </div>

                {(groupedByProject.get(p.id) || []).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Entregáveis
                    </p>
                    {(groupedByProject.get(p.id) || []).map((d) => (
                      <div
                        key={d.id}
                        className="rounded-md border border-border/40 bg-muted/20 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex-1 text-sm font-medium text-foreground">
                            {d.titulo}
                          </span>
                          <span className={statusChip(d.status)}>{prettyStatus(d.status)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {d.data_entrega && (
                            <span>
                              entrega em {new Date(d.data_entrega).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                          {d.arquivo_url && (
                            <a
                              href={d.arquivo_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Ver arquivo
                            </a>
                          )}
                        </div>
                        {(d.status === "pendente" || d.status === "em_revisao") && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Input
                              placeholder="Seu nome"
                              value={aprovador}
                              onChange={(e) => setAprovador(e.target.value)}
                              className="max-w-[180px]"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => review.mutate({ id: d.id, status: "reprovado" })}
                            >
                              <XCircle className="mr-1 h-3.5 w-3.5" />
                              Preciso revisar
                            </Button>
                            <Button
                              size="sm"
                              className="bg-success text-white hover:bg-success/90"
                              onClick={() => review.mutate({ id: d.id, status: "aprovado" })}
                            >
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              Aprovar
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}

        <div className="pt-4 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          <Send className="mx-auto mb-1 h-3 w-3" />
          Adverse Operating System · Portal do Cliente
        </div>
      </main>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function statusChip(status: string) {
  const map: Record<string, string> = {
    pendente: "bg-muted text-muted-foreground",
    em_revisao: "bg-warning/15 text-warning",
    aprovado: "bg-success/15 text-success",
    reprovado: "bg-destructive/15 text-destructive",
  };
  return `rounded-md px-1.5 py-0.5 text-[10px] font-medium ${map[status] || "bg-muted"}`;
}
function prettyStatus(s: string) {
  return s.replace("_", " ");
}
