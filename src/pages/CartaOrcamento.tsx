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
import { roundUpTo50 } from "@/lib/format";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { IndicadorAutosave } from "@/components/autosave/AutosaveContext";
import {
  CartaDocumento, CARTA_STYLE, DEFAULTS, TIPO_LABEL, parseValor,
  type Proposta,
} from "@/components/CartaDocumento";

/**
 * Carta de orçamento — documento "INVESTIMENTO" no padrão Adverse (visão interna).
 * Puxa o que dá do orçamento (entregas, valor, cliente) e deixa preencher o resto.
 * O valor sempre é arredondado pra cima de 50 em 50. Modo manual (?manual=1) começa em branco.
 */

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
        .select("*, client:clients(id, name, contact_name, email, phone)")
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
      // Valor da carta = SEMPRE do orçamento (planilha → proposta → deal),
      // arredondado pra cima de 50 em 50. Não é mais editável na carta.
      const valorOrc = Number(budget?.total_value) || Number(deal.valor_proposta) || Number(deal.value) || 0;
      const investimentoBase = valorOrc ? String(roundUpTo50(valorOrc)) : "";
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
        investimento: investimentoBase,
        validade_dias: salvo.validade_dias ?? 15,
        condicoes_pagamento: salvo.condicoes_pagamento ?? "à vista",
      });
    }
  }

  // A carta inteira mora numa coluna jsonb, então o autosave regrava o bloco
  // todo — não dá pra mandar campo a campo como nas outras telas.
  const auto = useFormAutosave<Record<string, unknown>>(async () => {
    if (!data?.budget?.id || !p) return; // modo manual não persiste
    // Não persiste o investimento: ele é sempre puxado do orçamento (fica automático).
    const { investimento, ...propostaSemValor } = p;
    const { error } = await (supabase as any).from("budgets").update({ proposta: propostaSemValor }).eq("id", data.budget.id);
    if (error) {
      const msg = /proposta/i.test(error.message || "")
        ? "Rode 'supabase db push' pra habilitar o salvamento da carta (coluna nova)."
        : error.message;
      toast.error("Não salvou a carta", { description: msg });
      throw error;
    }
  });

  if (isLoading || !p) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const set = (patch: Partial<Proposta>) => {
    setP({ ...p, ...patch });
    auto.agendar(patch as Record<string, unknown>);
  };
  const investimentoNum = roundUpTo50(parseValor(p.investimento));
  const cli = data?.deal?.client;
  const cliente = cli
    ? { nome: cli.name, contato: cli.contact_name, email: cli.email, telefone: cli.phone }
    : undefined;
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-[#0f0f10]">
      <style>{CARTA_STYLE}</style>

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
            {!manual && <IndicadorAutosave status={auto.status} />}
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
              <Campo label="Investimento — vem do orçamento">
                <div className="flex h-10 items-center rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-[#E8E1D0]">
                  {investimentoNum > 0 ? `R$ ${investimentoNum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                </div>
                <p className="mt-1 text-[10px] text-[#9A968C]">
                  {investimentoNum > 0
                    ? "Valor total do orçamento, arredondado pra cima de 50 em 50."
                    : "Esse orçamento ainda não tem valor — preencha a planilha ou use “Usar como proposta” no editor."}
                </p>
              </Campo>
              <Campo label="Validade (dias)"><Input type="number" value={p.validade_dias ?? ""} onChange={(e) => set({ validade_dias: e.target.value })} className="bg-white/5" /></Campo>
              <Campo label="Condições de pagamento"><Input value={p.condicoes_pagamento || ""} onChange={(e) => set({ condicoes_pagamento: e.target.value })} className="bg-white/5" /></Campo>
            </div>
          </div>
        )}

        {/* ---------------- A CARTA (imprime) ---------------- */}
        <CartaDocumento p={p} investimentoNum={investimentoNum} cliente={cliente} dataStr={hoje} condicoes={data?.budget?.condicoes} />
      </div>
    </div>
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
