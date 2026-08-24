import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2, Settings2, Plus, X, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { PRODUTORA, nomeArquivoProposta } from "@/lib/produtora";
import { useVoltar } from "@/hooks/useVoltar";
import { porBloco, comPadroes } from "@/lib/condicoes";

/**
 * Carta de orçamento SIMPLES — uma folha, tons de cinza.
 *
 * A carta que já existia é a peça de venda: capa, conceito, escopo escrito,
 * condições, elenco. Boa pra ganhar o job, longa demais pra tudo que vem
 * depois — confirmar valor, anexar num e-mail, mandar pro financeiro do
 * cliente. Pra isso o que se quer é a nota: itens, quantidade, unitário,
 * total, e acabou.
 *
 * MONOCROMÁTICA de propósito. O vermelho da Adverse é assinatura, não
 * decoração de tabela — e um documento de valor lido em tela, impresso em
 * laser preto-e-branco ou reencaminhado três vezes tem que sobreviver a
 * tudo isso sem perder hierarquia. Cinza resolve; cor vira ruído.
 *
 * E funciona DEPOIS de ganho ou perdido, que era o buraco: o menu de
 * proposta desabilita quando o negócio fecha, e justamente aí é quando mais
 * se pede o documento de volta.
 */

type Item = {
  id: string;
  item_name: string | null;
  descricao: string | null;
  quantity: number | null;
  diaria: number | null;
  client_unit_price: number | null;
  categoria_id: string | null;
  ordem: number | null;
};

const valorDaLinha = (i: Item) =>
  Number(i.quantity || 0) * Number(i.diaria ?? 1) * Number(i.client_unit_price || 0);

