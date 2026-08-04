import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Link2, Copy, Loader2, Info, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { IndicadorAutosave } from "@/components/autosave/AutosaveContext";

/**
 * Config do formulário público de demandas de um cliente.
 * Define o slug do link, o editor responsável (pra calcular o prazo) e as
 * horas de edição/revisão usadas na estimativa.
 */

function slugify(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

type FormIntake = {
  intake_ativo: boolean;
  intake_slug: string;
  intake_editor_id: string;
  intake_edit_horas: string;
  intake_revisao_horas: string;
  intake_alteracoes_media: string;
  urgencia_dias: string;
  urgencia_percentual: string;
  // níveis de edição — preenchidos pela hidratação
  editor_nivel1_id?: string;
  editor_nivel2_id?: string;
  editor_nivel3_id?: string;
};

export default function IntakeConfig({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [form, setForm] = useState<FormIntake>({
    intake_ativo: false,
    intake_slug: "",
    urgencia_dias: "0",
    urgencia_percentual: "50",
    intake_editor_id: "",
    intake_edit_horas: "4",
    intake_revisao_horas: "2",
    intake_alteracoes_media: "1",
  });
  const [contatos, setContatosState] = useState<{ nome: string; email: string }[]>([]);
  const [novoContato, setNovoContato] = useState({ nome: "", email: "" });
  const [hidratado, setHidratado] = useState(false);

  const { data: cli, isLoading } = useQuery({
    queryKey: ["intake-cfg", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("intake_ativo, intake_slug, intake_editor_id, editor_nivel1_id, editor_nivel2_id, editor_nivel3_id, intake_edit_horas, intake_revisao_horas, intake_alteracoes_media, intake_contatos, urgencia_dias, urgencia_percentual")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: editores = [] } = useQuery({
    queryKey: ["intake-editores"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("profiles").select("id, full_name, avatar_url").order("full_name");
      if (error) throw error;
      return data as { id: string; full_name: string | null }[];
    },
  });

  useEffect(() => {
    if (cli && !hidratado) {
      setForm({
        intake_ativo: !!cli.intake_ativo,
        intake_slug: cli.intake_slug || slugify(clientName),
        intake_editor_id: cli.intake_editor_id || "",
        intake_edit_horas: String(cli.intake_edit_horas ?? 4),
        intake_revisao_horas: String(cli.intake_revisao_horas ?? 2),
        intake_alteracoes_media: String(cli.intake_alteracoes_media ?? 1),
        editor_nivel1_id: cli.editor_nivel1_id || "",
        editor_nivel2_id: cli.editor_nivel2_id || "",
        editor_nivel3_id: cli.editor_nivel3_id || "",
        urgencia_dias: String(cli.urgencia_dias ?? 0),
        urgencia_percentual: String(cli.urgencia_percentual ?? 50),
      });
      setContatosState(Array.isArray(cli.intake_contatos) ? cli.intake_contatos : []);
      setHidratado(true);
    }
  }, [cli, hidratado, clientName]);

  // Salva ao digitar: manda só o campo mexido, ~0,8s depois da última tecla.
  const gravar = async (patch: Record<string, unknown>) => {
    const { error } = await (supabase as any).from("clients").update(patch).eq("id", clientId);
    if (error) {
      toast.error("Não salvou", {
        description: /duplicate|unique|intake_slug/i.test(error.message || "")
          ? "Esse slug já está em uso por outro cliente."
          : /column|intake_/i.test(error.message || "")
          ? "Rode 'supabase db push' pra habilitar o formulário de demandas."
          : error.message,
      });
      throw error;
    }
  };
  const auto = useFormAutosave<Record<string, unknown>>(gravar);
  // Escolha (checkbox/select/contato) não é digitação: não tem o que esperar.
  const autoEscolha = useFormAutosave<Record<string, unknown>>(gravar, { delay: 150 });

  const set = (patch: Partial<FormIntake>) => setForm((f) => ({ ...f, ...patch }));

  // O slug vai slugificado pro banco, mas na tela fica o que a pessoa digitou.
  const setSlug = (valor: string) => {
    set({ intake_slug: valor });
    auto.agendar({ intake_slug: valor.trim() ? slugify(valor) : null });
  };

  const setContatos = (lista: { nome: string; email: string }[]) => {
    setContatosState(lista);
    autoEscolha.agendar({ intake_contatos: lista });
  };

  const url = form.intake_slug ? `${window.location.origin}/solicitar/${slugify(form.intake_slug)}` : "";

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            O link abaixo é o formulário público pra <strong>{clientName}</strong> mandar demandas. Ao enviar, o sistema estima o prazo lendo a fila do <strong>editor responsável</strong>.
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.intake_ativo}
              onChange={(e) => {
                set({ intake_ativo: e.target.checked });
                autoEscolha.agendar({ intake_ativo: e.target.checked });
              }}
              className="h-4 w-4 accent-primary"
            />
            Formulário ativo (o cliente consegue enviar demandas)
          </label>
          <IndicadorAutosave status={auto.status !== "ocioso" ? auto.status : autoEscolha.status} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Slug do link</Label>
            <div className="flex gap-2">
              <Input value={form.intake_slug} onChange={(e) => setSlug(e.target.value)} placeholder="sicredi-sul-minas" />
              <Button variant="outline" size="sm" onClick={() => setSlug(slugify(clientName))}>Gerar</Button>
            </div>
          </div>
          <div>
            {/* Três níveis em vez de um editor só. O prazo usa a fila do nível 1;
                se ela já estourou a capacidade da janela, desce pro 2 e depois pro 3.
                Assim "indisponível" é um fato medido, não um palpite — e o nível não
                perde a vez por qualquer coisa. */}
            {/* Taxa de urgência: DESLIGADA por padrão. Uma regra que cobra não
                pode nascer ligada — cliente novo levaria adicional sem ninguém
                ter decidido, e a descoberta seria na fatura. */}
            <div className="mb-4 rounded-md border border-border/50 p-3">
              <Label>Taxa de urgência</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Janela</p>
                  <Select
                    value={String((form as any).urgencia_dias ?? "0")}
                    onValueChange={(v) => { set({ urgencia_dias: v } as any); autoEscolha.agendar({ urgencia_dias: Number(v) }); }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sem taxa de urgência</SelectItem>
                      <SelectItem value="1">Entrega hoje ou amanhã</SelectItem>
                      <SelectItem value="2">Até depois de amanhã</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Adicional (%)</p>
                  <Input
                    type="number" min={0} max={300}
                    value={(form as any).urgencia_percentual ?? "50"}
                    onChange={(e) => set({ urgencia_percentual: e.target.value } as any)}
                    onBlur={(e) => autoEscolha.agendar({ urgencia_percentual: Number(e.target.value) || 0 })}
                    disabled={String((form as any).urgencia_dias ?? "0") === "0"}
                  />
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Com a janela ligada, o cliente vê o adicional no formulário e o envio deixa de ser
                bloqueado — a taxa é o preço de furar a fila. O valor fica congelado no pedido.
              </p>
            </div>

            <Label>Quem edita (nível 1 → 2 → 3)</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {([1, 2, 3] as const).map((nv) => {
                const campo = `editor_nivel${nv}_id` as const;
                return (
                  <div key={nv}>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Nível {nv}</p>
                    <Select
                      value={(form as any)[campo] || "none"}
                      onValueChange={(v) => {
                        set({ [campo]: v === "none" ? "" : v } as any);
                        autoEscolha.agendar({ [campo]: v === "none" ? null : v });
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— nenhum —</SelectItem>
                        {editores.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.full_name || "—"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              O prazo do formulário usa a fila de quem estiver disponível, de cima pra baixo.
              Sem nenhum nível preenchido, ele reparte pela capacidade do time — menos preciso.
            </p>

          </div>
          <div>
            <Label>Horas de edição por vídeo</Label>
            <Input
              type="number"
              value={form.intake_edit_horas}
              onChange={(e) => {
                set({ intake_edit_horas: e.target.value });
                auto.agendar({ intake_edit_horas: Number(e.target.value) || 0 });
              }}
            />
          </div>
          <div>
            <Label>Buffer de revisão interna (horas)</Label>
            <Input
              type="number"
              value={form.intake_revisao_horas}
              onChange={(e) => {
                set({ intake_revisao_horas: e.target.value });
                auto.agendar({ intake_revisao_horas: Number(e.target.value) || 0 });
              }}
            />
          </div>
          <div>
            <Label>Rodadas médias de alteração</Label>
            <Input
              type="number"
              step="0.5"
              value={form.intake_alteracoes_media}
              onChange={(e) => {
                set({ intake_alteracoes_media: e.target.value });
                auto.agendar({ intake_alteracoes_media: Number(e.target.value) || 1 });
              }}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Fallback enquanto não há histórico. Com ≥3 entregáveis, o sistema passa a usar a média real do cliente automaticamente.</p>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>O prazo agora escala pela <strong>duração</strong> de cada vídeo e pelo <strong>histórico de alterações</strong> do cliente. A leitura de complexidade por IA aparece na caixa de <strong>Demandas</strong> quando o time abre a solicitação.</span>
        </div>

        {/* Contatos pré-definidos: viram atalhos "sou fulano" no formulário */}
        <div>
          <Label>Contatos do cliente (atalhos no formulário)</Label>
          <p className="mb-2 text-[11px] text-muted-foreground">
            As pessoas que costumam pedir. No formulário viram um clique que já preenche nome e e-mail.
            Como a página é pública, esses e-mails ficam visíveis pra quem tiver o link.
          </p>
          {contatos.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {contatos.map((c, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-2.5 py-1.5 text-sm">
                  <span className="font-medium text-foreground">{c.nome}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{c.email}</span>
                  <button onClick={() => setContatos(contatos.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input value={novoContato.nome} onChange={(e) => setNovoContato({ ...novoContato, nome: e.target.value })} placeholder="Nome" className="flex-1" />
            <Input type="email" value={novoContato.email} onChange={(e) => setNovoContato({ ...novoContato, email: e.target.value })} placeholder="email@empresa.com" className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const nome = novoContato.nome.trim();
                const email = novoContato.email.trim();
                if (!nome || !email) return;
                setContatos([...contatos, { nome, email }]);
                setNovoContato({ nome: "", email: "" });
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {url && (
          <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 p-2.5">
            <Link2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{url}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { navigator.clipboard?.writeText(url); toast.success("Link copiado"); }}
            >
              <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
