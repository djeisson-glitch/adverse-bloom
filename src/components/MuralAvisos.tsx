import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Pin, PinOff, X, Plus, Loader2 } from "lucide-react";
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

  const enviar = () => {
    publicar.mutate(
      { titulo, corpo, fixado: fixar },
      {
        onSuccess: () => {
          setTitulo(""); setCorpo(""); setFixar(false); setCompondo(false);
          toast.success("Aviso publicado");
        },
        onError: (e: any) => toast.error("Erro", { description: e.message }),
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

  return (
    <Card className="glass-card border-amber-500/25">
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Megaphone className="h-4 w-4 text-amber-400" /> Mural de avisos
            {avisos.length > 0 && (
              <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-400">
                {avisos.length}
              </span>
            )}
          </p>
          {podePublicar && !compondo && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-amber-400 hover:text-amber-300" onClick={() => setCompondo(true)}>
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
            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={fixar} onCheckedChange={(v) => setFixar(!!v)} /> Fixar no topo
              </label>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setCompondo(false); setTitulo(""); setCorpo(""); setFixar(false); }}>
                  Cancelar
                </Button>
                <Button size="sm" className="h-8 bg-amber-500 text-white hover:bg-amber-600" onClick={enviar} disabled={publicar.isPending || !titulo.trim()}>
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
                    {a.fixado && <Pin className="h-3 w-3 shrink-0 text-amber-400" />}
                    {a.titulo}
                  </p>
                  {a.corpo && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{a.corpo}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {autorDe(a.autor_id) && <>{autorDe(a.autor_id)} · </>}
                    {new Date(a.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {podePublicar && (
                  <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button
                      title={a.fixado ? "Desafixar" : "Fixar no topo"}
                      onClick={() => alternarFixado.mutate(a)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-amber-400"
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
