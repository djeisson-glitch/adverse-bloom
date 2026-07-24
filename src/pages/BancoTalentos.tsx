import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFuncoes } from "@/components/cadastro/CamposCadastro";
import { Users, Truck, Copy, Check, Link2, Search, Lock } from "lucide-react";
import { toast } from "sonner";

/**
 * Banco de talentos e fornecedores — as duas listas + os LINKS públicos de
 * cadastro (é aqui que se acha o formulário pra mandar pra pessoa).
 * Dados bancários não aparecem aqui: moram na tabela lateral, protegidos.
 */

type Aba = "fornecedores" | "freelancers";

export default function BancoTalentos() {
  const [aba, setAba] = useState<Aba>("fornecedores");
  const [busca, setBusca] = useState("");
  const [funcao, setFuncao] = useState<string>("");
  const { data: funcoes = [] } = useFuncoes();

  const { data: fornecedores = [] } = useQuery({
    queryKey: ["banco-fornecedores"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("fornecedores")
        .select("id, nome, email, telefone, funcoes, cidade, estado, status, created_at")
        .order("created_at", { ascending: false });
      return (data as any[]) || [];
    },
  });

  const { data: freelancers = [] } = useQuery({
    queryKey: ["banco-freelancers"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("freelancers")
        .select("id, nome_completo, nome_artistico, email, whatsapp, funcoes, funcao_principal, valor_diaria, cidade, estado, status, created_at")
        .order("created_at", { ascending: false });
      return (data as any[]) || [];
    },
  });

  const nomeFuncao = (id: string) => funcoes.find((f) => f.id === id)?.nome || id;

  const lista = useMemo(() => {
    const base = aba === "fornecedores"
      ? fornecedores.map((x) => ({ ...x, _nome: x.nome, _contato: x.email, _fone: x.telefone }))
      : freelancers.map((x) => ({ ...x, _nome: x.nome_completo, _contato: x.email, _fone: x.whatsapp }));
    const q = busca.trim().toLowerCase();
    return base.filter((x) => {
      const casaFuncao = !funcao || (x.funcoes || []).includes(funcao);
      const casaBusca = !q || `${x._nome} ${x._contato} ${x.cidade || ""}`.toLowerCase().includes(q);
      return casaFuncao && casaBusca;
    });
  }, [aba, fornecedores, freelancers, busca, funcao]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Fornecedores &amp; Freelancers</h1>
          <p className="text-sm text-muted-foreground">Seu banco de talentos — filtre por função pra achar quem você precisa.</p>
        </div>
      </div>

      <LinksCadastro />

      {/* Abas */}
      <div className="flex gap-1 border-b border-border/60">
        {([
          { id: "fornecedores", label: "Fornecedores", n: fornecedores.length },
          { id: "freelancers", label: "Freelancers", n: freelancers.length },
        ] as { id: Aba; label: string; n: number }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setAba(t.id)}
            className={`border-b-2 px-4 py-2 text-sm transition-colors ${
              aba === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label} <span className="ml-1 text-xs text-muted-foreground">{t.n}</span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-9" placeholder="Buscar por nome, e-mail ou cidade…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          value={funcao}
          onChange={(e) => setFuncao(e.target.value)}
        >
          <option value="">Todas as funções</option>
          {funcoes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        {funcao && (
          <Button size="sm" variant="ghost" className="h-9" onClick={() => setFuncao("")}>Limpar</Button>
        )}
      </div>

      <Card className="glass-card">
        <CardContent className="p-0">
          {lista.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              {fornecedores.length + freelancers.length === 0
                ? "Ninguém cadastrado ainda. Mande o link do formulário acima pra quem você quer no banco."
                : "Nada com esse filtro."}
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {lista.map((p: any) => (
                <li key={p.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {p._nome}
                      {p.nome_artistico && <span className="ml-1.5 text-xs text-muted-foreground">({p.nome_artistico})</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p._contato}
                      {p._fone && <> · {p._fone}</>}
                      {p.cidade && <> · {p.cidade}{p.estado ? `/${p.estado}` : ""}</>}
                    </p>
                    {(p.funcoes || []).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {p.funcoes.map((f: string) => (
                          <span key={f} className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                            {nomeFuncao(f)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {p.valor_diaria != null && (
                    <span className="shrink-0 text-xs text-muted-foreground">diária ~ R$ {Number(p.valor_diaria).toFixed(0)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
        <Lock className="h-3 w-3" /> Conta bancária e chave PIX não aparecem aqui — ficam guardados à parte e só quem paga acessa.
      </p>
    </div>
  );
}

/** Os links públicos dos formulários, com copiar — é aqui que se acha. */
function LinksCadastro() {
  const [copiado, setCopiado] = useState<string | null>(null);
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const links = [
    { id: "fornecedor", titulo: "Cadastro de fornecedor", icon: Truck, url: `${base}/cadastro/fornecedor` },
    { id: "freelancer", titulo: "Cadastro de freelancer", icon: Users, url: `${base}/cadastro/freelancer` },
  ];
  const copiar = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(id);
      toast.success("Link copiado");
      setTimeout(() => setCopiado(null), 1800);
    } catch { toast.error("Não deu pra copiar"); }
  };

  return (
    <Card className="glass-card border-primary/25">
      <CardContent className="p-4">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Link2 className="h-4 w-4 text-primary" /> Links de cadastro
          <span className="ml-1 text-xs font-normal text-muted-foreground">— mande pra pessoa preencher (não precisa de login)</span>
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {links.map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <l.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">{l.titulo}</p>
                <p className="truncate text-[11px] text-muted-foreground">{l.url}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <a href={l.url} target="_blank" rel="noreferrer"
                   className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary" title="Abrir">
                  <Link2 className="h-3.5 w-3.5" />
                </a>
                <button onClick={() => copiar(l.id, l.url)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary" title="Copiar link">
                  {copiado === l.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
