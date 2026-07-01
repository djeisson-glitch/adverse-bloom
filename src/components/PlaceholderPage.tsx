import { LucideIcon, Construction, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Wave = 0 | 1 | 2 | 3 | 4;

const WAVE_LABELS: Record<Wave, string> = {
  0: "Onda 0 · Redesign visual",
  1: "Onda 1 · Fundação",
  2: "Onda 2 · Comercial",
  3: "Onda 3 · Produção",
  4: "Onda 4 · Operação",
};

type Props = {
  title: string;
  icon: LucideIcon;
  wave: Wave;
  description: string;
  bullets?: string[];
};

export function PlaceholderPage({ title, icon: Icon, wave, description, bullets }: Props) {
  return (
    <div className="mx-auto max-w-4xl py-10">
      <div className="mb-6 flex items-center gap-3">
        <Icon className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      </div>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Construction className="h-4 w-4 text-warning" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Módulo em construção
            </CardTitle>
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
            {WAVE_LABELS[wave]}
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          {bullets && bullets.length > 0 && (
            <ul className="space-y-2">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-xs text-muted-foreground">
            <p>
              Este módulo faz parte da visão de <strong className="text-foreground">Adverse OS Produtora</strong>,
              a virada do sistema em cérebro operacional completo da produtora (comercial, produção, horas e faturamento).
              Acompanhe o roadmap no <a href="/guia" className="text-primary hover:underline">Guia</a>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
