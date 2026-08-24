import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Plus, Trash2, Check, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { hojeISO } from "@/lib/dataLocal";

/**
 * Lançamentos — o livro-caixa próprio.
 *
 * O objetivo do formulário é lançar em quinze segundos, não preencher quinze
 * campos. Por isso só seis coisas ficam à vista, e as três que quase nunca
 * mudam (tipo, categoria, data) SOBREVIVEM ao envio: lançar dez despesas de
 * software seguidas é digitar descrição e valor dez vezes, mais nada.
 *
 * O resto — projeto, cliente, parcelas, competência separada — mora atrás de
 * "mais opções", porque é o que se usa em um lançamento a cada dez.
 */

type Cat = {
  id: string; nome: string; tipo: "entrada" | "saida";
  comportamento: string; natureza: string;
};
type Lanc = {
  id: string; tipo: string; descricao: string; valor: number;
  data_competencia: string; data_vencimento: string; data_pagamento: string | null;
  categoria_id: string; parcela_num: number | null; parcela_total: number | null;
  contraparte: string | null;
};

const NATUREZA_ROTULO: Record<string, string> = {
  receita: "receita", despesa: "despesa", investimento: "investimento",
  amortizacao: "amortização", destinacao: "destinação", imposto: "imposto",
  financeiro: "financeiro", ajuste: "ajuste",
};
const NAO_E_RESULTADO = ["investimento", "amortizacao", "destinacao", "financeiro", "ajuste"];

function mesDe(iso: string) { return iso.slice(0, 7); }

