import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, Send, ExternalLink, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { LogoAdverse } from "@/components/LogoAdverse";
import { RodapeConfidencial } from "@/components/publico/CabecalhoPublico";

// Etapas do projeto, em linguagem de cliente
// Situação do entregável, em linguagem de cliente
const ENTREGA_LABEL: Record<string, string> = {
  pendente: "Em preparação",
  em_edicao: "Em edição",
  revisao_n1: "Em revisão interna",
  revisao_n2: "Em revisão interna",
  com_cliente: "Aguardando você",
  ajuste_solicitado: "Ajuste em andamento",
  aprovado: "Aprovado",
  entregue: "Entregue",
};

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

  const [ajusteDe, setAjusteDe] = useState<string | null>(null);
  const [ajusteTexto, setAjusteTexto] = useState("");

  const aprovar = useMutation({
    mutationFn: async (id: string) => {
      if (!aprovador) throw new Error("Informe seu nome");
      const { data, error } = await (supabase as any).rpc("portal_deliverable_aprovar", {
        _token: token,
        _deliverable_id: id,
        _aprovador: aprovador,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-data", token] });
      toast.success("Entregável aprovado — obrigado!");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const pedirAjuste = useMutation({
    mutationFn: async (id: string) => {
      if (!aprovador) throw new Error("Informe seu nome");
      if (!ajusteTexto.trim()) throw new Error("Descreva o ajuste");
      const { data, error } = await (supabase as any).rpc("portal_deliverable_alteracao", {
        _token: token,
        _deliverable_id: id,
        _titulo: ajusteTexto.trim().slice(0, 80),
        _descricao: ajusteTexto.trim(),
        _solicitante: aprovador,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      setAjusteDe(null);
      setAjusteTexto("");
      qc.invalidateQueries({ queryKey: ["portal-data", token] });
      toast.success("Ajuste enviado — a equipe já vai olhar");
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
  const pendentes = deliverables.filter((d) => d.status === "com_cliente");
  const aprovados = deliverables.filter((d) => d.status === "aprovado" || d.status === "entregue");

  /**
   * O portal é do CLIENTE, então a ordem é a dele: primeiro o que espera uma
   * decisão sua, depois o que está sendo feito, e o entregue vira arquivo
   * organizado por mês. Antes a lista vinha por projeto, e um vídeo já
   * finalizado aparecia acima de um que precisava de revisão.
   *
   * O nome que manda é o do ENTREGÁVEL — é a peça que a pessoa assiste e
   * comenta. O projeto vira legenda.
   */
  const proj = (id: string) => projects.find((p) => p.id === id);
  const nomeProjeto = (id: string) => proj(id)?.name || "";
  const dataDe = (d: any) => d.aprovado_cliente_em || d.data_entrega || null;

  const precisaDeVoce = deliverables
    .filter((d) => d.status === "com_cliente")
    .sort((a, b) => (dataDe(a) || "9999").localeCompare(dataDe(b) || "9999"));

  const emProducao = deliverables
    .filter((d) => !["com_cliente", "aprovado", "entregue", "faturado"].includes(d.status))
    .sort((a, b) => (dataDe(a) || "9999").localeCompare(dataDe(b) || "9999"));

  // Entregues por mês, do mais recente pro mais antigo.
  const porMes = new Map<string, any[]>();
  deliverables
    .filter((d) => ["aprovado", "entregue", "faturado"].includes(d.status))
    .forEach((d) => {
      const k = (dataDe(d) || "").slice(0, 7) || "sem-data";
      porMes.set(k, [...(porMes.get(k) || []), d]);
    });
  // "sem-data" por último: ordenado como texto ele ganha de "2026-07" e subia
  // pro topo, na frente do mês corrente.
  const meses = [...porMes.entries()].sort((a, b) => {
    if (a[0] === "sem-data") return 1;
    if (b[0] === "sem-data") return -1;
    return b[0].localeCompare(a[0]);
  });
  const rotuloMes = (k: string) => {
    if (k === "sem-data") return "Sem data";
    const [y, m] = k.split("-").map(Number);
    const t = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  const resumo = (data as any).resumo_mes || null;
  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  /** Uma peça. O nome dela em cima; projeto e prazo como legenda. */
  const Peca = ({ d, acoes }: { d: any; acoes?: boolean }) => (
    <div className="rounded-md border border-border/40 bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight text-foreground">{d.titulo}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {nomeProjeto(d.project_id)}
            {dataDe(d) ? ` · ${formatDate(dataDe(d))}` : ""}
            {d.horas ? ` · ${d.horas}h` : ""}
          </p>
        </div>
        <span className={statusChip(d.status)}>{prettyStatus(d.status)}</span>
      </div>

      {d.arquivo_url && (
        <a
          href={d.arquivo_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Assistir no Frame.io
        </a>
      )}

      {acoes && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Seu nome"
              value={aprovador}
              onChange={(e) => setAprovador(e.target.value)}
              className="max-w-[180px]"
            />
            <Button size="sm" variant="outline" onClick={() => setAjusteDe(ajusteDe === d.id ? null : d.id)}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Pedir ajuste
            </Button>
            <Button
              size="sm"
              className="bg-success text-white hover:bg-success/90"
              onClick={() => aprovar.mutate(d.id)}
              disabled={aprovar.isPending}
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Aprovar
            </Button>
          </div>
          {ajusteDe === d.id && (
            <div className="space-y-2 rounded-md border border-border/40 bg-background/50 p-2">
              <Textarea
                rows={2}
                value={ajusteTexto}
                onChange={(e) => setAjusteTexto(e.target.value)}
                placeholder="O que precisa ajustar?"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={() => pedirAjuste.mutate(d.id)} disabled={pedirAjuste.isPending}>
                  Enviar ajuste
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-4">
          <div>
            <LogoAdverse className="h-4 text-foreground" />
            <h1 className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">{client.name}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <Card className="glass-card">
          <CardContent className="grid gap-3 p-5 md:grid-cols-3">
            <Kpi label="Esperando você" value={String(precisaDeVoce.length)} />
            <Kpi label="Em produção" value={String(emProducao.length)} />
            <Kpi label="Entregues" value={String(deliverables.length - precisaDeVoce.length - emProducao.length)} />
          </CardContent>
        </Card>

        {/* Fechamento do mês: só aparece com valor-hora configurado. Sem
            configuração o sistema não inventa número na frente do cliente. */}
        {resumo && (resumo.valor !== null && resumo.valor !== undefined) && (
          <Card className="glass-card">
            <CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Fechamento deste mês
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{fmtBRL(Number(resumo.valor))}</p>
                <p className="text-xs text-muted-foreground">
                  {resumo.horas}h em vídeos finalizados · cobrança no mês que vem
                </p>
              </div>
              <p className="max-w-xs text-[11px] leading-relaxed text-muted-foreground">
                Só entra aqui o que já foi finalizado. O que ainda está em produção conta no fechamento
                do mês em que for entregue.
              </p>
            </CardContent>
          </Card>
        )}

        {precisaDeVoce.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Esperando você · {precisaDeVoce.length}
            </h2>
            <div className="space-y-2">
              {precisaDeVoce.map((d) => <Peca key={d.id} d={d} acoes />)}
            </div>
          </section>
        )}

        {emProducao.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Em produção · {emProducao.length}
            </h2>
            <div className="space-y-2">
              {emProducao.map((d) => <Peca key={d.id} d={d} />)}
            </div>
          </section>
        )}

        {meses.map(([k, lista]) => (
          <section key={k} className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {rotuloMes(k)} · {lista.length} {lista.length === 1 ? "entrega" : "entregas"}
            </h2>
            <div className="space-y-2">
              {lista
                .sort((a, b) => (dataDe(b) || "").localeCompare(dataDe(a) || ""))
                .map((d) => <Peca key={d.id} d={d} />)}
            </div>
          </section>
        ))}

        {deliverables.length === 0 && (
          <Card className="glass-card">
            <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
              Ainda não temos entregas com você. Assim que rolar o kickoff, aparecem aqui.
            </CardContent>
          </Card>
        )}

        <div className="pt-4 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          <Send className="mx-auto mb-1 h-3 w-3" />
          Portal do Cliente
        </div>
        <RodapeConfidencial tema="escuro" />
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
    em_edicao: "bg-primary/15 text-primary",
    revisao_n1: "bg-warning/15 text-warning",
    revisao_n2: "bg-warning/15 text-warning",
    com_cliente: "bg-primary/15 text-primary",
    ajuste_solicitado: "bg-destructive/15 text-destructive",
    aprovado: "bg-success/15 text-success",
    entregue: "bg-success/15 text-success",
  };
  return `rounded-md px-1.5 py-0.5 text-[10px] font-medium ${map[status] || "bg-muted text-muted-foreground"}`;
}
function prettyStatus(s: string) {
  return ENTREGA_LABEL[s] || s.replace("_", " ");
}
