import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFuncoes } from "@/components/cadastro/CamposCadastro";
import { Users, Truck, Copy, Check, Link2, Search, Lock, ChevronDown, Instagram, Globe } from "lucide-react";
import { linkPortfolio, linkInstagram, rotuloLink } from "@/lib/perfilLinks";
import { toast } from "sonner";

/**
 * Banco de talentos e fornecedores — as duas listas + os LINKS públicos de
 * cadastro (é aqui que se acha o formulário pra mandar pra pessoa).
 *
 * Cada linha EXPANDE (clique) e mostra tudo que a pessoa preencheu. O perfil
 * o time todo vê; o bloco bancário só quem paga (RLS filtra sozinho — pra quem
 * não pode, a tabela lateral simplesmente não devolve linha).
 */

type Aba = "fornecedores" | "freelancers";

export default function BancoTalentos() {
  const [aba, setAba] = useState<Aba>("fornecedores");
  const [busca, setBusca] = useState("");
  const [funcao, setFuncao] = useState<string>("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const { data: funcoes = [] } = useFuncoes();

  const { data: fornecedores = [] } = useQuery({
    queryKey: ["banco-fornecedores"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("fornecedores")
        .select("*").order("created_at", { ascending: false });
      return (data as any[]) || [];
    },
  });

  const { data: freelancers = [] } = useQuery({
    queryKey: ["banco-freelancers"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("freelancers")
        .select("*").order("created_at", { ascending: false });
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
      const casaBusca = !q ||
        `${x._nome} ${x._contato} ${x.cidade || ""} ${x.portfolio || ""} ${x.instagram || ""}`.toLowerCase().includes(q);
      return casaFuncao && casaBusca;
    });
  }, [aba, fornecedores, freelancers, busca, funcao]);

  const toggle = (id: string) =>
    setAbertos((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Fornecedores &amp; Freelancers</h1>
          <p className="text-sm text-muted-foreground">Seu banco de talentos — filtre por função e clique pra ver tudo.</p>
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
              {lista.map((p: any) => {
                const aberto = abertos.has(p.id);
                return (
                  <li key={p.id}>
                    {/* O botão de expandir NÃO embrulha a linha inteira: os
                        links de portfólio precisam ser <a> de verdade, e <a>
                        dentro de <button> é HTML inválido — o clique abriria
                        e fecharia a linha em vez de abrir o site. */}
                    <div className="flex w-full flex-wrap items-start gap-3 px-5 py-3 hover:bg-muted/20">
                    <button
                      onClick={() => toggle(p.id)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
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
                    </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <LinksPerfil portfolio={p.portfolio} instagram={p.instagram} />
                        {p.valor_diaria != null && (
                          <span className="text-xs text-muted-foreground">diária ~ R$ {Number(p.valor_diaria).toFixed(0)}</span>
                        )}
                      </div>
                    </div>

                    {aberto && <DetalheTalento aba={aba} p={p} nomeFuncao={nomeFuncao} />}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
        <Lock className="h-3 w-3" /> Conta bancária e chave PIX só aparecem pra quem paga (admin/gestão).
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ ver o trabalho */

/**
 * Portfólio e Instagram como botão, na linha — o pedido do Djêisson: "pra
 * gente conseguir visualizar de forma rápida o trabalho de cada um".
 *
 * Fica no cabeçalho e não só no detalhe de propósito: olhar o trabalho de
 * cinco cinegrafistas pra escolher um é o gesto real, e abrir/fechar cinco
 * fichas pra isso é o que a tela existia pra evitar.
 *
 * Link que não dá pra abrir (a pessoa escreveu "mando por WhatsApp") não vira
 * botão — vira nada. Botão que leva a lugar nenhum é pior que campo vazio.
 */
function LinksPerfil({ portfolio, instagram }: { portfolio?: string | null; instagram?: string | null }) {
  const site = linkPortfolio(portfolio);
  const insta = linkInstagram(instagram);
  if (!site && !insta) return null;
  const cls = "rounded-md border border-border/60 p-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary";
  return (
    <>
      {site && (
        <a href={site} target="_blank" rel="noreferrer" className={cls} title={`Portfólio: ${rotuloLink(portfolio)}`}>
          <Globe className="h-3.5 w-3.5" />
        </a>
      )}
      {insta && (
        <a href={insta} target="_blank" rel="noreferrer" className={cls} title={`Instagram: ${rotuloLink(instagram)}`}>
          <Instagram className="h-3.5 w-3.5" />
        </a>
      )}
    </>
  );
}

/** O mesmo link, escrito, pro detalhe. */
function LinkTexto({ href, texto }: { href: string | null; texto?: string | null }) {
  if (!href) return <>{texto || ""}</>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">
      {rotuloLink(texto)}
    </a>
  );
}

/* ---------------------------------------------------------------- detalhe */

type Par = [string, any];

// Grupo guiado por dados: recebe [rótulo, valor] e só se renderiza (título +
// grade) se sobrar algum campo preenchido. Assim "Pessoa jurídica" some pra
// quem não emite nota, em vez de mostrar um cabeçalho vazio.
function Grupo({ titulo, campos }: { titulo: string; campos: Par[] }) {
  const validos = campos.filter(
    ([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0),
  );
  if (!validos.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground">{titulo}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {validos.map(([label, valor]) => (
          <div key={label}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{label}</p>
            <p className="break-words text-sm text-foreground">
              {typeof valor === "object" ? valor : String(valor)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

const fmtData = (d?: string | null) => {
  if (!d) return null;
  const [a, m, dia] = d.split("T")[0].split("-");
  return a && m && dia ? `${dia}/${m}/${a}` : d;
};
const simNao = (v?: string | null) => (v === "sim" ? "Sim" : v === "nao" ? "Não" : null);
const juntar = (arr: any[], sep = ", ") => arr.filter(Boolean).join(sep);

function DetalheTalento({ aba, p, nomeFuncao }: { aba: Aba; p: any; nomeFuncao: (id: string) => string }) {
  const grupos: { titulo: string; campos: Par[] }[] = aba === "fornecedores"
    ? [
        { titulo: "Contato", campos: [["E-mail", p.email], ["Telefone", p.telefone]] },
        { titulo: "Trabalho", campos: [
          ["Portfólio", p.portfolio ? <LinkTexto href={linkPortfolio(p.portfolio)} texto={p.portfolio} /> : null],
          ["Instagram", p.instagram ? <LinkTexto href={linkInstagram(p.instagram)} texto={p.instagram} /> : null],
        ] },
        { titulo: "Documento", campos: [["CPF / CNPJ", p.cpf_cnpj], ["Razão social", p.razao_social]] },
        { titulo: "Endereço", campos: [
          ["Endereço", juntar([p.logradouro, p.numero, p.complemento, p.bairro])],
          ["CEP", p.cep],
          ["Cidade / UF", juntar([p.cidade, p.estado], "/")],
        ] },
        { titulo: "Funções", campos: [["Funções", juntar((p.funcoes || []).map(nomeFuncao))]] },
        { titulo: "Observações", campos: [["Observações", p.observacoes]] },
      ]
    : [
        { titulo: "Contato", campos: [
          ["E-mail", p.email], ["WhatsApp", p.whatsapp],
          ["Instagram", p.instagram ? <LinkTexto href={linkInstagram(p.instagram)} texto={p.instagram} /> : null],
          ["Portfólio", p.portfolio ? <LinkTexto href={linkPortfolio(p.portfolio)} texto={p.portfolio} /> : null],
          ["Cidade / UF", juntar([p.cidade, p.estado], "/")],
        ] },
        { titulo: "Perfil", campos: [
          ["Função principal", p.funcao_principal ? nomeFuncao(p.funcao_principal) : null],
          ["Funções", juntar((p.funcoes || []).map(nomeFuncao))],
          ["Especialidades", p.especialidades],
          ["Equipamento próprio", simNao(p.equipamento_proprio)],
          ["Valor diária", p.valor_diaria != null ? `R$ ${Number(p.valor_diaria).toFixed(2)}` : null],
          ["Condições comerciais", p.condicoes_comerciais],
        ] },
        { titulo: "Documentos", campos: [
          ["CPF", p.cpf], ["RG", p.rg], ["Órgão emissor", p.orgao_emissor],
          ["Nascimento", fmtData(p.data_nascimento)],
        ] },
        { titulo: "Pessoa jurídica (nota)", campos: [
          ["CNPJ", p.cnpj], ["Razão social", p.razao_social], ["Nome fantasia", p.nome_fantasia],
          ["Inscrição municipal", p.inscricao_municipal],
          ["Endereço PJ", juntar([p.pj_endereco, p.pj_numero, p.pj_complemento, p.pj_bairro])],
          ["CEP PJ", p.pj_cep], ["Cidade / UF PJ", juntar([p.pj_cidade, p.pj_estado], "/")],
          ["E-mail fiscal", p.email_fiscal],
        ] },
        { titulo: "Produção", campos: [
          ["Restrição alimentar", p.sem_restricao ? "Sem restrição" : p.restricao_alimentar],
          ["Camiseta", p.tam_camiseta], ["Calçado", p.tam_calcado],
          ["Carro", juntar([p.carro_modelo, p.carro_cor, p.carro_placa], " · ")],
        ] },
      ];

  return (
    <div className="space-y-4 border-t border-border/40 bg-muted/10 px-5 py-4">
      {grupos.map((g) => <Grupo key={g.titulo} titulo={g.titulo} campos={g.campos} />)}
      <DadosBancarios aba={aba} id={p.id} />
    </div>
  );
}

/** Bloco bancário — só devolve linha pra quem a RLS deixa (admin/gestão). */
function DadosBancarios({ aba, id }: { aba: Aba; id: string }) {
  const tabela = aba === "fornecedores" ? "fornecedores_bancarios" : "freelancers_bancarios";
  const chave = aba === "fornecedores" ? "fornecedor_id" : "freelancer_id";
  const { data, isLoading } = useQuery({
    queryKey: ["banc", aba, id],
    queryFn: async () => {
      const { data } = await (supabase as any).from(tabela).select("*").eq(chave, id).maybeSingle();
      return (data as any) || null;
    },
  });

  const campos: Par[] = data
    ? [
        ["Banco", juntar([data.banco_codigo, data.banco_nome], " · ")],
        ["Agência", data.agencia],
        ["Conta", data.conta],
        ["Tipo", data.tipo_conta],
        ["Titular", data.titular],
        ["PIX", data.pix],
      ]
    : [];
  const temAlgo = campos.some(([, v]) => v != null && v !== "");

  if (isLoading) return null;
  // Sem dado preenchido: ou a pessoa não informou, ou você não tem permissão
  // (a RLS some com a linha inteira). Não dá pra distinguir aqui — aviso único.
  if (!temAlgo) {
    return (
      <p className="flex items-center gap-1.5 border-t border-border/40 pt-3 text-[11px] text-muted-foreground/70">
        <Lock className="h-3 w-3" /> Sem dados bancários (não informados ou restritos a quem paga).
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
      <Grupo titulo="Dados bancários · confidencial" campos={campos} />
    </div>
  );
}

/* ----------------------------------------------------------- links de cadastro */

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
