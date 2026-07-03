import { useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Printer, Save, Loader2, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

/**
 * Carta de orçamento — documento "INVESTIMENTO" no padrão Adverse.
 * Puxa o que dá do orçamento (entregas, valor, cliente) e deixa preencher o
 * resto (equipe, pós, equipamentos, não inclui, diárias, condições).
 * Modo manual (?manual=1): começa em branco pra montar do zero.
 */

type Proposta = {
  titulo?: string;
  subtitulo?: string;
  briefing?: string;
  entregas_texto?: string;
  diarias?: string;
  equipe?: string;
  pos?: string;
  equipamentos?: string;
  nao_inclui?: string;
  investimento?: string;
  validade_dias?: number | string;
  condicoes_pagamento?: string;
};

const DEFAULTS: Proposta = {
  equipe: "Direção\nOperador de câmera\nAssistente",
  pos: "Edição e finalização\nColor grading",
  equipamentos: "Câmera cinema\nDrone\nIluminação",
  nao_inclui:
    "Imagens geradas por IA\nFotografia\nReduções/versões extras das especificadas aqui\nProdução de locação\nLegenda em outros idiomas\nDiária de produção extra por clima ruim, agenda do cliente e/ou outros fatores não controláveis pela produtora",
  validade_dias: 15,
  condicoes_pagamento: "à vista",
};

const TIPO_LABEL: Record<string, string> = {
  geral: "Geral",
  so_producao: "Só produção",
  so_pos_producao: "Só pós-produção",
  fotos: "Fotos",
  ia: "IA",
  institucional: "Institucional",
};

function linhas(t?: string) {
  return (t || "").split("\n").map((l) => l.trim()).filter(Boolean);
}

// Aceita "6070", "6070.5" (US/planilha) e "6.070,00" (BR digitado).
function parseValor(s?: string | number) {
  const str = String(s ?? "").replace(/[R$\s]/g, "").trim();
  if (!str) return 0;
  if (str.includes(",")) return Number(str.replace(/\./g, "").replace(",", ".")) || 0;
  return Number(str) || 0;
}

export default function CartaOrcamento() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const manual = params.get("manual") === "1";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editando, setEditando] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["carta-orcamento", id],
    enabled: !!id,
    queryFn: async () => {
      const { data: deal, error } = await (supabase as any)
        .from("deals")
        .select("*, client:clients(id, name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      const { data: budget } = await (supabase as any)
        .from("budgets")
        .select("*")
        .eq("deal_id", deal.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { deal, budget };
    },
  });

  const [p, setP] = useState<Proposta | null>(null);

  // Hidrata uma vez: manual = só defaults; senão puxa do orçamento.
  if (data && p === null) {
    const deal = data.deal;
    const budget = data.budget;
    const salvo: Proposta = (budget?.proposta && typeof budget.proposta === "object" ? budget.proposta : {}) as Proposta;
    if (manual) {
      setP({ ...DEFAULTS, validade_dias: 15, condicoes_pagamento: "à vista" });
    } else {
      const entregasTexto =
        salvo.entregas_texto ??
        (Array.isArray(budget?.entregas)
          ? budget.entregas
              .map(
                (e: any) =>
                  `${String(e.quantidade || 1).padStart(2, "0")} ${e.titulo}${e.duracao ? ` ${e.duracao}` : ""}${e.formato ? ` | ${e.formato}` : ""}`,
              )
              .join("\n")
          : "");
      setP({
        titulo: salvo.titulo ?? (deal.client?.name || deal.title || ""),
        subtitulo: salvo.subtitulo ?? (TIPO_LABEL[deal.tipo_orcamento] || deal.title || ""),
        briefing: salvo.briefing ?? (deal.objetivo || ""),
        entregas_texto: entregasTexto,
        diarias: salvo.diarias ?? "",
        equipe: salvo.equipe ?? DEFAULTS.equipe,
        pos: salvo.pos ?? DEFAULTS.pos,
        equipamentos: salvo.equipamentos ?? DEFAULTS.equipamentos,
        nao_inclui: salvo.nao_inclui ?? DEFAULTS.nao_inclui,
        investimento: salvo.investimento ?? (budget?.total_value ? String(budget.total_value) : ""),
        validade_dias: salvo.validade_dias ?? 15,
        condicoes_pagamento: salvo.condicoes_pagamento ?? "à vista",
      });
    }
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!data?.budget?.id) throw new Error("Sem orçamento pra salvar (modo manual não persiste).");
      const { error } = await (supabase as any).from("budgets").update({ proposta: p }).eq("id", data.budget.id);
      if (error) {
        if (/proposta/i.test(error.message || "")) {
          throw new Error("Rode 'supabase db push' pra habilitar o salvamento da carta (coluna nova).");
        }
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carta-orcamento", id] });
      toast.success("Carta salva");
    },
    onError: (e: any) => toast.error("Não salvou", { description: e.message }),
  });

  if (isLoading || !p) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const set = (patch: Partial<Proposta>) => setP({ ...p, ...patch });
  const investimentoNum = parseValor(p.investimento);

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-[#0f0f10]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
        .carta-root{font-family:'Montserrat',Inter,sans-serif}
        @media print{
          .no-print{display:none!important}
          .carta-doc{position:absolute;inset:0;margin:0}
          @page{margin:0}
          html,body{background:#0f0f10}
        }
        .carta-doc{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      `}</style>

      <div className="carta-root">
        {/* Barra de ações — não imprime */}
        <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#0f0f10]/95 px-4 py-3 backdrop-blur">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-xs text-[#9A968C] hover:text-[#E8E1D0]">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </button>
          {manual && (
            <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#9A968C]">
              modo manual (não salva)
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="border-white/20 bg-transparent text-[#E8E1D0] hover:bg-white/10" onClick={() => setEditando((v) => !v)}>
              {editando ? <><Eye className="mr-1 h-3.5 w-3.5" /> Só a carta</> : <><Pencil className="mr-1 h-3.5 w-3.5" /> Editar</>}
            </Button>
            {!manual && (
              <Button size="sm" variant="outline" className="border-white/20 bg-transparent text-[#E8E1D0] hover:bg-white/10" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                <Save className="mr-1 h-3.5 w-3.5" /> Salvar
              </Button>
            )}
            <Button size="sm" className="bg-[#E53500] text-white hover:bg-[#E53500]/90" onClick={() => window.print()}>
              <Printer className="mr-1 h-3.5 w-3.5" /> Imprimir / PDF
            </Button>
          </div>
        </div>

        {/* Editor de campos — não imprime */}
        {editando && (
          <div className="no-print mx-auto max-w-5xl space-y-3 p-4 text-[#E8E1D0]">
            <div className="grid gap-3 md:grid-cols-2">
              <Campo label="Título (cliente / projeto)"><Input value={p.titulo || ""} onChange={(e) => set({ titulo: e.target.value })} className="bg-white/5" /></Campo>
              <Campo label="Subtítulo (tipo)"><Input value={p.subtitulo || ""} onChange={(e) => set({ subtitulo: e.target.value })} className="bg-white/5" /></Campo>
            </div>
            <Campo label="Briefing"><Textarea rows={2} value={p.briefing || ""} onChange={(e) => set({ briefing: e.target.value })} className="bg-white/5" /></Campo>
            <div className="grid gap-3 md:grid-cols-2">
              <Campo label="Entregas (uma por linha)"><Textarea rows={3} value={p.entregas_texto || ""} onChange={(e) => set({ entregas_texto: e.target.value })} className="bg-white/5" /></Campo>
              <Campo label="Diárias (uma por linha)"><Textarea rows={3} value={p.diarias || ""} onChange={(e) => set({ diarias: e.target.value })} className="bg-white/5" placeholder={"3 diárias de captação\nLajeado + Bento"} /></Campo>
              <Campo label="Equipe"><Textarea rows={3} value={p.equipe || ""} onChange={(e) => set({ equipe: e.target.value })} className="bg-white/5" /></Campo>
              <Campo label="Pós-produção"><Textarea rows={3} value={p.pos || ""} onChange={(e) => set({ pos: e.target.value })} className="bg-white/5" /></Campo>
              <Campo label="Equipamentos"><Textarea rows={3} value={p.equipamentos || ""} onChange={(e) => set({ equipamentos: e.target.value })} className="bg-white/5" /></Campo>
              <Campo label="Não inclui"><Textarea rows={3} value={p.nao_inclui || ""} onChange={(e) => set({ nao_inclui: e.target.value })} className="bg-white/5" /></Campo>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Campo label="Investimento (R$)"><Input value={p.investimento || ""} onChange={(e) => set({ investimento: e.target.value })} className="bg-white/5" placeholder="6070" /></Campo>
              <Campo label="Validade (dias)"><Input type="number" value={p.validade_dias ?? ""} onChange={(e) => set({ validade_dias: e.target.value })} className="bg-white/5" /></Campo>
              <Campo label="Condições de pagamento"><Input value={p.condicoes_pagamento || ""} onChange={(e) => set({ condicoes_pagamento: e.target.value })} className="bg-white/5" /></Campo>
            </div>
          </div>
        )}

        {/* ---------------- A CARTA (imprime) ---------------- */}
        <div className="carta-doc mx-auto max-w-5xl bg-[#0f0f10] px-10 py-12 text-[#CFC9BC] md:px-16 md:py-16">
          <Header />

          <div className="mt-10">
            <h1 className="text-2xl font-bold text-[#E8E1D0]">{p.titulo || "—"}</h1>
            {p.subtitulo && <p className="text-sm text-[#9A968C]">{p.subtitulo}</p>}
          </div>

          <div className="mt-10 grid gap-x-16 gap-y-8 md:grid-cols-2">
            <div className="space-y-8">
              {p.briefing && <Bloco titulo="Briefing"><p className="leading-relaxed">{p.briefing}</p></Bloco>}
              {linhas(p.entregas_texto).length > 0 && (
                <Bloco titulo="Entregas">
                  <ul className="space-y-1">{linhas(p.entregas_texto).map((l, i) => <li key={i}>· {l}</li>)}</ul>
                </Bloco>
              )}
              {linhas(p.diarias).length > 0 && (
                <Bloco titulo="Diárias">
                  {linhas(p.diarias).map((l, i) => <p key={i} className={i === 0 ? "" : "text-sm text-[#9A968C]"}>{l}</p>)}
                </Bloco>
              )}
            </div>
            <div className="space-y-8">
              <Lista titulo="Equipe" itens={linhas(p.equipe)} />
              <Lista titulo="Pós-produção" itens={linhas(p.pos)} />
              <Lista titulo="Equipamentos" itens={linhas(p.equipamentos)} />
            </div>
          </div>

          <div className="mt-12 border-t border-white/10 pt-4">
            <p className="text-xs text-[#9A968C]">Qualquer alteração desse escopo ou solicitação não prevista acarretará em custos extras.</p>
          </div>

          {linhas(p.nao_inclui).length > 0 && (
            <div className="mt-16" style={{ breakBefore: "page" }}>
              <Header />
              <div className="mt-16">
                <Lista titulo="Não inclui" itens={linhas(p.nao_inclui)} />
              </div>
            </div>
          )}

          <div className="mt-16" style={{ breakBefore: "page" }}>
            <Header />
            <div className="mt-24">
              <p className="text-lg text-[#9A968C]">Investimento <span className="text-sm">(R$)</span></p>
              <p className="text-6xl font-bold tracking-tight text-[#E8E1D0]">
                {investimentoNum ? formatCurrency(investimentoNum).replace("R$", "").trim() : "—"}
              </p>
              <p className="mt-4 text-sm text-[#9A968C]">Esta Proposta de Orçamento tem prazo de validade de {p.validade_dias || 15} dias.</p>
              <p className="text-sm text-[#9A968C]">(TRIBUTOS INCLUSOS), podendo sofrer ajustes após aprovação.</p>
              <p className="mt-6 text-sm font-semibold text-[#E8E1D0]">CONDIÇÕES DE PAGAMENTO: {p.condicoes_pagamento || "à vista"}.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-start justify-between">
      <span className="text-lg font-extrabold tracking-tight text-[#E8E1D0]">
        adverse.rec <span className="text-[#E53500]">//</span>
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#9A968C]">Investimento</span>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#E8E1D0]">{titulo}</h2>
      <div className="text-[#CFC9BC]">{children}</div>
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <Bloco titulo={titulo}>
      <ul className="space-y-1">{itens.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </Bloco>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-[#9A968C]">{label}</Label>
      {children}
    </div>
  );
}
