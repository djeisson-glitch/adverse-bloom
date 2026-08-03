import { useMemo, useState, useEffect, useRef } from "react";
import { EtapasPos } from "@/components/entregavel/EtapasPos";
import { primeiroNome } from "@/lib/pessoa";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTimer, formatElapsed } from "@/contexts/TimerContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useFormAutosave, vaziosParaNull } from "@/hooks/useFormAutosave";
import { IndicadorAutosave } from "@/components/autosave/AutosaveContext";
import { SeletorPrazo } from "@/components/prazo/SeletorPrazo";
import { useConfirm, usePrompt } from "@/components/ui/confirm";
import * as Fluxo from "@/lib/fluxoEntregavel";
import {
  STATUS_ENTREGAVEL, statusTone, statusPill, statusBorda, statusLabel, iconeStatus,
} from "@/lib/statusEntregavel";
import {
  ArrowLeft, Loader2, ExternalLink, Film, CheckCircle2,
  Play, Pause, Plus, Trash2, MessageSquarePlus, ThumbsUp, RefreshCw, Clock, Scissors, UserCheck,
  PanelRightClose, MessageSquare, Copy, Wrench, Upload, FileText, Paperclip,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDuracaoMin, fmtDuracao, ETAPAS_TRABALHO } from "@/lib/duracao";
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

// Formato normalizado pra nome de pasta: "16×9" / "16 X 9" → "16x9".
function normFormato(formato: string | null | undefined): string {
  return (formato || "").trim().replace(/\s+/g, "").replace(/[×:]/g, "x").toLowerCase();
}

