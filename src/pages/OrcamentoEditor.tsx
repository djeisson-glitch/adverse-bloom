import { useMemo, useState, useEffect, useRef } from "react";
import { useVoltar } from "@/hooks/useVoltar";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STAGES, isWonStage } from "@/hooks/useDeals";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ArrowLeft, Loader2, Send, Trophy, XCircle, Plus, Trash2, ChevronRight,
  ChevronDown, Table, Info, Save, ExternalLink, CalendarRange, Upload,
  FileText, Link2, Pencil, CheckCircle2, Eye, EyeOff, RotateCcw, Sparkles, AlertTriangle,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ComentariosSection } from "./ProjetoDetalhe";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { IndicadorAutosave } from "@/components/autosave/AutosaveContext";
import { formatCurrency, roundUpTo50, formatDate } from "@/lib/format";
import { MergulhoForm } from "@/components/MergulhoForm";
import {
  CANAIS_ENTRADA, TIPOS_ORCAMENTO, PRECISA_ROTEIRO, PRECISA_ELENCO,
  MOEDAS, FORMATOS, MEIOS_VEICULACAO,
} from "@/lib/orcamento-constants";

type Categoria = { id: string; codigo: string; nome: string; ordem: number };
type BudgetItem = {
  id: string;
  budget_id: string;
  categoria_id: string | null;
  descricao: string | null;
  quantity: number | null;
  diaria: number | null;
  client_unit_price: number | null;
  client_price: number | null;
  custo_unitario: number | null;
  tira_taxa: boolean;
  observacoes: string | null;
  ordem: number;
};

