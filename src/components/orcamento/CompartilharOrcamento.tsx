import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Share2, Copy, Check, Trash2, Eye, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm";
import { formatDate } from "@/lib/format";

/**
 * Camadas do orçamento que podem ser mostradas ou escondidas, uma a uma.
 *
 * A ordem é a do encaixe: o de cima é pré-requisito do de baixo. Sem valor,
 * custo e rentabilidade não querem dizer nada — a função no banco desliga os
 * dois sozinha, e a tela mostra isso em vez de deixar marcar à toa.
 */
type Camada = { key: string; label: string; ajuda: string; precisa?: string };

const CAMADAS: Camada[] = [
  { key: "valores",       label: "Valores",       ajuda: "Preço por linha, total por grupo e valor final" },
  { key: "custos",        label: "Custos",        ajuda: "Quanto cada linha custa de verdade", precisa: "valores" },
  { key: "rentabilidade", label: "Rentabilidade", ajuda: "Taxa da produtora, sobra e margem", precisa: "valores" },
  { key: "comissoes",     label: "Comissões",     ajuda: "Quem recebe comissão e quanto" },
  { key: "impostos",      label: "Impostos",      ajuda: "O percentual de imposto aplicado" },
  { key: "briefing",      label: "Briefing",      ajuda: "Objetivo, local e formatos do job" },
  { key: "observacoes",   label: "Observações",   ajuda: "A coluna de observações das linhas" },
];

/**
 * Nasce com TUDO visível.
 *
 * O caso que motivou a feature é validar o orçamento com quem é de casa — e
 * pra esse a resposta é "manda tudo". Esconder camada existe pro segundo
 * caso, quando o link vai pra alguém de fora do círculo; aí é escolha
 * deliberada, feita na hora, e não um padrão que faz o mentor receber um
 * documento pela metade sem ninguém ter decidido isso.
 */
const PADRAO: Record<string, boolean> = {
  valores: true, custos: true, rentabilidade: true,
  comissoes: true, impostos: true, briefing: true, observacoes: true,
};

type Share = {
  id: string; token: string; nome: string; mostrar: Record<string, boolean>;
  created_at: string; visitas: number; visto_em: string | null; revogado_em: string | null;
};

