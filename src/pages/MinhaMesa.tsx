import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Clapperboard, Film, ThumbsUp, ChevronRight, Loader2, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Onda 6B — "Minha mesa": painel do editor e do aprovador.
 * Editar: entregáveis onde sou responsável, agrupados por etapa.
 * Aprovar: entregáveis esperando minha aprovação (N1 ou N2), resolvendo o
 * override por projeto vs. o padrão global.
 */

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_edicao: "Em edição",
  revisao_n1: "Revisão N1",
  revisao_n2: "Revisão N2",
  com_cliente: "Com o cliente",
  ajuste_solicitado: "Ajuste solicitado",
  aprovado: "Aprovado",
  entregue: "Entregue",
};

type Aba = "editar" | "tarefas" | "aprovar";

export default function MinhaMesa() {
  const { user } = useAuth();
  const [aba, setAba] = useState<Aba>("editar");
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: settings } = useQuery({
    queryKey: ["approval-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("approval_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: deliverables = [], isLoading } = useQuery({
    queryKey: ["minha-mesa-deliverables"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("id, titulo, status, formato, duracao, data_entrega, responsavel_id, aprovado_n1_em, aprovado_n2_em, project:projects(id, numero, name, status, aprovador_n1_id, aprovador_n2_id)")
        .order("data_entrega", { nullsFirst: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Minhas tarefas — a Minha mesa passa a ser o ÚNICO lugar do "o que é meu".
  const { data: minhasTarefas = [] } = useQuery({
    queryKey: ["minha-mesa-tarefas", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tasks")
        .select("id, title, due_date, status, project:projects(id, name)")
        .eq("assigned_user_id", user!.id)
        .eq("completed", false)
        .order("due_date", { nullsFirst: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const meus = useMemo(
    () => deliverables.filter((d) => d.responsavel_id === user?.id),
    [deliverables, user?.id],
  );

  const grupos = useMemo(() => {
    const g = {
      editar: meus.filter((d) => ["pendente", "em_edicao", "ajuste_solicitado"].includes(d.status)),
      aprovacao: meus.filter((d) => ["revisao_n1", "revisao_n2"].includes(d.status)),
      cliente: meus.filter((d) => d.status === "com_cliente"),
      concluidos: meus.filter((d) => ["aprovado", "entregue"].includes(d.status)),
    };
    return g;
  }, [meus]);

  // Aprovações esperando por mim
  const aprovarPorMim = useMemo(() => {
    if (!user?.id) return [];
    return deliverables.filter((d) => {
      const effN1 = d.project?.aprovador_n1_id ?? settings?.nivel1_user_id ?? null;
      const effN2 = d.project?.aprovador_n2_id ?? settings?.nivel2_user_id ?? null;
      const souN1 = effN1 === user.id && d.status === "revisao_n1" && !d.aprovado_n1_em;
      const souN2 = effN2 === user.id && d.status === "revisao_n2" && d.aprovado_n1_em && !d.aprovado_n2_em;
      return souN1 || souN2;
    });
  }, [deliverables, settings, user?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <div className="flex items-center gap-3">
        <Clapperboard className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Minha mesa</h1>
          <p className="text-sm text-muted-foreground">Tudo que é seu: tarefas, vídeos pra editar e o que espera sua aprovação.</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border/60">
        {([
          { id: "editar", label: `Editar (${meus.length})`, icon: Film },
          { id: "tarefas", label: `Tarefas (${minhasTarefas.length})`, icon: ListChecks },
          { id: "aprovar", label: `Aprovar (${aprovarPorMim.length})`, icon: ThumbsUp },
        ] as { id: Aba; label: string; icon: any }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setAba(t.id)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm transition-colors ${
              aba === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {aba === "editar" ? (
        <div className="space-y-5">
          <Bucket titulo="Pra editar" itens={grupos.editar} vazio="Nada pra editar agora." tone="primary" />
          <Bucket titulo="Aguardando aprovação" itens={grupos.aprovacao} vazio="Nada aguardando aprovação." tone="warning" />
          <Bucket titulo="Com o cliente" itens={grupos.cliente} vazio="Nada com o cliente." tone="primary" />
          <Bucket titulo="Concluídos" itens={grupos.concluidos} vazio="Nenhum concluído ainda." tone="success" />
        </div>
      ) : aba === "tarefas" ? (
        <Card className="glass-card">
          <CardContent className="p-5">
            <p className="mb-3 text-sm font-semibold text-foreground">Minhas tarefas</p>
            {minhasTarefas.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nada pendente pra você 🎉</p>
            ) : (
              <div className="space-y-1.5">
                {minhasTarefas.map((t: any) => {
                  const atrasada = t.due_date && t.due_date < hoje;
                  return (
                    <Link
                      key={t.id}
                      to={t.project?.id ? `/projetos/${t.project.id}` : "#"}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${atrasada ? "bg-destructive" : "bg-primary"}`} />
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {t.title}
                        {t.project?.name && <span className="text-muted-foreground"> · {t.project.name}</span>}
                      </span>
                      {t.due_date && (
                        <span className={`shrink-0 text-xs ${atrasada ? "text-destructive" : "text-muted-foreground"}`}>
                          {new Date(t.due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Bucket
          titulo="Aguardando minha aprovação"
          itens={aprovarPorMim}
          vazio="Nenhum entregável esperando você aprovar. 🎉"
          tone="warning"
          mostrarAprovar
        />
      )}
    </div>
  );
}

function Bucket({
  titulo, itens, vazio, tone, mostrarAprovar,
}: {
  titulo: string; itens: any[]; vazio: string;
  tone: "primary" | "warning" | "success"; mostrarAprovar?: boolean;
}) {
  const dot = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-primary";
  return (
    <Card className="glass-card">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b border-border/50 px-5 py-3">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          <p className="text-sm font-medium text-foreground">{titulo}</p>
          <span className="text-xs text-muted-foreground">{itens.length}</span>
        </div>
        {itens.length === 0 ? (
          <p className="px-5 py-6 text-center text-xs text-muted-foreground">{vazio}</p>
        ) : (
          itens.map((d) => (
            <Link
              key={d.id}
              to={`/projetos/${d.project?.id}/entregaveis/${d.id}`}
              className="grid grid-cols-[1fr_140px_120px_100px_30px] items-center gap-2 border-b border-border/40 px-5 py-3 text-sm last:border-0 hover:bg-sidebar-accent/40"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{d.titulo}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {d.project?.numero} · {d.project?.name}
                </p>
              </div>
              <span className="rounded bg-muted/60 px-1.5 py-0.5 text-center text-[10px] text-muted-foreground">
                {STATUS_LABEL[d.status] || d.status}
              </span>
              <span className="text-xs text-muted-foreground">
                {d.formato || "—"} {d.duracao ? `· ${d.duracao}` : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {d.data_entrega ? new Date(d.data_entrega).toLocaleDateString("pt-BR") : "—"}
              </span>
              {mostrarAprovar ? (
                <ThumbsUp className="h-4 w-4 text-success" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