// Caixa de nome de pasta: tudo maiúsculo e sem acento, no mesmo padrão dos
// nomes de projeto (CAMPANHA_PME_UNIMED). Acento em nome de pasta dá dor de
// cabeça no DaVinci e no sistema de arquivos.
function caixaPasta(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

// Nome-padrão pra pasta/projeto no DaVinci — cada bloco entre colchetes:
// [COD] [NOME COMPLETO] [FORMATO] [V1]
// ex.: "[ADVR-4036] [SPOT DE RADIO 01 - FILME MAE] [16X9] [V1]"
// Sem formato preenchido, saem 3 blocos — o bloco não vira placeholder.
function nomeDaVinci(codigo: string | null | undefined, titulo: string | null | undefined, formato: string | null | undefined): string {
  const cod = (codigo || "").trim();
  // O prefixo interno ("PÓS | ") fica de fora: ele contava como palavra e o
  // nome saía truncado em "[PÓS | Spot]".
  const nome = caixaPasta((titulo || "").replace(/^\s*(PÓS|POS|PROD|DESL)\s*\|\s*/i, "").trim());
  const f = caixaPasta(normFormato(formato));
  return [cod && `[${cod}]`, nome && `[${nome}]`, f && `[${f}]`, "[V1]"].filter(Boolean).join(" ");
}

// Nome do projeto pra copiar: o nome INTEIRO, como está cadastrado. A versão
// anterior tirava o prefixo (#20260601_) e o que era copiado não batia com o
// nome da pasta. O padrão de nome mora no cadastro do projeto, não aqui.
function nomeProjetoCopia(name: string | null | undefined): string {
  return (name || "").trim();
}

async function copiarTexto(texto: string, oque: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${oque} copiado`);
  } catch {
    toast.error("Não consegui copiar — copie manualmente.");
  }
}

// Rótulo do status deixando explícito QUEM revisa em cada nível.
function labelStatus(status: string, n1Nome: string, n2Nome: string) {
  const base = statusLabel(status);
  if (status === "revisao_n1") return `${base} · ${n1Nome}`;
  if (status === "revisao_n2") return `${base} · ${n2Nome}`;
  return base;
}

export default function EntregavelDetalhe() {
  const { id: projectId, did } = useParams<{ id: string; did: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  // Recarrega as horas do entregável (lista do timesheet + os 4 cards no topo).
  // Uso refetchQueries em vez de invalidateQueries: o invalidate não estava
  // disparando o GET aqui (a query ficava marcada stale mas não refazia), então
  // o card seguia 0.0h até dar F5. refetch força o fetch e atualiza na hora.
  const recarregarHoras = () => qc.refetchQueries({ queryKey: ["entregavel-horas", did] });
  const { start } = useTimer();
  const { isAdmin, isCoordenadora, canSeeHours } = usePermissions();
  const confirmar = useConfirm();

  const { data: entregavel, isLoading, isError, error } = useQuery({
    queryKey: ["entregavel", did],
    enabled: !!did,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("*, project:projects(id, numero, name, client_name, aprovador_n1_id, aprovador_n2_id, cliente_aprova, client_id, budget:budgets(budget_number))")
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
        .select("id, full_name, email")
        .neq("ativo", false)
        .order("full_name");
      if (error) throw error;
      return data as any[];
    },
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
          onClick={() => navigate(`/projetos/${projectId}`)}
          className="mb-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar ao projeto
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
  const n1Nome = nomeDe(profiles, n1);
  const n2Nome = nomeDe(profiles, n2);
  const clienteAprova = proj?.cliente_aprova ?? config?.cliente_aprova ?? true;

  // Papéis pra máquina de estados. A coordenadora revisa e envia por PAPEL —
  // é a função dela (revisar e mandar pro cliente), então não precisa estar
  // configurada como N1/N2 em cada projeto. Admin/manager faz tudo.
  const eu = user?.id;
  const podeRevisar = isAdmin || isCoordenadora;
  const isN1 = !!eu && (eu === n1 || podeRevisar);
  const isN2 = !!eu && (eu === n2 || podeRevisar);
  const isRevisor = !!eu && (eu === n1 || eu === n2 || podeRevisar);
  const isEditor = !!eu && (entregavel.responsavel_id === eu || isAdmin);
  const alteracaoAberta = (alteracoes as any[]).find((a: any) => a.status === "aberta") || null;

  return (
    <div className={`space-y-5 py-6 ${chatAberto ? "lg:pr-[440px]" : "mx-auto max-w-[1400px]"}`}>
      <button
        onClick={() => navigate(`/projetos/${projectId}`)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {proj?.name || "Projeto"}
      </button>

      {/* Header */}
      <Card className="glass-card">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${statusTone(form.status)}`}>
                  {labelStatus(form.status, n1Nome, n2Nome)}
                </span>
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

          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Campo label="Projeto" className="sm:col-span-2">
              <div className="flex items-center gap-2">
                <Link to={`/projetos/${projectId}`} className="min-w-0 truncate text-primary hover:underline">
                  {proj?.numero} · {proj?.name}
                </Link>
                <button
                  onClick={() => copiarTexto(nomeProjetoCopia(proj?.name), "Nome do projeto")}
                  title={`Copiar: ${nomeProjetoCopia(proj?.name)}`}
                  className="shrink-0 rounded-md border border-border/60 p-1 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </Campo>
            <Campo label="Responsável">
              <Select value={form.responsavel_id || "__none__"} onValueChange={(v) => setJa({ responsavel_id: v === "__none__" ? "" : v })}>
                <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— sem responsável —</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{primeiroNome(p.full_name || p.email)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Formato">
              <Input value={form.formato} onChange={(e) => set({ formato: e.target.value })} placeholder="16x9" className="h-8" />
            </Campo>
            <Campo label="Duração">
              <Input value={form.duracao} onChange={(e) => set({ duracao: e.target.value })} placeholder='30"' className="h-8" />
            </Campo>
            <Campo label="Prazo interno">
              <SeletorPrazo
                data={form.prazo_interno}
                hora={form.prazo_interno_hora}
                onChange={(v) => setJa({ prazo_interno: v.data, prazo_interno_hora: v.hora || null })}
              />
            </Campo>
            <Campo label="Prazo do cliente">
              <SeletorPrazo
                data={form.data_entrega}
                hora={form.data_entrega_hora}
                onChange={(v) => setJa({ data_entrega: v.data, data_entrega_hora: v.hora || null })}
              />
            </Campo>
            <Campo label="Link do arquivo / Frame.io" className="sm:col-span-2 lg:col-span-4">
              <div className="flex gap-2">
                <Input value={form.arquivo_url} onChange={(e) => set({ arquivo_url: e.target.value })} placeholder="https://frame.io/…" className="h-8" />
                {form.arquivo_url && (
                  <a
                    href={form.arquivo_url}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir o link em nova aba"
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir
                  </a>
                )}
              </div>
            </Campo>
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
        podeForcar={podeRevisar}
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
          onStart={() => start({ project_id: projectId!, project_name: proj?.name || "", deliverable_id: did! })}
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
          <Textarea rows={5} value={form.descricao} onChange={(e) => set({ descricao: e.target.value })} placeholder="Direcionamento, referências, o que precisa entregar…" />
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
  isEditor, isN1, isN2, isRevisor, podeForcar, alteracaoAberta, onChanged,
}: {
  entregavel: any; did: string; projectId: string; projName: string;
  n1: string | null; n2: string | null; clienteAprova: boolean; profiles: any[];
  isEditor: boolean; isN1: boolean; isN2: boolean; isRevisor: boolean;
  podeForcar: boolean; alteracaoAberta: any; onChanged: () => void;
}) {
  const { user } = useAuth();
  const { start, stop, sessao } = useTimer();
  const confirmar = useConfirm();
  const perguntar = usePrompt();
  const status = entregavel.status || "pendente";
  const retrab = !!entregavel.retrabalho;
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
      B("edt", <Button size="sm" onClick={editar} className="bg-primary text-primary-foreground"><Play className="mr-1 h-3.5 w-3.5" /> {status === "em_edicao" ? "Retomar edição" : "Editar"}</Button>);
    }
    if (status === "em_edicao" || status === "em_pausa") {
      B("env", <Button size="sm" onClick={enviarRevisao} className="bg-primary text-primary-foreground"><ThumbsUp className="mr-1 h-3.5 w-3.5" /> Enviar para revisão</Button>);
    }
  }

  // REVISÃO 1 (1ª vez)
  if (status === "revisao_n1" && isN1) {
    B("n1a", <Button size="sm" onClick={n1AprovaSegue} className="bg-success text-white hover:bg-success/90"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aprovar → Revisão 2</Button>);
    B("n1j", <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={n1AjusteSegue}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Pedir ajuste → Revisão 2</Button>);
  }
  // REVISÃO 2
  if (status === "revisao_n2" && isN2) {
    B("n2a", <Button size="sm" onClick={n2Aprova} className="bg-success text-white hover:bg-success/90"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aprovar</Button>);
    B("n2j", <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={n2Ajuste}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Pedir ajuste</Button>);
  }
  // REVISÃO ÚNICA (retrabalho, só N1) — com escalar pra N2 opcional
  if (status === "revisao" && isRevisor) {
    B("rua", <Button size="sm" onClick={revUnicaAprova} className="bg-success text-white hover:bg-success/90"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aprovar</Button>);
    B("ruj", <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={revUnicaAjuste}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Pedir ajuste</Button>);
    B("rue", <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={revUnicaEscala} title="Opcional: mandar pra uma segunda revisão"><UserCheck className="mr-1 h-3.5 w-3.5" /> Pedir Revisão 2</Button>);
  }
  // ENVIAR AO CLIENTE
  if (status === "pronto" && isRevisor) {
    B("env", <Button size="sm" onClick={enviarCliente} className="bg-primary text-primary-foreground"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Enviar para aprovação do cliente</Button>);
  }
  // COM O CLIENTE — coordenação registra alteração ou aprovação
  if (status === "com_cliente" && isRevisor) {
    B("apr", <Button size="sm" onClick={clienteAprovou} className="bg-success text-white hover:bg-success/90"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Cliente aprovou</Button>);
    B("alt", <Button size="sm" variant="outline" className="text-warning hover:text-warning" onClick={alteracaoCliente}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" /> Alteração do cliente</Button>);
  }

  const StatusIcon = iconeStatus(status);
  return (
    <Card className={`glass-card border-l-4 ${statusBorda(status)}`}>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status é o DESTAQUE da tela — pílula grande, ícone e cor da etapa. */}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
            <span className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-base font-bold ${statusPill(status)}`}>
              <StatusIcon className="h-4 w-4" />
              {labelStatus(status, nomeDe(profiles, n1), nomeDe(profiles, n2))}
            </span>
            {retrab && <span className="rounded-md bg-amber-500/15 px-2 py-1 text-[11px] font-medium text-warning" title="Teve ajuste interno ou alteração do cliente — passa por 1 revisão só">↻ retrabalho · revisão única</span>}
          </div>
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
            {["entregue", "aprovado"].includes(status) ? "Entregue ✓ — nada a fazer aqui."
              : status === "com_cliente" ? "Está com o cliente — fora do seu controle por enquanto."
              // Sem responsável, os botões de edição não aparecem pra ninguém —
              // avisa pra definir um (o campo Responsável, acima).
              : !entregavel.responsavel_id && ["em_edicao", "em_pausa", "pendente", "ajuste_interno", "ajuste_solicitado"].includes(status)
                ? "Defina o responsável (campo acima) para o fluxo começar."
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
        <EtapasPos did={did} podeMover={!encerrado && (isRevisor || isEditor)} />

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

        {docs.map((d) => {
          const t = tipoDe(d.tipo);
          return (
            <div key={d.id} className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-3 py-2">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${t.cor}`}>{t.label}</span>
              <span className="text-sm font-medium text-foreground">{d.titulo}</span>
              <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs text-muted-foreground hover:text-primary">
                {d.url}
              </a>
              <a href={d.url} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-primary" title="Abrir">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button onClick={() => excluir.mutate(d.id)} className="shrink-0 text-muted-foreground hover:text-destructive" title="Remover">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        {docs.length === 0 && (
          <p className="py-1 text-xs text-muted-foreground">Nenhum documento anexado ainda.</p>
        )}

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
                {a.tipo === "foto" ? (
                  <a href={a.url} target="_blank" rel="noreferrer">
                    <img src={a.url} alt={a.nome} loading="lazy" className="h-28 w-full object-cover" />
                  </a>
                ) : a.tipo === "video" ? (
                  <video src={a.url} className="h-28 w-full bg-black object-contain" controls preload="metadata" />
                ) : (
                  <a href={a.url} target="_blank" rel="noreferrer" download title="Abrir / baixar"
                    className="flex h-28 w-full flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary">
                    <FileText className="h-7 w-7" />
                    <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide">{ext(a.nome)}</span>
                  </a>
                )}
                {a.tamanho ? (
                  <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                    {fmtTam(a.tamanho)}
                  </span>
                ) : null}
                <div className="flex items-center justify-between gap-1 px-2 py-1">
                  <a href={a.url} target="_blank" rel="noreferrer" className="truncate text-[11px] text-foreground hover:text-primary" title={a.nome}>
                    {a.nome}
                  </a>
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
      </CardContent>
    </Card>
  );
}