export default function CartaSimples() {
  const { id } = useParams<{ id: string }>();
  // Qual OPÇÃO do orçamento esta carta representa. Vem do editor (`?opcao=`);
  // sem ela, a busca cai no principal.
  const [params] = useSearchParams();
  const opcaoId = params.get("opcao");
  const voltar = useVoltar(`/orcamentos/${id}`);
  /**
   * O que aparece na folha.
   *
   * Tudo desligável porque a mesma carta serve pra situações diferentes: a que
   * vai pro cliente esconde a composição (valor por linha é convite a
   * negociar item a item); a que vai pro financeiro dele às vezes precisa da
   * quantidade; e a interna quer tudo. Um documento só, com chaves.
   *
   * O padrão é o mais fechado: só o total. Mostrar a mais é decisão
   * consciente; mostrar a mais por descuido é o que gera a conversa errada.
   */
  const [ver, setVer] = useState({
    itens: true,          // as linhas da tabela
    quantidade: false,    // coluna Qtd.
    valorLinha: false,    // valor de cada linha — fechado por padrão
    unitario: false,      // preço unitário (só faz sentido com valor por linha)
    criacao: true,        // quando o orçamento foi feito
    emissao: true,        // quando este papel foi gerado
    validade: true,
    condicoes: true,
    inclusos: true,
  });
  const [detalhada, setDetalhada] = useState(false);

  /** Textos editáveis do documento — vivem só nesta tela até serem salvos. */
  const [txt, setTxt] = useState<{ condicoes: string | null; incl: string[] | null; naoIncl: string[] | null }>({
    condicoes: null, incl: null, naoIncl: null,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["carta-simples", id, opcaoId],
    enabled: !!id,
    queryFn: async () => {
      const [deal, cats] = await Promise.all([
        (supabase as any).from("deals")
          .select("id, title, objetivo, stage, value, valor_proposta, created_at, client:clients(name, contact_name, email, phone)")
          .eq("id", id).maybeSingle(),
        (supabase as any).from("budget_categorias").select("id, codigo, nome, ordem").order("ordem"),
      ]);
      // Mesma regra da carta completa: a opção aberta manda; sem ela, o
      // PRINCIPAL — nunca "o mais recente", que virou a última variante.
      const budget = opcaoId
        ? await (supabase as any).from("budgets")
            .select("id, budget_number, total_value, condicoes, created_at, variante_nome")
            .eq("id", opcaoId).maybeSingle()
        : await (supabase as any).from("budgets")
            .select("id, budget_number, total_value, condicoes, created_at, variante_nome")
            .eq("deal_id", id).is("parent_budget_id", null).eq("is_latest_version", true)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const itens = budget.data?.id
        ? await (supabase as any).from("budget_items")
            .select("id, item_name, descricao, quantity, diaria, client_unit_price, categoria_id, ordem")
            .eq("budget_id", budget.data.id).order("ordem")
        : { data: [] };
      return {
        deal: deal.data,
        budget: budget.data,
        categorias: new Map<string, any>((cats.data || []).map((c: any) => [c.id, c])),
        itens: (itens.data || []) as Item[],
      };
    },
  });

  const calc = useMemo(() => {
    if (!data) return null;
    // Linha sem valor não vira linha de nota. O orçamento tem dezenas de itens
    // zerados (o template inteiro), e listá-los faria o cliente procurar o que
    // ele está comprando no meio do que não está.
    const comValor = data.itens.filter((i) => valorDaLinha(i) > 0);

    const porCategoria = new Map<string, { nome: string; ordem: number; total: number; itens: Item[] }>();
    for (const i of comValor) {
      const cat = data.categorias.get(i.categoria_id || "");
      const chave = cat?.id || "sem";
      const atual = porCategoria.get(chave) || {
        nome: cat?.nome || "Outros", ordem: cat?.ordem ?? 999, total: 0, itens: [],
      };
      atual.total += valorDaLinha(i);
      atual.itens.push(i);
      porCategoria.set(chave, atual);
    }
    const grupos = [...porCategoria.values()].sort((a, b) => a.ordem - b.ordem);
    const somaItens = comValor.reduce((s, i) => s + valorDaLinha(i), 0);

    // O total do orçamento manda sobre a soma das linhas: ele já passou pelo
    // arredondamento e pelos ajustes do editor. A soma serve de conferência.
    const total = Number(data.budget?.total_value) || somaItens
      || Number(data.deal?.valor_proposta) || Number(data.deal?.value) || 0;

    return { comValor, grupos, somaItens, total, difere: Math.abs(total - somaItens) > 0.5 };
  }, [data]);

  // Nome do arquivo no "Salvar como PDF".
  const titulo = data?.deal?.title;
  const numero = data?.budget?.budget_number;
  useEffect(() => {
    if (!titulo) return;
    const antes = document.title;
    document.title = nomeArquivoProposta(titulo, numero);
    return () => { document.title = antes; };
  }, [titulo, numero]);

  if (isLoading || !data || !calc) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const cli = data.deal?.client || {};
  const emissao = new Date();
  const validade = new Date(emissao.getTime() + 15 * 86400000);
  const fmtD = (d: Date) => d.toLocaleDateString("pt-BR");
  const cond = porBloco(comPadroes(data.budget?.condicoes));

  const linhas: { n: number; desc: string; qtd: string; unit: number | null; total: number }[] = detalhada
    ? calc.comValor.map((i, n) => ({
        n: n + 1,
        desc: (i.descricao || i.item_name || "Item").trim(),
        qtd: `${Number(i.quantity || 0)}${Number(i.diaria ?? 1) > 1 ? ` × ${Number(i.diaria)}` : ""}`,
        unit: Number(i.client_unit_price || 0),
        total: valorDaLinha(i),
      }))
    : calc.grupos.map((g, n) => ({
        n: n + 1,
        desc: g.nome,
        qtd: `${g.itens.length} ${g.itens.length === 1 ? "item" : "itens"}`,
        unit: null,
        total: g.total,
      }));

  // Condições e listas: o que foi editado nesta tela vence o que veio do
  // orçamento. `null` = ainda não mexeram, usa o do banco.
  const condPadrao = `Proposta válida até ${fmtD(validade)}. Início da produção mediante aprovação formal. Valores em reais, impostos inclusos.`;
  const condicoesTexto = txt.condicoes ?? condPadrao;
  const listaIncl = txt.incl ?? cond.inclusos.map((c) => c.rotulo + (c.obs ? ` — ${c.obs}` : ""));
  const listaNaoIncl = txt.naoIncl ?? cond.naoInclusos.map((c) => c.rotulo + (c.obs ? ` — ${c.obs}` : ""));
  const criacao = data.budget?.created_at || data.deal?.created_at;

  /** Uma chave do painel de exibição. */
  const Chave = ({ k, rot }: { k: keyof typeof ver; rot: string }) => (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1.5 text-xs">
      <span>{rot}</span>
      <Switch checked={ver[k]} onCheckedChange={(v) => setVer((o) => ({ ...o, [k]: v }))} />
    </label>
  );

  /** Lista editável (incluso / não incluso). */
  const ListaEditavel = ({ itens, onChange }: { itens: string[]; onChange: (l: string[]) => void }) => (
    <div className="space-y-1">
      {itens.map((t, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            value={t}
            onChange={(e) => onChange(itens.map((x, j) => (j === i ? e.target.value : x)))}
            className="h-7 text-xs"
          />
          <button onClick={() => onChange(itens.filter((_, j) => j !== i))}
                  className="shrink-0 text-muted-foreground hover:text-destructive" title="Remover">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...itens, ""])}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
        <Plus className="h-3 w-3" /> adicionar
      </button>
    </div>
  );

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          .nota { max-width: none !important; margin: 0 !important; padding: 0 !important; }
          /* inherit, e não uma cor fixa: com #1a1a1a aqui, ESTE seletor
             alcançava também o <span> do valor dentro da faixa preta — e o
             total saía preto sobre preto, invisível no PDF que vai pro
             cliente. Herdando, cada bloco decide a sua cor e os filhos
             acompanham. */
          .nota { color: #1a1a1a !important; }
          .nota * { color: inherit !important; border-color: #d8d8d8 !important; }
          /* A faixa e TUDO dentro dela em branco — a regra acima cobre os
             filhos por herança, e esta define a cor de onde herdar. */
          .nota .faixa { background: #1a1a1a !important; color: #fff !important; }
          .nota .faixa * { color: #fff !important; }
          .nota .zebra { background: #f4f4f4 !important; }
          .nota tr { break-inside: avoid; }
          .nota thead { display: table-header-group; }
          .nota .bloco { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border/50 bg-background/95 px-4 py-3 backdrop-blur">
        <button onClick={voltar} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>
        <span className="text-xs text-muted-foreground">Carta simples · {data.deal?.title}</span>
        <div className="ml-auto flex items-center gap-2">
          {/* Um painel só, com tudo que o documento pode mostrar ou esconder.
              Espalhar isso em botões soltos faria a barra crescer a cada
              pedido novo — e ninguém acharia a chave que procura. */}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline">
                <Settings2 className="mr-1.5 h-3.5 w-3.5" /> O que mostrar
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Itens</p>
              <label className="flex cursor-pointer items-center justify-between gap-4 py-1.5 text-xs">
                <span>Detalhar item a item</span>
                <Switch checked={detalhada} onCheckedChange={setDetalhada} />
              </label>
              <Chave k="itens" rot="Mostrar a tabela" />
              <Chave k="quantidade" rot="Coluna de quantidade" />
              <Chave k="valorLinha" rot="Valor por linha" />
              {ver.valorLinha && detalhada && <Chave k="unitario" rot="Preço unitário" />}

              <p className="mb-1 mt-3 border-t border-border/50 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cabeçalho</p>
              <Chave k="criacao" rot="Data de criação do orçamento" />
              <Chave k="emissao" rot="Data de emissão deste papel" />
              <Chave k="validade" rot="Validade" />

              <p className="mb-1 mt-3 border-t border-border/50 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rodapé</p>
              <Chave k="inclusos" rot="Incluso / não incluso" />
              <Chave k="condicoes" rot="Condições" />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline">Editar textos</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-[70vh] w-96 overflow-y-auto">
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-xs">Condições</Label>
                  <button onClick={() => setTxt((t) => ({ ...t, condicoes: null }))}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                    <RotateCcw className="h-3 w-3" /> padrão
                  </button>
                </div>
                <Textarea rows={3} className="text-xs" value={condicoesTexto}
                          onChange={(e) => setTxt((t) => ({ ...t, condicoes: e.target.value }))} />
              </div>

              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-xs">Incluso</Label>
                  <button onClick={() => setTxt((t) => ({ ...t, incl: null }))}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                    <RotateCcw className="h-3 w-3" /> do orçamento
                  </button>
                </div>
                <ListaEditavel itens={listaIncl} onChange={(l) => setTxt((t) => ({ ...t, incl: l }))} />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-xs">Não incluso</Label>
                  <button onClick={() => setTxt((t) => ({ ...t, naoIncl: null }))}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                    <RotateCcw className="h-3 w-3" /> do orçamento
                  </button>
                </div>
                <ListaEditavel itens={listaNaoIncl} onChange={(l) => setTxt((t) => ({ ...t, naoIncl: l }))} />
              </div>

              <p className="mt-3 border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
                Vale só para este documento — não altera o orçamento. Pra mudar de vez, edite as
                condições na planilha.
              </p>
            </PopoverContent>
          </Popover>

          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir / Salvar PDF
          </Button>
        </div>
      </div>

      {/* Tudo em cinza: #1a1a1a no texto forte, #666 no apoio, #d8d8d8 nas
          linhas. Sem cor nenhuma — a hierarquia vem de peso e espaço. */}
      <div className="nota mx-auto my-6 max-w-3xl bg-white px-12 py-10 text-[#1a1a1a] shadow-sm">
        {/* Faixa superior fina: o único elemento "cheio" da folha. */}
        <div className="faixa -mx-12 -mt-10 mb-10 h-2 bg-[#1a1a1a]" />

        <div className="mb-10 text-center">
          <p className="text-2xl font-extrabold tracking-tight">{PRODUTORA.wordmark}</p>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#8a8a8a]">{PRODUTORA.descricao}</p>
        </div>

        <div className="bloco mb-10 flex items-start justify-between gap-8">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a8a8a]">Para</p>
            <p className="mt-1 text-lg font-bold leading-tight">{cli.name || "—"}</p>
            {cli.contact_name && <p className="text-sm text-[#555]">A/C {cli.contact_name}</p>}
            {cli.email && <p className="text-xs text-[#777]">{cli.email}</p>}
            {cli.phone && <p className="text-xs text-[#777]">{cli.phone}</p>}
          </div>
          <div className="shrink-0 text-right">
            {/* O número em corpo grande, junto da palavra ORÇAMENTO: é por ele
                que o documento é chamado no telefone e procurado na pasta. */}
            <p className="text-3xl font-extrabold uppercase leading-none tracking-tight">Orçamento</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-[#1a1a1a]">
              {numero != null ? `#${String(numero).padStart(4, "0")}` : "—"}
            </p>
            <table className="ml-auto mt-3 text-xs">
              <tbody className="text-[#555]">
                {ver.criacao && criacao && (
                  <tr>
                    <td className="pr-4 text-left">Cadastro</td>
                    <td className="tabular-nums">{fmtD(new Date(criacao))}</td>
                  </tr>
                )}
                {ver.emissao && (
                  <tr><td className="pr-4 text-left">Emissão</td><td className="tabular-nums">{fmtD(emissao)}</td></tr>
                )}
                {ver.validade && (
                  <tr><td className="pr-4 text-left">Validade</td><td className="tabular-nums">{fmtD(validade)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {data.deal?.title && (
          <div className="bloco mb-6 border-t border-[#d8d8d8] pt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a8a8a]">Projeto</p>
            <p className="mt-0.5 text-sm font-semibold">{data.deal.title}</p>
            {data.deal.objetivo && <p className="mt-1 text-xs leading-relaxed text-[#555]">{data.deal.objetivo}</p>}
          </div>
        )}

        {ver.itens && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-[#1a1a1a] text-left text-[10px] uppercase tracking-wider">
                <th className="w-8 py-2 font-bold">Nº</th>
                <th className="py-2 font-bold">Descrição</th>
                {ver.quantidade && <th className="w-20 py-2 text-right font-bold">Qtd.</th>}
                {ver.valorLinha && ver.unitario && detalhada && <th className="w-28 py-2 text-right font-bold">Unitário</th>}
                {ver.valorLinha && <th className="w-28 py-2 text-right font-bold">Valor</th>}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.n} className={i % 2 === 1 ? "zebra bg-[#f4f4f4]" : ""}>
                  <td className="py-2 pl-1 tabular-nums text-[#8a8a8a]">{l.n}</td>
                  <td className="py-2 pr-3">{l.desc}</td>
                  {ver.quantidade && <td className="py-2 pr-2 text-right tabular-nums text-[#555]">{l.qtd}</td>}
                  {ver.valorLinha && ver.unitario && detalhada && (
                    <td className="py-2 pr-2 text-right tabular-nums text-[#555]">
                      {l.unit != null ? formatCurrency(l.unit) : "—"}
                    </td>
                  )}
                  {ver.valorLinha && (
                    <td className="py-2 pr-1 text-right font-medium tabular-nums">{formatCurrency(l.total)}</td>
                  )}
                </tr>
              ))}
              {linhas.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-[#8a8a8a]">
                  Nenhum item com valor na planilha deste orçamento.
                </td></tr>
              )}
            </tbody>
          </table>
        )}

        <div className="bloco mt-6 flex justify-end">
          <div className="w-64">
            {/* A conferência "soma dos itens" só faz sentido quando o valor de
                cada linha está à vista. Sem os valores, ela vira um número
                solto que ninguém consegue conferir — e que só levanta dúvida
                sobre o total. */}
            {calc.difere && ver.valorLinha && ver.itens && (
              // Diferença entre a soma das linhas e o total do orçamento é
              // arredondamento ou ajuste manual no editor. Mostrar em vez de
              // esconder: cliente que soma a coluna e não bate liga perguntando.
              <div className="flex justify-between border-b border-[#e8e8e8] py-1 text-xs text-[#777]">
                <span>Soma dos itens</span>
                <span className="tabular-nums">{formatCurrency(calc.somaItens)}</span>
              </div>
            )}
            <div className="faixa mt-2 flex items-baseline justify-between bg-[#1a1a1a] px-4 py-3 text-white">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Total</span>
              <span className="text-xl font-extrabold tabular-nums">{formatCurrency(calc.total)}</span>
            </div>
          </div>
        </div>

        {ver.inclusos && (listaIncl.length > 0 || listaNaoIncl.length > 0) && (
          <div className="bloco mt-10 grid gap-6 border-t border-[#d8d8d8] pt-5 sm:grid-cols-2">
            {listaIncl.filter(Boolean).length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a8a8a]">Incluso</p>
                <ul className="mt-1 space-y-0.5 text-xs text-[#333]">
                  {listaIncl.filter(Boolean).map((t, i) => <li key={i}>· {t}</li>)}
                </ul>
              </div>
            )}
            {listaNaoIncl.filter(Boolean).length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a8a8a]">Não incluso</p>
                <ul className="mt-1 space-y-0.5 text-xs text-[#333]">
                  {listaNaoIncl.filter(Boolean).map((t, i) => <li key={i}>· {t}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {ver.condicoes && condicoesTexto.trim() && (
          <div className="bloco mt-8 border-t border-[#d8d8d8] pt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a8a8a]">Condições</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[#555]">{condicoesTexto}</p>
          </div>
        )}

        <p className="mt-10 text-center text-[10px] text-[#9a9a9a]">
          {PRODUTORA.nome} · {PRODUTORA.site} · {PRODUTORA.email}
        </p>
      </div>
    </>
  );
}
