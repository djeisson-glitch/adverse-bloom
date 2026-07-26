import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Pin, PinOff, X, Plus, Loader2, CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm";
import { supabase } from "@/integrations/supabase/client";
import { useAvisos, type Aviso } from "@/hooks/useAvisos";
import { toast } from "sonner";

/**
 * Mural de avisos internos — admin/coordenadora publica, todo o time vê.
 * Usado na Início (gestão e equipe) e na Minha mesa. Se não há avisos e a
 * pessoa não pode publicar, não ocupa espaço.
 */
export function MuralAvisos() {
  const { avisos, isLoading, podePublicar, publicar, alternarFixado, remover } = useAvisos();
  const confirmar = useConfirm();
  const [compondo, setCompondo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [fixar, setFixar] = useState(false);
  const [dataEvento, setDataEvento] = useState("");   // datetime-local (opcional)

  // Nome de quem publicou (autor_id → auth.users, resolvido pelos profiles).
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-basic"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("id, full_name, email");
      return (data as any[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const autorDe = (uid: string | null) => {
    const p = profiles.find((x: any) => x.id === uid);
    return p?.full_name?.split(" ")[0] || p?.email?.split("@")[0] || "";
  };

  const limpar = () => { setTitulo(""); setCorpo(""); setFixar(false); setDataEvento(""); setCompondo(false); };

  const enviar = () => {
    publicar.mutate(
      // datetime-local vem sem fuso; new Date() interpreta no fuso local e vira ISO.
      { titulo, corpo, fixado: fixar, data_evento: dataEvento ? new Date(dataEvento).toISOString() : null },
      {
        onSuccess: () => { limpar(); toast.success("Aviso publicado"); },
      }
    );
  };

  const apagar = async (a: Aviso) => {
    if (!(await confirmar({ title: "Remover aviso?", description: a.titulo, destructive: true, confirmText: "Remover" }))) return;
    remover.mutate(a.id);
  };

  // Nada pra mostrar e não pode publicar → some.
  if (isLoading) return null;
  if (avisos.length === 0 && !podePublicar) return null;

  // Mural vazio não merece um card inteiro com borda no meio da tela mais
  // nobre: "publique o primeiro" não é informação, é convite. Vira uma linha
  // discreta que só cresce quando tem aviso de verdade.
  if (avisos.length === 0 && !compondo) {
    return (
      <button
        onClick={() => setCompondo(true)}
        className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <Megaphone className="h-3.5 w-3.5" /> Publicar um aviso no mural
      </button>
    );
  }

  return (
    <Card className="glass-card border-amber-500/25">
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Megaphone className="h-4 w-4 text-warning" /> Mural de avisos
            {avisos.length > 0 && (
              <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-warning">
                {avisos.length}
              </span>
            )}
          </p>
          {podePublicar && !compondo && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-warning hover:text-warning" onClick={() => setCompondo(true)}>
              <Plus className="h-3.5 w-3.5" /> Novo aviso
            </Button>
          )}
        </div>

        {/* Compositor (só admin/coordenadora) */}
        {podePublicar && compondo && (
          <div className="space-y-2 border-b border-border/50 bg-muted/20 p-4">
            <Input
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título do aviso"
              className="h-9"
            />
            <Textarea
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              placeholder="Detalhe (opcional)"
              rows={2}
            />
            <div>
              <label className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <CalendarClock className="h-3 w-3" /> Data do evento (opcional)
              </label>
              <Input
                type="datetime-local"
                value={dataEvento}
                onChange={(e) => setDataEvento(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={fixar} onCheckedChange={(v) => setFixar(!!v)} /> Fixar no topo
              </label>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-8" onClick={limpar}>
                  Cancelar
                </Button>
                <Button size="sm" className="h-8 bg-amber-500 text-black hover:bg-amber-600" onClick={enviar} disabled={publicar.isPending || !titulo.trim()}>
                  {publicar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Publicar"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {avisos.length === 0 ? (
          <p className="px-4 py-5 text-center text-xs text-muted-foreground">
            Nenhum aviso no mural. {podePublicar && "Publique o primeiro."}
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {avisos.map((a) => (
              <li key={a.id} className="group flex gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    {a.fixado && <Pin className="h-3 w-3 shrink-0 text-warning" />}
                    {a.titulo}
                  </p>
                  {a.corpo && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{a.corpo}</p>}
                  {a.data_evento && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                      <CalendarClock className="h-3 w-3" /> {fmtEvento(a.data_evento)}
                    </span>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    registrado {autorDe(a.autor_id) && <>por {autorDe(a.autor_id)} · </>}
                    {new Date(a.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {podePublicar && (
                  <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button
                      title={a.fixado ? "Desafixar" : "Fixar no topo"}
                      onClick={() => alternarFixado.mutate(a)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-warning"
                    >
                      {a.fixado ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      title="Remover"
                      onClick={() => apagar(a)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// Data do evento: "sex, 25 de jul · 10:00" (esconde a hora se for meia-noite).
function fmtEvento(iso: string) {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  const temHora = d.getHours() !== 0 || d.getMinutes() !== 0;
  const hora = temHora ? " · " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  return dia + hora;
}
