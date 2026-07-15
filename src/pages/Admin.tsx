import { Users, GitBranch, Coins, Settings2, ShieldCheck, Package, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";

type CardDef = {
  href: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: (data: any) => string;
  external?: boolean;
};

export default function Admin() {
  const { isAdmin, isLoading } = usePermissions();

  // Defesa em profundidade: além do guard de rota, a própria página só abre
  // pra admin de verdade (papel). Nunca por concessão.
  if (!isLoading && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">Acesso restrito</h2>
        <p className="mt-1 text-sm text-muted-foreground">Só administradores acessam esta área.</p>
      </div>
    );
  }

  const { data: usuarios = 0 } = useQuery({
    queryKey: ["admin-usuarios-count"],
    queryFn: async () => {
      const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: workflows = 0 } = useQuery({
    queryKey: ["admin-workflows-count"],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("workflows")
        .select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: funcoes = 0 } = useQuery({
    queryKey: ["admin-ratecard-count"],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("rate_card")
        .select("id", { count: "exact", head: true })
        .eq("ativo", true);
      return count ?? 0;
    },
  });

  const cards: CardDef[] = [
    {
      href: "/time",
      title: "Usuários e papéis",
      icon: Users,
      count: () => `${usuarios} usuários · admin/produtor/equipe/edição/cliente`,
    },
    {
      href: "/admin/workflows",
      title: "Workflows e status",
      icon: GitBranch,
      count: () => `${workflows} workflows · status customizáveis`,
    },
    {
      href: "/admin/aprovacoes",
      title: "Aprovações",
      icon: ShieldCheck,
      count: () => "N1 / N2 dos entregáveis + cliente",
    },
    {
      href: "/admin/rate-card",
      title: "Rate card",
      icon: Coins,
      count: () => `${funcoes} funções · preço/hora p/ orçar`,
    },
    {
      href: "/admin/catalogo",
      title: "Catálogo de itens",
      icon: Package,
      count: () => "valor unitário padrão + itens do porte médio",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Settings2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Administração</h1>
          <p className="text-sm text-muted-foreground">
            Configurações estruturais do sistema. Só admin acessa.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.href} to={c.href}>
              <Card className="glass-card group h-full cursor-pointer transition-colors hover:border-primary/40">
                <CardContent className="space-y-3 p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">{c.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{c.count(null)}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
