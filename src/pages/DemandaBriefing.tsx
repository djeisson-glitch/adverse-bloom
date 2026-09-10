import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2, Sparkles, AlertTriangle, Paperclip } from "lucide-react";
import { formatDate } from "@/lib/format";
import { PRODUTORA } from "@/lib/produtora";
import { useVoltar } from "@/hooks/useVoltar";
import { CamposDoFormulario } from "@/components/demandas/CamposDoFormulario";

const STATUS_LABEL: Record<string, string> = {
  nova: "Nova", aceita: "Aceita", recusada: "Recusada", virou_projeto: "Virou projeto",
};

function fmtDateTime(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * O briefing de uma demanda, numa folha só, pronta pra imprimir/salvar PDF.
 *
 * Djêisson (10/09): "na parte de briefing do cliente, seria interessante ter
 * uma opção pra gente exportar as informações em pdf, pra facilitar".
 *
 * Mesmo conteúdo que já aparece expandido no card de Demandas.tsx — não uma
 * segunda versão: reaproveita CamposDoFormulario (o parser rótulo:valor) pra
 * ler o formulário exatamente igual nos dois lugares. O que muda é o formato:
 * aqui é UMA demanda, numa folha, pronta pro Ctrl+P — em vez do acordeão
 * inteiro (que imprimiria a lista toda, ou nada, dependendo de qual card
 * estivesse aberto no momento).
 *
 * Fica dentro da área logada (ProtectedRoute): a leitura de complexidade por
 * IA e o cálculo de viabilidade são informação INTERNA da produtora, não algo
 * que se manda pro cliente — diferente da carta de orçamento, que tem link
 * público próprio.
 */
export default function DemandaBriefing() {
  const { id } = useParams<{ id: string }>();
  const voltar = useVoltar("/demandas");

  const { data, isLoading } = useQuery({
    queryKey: ["demanda-briefing", id],
    enabled: !!id,
    queryFn: async () => {
      const { data: d, error } = await (supabase as any)
        .from("demandas").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!d) return null;
      // Nome do cliente vem da view pública, igual em Demandas.tsx — a
      // tabela clients é trancada; quem lê o briefing vê o nome, não os
      // dados protegidos do cadastro.
      let clientName = "";
      if (d.client_id) {
        const { data: c } = await (supabase as any)
          .from("clientes_publico").select("name").eq("id", d.client_id).maybeSingle();
        clientName = c?.name || "";
      }
      return { ...d, clientName };
    },
  });

  // Nome do arquivo quando salva como PDF — sem isto o Chrome sugere o título
  // genérico da aba ("Adverse OS.pdf") e alguém tem que renomear na mão antes
  // de anexar no e-mail pro editor/freela.
  useEffect(() => {
    if (!data) return;
    const anterior = document.title;
    document.title = `Briefing - ${data.nome_projeto}${data.clientName ? ` - ${data.clientName}` : ""}`;
    return () => { document.title = anterior; };
  }, [data]);

  if (isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm text-muted-foreground">Demanda não encontrada.</p>
        <Button size="sm" variant="outline" className="mt-4" onClick={voltar}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar
        </Button>
      </div>
    );
  }

  const entregas = Array.isArray(data.entregas) ? data.entregas : [];
  const anexos = Array.isArray(data.anexos) ? data.anexos : [];
  const v = data.viabilidade;
  const ia = data.ia_complexidade;
  const noPrazo = v?.earliest && data.prazo_desejado
    ? new Date(v.earliest) <= new Date(data.prazo_desejado)
    : null;

  return (
    <>
      {/* A moldura do app sai pelo bloco `@media print` global do index.css
          (só imprime o que está dentro de #root). Aqui fica só o que é DESTE
          documento — igual RelatorioCliente.tsx. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          .folha { color: #111 !important; background: #fff !important;
                   max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .folha * { color: inherit !important; border-color: #ddd !important; }
          .folha .bloco { break-inside: avoid; }
          .folha .cabecalho { break-after: avoid; break-inside: avoid; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border/50 bg-background/95 px-4 py-3 backdrop-blur">
        <button onClick={voltar} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>
        <span className="text-xs text-muted-foreground">
          Briefing · {data.nome_projeto}
        </span>
        <Button size="sm" className="ml-auto" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir / Salvar PDF
        </Button>
      </div>

      <div className="folha mx-auto max-w-3xl bg-white p-10 text-[#111]">
        <div className="cabecalho flex items-start justify-between gap-6 border-b border-[#ddd] pb-5">
          <div>
            <p className="text-xl font-bold tracking-tight">{PRODUTORA.wordmark}</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#888]">{PRODUTORA.descricao}</p>
          </div>
          <div className="text-right text-xs leading-relaxed text-[#555]">
            <p className="text-sm font-semibold text-[#111]">{STATUS_LABEL[data.status] || data.status}</p>
            <p className="mt-1">Recebido em {formatDate(data.created_at)}</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#888]">Briefing</p>
          <h1 className="text-2xl font-bold tracking-tight">{data.nome_projeto}</h1>
          {data.clientName && <p className="mt-1 text-sm text-[#555]">{data.clientName}</p>}
        </div>

        <div className="bloco mt-6 grid gap-3 border-t border-[#ddd] pt-4 sm:grid-cols-2">
          <Info label="Solicitante">{data.solicitante_nome} · {data.solicitante_email}</Info>
          <Info label="Prazo pedido">{fmtDateTime(data.prazo_desejado)}</Info>
          {v?.earliest && (
            <Info label="Podemos entregar até">
              <span style={{ color: noPrazo ? "#0a7a3d" : "#a15c00" }}>{fmtDateTime(v.earliest)}</span>
            </Info>
          )}
        </div>

        {v && (
          <div className="bloco mt-4 rounded-md border border-[#ddd] bg-[#f7f7f7] p-3 text-xs text-[#555]">
            <p className="mb-1 font-medium text-[#111]">Cálculo de viabilidade</p>
            Fila do editor {Number(v.carga_horas || 0)}h + edição {Number(v.demanda_horas || 0)}h + revisão {Number(v.revisao_horas || 0)}h = <strong>{Number(v.total_horas || 0)}h úteis</strong>.
            {v.complexidade && <> · complexidade da entrega: <strong>{v.complexidade}</strong></>}
            {v.rodadas != null && <> · alteração projetada: <strong>{v.rodadas}×</strong> {v.rodadas_hist ? "(histórico do cliente)" : "(fator manual)"}</>}
          </div>
        )}

        {ia && (
          <div className="bloco mt-4 rounded-md border border-[#ddd] p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-[#111]">
              <Sparkles className="h-3.5 w-3.5" /> Complexidade (leitura de IA)
            </p>
            <div className="mt-2 space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-[#555]">
                <span className="rounded border border-[#ddd] px-1.5 py-0.5 text-[10px] font-medium">
                  complexidade {ia.complexidade_geral}
                </span>
                {ia.horas_ajustadas != null && (
                  <span>{Number(v?.total_horas || 0)}h → <strong className="text-[#111]">~{ia.horas_ajustadas}h</strong> com a leitura (×{ia.fator_ajuste})</span>
                )}
              </div>
              {ia.nota && <p className="text-[#555]">{ia.nota}</p>}
              {Array.isArray(ia.riscos) && ia.riscos.length > 0 && (
                <ul className="space-y-0.5">
                  {ia.riscos.map((r: string, i: number) => (
                    <li key={i} className="flex items-start gap-1 text-[#555]">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="mt-6">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#888]">
            Entregas · {entregas.length} no formulário
          </p>
          <div className="space-y-2">
            {entregas.map((e: any, i: number) => (
              <div key={i} className="bloco rounded-md border border-[#ddd] p-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#111]">{e.titulo || `Vídeo ${i + 1}`}</span>
                  {e.formato && <span className="rounded bg-[#f0f0f0] px-1.5 py-0.5 text-[10px] text-[#555]">{e.formato}</span>}
                  {e.duracao && <span className="text-[10px] text-[#555]">{e.duracao}</span>}
                </div>
                {e.briefing && <CamposDoFormulario briefing={e.briefing} />}
              </div>
            ))}
          </div>
        </div>

        {anexos.length > 0 && (
          <div className="mt-6">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#888]">Anexos</p>
            <div className="space-y-1 text-xs">
              {anexos.map((a: any, i: number) => (
                <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[#555] hover:text-[#111]">
                  <Paperclip className="h-3 w-3" /> {a.nome}
                </a>
              ))}
            </div>
          </div>
        )}

        <p className="mt-10 text-center text-[10px] text-[#9a9a9a]">
          {PRODUTORA.nome} · {PRODUTORA.site} · {PRODUTORA.email}
        </p>
      </div>
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[#888]">{label}</p>
      <p className="text-sm text-[#111]">{children}</p>
    </div>
  );
}