export default function OrcamentoEditor() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const voltar = useVoltar("/orcamentos");
  const { user } = useAuth();
  const { canSeeMoney } = usePermissions();

  const { data: deal, isLoading } = useQuery({
    queryKey: ["orcamento-deal", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deals")
        .select("*, client:clients(id, name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: budget } = useQuery({
    queryKey: ["orcamento-budget", id],
    enabled: !!deal,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("budgets")
        .select("*")
        .eq("deal_id", deal.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;

      // Padrão da produtora (margem/imposto/comissões) — se a migration ainda não
      // rodou, segue sem padrão (try/catch), sem travar a criação do orçamento.
      let padrao: any = null;
      try {
        const { data: p } = await (supabase as any).from("orcamento_padroes").select("*").eq("id", true).maybeSingle();
        padrao = p;
      } catch { /* tabela ainda não existe */ }

      // Cria budget automaticamente se ainda não existir, já com o padrão
      const { data: created, error: e2 } = await (supabase as any)
        .from("budgets")
        .insert({
          deal_id: deal.id,
          project_name: deal.title,
          client_name: deal.client?.name || "",
          status: "draft",
          is_latest_version: true,
          margem_produtora_percent: padrao?.margem ?? 0,
          imposto_percent: padrao?.imposto ?? 0,
          comissoes: padrao?.comissoes ?? [],
          comissao_base: padrao?.comissao_base ?? "subtotal2",
        })
        .select("*")
        .single();
      if (e2) throw e2;

      // Planilha nasce populada com os itens padrão, filtrando pelo porte do projeto
      await (supabase as any).rpc("seed_budget_items", { _budget_id: created.id, _porte: deal.porte || "grande" });

      return created;
    },
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ["budget-categorias"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("budget_categorias")
        .select("*")
        .order("ordem");
      if (error) throw error;
      return data as Categoria[];
    },
  });

  const { data: itens = [] } = useQuery({
    queryKey: ["orcamento-itens", budget?.id],
    enabled: !!budget?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("budget_items")
        .select("*")
        .eq("budget_id", budget.id)
        .order("ordem");
      if (error) throw error;
      return data as BudgetItem[];
    },
  });

  // Job gerado a partir deste orçamento (quando ganho)
  const { data: jobGerado } = useQuery({
    queryKey: ["orcamento-job", id],
    enabled: !!deal && isWonStage(deal.stage),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("projects")
        .select("id, numero, name")
        .eq("deal_id", deal.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // Follow-ups agendados deste orçamento
  const { data: followUps = [] } = useQuery({
    queryKey: ["orcamento-followups", id],
    enabled: !!deal,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("follow_ups")
        .select("id, data_prevista, tipo, status, descricao")
        .eq("deal_id", deal.id)
        .order("data_prevista");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["orcamento-profiles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email")
        .neq("ativo", false);
      if (error) throw error;
      return data as any[];
    },
  });

  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const excluir = useMutation({
    mutationFn: async () => {
      if (jobGerado) {
        throw new Error(`Esse orçamento já virou o Job #${jobGerado.numero}. Exclua o projeto primeiro.`);
      }
      // apaga a planilha (itens/comissões caem por cascade) e o orçamento
      await (supabase as any).from("budgets").delete().eq("deal_id", deal.id);
      const { error } = await (supabase as any).from("deals").delete().eq("id", deal.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orçamento excluído");
      navigate("/orcamentos");
    },
    onError: (e: any) => toast.error("Não excluiu", { description: e.message }),
  });

  if (isLoading || !deal || !budget) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const stage = STAGES.find((s) => s.id === deal.stage);

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <div className="flex items-center justify-between">
        <button
          onClick={voltar}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar
        </button>
        {confirmarExcluir ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Excluir este orçamento?</span>
            <button onClick={() => setConfirmarExcluir(false)} className="text-muted-foreground hover:text-foreground">
              Cancelar
            </button>
            <button
              onClick={() => excluir.mutate()}
              disabled={excluir.isPending}
              className="font-medium text-destructive hover:underline"
            >
              Sim, excluir
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmarExcluir(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir
          </button>
        )}
      </div>

      {/* Header + ações */}
      <Card className="glass-card">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {deal.numero && <span className="font-mono text-primary">#{deal.numero}</span>}
                {deal.numero && " · "}
                {deal.client?.name || "Sem cliente"}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{deal.title}</h1>
            </div>
            <span
              className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
              style={{ color: stage?.color, borderColor: (stage?.color || "#666") + "66" }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: stage?.color }}
              />
              {stage?.emoji} {stage?.label?.toLowerCase()}
            </span>
          </div>

          {jobGerado && (
            <Link
              to={`/projetos/${jobGerado.id}`}
              className="flex w-fit items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-1.5 text-sm font-medium text-success hover:bg-success/15"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Job #{jobGerado.numero} gerado a partir deste orçamento
            </Link>
          )}

          <AcaoBotoes deal={deal} budget={budget} jobGerado={jobGerado} navigate={navigate} qc={qc} />
          <p className="text-xs text-muted-foreground">
            Ganhar/Perder geram automaticamente um <strong>follow-up para +60 dias</strong> na agenda.
          </p>
        </CardContent>
      </Card>

      {/* Discussão do orçamento */}
      <ComentariosSection
        entityType="deal"
        entityId={deal.id}
        profiles={profiles}
        titulo="💬 Discussão do orçamento"
        vazio="Nenhuma mensagem ainda. Tire dúvidas, alinhe valores e anexe documentos aqui."
      />

      {/* Planilha de produção */}
      {canSeeMoney && (
        <PlanilhaSection
          budget={budget}
          categorias={categorias}
          tipoOrcamento={deal.tipo_orcamento}
          porte={deal.porte}
          itens={itens}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["orcamento-itens"] });
            qc.invalidateQueries({ queryKey: ["orcamento-budget"] });
          }}
        />
      )}

      {/* Entregas / escopo do job */}
      <EntregasSection budget={budget} onChanged={() => qc.invalidateQueries({ queryKey: ["orcamento-budget"] })} />

      {/* Follow-ups agendados */}
      {followUps.length > 0 && (
        <Card className="glass-card">
          <CardContent className="space-y-2 p-6">
            <p className="text-sm font-semibold text-foreground">Follow-ups agendados</p>
            {followUps.map((f: any) => (
              <div key={f.id} className="flex items-center gap-2 text-sm">
                <CalendarRange className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-foreground">
                  {formatDate(f.data_prevista)}
                </span>
                <span className="text-xs text-muted-foreground">
                  · {f.tipo === "pos_ganho" ? "pós-ganho" : f.tipo === "pos_perda" ? "pós-perda" : f.tipo} —{" "}
                  {f.descricao}
                </span>
                {f.status !== "pendente" && (
                  <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {f.status}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Briefing */}
      <BriefingSection deal={deal} onChanged={() => qc.invalidateQueries({ queryKey: ["orcamento-deal"] })} />

      {/* Mergulho / Briefing estratégico */}
      <MergulhoSection deal={deal} onChanged={() => qc.invalidateQueries({ queryKey: ["orcamento-deal"] })} />
    </div>
  );
}

function MergulhoSection({ deal, onChanged }: { deal: any; onChanged: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<Record<string, any>>(
    deal.mergulho && typeof deal.mergulho === "object" ? deal.mergulho : {},
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [consolidando, setConsolidando] = useState(false);
  const [iaResultado, setIaResultado] = useState<{ pontos_atencao: string[]; perguntas: string[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const salvar = async (d: Record<string, any>) => {
    setStatus("saving");
    const { error } = await (supabase as any).from("deals").update({ mergulho: d, mergulho_em: new Date().toISOString() }).eq("id", deal.id);
    if (error) {
      setStatus("idle");
      toast.error("Não salvou o mergulho", { description: /mergulho/i.test(error.message || "") ? "Rode 'supabase db push' pra habilitar." : error.message });
      return false;
    }
    setStatus("saved");
    onChanged();
    return true;
  };
  const onChange = (key: string, val: any) => {
    setDados((prev) => {
      const novo = { ...prev, [key]: val };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => salvar(novo), 800);
      return novo;
    });
  };

  // Garante que o deal tenha um mergulho_token (usado como gate da IA e do link).
  const garantirToken = async (): Promise<string | null> => {
    let token = deal.mergulho_token;
    if (!token) {
      token = crypto.randomUUID();
      const { error } = await (supabase as any).from("deals").update({ mergulho_token: token }).eq("id", deal.id);
      if (error) throw error;
      onChanged();
    }
    return token;
  };

  const copiarLink = async () => {
    try {
      const token = await garantirToken();
      const url = `${window.location.origin}/briefing/${token}`;
      await navigator.clipboard?.writeText(url).catch(() => {});
      toast.success("Link do briefing copiado", { description: "O cliente responde por aqui — ou use você mesmo na reunião." });
    } catch (e: any) {
      toast.error("Não gerou o link", { description: /mergulho_token|column/i.test(e.message || "") ? "Rode 'supabase db push' pra habilitar." : e.message });
    }
  };

  // INTERNO: consolida o briefing com IA e escreve na "Consolidação do projeto".
  const consolidarIA = async () => {
    setConsolidando(true);
    setIaResultado(null);
    try {
      if (timer.current) clearTimeout(timer.current);
      const token = await garantirToken();
      // Salva o que está na tela antes (a IA lê do banco pelo token).
      const salvou = await salvar(dados);
      if (!salvou) return;
      const { data, error } = await (supabase as any).functions.invoke("mergulho-ia", {
        body: { token, acao: "consolidar" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const consolidacao = (data?.consolidacao || "").toString().trim();
      if (consolidacao) {
        const novo = { ...dados, consolidacao };
        setDados(novo);
        await salvar(novo);
        setAberto(true);
      }
      setIaResultado({
        pontos_atencao: Array.isArray(data?.pontos_atencao) ? data.pontos_atencao : [],
        perguntas: Array.isArray(data?.perguntas) ? data.perguntas : [],
      });
      toast.success("Consolidado com IA", { description: "Escrevi a leitura na parte interna do time." });
    } catch (e: any) {
      const msg = e?.message || "Erro ao consolidar";
      toast.error("IA não rodou", {
        description: /ANTHROPIC_API_KEY|não configurada/i.test(msg)
          ? "Falta a chave da Anthropic no Supabase (secret ANTHROPIC_API_KEY)."
          : /not found|Failed to send|Function/i.test(msg)
          ? "Faltou publicar a função. Rode: supabase functions deploy mergulho-ia."
          : msg,
      });
    } finally {
      setConsolidando(false);
    }
  };

  return (
    <Card className="glass-card">
      <CardContent className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button onClick={() => setAberto((v) => !v)} className="flex items-center gap-2 text-left">
            {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="text-base font-semibold text-foreground">Mergulho / Briefing estratégico</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {status === "saving" ? "salvando…" : status === "saved" ? "salvo" : deal.mergulho_em ? "respondido" : ""}
            </span>
            <Button size="sm" variant="outline" onClick={consolidarIA} disabled={consolidando}>
              {consolidando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              Consolidar com IA
            </Button>
            <Button size="sm" variant="outline" onClick={copiarLink}>
              <Link2 className="mr-1 h-3.5 w-3.5" /> Copiar link do cliente
            </Button>
          </div>
        </div>
        {!aberto ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Cair de cabeça na marca antes de orçar. Mande o link pro cliente responder, ou preencha na reunião. Vai junto pro projeto quando ganhar.
          </p>
        ) : (
          <div className="mt-5">
            {iaResultado && (iaResultado.pontos_atencao.length > 0 || iaResultado.perguntas.length > 0) && (
              <div className="mb-5 rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" /> Leitura da IA
                </div>
                {iaResultado.pontos_atencao.length > 0 && (
                  <div className="mt-3">
                    <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      <AlertTriangle className="h-3 w-3" /> Pontos de atenção
                    </p>
                    <ul className="mt-1 space-y-1">
                      {iaResultado.pontos_atencao.map((p, i) => (
                        <li key={i} className="text-sm text-foreground">· {p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {iaResultado.perguntas.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Esclarecer com o cliente</p>
                    <ul className="mt-1 space-y-1">
                      {iaResultado.perguntas.map((p, i) => (
                        <li key={i} className="text-sm text-foreground">· {p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-3 text-[11px] text-muted-foreground">A consolidação foi escrita na seção interna abaixo. Edite à vontade.</p>
              </div>
            )}
            <MergulhoForm value={dados} onChange={onChange} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------ Entregas / escopo do job */

type Entrega = { titulo: string; formato: string; duracao: string; quantidade: number; diarias: number };

function EntregasSection({ budget, onChanged }: { budget: any; onChanged: () => void }) {
  const [entregas, setEntregas] = useState<Entrega[]>(
    Array.isArray(budget.entregas) ? budget.entregas : [],
  );
  const [nova, setNova] = useState({ titulo: "", formato: "", duracao: "", quantidade: "1", diarias: "0" });

  const totalEntregas = entregas.reduce((s, e) => s + (Number(e.quantidade) || 0), 0);
  const totalDiarias = entregas.reduce((s, e) => s + (Number(e.diarias) || 0), 0);

  // A lista inteira mora numa coluna jsonb: manda o array novo já pronto no
  // patch, em vez de depender do estado no momento da gravação.
  const auto = useFormAutosave<{ entregas: Entrega[] }>(
    async (patch) => {
      if (!patch.entregas) return;
      const { error } = await (supabase as any)
        .from("budgets")
        .update({ entregas: patch.entregas })
        .eq("id", budget.id);
      if (error) {
        const msg = /entregas/i.test(error.message || "")
          ? "Rode 'supabase db push' pra habilitar o salvamento das entregas (coluna nova)."
          : error.message;
        toast.error("Não salvou as entregas", { description: msg });
        throw error;
      }
      onChanged();
    },
    { delay: 300 },
  );

  // Incluir/remover é ação pontual — grava logo, sem esperar digitação.
  const aplicar = (novas: Entrega[]) => {
    setEntregas(novas);
    auto.agendar({ entregas: novas });
  };

  const add = () => {
    if (!nova.titulo.trim()) return;
    aplicar([
      ...entregas,
      {
        titulo: nova.titulo.trim(),
        formato: nova.formato.trim(),
        duracao: nova.duracao.trim(),
        quantidade: Number(nova.quantidade) || 1,
        diarias: Number(nova.diarias) || 0,
      },
    ]);
    setNova({ titulo: "", formato: "", duracao: "", quantidade: "1", diarias: "0" });
  };
  const remove = (i: number) => aplicar(entregas.filter((_, idx) => idx !== i));

  const cols = "grid grid-cols-[1.6fr_80px_90px_56px_64px_32px] items-center gap-2";

  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">Entregas / escopo</h2>
            <p className="text-[10px] text-muted-foreground">
              O que está incluso — pra produção executiva, produtor e direção saberem.
            </p>
          </div>
          <IndicadorAutosave status={auto.status} />
        </div>

        {entregas.length > 0 && (
          <div className="space-y-1">
            <div className={`${cols} border-b border-border/40 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`}>
              <span>Entrega</span>
              <span>Formato</span>
              <span>Duração</span>
              <span className="text-right">Qtd</span>
              <span className="text-right">Diárias</span>
              <span />
            </div>
            {entregas.map((e, i) => (
              <div key={i} className={`${cols} px-1 text-xs`}>
                <span className="truncate text-foreground">{e.titulo}</span>
                <span className="text-muted-foreground">{e.formato || "—"}</span>
                <span className="text-muted-foreground">{e.duracao || "—"}</span>
                <span className="text-right">{e.quantidade}</span>
                <span className="text-right">{e.diarias}</span>
                <button
                  onClick={() => remove(i)}
                  className="justify-self-end text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="flex justify-between border-t border-border/40 px-1 pt-1 text-xs">
              <span className="text-muted-foreground">
                {entregas.length} tipo(s) · {totalEntregas} entrega(s)
              </span>
              <span className="font-semibold text-foreground">{totalDiarias} diária(s)</span>
            </div>
          </div>
        )}

        <div className={cols}>
          <Input
            value={nova.titulo}
            onChange={(e) => setNova({ ...nova, titulo: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Ex.: Filme principal"
            className="h-8 text-xs"
          />
          <Input value={nova.formato} onChange={(e) => setNova({ ...nova, formato: e.target.value })} placeholder="16x9" className="h-8 text-xs" />
          <Input value={nova.duracao} onChange={(e) => setNova({ ...nova, duracao: e.target.value })} placeholder={'60"'} className="h-8 text-xs" />
          <Input type="number" value={nova.quantidade} onChange={(e) => setNova({ ...nova, quantidade: e.target.value })} className="h-8 text-xs" />
          <Input type="number" value={nova.diarias} onChange={(e) => setNova({ ...nova, diarias: e.target.value })} className="h-8 text-xs" />
          <Button size="sm" onClick={add}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------ Ações principais (3 botões) */

function AcaoBotoes({
  deal, budget, jobGerado, navigate, qc,
}: {
  deal: any;
  budget?: any;
  jobGerado?: any;
  navigate: any;
  qc: any;
}) {
  const [confirmarPerder, setConfirmarPerder] = useState(false);

  const ganhar = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("ganhar_orcamento_gerar_job", {
        _deal_id: deal.id,
        _valor_final: deal.valor_final_aprovado || deal.value || 0,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (projectId) => {
      qc.invalidateQueries({ queryKey: ["orcamento-deal", deal.id] });
      toast.success("Orçamento ganho — projeto criado", { duration: 5000 });
      navigate(`/projetos/${projectId}`);
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const perder = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("deals")
        .update({ stage: "perdido" })
        .eq("id", deal.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orcamento-deal", deal.id] });
      toast.info("Marcado como perdido — follow-up +60d agendado");
      setConfirmarPerder(false);
    },
  });

  const marcarProposta = () => {
    (supabase as any).from("deals").update({ stage: "proposta" }).eq("id", deal.id).then(() => {
      qc.invalidateQueries({ queryKey: ["orcamento-deal", deal.id] });
    });
  };

  // Reabrir um orçamento já aceito/ganho — limpa a aprovação da carta (volta a
  // pedir aprovação, com histórico) e devolve o deal pra Negociação.
  const reabrir = useMutation({
    mutationFn: async () => {
      if (jobGerado) {
        throw new Error(`Esse orçamento virou o Job #${jobGerado.numero}. Exclua o projeto antes de reabrir.`);
      }
      const { error } = await (supabase as any).rpc("carta_reabrir", { _deal_id: deal.id });
      if (error) {
        // fallback se a migration do histórico ainda não rodou
        if (/carta_reabrir|function|does not exist/i.test(error.message || "")) {
          const { error: e2 } = await (supabase as any).from("deals").update({ stage: "negociacao" }).eq("id", deal.id);
          if (e2) throw e2;
        } else {
          throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orcamento-deal", deal.id] });
      toast.info("Orçamento reaberto — voltou pra Negociação e a carta pede aprovação de novo");
    },
    onError: (e: any) => toast.error("Não deu pra reabrir", { description: e.message }),
  });
  const enviarViaLink = async () => {
    try {
      let budgetId = budget?.id;
      if (!budgetId) {
        const { data } = await (supabase as any)
          .from("budgets").select("id").eq("deal_id", deal.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        budgetId = data?.id;
      }
      if (!budgetId) {
        toast.error("Abra a planilha do orçamento antes de gerar o link");
        return;
      }
      const { data: tok, error } = await (supabase as any).rpc("carta_gerar_token", { _budget_id: budgetId });
      if (error) throw error;
      const url = `${window.location.origin}/carta/${tok}`;
      await navigator.clipboard?.writeText(url).catch(() => {});
      marcarProposta();
      toast.success("Link público copiado", {
        description: "É a carta do cliente — ele abre sem login e pode aprovar por ali.",
      });
    } catch (e: any) {
      toast.error("Não gerou o link", {
        description: /carta_gerar_token|public_token|function/i.test(e.message || "")
          ? "Rode 'supabase db push' pra habilitar o link público."
          : e.message,
      });
    }
  };
  const gerarCarta = () => {
    marcarProposta();
    navigate(`/orcamentos/${deal.id}/carta`);
  };

  if (deal.stage === "perdido") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        Orçamento foi marcado como perdido.
      </div>
    );
  }

  const ganho = isWonStage(deal.stage);

  return (
    <div className="flex flex-wrap gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={ganho}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Enviar proposta
            <ChevronDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuItem onClick={enviarViaLink}>
            <Link2 className="mr-2 h-4 w-4" />
            <span className="flex flex-col">
              <span>Copiar link do cliente</span>
              <span className="text-[10px] text-muted-foreground">Abre sem login · o cliente aprova online</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={gerarCarta}>
            <FileText className="mr-2 h-4 w-4" />
            <span className="flex flex-col">
              <span>Abrir a carta (revisar / PDF)</span>
              <span className="text-[10px] text-muted-foreground">Edita os textos e imprime em PDF</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/orcamentos/${deal.id}/carta?manual=1`)}>
            <Pencil className="mr-2 h-4 w-4" />
            <span className="flex flex-col">
              <span>Carta manual (em branco)</span>
              <span className="text-[10px] text-muted-foreground">Monta do zero, sem puxar a planilha</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {ganho ? (
        <>
          <Button
            onClick={() => jobGerado && navigate(`/projetos/${jobGerado.id}`)}
            className="bg-success text-white hover:bg-success/90"
          >
            <Trophy className="mr-1.5 h-3.5 w-3.5" />
            {jobGerado ? `Job #${jobGerado.numero} gerado` : "Orçamento ganho"}
          </Button>
          <Button
            variant="outline"
            onClick={() => reabrir.mutate()}
            disabled={reabrir.isPending}
            title={jobGerado ? "Exclua o projeto antes de reabrir" : "Volta o orçamento pra Negociação"}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reabrir
          </Button>
        </>
      ) : (
        <Button
          onClick={() => ganhar.mutate()}
          disabled={ganhar.isPending}
          className="bg-success text-white hover:bg-success/90"
        >
          <Trophy className="mr-1.5 h-3.5 w-3.5" />
          Ganhar → gerar Job
        </Button>
      )}
      {confirmarPerder ? (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-xs">
          <span>Marcar como perdido?</span>
          <Button size="sm" variant="ghost" onClick={() => setConfirmarPerder(false)}>
            Não
          </Button>
          <Button
            size="sm"
            onClick={() => perder.mutate()}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Sim
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() => setConfirmarPerder(true)}
          className="text-destructive hover:text-destructive"
        >
          <XCircle className="mr-1.5 h-3.5 w-3.5" />
          Perder
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------- Planilha (11 categorias) */

// Valor cobrado da linha = qtd × diária × valor unitário.
// diária usa ?? 1 (só null/legado vira 1); diária 0 explícito mantém a linha em R$0.
const valorDaLinha = (i: BudgetItem) =>
  Number(i.quantity || 0) * Number(i.diaria ?? 1) * Number(i.client_unit_price || 0);
// Custo real da linha = qtd × diária × custo unitário (o que ela custa de verdade).
const custoDaLinha = (i: BudgetItem) =>
  Number(i.quantity || 0) * Number(i.diaria ?? 1) * Number(i.custo_unitario || 0);

/**
 * Linha "zerada": não tem valor cobrado NEM custo — é a linha do modelo padrão
 * que este job não usa.
 *
 * O custo entra no critério de propósito: linha com custo lançado e valor
 * ainda em branco é trabalho em andamento, não sobra do template, e sumir com
 * ela no meio da digitação seria pior que a poluição que se quer resolver.
 */
const linhaZerada = (i: BudgetItem) => valorDaLinha(i) === 0 && custoDaLinha(i) === 0;

function PlanilhaSection({
  budget, categorias, itens, tipoOrcamento, porte, onChanged,
}: {
  budget: any;
  categorias: Categoria[];
  itens: BudgetItem[];
  tipoOrcamento?: string;
  porte?: string;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [percentuais, setPercentuais] = useState({
    margem: budget.margem_produtora_percent || 0,
    imposto: budget.imposto_percent || 0,
  });
  const [comissoes, setComissoes] = useState<{ nome: string; tipo: "%" | "R$"; valor: number }[]>(
    Array.isArray(budget.comissoes) ? budget.comissoes : [],
  );
  const [comissaoBase, setComissaoBase] = useState<string>(budget.comissao_base || "subtotal2");
  const [novaCom, setNovaCom] = useState<{ nome: string; tipo: "%" | "R$"; valor: string }>({
    nome: "",
    tipo: "%",
    valor: "",
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const hidratado = useRef(false);

  // Grupos (categorias) ocultos deste orçamento — some da planilha e sai do cálculo.
  const [ocultas, setOcultas] = useState<string[]>(
    Array.isArray(budget.categorias_ocultas) ? budget.categorias_ocultas : [],
  );
  const ocultasSet = useMemo(() => new Set(ocultas), [ocultas]);
  const salvarOcultas = useMutation({
    mutationFn: async (lista: string[]) => {
      const { error } = await (supabase as any)
        .from("budgets")
        .update({ categorias_ocultas: lista })
        .eq("id", budget.id);
      if (error) throw error;
    },
    onError: (e: any) =>
      toast.error("Não salvou os grupos", {
        description: /categorias_ocultas/i.test(e.message || "")
          ? "Rode 'supabase db push' pra habilitar."
          : e.message,
      }),
  });
  const toggleOculta = (catId: string, ocultar: boolean) => {
    const lista = ocultar ? [...ocultas, catId] : ocultas.filter((x) => x !== catId);
    setOcultas(lista);
    salvarOcultas.mutate(lista);
  };

  const itensPorCategoria = useMemo(() => {
    const m = new Map<string, BudgetItem[]>();
    itens.forEach((i) => {
      const key = i.categoria_id || "sem_categoria";
      m.set(key, [...(m.get(key) || []), i]);
    });
    return m;
  }, [itens]);

  // Filtra categorias pelo tipo de orçamento (só produção = sem pós; só pós = só pós;
  // geral/fotos/ia = tudo). Mantém categoria que já tenha item, pra não sumir dado.
  const categoriasVisiveis = useMemo(() => {
    const isPos = (c: Categoria) => c.codigo === "011" || /p[óo]s\s*produ/i.test(c.nome || "");
    return categorias.filter((c) => {
      if (ocultasSet.has(c.id)) return false;                 // grupo excluído deste orçamento
      if ((itensPorCategoria.get(c.id)?.length ?? 0) > 0) return true;
      if (tipoOrcamento === "so_pos_producao") return isPos(c);
      if (tipoOrcamento === "so_producao") return !isPos(c);
      return true;
    });
  }, [categorias, itensPorCategoria, tipoOrcamento, ocultasSet]);
  // Grupos escondidos, pra oferecer reinclusão.
  const categoriasOcultas = useMemo(
    () => categorias.filter((c) => ocultasSet.has(c.id)),
    [categorias, ocultasSet],
  );

  const valorItem = valorDaLinha;
  const custoItem = custoDaLinha;

  /**
   * Recolher as linhas zeradas.
   *
   * A planilha padrão abre com ~90 linhas e um job usa 15. As outras 75 ficam
   * em R$0 competindo por atenção com as que valem — e é nesse meio que passa
   * o erro de digitação. Um clique some com todas, outro devolve.
   *
   * Não é destrutivo e não persiste: é modo de leitura, não configuração do
   * orçamento. Grupo excluído (o olho ao lado do nome) continua sendo outra
   * coisa — aquilo muda o cálculo, isto não.
   */
  const [soPreenchidos, setSoPreenchidos] = useState(false);
  const zeradas = useMemo(() => itens.filter(linhaZerada).length, [itens]);
  const categoriasNaTela = useMemo(() => {
    if (!soPreenchidos) return categoriasVisiveis;
    return categoriasVisiveis.filter((c) =>
      (itensPorCategoria.get(c.id) || []).some((i) => !linhaZerada(i)),
    );
  }, [categoriasVisiveis, itensPorCategoria, soPreenchidos]);
  const gruposEscondidos = categoriasVisiveis.length - categoriasNaTela.length;

  const totaisPorCategoria = useMemo(() => {
    const m = new Map<string, number>();
    itens.forEach((i) => {
      const key = i.categoria_id || "sem_categoria";
      m.set(key, (m.get(key) || 0) + valorItem(i));
    });
    return m;
  }, [itens]);

  // Só as linhas de grupos NÃO ocultos entram nos totais e na rentabilidade.
  const itensAtivos = useMemo(
    () => itens.filter((i) => !ocultasSet.has(i.categoria_id || "")),
    [itens, ocultasSet],
  );

  const custoProducao = useMemo(
    () => itensAtivos.reduce((s, i) => s + valorItem(i), 0),
    [itensAtivos],
  );
  // Custo real total (soma dos custos por linha) e a sobra (o que cada linha
  // deixa acima do custo). Rentabilidade = margem da produtora + sobra das linhas.
  const custoReal = useMemo(
    () => itensAtivos.reduce((s, i) => s + custoItem(i), 0),
    [itensAtivos],
  );
  const sobraLinhas = custoProducao - custoReal;
  const baseSemTaxa = useMemo(
    () => itensAtivos.filter((i) => !i.tira_taxa).reduce((s, i) => s + valorItem(i), 0),
    [itensAtivos],
  );
  const margemValor = baseSemTaxa * (Number(percentuais.margem) / 100);
  const subTotal2 = custoProducao + margemValor;
  const baseComissao = comissaoBase === "subtotal1" ? custoProducao : subTotal2;
  const comissaoTotal = comissoes.reduce(
    (s, c) => s + (c.tipo === "%" ? baseComissao * (Number(c.valor) / 100) : Number(c.valor)),
    0,
  );
  const imposto = (subTotal2 + comissaoTotal) * (Number(percentuais.imposto) / 100);
  const valorTotal = subTotal2 + comissaoTotal + imposto;
  // O valor cobrado é sempre arredondado pra cima de 50 em 50 (número "limpo"
  // pro cliente). O excedente do arredondamento entra como lucro.
  const valorTotalArredondado = roundUpTo50(valorTotal);

  const addComissao = () => {
    if (!novaCom.nome.trim() || !novaCom.valor) return;
    setComissoes([...comissoes, { nome: novaCom.nome.trim(), tipo: novaCom.tipo, valor: Number(novaCom.valor) }]);
    setNovaCom({ nome: "", tipo: "%", valor: "" });
  };
  const removeComissao = (idx: number) => setComissoes(comissoes.filter((_, i) => i !== idx));

  /**
   * Tira (ou devolve) o GRUPO inteiro da base da margem.
   *
   * Grupo inteiro fora é o caso comum — elenco, cachê, tudo que é repasse.
   * Marcar item a item é trabalho à toa e é onde se esquece um.
   */
  const marcarGrupoForaDaTaxa = async (categoriaId: string, fora: boolean) => {
    const alvos = itens.filter((i) => (i.categoria_id || "") === categoriaId);
    if (!alvos.length) return;
    const { error } = await (supabase as any)
      .from("budget_items").update({ tira_taxa: fora }).in("id", alvos.map((i) => i.id));
    if (error) return toast.error("Não deu", { description: error.message });
    onChanged();
    toast.success(fora ? `${alvos.length} itens fora da taxa` : `${alvos.length} itens de volta na taxa`);
  };

  const toggleCat = (id: string) => {
    const s = new Set(expandidas);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpandidas(s);
  };

  const salvarPercentuais = useMutation({
    mutationFn: async () => {
      const base = {
        margem_produtora_percent: percentuais.margem,
        imposto_percent: percentuais.imposto,
        total_value: valorTotalArredondado,
      };
      // Tenta salvar com as comissões; se a coluna ainda não existe (migration
      // não aplicada), salva só o resto pra não travar o Salvar.
      let { error } = await (supabase as any)
        .from("budgets")
        .update({ ...base, comissoes, comissao_base: comissaoBase })
        .eq("id", budget.id);
      if (error && /comiss/i.test(error.message || "")) {
        ({ error } = await (supabase as any).from("budgets").update(base).eq("id", budget.id));
      }
      if (error) throw error;
    },
    onSuccess: () => setSaveStatus("saved"),
    onError: (e: any) => {
      setSaveStatus("idle");
      toast.error("Erro ao salvar", { description: e.message });
    },
  });

  // Auto-save: salva %/imposto/comissões E o valor total (que muda quando as
  // linhas mudam) sozinho (debounce). Assim o total_value no banco — lido pelo
  // pipeline e pela carta — fica sempre atualizado.
  useEffect(() => {
    if (!hidratado.current) { hidratado.current = true; return; }
    setSaveStatus("saving");
    const t = setTimeout(() => salvarPercentuais.mutate(), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percentuais.margem, percentuais.imposto, comissoes, comissaoBase, valorTotalArredondado]);

  // Planilha vazia → popular com os itens padrão de produtora
  const carregarPadrao = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("seed_budget_items", {
        _budget_id: budget.id,
        _porte: porte || "grande",
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      onChanged();
      toast.success(`${n} itens padrão carregados`);
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  // Rentabilidade real = taxa da produtora + sobra das linhas da planilha.
  // (Comissão e imposto são pass-through — o cliente paga e a produtora repassa —
  //  então se cancelam e não entram no lucro.)
  // Rentabilidade a partir do valor arredondado (inclui o excedente do
  // arredondamento como lucro), pra Total e Rentabilidade ficarem coerentes.
  const rentabilidade = valorTotalArredondado - custoReal - imposto - comissaoTotal;
  const margemPercent = valorTotalArredondado > 0 ? (rentabilidade / valorTotalArredondado) * 100 : 0;

  // "Salvar como padrão" — fixa margem/imposto/comissões pros próximos orçamentos
  const salvarPadrao = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("orcamento_padroes").upsert({
        id: true,
        margem: percentuais.margem,
        imposto: percentuais.imposto,
        comissoes,
        comissao_base: comissaoBase,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Padrão salvo — novos orçamentos já nascem assim"),
    onError: (e: any) => toast.error("Não salvou o padrão", { description: /orcamento_padroes/i.test(e.message || "") ? "Rode 'supabase db push' pra habilitar os padrões." : e.message }),
  });

  // "Usar como proposta" — leva o valor total (arredondado pra cima de 50) pro deal
  const usarComoProposta = useMutation({
    mutationFn: async () => {
      await salvarPercentuais.mutateAsync();
      const valorProposta = valorTotalArredondado;
      const { error } = await (supabase as any)
        .from("deals")
        .update({ valor_proposta: valorProposta, value: valorProposta })
        .eq("id", budget.deal_id);
      if (error) throw error;
    },
    onSuccess: () => {
      onChanged();
      toast.success(`Proposta definida: ${formatCurrency(valorTotalArredondado)}`, {
        description: "Valor total da planilha, arredondado pra cima de 50 em 50.",
      });
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <>
    <Card className="glass-card">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Table className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Planilha de produção</h2>
          <div className="ml-auto flex gap-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Salva sozinho — não precisa clicar">
              {saveStatus === "saving" ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> salvando…</>
              ) : saveStatus === "saved" ? (
                <><CheckCircle2 className="h-3 w-3 text-success" /> salvo</>
              ) : (
                <>salva automático</>
              )}
            </span>
            <Button size="sm" variant="outline" onClick={() => usarComoProposta.mutate()} disabled={usarComoProposta.isPending}>
              <Upload className="mr-1 h-3.5 w-3.5" />
              Usar como proposta
            </Button>
            <Button size="sm" variant="ghost" onClick={() => salvarPadrao.mutate()} disabled={salvarPadrao.isPending} title="Fixa margem/imposto/comissões pros próximos orçamentos">
              Salvar como padrão
            </Button>
          </div>
        </div>

        {/* Cabeçalho percentuais + total */}
        <div className="grid gap-3 rounded-lg border border-border/50 bg-muted/20 p-4 md:grid-cols-[1fr_1fr_1fr_1fr]">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Subtotal das linhas</p>
            <p className="text-sm font-medium text-foreground">{formatCurrency(custoProducao)}</p>
            <p className="text-[10px] text-muted-foreground">custo real {formatCurrency(custoReal)} · taxa sobre {formatCurrency(baseSemTaxa)}</p>
          </div>
          <PctInput
            label="Margem da produtora"
            value={percentuais.margem}
            onChange={(v) => setPercentuais({ ...percentuais, margem: v })}
            valorCalc={margemValor}
            hint="sobre base sem taxa"
          />
          <PctInput
            label="Imposto"
            value={percentuais.imposto}
            onChange={(v) => setPercentuais({ ...percentuais, imposto: v })}
            valorCalc={imposto}
            hint="sobre sub-total 2 + comissões"
          />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor total</p>
            <p className="text-lg font-semibold text-primary">{formatCurrency(valorTotalArredondado)}</p>
          </div>
        </div>

        {/* Comissões por pessoa (entram no valor total) */}
        <div className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Comissões por pessoa</p>
              <p className="text-[10px] text-muted-foreground">Entram automaticamente no valor total.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Comissão sobre</span>
              <select
                value={comissaoBase}
                onChange={(e) => setComissaoBase(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              >
                <option value="subtotal1">Sub-Total 1 (custo)</option>
                <option value="subtotal2">Sub-Total 2 (custo + margem)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={novaCom.nome}
              onChange={(e) => setNovaCom({ ...novaCom, nome: e.target.value })}
              placeholder="Nome da pessoa"
              className="h-8 min-w-[140px] flex-1"
            />
            <select
              value={novaCom.tipo}
              onChange={(e) => setNovaCom({ ...novaCom, tipo: e.target.value as "%" | "R$" })}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            >
              <option value="%">%</option>
              <option value="R$">R$</option>
            </select>
            <Input
              type="number"
              value={novaCom.valor}
              onChange={(e) => setNovaCom({ ...novaCom, valor: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && addComissao()}
              placeholder="Valor"
              className="h-8 w-24"
            />
            <Button size="sm" onClick={addComissao}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {comissoes.length > 0 && (
            <div className="space-y-1">
              {comissoes.map((c, i) => {
                const v = c.tipo === "%" ? baseComissao * (Number(c.valor) / 100) : Number(c.valor);
                return (
                  <div key={i} className="grid grid-cols-[1fr_70px_110px_32px] items-center gap-2 text-xs">
                    <span className="truncate text-foreground">{c.nome || "—"}</span>
                    <span className="text-right text-muted-foreground">
                      {c.tipo === "%" ? `${c.valor}%` : formatCurrency(Number(c.valor))}
                    </span>
                    <span className="text-right font-medium text-foreground">{formatCurrency(v)}</span>
                    <button
                      onClick={() => removeComissao(i)}
                      className="justify-self-end text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
              <div className="flex justify-between border-t border-border/40 pt-1 text-xs">
                <span className="text-muted-foreground">Total de comissões</span>
                <span className="font-semibold text-foreground">{formatCurrency(comissaoTotal)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Rentabilidade real do job — taxa da produtora + sobra das linhas */}
        <div className="grid gap-3 rounded-lg border border-success/30 bg-success/5 p-4 md:grid-cols-[1fr_1fr_1fr_1.4fr]">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Taxa da produtora</p>
            <p className="text-sm font-medium text-foreground">{formatCurrency(margemValor)}</p>
            <p className="text-[10px] text-muted-foreground">margem {percentuais.margem || 0}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">+ Sobra das linhas</p>
            <p className={`text-sm font-medium ${sobraLinhas >= 0 ? "text-foreground" : "text-destructive"}`}>{formatCurrency(sobraLinhas)}</p>
            <p className="text-[10px] text-muted-foreground">valor cobrado − custo real</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Custo real das linhas</p>
            <p className="text-sm font-medium text-foreground">{formatCurrency(custoReal)}</p>
            <p className="text-[10px] text-muted-foreground">de {formatCurrency(custoProducao)} cobrado</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Rentabilidade</p>
            <p className={`text-lg font-semibold ${rentabilidade >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(rentabilidade)}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/40">
                <div
                  className={`h-full rounded-full ${rentabilidade >= 0 ? "bg-success" : "bg-destructive"}`}
                  style={{ width: `${Math.min(100, Math.max(0, margemPercent))}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                margem {margemPercent.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Planilha vazia → carregar itens padrão */}
        {itens.length === 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border/60 bg-muted/10 p-4">
            <p className="text-xs text-muted-foreground">
              Planilha vazia — carregue os itens padrão de produtora (Pré-Produção, Produção,
              Transporte, Elenco, Equipe Técnica…) e preencha só o que o job usa.
            </p>
            <Button
              size="sm"
              onClick={() => carregarPadrao.mutate()}
              disabled={carregarPadrao.isPending}
              className="shrink-0 bg-primary text-primary-foreground"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Carregar itens padrão
            </Button>
          </div>
        )}

        {/* Diz de que total é o percentual — senão "18%" não quer dizer nada */}
        {itens.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-[11px] text-muted-foreground">
              O <span className="text-foreground">%</span> é o peso do grupo na soma das linhas
              ({formatCurrency(custoProducao)}). Margem, comissão e imposto entram por cima, iguais pra todos.
            </p>
            {(zeradas > 0 || soPreenchidos) && (
              <button
                onClick={() => setSoPreenchidos((v) => !v)}
                title={soPreenchidos
                  ? "Mostrar de volta todas as linhas da planilha"
                  : "Some com as linhas em R$0 — nada é apagado, é só a vista"}
                className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                  soPreenchidos
                    ? "border-foreground/25 bg-muted/40 text-foreground"
                    : "border-border/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                }`}
              >
                {soPreenchidos ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {soPreenchidos
                  ? `Mostrar tudo (${zeradas} zerada${zeradas === 1 ? "" : "s"} oculta${zeradas === 1 ? "" : "s"})`
                  : `Recolher ${zeradas} linha${zeradas === 1 ? "" : "s"} zerada${zeradas === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        )}

        {/* Categorias */}
        <div className="space-y-2">
          {categoriasNaTela.map((cat) => {
            const itensCat = itensPorCategoria.get(cat.id) || [];
            const totalCat = totaisPorCategoria.get(cat.id) || 0;
            const aberta = expandidas.has(cat.id);
            // Peso do grupo na soma das linhas — onde o orçamento pesa de
            // verdade. A base é a soma dos grupos ativos (não o total cobrado)
            // pra que os percentuais somem 100% e dê pra comparar de bater o
            // olho; margem e imposto incidem por cima, iguais pra todo grupo.
            const peso = custoProducao > 0 ? (totalCat / custoProducao) * 100 : 0;
            const maiorPeso = peso >= 25;
            // Quantos itens do grupo estão fora da taxa. Grupo inteiro fora é
            // o caso comum (elenco, cachê) — marcar item a item é trabalho à
            // toa, e sem o contador ninguém sabe que o grupo está misto.
            const foraDaTaxa = itensCat.filter((i: any) => i.tira_taxa).length;
            const todosFora = itensCat.length > 0 && foraDaTaxa === itensCat.length;
            return (
              <div key={cat.id} className="rounded-lg border border-border/50">
                <div className="flex w-full items-center gap-3 px-4 py-2.5">
                  <button
                    onClick={() => toggleCat(cat.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    {aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-mono text-[10px] text-muted-foreground">{cat.codigo}</span>
                    {/* Grupo sem nenhum real dentro fica apagado: a varredura
                        de cima pra baixo passa direto por ele. */}
                    <span className={`text-sm ${totalCat > 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {cat.nome}
                    </span>
                    <span className="ml-auto flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground">{itensCat.length}</span>
                      <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block">
                        <span
                          className={`block h-full rounded-full ${maiorPeso ? "bg-warning" : "bg-primary/50"}`}
                          style={{ width: `${Math.min(100, peso)}%` }}
                        />
                      </span>
                      <span
                        className={`w-11 text-right text-xs tabular-nums ${maiorPeso ? "font-semibold text-warning" : "text-muted-foreground"}`}
                        title="peso deste grupo na soma das linhas"
                      >
                        {peso >= 0.05 ? `${peso.toFixed(1)}%` : "—"}
                      </span>
                      <span className={`w-28 text-right text-sm ${totalCat > 0 ? "font-semibold text-foreground" : "text-muted-foreground/60"}`}>
                        {formatCurrency(totalCat)}
                      </span>
                    </span>
                  </button>
                  {itensCat.length > 0 && (
                    <button
                      onClick={() => marcarGrupoForaDaTaxa(cat.id, !todosFora)}
                      title={todosFora
                        ? "Este grupo inteiro está fora da base da margem — clique pra devolver"
                        : `Tirar os ${itensCat.length} itens deste grupo da base da margem`}
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                        foraDaTaxa === 0
                          ? "text-muted-foreground hover:bg-muted/40"
                          : "bg-warning/15 font-medium text-warning"
                      }`}
                    >
                      {foraDaTaxa === 0
                        ? "fora da taxa"
                        : todosFora ? "grupo fora da taxa" : `${foraDaTaxa}/${itensCat.length} fora`}
                    </button>
                  )}
                  <button
                    onClick={() => toggleOculta(cat.id, true)}
                    title="Excluir este grupo do orçamento (dá pra reincluir depois)"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                </div>
                {aberta && (
                  <CategoriaItens
                    budgetId={budget.id}
                    categoriaId={cat.id}
                    codigo={cat.codigo}
                    catNome={cat.nome}
                    itens={itensCat}
                    esconderZeradas={soPreenchidos}
                    onChanged={onChanged}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Grupo inteiro zerado some junto — mas dito em voz alta, senão
            parece que o orçamento perdeu categoria. */}
        {soPreenchidos && gruposEscondidos > 0 && (
          <p className="px-1 text-[11px] text-muted-foreground">
            {gruposEscondidos} grupo{gruposEscondidos === 1 ? "" : "s"} sem nenhuma linha preenchida
            {gruposEscondidos === 1 ? " está recolhido" : " estão recolhidos"} — nada foi apagado.
          </p>
        )}

        {/* Grupos excluídos deste orçamento — clique pra reincluir */}
        {categoriasOcultas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/50 bg-muted/10 p-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Grupos ocultos</span>
            {categoriasOcultas.map((c) => (
              <button
                key={c.id}
                onClick={() => toggleOculta(c.id, false)}
                title="Reincluir este grupo no orçamento"
                className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                <span className="font-mono text-[10px]">{c.codigo}</span>
                {c.nome}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Barra fixa: total + rentabilidade sempre na tela (ajuda no orçamento grande) */}
    <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-full border border-border/60 bg-card/95 px-5 py-2 shadow-lg backdrop-blur">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
        <span className="text-sm font-semibold text-primary">{formatCurrency(valorTotalArredondado)}</span>
      </div>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-baseline gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Rentab.</span>
        <span className={`text-sm font-semibold ${rentabilidade >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(rentabilidade)}</span>
        <span className="text-[10px] text-muted-foreground">{margemPercent.toFixed(0)}%</span>
      </div>
    </div>
    </>
  );
}

function PctInput({
  label, value, onChange, valorCalc, hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  valorCalc: number;
  hint: string;
}) {
  // Input de texto controlado: evita o "0" grudado do input number e cresce com o número.
  const [buf, setBuf] = useState(value ? String(value) : "");
  useEffect(() => {
    const bn = buf.trim() === "" ? 0 : Number(buf.replace(",", "."));
    if (bn !== value) setBuf(value ? String(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const handle = (raw: string) => {
    const cleaned = raw.replace(/[^\d.,]/g, "").replace(/^0+(?=\d)/, "");
    setBuf(cleaned);
    const n = cleaned.trim() === "" ? 0 : Number(cleaned.replace(",", "."));
    if (!Number.isNaN(n)) onChange(n);
  };
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          value={buf}
          onChange={(e) => handle(e.target.value)}
          placeholder="0"
          style={{ width: `calc(${Math.max(1, buf.length)}ch + 1.9rem)` }}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <span className="text-xs">%</span>
        <span className="text-xs">= {formatCurrency(valorCalc)}</span>
      </div>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function CategoriaItens({
  budgetId, categoriaId, codigo, catNome, itens, esconderZeradas, onChanged,
}: {
  budgetId: string;
  categoriaId: string;
  codigo: string;
  catNome: string;
  itens: BudgetItem[];
  esconderZeradas: boolean;
  onChanged: () => void;
}) {
  const [novaDesc, setNovaDesc] = useState("");
  // Item recém-adicionado nasce em R$0 e sumiria na hora com o modo recolhido
  // ligado — digitar a descrição e ver a linha desaparecer é o pior jeito de
  // descobrir que o modo existe. Uma vez criado aqui, fica visível.
  const [recemCriados, setRecemCriados] = useState<Set<string>>(new Set());

  // Pós-produção é orçada por HORA (não por diária) — muda só os rótulos das colunas.
  const porHora = codigo === "011" || /p[óo]s\s*produ/i.test(catNome || "");

  const adicionar = useMutation({
    mutationFn: async () => {
      if (!novaDesc.trim()) throw new Error("Informe a descrição");
      const { data, error } = await (supabase as any).from("budget_items").insert({
        budget_id: budgetId,
        categoria_id: categoriaId,
        category: catNome,     // legado NOT NULL
        descricao: novaDesc,
        item_name: novaDesc,   // legado NOT NULL
        quantity: 1,
        diaria: 1,
        client_unit_price: 0,
        client_price: 0,
        tira_taxa: false,
        ordem: itens.length + 1,
      }).select("id").single();
      if (error) throw error;
      return data?.id as string | undefined;
    },
    onSuccess: (id) => {
      if (id) setRecemCriados((s) => new Set(s).add(id));
      setNovaDesc("");
      onChanged();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const escondida = (i: BudgetItem) =>
    esconderZeradas && linhaZerada(i) && !recemCriados.has(i.id);
  const ocultas = itens.filter(escondida).length;

  return (
    <div className="border-t border-border/40">
      <div className="grid grid-cols-[70px_1.2fr_60px_70px_95px_95px_95px_0.9fr_72px_36px] gap-2 border-b border-border/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span />
        <span>Descrição</span>
        <span>QTD</span>
        <span>{porHora ? "Horas" : "Diária"}</span>
        <span>{porHora ? "Valor/hora" : "Valor unit."}</span>
        <span>{porHora ? "Custo/hora" : "Custo unit."}</span>
        <span className="text-right">Valor</span>
        <span>Observações</span>
        <span className="text-center" title="Item marcado NÃO entra na base da margem da produtora">Fora da taxa</span>
        <span />
      </div>
      {/* O índice sai da posição REAL na lista: recolher não pode renumerar as
          linhas, senão o 011.007 de ontem vira outro item hoje. */}
      {itens.map((it, idx) =>
        escondida(it) ? null : (
          <BudgetItemRow key={it.id} item={it} codigo={codigo} idx={idx + 1} onChanged={onChanged} />
        ),
      )}
      {ocultas > 0 && (
        <p className="border-b border-border/30 px-4 py-1.5 text-[11px] text-muted-foreground">
          {ocultas} linha{ocultas === 1 ? "" : "s"} zerada{ocultas === 1 ? "" : "s"} recolhida{ocultas === 1 ? "" : "s"} neste grupo
        </p>
      )}
      <div className="flex items-center gap-2 px-4 py-2">
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={novaDesc}
          onChange={(e) => setNovaDesc(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && adicionar.mutate()}
          placeholder="Adicionar item em..."
          className="h-8 text-sm"
        />
        <Button size="sm" onClick={() => adicionar.mutate()}>
          Adicionar
        </Button>
      </div>
    </div>
  );
}

// Campo numérico da planilha: text controlado (sem o "0" grudado do input number).
function NumCell({ value, onChange, onCommit }: { value: number; onChange: (n: number) => void; onCommit: () => void }) {
  const [buf, setBuf] = useState(String(value ?? 0));
  useEffect(() => {
    const bn = buf.trim() === "" ? 0 : Number(buf.replace(",", "."));
    if (bn !== value) setBuf(String(value ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={buf}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^\d.,]/g, "").replace(/^0+(?=\d)/, "");
        setBuf(cleaned);
        onChange(cleaned.trim() === "" ? 0 : Number(cleaned.replace(",", ".")) || 0);
      }}
      onBlur={onCommit}
      className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
    />
  );
}

function BudgetItemRow({
  item, codigo, idx, onChanged,
}: {
  item: BudgetItem;
  codigo: string;
  idx: number;
  onChanged: () => void;
}) {
  const [row, setRow] = useState({
    descricao: item.descricao || (item as any).item_name || "",
    quantity: item.quantity ?? 1,
    diaria: item.diaria ?? 1,
    client_unit_price: item.client_unit_price ?? 0,
    custo_unitario: item.custo_unitario ?? 0,
    tira_taxa: item.tira_taxa,
    observacoes: item.observacoes || "",
  });
  const valor = row.quantity * row.diaria * row.client_unit_price;
  const custoLinha = row.quantity * row.diaria * row.custo_unitario;
  const sobra = valor - custoLinha;

  const salvar = useMutation({
    mutationFn: async () => {
      const base = {
        descricao: row.descricao,
        item_name: row.descricao,
        quantity: row.quantity,
        diaria: row.diaria,
        client_unit_price: row.client_unit_price,
        client_price: valor,   // total da linha — lido por Fechamento/Proposta
        tira_taxa: row.tira_taxa,
        observacoes: row.observacoes,
      };
      // Tenta salvar com o custo; se a coluna ainda não existe (migration não
      // aplicada), salva o resto pra não travar a edição da linha.
      let { error } = await (supabase as any)
        .from("budget_items")
        .update({ ...base, custo_unitario: row.custo_unitario })
        .eq("id", item.id);
      if (error && /custo_unitario/i.test(error.message || "")) {
        ({ error } = await (supabase as any).from("budget_items").update(base).eq("id", item.id));
      }
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  const excluir = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("budget_items").delete().eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  // Linha sem nenhum número é ruído de fundo: fica apagada até o mouse passar
  // ou o cursor entrar nela. Só cinza — cor nesta planilha já quer dizer
  // "fora da taxa" e "sobra negativa", e um terceiro significado colorido
  // faria a tela inteira gritar de novo.
  const vazia = valor === 0 && custoLinha === 0;

  return (
    <div className={`grid grid-cols-[70px_1.2fr_60px_70px_95px_95px_95px_0.9fr_72px_36px] gap-2 border-b border-border/30 px-4 py-1.5 transition-opacity last:border-0 ${
      row.tira_taxa ? "bg-warning/[0.06]" : ""
    } ${vazia ? "opacity-45 focus-within:opacity-100 hover:opacity-100" : ""}`}>
      <span className="font-mono text-[10px] text-muted-foreground">
        {codigo}.{String(idx).padStart(3, "0")}
      </span>
      <Input
        value={row.descricao}
        onChange={(e) => setRow({ ...row, descricao: e.target.value })}
        onBlur={() => salvar.mutate()}
        className="h-7 text-xs"
      />
      <NumCell value={row.quantity} onChange={(n) => setRow({ ...row, quantity: n })} onCommit={() => salvar.mutate()} />
      <NumCell value={row.diaria} onChange={(n) => setRow({ ...row, diaria: n })} onCommit={() => salvar.mutate()} />
      <NumCell value={row.client_unit_price} onChange={(n) => setRow({ ...row, client_unit_price: n })} onCommit={() => salvar.mutate()} />
      <NumCell value={row.custo_unitario} onChange={(n) => setRow({ ...row, custo_unitario: n })} onCommit={() => salvar.mutate()} />
      <span
        className={`text-right text-xs tabular-nums ${vazia ? "text-muted-foreground/60" : "font-medium text-foreground"}`}
        title={`Custo ${formatCurrency(custoLinha)} · sobra ${formatCurrency(sobra)}`}
      >
        {formatCurrency(valor)}
        {/* Sobra só quando há dinheiro na linha: "+R$ 0,00" em verde repetido
            oitenta vezes era metade do ruído da planilha. */}
        {!vazia && (
          <span className={`block text-[9px] ${sobra >= 0 ? "text-success" : "text-destructive"}`}>
            {sobra >= 0 ? "+" : ""}{formatCurrency(sobra)}
          </span>
        )}
      </span>
      <Input
        value={row.observacoes}
        onChange={(e) => setRow({ ...row, observacoes: e.target.value })}
        onBlur={() => salvar.mutate()}
        className="h-7 text-xs"
        placeholder="—"
      />
      {/* "Fora da taxa": este item não entra na base da margem. Era uma
          caixinha muda de 14px sob o rótulo "T. taxa" — existia e ninguém
          via. Agora tem texto do lado e a linha inteira muda de cara quando
          marcada, que é o que permite conferir a planilha de bater o olho. */}
      <label
        className={`flex cursor-pointer items-center justify-center gap-1 rounded px-1 py-0.5 text-[10px] transition-colors ${
          row.tira_taxa ? "bg-warning/15 font-medium text-warning" : "text-muted-foreground hover:bg-muted/40"
        }`}
        title={row.tira_taxa
          ? "Fora da taxa: este item NÃO entra na base da margem da produtora"
          : "Marcar pra tirar este item da base da margem da produtora"}
      >
        <input
          type="checkbox"
          checked={row.tira_taxa}
          onChange={(e) => {
            setRow({ ...row, tira_taxa: e.target.checked });
            setTimeout(() => salvar.mutate(), 0);
          }}
          className="h-3.5 w-3.5 accent-warning"
        />
        {row.tira_taxa ? "fora" : ""}
      </label>
      <button onClick={() => excluir.mutate()} className="text-muted-foreground hover:text-destructive">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}


/* -------------------------------------------------------- Briefing */

function BriefingSection({ deal, onChanged }: { deal: any; onChanged: () => void }) {
  // Aberto por padrão — no Catalunya o briefing fica visível na página
  const [aberto, setAberto] = useState(true);
  const [form, setForm] = useState({
    title: deal.title,
    canal_entrada: deal.canal_entrada || "",
    tipo_orcamento: deal.tipo_orcamento || "",
    precisa_roteiro: deal.precisa_roteiro || "",
    precisa_elenco: deal.precisa_elenco || "",
    local_filmagem: deal.local_filmagem || "",
    moeda: deal.moeda || "BRL",
    objetivo: deal.objetivo || "",
    formatos: deal.formatos || [],
    meios_veiculacao: deal.meios_veiculacao || [],
    verba_estimada: deal.verba_estimada || "",
    valor_proposta: deal.valor_proposta || "",
    valor_final_aprovado: deal.valor_final_aprovado || "",
  });
  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  // Campos que o formulário guarda como texto mas o banco espera número.
  const NUMERICOS = ["verba_estimada", "valor_proposta", "valor_final_aprovado"];

  const auto = useFormAutosave<Record<string, unknown>>(async (patch) => {
    const campos = Object.fromEntries(
      Object.entries(patch).map(([k, v]) => {
        if (NUMERICOS.includes(k)) return [k, v ? Number(v) : null];
        if (Array.isArray(v)) return [k, v]; // formatos / meios de veiculação
        if (k === "title" || k === "moeda") return [k, v]; // obrigatórios, não viram null
        return [k, v === "" ? null : v];
      }),
    );
    const { error } = await (supabase as any).from("deals").update(campos).eq("id", deal.id);
    if (error) {
      toast.error("Não salvou o briefing", { description: error.message });
      throw error;
    }
    onChanged();
  });

  const set = (campo: string, valor: unknown) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    auto.agendar({ [campo]: valor });
  };

  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 p-6">
        <button onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-2">
          {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <h2 className="text-base font-semibold text-foreground">Briefing</h2>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
            editar
          </span>
        </button>

        {aberto && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Título do orçamento *</Label>
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
              </div>
              <Field label="Canal de entrada"><Select value={form.canal_entrada} onValueChange={(v) => set("canal_entrada", v)}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{CANAIS_ENTRADA.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent></Select></Field>
              <Field label="Tipo de orçamento"><Select value={form.tipo_orcamento} onValueChange={(v) => set("tipo_orcamento", v)}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{TIPOS_ORCAMENTO.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent></Select></Field>
              <Field label="Roteiro"><Select value={form.precisa_roteiro} onValueChange={(v) => set("precisa_roteiro", v)}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{PRECISA_ROTEIRO.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent></Select></Field>
              <Field label="Elenco"><Select value={form.precisa_elenco} onValueChange={(v) => set("precisa_elenco", v)}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{PRECISA_ELENCO.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent></Select></Field>
              <Field label="Local da filmagem"><Input value={form.local_filmagem} onChange={(e) => set("local_filmagem", e.target.value)} /></Field>
              <Field label="Moeda"><Select value={form.moeda} onValueChange={(v) => set("moeda", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MOEDAS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent></Select></Field>
            </div>

            <Field label="Objetivo do vídeo">
              <Textarea rows={5} value={form.objetivo} onChange={(e) => set("objetivo", e.target.value)} />
            </Field>

            <div className="grid gap-6 md:grid-cols-2">
              <ChipGroup
                label="Formatos"
                options={FORMATOS as any}
                value={form.formatos}
                onChange={(v) => set("formatos", toggle(form.formatos, v))}
              />
              <ChipGroup
                label="Meio de veiculação"
                options={MEIOS_VEICULACAO as any}
                value={form.meios_veiculacao}
                onChange={(v) => set("meios_veiculacao", toggle(form.meios_veiculacao, v))}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Verba estimada">
                <Input type="number" value={form.verba_estimada} onChange={(e) => set("verba_estimada", e.target.value)} />
              </Field>
              <Field label="Valor de proposta">
                <Input type="number" value={form.valor_proposta} onChange={(e) => set("valor_proposta", e.target.value)} />
              </Field>
              <Field label="Valor final aprovado">
                <Input type="number" value={form.valor_final_aprovado} onChange={(e) => set("valor_final_aprovado", e.target.value)} />
              </Field>
            </div>

            <div className="flex justify-end">
              <IndicadorAutosave status={auto.status} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ChipGroup({
  label, options, value, onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                on ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground"
              }`}
            >
              <span className={`h-3 w-3 rounded-sm border ${on ? "border-primary bg-primary" : "border-border"}`} />
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
