import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Gauge, Coffee, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PessoaAvatar } from "@/components/PessoaAvatar";

type Row = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  capacidade: number;
  horas_apontadas: number;
  horas_faturaveis: number;
  horas_diarias: number;   // diárias de gravação da semana (dia cheio bloqueado)
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

  /**
   * COMPROMISSO: horas estimadas das peças abertas de cada um.
   *
   * A view de capacidade só enxergava o PASSADO (hora já apontada na semana
   * corrente). Numa segunda-feira isso dá 0% e "todo mundo ocioso", o que é
   * tecnicamente verdade e praticamente um alarme falso. O compromisso é o
   * futuro: o que a pessoa tem pra fazer e ainda não fez.
   */
  // A view de capacidade não carrega foto; o mapa vem dos profiles.
  const { data: fotos = new Map<string, string>() } = useQuery({
    queryKey: ["capacidade-fotos"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("id, avatar_url");
      return new Map<string, string>((data || []).map((p: any) => [p.id, p.avatar_url]));
    },
  });

  const { data: compromisso = [] } = useQuery({
    queryKey: ["capacidade-compromisso"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("v_compromisso_pessoa").select("*");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
  const porPessoa = useMemo(() => {
    const m: Record<string, { horas: number; pecas: number; sem: number }> = {};
    for (const c of compromisso) {
      m[c.user_id] = {
        horas: Number(c.horas_a_fazer || 0),
        pecas: Number(c.pecas_abertas || 0),
        sem: Number(c.pecas_sem_estimativa || 0),
      };
    }
    return m;
  }, [compromisso]);
  const semEstimativa = compromisso.reduce((s, c) => s + Number(c.pecas_sem_estimativa || 0), 0);

  const totais = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        capacidade: acc.capacidade + Number(r.capacidade || 0),
        apontadas: acc.apontadas + Number(r.horas_apontadas || 0),
        faturaveis: acc.faturaveis + Number(r.horas_faturaveis || 0),
        diarias: acc.diarias + Number(r.horas_diarias || 0),
      }),
      { capacidade: 0, apontadas: 0, faturaveis: 0, diarias: 0 },
    );
  }, [rows]);

  // Diárias de gravação também ocupam o dia da pessoa — entram na ocupação.
  const ocupado = totais.faturaveis + totais.diarias;
  const ocupacao = totais.capacidade > 0 ? (ocupado / totais.capacidade) * 100 : 0;
  const livres = Math.max(0, totais.capacidade - ocupado);
  const ociosos = rows.filter((r) => (Number(r.ocupacao_percent) || 0) < 60);

  if (!canSeeMoney) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center text-sm text-muted-foreground">
        Disponível só para quem tem acesso ao financeiro à Capacidade.
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
          label="Ocupado"
          value={`${ocupado.toFixed(1)}h`}
          hint={totais.diarias > 0
            ? `${totais.faturaveis.toFixed(1)}h faturável + ${totais.diarias.toFixed(1)}h diárias`
            : `${totais.apontadas.toFixed(1)}h apontadas`}
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

      {/* "Ocioso" só faz sentido depois que a semana andou. Numa segunda de
          manhã ninguém apontou nada e o aviso acusava o time inteiro de
          ocioso — alarme falso. Agora ele espera a semana ter alguma hora. */}
      {ociosos.length > 0 && totais.apontadas > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <Coffee className="h-4 w-4 text-warning" />
            <span>
              <strong>{ociosos.length}</strong> ocioso(s) (&lt;60%) — considere realocar ou vender mais horas.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Sem estimativa, o compromisso é subestimado — e a tela mentiria por
          omissão. Melhor dizer quantas peças ainda não foram estimadas. */}
      {semEstimativa > 0 && (
        <Card className="border-border/60 bg-muted/20">
          <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
            <span className="text-muted-foreground">
              <strong className="text-foreground">{semEstimativa}</strong> peça(s) aberta(s) ainda{" "}
              <strong className="text-foreground">sem horas estimadas</strong> — o compromisso abaixo está
              incompleto até alguém estimar.
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
            <span className="text-right">A fazer</span>
          </div>
          {isLoading ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Ainda sem horas apontadas no período. A ocupação se preenche conforme o time usa o <strong>timer</strong> ou lança horas.
            </div>
          ) : (
            rows.map((r) => <CapRow key={r.user_id} row={r} compromisso={porPessoa[r.user_id]} foto={fotos.get(r.user_id)} />)
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Ocupação = (horas faturáveis apontadas + diárias de gravação da semana) ÷ capacidade do período. Cada diária bloqueia um dia cheio (🎥). Ajuste as horas/semana em Admin → Usuários.
      </p>
    </div>
  );
}

function CapRow({ row, compromisso, foto }: { row: Row; compromisso?: { horas: number; pecas: number; sem: number }; foto?: string }) {
  const name = row.full_name || row.email || "—";
  const oc = Number(row.ocupacao_percent) || 0;
  const tone = oc >= 75 && oc <= 85 ? "bg-success" : oc < 60 ? "bg-warning" : oc > 100 ? "bg-destructive" : "bg-primary";

  return (
    <div className="grid grid-cols-[1fr_1fr_100px_120px] items-center gap-2 border-b border-border/40 px-5 py-3 text-sm last:border-0">
      <div className="flex items-center gap-2">
        <PessoaAvatar nome={name} foto={foto} seed={row.user_id} tamanho={24} />
        <span className="truncate text-foreground">{name}</span>
      </div>
      <div className="h-2 flex-1 rounded-full bg-muted/40">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, oc)}%` }} />
      </div>
      <span className="text-right text-xs">{oc.toFixed(0)}%</span>
      <span className="text-right text-xs text-muted-foreground">
        {(Number(row.horas_faturaveis) + Number(row.horas_diarias || 0)).toFixed(1)}h / {row.capacidade}h
        {Number(row.horas_diarias) > 0 && (
          <span className="ml-1 text-warning" title="inclui diárias de gravação">🎥</span>
        )}
      </span>
      {/* A fazer = estimativa das peças abertas menos o que já foi feito
          nelas. É o compromisso pra frente, não o histórico da semana. */}
      <span
        className="text-right text-xs"
        title={compromisso ? `${compromisso.pecas} peça(s) aberta(s)${compromisso.sem > 0 ? ` · ${compromisso.sem} sem estimativa` : ""}` : "nenhuma peça aberta"}
      >
        {compromisso && compromisso.horas > 0 ? (
          <span className={compromisso.horas > Number(row.capacidade) ? "font-medium text-destructive" : "text-foreground"}>
            {compromisso.horas.toFixed(1)}h
          </span>
        ) : compromisso && compromisso.sem > 0 ? (
          <span className="text-muted-foreground/60" title={`${compromisso.sem} peça(s) sem estimativa`}>
            ? · {compromisso.pecas}
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
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
