import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface BudgetBalance {
  id: string;
  project_name: string;
  client_name: string;
  capture_days: number;
  allocated_days: number;
}

export function CaptureDaysBalance() {
  const { data: balances = [] } = useQuery({
    queryKey: ["capture_days_balance"],
    queryFn: async () => {
      // Get approved budgets with capture_days
      const { data: budgets, error } = await (supabase as any)
        .from("budgets")
        .select("id, project_name, client_name, capture_days")
        .eq("status", "approved")
        .gt("capture_days", 0)
        .eq("is_latest_version", true)
        .order("project_name");
      if (error) throw error;

      // Get allocation counts per budget
      const { data: allocations, error: err2 } = await (supabase as any)
        .from("job_allocations")
        .select("budget_id, allocation_date");
      if (err2) throw err2;

      // Count unique dates per budget as allocated days
      const allocMap: Record<string, Set<string>> = {};
      for (const a of allocations || []) {
        if (!allocMap[a.budget_id]) allocMap[a.budget_id] = new Set();
        allocMap[a.budget_id].add(a.allocation_date);
      }

      return (budgets as any[]).map((b) => ({
        id: b.id,
        project_name: b.project_name,
        client_name: b.client_name,
        capture_days: b.capture_days,
        allocated_days: allocMap[b.id]?.size || 0,
      })) as BudgetBalance[];
    },
  });

  if (balances.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Saldo de Diárias de Captação</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {balances.map((b) => {
          const remaining = b.capture_days - b.allocated_days;
          return (
            <div key={b.id} className="flex items-center justify-between text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{b.project_name}</p>
                <p className="text-xs text-muted-foreground truncate">{b.client_name}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {b.allocated_days}/{b.capture_days}
                </span>
                <Badge variant={remaining <= 0 ? "secondary" : remaining <= 1 ? "destructive" : "default"} className="text-xs">
                  {remaining > 0 ? `${remaining} restante${remaining > 1 ? "s" : ""}` : "Completo"}
                </Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
