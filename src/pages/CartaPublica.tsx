import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { roundUpTo50, formatCurrency } from "@/lib/format";
import {
  CartaDocumento, CARTA_STYLE, DEFAULTS, TIPO_LABEL, parseValor,
  type Proposta,
} from "@/components/CartaDocumento";

/**
 * Carta pública — o link que vai pro cliente (sem login).
 * Lê os dados via RPC carta_publica(token), mostra a carta no padrão Adverse
 * e deixa o cliente aprovar informando nome, e-mail e celular.
 */
export default function CartaPublica() {
  const { token } = useParams<{ token: string }>();
  const [form, setForm] = useState({ nome: "", email: "", celular: "" });
  const [confirmar, setConfirmar] = useState(false);
  const [aprovadaLocal, setAprovadaLocal] = useState<{ nome: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["carta-publica", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("carta_publica", { _token: token });
      if (error) throw error;
      return data as any;
    },
  });

  const aprovar = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("carta_aprovar", {
        _token: token,
        _nome: form.nome.trim(),
        _email: form.email.trim(),
        _celular: form.celular.trim(),
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      setConfirmar(false);
      setAprovadaLocal({ nome: form.nome.trim() });
      refetch();
    },
    onError: (e: any) => {
      setConfirmar(false);
      toast.error("Não deu pra aprovar", { description: e.message });
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f10]">
        <Loader2 className="h-8 w-8 animate-spin text-[#E53500]" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#0f0f10] px-6 text-center">
        <p className="text-lg font-bold text-[#E8E1D0]">Proposta não encontrada</p>
        <p className="text-sm text-[#9A968C]">O link pode ter expirado ou estar incorreto. Fale com a Adverse.</p>
      </div>
    );
  }

  const deal = data.deal || {};
  const cli = data.cliente || {};
  const salvo: Proposta = (data.proposta && typeof data.proposta === "object" ? data.proposta : {}) as Proposta;
  const p: Proposta = {
    titulo: salvo.titulo ?? (cli.nome || deal.title || ""),
    subtitulo: salvo.subtitulo ?? (TIPO_LABEL[deal.tipo_orcamento] || deal.title || ""),
    briefing: salvo.briefing ?? (deal.objetivo || ""),
    entregas_texto: salvo.entregas_texto ?? "",
    diarias: salvo.diarias ?? "",
    equipe: salvo.equipe ?? DEFAULTS.equipe,
    pos: salvo.pos ?? DEFAULTS.pos,
    equipamentos: salvo.equipamentos ?? DEFAULTS.equipamentos,
    nao_inclui: salvo.nao_inclui ?? DEFAULTS.nao_inclui,
    investimento: salvo.investimento ?? (data.valor_investimento ? String(data.valor_investimento) : ""),
    validade_dias: salvo.validade_dias ?? 15,
    condicoes_pagamento: salvo.condicoes_pagamento ?? "à vista",
  };
  const investimentoNum = roundUpTo50(parseValor(p.investimento));
  const cliente = { nome: cli.nome, contato: cli.contato, email: cli.email, telefone: cli.telefone };

  const jaAprovada = !!data.aprovada_em || !!aprovadaLocal;
  const aprovadaPor = data.aprovada_por || (aprovadaLocal ? { nome: aprovadaLocal.nome } : null);
  const podeAprovar = form.nome.trim() && form.email.trim();

  return (
    <div className="min-h-screen bg-[#0f0f10]">
      <style>{CARTA_STYLE}</style>
      <div className="carta-root pb-40">
        <CartaDocumento p={p} investimentoNum={investimentoNum} cliente={cliente} dataStr={undefined} />

        {/* Área de aprovação — fixa embaixo */}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#131314]/95 backdrop-blur">
          <div className="mx-auto max-w-5xl px-6 py-4">
            {jaAprovada ? (
              <div className="flex items-center gap-3 text-[#E8E1D0]">
                <CheckCircle2 className="h-6 w-6 text-[#10b981]" />
                <div>
                  <p className="text-sm font-semibold">Proposta aprovada</p>
                  <p className="text-xs text-[#9A968C]">
                    {aprovadaPor?.nome ? `Por ${aprovadaPor.nome}. ` : ""}A Adverse foi avisada e entra em contato pra dar sequência.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="grid flex-1 gap-2 sm:grid-cols-3">
                  <CampoPub label="Seu nome *" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} placeholder="Nome completo" />
                  <CampoPub label="E-mail *" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="voce@empresa.com" type="email" />
                  <CampoPub label="Celular" value={form.celular} onChange={(v) => setForm({ ...form, celular: v })} placeholder="(00) 00000-0000" />
                </div>
                <button
                  onClick={() => setConfirmar(true)}
                  disabled={!podeAprovar}
                  className="h-10 shrink-0 rounded-md bg-[#E53500] px-5 text-sm font-semibold text-white transition hover:bg-[#E53500]/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Aprovar proposta
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Pop-up de confirmação */}
        {confirmar && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4" onClick={() => !aprovar.isPending && setConfirmar(false)}>
            <div
              className="w-full max-w-md rounded-2xl border border-white/10 bg-[#17171a] p-6 text-[#E8E1D0] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E53500]/15">
                  <ShieldCheck className="h-6 w-6 text-[#E53500]" />
                </div>
                <button onClick={() => setConfirmar(false)} className="text-[#9A968C] hover:text-[#E8E1D0]" disabled={aprovar.isPending}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <h2 className="mt-4 text-xl font-bold">Confirmar aprovação</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#B9B4A8]">
                Ao aprovar, você declara que leu e <strong className="text-[#E8E1D0]">concorda com tudo o que está descrito nesta proposta</strong> — escopo, entregas, equipe, o que não está incluso, valor e condições de pagamento.
              </p>
              <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider text-[#9A968C]">Investimento</span>
                  <span className="text-lg font-bold text-[#E8E1D0]">{investimentoNum ? formatCurrency(investimentoNum) : "—"}</span>
                </div>
                <p className="mt-1 text-[11px] text-[#9A968C]">Aprovando como {form.nome || "—"} · {form.email || "—"}</p>
              </div>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setConfirmar(false)}
                  disabled={aprovar.isPending}
                  className="h-10 flex-1 rounded-md border border-white/15 text-sm font-medium text-[#E8E1D0] hover:bg-white/5"
                >
                  Voltar
                </button>
                <button
                  onClick={() => aprovar.mutate()}
                  disabled={aprovar.isPending}
                  className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md bg-[#E53500] text-sm font-semibold text-white hover:bg-[#E53500]/90 disabled:opacity-60"
                >
                  {aprovar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Confirmar aprovação
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CampoPub({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-[#9A968C]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm text-[#E8E1D0] placeholder:text-[#6b675f] focus:border-[#E53500]/50 focus:outline-none"
      />
    </label>
  );
}
