import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Clapperboard, Search, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PessoaAvatar } from "@/components/PessoaAvatar";
import { primeiroNome } from "@/lib/pessoa";
import { iconeStatus, statusLabel, statusPill } from "@/lib/statusEntregavel";
import { hojeISO } from "@/lib/dataLocal";

/** Peça encerrada sai da ilha: o que está pronto não é decisão de hoje. */
const ENCERRADOS = ["entregue", "aprovado", "faturado"];

/**
 * Ilha de edição — tudo que está aberto, agrupado por cliente.
 *
 * Serve pra uma pergunta só, feita várias vezes por dia: "o que está na ilha
 * agora, de quem é, e o que está atrasado?". Por isso é lista e não board —
 * quem coordena precisa varrer trinta peças em segundos, e cartão obriga a
 * caçar.
 *
 * Agrupado por CLIENTE porque é assim que a cobrança chega: o cliente liga
 * perguntando das peças dele, não das peças de terça-feira.
 *
 * A ilha mostra o responsável DO ENTREGÁVEL — quem responde de ponta a ponta.
 * Quando a peça está numa etapa com outra pessoa, isso aparece do lado como
 * "com fulano", sem substituir o dono.
 */
export default function PosProducao() {
  const [busca, setBusca] = useState("");
  const hoje = hojeISO();

  const { data: pecas = [], isLoading } = useQuery({
    queryKey: ["ilha-edicao"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("id, codigo, titulo, status, etapa_atual, responsavel_id, etapa_responsavel_id, prazo_interno, prazo_interno_hora, data_entrega, project_id, solicitado_por")
        .not("status", "in", `(${ENCERRADOS.join(",")})`)
        .order("prazo_interno", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: projetos = [] } = useQuery({
    queryKey: ["ilha-projetos"],
    queryFn: async () =>
      (await (supabase as any).from("projects").select("id, numero, name, client_name")).data || [],
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["ilha-profiles"],
    queryFn: async () =>
      (await (supabase as any).from("profiles").select("id, full_name, avatar_url")).data || [],
  });

  const { data: etapas = [] } = useQuery({
    queryKey: ["ilha-etapas"],
    queryFn: async () =>
      (await (supabase as any).from("etapas_pos").select("slug, nome").order("ordem")).data || [],
  });

  const projPorId = useMemo(() => new Map(projetos.map((p: any) => [p.id, p])), [projetos]);
  const pessoaPorId = useMemo(() => new Map(profiles.map((p: any) => [p.id, p])), [profiles]);
  const etapaPorSlug = useMemo(() => new Map(etapas.map((e: any) => [e.slug, e.nome])), [etapas]);

  /** Cliente → peças, ordenado pelo prazo mais apertado de cada cliente. */
  const porCliente = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const m = new Map<string, any[]>();
    for (const p of pecas) {
      const proj = projPorId.get(p.project_id) as any;
      const cliente = proj?.client_name || "Sem cliente";
      const resp = pessoaPorId.get(p.responsavel_id) as any;
      const linha = {
        ...p,
        cliente,
        projeto: proj?.name || "",
        projetoNumero: proj?.numero,
        respNome: resp?.full_name,
        respFoto: resp?.avatar_url,
        etapaNome: p.etapa_atual ? etapaPorSlug.get(p.etapa_atual) : null,
        etapaComNome: (pessoaPorId.get(p.etapa_responsavel_id) as any)?.full_name,
        atrasada: !!p.prazo_interno && p.prazo_interno < hoje,
      };
      if (termo && ![linha.titulo, linha.codigo, cliente, linha.respNome, linha.projeto]
        .some((c) => (c || "").toLowerCase().includes(termo))) continue;
      if (!m.has(cliente)) m.set(cliente, []);
      m.get(cliente)!.push(linha);
    }
    return [...m.entries()].sort((a, b) => {
      const pa = a[1].find((x) => x.prazo_interno)?.prazo_interno || "9999";
      const pb = b[1].find((x) => x.prazo_interno)?.prazo_interno || "9999";
      return pa.localeCompare(pb);
    });
  }, [pecas, projPorId, pessoaPorId, etapaPorSlug, busca, hoje]);

  const total = porCliente.reduce((s, [, l]) => s + l.length, 0);
  const atrasadas = porCliente.reduce((s, [, l]) => s + l.filter((x: any) => x.atrasada).length, 0);

  const fmt = (iso?: string | null, hora?: string | null) =>
    iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}${hora ? ` · ${hora.slice(0, 5)}` : ""}` : "—";

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Clapperboard className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Ilha de edição</h1>
            <p className="text-sm text-muted-foreground">
              Tudo que está aberto, por cliente. {total} peça{total === 1 ? "" : "s"} na ilha
              {atrasadas > 0 && (
                <> · <span className="font-medium text-destructive">{atrasadas} com prazo vencido</span></>
              )}
            </p>
          </div>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="cliente, peça, código, responsável…"
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && total === 0 && (
        <Card className="glass-card">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {busca ? "Nada encontrado com esse termo." : "Nenhuma peça aberta na ilha."}
          </CardContent>
        </Card>
      )}

      {porCliente.map(([cliente, linhas]) => (
        <Card key={cliente} className="glass-card">
          <CardContent className="p-0">
            <div className="flex items-baseline justify-between gap-2 border-b border-border/50 px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">{cliente}</h2>
              <span className="text-xs text-muted-foreground">
                {linhas.length} peça{linhas.length === 1 ? "" : "s"}
                {linhas.some((l: any) => l.atrasada) && (
                  <span className="ml-2 text-destructive">
                    {linhas.filter((l: any) => l.atrasada).length} vencida(s)
                  </span>
                )}
              </span>
            </div>

            <div className="hidden grid-cols-[92px_1fr_150px_120px_130px] gap-3 border-b border-border/40 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid">
              <span>Código</span>
              <span>Peça</span>
              <span>Responsável</span>
              <span>Prazo interno</span>
              <span>Status</span>
            </div>

            {linhas.map((l: any) => {
              const Icone = iconeStatus(l.status);
              return (
                <Link
                  key={l.id}
                  to={`/projetos/${l.project_id}/entregaveis/${l.id}`}
                  className="grid grid-cols-1 gap-1 border-b border-border/30 px-5 py-2.5 transition-colors last:border-0 hover:bg-muted/20 sm:grid-cols-[92px_1fr_150px_120px_130px] sm:items-center sm:gap-3"
                >
                  <span className="font-mono text-[10px] text-primary">{l.codigo || "—"}</span>

                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{l.titulo}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {l.projetoNumero ? `${l.projetoNumero} · ` : ""}{l.projeto}
                      {l.solicitado_por && ` · pedido por ${l.solicitado_por}`}
                    </span>
                  </span>

                  <span className="flex items-center gap-1.5">
                    <PessoaAvatar nome={l.respNome} foto={l.respFoto} seed={l.responsavel_id} tamanho={22} />
                    <span className="truncate text-xs text-foreground">
                      {primeiroNome(l.respNome, "sem dono")}
                    </span>
                  </span>

                  <span className={`text-xs tabular-nums ${l.atrasada ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                    {fmt(l.prazo_interno, l.prazo_interno_hora)}
                    {l.atrasada && <span className="ml-1 text-[10px]">vencido</span>}
                  </span>

                  <span className="flex flex-wrap items-center gap-1">
                    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ${statusPill(l.status)}`}>
                      <Icone className="h-3 w-3" /> {statusLabel(l.status)}
                    </span>
                    {/* Etapa só aparece quando a peça foi separada em etapas —
                        e quem está com ela nunca substitui o responsável. */}
                    {l.etapaNome && (
                      <span className="text-[10px] text-muted-foreground">
                        {l.etapaNome}
                        {l.etapaComNome && ` · com ${primeiroNome(l.etapaComNome)}`}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {atrasadas > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          Prazo vencido é o <b>interno</b>, não o do cliente — é o colchão de revisão que se perde primeiro.
        </p>
      )}
    </div>
  );
}
