import { useState } from "react";
import { Link, useBeforeUnload, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { numeroOrcamento, resumoMensal, type OrcamentoMensal as Dados, type ProjetoMensal } from "@/lib/orcamentosFechamento";

export default function OrcamentoMensal() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ["orcamento-mensal", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("ler_orcamento_mensal", { _budget: id });
      if (error) throw error;
      return data as Dados;
    },
  });
  if (query.isLoading) return <p className="p-6 text-muted-foreground">Carregando orçamento…</p>;
  if (query.error || !query.data) return <div className="p-6 space-y-3"><p>Não foi possível abrir o orçamento.</p><p className="text-sm text-muted-foreground">{query.error?.message}</p><Button onClick={() => query.refetch()}>Tentar novamente</Button></div>;
  // The editor keeps a revisioned draft through background refetches; a concurrent change is rejected on save.
  return <ControleOrcamentoMensal key={id} dados={query.data} />;
}

export function ControleOrcamentoMensal({ dados }: { dados: Dados }) {
  const qc = useQueryClient();
  const [base, setBase] = useState(dados);
  const [projetos, setProjetos] = useState(dados.projetos);
  const [dirty, setDirty] = useState(false);
  const resumo = resumoMensal(base.total, projetos);
  useBeforeUnload(e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  const salvar = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("salvar_orcamento_mensal", {
        _budget: base.id, _revisao: base.revisao,
        _projetos: projetos.map(({ project_id, receita, custo }) => ({ project_id, receita, custo })),
      });
      if (error) throw error;
      return data as Dados;
    },
    onSuccess: data => {
      setBase(data); setProjetos(data.projetos); setDirty(false);
      qc.setQueryData(["orcamento-mensal", base.id], data);
      toast.success("Divisão e custos salvos");
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });
  const alterar = (id: string, campo: "receita" | "custo", texto: string) => {
    const valor = texto === "" ? null : Number(texto);
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) return;
    setProjetos(atual => atual.map(p => p.project_id === id ? { ...p, [campo]: valor } : p));
    setDirty(true);
  };
  const sair = (e: React.MouseEvent) => { if (dirty && !window.confirm("Há alterações não salvas. Sair sem salvar?")) e.preventDefault(); };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(`Orçamento: ${numeroOrcamento(base.numero)}`); toast.success("Número copiado"); }
    catch { toast.error("Não foi possível copiar o número"); }
  };
  return <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
    <Link onClick={sair} to={`/faturamento-mensal?mes=${base.mes}`} className="text-sm text-muted-foreground inline-flex items-center gap-2"><ArrowLeft className="h-4 w-4" /> Voltar ao fechamento</Link>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm text-primary font-mono">Orçamento {numeroOrcamento(base.numero)}</p><h1 className="text-2xl font-semibold mt-1">{base.cliente}</h1><p className="text-muted-foreground text-sm mt-1">Fee / fechamento · {base.mes.slice(0, 7).split("-").reverse().join("/")}</p></div>
      <Button variant="outline" onClick={copiar}><Copy className="w-4 h-4 mr-2" /> Copiar número</Button>
    </header>
    <section className="sticky top-0 z-10 bg-background/95 backdrop-blur border rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
      <Metrica label="Valor do mês" valor={formatCurrency(base.total)} />
      <Metrica label="Custos informados" valor={formatCurrency(resumo.custos)} />
      <Metrica label="Resultado do fee" valor={resumo.resultado === null ? "A conferir" : formatCurrency(resumo.resultado)} cor={resumo.resultado === null ? undefined : resumo.resultado > 0 ? "text-success" : "text-destructive"} />
      <Metrica label="Rentabilidade" valor={resumo.resultado === null || base.total <= 0 ? "—" : `${(resumo.resultado / base.total * 100).toFixed(1).replace(".", ",")}%`} />
    </section>
    <section className="border rounded-xl overflow-hidden">
      <div className="p-4 border-b space-y-1"><h2 className="font-semibold">Projetos do mês <span className="text-muted-foreground font-normal">· {projetos.length}</span></h2>

      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[650px]"><thead className="text-xs text-muted-foreground bg-muted/20"><tr><th className="text-left p-4 font-medium">Projeto</th><th className="text-right p-4 font-medium">Parte do fee (R$)</th><th className="text-right p-4 font-medium">Custo no mês (R$)</th><th className="text-right p-4 font-medium">Resultado</th></tr></thead>
        <tbody>{projetos.map(p => <Linha key={p.project_id} p={p} disabled={salvar.isPending} alterar={alterar} sair={sair} retorno={`/orcamentos-mensais/${base.id}`} />)}</tbody>
      </table></div>
      {!projetos.length && <p className="p-6 text-muted-foreground text-sm">Nenhum projeto no fee neste período. Atualize o fechamento após incluir os trabalhos.</p>}
      <footer className="p-4 border-t flex flex-wrap justify-between gap-2 text-sm">
        <span>Distribuído: <b>{formatCurrency(resumo.distribuido)}</b></span>
        <span className={resumo.diferenca === 0 ? "text-success" : "text-warning"}>{resumo.diferenca === 0 ? "Valor mensal distribuído" : resumo.diferenca > 0 ? `Falta distribuir ${formatCurrency(resumo.diferenca)}` : `Distribuição excede o mês em ${formatCurrency(-resumo.diferenca)}`}</span>
      </footer>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground max-w-xl">{!resumo.completo ? "Receitas e custos pendentes. Informe 0 quando não houver custo." : ""}</p>
      <div className="flex items-center gap-3">{dirty && <span className="text-xs text-warning">Alterações não salvas</span>}<Button onClick={() => salvar.mutate()} disabled={!dirty || salvar.isPending}><Save className="w-4 h-4 mr-2" />{salvar.isPending ? "Salvando…" : "Salvar divisão e custos"}</Button></div>
    </div>
    {salvar.isError && <p role="alert" className="text-destructive text-sm">{salvar.error.message} {salvar.error.message.includes("Recarregue") && <button className="underline" onClick={() => { if (window.confirm("Recarregar descarta as alterações não salvas. Continuar?")) window.location.reload(); }}>Recarregar</button>}</p>}
  </div>;
}
function Metrica({ label, valor, cor = "text-foreground" }: { label: string; valor: string; cor?: string }) {
  return <div><p className="text-xs text-muted-foreground mb-1">{label}</p><p className={`font-semibold text-xl ${cor}`}>{valor}</p></div>;
}
function Linha({ p, disabled, alterar, sair, retorno }: { retorno: string; p: ProjetoMensal; disabled: boolean; alterar: (id: string, campo: "receita" | "custo", texto: string) => void; sair: (e: React.MouseEvent) => void }) {
  const resultado = p.receita === null || p.custo === null ? null : Math.round((p.receita - p.custo) * 100) / 100;
  return <tr className="border-t"><td className="p-4"><Link onClick={sair} className="hover:text-primary" to={`/projetos/${p.project_id}?retorno=${encodeURIComponent(retorno)}`}>{p.projeto}</Link></td>
    {(["receita", "custo"] as const).map(campo => <td className="p-3 w-40" key={campo}><Input type="number" min="0" step="0.01" aria-label={`${campo === "receita" ? "Parte do fee" : "Custo no mês"} · ${p.projeto}`} placeholder="A informar" value={p[campo] ?? ""} disabled={disabled} onChange={e => alterar(p.project_id, campo, e.target.value)} className="text-right" /></td>)}
    <td className={`p-4 text-right tabular-nums whitespace-nowrap ${resultado === null ? "text-muted-foreground" : resultado > 0 ? "text-success" : "text-destructive"}`}>{resultado === null ? "A conferir" : <>{formatCurrency(resultado)}<span className="block text-xs">{p.receita! > 0 ? `${(resultado / p.receita! * 100).toFixed(1).replace(".", ",")}%` : "—"}</span></>}</td>
  </tr>;
}
