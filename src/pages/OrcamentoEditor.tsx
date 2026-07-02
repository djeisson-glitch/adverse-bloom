import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STAGES } from "@/hooks/useDeals";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ArrowLeft, Loader2, Send, Trophy, XCircle, Plus, Trash2, ChevronRight,
  ChevronDown, Calculator, Table, Clock, Info, Save, ExternalLink, CalendarRange, Upload,
} from "lucide-react";
import { ComentariosSection } from "./ProjetoDetalhe";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
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
  unit_price: number | null;
  tira_taxa: boolean;
  observacoes: string | null;
  ordem: number;
};
type ComposicaoHora = {
  id: string;
  budget_id: string;
  funcao_id: string | null;
  funcao_nome: string;
  horas: number;
  preco_hora: number;
  custo_hora: number;
  ordem: number;
};
type CustoDireto = {
  id: string;
  budget_id: string;
  descricao: string;
  valor: number;
  ordem: number;
};

export default function OrcamentoEditor() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();
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

      // Cria budget automaticamente se ainda não existir
      const { data: created, error: e2 } = await (supabase as any)
        .from("budgets")
        .insert({
          deal_id: deal.id,
          project_name: deal.title,
          client_name: deal.client?.name || "",
          status: "draft",
        })
        .select("*")
        .single();
      if (e2) throw e2;
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

  const { data: composicao = [] } = useQuery({
    queryKey: ["orcamento-composicao", budget?.id],
    enabled: !!budget?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("budget_composicao_horas")
        .select("*")
        .eq("budget_id", budget.id)
        .order("ordem");
      if (error) throw error;
      return data as ComposicaoHora[];
    },
  });

  const { data: custos = [] } = useQuery({
    queryKey: ["orcamento-custos", budget?.id],
    enabled: !!budget?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("budget_custos_diretos")
        .select("*")
        .eq("budget_id", budget.id)
        .order("ordem");
      if (error) throw error;
      return data as CustoDireto[];
    },
  });

  const { data: rateCard = [] } = useQuery({
    queryKey: ["rate-card-orcamento"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("rate_card")
        .select("*")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as any[];
    },
  });

  // Job gerado a partir deste orçamento (quando ganho)
  const { data: jobGerado } = useQuery({
    queryKey: ["orcamento-job", id],
    enabled: !!deal && deal.stage === "aceite",
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
      <button
        onClick={() => navigate("/orcamentos")}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar ao pipeline
      </button>

      {/* Header + ações */}
      <Card className="glass-card">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{deal.client?.name || "Sem cliente"}</p>
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

          <AcaoBotoes deal={deal} jobGerado={jobGerado} navigate={navigate} qc={qc} />
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

      {/* Composição por horas */}
      {canSeeMoney && (
        <ComposicaoHorasSection
          budget={budget}
          composicao={composicao}
          rateCard={rateCard}
          custos={custos}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["orcamento-composicao"] });
            qc.invalidateQueries({ queryKey: ["orcamento-custos"] });
          }}
        />
      )}

      {/* Planilha de produção */}
      {canSeeMoney && (
        <PlanilhaSection
          budget={budget}
          categorias={categorias}
          itens={itens}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["orcamento-itens"] });
            qc.invalidateQueries({ queryKey: ["orcamento-budget"] });
          }}
        />
      )}

      {/* Follow-ups agendados */}
      {followUps.length > 0 && (
        <Card className="glass-card">
          <CardContent className="space-y-2 p-6">
            <p className="text-sm font-semibold text-foreground">Follow-ups agendados</p>
            {followUps.map((f: any) => (
              <div key={f.id} className="flex items-center gap-2 text-sm">
                <CalendarRange className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-foreground">
                  {new Date(f.data_prevista).toLocaleDateString("pt-BR")}
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
    </div>
  );
}

/* ------------------------------------------ Ações principais (3 botões) */

function AcaoBotoes({
  deal, jobGerado, navigate, qc,
}: {
  deal: any;
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

  const enviarProposta = () => {
    // Muda pra stage 'proposta' se ainda não estiver
    (supabase as any).from("deals").update({ stage: "proposta" }).eq("id", deal.id).then(() => {
      qc.invalidateQueries({ queryKey: ["orcamento-deal", deal.id] });
      toast.success("Orçamento marcado como Proposta enviada");
    });
  };

  if (deal.stage === "perdido") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        Orçamento foi marcado como perdido.
      </div>
    );
  }

  const ganho = deal.stage === "aceite";

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={enviarProposta} disabled={ganho}>
        <Send className="mr-1.5 h-3.5 w-3.5" />
        Enviar proposta
      </Button>
      {ganho ? (
        <Button
          onClick={() => jobGerado && navigate(`/projetos/${jobGerado.id}`)}
          className="bg-success text-white hover:bg-success/90"
        >
          <Trophy className="mr-1.5 h-3.5 w-3.5" />
          {jobGerado ? `Job #${jobGerado.numero} gerado` : "Orçamento ganho"}
        </Button>
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

function PlanilhaSection({
  budget, categorias, itens, onChanged,
}: {
  budget: any;
  categorias: Categoria[];
  itens: BudgetItem[];
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [percentuais, setPercentuais] = useState({
    margem: budget.margem_produtora_percent || 0,
    direcao: budget.direcao_cena_percent || 0,
    imposto: budget.imposto_percent || 0,
  });

  const itensPorCategoria = useMemo(() => {
    const m = new Map<string, BudgetItem[]>();
    itens.forEach((i) => {
      const key = i.categoria_id || "sem_categoria";
      m.set(key, [...(m.get(key) || []), i]);
    });
    return m;
  }, [itens]);

  const valorItem = (i: BudgetItem) =>
    Number(i.quantity || 0) * Number(i.diaria || 1) * Number(i.unit_price || 0);

  const totaisPorCategoria = useMemo(() => {
    const m = new Map<string, number>();
    itens.forEach((i) => {
      const key = i.categoria_id || "sem_categoria";
      m.set(key, (m.get(key) || 0) + valorItem(i));
    });
    return m;
  }, [itens]);

  const custoProducao = useMemo(
    () => itens.reduce((s, i) => s + valorItem(i), 0),
    [itens],
  );
  const baseSemTaxa = useMemo(
    () => itens.filter((i) => !i.tira_taxa).reduce((s, i) => s + valorItem(i), 0),
    [itens],
  );
  const margemValor = baseSemTaxa * (Number(percentuais.margem) / 100);
  const direcaoValor = custoProducao * (Number(percentuais.direcao) / 100);
  const imposto = (custoProducao + margemValor + direcaoValor) * (Number(percentuais.imposto) / 100);
  const valorTotal = custoProducao + margemValor + direcaoValor + imposto;

  const toggleCat = (id: string) => {
    const s = new Set(expandidas);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpandidas(s);
  };

  const salvarPercentuais = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("budgets")
        .update({
          margem_produtora_percent: percentuais.margem,
          direcao_cena_percent: percentuais.direcao,
          imposto_percent: percentuais.imposto,
          total_value: valorTotal,
        })
        .eq("id", budget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      onChanged();
      toast.success("Salvo");
    },
  });

  // "Usar como proposta" — leva o valor total da planilha pro deal
  const usarComoProposta = useMutation({
    mutationFn: async () => {
      await salvarPercentuais.mutateAsync();
      const { error } = await (supabase as any)
        .from("deals")
        .update({ valor_proposta: valorTotal, value: valorTotal })
        .eq("id", budget.deal_id);
      if (error) throw error;
    },
    onSuccess: () => {
      onChanged();
      toast.success(`Proposta definida: ${formatCurrency(valorTotal)}`, {
        description: "Valor total da planilha copiado pro orçamento.",
      });
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Table className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Planilha de produção</h2>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => salvarPercentuais.mutate()} className="bg-primary text-primary-foreground">
              <Save className="mr-1 h-3.5 w-3.5" />
              Salvar
            </Button>
            <Button size="sm" variant="outline" onClick={() => usarComoProposta.mutate()} disabled={usarComoProposta.isPending}>
              <Upload className="mr-1 h-3.5 w-3.5" />
              Usar como proposta
            </Button>
          </div>
        </div>

        {/* Cabeçalho percentuais + total */}
        <div className="grid gap-3 rounded-lg border border-border/50 bg-muted/20 p-4 md:grid-cols-[1fr_1fr_1fr_1fr_1fr]">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Custo de produção</p>
            <p className="text-sm font-medium text-foreground">{formatCurrency(custoProducao)}</p>
            <p className="text-[10px] text-muted-foreground">sobre {formatCurrency(baseSemTaxa)} (fora "tirar da taxa")</p>
          </div>
          <PctInput
            label="Margem da produtora"
            value={percentuais.margem}
            onChange={(v) => setPercentuais({ ...percentuais, margem: v })}
            valorCalc={margemValor}
            hint="sobre base sem taxa"
          />
          <PctInput
            label="Direção de cena"
            value={percentuais.direcao}
            onChange={(v) => setPercentuais({ ...percentuais, direcao: v })}
            valorCalc={direcaoValor}
            hint="sobre custo de produção"
          />
          <PctInput
            label="Imposto"
            value={percentuais.imposto}
            onChange={(v) => setPercentuais({ ...percentuais, imposto: v })}
            valorCalc={imposto}
            hint="sobre custos + margem + direção"
          />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor total</p>
            <p className="text-lg font-semibold text-primary">{formatCurrency(valorTotal)}</p>
          </div>
        </div>

        {/* Categorias */}
        <div className="space-y-2">
          {categorias.map((cat) => {
            const itensCat = itensPorCategoria.get(cat.id) || [];
            const totalCat = totaisPorCategoria.get(cat.id) || 0;
            const aberta = expandidas.has(cat.id);
            return (
              <div key={cat.id} className="rounded-lg border border-border/50">
                <button
                  onClick={() => toggleCat(cat.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                >
                  {aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-mono text-[10px] text-muted-foreground">{cat.codigo}</span>
                  <span className="text-sm font-medium text-foreground">{cat.nome}</span>
                  <span className="ml-auto flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground">{itensCat.length}</span>
                    <span className="text-sm font-medium text-foreground">
                      {formatCurrency(totalCat)}
                    </span>
                  </span>
                </button>
                {aberta && (
                  <CategoriaItens
                    budgetId={budget.id}
                    categoriaId={cat.id}
                    codigo={cat.codigo}
                    itens={itensCat}
                    onChanged={onChanged}
                  />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
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
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 w-14 text-xs"
        />
        <span className="text-xs">%</span>
        <span className="text-xs">= {formatCurrency(valorCalc)}</span>
      </div>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function CategoriaItens({
  budgetId, categoriaId, codigo, itens, onChanged,
}: {
  budgetId: string;
  categoriaId: string;
  codigo: string;
  itens: BudgetItem[];
  onChanged: () => void;
}) {
  const [novaDesc, setNovaDesc] = useState("");

  const adicionar = useMutation({
    mutationFn: async () => {
      if (!novaDesc.trim()) throw new Error("Informe a descrição");
      const { error } = await (supabase as any).from("budget_items").insert({
        budget_id: budgetId,
        categoria_id: categoriaId,
        descricao: novaDesc,
        item_name: novaDesc,   // legado
        quantity: 1,
        diaria: 0,
        unit_price: 0,
        tira_taxa: false,
        ordem: itens.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovaDesc("");
      onChanged();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <div className="border-t border-border/40">
      <div className="grid grid-cols-[70px_1.4fr_70px_80px_100px_100px_1fr_50px_40px] gap-2 border-b border-border/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span />
        <span>Descrição</span>
        <span>QTD</span>
        <span>Diária</span>
        <span>Valor unit.</span>
        <span className="text-right">Valor</span>
        <span>Observações</span>
        <span>T. taxa</span>
        <span />
      </div>
      {itens.map((it, idx) => (
        <BudgetItemRow key={it.id} item={it} codigo={codigo} idx={idx + 1} onChanged={onChanged} />
      ))}
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
    quantity: item.quantity || 1,
    diaria: item.diaria || 0,
    unit_price: item.unit_price || 0,
    tira_taxa: item.tira_taxa,
    observacoes: item.observacoes || "",
  });
  const valor = row.quantity * (row.diaria || 1) * row.unit_price;

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("budget_items")
        .update({
          descricao: row.descricao,
          item_name: row.descricao,
          quantity: row.quantity,
          diaria: row.diaria,
          unit_price: row.unit_price,
          tira_taxa: row.tira_taxa,
          observacoes: row.observacoes,
        })
        .eq("id", item.id);
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

  return (
    <div className="grid grid-cols-[70px_1.4fr_70px_80px_100px_100px_1fr_50px_40px] gap-2 border-b border-border/30 px-4 py-1.5 last:border-0">
      <span className="font-mono text-[10px] text-muted-foreground">
        {codigo}.{String(idx).padStart(3, "0")}
      </span>
      <Input
        value={row.descricao}
        onChange={(e) => setRow({ ...row, descricao: e.target.value })}
        onBlur={() => salvar.mutate()}
        className="h-7 text-xs"
      />
      <Input
        type="number"
        value={row.quantity}
        onChange={(e) => setRow({ ...row, quantity: Number(e.target.value) })}
        onBlur={() => salvar.mutate()}
        className="h-7 text-xs"
      />
      <Input
        type="number"
        value={row.diaria}
        onChange={(e) => setRow({ ...row, diaria: Number(e.target.value) })}
        onBlur={() => salvar.mutate()}
        className="h-7 text-xs"
      />
      <Input
        type="number"
        value={row.unit_price}
        onChange={(e) => setRow({ ...row, unit_price: Number(e.target.value) })}
        onBlur={() => salvar.mutate()}
        className="h-7 text-xs"
      />
      <span className="text-right text-xs">{formatCurrency(valor)}</span>
      <Input
        value={row.observacoes}
        onChange={(e) => setRow({ ...row, observacoes: e.target.value })}
        onBlur={() => salvar.mutate()}
        className="h-7 text-xs"
        placeholder="—"
      />
      <label className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={row.tira_taxa}
          onChange={(e) => {
            setRow({ ...row, tira_taxa: e.target.checked });
            setTimeout(() => salvar.mutate(), 0);
          }}
          className="h-3.5 w-3.5 accent-primary"
        />
      </label>
      <button onClick={() => excluir.mutate()} className="text-muted-foreground hover:text-destructive">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ---------------------------------- Composição por horas + custos diretos */

function ComposicaoHorasSection({
  budget, composicao, rateCard, custos, onChanged,
}: {
  budget: any;
  composicao: ComposicaoHora[];
  rateCard: any[];
  custos: CustoDireto[];
  onChanged: () => void;
}) {
  const [novaFuncao, setNovaFuncao] = useState("");
  const [novaHoras, setNovaHoras] = useState("");
  const [novoCusto, setNovoCusto] = useState({ descricao: "", valor: "" });

  const totalHoras = composicao.reduce((s, c) => s + Number(c.horas), 0);
  const totalReceita = composicao.reduce((s, c) => s + Number(c.horas) * Number(c.preco_hora), 0);
  const totalCustoInterno = composicao.reduce((s, c) => s + Number(c.horas) * Number(c.custo_hora), 0);
  const totalCustosDiretos = custos.reduce((s, c) => s + Number(c.valor), 0);
  const custoEstimado = totalCustoInterno + totalCustosDiretos;
  const margem = totalReceita - custoEstimado;

  const addFuncao = useMutation({
    mutationFn: async () => {
      const f = rateCard.find((r) => r.id === novaFuncao);
      if (!f || !novaHoras) throw new Error("Escolha função e horas");
      const { error } = await (supabase as any).from("budget_composicao_horas").insert({
        budget_id: budget.id,
        funcao_id: f.id,
        funcao_nome: f.funcao,
        horas: Number(novaHoras),
        preco_hora: f.preco_hora,
        custo_hora: f.custo_hora,
        ordem: composicao.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovaFuncao("");
      setNovaHoras("");
      onChanged();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const addCusto = useMutation({
    mutationFn: async () => {
      if (!novoCusto.descricao || !novoCusto.valor) throw new Error("Descrição e valor");
      const { error } = await (supabase as any).from("budget_custos_diretos").insert({
        budget_id: budget.id,
        descricao: novoCusto.descricao,
        valor: Number(novoCusto.valor),
        ordem: custos.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovoCusto({ descricao: "", valor: "" });
      onChanged();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const removerFuncao = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("budget_composicao_horas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChanged,
  });
  const removerCusto = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("budget_custos_diretos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  return (
    <Card className="glass-card border-warning/30">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-warning" />
          <h2 className="text-base font-semibold text-foreground">Composição por horas</h2>
        </div>

        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
          <Info className="mr-1 inline h-3 w-3 text-warning" />
          Defina as funções e valores no <Link to="/admin/rate-card" className="text-primary hover:underline">Rate card</Link> para montar o orçamento por horas.
        </div>

        {/* Adicionar função + custo */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex gap-2">
            <Select value={novaFuncao} onValueChange={setNovaFuncao}>
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder="+ função..." />
              </SelectTrigger>
              <SelectContent>
                {rateCard.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.funcao} · R$ {f.preco_hora}/h
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              value={novaHoras}
              onChange={(e) => setNovaHoras(e.target.value)}
              placeholder="horas"
              className="h-9 w-20"
            />
            <Button size="sm" onClick={() => addFuncao.mutate()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              value={novoCusto.descricao}
              onChange={(e) => setNovoCusto({ ...novoCusto, descricao: e.target.value })}
              placeholder="+ custo (locação, equip...)"
              className="h-9 flex-1"
            />
            <Input
              type="number"
              value={novoCusto.valor}
              onChange={(e) => setNovoCusto({ ...novoCusto, valor: e.target.value })}
              placeholder="R$"
              className="h-9 w-24"
            />
            <Button size="sm" onClick={() => addCusto.mutate()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Linhas */}
        {(composicao.length > 0 || custos.length > 0) && (
          <div className="space-y-1 rounded-md border border-border/40 bg-muted/10 p-2">
            {composicao.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_60px_100px_100px_40px] items-center gap-2 px-2 py-1 text-xs">
                <span className="text-foreground">{c.funcao_nome}</span>
                <span className="text-right">{c.horas}h</span>
                <span className="text-right text-muted-foreground">R$ {c.preco_hora}/h</span>
                <span className="text-right font-medium text-foreground">
                  {formatCurrency(Number(c.horas) * Number(c.preco_hora))}
                </span>
                <button onClick={() => removerFuncao.mutate(c.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {custos.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_60px_100px_100px_40px] items-center gap-2 px-2 py-1 text-xs">
                <span className="text-muted-foreground">↳ {c.descricao} (custo direto)</span>
                <span />
                <span />
                <span className="text-right font-medium text-warning">
                  {formatCurrency(c.valor)}
                </span>
                <button onClick={() => removerCusto.mutate(c.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Resumo */}
        <div className="grid gap-3 rounded-md border border-border/40 bg-muted/10 p-3 md:grid-cols-4">
          <ResumoBox label="Total de horas" value={`${totalHoras}h`} icon={Clock} />
          <ResumoBox label="Preço (receita)" value={formatCurrency(totalReceita)} tone="primary" />
          <ResumoBox label="Custo estimado" value={formatCurrency(custoEstimado)} tone="warning" />
          <ResumoBox label="Margem prevista" value={formatCurrency(margem)} tone={margem >= 0 ? "success" : "destructive"} />
        </div>
      </CardContent>
    </Card>
  );
}

function ResumoBox({
  label, value, tone, icon: Icon,
}: {
  label: string;
  value: string;
  tone?: "primary" | "success" | "warning" | "destructive";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const cls =
    tone === "success" ? "text-success"
      : tone === "warning" ? "text-warning"
      : tone === "destructive" ? "text-destructive"
      : tone === "primary" ? "text-primary"
      : "text-foreground";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="mr-1 inline h-3 w-3" />}
        {label}
      </p>
      <p className={`text-sm font-semibold ${cls}`}>{value}</p>
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

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("deals")
        .update({
          title: form.title,
          canal_entrada: form.canal_entrada || null,
          tipo_orcamento: form.tipo_orcamento || null,
          precisa_roteiro: form.precisa_roteiro || null,
          precisa_elenco: form.precisa_elenco || null,
          local_filmagem: form.local_filmagem || null,
          moeda: form.moeda,
          objetivo: form.objetivo || null,
          formatos: form.formatos,
          meios_veiculacao: form.meios_veiculacao,
          verba_estimada: form.verba_estimada ? Number(form.verba_estimada) : null,
          valor_proposta: form.valor_proposta ? Number(form.valor_proposta) : null,
          valor_final_aprovado: form.valor_final_aprovado ? Number(form.valor_final_aprovado) : null,
        })
        .eq("id", deal.id);
      if (error) throw error;
    },
    onSuccess: () => {
      onChanged();
      toast.success("Briefing salvo");
    },
  });

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
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <Field label="Canal de entrada"><Select value={form.canal_entrada} onValueChange={(v) => setForm({ ...form, canal_entrada: v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{CANAIS_ENTRADA.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent></Select></Field>
              <Field label="Tipo de orçamento"><Select value={form.tipo_orcamento} onValueChange={(v) => setForm({ ...form, tipo_orcamento: v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{TIPOS_ORCAMENTO.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent></Select></Field>
              <Field label="Roteiro"><Select value={form.precisa_roteiro} onValueChange={(v) => setForm({ ...form, precisa_roteiro: v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{PRECISA_ROTEIRO.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent></Select></Field>
              <Field label="Elenco"><Select value={form.precisa_elenco} onValueChange={(v) => setForm({ ...form, precisa_elenco: v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{PRECISA_ELENCO.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent></Select></Field>
              <Field label="Local da filmagem"><Input value={form.local_filmagem} onChange={(e) => setForm({ ...form, local_filmagem: e.target.value })} /></Field>
              <Field label="Moeda"><Select value={form.moeda} onValueChange={(v) => setForm({ ...form, moeda: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MOEDAS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent></Select></Field>
            </div>

            <Field label="Objetivo do vídeo">
              <Textarea rows={5} value={form.objetivo} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} />
            </Field>

            <div className="grid gap-6 md:grid-cols-2">
              <ChipGroup
                label="Formatos"
                options={FORMATOS as any}
                value={form.formatos}
                onChange={(v) => setForm({ ...form, formatos: toggle(form.formatos, v) })}
              />
              <ChipGroup
                label="Meio de veiculação"
                options={MEIOS_VEICULACAO as any}
                value={form.meios_veiculacao}
                onChange={(v) => setForm({ ...form, meios_veiculacao: toggle(form.meios_veiculacao, v) })}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Verba estimada">
                <Input type="number" value={form.verba_estimada} onChange={(e) => setForm({ ...form, verba_estimada: e.target.value })} />
              </Field>
              <Field label="Valor de proposta">
                <Input type="number" value={form.valor_proposta} onChange={(e) => setForm({ ...form, valor_proposta: e.target.value })} />
              </Field>
              <Field label="Valor final aprovado">
                <Input type="number" value={form.valor_final_aprovado} onChange={(e) => setForm({ ...form, valor_final_aprovado: e.target.value })} />
              </Field>
            </div>

            <Button onClick={() => salvar.mutate()} className="bg-primary text-primary-foreground">
              <Save className="mr-1 h-3.5 w-3.5" />
              Salvar briefing
            </Button>
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
