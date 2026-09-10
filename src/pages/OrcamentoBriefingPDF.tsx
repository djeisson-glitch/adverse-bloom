import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { PRODUTORA } from "@/lib/produtora";
import { useVoltar } from "@/hooks/useVoltar";
import { MergulhoForm } from "@/components/MergulhoForm";

/**
 * O Mergulho / Briefing estratégico de um orçamento, numa folha pronta pra
 * imprimir/salvar PDF.
 *
 * Djêisson (10/09), corrigindo o pedido anterior: "é dentro do orçamento,
 * onde tem o briefing, que é pra ter o botão de exportar pdf. serve apenas
 * para o time interno."
 *
 * Reaproveita MergulhoForm em modo `readOnly` — o MESMO componente que
 * ProjetoDetalhe.tsx já usa pra mostrar o briefing lido. Não escrevi uma
 * segunda leitura dos campos: a seção "Leitura interna (Adverse)" (as lentes
 * do Método — zeitgeist, tensão, etc.) é interna por definição no próprio
 * dado (`MERGULHO_ESTRUTURA` em src/lib/mergulho.ts), então ela sai junto
 * naturalmente — e é exatamente isso que faz sentido aqui: essa exportação
 * não tem link público, fica atrás do login, "apenas para o time interno".
 */
export default function OrcamentoBriefingPDF() {
  const { id } = useParams<{ id: string }>();
  const voltar = useVoltar(`/orcamentos/${id}`);

  // Mesma consulta que OrcamentoEditor já faz pro deal (join direto com
  // clients — esta tela só é alcançável de dentro do orçamento, já atrás do
  // mesmo gate de quem pode abrir orçamento).
  const { data: deal, isLoading } = useQuery({
    queryKey: ["orcamento-deal-briefing", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deals")
        .select("title, mergulho, mergulho_em, client:clients(name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (!deal) return;
    const anterior = document.title;
    document.title = `Briefing estratégico - ${deal.title}${deal.client?.name ? ` - ${deal.client.name}` : ""}`;
    return () => { document.title = anterior; };
  }, [deal]);

  if (isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!deal) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm text-muted-foreground">Orçamento não encontrado.</p>
        <Button size="sm" variant="outline" className="mt-4" onClick={voltar}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar
        </Button>
      </div>
    );
  }

  const dados = deal.mergulho && typeof deal.mergulho === "object" ? deal.mergulho : {};

  return (
    <>
      {/* A moldura do app some via a regra global "só imprime o que está em
          #root" (index.css). Aqui: como a folha se parte, e o remapeamento
          das cores do tema (dark) pras cores de papel — MergulhoForm usa as
          classes semânticas do tema (text-foreground etc.), então o
          remapeamento vale SEMPRE nesta página, não só no @media print, pra
          a prévia em tela já mostrar exatamente o que vai sair impresso. */}
      <style>{`
        .folha, .folha * { color: #111 !important; }
        .folha .text-muted-foreground { color: #666 !important; }
        .folha .text-primary { color: #E53500 !important; }
        .folha [class*="border-border"] { border-color: #ddd !important; }
        .folha .bg-muted\\/20, .folha .bg-muted { background: #f7f7f7 !important; }
        @media print {
          @page { size: A4; margin: 14mm; }
          .folha { background: #fff !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .folha .bloco { break-inside: avoid; }
          .folha .cabecalho { break-after: avoid; break-inside: avoid; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border/50 bg-background/95 px-4 py-3 backdrop-blur">
        <button onClick={voltar} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>
        <span className="text-xs text-muted-foreground">Briefing estratégico · {deal.title}</span>
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
            <p className="text-sm font-semibold text-[#111]">Uso interno</p>
            {deal.mergulho_em && <p className="mt-1">Respondido em {formatDate(deal.mergulho_em)}</p>}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#888]">Briefing estratégico</p>
          <h1 className="text-2xl font-bold tracking-tight">{deal.title}</h1>
          {deal.client?.name && <p className="mt-1 text-sm text-[#555]">{deal.client.name}</p>}
        </div>

        <div className="mt-6">
          <MergulhoForm value={dados} readOnly />
        </div>

        <p className="mt-10 text-center text-[10px] text-[#9a9a9a]">
          {PRODUTORA.nome} · {PRODUTORA.site} · {PRODUTORA.email}
        </p>
      </div>
    </>
  );
}
