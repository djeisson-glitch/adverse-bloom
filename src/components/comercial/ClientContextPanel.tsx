import { useMemo } from "react";
import { useDeals } from "@/hooks/useDeals";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Clock, Activity } from "lucide-react";

interface Props {
  clientId: string;
}

export function ClientContextPanel({ clientId }: Props) {
  const { deals } = useDeals();

  const projectsQuery = useQuery({
    queryKey: ["projects-client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const stats = useMemo(() => {
    const clientDeals = deals.filter((d) => d.client_id === clientId);
    const wonDeals = clientDeals.filter((d) => d.stage === "fechamento");
    const lostDeals = clientDeals.filter((d) => d.stage === "perdido");
    const projects = projectsQuery.data || [];

    const ltv = wonDeals.reduce((s, d) => s + (d.approved_value ?? d.value ?? 0), 0);
    const lostValue = lostDeals.reduce((s, d) => s + (d.approved_value ?? d.value ?? 0), 0);
    const ticketMedio = wonDeals.length > 0 ? ltv / wonDeals.length : 0;
    const lastProject = projects[0];

    // Health: green = 3+ won deals & no recent losses, yellow = 1-2 won, red = more lost than won
    let health: "green" | "yellow" | "red" = "yellow";
    if (wonDeals.length >= 3 && lostDeals.length < wonDeals.length) health = "green";
    else if (lostDeals.length > wonDeals.length) health = "red";
    else if (wonDeals.length === 0 && lostDeals.length > 0) health = "red";

    return { ltv, lostValue, ticketMedio, lastProject, wonCount: wonDeals.length, lostCount: lostDeals.length, totalDeals: clientDeals.length, health };
  }, [deals, clientId, projectsQuery.data]);

  if (stats.totalDeals === 0) return null;

  const healthConfig = {
    green: { label: "Recorrente", color: "bg-green-500/20 text-success", dot: "bg-success" },
    yellow: { label: "Em desenvolvimento", color: "bg-amber-500/20 text-warning", dot: "bg-warning" },
    red: { label: "Atenção", color: "bg-red-500/20 text-destructive", dot: "bg-destructive" },
  };

  const h = healthConfig[stats.health];

  return (
    <Card className="bg-secondary/30 border-border/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Histórico do Cliente</p>
          <Badge variant="outline" className={`text-[10px] ${h.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${h.dot} mr-1`} />
            {h.label}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 text-primary shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">LTV</p>
              <p className="text-xs font-semibold text-primary">{formatCurrency(stats.ltv)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Ticket médio</p>
              <p className="text-xs font-semibold">{formatCurrency(stats.ticketMedio)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-success shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Ganhos / Perdidos</p>
              <p className="text-xs font-semibold">
                <span className="text-success">{stats.wonCount}</span>
                {" / "}
                <span className="text-destructive">{stats.lostCount}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Último projeto</p>
              <p className="text-xs font-semibold truncate">
                {stats.lastProject
                  ? new Date(stats.lastProject.created_at).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
