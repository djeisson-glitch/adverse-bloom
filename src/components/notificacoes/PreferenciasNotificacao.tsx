import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, SlidersHorizontal, Moon, Clock, ChevronDown } from "lucide-react";
import {
  useTiposNotif, useMinhasPrefs, modoEfetivo, ROTULO_GRUPO, ROTULO_NIVEL, type Modo,
} from "@/hooks/useNotifPrefs";
import { SeletorModo } from "./SeletorModo";

/** Horários que fazem sentido oferecer pro resumo (hora cheia, horário comercial). */
const HORAS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

/** Períodos do "não perturbe" — em minutos, ou 'fim_do_dia'. */
const PERIODOS: { label: string; minutos: number | "fim_do_dia" }[] = [
  { label: "1 hora", minutos: 60 },
  { label: "2 horas", minutos: 120 },
  { label: "4 horas", minutos: 240 },
  { label: "Até amanhã", minutos: "fim_do_dia" },
];

export function PreferenciasNotificacao() {
  const { data: tipos = [], isLoading } = useTiposNotif();
  const { prefs, config, salvarModo, salvarConfig } = useMinhasPrefs();
  const [aberto, setAberto] = useState(false);

  const horas: number[] = config.data?.digest_horas || [9, 14, 17];
  const dndAte: string | null = config.data?.dnd_ate || null;
  const dndAtivo = !!dndAte && new Date(dndAte) > new Date();

  const alternarHora = (h: number) => {
    const novo = horas.includes(h) ? horas.filter((x) => x !== h) : [...horas, h].sort((a, b) => a - b);
    salvarConfig.mutate({ digest_horas: novo });
  };

  const ligarDnd = (p: (typeof PERIODOS)[number]) => {
    const ate = new Date();
    if (p.minutos === "fim_do_dia") {
      ate.setDate(ate.getDate() + 1);
      ate.setHours(8, 0, 0, 0);
    } else {
      ate.setMinutes(ate.getMinutes() + p.minutos);
    }
    salvarConfig.mutate({ dnd_ate: ate.toISOString() });
  };

  // Tipos agrupados por área, na ordem do catálogo.
  const grupos = new Map<string, typeof tipos>();
  for (const t of tipos) {
    const l = grupos.get(t.grupo) || [];
    l.push(t);
    grupos.set(t.grupo, l);
  }

  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 p-4">
        {/* Não perturbe — o botão que resolve "estou editando, me deixa em paz" */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Moon className={`mt-0.5 h-4 w-4 shrink-0 ${dndAtivo ? "text-primary" : "text-muted-foreground"}`} />
            <div>
              <p className="text-sm font-medium text-foreground">Não perturbe</p>
              <p className="text-xs text-muted-foreground">
                {dndAtivo
                  ? `Silenciado até ${new Date(dndAte!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} — o que é urgente continua passando.`
                  : "Silencia os resumos por um tempo. O que é na hora (alteração do cliente, prazo vencendo) passa mesmo assim."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {dndAtivo ? (
              <Button size="sm" variant="outline" onClick={() => salvarConfig.mutate({ limpar_dnd: true })}>
                Voltar a receber
              </Button>
            ) : (
              PERIODOS.map((p) => (
                <Button key={p.label} size="sm" variant="outline" className="h-7 text-xs" onClick={() => ligarDnd(p)}>
                  {p.label}
                </Button>
              ))
            )}
          </div>
        </div>

        {/* Horários do resumo */}
        <div className="border-t border-border/40 pt-3">
          <div className="mb-2 flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Horários do resumo</p>
              <p className="text-xs text-muted-foreground">
                O que não é urgente se acumula e chega junto nestes horários, em vez de pingar o dia inteiro.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {HORAS.map((h) => {
              const on = horas.includes(h);
              return (
                <button
                  key={h}
                  onClick={() => alternarHora(h)}
                  className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                    on ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {String(h).padStart(2, "0")}h
                </button>
              );
            })}
          </div>
          {horas.length === 0 && (
            <p className="mt-1.5 text-[11px] text-warning">
              Sem nenhum horário, o que não é urgente fica só no sino — nunca vira push.
            </p>
          )}
        </div>

        {/* Por tipo */}
        <div className="border-t border-border/40 pt-3">
          <button
            onClick={() => setAberto((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">O que você quer receber</p>
              <p className="text-xs text-muted-foreground">Liga e desliga cada tipo de aviso.</p>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
          </button>

          {aberto && (
            isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : (
              <div className="mt-3 space-y-4">
                {[...grupos.entries()].map(([grupo, lista]) => (
                  <div key={grupo} className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {ROTULO_GRUPO[grupo] || grupo}
                    </p>
                    {lista.map((t) => (
                      <div
                        key={t.tipo}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/40 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground">
                            {t.rotulo}
                            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                              {ROTULO_NIVEL[t.nivel_padrao]}
                            </span>
                          </p>
                          {t.descricao && <p className="text-[11px] text-muted-foreground">{t.descricao}</p>}
                        </div>
                        <SeletorModo
                          nivel={t.nivel_padrao}
                          valor={modoEfetivo(t, prefs.data?.[t.tipo] as Modo | undefined)}
                          onChange={(modo) => salvarModo.mutate({ tipo: t.tipo, modo })}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
