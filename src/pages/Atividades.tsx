import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { History, Plus, Trash2, RefreshCw, Loader2 } from "lucide-react";

type Atividade = {
  id: string;
  user_id: string | null;
  acao: "criou" | "atualizou" | "removeu" | string;
  entidade: string;
  entidade_id: string | null;
  rotulo: string | null;
  detalhe: any;
  created_at: string;
};

const ACAO_META: Record<string, { icon: any; cls: string }> = {
  criou:     { icon: Plus,      cls: "text-success bg-emerald-500/10" },
  atualizou: { icon: RefreshCw, cls: "text-info bg-blue-500/10" },
  removeu:   { icon: Trash2,    cls: "text-destructive bg-destructive/10" },
};

/**
 * Log geral (auditoria) — tudo que foi feito no sistema: quem criou, mudou o
 * status ou removeu cada projeto, orçamento, entregável, aviso, etc. Alimentado
 * pelos triggers no banco. Só gestão vê (RLS + gate aqui).
 */
export default function Atividades() {
  const { isAdmin, isProdutor, isCoordenadora } = usePermissions();
  const pode = isAdmin || isProdutor || isCoordenadora;

  const { data: atividades = [], isLoading } = useQuery({
    queryKey: ["atividades"],
    enabled: pode,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("atividades")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as Atividade[];
    },
    refetchInterval: 30000,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-basic"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("id, full_name, email, avatar_url");
      return (data as any[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const nomeDe = (uid: string | null) => {
    if (!uid) return "Sistema";
    const p = profiles.find((x: any) => x.id === uid);
    return p?.full_name?.split(" ")[0] || p?.email?.split("@")[0] || "Alguém";
  };

  // Agrupa por dia (hoje / ontem / data).
  const porDia = useMemo(() => {
    const grupos: { dia: string; itens: Atividade[] }[] = [];
    const rotuloDia = (iso: string) => {
      const d = new Date(iso);
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const dd = new Date(d); dd.setHours(0, 0, 0, 0);
      const difDias = Math.round((hoje.getTime() - dd.getTime()) / 86400000);
      if (difDias === 0) return "Hoje";
      if (difDias === 1) return "Ontem";
      return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
    };
    for (const a of atividades) {
      const dia = rotuloDia(a.created_at);
      const g = grupos[grupos.length - 1];
      if (g && g.dia === dia) g.itens.push(a);
      else grupos.push({ dia, itens: [a] });
    }
    return grupos;
  }, [atividades]);

  if (!pode) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center text-sm text-muted-foreground">
        O log geral é visível só para a gestão.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-6">
      <div className="flex items-center gap-3">
        <History className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Log geral</h1>
          <p className="text-sm text-muted-foreground">
            Tudo que foi feito no sistema — criações, mudanças de status e remoções.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : atividades.length === 0 ? (
        <Card className="glass-card"><CardContent className="py-16 text-center text-sm text-muted-foreground">
          Ainda sem atividade registrada. A partir de agora, tudo que acontecer aparece aqui.
        </CardContent></Card>
      ) : (
        porDia.map((g) => (
          <div key={g.dia} className="space-y-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.dia}</p>
            <Card className="glass-card">
              <CardContent className="p-0">
                <ul className="divide-y divide-border/40">
                  {g.itens.map((a) => <Linha key={a.id} a={a} nome={nomeDe(a.user_id)} />)}
                </ul>
              </CardContent>
            </Card>
          </div>
        ))
      )}
    </div>
  );
}

function Linha({ a, nome }: { a: Atividade; nome: string }) {
  const meta = ACAO_META[a.acao] || ACAO_META.atualizou;
  const Icon = meta.icon;
  const status = a.detalhe?.status || a.detalhe?.stage;
  const hora = new Date(a.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${meta.cls}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">
          <span className="font-medium">{nome}</span>{" "}
          <span className="text-muted-foreground">{a.acao}</span>{" "}
          {a.entidade}
          {a.rotulo && <span className="font-medium"> “{a.rotulo}”</span>}
          {status && (
            <span className="text-muted-foreground"> · {status.de || "—"} → <span className="text-foreground">{status.para || "—"}</span></span>
          )}
        </p>
      </div>
      <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{hora}</span>
    </li>
  );
}
