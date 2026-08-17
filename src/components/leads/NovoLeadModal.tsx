import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { TEMPERATURAS, ORIGENS } from "@/pages/Leads";
import { cadenciaDias, proximoToquePadrao } from "@/lib/leadCadencia";

/**
 * Cadastro de lead num modal — com o que a gente sabe NA HORA.
 *
 * Djêisson (14/08/2026): "ao clicar em novo lead, precisa abrir um modal pra
 * gente cadastrar informações dele, como email, celular, quando ele responder,
 * o que enviamos pra ele em cada mensagem etc."
 *
 * A barra de criação antiga pedia só nome, empresa, origem e temperatura — e
 * e-mail e celular ficavam pra depois, que na prática é nunca. Lead sem
 * contato é um nome numa lista: não dá pra tocar, e a cadência não serve de
 * nada.
 *
 * O PRIMEIRO TOQUE também entra aqui. Quase todo lead nasce de uma conversa
 * ("mandei e-mail hoje"), e registrar isso na criação é o que faz o próximo
 * toque já sair agendado — em vez de o lead nascer sem data nenhuma e
 * depender de alguém lembrar.
 */

const TIPOS = [
  { v: "email", l: "E-mail" },
  { v: "whatsapp", l: "WhatsApp" },
  { v: "ligacao", l: "Ligação" },
  { v: "reuniao", l: "Reunião" },
  { v: "nota", l: "Nota" },
];

export function NovoLeadModal({ aberto, onFechar, onCriado }: {
  aberto: boolean; onFechar: () => void; onCriado: (id: string) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({
    nome: "", empresa: "", email: "", telefone: "",
    origem: "outbound", temperatura: "frio",
    observacoes: "",
    // Primeiro toque (opcional)
    jaFalei: false, tipo: "email", oQueEnviei: "",
    motivo_toque: "",
    proximo_toque: "" as string,
  });

  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  // A data sugerida acompanha a temperatura até alguém digitar outra.
  const toqueSugerido = f.proximo_toque || proximoToquePadrao(f.temperatura);

  const criar = useMutation({
    mutationFn: async () => {
      if (!f.nome.trim()) throw new Error("Informe o nome do lead");

      const { data, error } = await (supabase as any).from("leads").insert({
        nome: f.nome.trim(),
        empresa: f.empresa.trim() || null,
        email: f.email.trim() || null,
        telefone: f.telefone.trim() || null,
        origem: f.origem,
        temperatura: f.temperatura,
        // Já falei = já está em nutrição; senão, é novo mesmo.
        status: f.jaFalei ? "em_nutricao" : "novo",
        responsavel_id: user?.id ?? null,
        observacoes: f.observacoes.trim() || null,
        motivo_toque: f.motivo_toque.trim() || null,
        proximo_toque: toqueSugerido || null,
      }).select("id").single();
      if (error) throw error;

      // O primeiro toque vira interação — e o trigger do banco reagenda o
      // próximo a partir dela. Mandamos a data junto pra ela não ser
      // recalculada por cima do que foi escolhido aqui.
      if (f.jaFalei && f.oQueEnviei.trim()) {
        await (supabase as any).from("lead_interacoes").insert({
          lead_id: data.id,
          tipo: f.tipo,
          descricao: f.oQueEnviei.trim(),
          proximo_toque: toqueSugerido || null,
          motivo_toque: f.motivo_toque.trim() || null,
          user_id: user?.id ?? null,
        });
      }
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["minha-mesa-leads"] });
      toast.success("Lead cadastrado", {
        description: `Próximo toque em ${new Date(toqueSugerido + "T00:00:00").toLocaleDateString("pt-BR")}`,
      });
      onCriado(id);
    },
    onError: (e: any) => toast.error("Não cadastrou", { description: e.message }),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Novo lead</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nome *">
              <Input value={f.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Quem é a pessoa" />
            </Campo>
            <Campo label="Empresa">
              <Input value={f.empresa} onChange={(e) => set({ empresa: e.target.value })} />
            </Campo>
            {/* E-mail e celular na criação: deixar pra depois é deixar pra
                nunca, e lead sem contato não dá pra tocar. */}
            <Campo label="E-mail">
              <Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="nome@empresa.com.br" />
            </Campo>
            <Campo label="Telefone / WhatsApp">
              <Input value={f.telefone} onChange={(e) => set({ telefone: e.target.value })} placeholder="(54) 9…" />
            </Campo>
            <Campo label="Origem">
              <Select value={f.origem} onValueChange={(v) => set({ origem: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ORIGENS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
            <Campo label="Temperatura">
              <Select value={f.temperatura} onValueChange={(v) => set({ temperatura: v, proximo_toque: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TEMPERATURAS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-muted-foreground">volta a cada {cadenciaDias(f.temperatura)} dias</p>
            </Campo>
          </div>

          {/* PRIMEIRO TOQUE */}
          <div className="rounded-lg border border-border/60 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox" checked={f.jaFalei}
                onChange={(e) => set({ jaFalei: e.target.checked })}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              Já falei com esse lead
            </label>

            {f.jaFalei && (
              <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
                <Campo label="Como">
                  <Select value={f.tipo} onValueChange={(v) => set({ tipo: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                  </Select>
                </Campo>
                <Campo label="O que enviei / o que ele respondeu">
                  <Input
                    value={f.oQueEnviei} onChange={(e) => set({ oQueEnviei: e.target.value })}
                    placeholder="ex.: mandei apresentação da Adverse; pediu pra retomar depois da safra"
                    className="h-9"
                  />
                </Campo>
              </div>
            )}
          </div>

          {/* AGENDA DO PRÓXIMO TOQUE */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <CalendarCheck className="h-3 w-3" /> Já entra na agenda
            </p>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <Campo label="Próximo toque">
                <Input type="date" value={toqueSugerido} onChange={(e) => set({ proximo_toque: e.target.value })} className="h-9" />
              </Campo>
              <Campo label="Motivo">
                <Input
                  value={f.motivo_toque} onChange={(e) => set({ motivo_toque: e.target.value })}
                  placeholder="por que voltar nele" className="h-9"
                />
              </Campo>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Aparece na sua Minha mesa e no calendário no dia — e o sistema te avisa.
            </p>
          </div>

          <Campo label="Observações">
            <Textarea
              rows={2} value={f.observacoes} onChange={(e) => set({ observacoes: e.target.value })}
              placeholder="Contexto, dores, quem indicou…"
            />
          </Campo>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
            {criar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Cadastrar lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
