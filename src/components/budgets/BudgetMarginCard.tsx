import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { Budget } from "@/hooks/useBudgets";

export function BudgetMarginCard() {
  const navigate = useNavigate();

  const { data: budgets = [] } = useQuery({
    queryKey: ["budgets-approved"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("status", "approved")
        .order("margin_percent", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as Budget[];
    },
  });

  if (budgets.length === 0) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Margem Bruta por Projeto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {budgets.map((b) => (
          <div key={b.id} className="flex items-center justify-between text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{b.project_name}</p>
              <p className="text-xs text-muted-foreground truncate">{b.client_name}</p>
            </div>
            <div className="text-right ml-3">
              <p className="font-semibold">{formatCurrency(b.total_value)}</p>
              <p
                className={`text-xs font-medium ${
                  b.margin_percent >= 20
                    ? "text-[hsl(var(--success))]"
                    : b.margin_percent >= 10
                    ? "text-[hsl(var(--warning))]"
                    : "text-destructive"
                }`}
              >
                {formatPercent(b.margin_percent)}
              </p>
            </div>
          </div>
        ))}
        <Button variant="link" className="p-0 h-auto text-xs" onClick={() => navigate("/orcamentos")}>
          Ver todos os orçamentos →
        </Button>
      </CardContent>
    </Card>
  );
}
