import { useMemo, useState, useEffect, useRef } from "react";
import { TextoComLinks } from "@/lib/autolink";
import { useVoltar } from "@/hooks/useVoltar";
import { EtapasPos } from "@/components/entregavel/EtapasPos";
import { CobrancaEntregavel } from "@/components/entregavel/CobrancaEntregavel";
import { CriadoEmPeca } from "@/components/entregavel/CriadoEmPeca";
import { SolicitadoPor } from "@/components/entregavel/SolicitadoPor";
import { FaixaStatus } from "@/components/entregavel/FaixaStatus";
import { VisualizarAnexo, podeVerAqui } from "@/components/entregavel/VisualizarAnexo";
import { primeiroNome } from "@/lib/pessoa";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BALDES, balde, rotuloBalde, foraDoFechamento } from "@/lib/faturamentoBalde";
import { useAuth } from "@/contexts/AuthContext";
import { useTimer, formatElapsed } from "@/contexts/TimerContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useFormAutosave, vaziosParaNull } from "@/hooks/useFormAutosave";
import { IndicadorAutosave } from "@/components/autosave/AutosaveContext";
import { SeletorPrazo } from "@/components/prazo/SeletorPrazo";
import { useConfirm, usePrompt } from "@/components/ui/confirm";
import * as Fluxo from "@/lib/fluxoEntregavel";
import {
  STATUS_ENTREGAVEL, statusBorda, statusLabel,
} from "@/lib/statusEntregavel";
import {
  ArrowLeft, Loader2, ExternalLink, Film, CheckCircle2,
  Play, Pause, Plus, Trash2, MessageSquarePlus, ThumbsUp, RefreshCw, Clock, Scissors, UserCheck,
  PanelRightClose, MessageSquare, Copy, Wrench, Upload, FileText, Paperclip, Pencil,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDuracaoMin, fmtDuracao, ETAPAS_TRABALHO } from "@/lib/duracao";
import { nomeDaVinci, nomeProjetoPadrao } from "@/lib/nomeCru";
import { toast } from "sonner";
import { ComentariosSection } from "./ProjetoDetalhe";

/**
 * Detalhe do entregável — Onda 6A.
 * Unidade de produção: timesheet próprio, alterações do cliente (rastreáveis),
 * aprovação em 2 níveis (config global + override por projeto) e card de
 * análise de horas (edição pura × alteração do cliente).
 */

function nomeDe(profiles: any[], uid: string | null | undefined) {
  if (!uid) return "—";
  const p = profiles.find((x) => x.id === uid);
  return p?.full_name || p?.email || "—";
}

/**
 * O nome copiado agora sai CRU, no formato do banco.
 *
 * Djêisson (11/08/2026): "quando a gente for copiar o nome pra usar no davinci
 * e em outros lugares, deixar sempre sem, cru mesmo... principalmente entre
 * mac e windows."
 *
 * Antes saía em blocos — "[ADVR-4036] [SPOT DE RADIO 01] [16X9] [V1]". Os
 * acentos já saíam, mas o colchete e o espaço ficavam, e são justamente os
 * dois que quebram caminho entre os dois sistemas. A composição é a MESMA
 * (código · nome · formato · versão): não se perde informação, só os
 * caracteres que davam problema.
 */