function TimesheetEntregavel({
  did, projectId, entries, profiles, horasTotal, temAlteracaoAberta, onStart, onChanged,
}: {
  did: string; projectId: string; entries: any[]; profiles: any[]; horasTotal: number;
  temAlteracaoAberta: boolean; onStart: () => void; onChanged: () => void;
}) {
  const { user } = useAuth();
  const { sessao, stop, elapsedSec } = useTimer();
  const [dur, setDur] = useState("");
  const [desc, setDesc] = useState("");
  const durMin = parseDuracaoMin(dur, "h");   // número puro = horas neste campo

  // Um cronômetro por peça. Antes isto excluía a sessão amarrada a uma
  // alteração, então o botão mostrava "Play" com o timer JÁ rodando na peça —
  // e clicar parava e recomeçava, picando a hora em dois lançamentos.
  const rodando = !!sessao && sessao.deliverable_id === did;
  const handlePlay = async () => {
    if (sessao) await stop(); // fecha e lança o que estiver rodando antes
    onStart();
  };
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
            <Button size="sm" variant="outline" onClick={handlePlay} title="Dar play no timer deste entregável">
              <Play className="mr-1 h-3.5 w-3.5 fill-current" /> Play
            </Button>
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
            {entries.map((e) => (
              <div key={e.id} className="grid grid-cols-[90px_1fr_120px_60px_30px] items-center gap-2 text-xs">
                <span className="text-muted-foreground">{new Date(e.start_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
                <span className="truncate text-foreground">{e.description || (e.alteracao_id ? "alteração cliente" : "edição")}</span>
                <span className="truncate text-muted-foreground">{nomeDe(profiles, e.user_id) || "—"}</span>
                <span className="text-right">{fmtDuracao(e.duration_min)}</span>
                <button onClick={() => excluir.mutate(e.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------ Alterações do cliente */

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
            <p className="text-xs text-muted-foreground">Pedidos do cliente (portal ou registrados aqui). Cada uma rastreia horas próprias — o editor dá play na alteração.</p>
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
                <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">R{a.numero}</span>
                <span className="flex-1 truncate text-sm font-medium text-foreground">{a.titulo}</span>
                {podeHoras && (
                  <span className="text-xs text-muted-foreground">{((horasPorAlteracao[a.id] || 0) / 60).toFixed(1)}h</span>
                )}
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${a.status === "resolvida" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                  {a.status}
                </span>
              </div>
              {a.descricao && <p className="mt-1 text-xs text-muted-foreground">{a.descricao}</p>}
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
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------ helpers de UI */

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
    <Card className="glass-card">
      <CardContent className="flex flex-wrap items-end gap-4 p-4">
        <div>
          <Label className="text-xs text-muted-foreground">Horas estimadas</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onBlur={salvar}
              onKeyDown={(e) => e.key === "Enter" && salvar()}
              placeholder="—"
              className="h-9 w-24"
              inputMode="decimal"
            />
            <span className="text-sm text-muted-foreground">h</span>
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
        </div>

        <div className="border-l border-border/40 pl-4">
          <p className="text-xs text-muted-foreground">Realizado</p>
          <p className="text-lg font-semibold text-foreground">{realizadas.toFixed(1)}h</p>
        </div>

        {fator != null && (
          <div className="border-l border-border/40 pl-4">
            <p className="text-xs text-muted-foreground">Estimativa</p>
            <p className={`text-lg font-semibold ${tom}`}>
              {fator > 1 ? `${((fator - 1) * 100).toFixed(0)}% acima` : fator < 1 ? `${((1 - fator) * 100).toFixed(0)}% abaixo` : "no ponto"}
            </p>
          </div>
        )}

        <p className="ml-auto max-w-[280px] text-[11px] text-muted-foreground/70">
          A estimativa reserva o tempo de quem é responsável. O realizado ao lado
          mede o quanto a gente erra — é esse histórico que vai permitir corrigir depois.
        </p>
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
