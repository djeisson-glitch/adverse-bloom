import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, BellRing, Users, Zap, Clock, Bell } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useTiposNotif, useMatrizNotif, useHorasResumo, useSalvarHorasResumo,
  ROTULO_GRUPO, ROTULO_NIVEL, type Modo,
} from "@/hooks/useNotifPrefs";
import { SeletorModo } from "@/components/notificacoes/SeletorModo";

/** Horas oferecidas pro resumo — hora cheia, dentro do expediente. */
const HORAS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

/**
 * Painel de notificação por pessoa.
 *
 * O problema que ele resolve: o time reclamava de excesso, mas o volume certo
 * é diferente pra cada função — a coordenadora precisa saber de tudo do
 * comercial, o editor não. Em vez de escolher um meio-termo que não serve pra
 * ninguém, aqui o admin ajusta por pessoa.
 */
export default function AdminNotificacoes() {
  const { isAdmin } = usePermissions();   // já inclui manager
  const { data: tipos = [], isLoading: carregandoTipos } = useTiposNotif();
  const { matriz, salvar } = useMatrizNotif();
  const { data: horas = [] } = useHorasResumo();
  const salvarHoras = useSalvarHorasResumo();
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const pessoas = matriz.data || [];
  const pessoa = useMemo(
    () => pessoas.find((p) => p.user_id === selecionado) || pessoas[0],
    [pessoas, selecionado],
  );

  // Tipos agrupados por área, na ordem do catálogo.
  const porGrupo = useMemo(() => {
    const m = new Map<string, typeof tipos>();
    for (const t of tipos) {
      const l = m.get(t.grupo) || [];
      l.push(t);
      m.set(t.grupo, l);
    }
    return [...m.entries()];
  }, [tipos]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-sm text-muted-foreground">Esta tela é da gestão.</p>
      </div>
    );
  }

  const carregando = carregandoTipos || matriz.isLoading;

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <div className="flex items-center gap-3">
        <BellRing className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Notificações do time</h1>
          <p className="text-sm text-muted-foreground">
            Escolha, por pessoa, o que cada uma recebe — quem precisa de mais, e quem precisa de menos.
          </p>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 p-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> <strong className="text-foreground">Na hora</strong> — interrompe, mesmo com o sistema fechado</span>
          <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary" /> <strong className="text-foreground">No resumo</strong> — junta e chega nos horários combinados</span>
          <span className="flex items-center gap-1.5"><Bell className="h-3.5 w-3.5 text-info" /> <strong className="text-foreground">Só no sino</strong> — fica na central, sem interromper</span>
        </CardContent>
      </Card>

      {/* Horários do resumo — decisão da gestão, vale pro sistema inteiro. */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="mb-2 flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Horários do resumo</p>
              <p className="text-xs text-muted-foreground">
                Tudo que é <strong className="text-foreground">no resumo</strong> se acumula e sai nestes horários,
                num aviso só por pessoa. Vale pro time inteiro — ninguém escolhe o seu.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {HORAS.map((h) => {
              const on = horas.includes(h);
              return (
                <button
                  key={h}
                  disabled={salvarHoras.isPending}
                  onClick={() =>
                    salvarHoras.mutate(
                      on ? horas.filter((x) => x !== h) : [...horas, h].sort((a, b) => a - b),
                    )
                  }
                  className={`rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 ${
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
              Sem nenhum horário, o que é &quot;no resumo&quot; nunca vira push — fica só no sino.
            </p>
          )}
        </CardContent>
      </Card>

      {carregando ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : pessoas.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Ninguém ativo no time ainda.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          {/* Quem */}
          <Card className="glass-card h-fit">
            <CardContent className="p-0">
              <p className="flex items-center gap-1.5 border-b border-border/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Users className="h-3 w-3" /> Time
              </p>
              <ul className="divide-y divide-border/30">
                {pessoas.map((p) => {
                  const ativa = p.user_id === pessoa?.user_id;
                  const push = Object.values(p.modos).filter((m) => m === "push").length;
                  const off = Object.values(p.modos).filter((m) => m === "off").length;
                  return (
                    <li key={p.user_id}>
                      <button
                        onClick={() => setSelecionado(p.user_id)}
                        className={`w-full px-3 py-2 text-left transition-colors ${
                          ativa ? "bg-primary/10" : "hover:bg-muted/30"
                        }`}
                      >
                        <p className={`truncate text-sm ${ativa ? "font-medium text-foreground" : "text-foreground"}`}>
                          {p.nome}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {push} com push{off > 0 ? ` · ${off} desligada${off > 1 ? "s" : ""}` : ""}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {/* O quê */}
          <Card className="glass-card">
            <CardContent className="space-y-5 p-4">
              <p className="text-sm font-medium text-foreground">{pessoa?.nome}</p>

              {porGrupo.map(([grupo, lista]) => (
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
                        valor={(pessoa?.modos[t.tipo] as Modo) || "sino"}
                        disabled={!pessoa}
                        onChange={(modo) =>
                          pessoa && salvar.mutate({ userId: pessoa.user_id, tipo: t.tipo, modo })
                        }
                      />
                    </div>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/70">
        Cada pessoa também pode ajustar isso na própria tela de notificações, além de escolher os horários
        do resumo e ligar o &quot;não perturbe&quot;. O que é <strong>na hora</strong> fura o não perturbe — é
        justamente o que não pode esperar.
      </p>
    </div>
  );
}