async function copiarTexto(texto: string, oque: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${oque} copiado`);
  } catch {
    toast.error("Não consegui copiar — copie manualmente.");
  }
}

export default function EntregavelDetalhe() {
  const { id: projectId, did } = useParams<{ id: string; did: string }>();
  const navigate = useNavigate();
  const voltar = useVoltar(`/projetos/${projectId}`);
  const qc = useQueryClient();
  const { user } = useAuth();
  // Recarrega as horas do entregável (lista do timesheet + os 4 cards no topo).
  // Uso refetchQueries em vez de invalidateQueries: o invalidate não estava
  // disparando o GET aqui (a query ficava marcada stale mas não refazia), então
  // o card seguia 0.0h até dar F5. refetch força o fetch e atualiza na hora.
  const recarregarHoras = () => qc.refetchQueries({ queryKey: ["entregavel-horas", did] });
  const { start } = useTimer();
  const { isAdmin, isCoordenadora, canSeeHours, canSeeMoney } = usePermissions();
  const confirmar = useConfirm();

  const { data: entregavel, isLoading, isError, error } = useQuery({
    queryKey: ["entregavel", did],
    enabled: !!did,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("*, project:projects(id, numero, name, client_name, aprovador_n1_id, aprovador_n2_id, cliente_aprova, client_id, criado_em, faturamento, budget:budgets(budget_number))")
        .eq("id", did!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  /**
   * Flag de capas do cliente. Vem de clientes_publico (view aberta) e não de
   * clients: a tabela só é legível pela gestão, e quem anexa capa é o editor.
   */
  const clientId = entregavel?.project?.client_id || null;
  const { data: usaCapas = false } = useQuery({
    queryKey: ["cliente-usa-capas", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("clientes_publico").select("usa_capas").eq("id", clientId).maybeSingle();
      return !!data?.usa_capas;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["entregavel-profiles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .neq("ativo", false)
        .order("full_name");
      if (error) throw error;
      return data as any[];
    },
  });

  // Nomes das etapas — a faixa do topo precisa deles pra dizer "faz o Color"
  // em vez de "edita" numa peça que está na bancada de outra pessoa.
  const { data: etapas = [] } = useQuery({
    queryKey: ["etapas-pos"],
    queryFn: async () =>
      (await (supabase as any).from("etapas_pos").select("slug, nome").order("ordem")).data || [],
    staleTime: 60 * 60 * 1000,
  });

  const { data: config } = useQuery({
    queryKey: ["approval-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("approval_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: alteracoes = [] } = useQuery({
    queryKey: ["entregavel-alteracoes", did],
    enabled: !!did,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverable_alteracoes")
        .select("*")
        .eq("deliverable_id", did!)
        .order("numero");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["entregavel-horas", did],
    enabled: !!did,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("time_entries")
        // Sem embed pessoa:profiles — não existe FK time_entries->profiles
        // (o user_id aponta pra auth.users), então o embed dava PGRST200 e a
        // query INTEIRA falhava com 400: os cards e a lista ficavam vazios
        // (0.0h) pra sempre. O nome sai do lookup local `nomeDe(profiles, ...)`.
        .select("id, user_id, duration_min, alteracao_id, start_at, description")
        .eq("deliverable_id", did!)
        .order("start_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const [form, setForm] = useState<any>(null);
  if (entregavel && (!form || form.__id !== entregavel.id)) {
    // Re-hidrata sempre que muda o entregável (corrige bug de form preso)
    setForm({
      __id: entregavel.id,
      titulo: entregavel.titulo || "",
      status: entregavel.status || "pendente",
      formato: entregavel.formato || "",
      duracao: entregavel.duracao || "",
      responsavel_id: entregavel.responsavel_id || "",
      aprovador_id: entregavel.aprovador_id || "",
      data_entrega: entregavel.data_entrega || "",
      data_entrega_hora: (entregavel.data_entrega_hora || "").slice(0, 5),
      solicitado_por: entregavel.solicitado_por || "",
      prazo_interno: entregavel.prazo_interno || "",
      prazo_interno_hora: (entregavel.prazo_interno_hora || "").slice(0, 5),
      arquivo_url: entregavel.arquivo_url || "",
      descricao: entregavel.descricao || "",
    });
  }

  // Salva sozinho ao digitar: manda só o campo mexido, ~0,8s depois da última tecla.
  // O `__id` é controle interno da tela e nunca vai pro banco.
  const auto = useFormAutosave<any>(async (patch) => {
    const { __id, ...campos } = patch;
    if (!Object.keys(campos).length) return;
    const { error } = await (supabase as any)
      .from("deliverables")
      .update(vaziosParaNull(campos, ["titulo"]))
      .eq("id", did);
    if (error) {
      toast.error("Não salvou", { description: error.message });
      throw error;
    }
    qc.invalidateQueries({ queryKey: ["entregavel", did] });
  });

  // Agregações de horas
  const horas = useMemo(() => {
    const total = entries.reduce((s, e) => s + e.duration_min, 0);
    const pura = entries.filter((e) => !e.alteracao_id).reduce((s, e) => s + e.duration_min, 0);
    const alt = total - pura;
    const porAlteracao: Record<string, number> = {};
    entries.forEach((e) => {
      if (e.alteracao_id) porAlteracao[e.alteracao_id] = (porAlteracao[e.alteracao_id] || 0) + e.duration_min;
    });
    return { total: total / 60, pura: pura / 60, alt: alt / 60, porAlteracao };
  }, [entries]);

  // Canal da peça como painel lateral recolhível (lembra a preferência).
  // IMPORTANTE: hooks ANTES dos early returns abaixo — senão o nº de hooks
  // varia entre renders (loading × carregado) e o React quebra (#310).
  const [chatAberto, setChatAberto] = useState(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem("adverse.canal") !== "0" : true,
  );
  useEffect(() => {
    localStorage.setItem("adverse.canal", chatAberto ? "1" : "0");
  }, [chatAberto]);

  // Erro na query (ex.: coluna/relação faltando, RLS, id inválido) → mostra o
  // motivo em vez de girar pra sempre.
  if (isError || (!isLoading && !entregavel)) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <button
          onClick={voltar}
          className="mb-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar
        </button>
        <Card className="glass-card border-destructive/30">
          <CardContent className="space-y-2 p-6 text-center">
            <p className="text-sm font-medium text-foreground">Não consegui abrir este entregável</p>
            <p className="text-xs text-muted-foreground">
              {(error as any)?.message || "Entregável não encontrado ou sem acesso."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !entregavel || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const proj = entregavel.project;
  const set = (patch: any) => {
    setForm({ ...form, ...patch });
    auto.agendar(patch);
  };
  // Escolha em Select é discreta — grava NA HORA. Sem isto, mudar status ou
  // responsável e dar F5 em menos de 0,8s (o debounce) perdia a alteração.
  const setJa = (patch: any) => {
    setForm({ ...form, ...patch });
    auto.agendar(patch);
    auto.gravarAgora();
  };

  // Config efetiva de aprovação (override por projeto > global)
  const n1 = proj?.aprovador_n1_id ?? config?.nivel1_user_id ?? null;
  const n2 = proj?.aprovador_n2_id ?? config?.nivel2_user_id ?? null;
  const clienteAprova = proj?.cliente_aprova ?? config?.cliente_aprova ?? true;

  // Papéis pra máquina de estados. A coordenadora revisa e envia por PAPEL —
  // é a função dela (revisar e mandar pro cliente), então não precisa estar
  // configurada como N1/N2 em cada projeto. Admin/manager faz tudo.
  const eu = user?.id;
  const podeRevisar = isAdmin || isCoordenadora;
  // Aprovar é ato PESSOAL: quando o nível tem dono, só o dono aprova. Admin
  // herdava o papel de todo mundo e via "Aprovar" numa revisão que era da
  // Maiara — aprovar no lugar dela esvazia a revisão dela. Quando o nível não
  // tem dono configurado, quem revisa por papel (admin/coordenadora) assume,
  // senão a peça trava sem ninguém pra destravar.
  // Quem precisa mesmo passar por cima usa o "Corrigir status", que é
  // declaradamente um atalho e fica registrado como tal.
  const isN1 = !!eu && (n1 ? eu === n1 : podeRevisar);
  const isN2 = !!eu && (n2 ? eu === n2 : podeRevisar);
  // Coordenação (mandar pro cliente, registrar retorno) continua por papel —
  // é função, não aprovação.
  const isRevisor = !!eu && (eu === n1 || eu === n2 || podeRevisar);
  const isEditor = !!eu && (entregavel.responsavel_id === eu || isAdmin);

  /**
   * Quem fez a peça não aprova a própria peça.
   *
   * O Djêisson viu "Revisão 2 · Djêisson Mauss" com o botão Aprovar numa peça
   * de que ele era o RESPONSÁVEL. Aprovar o próprio trabalho não é revisão —
   * é carimbo. E o valor da revisão é justamente o segundo par de olhos.
   *
   * Não é bloqueio absoluto: quem precisa mesmo passar por cima tem o
   * "Corrigir status", que é declaradamente um atalho e fica registrado. Aqui
   * só se tira o caminho fácil, e se diz por quê.
   */
  const souDono = !!eu && entregavel.responsavel_id === eu;
  const alteracaoAberta = (alteracoes as any[]).find((a: any) => a.status === "aberta") || null;

  return (
    <div className={`space-y-5 py-6 ${chatAberto ? "lg:pr-[440px]" : "mx-auto max-w-[1400px]"}`}>
      {/* Dois caminhos, e cada um faz o que promete: a SETA desfaz o último
          passo (quem veio das Entregas do mês volta pra lá), e o nome do
          projeto continua sendo o atalho pro projeto. */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <button onClick={voltar} className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar
        </button>
        <span className="text-muted-foreground/40">·</span>
        <button onClick={() => navigate(`/projetos/${projectId}`)} className="truncate hover:text-foreground">
          {proj?.name || "Projeto"}
        </button>
      </div>

      {/* Onde a peça está — primeira coisa da página, sozinha na faixa. O
          status vivia espremido entre botão verde, botão vermelho e selo de
          retrabalho; achar em que pé estava a peça dava trabalho. */}
      <FaixaStatus
        status={form.status}
        entregavel={entregavel}
        n1={n1}
        n2={n2}
        profiles={profiles}
        etapas={etapas}
      />

      {/* Header */}
      <Card className="glass-card">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Film className="h-3 w-3" /> Entregável
                </span>
                {entregavel.codigo && (
                  <span className="font-mono text-[10px] text-primary">{entregavel.codigo}</span>
                )}
                <IndicadorAutosave status={auto.status} />
                <button
                  onClick={() => copiarTexto(nomeDaVinci(entregavel.codigo, form.titulo, form.formato), "Nome DaVinci")}
                  title={`Copiar nome padrão: ${nomeDaVinci(entregavel.codigo, form.titulo, form.formato)}`}
                  className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Copy className="h-3 w-3" /> Nome DaVinci
                </button>
              </div>
              <Input
                value={form.titulo}
                onChange={(e) => set({ titulo: e.target.value })}
                className="border-transparent bg-transparent px-0 text-2xl font-semibold tracking-tight hover:border-border focus:border-border"
              />
            </div>
            {/* O status NÃO é mais escolhido à mão aqui — quem muda é o fluxo
                (botões logo abaixo). O selo do status fica no topo à esquerda. */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                title="Excluir entregável"
                onClick={async () => {
                  if (!(await confirmar({
                    title: "Excluir entregável?",
                    description: "Remove o timesheet e as alterações ligadas a ele. Não dá pra desfazer.",
                    confirmText: "Excluir", destructive: true,
                  }))) return;
                  const { error } = await (supabase as any).from("deliverables").delete().eq("id", did);
                  if (error) return toast.error("Não excluiu", { description: error.message });
                  toast.success("Entregável excluído");
                  navigate(`/projetos/${projectId}`);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* DENSIDADE, no formato do ClickUp: rótulo à esquerda, valor à
              direita, uma linha por campo, duas colunas quando cabe. Os
              cartões de grupo empilhavam altura — cada um gastava borda,
              padding e um título — e o Djêisson tem razão: dá pra mostrar a
              mesma coisa em metade da tela sem virar amontoado. O agrupamento
              não some, vira separador: as linhas continuam na ordem "de quem
              é → com quem → quando → onde está". */}
          <div className="grid gap-x-10 gap-y-0.5 text-sm sm:grid-cols-2">
            {proj?.client_name && (
              <L label="Cliente">
                <span className="block truncate text-foreground" title={proj.client_name}>{proj.client_name}</span>
              </L>
            )}
            <L label="Projeto">
              <div className="flex min-w-0 items-center gap-1.5">
                <Link to={`/projetos/${projectId}`} className="min-w-0 truncate text-primary hover:underline">
                  {proj?.numero} · {proj?.name}
                </Link>
                <button
                  onClick={() => copiarTexto(nomeProjetoPadrao(proj?.numero, proj?.name), "Nome do projeto")}
                  title={`Copiar: ${nomeProjetoPadrao(proj?.numero, proj?.name)}`}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </L>

            <L label="Responsável">
              <Select value={form.responsavel_id || "__none__"} onValueChange={(v) => setJa({ responsavel_id: v === "__none__" ? "" : v })}>
                <SelectTrigger className="h-7 border-0 bg-transparent px-0 text-sm hover:bg-muted/40 focus:ring-0"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— sem responsável —</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{primeiroNome(p.full_name || p.email)}</SelectItem>)}
                </SelectContent>
              </Select>
            </L>
            {/* Quem pediu. Vem preenchido quando a peça nasceu de uma demanda
                do formulário; digitado à mão quando o pedido chegou por
                WhatsApp — que é a maioria, e é a primeira pergunta quando uma
                entrega é questionada no fechamento. */}
            <L label="Solicitado por">
              <SolicitadoPor
                clientId={proj?.client_id}
                valor={form.solicitado_por}
                onChange={(v) => setJa({ solicitado_por: v })}
              />
            </L>

            <L label="Formato">
              <Input value={form.formato} onChange={(e) => set({ formato: e.target.value })} placeholder="16x9"
                className="h-7 border-0 bg-transparent px-0 hover:bg-muted/40 focus-visible:ring-0" />
            </L>
            <L label="Duração">
              <Input value={form.duracao} onChange={(e) => set({ duracao: e.target.value })} placeholder='30"'
                className="h-7 border-0 bg-transparent px-0 hover:bg-muted/40 focus-visible:ring-0" />
            </L>

            <L label="Prazo interno">
              <SeletorPrazo
                data={form.prazo_interno}
                hora={form.prazo_interno_hora}
                onChange={(v) => setJa({ prazo_interno: v.data, prazo_interno_hora: v.hora || null })}
              />
            </L>
            <L label="Prazo do cliente">
              <SeletorPrazo
                data={form.data_entrega}
                hora={form.data_entrega_hora}
                onChange={(v) => setJa({ data_entrega: v.data, data_entrega_hora: v.hora || null })}
              />
            </L>

            <L label="Criado em">
              <CriadoEmPeca
                deliverableId={did!}
                criadoEm={entregavel?.criado_em}
                createdAt={entregavel?.created_at}
                // Piso: a peça anda pra frente do job, nunca pra trás dele.
                pisoProjeto={entregavel?.project?.criado_em}
                podeEditar={podeRevisar}
                onChanged={() => qc.invalidateQueries({ queryKey: ["entregavel", did] })}
                discreto
              />
            </L>
            {/* Só pra quem vê dinheiro. Um editor não decide nota de cliente
                e não precisa saber que existe uma — a regra de sempre. */}
            {canSeeMoney && (
              <L label="Faturamento">
                <FaturamentoPeca
                  did={did!}
                  valor={entregavel.faturamento || null}
                  doProjeto={proj?.faturamento || "mensal"}
                  onChanged={() => qc.invalidateQueries({ queryKey: ["entregavel", did] })}
                />
              </L>
            )}

            {/* O link ocupa as duas colunas: é o botão mais clicado da tela. */}
            <div className="mt-2 sm:col-span-2">
              <LinkDoArquivo valor={form.arquivo_url} onChange={(v) => setJa({ arquivo_url: v })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alterações do cliente logo depois do cabeçalho, antes do fluxo: é o
          que muda o rumo do entregável e onde as horas de alteração são
          apontadas — tem que estar na cara. */}
      <AlteracoesSection
        did={did!}
        projectId={projectId!}
        projectName={proj?.name || ""}
        alteracoes={alteracoes}
        podeHoras={canSeeHours}
        horasPorAlteracao={horas.porAlteracao}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ["entregavel-alteracoes", did] });
          qc.invalidateQueries({ queryKey: ["entregavel", did] });
          recarregarHoras();
        }}
      />

      {/* Fluxo do entregável — os BOTÕES que tocam o processo (editar,
          enviar pra revisão, aprovar, enviar ao cliente). Logo no topo
          porque é a ação principal da tela. */}
      <FluxoCard
        entregavel={entregavel}
        did={did!}
        projectId={projectId!}
        projName={proj?.name || ""}
        n1={n1}
        n2={n2}
        clienteAprova={clienteAprova}
        profiles={profiles}
        isEditor={isEditor}
        isN1={isN1}
        isN2={isN2}
        isRevisor={isRevisor}
        souDono={souDono}
        podeForcar={podeRevisar}
        canSeeMoney={canSeeMoney}
        clientId={proj?.client_id}
        horasMin={Math.round((horas.pura + horas.alt) * 60)}
        alteracaoAberta={alteracaoAberta}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ["entregavel", did] });
          qc.invalidateQueries({ queryKey: ["entregavel-alteracoes", did] });
          recarregarHoras();
        }}
      />

      {/* Horas logo abaixo dos botões: é o que mais se mexe na peça, e estava
          no fim da página — quem ia apontar hora rolava a tela inteira. */}
      {canSeeHours && (
        <TimesheetEntregavel
          did={did!}
          projectId={projectId!}
          entries={entries}
          profiles={profiles}
          horasTotal={horas.total}
          temAlteracaoAberta={!!alteracaoAberta}
          alteracoes={alteracoes}
          onChanged={recarregarHoras}
        />
      )}

      {/* Briefing logo no topo, depois do cabeçalho: é o direcionamento da
          peça — quem abre o entregável quer isso primeiro, não no fim. */}
      <Card className="glass-card">
        <CardContent className="space-y-2 p-6">
          <div className="flex items-center justify-between">
            <Label>Briefing / observações deste entregável</Label>
            <IndicadorAutosave status={auto.status} />
          </div>
          <BriefingComVerMais valor={form.descricao} onChange={(v) => set({ descricao: v })} />
        </CardContent>
      </Card>

      {/* Indicadores. Revisões e alterações ficam pra todo mundo (a
          coordenadora acompanha quantos ajustes rolaram); as horas só pra quem
          pode ver tempo. */}
      <div className={`grid gap-4 ${canSeeHours ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
        <IndicadorCard label="Revisões internas" value={String(entregavel.revisoes_internas || 0)} icon={RefreshCw} hint="R1/R2 pediram ajuste" />
        <IndicadorCard label="Alterações do cliente" value={String(alteracoes.length)} icon={MessageSquarePlus} hint={`${alteracoes.filter((a) => a.status === "aberta").length} abertas`} tone="destructive" />
        {canSeeHours && (
          <>
            <IndicadorCard label="Horas — edição pura" value={`${horas.pura.toFixed(1)}h`} icon={Scissors} />
            <IndicadorCard label="Horas — alteração cliente" value={`${horas.alt.toFixed(1)}h`} icon={MessageSquarePlus} tone="warning" />
          </>
        )}
      </div>

      {/* Estimativa × realizado. A estimativa é o que reserva o tempo da
          pessoa; o realizado ao lado é o que mostra o quanto a gente erra —
          e é esse histórico que vai permitir corrigir a estimativa depois. */}
      {canSeeHours && (
        <EstimativaEntregavel
          id={entregavel.id}
          estimadas={entregavel.horas_estimadas}
          realizadas={horas.pura + horas.alt}
          onSalvo={() => qc.invalidateQueries({ queryKey: ["entregavel", did] })}
        />
      )}


      <div>
        <div className="min-w-0 space-y-5">
          {/* Links: roteiro, referências, PDF do cliente. Aberto a todo mundo
              que abre o entregável — a coordenadora precisa do roteiro à mão. */}
          <DocumentosEntregavel did={did!} projectId={projectId!} />

          {/* Capas: só aparece pro cliente configurado (clients.usa_capas). É
              a mesma máquina de anexos com outra categoria — o que muda é o
              papel do arquivo, não o jeito de guardar. */}
          {usaCapas && (
            <AnexosEntregavel
              did={did!}
              projectId={projectId!}
              categoria="capa"
              titulo="Capas"
              subtitulo="Imagem de capa da peça — JPG, PNG ou WebP"
              accept="image/*"
            />
          )}

          {/* Anexos de mídia: fotos e vídeos subidos de verdade pro Storage. */}
          <AnexosEntregavel did={did!} projectId={projectId!} />

        </div>

      </div>

      {/* Canal da peça — painel fixo ocupando a lateral inteira da tela, recolhível */}
      {chatAberto && (
        <aside className="fixed right-0 top-14 bottom-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-2xl lg:w-[440px]">
          <div className="flex items-start justify-between gap-2 border-b border-border/60 p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Canal da peça</p>
              <p className="text-[10px] text-muted-foreground">Conversa operacional só deste entregável. Use @nome pra mencionar.</p>
            </div>
            <button
              onClick={() => setChatAberto(false)}
              title="Recolher a conversa"
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 p-4">
            <ComentariosSection entityType="deliverable" entityId={did!} profiles={profiles} fill vazio="Sem mensagens ainda. A conversa do entregável começa aqui." />
          </div>
        </aside>
      )}

      {/* Aba pra reabrir quando recolhido */}
      {!chatAberto && (
        <button
          onClick={() => setChatAberto(true)}
          className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-1.5 rounded-l-lg bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg hover:brightness-110"
        >
          <MessageSquare className="h-4 w-4" /> Conversa
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------ Aprovação em 2 níveis */

function FluxoCard({
  entregavel, did, projectId, projName, n1, n2, clienteAprova, profiles,
  isEditor, isN1, isN2, isRevisor, souDono, podeForcar, alteracaoAberta, onChanged,
  canSeeMoney, clientId, horasMin,
}: {
  entregavel: any; did: string; projectId: string; projName: string;
  n1: string | null; n2: string | null; clienteAprova: boolean; profiles: any[];
  isEditor: boolean; isN1: boolean; isN2: boolean; isRevisor: boolean;
  /** Quem fez a peça não aprova a própria peça. */
  souDono: boolean;
  podeForcar: boolean; alteracaoAberta: any; onChanged: () => void;
  canSeeMoney: boolean; clientId?: string | null; horasMin: number;
}) {
  const { user } = useAuth();
  const { start, stop, sessao } = useTimer();
  const confirmar = useConfirm();
  const perguntar = usePrompt();
  const status = entregavel.status || "pendente";
  const rodandoAqui = sessao?.deliverable_id === did;

  const upd = async (patch: any, msg?: string) => {
    const { error } = await (supabase as any).from("deliverables").update(patch).eq("id", did);
    if (error) return toast.error("Erro", { description: error.message });
    onChanged();
    if (msg) toast.success(msg);
  };

  // Toda transição do fluxo passa pela fonte única (lib/fluxoEntregavel) — aqui e
  // na Minha mesa é o MESMO código, pra não divergir. `run` só embrulha com
  // refresh + toast + tratamento de erro.
  const run = async (fn: () => Promise<string>) => {
    try {
      const msg = await fn();
      onChanged();
      if (msg) toast.success(msg);
    } catch (e: any) {
      toast.error("Erro", { description: e.message });
    }
  };

  // Ajuste INTERNO (N1/N2 → editor) não pede pop-up de motivo: o revisor
  // conversa pelo canal da peça se quiser detalhar. Um clique manda de volta
  // pro editor. (Antes abria um window.prompt feio a cada ajuste.)
  const pedirAjusteInterno = () => run(() => Fluxo.pedirAjuste(entregavel, user?.id, ""));

  // OVERRIDE de STATUS — só admin/coordenadora. É um atalho de CORREÇÃO (pula
  // o fluxo), pra destravar peça que ficou no status errado. O time normal
  // segue pelos botões; aqui é a exceção controlada.
  const forcarEtapa = async (novo: string) => {
    if (novo === status) return;
    const alvo = statusLabel(novo);
    if (!(await confirmar({
      title: `Corrigir status para "${alvo}"?`,
      description: "Isso pula o fluxo normal — use só pra destravar uma peça que ficou no status errado.",
      confirmText: "Forçar etapa",
    }))) return;
    if (rodandoAqui && novo !== "em_edicao") await stop();   // não deixa o cronômetro solto
    await upd({ status: novo }, `Status corrigido para "${alvo}"`);
  };

  // ---- EDITOR: um botão que faz status + timesheet ----
  const editar = async () => {
    if (!rodandoAqui) {
      // Com alteração do cliente aberta, cronometra nela (conta como hora de alteração).
      if (alteracaoAberta) start({ project_id: projectId, project_name: projName, deliverable_id: did, alteracao_id: alteracaoAberta.id });
      else start({ project_id: projectId, project_name: projName, deliverable_id: did });
    }
    if (status !== "em_edicao") await upd({ status: "em_edicao" });
  };
  const pausar = async () => {
    if (rodandoAqui) await stop();          // para o timesheet
    await upd({ status: "em_pausa" }, "Edição pausada");
  };
  const enviarRevisao = async () => {
    if (rodandoAqui) await stop();          // para o timesheet
    await run(() => Fluxo.enviarParaRevisao(entregavel, alteracaoAberta?.id));
  };

  // ---- APROVAÇÃO 1 (1ª vez): sempre segue pra Ap.2, com ou sem ajuste ----
  const n1AprovaSegue = () => run(() => Fluxo.aprovarEtapa(entregavel, user?.id));
  const n1AjusteSegue = pedirAjusteInterno;

  // ---- APROVAÇÃO 2: aprovarEtapa fecha a 1ª volta (respeita ajuste acumulado);
  //      pedirAjuste força a volta pro editor. ----
  const n2Aprova = () => run(() => Fluxo.aprovarEtapa(entregavel, user?.id));
  const n2Ajuste = pedirAjusteInterno;

  // ---- REVISÃO ÚNICA (retrabalho, só N1) ----
  const revUnicaAprova = () => run(() => Fluxo.aprovarEtapa(entregavel, user?.id));
  const revUnicaAjuste = pedirAjusteInterno;
  const revUnicaEscala = () => run(() => Fluxo.escalarAprovacao2(entregavel));

  // ---- ENVIO E CLIENTE ----
  const enviarCliente = () => run(() => Fluxo.enviarAoCliente(entregavel));
  const clienteAprovou = () => run(() => Fluxo.clienteAprovou(entregavel));
  // Alteração do cliente PEDE o resumo (bonito, não window.prompt) — aqui a
  // mensagem importa: é o que o cliente pediu de fato, e vira o item que
  // rastreia horas de alteração.
  const alteracaoCliente = async () => {
    const titulo = await perguntar({
      title: "Alteração do cliente",
      description: "Resumo do que o cliente pediu — o editor recebe e passa a rastrear como hora de alteração.",
      placeholder: "Ex.: Trocar a trilha, cortar a cena 3, ajustar o GC do João…",
      confirmText: "Registrar alteração",
    });
    if (!titulo || !titulo.trim()) return;
    await run(() => Fluxo.registrarAlteracaoCliente(entregavel, titulo));
  };

  /**
   * A PALETA DIZ O QUE O BOTÃO FAZ. Antes tudo era laranja: "Editar",
   * "Enviar para revisão" e "Enviar ao cliente" tinham a mesma cara, e são
   * três coisas de consequência bem diferente — a última manda o vídeo pra
   * fora da casa. Uma cor por família:
   *
   *   laranja (primary)  trabalhar nisso agora — Editar, Retomar
   *   azul               entregar adiante, internamente — Enviar pra revisão
   *   verde              aprovar / confirmar — Aprovar, Cliente aprovou
   *   roxo               sai da Adverse — Enviar ao cliente
   *   vermelho (outline) devolve pra trás — Pedir ajuste, Alteração
   *
   * Cinza/ghost é o que existe mas raramente se usa (escalar pra R2).
   */
  const botoes: React.ReactNode[] = [];
  const B = (key: string, node: React.ReactNode) => botoes.push(<span key={key}>{node}</span>);
  const editorTrabalha = ["pendente", "em_pausa", "ajuste_interno", "ajuste_solicitado", "em_edicao"].includes(status);
  // Encerrado: o trabalho acabou. Nada de mover etapa nem apontar hora nova.
  const encerrado = ["entregue", "aprovado", "faturado"].includes(status);

  // EDITOR: botão único Editar⇄Parar + Enviar para revisão
  if (editorTrabalha && isEditor) {
    if (status === "em_edicao" && rodandoAqui) {
      B("par", <Button size="sm" variant="outline" onClick={pausar}><Pause className="mr-1 h-3.5 w-3.5" /> Parar edição</Button>);
    } else {
      B("edt", <Button size="sm" onClick={editar} className="bg-primary text-primary-foreground hover:bg-primary/90"><Play className="mr-1 h-3.5 w-3.5" /> {status === "em_edicao" ? "Retomar edição" : "Editar"}</Button>);
    }
    if (status === "em_edicao" || status === "em_pausa") {
      B("env", <Button size="sm" onClick={enviarRevisao} className="bg-sky-600 text-white hover:bg-sky-600/90"><ThumbsUp className="mr-1 h-3.5 w-3.5" /> Enviar para revisão</Button>);
    }
  }

  // REVISÃO 1 (1ª vez)
  if (status === "revisao_n1" && isN1 && !souDono) {
    B("n1a", <Button size="sm" onClick={n1AprovaSegue} className="bg-success text-white hover:bg-success/90"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aprovar → Revisão 2</Button>);
    B("n1j", <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={n1AjusteSegue}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Pedir ajuste → Revisão 2</Button>);
  }
  // REVISÃO 2
  if (status === "revisao_n2" && isN2 && !souDono) {
    B("n2a", <Button size="sm" onClick={n2Aprova} className="bg-success text-white hover:bg-success/90"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aprovar</Button>);
    B("n2j", <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={n2Ajuste}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Pedir ajuste</Button>);
  }
  // REVISÃO ÚNICA (retrabalho, só N1) — com escalar pra N2 opcional
  if (status === "revisao" && isN1 && !souDono) {
    B("rua", <Button size="sm" onClick={revUnicaAprova} className="bg-success text-white hover:bg-success/90"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aprovar</Button>);
    B("ruj", <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={revUnicaAjuste}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Pedir ajuste</Button>);
    B("rue", <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={revUnicaEscala} title="Opcional: mandar pra uma segunda revisão"><UserCheck className="mr-1 h-3.5 w-3.5" /> Pedir Revisão 2</Button>);
  }
  // ENVIAR AO CLIENTE
  if (status === "pronto" && isRevisor) {
    B("env", <Button size="sm" onClick={enviarCliente} className="bg-violet-600 text-white hover:bg-violet-600/90"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Enviar para aprovação do cliente</Button>);
  }
  // COM O CLIENTE — coordenação registra alteração ou aprovação
  if (status === "com_cliente" && isRevisor) {
    B("apr", <Button size="sm" onClick={clienteAprovou} className="bg-success text-white hover:bg-success/90"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Cliente aprovou</Button>);
    B("alt", <Button size="sm" variant="outline" className="text-warning hover:text-warning" onClick={alteracaoCliente}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" /> Alteração do cliente</Button>);
  }

  return (
    <Card className={`glass-card border-l-4 ${statusBorda(status)}`}>
      <CardContent className="space-y-3 p-5">
        {/* O status saiu daqui: agora mora na faixa do topo da página, sozinho.
            Este card responde outra pergunta — "o que eu faço agora" — e é o
            que os botões são. O que fica é a TRILHA de aprovação, que é
            histórico (quem já carimbou), não etapa atual. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            O que fazer agora
          </span>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Nivel ok={!!entregavel.aprovado_n1_em} pediuAjuste={!!entregavel.rev_n1_ajuste} label="R1" quem={nomeDe(profiles, entregavel.aprovado_n1_por)} />
            <Nivel ok={!!entregavel.aprovado_n2_em} pediuAjuste={!!entregavel.rev_n2_ajuste} label="R2" quem={nomeDe(profiles, entregavel.aprovado_n2_por)} />
            {clienteAprova && <Nivel ok={!!entregavel.aprovado_cliente_em} label="Cliente" quem={entregavel.aprovado_cliente_por || "—"} />}
          </div>
        </div>

        {botoes.length > 0 ? (
          <div className="flex flex-wrap gap-2">{botoes}</div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {/* Sem esta linha, quem fez a peça vê a revisão parada e nenhum
                botão, sem entender que a bola está com outra pessoa. */}
            {souDono && ["revisao_n1", "revisao_n2", "revisao"].includes(status)
              ? `Você é o responsável por esta peça — a aprovação é de ${
                  nomeDe(profiles, status === "revisao_n2" ? n2 : n1) || "outra pessoa"
                }. Quem faz não aprova o próprio trabalho; se precisar destravar, use “Corrigir status”.`
              : ["entregue", "aprovado"].includes(status) ? "Entregue ✓ — nada a fazer aqui."
              : status === "com_cliente" ? "Está com o cliente — fora do seu controle por enquanto."
              // Sem responsável, os botões de edição não aparecem pra ninguém —
              // avisa pra definir um (o campo Responsável, acima).
              : !entregavel.responsavel_id && ["em_edicao", "em_pausa", "pendente", "ajuste_interno", "ajuste_solicitado"].includes(status)
                ? "Defina o responsável (campo acima) para o fluxo começar."
              : status === "revisao_n1" ? `Revisão 1 é com ${nomeDe(profiles, n1) || "o revisor"} — só quem revisa aprova esta etapa.`
              : status === "revisao_n2" ? `Revisão 2 é com ${nomeDe(profiles, n2) || "o revisor"} — só quem revisa aprova esta etapa.`
              : status.startsWith("revisao") ? "Aguardando o revisor deste entregável."
              : ["em_edicao", "em_pausa", "pendente", "ajuste_interno", "ajuste_solicitado"].includes(status) ? "Aguardando o editor (responsável)."
              : status === "pronto" ? "Aguardando alguém enviar ao cliente."
              : "Sem ação sua nesta etapa."}
          </p>
        )}

        {/* Etapa de pós na MESMA caixa do status: dois lugares dizendo onde a
            peça está viravam dois campos pra manter. Aqui é uma linha só.

            Peça encerrada não move mais: os botões saem e sobra o histórico
            (a etapa em que parou e por quem passou). O único controle que
            continua é o "corrigir status", que existe justamente pra
            destravar quem foi encerrado por engano. */}
        <EtapasPos did={did} podeMover={!encerrado && (isRevisor || isEditor)} status={status} />

        {/* Como a peça é cobrada. Só pra quem vê dinheiro — o editor não tem
            que pensar em preço enquanto edita, e continua sem ver nada. */}
        {canSeeMoney && (
          <CobrancaEntregavel
            did={did}
            clientId={clientId}
            tipo={entregavel.tipo_cobranca}
            percent={entregavel.cobranca_percent}
            horasMin={horasMin}
            onChanged={onChanged}
          />
        )}

        {/* Override de STATUS — só admin/coordenadora. Correção manual pra
            destravar peça travada; o resto do time segue pelos botões.
            Chamava-se "corrigir etapa" e colidia com a etapa de pós logo
            acima — dois nomes iguais pra coisas diferentes. */}
        {podeForcar && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Wrench className="h-3 w-3" /> Corrigir status (admin/coord.)
            </span>
            <Select value={status} onValueChange={forcarEtapa}>
              <SelectTrigger className="h-7 w-[190px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_ENTREGAVEL.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[10px] text-muted-foreground/70">pula o fluxo — use só pra destravar</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Três estados por nível de revisão:
//   pediuAjuste → âmbar "pediu ajuste" (agiu, mas mandou de volta)
//   ok          → verde, aprovou
//   pendente    → cinza, ainda não olhou
// pediuAjuste vence o ok: o fluxo grava aprovado_nX_em nos dois casos, então
// sem essa precedência quem pediu ajuste apareceria como aprovado.
function Nivel({ ok, pediuAjuste = false, label, quem }: { ok: boolean; pediuAjuste?: boolean; label: string; quem: string }) {
  const cor = pediuAjuste ? "bg-warning/15 text-warning" : ok ? "bg-success/15 text-success" : "bg-muted/50 text-muted-foreground";
  const Icon = pediuAjuste ? RefreshCw : ok ? CheckCircle2 : Clock;
  return (
    <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 ${cor}`}>
      <Icon className="h-3 w-3" />
      {label}
      {pediuAjuste ? <span className="opacity-80">· pediu ajuste{quem !== "—" ? ` (${quem})` : ""}</span> : ok && <span className="opacity-70">· {quem}</span>}
    </span>
  );
}

/* ------------------------------------------------ Timesheet do entregável */

const TIPO_DOC = [
  { id: "roteiro", label: "Roteiro", cor: "bg-primary/15 text-primary" },
  { id: "referencia", label: "Referência", cor: "bg-blue-500/15 text-blue-500 light:text-blue-700" },
  { id: "briefing", label: "Briefing", cor: "bg-amber-500/15 text-amber-500 light:text-amber-700" },
  { id: "outro", label: "Outro", cor: "bg-muted text-muted-foreground" },
];

/**
 * Documentos presos ao entregável: roteiro, referências, PDF do cliente.
 * Reusa project_documents com deliverable_id preenchido — o roteiro fica junto
 * da peça, não perdido nos documentos do projeto inteiro.
 */
function DocumentosEntregavel({ did, projectId }: { did: string; projectId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [novo, setNovo] = useState({ titulo: "", url: "", tipo: "roteiro" });
  const [verDoc, setVerDoc] = useState<{ nome: string; url: string } | null>(null);

  const { data: docs = [] } = useQuery({
    queryKey: ["deliverable-documents", did],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_documents")
        .select("*")
        // Traz os documentos DESTA peça e também os do PROJETO sem peça
        // definida (o anexo que o cliente mandou junto da demanda, por
        // exemplo). Antes só olhava deliverable_id: o briefing do cliente
        // existia no projeto e a pessoa aqui não via nada.
        .or(`deliverable_id.eq.${did},and(project_id.eq.${projectId},deliverable_id.is.null)`)
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!novo.titulo.trim() || !novo.url.trim()) throw new Error("Informe título e link");
      const url = novo.url.startsWith("http") ? novo.url : `https://${novo.url}`;
      const { error } = await (supabase as any).from("project_documents").insert({
        project_id: projectId,
        deliverable_id: did,
        titulo: novo.titulo.trim(),
        url,
        tipo: novo.tipo,
        created_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovo({ titulo: "", url: "", tipo: "roteiro" });
      qc.invalidateQueries({ queryKey: ["deliverable-documents", did] });
      toast.success("Documento anexado");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("project_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliverable-documents", did] }),
  });

  const tipoDe = (t: string) => TIPO_DOC.find((x) => x.id === t) || TIPO_DOC[3];

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-6">
        <div>
          <p className="text-sm font-semibold text-foreground">Roteiro & documentos</p>
          <p className="text-xs text-muted-foreground">
            Roteiro, referências ou PDF do cliente — anexados a este entregável
          </p>
        </div>

        {/* BLOCOS, não linhas. Uma linha por documento gastava a largura toda
            pra mostrar a URL — que ninguém lê — e escondia o que importa (o
            que é aquilo). Em cartão, o tipo e o título ficam grandes, a URL
            vira legenda, e o cartão inteiro é a área de clique.

            Clicar ABRE AQUI DENTRO quando dá (PDF, imagem, vídeo). Link do
            Docs/Drive o navegador não deixa embutir — nesses o visualizador
            mostra o arquivo e leva pra fora, em vez de abrir um quadro
            branco. */}
        {docs.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((d) => {
              const t = tipoDe(d.tipo);
              return (
                <div key={d.id} className="group relative rounded-lg border border-border/50 bg-muted/10 p-3 transition-colors hover:border-primary/40">
                  <button onClick={() => setVerDoc({ nome: d.titulo, url: d.url })} className="block w-full text-left">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${t.cor}`}>{t.label}</span>
                    <p className="mt-1.5 line-clamp-2 break-words text-sm font-medium leading-tight text-foreground" title={d.titulo}>
                      {d.titulo}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-muted-foreground" title={d.url}>
                      {d.url.replace(/^https?:\/\//, "")}
                    </p>
                  </button>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <a href={d.url} target="_blank" rel="noreferrer" className="hover:text-primary" title="Abrir em nova aba">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button onClick={() => excluir.mutate(d.id)} className="ml-auto opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" title="Remover">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {docs.length === 0 && (
          <p className="py-1 text-xs text-muted-foreground">Nenhum documento anexado ainda.</p>
        )}

        <VisualizarAnexo anexo={verDoc} onClose={() => setVerDoc(null)} />

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border/60 p-3">
          <Select value={novo.tipo} onValueChange={(v) => setNovo({ ...novo, tipo: v })}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPO_DOC.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={novo.titulo} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} placeholder="Título (ex.: Roteiro v2)" className="h-8 w-44" />
          <Input value={novo.url} onChange={(e) => setNovo({ ...novo, url: e.target.value })} placeholder="Link (Docs, Drive, Frame…)" className="h-8 flex-1" />
          <Button size="sm" onClick={() => criar.mutate()} disabled={criar.isPending}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Anexar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Anexos de MÍDIA do entregável: fotos e vídeos subidos de verdade pro Storage
 * (bucket "entregaveis"), com preview em grade. Diferente do card de links acima.
 * Arraste os arquivos pra cá ou use o botão. Vídeo muito grande → melhor link do
 * Frame.io (no card de cima).
 */
function AnexosEntregavel({
  did, projectId, categoria = "midia", titulo = "Anexos", accept,
  subtitulo = "Qualquer arquivo — fotos, vídeos, PDF, docs… (até 500 MB)",
}: {
  did: string; projectId: string; categoria?: string; titulo?: string;
  subtitulo?: string; accept?: string;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const confirmar = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [vendo, setVendo] = useState<any | null>(null);

  const { data: anexos = [] } = useQuery({
    queryKey: ["entregavel-anexos", did, categoria],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverable_anexos").select("*")
        .eq("deliverable_id", did).eq("categoria", categoria).order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  const enviarArquivos = async (files: FileList | null) => {
    const lista = files ? Array.from(files) : [];
    if (!lista.length) return;
    setEnviando(true);
    try {
      for (const file of lista) {
        // Capa é imagem. Barrar aqui evita um PDF virando "capa" e quebrando a
        // grade de miniaturas lá na frente.
        if (categoria === "capa" && !file.type.startsWith("image/")) {
          throw new Error(`"${file.name}" não é imagem — capa aceita só JPG, PNG ou WebP.`);
        }
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${did}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage.from("entregaveis")
          .upload(path, file, { cacheControl: "3600", contentType: file.type || undefined });
        if (upErr) throw new Error(`Falha ao subir "${file.name}": ${upErr.message}`);
        const { data: pub } = supabase.storage.from("entregaveis").getPublicUrl(path);
        const tipo = file.type.startsWith("image/") ? "foto" : file.type.startsWith("video/") ? "video" : "arquivo";
        const { error: insErr } = await (supabase as any).from("deliverable_anexos").insert({
          deliverable_id: did, project_id: projectId, nome: file.name, tipo, categoria,
          url: pub.publicUrl, storage_path: path, mime: file.type || null, tamanho: file.size,
          created_by: user?.id || null,
        });
        if (insErr) throw insErr;
      }
      qc.invalidateQueries({ queryKey: ["entregavel-anexos", did, categoria] });
      toast.success("Enviado");
    } catch (e: any) {
      toast.error("Erro no upload", { description: e.message });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const excluir = async (a: any) => {
    if (!(await confirmar({ title: `Remover "${a.nome}"?`, confirmText: "Remover", destructive: true }))) return;
    await supabase.storage.from("entregaveis").remove([a.storage_path]);
    const { error } = await (supabase as any).from("deliverable_anexos").delete().eq("id", a.id);
    if (error) return toast.error("Não removeu", { description: error.message });
    qc.invalidateQueries({ queryKey: ["entregavel-anexos", did, categoria] });
  };

  const fmtTam = (b?: number | null) =>
    !b ? "" : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const ext = (nome?: string) => {
    const m = (nome || "").match(/\.([a-z0-9]{1,6})$/i);
    return m ? m[1].toUpperCase() : "ARQUIVO";
  };

  return (
    <Card className="glass-card">
      <CardContent
        className="space-y-3 p-6"
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); enviarArquivos(e.dataTransfer.files); }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">{titulo}</p>
            <p className="text-xs text-muted-foreground">{subtitulo}</p>
          </div>
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={enviando}>
            {enviando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
            {enviando ? "Enviando…" : categoria === "capa" ? "Enviar capa" : "Enviar arquivo"}
          </Button>
          <input
            ref={inputRef} type="file" multiple accept={accept} className="hidden"
            onChange={(e) => enviarArquivos(e.target.files)}
          />
        </div>

        {anexos.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`flex w-full flex-col items-center gap-1 rounded-md border border-dashed p-6 text-center text-xs transition-colors ${
              arrastando ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40"
            }`}
          >
            <Paperclip className="h-5 w-5" />
            {categoria === "capa" ? "Arraste a capa aqui ou clique para enviar" : "Arraste arquivos aqui ou clique para enviar"}
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {anexos.map((a) => (
              <div key={a.id} className="group relative overflow-hidden rounded-md border border-border/40 bg-black/30">
                {/* Clique abre o VISUALIZADOR, não outra aba: conferir o
                    roteiro acontece durante a edição, e trocar de aba tira a
                    peça da tela. O que o navegador não renderiza embutido
                    continua indo pro link, dentro do próprio modal. */}
                {a.tipo === "foto" ? (
                  <button onClick={() => setVendo(a)} className="block w-full" title="Ver aqui">
                    <img src={a.url} alt={a.nome} loading="lazy" className="h-28 w-full object-cover" />
                  </button>
                ) : a.tipo === "video" ? (
                  <video src={a.url} className="h-28 w-full bg-black object-contain" controls preload="metadata" />
                ) : (
                  <button onClick={() => setVendo(a)} title={podeVerAqui(a) ? "Ver aqui" : "Abrir"}
                    className="flex h-28 w-full flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary">
                    <FileText className="h-7 w-7" />
                    <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide">{ext(a.nome)}</span>
                  </button>
                )}
                {a.tamanho ? (
                  <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                    {fmtTam(a.tamanho)}
                  </span>
                ) : null}
                <div className="flex items-center justify-between gap-1 px-2 py-1">
                  <button onClick={() => setVendo(a)} className="min-w-0 truncate text-left text-[11px] text-foreground hover:text-primary" title={a.nome}>
                    {a.nome}
                  </button>
                  <button
                    onClick={() => excluir(a)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <VisualizarAnexo anexo={vendo} onClose={() => setVendo(null)} />
      </CardContent>
    </Card>
  );
}

function TimesheetEntregavel({
  did, projectId, entries, profiles, horasTotal, temAlteracaoAberta, alteracoes = [], onChanged,
}: {
  did: string; projectId: string; entries: any[]; profiles: any[]; horasTotal: number;
  temAlteracaoAberta: boolean; alteracoes?: any[]; onChanged: () => void;
}) {
  const { user } = useAuth();
  const { sessao, stop, elapsedSec } = useTimer();
  const [dur, setDur] = useState("");
  const [desc, setDesc] = useState("");
  const durMin = parseDuracaoMin(dur, "h");   // número puro = horas neste campo

  // Aqui NÃO tem play, de propósito. Começar a trabalhar é o "Editar" lá em
  // cima: ele liga o cronômetro E move a peça pra "em edição". O play que
  // existia aqui só ligava o relógio — a peça continuava parada em revisão
  // enquanto alguém editava, e a trilha de aprovação ficava mentindo.
  //
  // Parar continua aqui: encerrar não quebra trilha nenhuma, e tirar o botão
  // deixaria cronômetro rodando sem lugar óbvio pra fechar.
  const rodando = !!sessao && sessao.deliverable_id === did;
  const handlePause = async () => {
    await stop();
    onChanged();
  };

  const lancar = useMutation({
    mutationFn: async () => {
      // Aqui o número puro é HORAS ("1.5" = 1h30) — o campo sempre foi assim.
      // Mas agora aceita "2h10", "1:30", "90min" igual à página de horas.
      const min = parseDuracaoMin(dur, "h");
      if (!min || min <= 0) throw new Error('Duração não entendida — tente "2h10", "1.5", "90min" ou "1:30".');
      const { error } = await (supabase as any).from("time_entries").insert({
        user_id: user?.id,
        project_id: projectId,
        deliverable_id: did,
        start_at: new Date().toISOString(),
        duration_min: min,
        description: desc || null,
        billable: true,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDur(""); setDesc("");
      onChanged();
      toast.success("Horas lançadas no entregável");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Timesheet do entregável <span className="font-normal text-muted-foreground">· edição pura</span></p>
            <p className="text-xs text-muted-foreground">Total rastreado: <strong>{horasTotal.toFixed(1)}h</strong></p>
          </div>
          {rodando ? (
            <Button
              size="sm"
              onClick={handlePause}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
              title="Pausar e lançar as horas"
            >
              <Pause className="mr-1 h-3.5 w-3.5 fill-current" /> Pausar · {formatElapsed(elapsedSec)}
            </Button>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Lançamento manual — pra começar a contar, use <b className="text-foreground">Editar</b> no fluxo acima.
            </span>
          )}
        </div>

        {/* Tem alteração aberta: quem está mexendo por causa do cliente NÃO
            deve apontar aqui (isso é edição pura) — deve apontar na alteração,
            senão a hora de alteração fica invisível e o custo se perde. */}
        {temAlteracaoAberta && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <MessageSquarePlus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Tem <strong>alteração do cliente aberta</strong>: o tempo que você rodar agora entra
              como <strong>hora de alteração</strong>, automaticamente. Quando mandar pra revisão, a
              alteração fecha e o cronômetro volta a contar como edição normal.
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-32">
            <Input value={dur} onChange={(e) => setDur(e.target.value)} placeholder="1.5, 2h10, 90min" className="h-8" />
            {dur.trim() && (
              durMin
                ? <p className="mt-0.5 text-[10px] text-success">{fmtDuracao(durMin)}</p>
                : <p className="mt-0.5 text-[10px] text-destructive">não entendi</p>
            )}
          </div>
          {/* "O que foi feito" virou escolha de etapa (mesma lista da página de
              horas) — apontamento padronizado, dá pra somar por etapa depois. */}
          <Select value={desc || undefined} onValueChange={setDesc}>
            <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="— etapa (edição pura) —" /></SelectTrigger>
            <SelectContent>
              {ETAPAS_TRABALHO.map((etapa) => (
                <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => lancar.mutate()} disabled={lancar.isPending || !durMin}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Lançar
          </Button>
        </div>

        {entries.length > 0 && (
          <div className="space-y-1">
            {entries.map((e) => {
              // Com etapa preenchida ("Edição") a linha de alteração ficava
              // idêntica à de edição pura. A versão na frente resolve na lida.
              const alt = e.alteracao_id ? alteracoes.find((a: any) => a.id === e.alteracao_id) : null;
              return (
              <div key={e.id} className="grid grid-cols-[90px_1fr_120px_60px_30px] items-center gap-2 text-xs">
                <span className="text-muted-foreground">{new Date(e.start_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  {e.alteracao_id && (
                    <span className="shrink-0 rounded bg-warning/15 px-1 py-0.5 text-[9px] font-semibold text-warning">
                      {alt?.versao || (alt ? `V${alt.numero}` : "alteração")}
                    </span>
                  )}
                  <span className="truncate text-foreground">{e.description || (e.alteracao_id ? "alteração cliente" : "edição")}</span>
                </span>
                <span className="truncate text-muted-foreground">{nomeDe(profiles, e.user_id) || "—"}</span>
                <span className="text-right">{fmtDuracao(e.duration_min)}</span>
                <button onClick={() => excluir.mutate(e.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------ Alterações do cliente */

/** Rótulo da versão da peça (V1, V2, V2.1…), editável no lugar. */
function VersaoAlteracao({ a, onChanged }: { a: any; onChanged: () => void }) {
  const padrao = `V${a.numero}`;
  const [v, setV] = useState<string>(a.versao || padrao);
  const [salvando, setSalvando] = useState(false);

  // Ressincroniza quando a linha muda por fora (outra aba, refetch): sem isto
  // o input segura o valor antigo depois de um invalidate.
  useEffect(() => setV(a.versao || padrao), [a.versao, padrao]);

  const salvar = async () => {
    const novo = v.trim() || padrao;
    setV(novo);
    if (novo === (a.versao || padrao)) return;
    setSalvando(true);
    const { error } = await (supabase as any)
      .from("deliverable_alteracoes").update({ versao: novo }).eq("id", a.id);
    setSalvando(false);
    if (error) return toast.error("Não salvou a versão", { description: error.message });
    onChanged();
  };

  return (
    <span className="relative shrink-0">
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        title="Versão da peça — clique pra renomear"
        className="h-6 w-16 border-warning/30 bg-warning/15 px-1.5 text-center text-[11px] font-semibold text-warning focus-visible:ring-warning/40"
      />
      {salvando && <Loader2 className="absolute -right-4 top-1 h-3 w-3 animate-spin text-muted-foreground" />}
    </span>
  );
}

/**
 * Lançar hora NA alteração — o que faltava.
 *
 * O cronômetro já sabia jogar tempo na alteração aberta, mas quem trabalhou
 * sem dar play (ou fechou a alteração antes de apontar) não tinha por onde
 * registrar: a hora ia parar na edição pura ou não ia a lugar nenhum. E hora
 * de alteração é justamente a que se cobra à parte no fechamento.
 */
function LancarHoraAlteracao({
  did, projectId, alteracaoId, onChanged,
}: { did: string; projectId: string; alteracaoId: string; onChanged: () => void }) {
  const { user } = useAuth();
  const [dur, setDur] = useState("");
  const [etapa, setEtapa] = useState("");
  const durMin = parseDuracaoMin(dur, "h");   // número puro = horas, igual ao timesheet

  const lancar = useMutation({
    mutationFn: async () => {
      const min = parseDuracaoMin(dur, "h");
      if (!min || min <= 0) throw new Error('Duração não entendida — tente "2h10", "1.5", "90min" ou "1:30".');
      const { error } = await (supabase as any).from("time_entries").insert({
        user_id: user?.id,
        project_id: projectId,
        deliverable_id: did,
        alteracao_id: alteracaoId,      // <- é isto que separa da edição pura
        start_at: new Date().toISOString(),
        duration_min: min,
        description: etapa || null,
        billable: true,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDur(""); setEtapa("");
      onChanged();
      toast.success("Horas lançadas na alteração");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-28">
        <Input
          value={dur}
          onChange={(e) => setDur(e.target.value)}
          placeholder="1.5, 2h10, 90min"
          className="h-7 text-xs"
        />
        {dur.trim() && (
          durMin
            ? <p className="mt-0.5 text-[10px] text-success">{fmtDuracao(durMin)}</p>
            : <p className="mt-0.5 text-[10px] text-destructive">não entendi</p>
        )}
      </div>
      <Select value={etapa || undefined} onValueChange={setEtapa}>
        <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="— etapa —" /></SelectTrigger>
        <SelectContent>
          {ETAPAS_TRABALHO.map((e) => (
            <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" className="h-7" onClick={() => lancar.mutate()} disabled={lancar.isPending || !durMin}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Lançar horas
      </Button>
    </div>
  );
}

function AlteracoesSection({
  did, projectId, projectName, alteracoes, podeHoras, horasPorAlteracao, onChanged,
}: {
  did: string; projectId: string; projectName: string; alteracoes: any[]; podeHoras: boolean;
  horasPorAlteracao: Record<string, number>; onChanged: () => void;
}) {
  const { user } = useAuth();
  const { sessao, stop, elapsedSec } = useTimer();
  const [nova, setNova] = useState({ titulo: "", descricao: "" });
  const [aberto, setAberto] = useState(false);
  const abertas = (alteracoes || []).filter((a: any) => a.status === "aberta");

  const criar = useMutation({
    mutationFn: async () => {
      if (!nova.titulo.trim()) throw new Error("Informe o título da alteração");
      const prox = (alteracoes.at(-1)?.numero ?? 0) + 1;
      const { error } = await (supabase as any).from("deliverable_alteracoes").insert({
        deliverable_id: did,
        numero: prox,
        titulo: nova.titulo,
        descricao: nova.descricao || null,
        origem: "cliente",
        criado_por: user?.email || "equipe",
      });
      if (error) throw error;
      await (supabase as any).from("deliverables").update({ status: "ajuste_solicitado" }).eq("id", did);
    },
    onSuccess: () => {
      setNova({ titulo: "", descricao: "" });
      setAberto(false);
      onChanged();
      toast.success("Alteração do cliente registrada");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const resolver = useMutation({
    mutationFn: async (a: any) => {
      const novoStatus = a.status === "resolvida" ? "aberta" : "resolvida";
      const { error } = await (supabase as any)
        .from("deliverable_alteracoes")
        .update({ status: novoStatus, resolved_at: novoStatus === "resolvida" ? new Date().toISOString() : null })
        .eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  return (
    // Card ganha borda âmbar quando há alteração aberta — pra saltar aos olhos
    // que este entregável está em ajuste do cliente.
    <Card className={`glass-card ${abertas.length ? "border-warning/50 bg-warning/[0.04]" : ""}`}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Alterações do cliente</p>
            <p className="text-xs text-muted-foreground">Cada alteração é uma versão da peça (V1, V2…). Horas próprias: o cronômetro joga aqui sozinho enquanto ela está aberta, e dá pra lançar na mão a qualquer momento.</p>
          </div>
          <Button size="sm" onClick={() => setAberto((v) => !v)} className="bg-primary text-primary-foreground">
            <MessageSquarePlus className="mr-1 h-3.5 w-3.5" /> Alteração do cliente
          </Button>
        </div>

        {/* Banner gritante enquanto houver alteração aberta. */}
        {abertas.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/15 px-3 py-2 text-xs font-medium text-warning">
            <MessageSquarePlus className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {abertas.length === 1 ? "1 alteração do cliente aberta" : `${abertas.length} alterações do cliente abertas`} —
              o tempo que você rodar agora entra como <strong>hora de alteração</strong>, automaticamente.
              Quando mandar pra revisão, ela fecha e o cronômetro volta a contar edição normal.
            </span>
          </div>
        )}

        {aberto && (
          <div className="space-y-2 rounded-md border border-dashed border-border/60 p-3">
            <p className="text-[11px] text-muted-foreground">
              Vai nascer como <strong className="text-warning">V{(alteracoes.at(-1)?.numero ?? 0) + 1}</strong> — dá pra renomear depois no rótulo.
            </p>
            <Input value={nova.titulo} onChange={(e) => setNova({ ...nova, titulo: e.target.value })} placeholder="Título (ex.: Trocar trilha, cortar cena 3)" />
            <Textarea rows={2} value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} placeholder="O que o cliente pediu…" />
            <div className="flex justify-end">
              <Button size="sm" onClick={() => criar.mutate()} disabled={criar.isPending}>Registrar alteração</Button>
            </div>
          </div>
        )}

        {alteracoes.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">Nenhuma alteração do cliente ainda.</p>
        ) : (
          alteracoes.map((a) => (
            <div key={a.id} className={`rounded-md border p-3 ${a.status === "aberta" ? "border-warning/50 bg-warning/[0.06]" : "border-border/40 bg-muted/10"}`}>
              <div className="flex items-center gap-2">
                <VersaoAlteracao a={a} onChanged={onChanged} />
                <span className="flex-1 truncate text-sm font-medium text-foreground">{a.titulo}</span>
                {podeHoras && (
                  <span className="text-xs text-muted-foreground">{((horasPorAlteracao[a.id] || 0) / 60).toFixed(1)}h</span>
                )}
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${a.status === "resolvida" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                  {a.status}
                </span>
              </div>
              {a.descricao && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                  <TextoComLinks texto={a.descricao} />
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                {/* Sem Play próprio. O cronômetro é UM só: enquanto a alteração
                    está aberta, o "Editar" já conta aqui. Dois botões de
                    rastreio faziam a mesma hora cair em lugares diferentes
                    conforme onde a pessoa clicava. Aqui só mostra o estado. */}
                {podeHoras && sessao?.deliverable_id === did && sessao?.alteracao_id === a.id && (
                  <span className="flex items-center gap-1 rounded bg-warning/15 px-2 py-1 text-[11px] font-medium text-warning">
                    <Play className="h-3 w-3 fill-current" />
                    contando aqui · {formatElapsed(elapsedSec)}
                  </span>
                )}
                <Button size="sm" variant="ghost" className="h-7" onClick={() => resolver.mutate(a)}>
                  {a.status === "resolvida" ? "Reabrir" : "Marcar resolvida"}
                </Button>
              </div>

              {/* Lançamento manual da hora desta versão. Fica também nas
                  resolvidas de propósito: quase sempre a pessoa só lembra de
                  apontar depois de fechar a alteração. */}
              {podeHoras && (
                <div className="mt-2 border-t border-border/40 pt-2">
                  <LancarHoraAlteracao
                    did={did}
                    projectId={projectId}
                    alteracaoId={a.id}
                    onChanged={onChanged}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------ helpers de UI */

/**
 * Em qual nota esta peça entra.
 *
 * O normal é herdar o projeto — e é isso que a primeira opção diz por
 * extenso, em vez de um "—" que obrigaria a abrir o projeto pra descobrir.
 *
 * As outras opções são os baldes que o projeto NÃO é. Oferecer o mesmo balde
 * do projeto criaria um jeito de gravar um valor que não muda nada — e, pior,
 * uma peça marcada "mensal" dentro de um projeto mensal deixaria de
 * acompanhar o projeto no dia em que ele virasse outra coisa, sem ninguém
 * lembrar por quê.
 */
function FaturamentoPeca({ did, valor, doProjeto, onChanged }: {
  did: string; valor: string | null; doProjeto: string; onChanged: () => void;
}) {
  const HERDA = "__herda__";
  const [v, setV] = useState(valor || HERDA);
  const doProjetoOk = balde(doProjeto);
  const outros = BALDES.filter((b) => b.id !== doProjetoOk);

  const salvar = async (nv: string) => {
    setV(nv);
    const { error } = await (supabase as any)
      .from("deliverables")
      .update({ faturamento: nv === HERDA ? null : nv })
      .eq("id", did)
      .select("id");
    if (error) {
      toast.error("Não salvou o faturamento da peça", { description: error.message });
      setV(valor || HERDA);
      return;
    }
    toast.success(nv === HERDA ? "Voltou a seguir o projeto" : `Peça: ${rotuloBalde(nv).toLowerCase()}`);
    onChanged();
  };

  return (
    <div>
      <Select value={v} onValueChange={salvar}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={HERDA} className="text-xs">
            Segue o projeto — {rotuloBalde(doProjetoOk).toLowerCase()}
          </SelectItem>
          {outros.map((b) => (
            <SelectItem key={b.id} value={b.id} className="text-xs">Só esta peça: {b.label.toLowerCase()}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {foraDoFechamento(v === HERDA ? doProjetoOk : v) && (
        <p className="mt-1 text-[10px] text-warning">
          {BALDES.find((b) => b.id === (v === HERDA ? doProjetoOk : v))?.ajuda}
        </p>
      )}
    </div>
  );
}

/**
 * Briefing: fechado por padrão, com "ver mais".
 *
 * O problema não era o tamanho da caixa — era não haver sinal nenhum de que
 * havia MAIS texto embaixo. Um textarea com barra de rolagem interna esconde
 * o resto sem avisar, e quem lê acha que leu tudo. Aqui o corte é
 * proposital: some o fim do texto atrás de um degradê e um botão diz quantas
 * linhas faltam — obriga o clique, que é o ponto.
 *
 * Clicar em qualquer lugar do texto abre pra edição. Briefing curto (até 6
 * linhas) nunca corta: não há o que esconder.
 */
function BriefingComVerMais({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const linhas = (valor || "").split("\n");
  const LIMITE = 6;
  const cortado = !aberto && linhas.length > LIMITE;

  if (editando || !valor) {
    return (
      <Textarea
        autoFocus={!!valor}
        rows={Math.min(20, Math.max(5, linhas.length + 1))}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditando(false)}
        placeholder="Direcionamento, referências, o que precisa entregar…"
      />
    );
  }

  return (
    <div>
      <div
        onClick={() => setEditando(true)}
        title="Clique para editar"
        className="relative cursor-text whitespace-pre-wrap rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm leading-relaxed text-foreground"
      >
        {cortado ? linhas.slice(0, LIMITE).join("\n") : valor}
        {/* O degradê é o sinal: o texto morre no meio, e isso se vê. */}
        {cortado && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-md bg-gradient-to-t from-card to-transparent" />
        )}
      </div>
      {linhas.length > LIMITE && (
        // Centralizado, em caixa, PULSANDO — pedido do Djêisson depois de ver
        // o link discreto: "o ver mais tá MUITO discreto". Um texto pequeno
        // no canto perde justamente pra quem já achou que leu tudo; o que
        // precisa acontecer aqui é a pessoa notar sem estar procurando.
        <div className="mt-2 flex justify-center">
          <button
            onClick={() => setAberto((v) => !v)}
            className={`rounded-lg border border-primary/60 px-4 py-1.5 text-xs font-semibold text-primary transition-shadow ${
              aberto ? "" : "animate-pulse shadow-[0_0_16px_2px_hsl(var(--primary)/0.55)]"
            }`}
          >
            {aberto ? "ver menos" : `ver mais (+${linhas.length - LIMITE} linhas)`}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * O link do arquivo: preenchido, ele É o botão.
 *
 * Antes o campo era um input largo com um "Abrir" do lado — pra ver a peça
 * era preciso mirar num botão pequeno depois de atravessar um campo de texto
 * que quase nunca se edita. O link, uma vez posto, é lido cem vezes e mudado
 * uma. Então o estado de repouso passa a ser o link clicável ocupando a
 * linha toda, com um lápis discreto pra trocar.
 */
function LinkDoArquivo({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const [editando, setEditando] = useState(!valor);
  const [txt, setTxt] = useState(valor);
  useEffect(() => { if (!editando) setTxt(valor); }, [valor, editando]);

  const salvar = () => { setEditando(false); if (txt !== valor) onChange(txt.trim()); };

  if (editando || !valor) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus={!!valor}
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => { if (e.key === "Enter") salvar(); if (e.key === "Escape") { setTxt(valor); setEditando(false); } }}
          placeholder="https://f.io/…"
          className="h-9"
        />
        {valor && (
          <Button size="sm" variant="ghost" className="h-9" onClick={salvar}>ok</Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <a
        href={valor}
        target="_blank"
        rel="noreferrer"
        title={valor}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        <ExternalLink className="h-4 w-4 shrink-0" />
        <span className="truncate">{valor.replace(/^https?:\/\//, "")}</span>
      </a>
      <button
        onClick={() => setEditando(true)}
        title="Trocar o link"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Uma linha do cabeçalho: rótulo à esquerda, valor à direita.
 *
 * O formato é o do ClickUp, e o motivo é densidade — rótulo EM CIMA do campo
 * gasta duas linhas por informação, e a peça tem doze. Aqui cada uma ocupa
 * uma linha só, e a coluna de rótulos alinhada deixa a lista varrível: o olho
 * desce pela esquerda até achar o que procura, sem ler os valores.
 */
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-border/25 py-1.5">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Campo({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    // min-w-0: item de grid não encolhe abaixo do conteúdo sem isso, e aí o
    // que está dentro vaza pra coluna vizinha.
    <div className={`min-w-0 ${className || ""}`}>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/**
 * Estimativa da peça e o quanto ela errou.
 *
 * A estimativa é o que reserva o tempo da pessoa (a Capacidade lê daqui). O
 * realizado ao lado existe pra medir o erro: com histórico suficiente dá pra
 * corrigir a estimativa sozinho — hoje não dá, porque só há ~28h apontadas no
 * sistema inteiro. Então por ora ele serve pro olho humano, e vai acumulando.
 */
function EstimativaEntregavel({
  id, estimadas, realizadas, onSalvo,
}: { id: string; estimadas: number | null; realizadas: number; onSalvo: () => void }) {
  const [valor, setValor] = useState(estimadas != null ? String(estimadas) : "");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const n = valor.trim() === "" ? null : Number(valor.replace(",", "."));
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      toast.error("Horas inválidas");
      return;
    }
    setSalvando(true);
    const { error } = await (supabase as any)
      .from("deliverables").update({ horas_estimadas: n }).eq("id", id);
    setSalvando(false);
    if (error) return toast.error("Não salvou", { description: error.message });
    toast.success(n === null ? "Estimativa removida" : `Estimativa: ${n}h`);
    onSalvo();
  };

  const est = estimadas ?? 0;
  const fator = est > 0 && realizadas > 0 ? realizadas / est : null;
  // ±20% é ruído normal de estimativa; fora disso vale destacar.
  const tom = fator == null ? "" : fator > 1.2 ? "text-destructive" : fator < 0.8 ? "text-warning" : "text-success";

  return (
    // Uma linha, não um bloco largo. Eram três colunas e um parágrafo de
    // explicação pra mostrar dois números — e a explicação, que se lê uma vez
    // na vida, ocupava o mesmo espaço que os números, que se leem sempre.
    // Virou `title`, que é onde a explicação de uma vez pertence.
    <Card className="glass-card">
      <CardContent
        className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm"
        title="A estimativa reserva o tempo de quem é responsável. O realizado mede o quanto a gente erra — é esse histórico que vai permitir corrigir depois."
      >
        <span className="text-xs text-muted-foreground">Horas estimadas</span>
        <div className="flex items-center gap-1">
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onBlur={salvar}
            onKeyDown={(e) => e.key === "Enter" && salvar()}
            placeholder="—"
            className="h-7 w-16 text-sm"
            inputMode="decimal"
          />
          <span className="text-xs text-muted-foreground">h</span>
          {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        <span className="text-xs text-muted-foreground">· realizado</span>
        <span className="font-semibold text-foreground">{realizadas.toFixed(1)}h</span>

        {fator != null && (
          <span className={`text-xs font-medium ${tom}`}>
            {fator > 1 ? `${((fator - 1) * 100).toFixed(0)}% acima` : fator < 1 ? `${((1 - fator) * 100).toFixed(0)}% abaixo` : "no ponto"}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function IndicadorCard({
  label, value, icon: Icon, hint, tone,
}: {
  label: string; value: string; icon: React.ComponentType<{ className?: string }>; hint?: string;
  tone?: "warning" | "destructive";
}) {
  const cls = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <Card className="glass-card">
      <CardContent className="space-y-1 p-4">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-lg font-semibold ${cls}`}>{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
