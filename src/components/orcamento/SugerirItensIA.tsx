import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

type Categoria = { id: string; codigo: string; nome: string; ordem: number };
type BudgetItem = { categoria_id: string | null };

type Sugestao = {
  chave: string;
  categoriaId: string | null;
  descricao: string;
  quantity: number;
  diaria: number;
  justificativa: string;
  incluido: boolean;
};

const porHora = (cat?: Categoria) =>
  cat ? cat.codigo === "011" || /p[óo]s\s*produ/i.test(cat.nome || "") : false;

/**
 * Sugestão de escopo por IA — lê o briefing do orçamento (+ um texto extra
 * colado na hora: roteiro, tratamento, escopo) e sugere QUAIS LINHAS entrar
 * na planilha.
 *
 * Djêisson (10/09): "não sugira valores, os valores eu coloco depois". Por
 * isso as linhas nascem com client_unit_price 0 — o mesmo estado de uma
 * linha criada manualmente em CategoriaItens — e não existe nenhum campo de
 * preço em `Sugestao` pra editar aqui. A pessoa revisa categoria/quantidade/
 * diária linha a linha antes de decidir o que entra; nada é gravado sem
 * clicar em "Adicionar".
 */
export function SugerirItensIA({
  budgetId, categorias, itens, onChanged,
}: {
  budgetId: string;
  categorias: Categoria[];
  itens: BudgetItem[];
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [gerando, setGerando] = useState(false);
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null);
  const [adicionando, setAdicionando] = useState(false);

  const categoriaDe = (id: string | null) => categorias.find((c) => c.id === id);

  const gerar = async () => {
    setGerando(true);
    setSugestoes(null);
    const { data, error } = await (supabase as any).functions.invoke("sugerir-itens-orcamento", {
      body: { budget_id: budgetId, texto: texto.trim() || undefined },
    });
    setGerando(false);
    if (error || data?.error) {
      return toast.error("Não deu pra sugerir", { description: data?.error || error?.message });
    }
    const lista: Sugestao[] = (data?.itens || []).map((it: any, i: number) => {
      const cat = categorias.find((c) => c.codigo === it.categoria_codigo) || null;
      return {
        chave: `${Date.now()}-${i}`,
        categoriaId: cat?.id || null,
        descricao: it.descricao,
        quantity: it.quantity,
        diaria: it.diaria,
        justificativa: it.justificativa || "",
        incluido: !!cat,
      };
    });
    setSugestoes(lista);
    if (!lista.length) toast.error("A IA não sugeriu nada aproveitável — tente colar mais detalhe.");
  };

  const atualizar = (chave: string, patch: Partial<Sugestao>) => {
    setSugestoes((lista) => (lista || []).map((s) => (s.chave === chave ? { ...s, ...patch } : s)));
  };
  const remover = (chave: string) => {
    setSugestoes((lista) => (lista || []).filter((s) => s.chave !== chave));
  };

  const selecionadas = (sugestoes || []).filter((s) => s.incluido && s.categoriaId);

  const adicionar = async () => {
    if (!selecionadas.length) return;
    setAdicionando(true);
    // Ordem por categoria: entra depois do que já existe, na ordem em que
    // aparece na lista — mesmo critério de CategoriaItens ao criar uma linha.
    const contagem = new Map<string, number>();
    itens.forEach((i) => {
      const k = i.categoria_id || "";
      contagem.set(k, (contagem.get(k) || 0) + 1);
    });
    const linhas = selecionadas.map((s) => {
      const cat = categoriaDe(s.categoriaId);
      const ordemAtual = (contagem.get(s.categoriaId!) || 0) + 1;
      contagem.set(s.categoriaId!, ordemAtual);
      return {
        budget_id: budgetId,
        categoria_id: s.categoriaId,
        category: cat?.nome || "",
        descricao: s.descricao,
        item_name: s.descricao,
        quantity: s.quantity,
        diaria: s.diaria,
        client_unit_price: 0,
        client_price: 0,
        tira_taxa: false,
        ordem: ordemAtual,
        observacoes: s.justificativa ? `Sugestão IA: ${s.justificativa}` : null,
      };
    });
    const { error } = await (supabase as any).from("budget_items").insert(linhas);
    setAdicionando(false);
    if (error) return toast.error("Não adicionou", { description: error.message });
    qc.invalidateQueries({ queryKey: ["orcamento-itens", budgetId] });
    onChanged();
    toast.success(`${linhas.length} ite${linhas.length === 1 ? "m" : "ns"} adicionado${linhas.length === 1 ? "" : "s"}`, {
      description: "Sem valor ainda — preencha o preço linha a linha na planilha.",
    });
    setAberto(false);
    setSugestoes(null);
    setTexto("");
  };

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        Sugerir itens com IA
      </Button>

      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sugerir itens de escopo com IA</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Lê o briefing já preenchido neste orçamento e, se você colar mais alguma coisa abaixo
          (roteiro, tratamento, escopo por extenso), usa isso também. A IA sugere só
          <b className="text-foreground"> categoria, descrição, quantidade e diária/hora</b> — nenhum
          valor. Você revisa e decide o que entra; o preço você preenche depois, na planilha.
        </p>

        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Opcional: cole aqui roteiro, tratamento, ou qualquer informação que ajude a IA a entender o escopo…"
          className="min-h-[120px] text-sm"
        />

        <Button size="sm" onClick={gerar} disabled={gerando} className="w-full">
          {gerando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
          {gerando ? "Lendo o briefing…" : sugestoes ? "Gerar de novo" : "Sugerir itens"}
        </Button>

        {sugestoes && sugestoes.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {sugestoes.length} {sugestoes.length === 1 ? "sugestão" : "sugestões"} — desmarque o que não serve
            </p>
            <div className="space-y-2">
              {sugestoes.map((s) => {
                const cat = categoriaDe(s.categoriaId);
                return (
                  <div key={s.chave} className="space-y-1.5 rounded-lg border border-border/60 p-3">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={s.incluido}
                        disabled={!s.categoriaId}
                        onChange={(e) => atualizar(s.chave, { incluido: e.target.checked })}
                        title={!s.categoriaId ? "Escolha uma categoria pra poder incluir" : undefined}
                        className="mt-1.5 h-3.5 w-3.5 accent-primary"
                      />
                      <div className="flex-1 space-y-1.5">
                        <input
                          value={s.descricao}
                          onChange={(e) => atualizar(s.chave, { descricao: e.target.value })}
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={s.categoriaId || undefined}
                            onValueChange={(v) => atualizar(s.chave, { categoriaId: v, incluido: true })}
                          >
                            <SelectTrigger className={`h-7 w-[190px] text-xs ${!s.categoriaId ? "border-warning text-warning" : ""}`}>
                              <SelectValue placeholder="Escolher categoria" />
                            </SelectTrigger>
                            <SelectContent>
                              {categorias.map((c) => (
                                <SelectItem key={c.id} value={c.id} className="text-xs">
                                  {c.codigo} {c.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            qtd
                            <input
                              type="number"
                              min={1}
                              value={s.quantity}
                              onChange={(e) => atualizar(s.chave, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                              className="h-7 w-14 rounded-md border border-input bg-background px-1.5 text-center text-xs text-foreground"
                            />
                          </label>
                          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            {porHora(cat) ? "horas" : "diária"}
                            <input
                              type="number"
                              min={0}
                              step={porHora(cat) ? 0.5 : 1}
                              value={s.diaria}
                              onChange={(e) => atualizar(s.chave, { diaria: Math.max(0, Number(e.target.value) || 0) })}
                              className="h-7 w-14 rounded-md border border-input bg-background px-1.5 text-center text-xs text-foreground"
                            />
                          </label>
                          <button
                            onClick={() => remover(s.chave)}
                            className="ml-auto text-muted-foreground hover:text-destructive"
                            title="Remover esta sugestão"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {s.justificativa && (
                          <p className="text-[11px] italic text-muted-foreground">{s.justificativa}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              size="sm"
              onClick={adicionar}
              disabled={adicionando || !selecionadas.length}
              className="w-full bg-primary text-primary-foreground"
            >
              {adicionando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
              Adicionar {selecionadas.length} ite{selecionadas.length === 1 ? "m" : "ns"} à planilha
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