export function CompartilharOrcamento({ budgetId }: { budgetId: string }) {
  const qc = useQueryClient();
  const confirmar = useConfirm();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [mostrar, setMostrar] = useState<Record<string, boolean>>({ ...PADRAO });
  const [copiado, setCopiado] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const { data: links = [] } = useQuery({
    queryKey: ["budget-shares", budgetId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("budget_shares").select("*")
        .eq("budget_id", budgetId).is("revogado_em", null)
        .order("created_at", { ascending: false });
      return (data || []) as Share[];
    },
    // Carrega com a página, não só quando o painel abre: o número ao lado do
    // botão é o aviso de que este orçamento está aberto pra alguém lá fora, e
    // esse aviso só serve se aparecer sem precisar procurar.
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: ["budget-shares", budgetId] });
  const urlDe = (token: string) => `${window.location.origin}/orcamento-compartilhado/${token}`;

  const copiar = async (s: Share) => {
    await navigator.clipboard.writeText(urlDe(s.token));
    setCopiado(s.id);
    setTimeout(() => setCopiado(null), 2000);
    toast.success("Link copiado", { description: `Vista de ${s.nome}` });
  };

  const criar = async () => {
    if (!nome.trim()) return toast.error("Diga de quem é o link — é como você vai revogar o certo depois");
    setCriando(true);
    const { data, error } = await (supabase as any).rpc("orcamento_share_criar", {
      _budget_id: budgetId, _nome: nome.trim(), _mostrar: mostrar, _dias: null,
    });
    setCriando(false);
    if (error) return toast.error("Não criou o link", { description: error.message });
    setNome("");
    recarregar();
    if (data?.token) {
      await navigator.clipboard.writeText(urlDe(data.token));
      toast.success("Link criado e copiado", { description: "Já pode colar pra quem vai ver." });
    }
  };

  const revogar = async (s: Share) => {
    if (!(await confirmar({
      title: `Revogar o link de ${s.nome}?`,
      description: "Quem tiver esse endereço passa a ver 'link indisponível'. Não dá pra desfazer — precisa criar outro.",
      confirmText: "Revogar", destructive: true,
    }))) return;
    // .select() porque o PostgREST devolve 204 mesmo quando a RLS barra tudo.
    const { data, error } = await (supabase as any)
      .from("budget_shares").update({ revogado_em: new Date().toISOString() })
      .eq("id", s.id).select("id");
    if (error) return toast.error("Não revogou", { description: error.message });
    if (!data?.length) return toast.error("Nada foi revogado — você tem permissão pra mexer em dinheiro?");
    recarregar();
  };

  /** Muda o que um link já existente mostra, sem trocar o endereço. */
  const alternarCamada = async (s: Share, key: string) => {
    const novo = { ...(s.mostrar || {}), [key]: !s.mostrar?.[key] };
    if (key === "valores" && !novo.valores) { novo.custos = false; novo.rentabilidade = false; }
    const { data, error } = await (supabase as any)
      .from("budget_shares").update({ mostrar: novo }).eq("id", s.id).select("id");
    if (error) return toast.error("Não salvou", { description: error.message });
    if (!data?.length) return toast.error("Nada mudou — sem permissão?");
    recarregar();
  };

  const marcar = (key: string) => {
    const novo = { ...mostrar, [key]: !mostrar[key] };
    if (key === "valores" && !novo.valores) { novo.custos = false; novo.rentabilidade = false; }
    setMostrar(novo);
  };

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Share2 className="mr-1.5 h-3.5 w-3.5" />
          Compartilhar
          {links.length > 0 && (
            <span className="ml-1.5 rounded bg-primary/15 px-1 text-[10px] text-primary">{links.length}</span>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compartilhar este orçamento</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Gera um endereço que abre sem login, mostrando só o que você marcar. O que fica de fora
          não sai do banco — não é escondido na tela, é bloqueado na origem.
        </p>

        {/* Novo link */}
        <div className="space-y-3 rounded-lg border border-border/60 p-4">
          <div className="space-y-1">
            <Label className="text-[11px]">De quem é este link</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && criar()}
              placeholder="Ex.: Robert (mentor)"
            />
          </div>

          <div className="grid gap-1.5 sm:grid-cols-2">
            {CAMADAS.map((c) => {
              const travado = !!c.precisa && !mostrar[c.precisa];
              return (
                <label
                  key={c.key}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors ${
                    travado
                      ? "cursor-not-allowed border-border/40 opacity-45"
                      : mostrar[c.key]
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/60 hover:border-foreground/25"
                  }`}
                  title={travado ? `Depende de "${c.precisa}" estar marcado` : c.ajuda}
                >
                  <input
                    type="checkbox"
                    disabled={travado}
                    checked={!!mostrar[c.key] && !travado}
                    onChange={() => marcar(c.key)}
                    className="mt-0.5 h-3.5 w-3.5 accent-primary"
                  />
                  <span>
                    <span className="font-medium text-foreground">{c.label}</span>
                    <span className="block text-[10px] text-muted-foreground">{c.ajuda}</span>
                  </span>
                </label>
              );
            })}
          </div>

          <Button size="sm" onClick={criar} disabled={criando} className="w-full">
            <Share2 className="mr-1.5 h-3.5 w-3.5" />
            Criar link e copiar
          </Button>
        </div>

        {/* Links existentes */}
        {links.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Links ativos</p>
            {links.map((s) => (
              <div key={s.id} className="space-y-2 rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{s.nome}</span>
                  <span className="text-[11px] text-muted-foreground">
                    criado {formatDate(s.created_at)}
                    {" · "}
                    {s.visitas > 0
                      ? `aberto ${s.visitas}× · último ${formatDate(s.visto_em!)}`
                      : "ainda não aberto"}
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => copiar(s)} title="Copiar endereço">
                      {copiado === s.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <a
                      href={urlDe(s.token)} target="_blank" rel="noreferrer"
                      title="Abrir do jeito que ele vai ver"
                      className="rounded-md p-2 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <Button size="sm" variant="ghost" onClick={() => revogar(s)} title="Revogar">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </span>
                </div>

                {/* Dá pra mudar o que o link mostra sem trocar o endereço:
                    o mentor não precisa receber outro link porque você
                    resolveu esconder o custo depois. */}
                <div className="flex flex-wrap gap-1">
                  {CAMADAS.map((c) => {
                    const travado = !!c.precisa && !s.mostrar?.[c.precisa];
                    const on = !!s.mostrar?.[c.key] && !travado;
                    return (
                      <button
                        key={c.key}
                        disabled={travado}
                        onClick={() => alternarCamada(s, c.key)}
                        title={travado ? `Depende de "${c.precisa}"` : `Clique pra ${on ? "esconder" : "mostrar"}`}
                        className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                          travado
                            ? "cursor-not-allowed text-muted-foreground/40"
                            : on
                              ? "bg-primary/15 font-medium text-primary"
                              : "text-muted-foreground line-through hover:bg-muted/40"
                        }`}
                      >
                        {c.label.toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {aberto && links.length === 0 && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />
            Nenhum link ativo neste orçamento.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
