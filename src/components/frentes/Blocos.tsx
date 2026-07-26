import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Loader2 } from "lucide-react";

/**
 * Blocos das telas de frente (Produção / Comercial / Time).
 *
 * Regra visual, a mesma da Minha mesa: NEUTRO por padrão, cor só quando é
 * exceção. Se todo número tem cor, nenhum número chama atenção — foi
 * exatamente esse o problema que a gente corrigiu na mesa.
 */

/** Número + rótulo. `alerta` pinta só quando o valor merece susto. */
export function Kpi({
  label, valor, hint, href, alerta,
}: {
  label: string; valor: string | number; hint?: string; href?: string; alerta?: boolean;
}) {
  const corpo = (
    <>
      <p className={`font-heading text-2xl font-bold ${alerta ? "text-destructive" : "text-foreground"}`}>{valor}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground/70">{hint}</p>}
    </>
  );
  const cls = `rounded-xl border p-3 transition-colors ${
    alerta ? "border-destructive/30 bg-destructive/5" : "border-border/60 bg-muted/10"
  } ${href ? "hover:border-border hover:bg-muted/25" : ""}`;

  return href ? <Link to={href} className={`block ${cls}`}>{corpo}</Link> : <div className={cls}>{corpo}</div>;
}

export type LinhaFrente = {
  key: string;
  titulo: string;
  meta: string;
  /** Só o que é exceção (atrasado, parado demais) vem marcado. */
  alerta?: boolean;
  /** Valor à direita — dias parado, carga, valor. */
  direita?: string;
  link?: string;
};

/** Lista enxuta: título, contexto numa linha só, valor à direita. */
export function ListaFrente({
  titulo, hint, linhas, vazio, carregando, verTudo,
}: {
  titulo: string; hint?: string; linhas: LinhaFrente[];
  vazio: string; carregando?: boolean; verTudo?: { label: string; href: string };
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
        {linhas.length > 0 && (
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">{linhas.length}</span>
        )}
        {hint && <span className="hidden text-[11px] text-muted-foreground/70 sm:inline">· {hint}</span>}
        {verTudo && (
          <Link to={verTudo.href} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">
            {verTudo.label} →
          </Link>
        )}
      </div>
      <Card className="glass-card overflow-hidden">
        <CardContent className="p-0">
          {carregando ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : linhas.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">{vazio}</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {linhas.map((l) => {
                const dentro = (
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground" title={l.titulo}>{l.titulo}</p>
                      <p className="truncate text-xs text-muted-foreground" title={l.meta}>{l.meta}</p>
                    </div>
                    {l.direita && (
                      <span className={`shrink-0 text-xs ${l.alerta ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                        {l.direita}
                      </span>
                    )}
                    {l.link && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />}
                  </div>
                );
                return (
                  <li key={l.key}>
                    {l.link ? (
                      <Link to={l.link} className="block hover:bg-sidebar-accent/40">{dentro}</Link>
                    ) : dentro}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Cabeçalho padrão das telas de frente. */
export function CabecalhoFrente({ icone: Icone, titulo, sub }: { icone: any; titulo: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icone className="h-6 w-6 text-primary" />
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

/** Dias desde uma data ISO — usado pra "parado há N dias". */
export function diasDesde(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.floor((Date.now() - d) / 86400000);
}
