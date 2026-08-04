import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, PackageCheck, Clock, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { fmtDuracao } from "@/lib/duracao";
import { primeiroNome } from "@/lib/pessoa";
import { statusPill, statusLabel } from "@/lib/statusEntregavel";
import { mesISO, primeiroDiaISO } from "@/lib/dataLocal";

/**
 * O que foi entregue no mês — por cliente, por projeto.
 *
 * O sistema sabia responder "quanto o cliente me deve" (Faturamento mensal),
 * mas não "o que a gente fez pra ele em julho". E o Faturamento só enxerga
 * quem tem modelo de cobrança configurado: a SLC Máquinas, com 9h no mês,
 * não aparecia em lugar nenhum.
 *
 * Aqui entra todo mundo. O filtro é o mês e o cliente, e a conta é de
 * entregas e horas — dinheiro só pra quem pode ver, e só quando existe preço.
 */
export default function EntregasDoMes() {
  const { canSeeMoney, canSeeHours } = usePermissions();
  const [ref, setRef] = useState(() => mesISO(-1));
  const [cliente, setCliente] = useState("todos");

  const [ano, mes] = ref.split("-").map(Number);
  const fim = primeiroDiaISO(ano, mes + 1);
  const mesLabel = useMemo(
    () => new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    [ano, mes],
  );

  const { data: clientes = [] } = useQuery({
    queryKey: ["entregas-clientes"],
    queryFn: async () => (await (supabase as any).from("clients").select("id, name").order("name")).data || [],
  });

  const { data: dados, isLoading } = useQuery({
    queryKey: ["entregas-do-mes", ref],
    queryFn: async () => {
      const [ent, proj, prof, hrs] = await Promise.all([
        (supabase as any).from("deliverables")
          .select("id, titulo, codigo, status, data_entrega, project_id, responsavel_id, tipo_cobranca, cobranca_percent")
          .gte("data_entrega", ref).lt("data_entrega", fim)
          .order("data_entrega"),
        (supabase as any).from("projects").select("id, numero, name, client_id, faturamento"),
        (supabase as any).from("profiles").select("id, full_name, avatar_url"),
        (supabase as any).from("time_entries").select("deliverable_id, duration_min")
          .not("deliverable_id", "is", null),
      ]);
      const minutos = new Map<string, number>();
      for (const t of hrs.data || []) {
        minutos.set(t.deliverable_id, (minutos.get(t.deliverable_id) || 0) + (t.duration_min || 0));
      }
      return {
        entregas: (ent.data || []) as any[],
        projetos: new Map<string, any>((proj.data || []).map((p: any) => [p.id, p])),
        pessoas: new Map<string, string>((prof.data || []).map((p: any) => [p.id, p.full_name])),
        minutos,
      };
    },
  });

  // Agrupa por cliente → projeto. O cliente vem do projeto: entrega solta
  // sem projeto não existe no sistema.
  const grupos = useMemo(() => {
    if (!dados) return [];
    const porCliente = new Map<string, { nome: string; projetos: Map<string, any> }>();
    for (const e of dados.entregas) {
      const p = dados.projetos.get(e.project_id);
      if (!p) continue;
      const cid = p.client_id || "sem-cliente";
      if (cliente !== "todos" && cid !== cliente) continue;
      const nomeCli = clientes.find((c: any) => c.id === cid)?.name || "Sem cliente";
      if (!porCliente.has(cid)) porCliente.set(cid, { nome: nomeCli, projetos: new Map() });
      const g = porCliente.get(cid)!;
      if (!g.projetos.has(p.id)) g.projetos.set(p.id, { projeto: p, entregas: [] });
      g.projetos.get(p.id).entregas.push(e);
    }
    return [...porCliente.entries()]
      .map(([id, g]) => {
        const projetos = [...g.projetos.values()].sort((a, b) => a.projeto.name.localeCompare(b.projeto.name));
        const entregas = projetos.reduce((s, p) => s + p.entregas.length, 0);
        const min = projetos.reduce(
          (s, p) => s + p.entregas.reduce((t: number, e: any) => t + (dados.minutos.get(e.id) || 0), 0), 0);
        return { id, nome: g.nome, projetos, entregas, minutos: min };
      })
      .sort((a, b) => b.entregas - a.entregas);
  }, [dados, cliente, clientes]);

  const totalEntregas = grupos.reduce((s, g) => s + g.entregas, 0);
  const totalMin = grupos.reduce((s, g) => s + g.minutos, 0);

  const andarMes = (n: number) => setRef(primeiroDiaISO(ano, mes + n));

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <div className="flex items-center gap-3">
        <PackageCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Entregas do mês</h1>
          <p className="text-sm text-muted-foreground">
            O que saiu para cada cliente, por projeto. Entram todos — inclusive quem não tem
            cobrança configurada.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => andarMes(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-[190px] text-center">
            <p className="text-sm font-semibold capitalize text-foreground">{mesLabel}</p>
            <p className="text-xs text-muted-foreground">
              {totalEntregas} entrega{totalEntregas === 1 ? "" : "s"}
              {canSeeHours && totalMin > 0 && ` · ${fmtDuracao(totalMin)}`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => andarMes(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>

        <Select value={cliente} onValueChange={setCliente}>
          <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os clientes</SelectItem>
            {clientes.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : grupos.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center gap-1 py-14 text-center">
            <PackageCheck className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Nenhuma entrega com data em <span className="capitalize">{mesLabel}</span>.
            </p>
            <p className="text-[11px] text-muted-foreground">
              A conta é pela data de entrega da peça — peça sem data não aparece aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        grupos.map((g) => (
          <Card key={g.id} className="glass-card">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/40 pb-2">
                <h2 className="text-base font-semibold text-foreground">{g.nome}</h2>
                <span className="text-xs text-muted-foreground">
                  {g.entregas} entrega{g.entregas === 1 ? "" : "s"} · {g.projetos.length} projeto{g.projetos.length === 1 ? "" : "s"}
                  {canSeeHours && g.minutos > 0 && ` · ${fmtDuracao(g.minutos)}`}
                </span>
              </div>

              {g.projetos.map(({ projeto, entregas }: any) => (
                <div key={projeto.id} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/projetos/${projeto.id}`} className="truncate text-sm font-medium text-foreground hover:text-primary">
                      {projeto.name}
                    </Link>
                    {projeto.faturamento === "avulso" && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-warning">avulso</span>
                    )}
                  </div>
                  {entregas.map((e: any) => {
                    const min = dados!.minutos.get(e.id) || 0;
                    const meia = Number(e.cobranca_percent ?? 100) !== 100;
                    return (
                      <div key={e.id} className="flex flex-wrap items-center gap-2 pl-3 text-xs">
                        <span className="w-12 shrink-0 font-mono text-[10px] text-muted-foreground">
                          {(e.data_entrega || "").slice(8, 10)}/{(e.data_entrega || "").slice(5, 7)}
                        </span>
                        <Link to={`/projetos/${projeto.id}/entregaveis/${e.id}`} className="min-w-0 flex-1 truncate text-muted-foreground hover:text-foreground">
                          {e.titulo}
                        </Link>
                        {e.responsavel_id && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {primeiroNome(dados!.pessoas.get(e.responsavel_id))}
                          </span>
                        )}
                        {canSeeHours && min > 0 && (
                          <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
                            <Clock className="h-3 w-3" />{fmtDuracao(min)}
                          </span>
                        )}
                        {/* O tipo e a proporção são de cobrança: só pra quem
                            enxerga dinheiro. Pro resto, a linha é entrega. */}
                        {canSeeMoney && e.tipo_cobranca && (
                          <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${meia ? "border-warning/40 text-warning" : "border-border/50 text-muted-foreground"}`}>
                            {e.tipo_cobranca}{meia ? ` · ${Number(e.cobranca_percent)}%` : ""}
                          </span>
                        )}
                        <Badge variant="outline" className={`shrink-0 text-[10px] ${statusPill(e.status)}`}>
                          {statusLabel(e.status)}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      {canSeeMoney && grupos.length > 0 && (
        <p className="px-1 text-[11px] text-muted-foreground">
          Quanto isso vira de fatura está em{" "}
          <Link to="/faturamento-mensal" className="text-primary hover:underline">Faturamento mensal</Link> —
          aqui é o que foi feito, lá é o que se cobra.
        </p>
      )}
    </div>
  );
}
