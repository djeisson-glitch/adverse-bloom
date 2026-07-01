import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Gauge, Coffee, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type Row = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  capacidade: number;
  horas_apontadas: number;
  horas_faturaveis: number;
  ocupacao_percent: number;
};

export default function Capacidade() {
  const { canSeeMoney } = usePermissions();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["capacidade-semana"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("v_capacidade_semana").select("*");
      if (error) throw error;
      return data as Row[];
    },
  });

  const totais = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        capacidade: acc.capacidade + Number(r.capacidade || 0),
        apontadas: acc.apontadas + Number(r.horas_apontadas || 0),
        faturaveis: acc.faturaveis + Number(r.horas_faturaveis || 0),
      }),
      { capacidade: 0, apontadas: 0, faturaveis: 0 },
    );
  }, [rows]);

  const ocupacao = totais.capacidade > 0 ? (totais.faturaveis / totais.capacidade) * 100 : 0;
  const livres = Math.max(0, totais.capacidade - totais.faturaveis);
  const ociosos = rows.filter((r) => (Number(r.ocupacao_percent) || 0) < 60);

  if (!canSeeMoney) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center text-sm text-muted-foreground">
        Só admin e produtor têm acesso à Capacidade.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Gauge className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Capacidade & Ocupação
          </h1>
          <p className="text-sm text-muted-foreground">Esta semana · alvo saudável 75–85%.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Capacidade" value={`${totais.capacidade}h`} hint="horas faturáveis" tone="primary" />
        <Kpi
          label="Apontado (faturável)"
          value={`${totais.faturaveis.toFixed(1)}h`}
          hint={`${totais.apontadas.toFixed(1)}h no total`}
          tone="success"
        />
        <Kpi
          label="Ocupação"
          value={`${ocupacao.toFixed(0)}%`}
          hint="alvo 75–85%"
          tone={ocupacao >= 75 && ocupacao <= 85 ? "success" : ocupacao < 75 ? "warning" : "destructive"}
        />
        <Kpi label="Horas livres" value={`${livres.toFixed(1)}h`} hint="p/ novos projetos" tone="primary" />
      </div>

      {ociosos.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <Coffee className="h-4 w-4 text-warning" />
            <span>
              <strong>{ociosos.length}</strong> ocioso(s) (&lt;60%) — considere realocar ou vender mais horas.
            </span>
          </CardContent>
        </Card>
      )}

      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_1fr_100px_120px] items-center gap-2 border-b border-border/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Pessoa</span>
            <span>Ocupação</span>
            <span className="text-right">Faturável / Cap.</span>
            <span />
          </div>
          {isLoading ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Ainda sem horas apontadas no período. A ocupação se preenche conforme o time usa o <strong>timer</strong> ou lança horas.
            </div>
          ) : (
            rows.map((r) => <CapRow key={r.user_id} row={r} />)
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Ocupação = horas faturáveis apontadas ÷ capacidade do período (horas/semana). Ajuste as horas/semana em Admin → Usuários.
      </p>
    </div>
  );
}

function CapRow({ row }: { row: Row }) {
  const name = row.full_name || row.email || "—";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const oc = Number(row.ocupacao_percent) || 0;
  const tone = oc >= 75 && oc <= 85 ? "bg-success" : oc < 60 ? "bg-warning" : oc > 100 ? "bg-destructive" : "bg-primary";

  return (
    <div className="grid grid-cols-[1fr_1fr_100px_120px] items-center gap-2 border-b border-border/40 px-5 py-3 text-sm last:border-0">
      <div className="flex items-center gap-2">
        <Avatar className="h-6 w-6">
          <AvatarFallback className="bg-primary/15 text-[10px] text-primary">{initials}</AvatarFallback>
        </Avatar>
        <span className="truncate text-foreground">{name}</span>
      </div>
      <div className="h-2 flex-1 rounded-full bg-muted/40">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, oc)}%` }} />
      </div>
      <span className="text-right text-xs">{oc.toFixed(0)}%</span>
      <span className="text-right text-xs text-muted-foreground">
        {Number(row.horas_faturaveis).toFixed(1)}h / {row.capacidade}h
      </span>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "primary" | "success" | "warning" | "destructive";
}) {
  const cls =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "destructive"
          ? "text-destructive"
          : "text-primary";
  return (
    <Card className="glass-card">
      <CardContent className="space-y-1 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold ${cls}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
