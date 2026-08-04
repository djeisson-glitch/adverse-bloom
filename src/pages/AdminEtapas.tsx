import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, Plus, X, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { primeiroNome } from "@/lib/pessoa";
import { toast } from "sonner";

/**
 * Etapas de pós e quem faz cada uma.
 *
 * A ordem aqui É a ordem da trilha — o "passar pra próxima" na peça segue
 * exatamente esta lista. Os candidatos são a fila de preferência: o sistema
 * escolhe o de MENOR carga entre eles, e a ordem desempata.
 *
 * Apagar etapa em uso é bloqueado: `deliverables.etapa_atual` e
 * `time_entries.etapa` guardam o slug como texto, então sumir com a etapa
 * deixaria peças apontando pra algo que não existe — e horas já lançadas
 * perderiam o nome.
 */
export default function AdminEtapas() {
  const qc = useQueryClient();
  const { isAdmin } = usePermissions();
  const [nova, setNova] = useState("");
  const [salvando, setSalvando] = useState(false);

  const { data: etapas = [], isLoading } = useQuery({
    queryKey: ["admin-etapas"],
    queryFn: async () => (await (supabase as any).from("etapas_pos").select("*").order("ordem")).data || [],
  });

  const { data: candidatos = [] } = useQuery({
    queryKey: ["admin-etapa-candidatos"],
    queryFn: async () => (await (supabase as any).from("etapa_candidatos").select("*").order("preferencia")).data || [],
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-etapas-profiles"],
    queryFn: async () =>
      (await (supabase as any).from("profiles").select("id, full_name, email, ativo, avatar_url").order("full_name")).data || [],
  });

  const { data: emUso = {} } = useQuery({
    queryKey: ["admin-etapas-uso"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("deliverables").select("etapa_atual").not("etapa_atual", "is", null);
      const m: Record<string, number> = {};
      ((data as any[]) || []).forEach((d) => { m[d.etapa_atual] = (m[d.etapa_atual] || 0) + 1; });
      return m;
    },
  });

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["admin-etapas"] });
    qc.invalidateQueries({ queryKey: ["admin-etapa-candidatos"] });
    qc.invalidateQueries({ queryKey: ["etapas-pos"] });
  };

  const run = async (fn: () => Promise<any>, ok: string) => {
    setSalvando(true);
    try {
      const { error } = await fn();
      if (error) throw error;
      toast.success(ok);
      recarregar();
    } catch (e: any) {
      toast.error("Não deu", { description: e.message });
    } finally { setSalvando(false); }
  };

  const slugificar = (t: string) =>
    t.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").slice(0, 40);

  const addEtapa = async () => {
    if (!nova.trim()) return;
    const slug = slugificar(nova);
    if (etapas.some((e: any) => e.slug === slug)) return toast.error("Já existe uma etapa com esse nome");
    await run(
      () => (supabase as any).from("etapas_pos").insert({
        slug, nome: nova.trim(), ordem: (etapas[etapas.length - 1]?.ordem || 0) + 1,
      }),
      "Etapa criada",
    );
    setNova("");
  };

  const mover = async (i: number, dir: -1 | 1) => {
    const a = etapas[i], b = etapas[i + dir];
    if (!a || !b) return;
    setSalvando(true);
    try {
      // Troca as ordens. Passa por um valor livre pra não colidir com o índice
      // enquanto as duas linhas trocam de lugar.
      await (supabase as any).from("etapas_pos").update({ ordem: -1 }).eq("slug", a.slug);
      await (supabase as any).from("etapas_pos").update({ ordem: a.ordem }).eq("slug", b.slug);
      await (supabase as any).from("etapas_pos").update({ ordem: b.ordem }).eq("slug", a.slug);
      recarregar();
    } catch (e: any) {
      toast.error("Não deu pra reordenar", { description: e.message });
    } finally { setSalvando(false); }
  };

  const removerEtapa = (e: any) => {
    const n = (emUso as any)[e.slug] || 0;
    if (n > 0) {
      return toast.error(`${n} peça(s) estão nesta etapa`, {
        description: "Mova essas peças antes de apagar — senão elas ficam apontando pra uma etapa que não existe.",
      });
    }
    void run(() => (supabase as any).from("etapas_pos").delete().eq("slug", e.slug), "Etapa removida");
  };

  const addCandidato = (etapa: string, userId: string) => {
    const atuais = candidatos.filter((c: any) => c.etapa === etapa);
    if (atuais.some((c: any) => c.user_id === userId)) return;
    void run(
      () => (supabase as any).from("etapa_candidatos").insert({
        etapa, user_id: userId, preferencia: atuais.length + 1,
      }),
      "Pessoa adicionada",
    );
  };

  if (!isAdmin) {
    return <div className="mx-auto max-w-2xl py-16 text-center text-sm text-muted-foreground">Esta tela é da gestão.</div>;
  }
  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-6">
      <div className="flex items-center gap-3">
        <Layers className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Etapas de pós</h1>
          <p className="text-sm text-muted-foreground">
            A ordem aqui é a ordem da trilha. Entre os candidatos, o sistema escolhe o de menor fila —
            a posição desempata.
          </p>
        </div>
      </div>

      {etapas.map((e: any, i: number) => {
        const meus = candidatos.filter((c: any) => c.etapa === e.slug);
        const livres = profiles.filter(
          (p: any) => p.ativo !== false && !meus.some((c: any) => c.user_id === p.id),
        );
        const usados = (emUso as any)[e.slug] || 0;
        return (
          <Card key={e.slug} className="glass-card">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
                <Input
                  defaultValue={e.nome}
                  onBlur={(ev) => {
                    const v = ev.target.value.trim();
                    if (v && v !== e.nome) void run(() => (supabase as any).from("etapas_pos").update({ nome: v }).eq("slug", e.slug), "Nome atualizado");
                  }}
                  className="h-8 max-w-[220px]"
                />
                {usados > 0 && (
                  <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {usados} peça{usados > 1 ? "s" : ""} aqui
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => mover(i, -1)} disabled={i === 0 || salvando}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" title="Subir">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => mover(i, 1)} disabled={i === etapas.length - 1 || salvando}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" title="Descer">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => removerEtapa(e)} disabled={salvando}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive" title="Remover etapa">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {meus.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    Sem candidatos — a peça não vai ser atribuída sozinha nesta etapa.
                  </span>
                )}
                {meus.map((c: any, idx: number) => {
                  const p = profiles.find((x: any) => x.id === c.user_id);
                  return (
                    <span key={c.user_id}
                      className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs text-foreground">
                      <span className="text-[10px] text-muted-foreground">{idx + 1}º</span>
                      {primeiroNome(p?.full_name || p?.email)}
                      <button
                        onClick={() => run(() => (supabase as any).from("etapa_candidatos").delete().eq("etapa", e.slug).eq("user_id", c.user_id), "Removido")}
                        className="text-muted-foreground hover:text-destructive"
                        title="Tirar desta etapa"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
                {livres.length > 0 && (
                  <Select value="" onValueChange={(v) => addCandidato(e.slug, v)}>
                    <SelectTrigger className="h-7 w-[150px] text-xs">
                      <SelectValue placeholder="+ adicionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {livres.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{primeiroNome(p.full_name || p.email)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card className="glass-card">
        <CardContent className="flex flex-wrap items-center gap-2 p-5">
          <Input
            value={nova}
            onChange={(ev) => setNova(ev.target.value)}
            onKeyDown={(ev) => ev.key === "Enter" && addEtapa()}
            placeholder="Nova etapa (ex.: Legendagem em inglês)"
            className="h-9 max-w-xs"
          />
          <Button size="sm" onClick={addEtapa} disabled={!nova.trim() || salvando}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar etapa
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
