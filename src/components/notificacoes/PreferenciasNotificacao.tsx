import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, SlidersHorizontal, ChevronDown, Clock } from "lucide-react";
import {
  useTiposNotif, useMinhasPrefs, useHorasResumo, modoEfetivo,
  ROTULO_GRUPO, ROTULO_NIVEL, type Modo,
} from "@/hooks/useNotifPrefs";
import { SeletorModo } from "./SeletorModo";

/**
 * O que ESTA pessoa recebe.
 *
 * Só isso — o horário do resumo é decidido pela gestão e aparece aqui como
 * informação, não como escolha. Não existe "não perturbe": quem define o que
 * pode interromper é a classificação do evento, não um botão de silêncio que
 * deixaria a pessoa perder alteração de cliente sem perceber.
 */
export function PreferenciasNotificacao() {
  const { data: tipos = [], isLoading } = useTiposNotif();
  const { prefs, salvarModo } = useMinhasPrefs();
  const { data: horas = [] } = useHorasResumo();
  const [aberto, setAberto] = useState(false);

  // Tipos agrupados por área, na ordem do catálogo.
  const grupos = new Map<string, typeof tipos>();
  for (const t of tipos) {
    const l = grupos.get(t.grupo) || [];
    l.push(t);
    grupos.set(t.grupo, l);
  }

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-4">
        {horas.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            O que não é urgente se acumula e chega junto às{" "}
            <strong className="text-foreground">
              {horas.map((h) => `${String(h).padStart(2, "0")}h`).join(", ")}
            </strong>
            , em vez de pingar o dia inteiro.
          </p>
        )}

        <button onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-2 text-left">
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
            <div className="space-y-4 border-t border-border/40 pt-3">
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
      </CardContent>
    </Card>
  );
}