export default function Lancamentos() {
  const { canSeeMoney } = usePermissions();
  const qc = useQueryClient();
  const descRef = useRef<HTMLInputElement>(null);

  const [tipo, setTipo] = useState<"entrada" | "saida">("saida");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [categoriaId, setCategoriaId] = useState("");
  const [jaPago, setJaPago] = useState(true);
  const [mais, setMais] = useState(false);
  const [competencia, setCompetencia] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [contraparte, setContraparte] = useState("");
  const [projectId, setProjectId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mesVisto, setMesVisto] = useState(mesDe(hojeISO()));

  const { data: cats = [] } = useQuery({
    queryKey: ["categorias-financeiras"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("categorias_financeiras").select("*").eq("ativa", true).order("nome");
      if (error) throw error;
      return (data ?? []) as Cat[];
    },
    enabled: canSeeMoney,
  });

  const { data: projetos = [] } = useQuery({
    queryKey: ["projetos-para-lancamento"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("projects").select("id, name").order("created_at", { ascending: false }).limit(80);
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: canSeeMoney,
  });

  const { data: lancs = [] } = useQuery({
    queryKey: ["lancamentos", mesVisto],
    queryFn: async () => {
      const ini = `${mesVisto}-01`;
      const [a, m] = mesVisto.split("-").map(Number);
      const fim = new Date(a, m, 0).toISOString().slice(0, 10);
      const { data, error } = await (supabase as any)
        .from("lancamentos").select("*")
        .gte("data_competencia", ini).lte("data_competencia", fim)
        .order("data_competencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lanc[];
    },
    enabled: canSeeMoney,
  });

  const catsDoTipo = useMemo(() => cats.filter((c) => c.tipo === tipo), [cats, tipo]);
  const catSel = cats.find((c) => c.id === categoriaId);
  const catPorId = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats]);

  const resumo = useMemo(() => {
    let receita = 0, despesa = 0, fora = 0;
    for (const l of lancs) {
      const c = catPorId[l.categoria_id];
      if (!c) continue;
      if (c.natureza === "receita") receita += Number(l.valor);
      else if (c.natureza === "despesa" || c.natureza === "imposto") despesa += Number(l.valor);
      else fora += Number(l.valor);
    }
    return { receita, despesa, resultado: receita - despesa, fora };
  }, [lancs, catPorId]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const v = Number(String(valor).replace(",", "."));
    if (!descricao.trim() || !v || v <= 0 || !categoriaId) {
      toast.error("Descrição, valor e categoria são obrigatórios.");
      return;
    }
    setSalvando(true);
    try {
      const n = Math.max(1, Number(parcelas) || 1);
      const comp = competencia || data;
      if (n > 1) {
        const { error } = await (supabase as any).rpc("lancar_parcelado", {
          _tipo: tipo, _descricao: descricao.trim(), _valor_total: v, _parcelas: n,
          _primeira_competencia: comp, _primeiro_vencimento: data,
          _categoria_id: categoriaId, _client_id: null,
          _project_id: projectId || null, _contraparte: contraparte || null, _conta: null,
        });
        if (error) throw error;
        toast.success(`${n} parcelas lançadas.`);
      } else {
        const { error } = await (supabase as any).from("lancamentos").insert({
          tipo, descricao: descricao.trim(), valor: v,
          data_competencia: comp, data_vencimento: data,
          data_pagamento: jaPago ? data : null,
          categoria_id: categoriaId, project_id: projectId || null,
          contraparte: contraparte || null, observacao: observacao || null,
          origem: "manual",
        }).select().single();
        if (error) throw error;
        toast.success("Lançado.");
      }
      // O que quase nunca muda sobrevive: tipo, categoria e data ficam.
      setDescricao(""); setValor(""); setObservacao(""); setParcelas("1");
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      descRef.current?.focus();
    } catch (err: any) {
      toast.error(err?.message ?? "Não deu pra lançar.");
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(id: string) {
    const { error } = await (supabase as any).from("lancamentos").delete().eq("id", id).select();
    if (error) return toast.error(error.message);
    toast.success("Lançamento apagado.");
    qc.invalidateQueries({ queryKey: ["lancamentos"] });
  }

  async function marcarPago(l: Lanc) {
    const { error } = await (supabase as any).from("lancamentos")
      .update({ data_pagamento: l.data_pagamento ? null : hojeISO() }).eq("id", l.id).select();
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["lancamentos"] });
  }

  if (!canSeeMoney) {
    return <div className="p-8 text-muted-foreground">Esta página mostra valores financeiros.</div>;
  }

  return (
    <div className="p-6 md:p-8 space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Lançamentos</h1>
        <p className="text-muted-foreground">
          O livro da Adverse. O que você lança aqui é o que vale — o Conta Azul fica só de conferência.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={salvar} className="space-y-4">
            <div className="flex gap-2">
              {(["saida", "entrada"] as const).map((t) => (
                <Button key={t} type="button" variant={tipo === t ? "default" : "outline"} size="sm"
                  onClick={() => { setTipo(t); setCategoriaId(""); }}>
                  {t === "saida" ? "Saída" : "Entrada"}
                </Button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_140px_150px]">
              <div className="space-y-1.5">
                <Label htmlFor="desc">Descrição</Label>
                <Input id="desc" ref={descRef} value={descricao} autoFocus
                  onChange={(e) => setDescricao(e.target.value)} placeholder="Adobe Creative Cloud" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="valor">Valor</Label>
                <Input id="valor" inputMode="decimal" value={valor}
                  onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data">Data</Label>
                <Input id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat">Categoria</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger id="cat"><SelectValue placeholder="— escolher —" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {catsDoTipo.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {catSel && (
                <p className="text-xs text-muted-foreground">
                  {catSel.comportamento} · {NATUREZA_ROTULO[catSel.natureza] ?? catSel.natureza}
                  {NAO_E_RESULTADO.includes(catSel.natureza) && (
                    <span className="text-amber-600"> — sai do caixa, mas não entra no resultado</span>
                  )}
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
              <Checkbox checked={jaPago} onCheckedChange={(v) => setJaPago(!!v)} />
              já foi {tipo === "saida" ? "pago" : "recebido"}
            </label>

            <button type="button" onClick={() => setMais(!mais)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ChevronDown className={`h-4 w-4 transition-transform ${mais ? "rotate-180" : ""}`} />
              mais opções
            </button>

            {mais && (
              <div className="grid gap-3 sm:grid-cols-2 rounded-md border p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="parc">Parcelas</Label>
                  <Input id="parc" type="number" min={1} value={parcelas}
                    onChange={(e) => setParcelas(e.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    O valor é o TOTAL — ele se divide sozinho, uma parcela por mês.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="comp">Competência</Label>
                  <Input id="comp" type="date" value={competencia}
                    onChange={(e) => setCompetencia(e.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    Vazio = igual à data. Preencha quando o gasto é de um mês e vence em outro.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="proj">Projeto</Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger id="proj"><SelectValue placeholder="— nenhum —" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {projetos.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Preencher aqui é o que faz a margem do projeto sair sozinha.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contra">Quem</Label>
                  <Input id="contra" value={contraparte} onChange={(e) => setContraparte(e.target.value)}
                    placeholder={tipo === "saida" ? "fornecedor, freela…" : "cliente…"} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="obs">Observação</Label>
                  <Textarea id="obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={salvando}>
                <Plus className="h-4 w-4 mr-2" /> {salvando ? "Lançando…" : "Lançar"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Tipo, categoria e data continuam preenchidos para o próximo.
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Input type="month" value={mesVisto} onChange={(e) => setMesVisto(e.target.value)} className="w-40" />
        <div className="flex gap-5 text-sm">
          <span>receita <b className="font-mono">{formatCurrency(resumo.receita)}</b></span>
          <span>despesa <b className="font-mono">{formatCurrency(resumo.despesa)}</b></span>
          <span className={resumo.resultado >= 0 ? "text-emerald-600" : "text-red-600"}>
            resultado <b className="font-mono">{formatCurrency(resumo.resultado)}</b>
          </span>
          {resumo.fora > 0 && (
            <span className="text-muted-foreground">
              fora do resultado <b className="font-mono">{formatCurrency(resumo.fora)}</b>
            </span>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {lancs.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhum lançamento neste mês.</p>
          ) : (
            <div className="divide-y">
              {lancs.map((l) => {
                const c = catPorId[l.categoria_id];
                return (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <button onClick={() => marcarPago(l)} title={l.data_pagamento ? "marcar em aberto" : "marcar como pago"}
                      className={`shrink-0 rounded-full p-1 ${l.data_pagamento
                        ? "text-emerald-600 hover:bg-emerald-600/10" : "text-amber-600 hover:bg-amber-600/10"}`}>
                      {l.data_pagamento ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                    </button>
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                      {l.data_competencia.slice(8, 10)}/{l.data_competencia.slice(5, 7)}
                    </span>
                    <span className="flex-1 min-w-0 truncate">
                      {l.descricao}
                      {c && <span className="text-muted-foreground text-xs"> · {c.nome}</span>}
                    </span>
                    <span className={`font-mono tabular-nums shrink-0 ${
                      l.tipo === "entrada" ? "text-emerald-600" : ""}`}>
                      {l.tipo === "entrada" ? "+" : "−"}{formatCurrency(Number(l.valor))}
                    </span>
                    <button onClick={() => apagar(l.id)}
                      className="shrink-0 text-muted-foreground hover:text-red-600 p-1" title="apagar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
