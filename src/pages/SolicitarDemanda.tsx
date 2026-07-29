import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HORARIOS_COMERCIAIS } from "@/components/prazo/SeletorPrazo";
import { Loader2, Plus, Trash2, Paperclip, X, CheckCircle2, CalendarClock, AlertTriangle, ChevronDown } from "lucide-react";
import { LogoAdverse } from "@/components/LogoAdverse";
import { RodapeConfidencial } from "@/components/publico/CabecalhoPublico";

/** ISO (timestamptz) -> string do input datetime-local (horário local). */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
/** Formato curto pro card de slot: "qui, 16/07 · 18h". */
function fmtSlot(iso: string) {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} · ${hora}`;
}

/**
 * Formulário público de demandas do cliente (sem login).
 * Cada cliente tem seu link /solicitar/:slug. Ao enviar, o sistema calcula
 * quando conseguimos entregar (lê a fila do editor daquele cliente, no servidor)
 * e mostra a estimativa — com a ressalva de que o time confirma.
 */

// Briefing quebrado em campos separados — antes era um textarea só e a pessoa
// esquecia metade. Cada campo puxa uma parte do que a gente precisa saber.
type GC = { nome: string; cargo: string };
type Entrega = {
  titulo: string; formatos: string[]; duracao: string;
  objetivo: string; referencias: string;
  tem_gc: "" | "sim" | "nao"; gcs: GC[];
  tem_lettering: "" | "sim" | "nao"; lettering: string;
  nao_pode_faltar: string;
};
type Anexo = { nome: string; path: string; url: string };

const FORMATOS = ["16x9", "9x16", "1x1", "4x5", "Outro"];
const gcVazio = (): GC => ({ nome: "", cargo: "" });
const entregaVazia = (): Entrega => ({
  titulo: "", formatos: [], duracao: "",
  objetivo: "", referencias: "",
  tem_gc: "", gcs: [],
  tem_lettering: "", lettering: "",
  nao_pode_faltar: "",
});

// Campos de texto livre — todos OPCIONAIS. O que é obrigatório (título,
// formato, duração, GC e lettering) tem forma própria: ou é escolha, ou é
// pergunta condicional. Ninguém deveria ter que digitar "não tem".
type CampoTexto = { key: "objetivo" | "referencias" | "nao_pode_faltar"; label: string; ph: string; area?: boolean };
const CAMPOS_TOPO: CampoTexto[] = [
  // "Mensagem-chave" era um campo à parte e virava resposta de uma linha. O
  // que ela pegava agora cabe aqui, na descrição — um campo a menos pra
  // preencher e o mesmo tanto de informação.
  { key: "objetivo", label: "Descrição", ph: "O que é o vídeo, pra que serve e a ideia que não pode se perder", area: true },
  { key: "referencias", label: "Referências", ph: "Links, campanhas, algo parecido que curtiu" },
];
const CAMPOS_FIM: CampoTexto[] = [
  { key: "nao_pode_faltar", label: "O que não pode faltar", ph: "Logo, produto, pessoa, frase obrigatória…", area: true },
];
const CAMPOS_TEXTO: CampoTexto[] = [...CAMPOS_TOPO, ...CAMPOS_FIM];

/** GCs que a pessoa realmente preencheu (nome E cargo — meio GC não serve). */
function gcsPreenchidos(e: Entrega): GC[] {
  return (e.gcs || []).filter((g) => g.nome.trim() && g.cargo.trim());
}

/** A linha de GC do briefing — "não vai ter" também é informação útil. */
function linhaGC(e: Entrega): string {
  if (e.tem_gc === "nao") return "GC: não vai ter";
  const lista = (e.gcs || []).filter((g) => g.nome.trim() || g.cargo.trim());
  if (lista.length) {
    return `GC:\n${lista.map((g) => `  • ${g.nome.trim() || "(sem nome)"} — ${g.cargo.trim() || "(sem cargo)"}`).join("\n")}`;
  }
  return e.tem_gc === "sim" ? "GC: sim, mas os nomes/cargos não foram informados" : "";
}

/** Mesma ideia do GC: o "não vai ter" vale tanto quanto o texto. */
function linhaLettering(e: Entrega): string {
  if (e.tem_lettering === "nao") return "Lettering: não vai ter";
  if (e.tem_lettering !== "sim") return "";
  const v = e.lettering.trim();
  return v ? `Lettering: ${v}` : "Lettering: sim, mas os textos não foram informados";
}

/** Formato virou múltipla escolha (o mesmo vídeo costuma sair em 16x9 e 9x16),
 *  mas o resto do sistema lê `formato` como texto — então vai junto. */
function formatoTexto(e: Entrega): string {
  return (e.formatos || []).join(" + ");
}

// Junta os campos num texto só — o downstream (entregável, exibição) lê `briefing`.
function comporBriefing(e: Entrega): string {
  const linhas: string[] = [];
  const add = (c: CampoTexto) => {
    const v = (e[c.key] || "").toString().trim();
    if (v) linhas.push(`${c.label}: ${v}`);
  };
  CAMPOS_TOPO.forEach(add);
  const gc = linhaGC(e);
  if (gc) linhas.push(gc);
  const lt = linhaLettering(e);
  if (lt) linhas.push(lt);
  CAMPOS_FIM.forEach(add);
  return linhas.join("\n");
}
function entregaPreenchida(e: Entrega): boolean {
  return !!(
    e.titulo.trim() ||
    e.duracao.trim() ||
    (e.formatos || []).length ||
    e.tem_gc ||
    e.tem_lettering ||
    e.lettering.trim() ||
    (e.gcs || []).some((g) => g.nome.trim() || g.cargo.trim()) ||
    CAMPOS_TEXTO.some(({ key }) => (e[key] || "").toString().trim())
  );
}

/* ----------------------------------------------------------------- LACUNAS
   O que ficou faltando no briefing. Duas camadas:
   1) a checagem local (campo vazio é campo vazio — funciona sempre, offline);
   2) a leitura da IA, que pega o que é vago sem estar em branco ("um vídeo
      bonito" no objetivo) e devolve a pergunta que resolveria.
   As duas viram a mesma lista no pop-up de confirmação. */
type Falta = { entrega: string; campo: string; pergunta: string; obrigatorio?: boolean };

function rotuloEntrega(e: Entrega, i: number) {
  return e.titulo.trim() || `Vídeo ${i + 1}`;
}

/** O que é obrigatório e ainda não está lá. Isso SEGURA o envio. */
function faltasObrigatorias(entregas: Entrega[]): Falta[] {
  const out: Falta[] = [];
  entregas.forEach((e, i) => {
    const entrega = rotuloEntrega(e, i);
    const falta = (campo: string, pergunta: string) => out.push({ entrega, campo, pergunta, obrigatorio: true });

    if (!e.titulo.trim()) falta("Título", "Como esse vídeo se chama?");
    if (!(e.formatos || []).length) falta("Formato", "Em que formato ele sai? Pode marcar mais de um.");
    if (!e.duracao.trim()) falta("Duração", "Quanto tempo ele precisa ter?");

    if (!e.tem_gc) falta("GC", "Vai ter nome e cargo na tela? Responda sim ou não.");
    else if (e.tem_gc === "sim" && !gcsPreenchidos(e).length)
      falta("GC", "Você marcou que vai ter GC — falta o nome e o cargo de quem aparece.");

    if (!e.tem_lettering) falta("Lettering", "Vai ter texto na tela? Responda sim ou não.");
    else if (e.tem_lettering === "sim" && !e.lettering.trim())
      falta("Lettering", "Você marcou que vai ter lettering — escreva os textos que entram.");
  });
  return out;
}

/** Mesma lacuna vinda das duas camadas não aparece duas vezes. */
function juntarFaltas(...listas: Falta[][]): Falta[] {
  const vistos = new Set<string>();
  const out: Falta[] = [];
  for (const f of listas.flat()) {
    const chave = `${f.entrega}|${f.campo}`.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(f);
  }
  return out;
}

function fmtEarliest(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
/** Só o dia (pro resumo de andamento). Aceita date ('YYYY-MM-DD') ou timestamptz. */
function fmtDia(s: string) {
  const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
/**
 * Etapa do entregável em linguagem de cliente, com uma cor cada.
 *
 * A hierarquia é de propósito: só "aguardando você" usa o laranja da marca,
 * porque é a única etapa em que a bola está com quem está lendo. O resto fica
 * discreto — informa sem gritar.
 */
const ETAPAS: Record<string, { label: string; classe: string }> = {
  na_fila: { label: "na fila", classe: "bg-white/[0.06] text-[#9A968C]" },
  edicao: { label: "em edição", classe: "bg-[#7FA6C9]/[0.12] text-[#7FA6C9]" },
  revisao_interna: { label: "aprovação interna", classe: "bg-[#D9A441]/[0.12] text-[#D9A441]" },
  com_cliente: { label: "aguardando você", classe: "bg-[#E53500]/[0.15] text-[#FF7A4D]" },
};

function etapaDe(etapa: string) {
  return ETAPAS[etapa] || ETAPAS.na_fila;
}

export default function SolicitarDemanda() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState({ nome: "", email: "", projeto: "", prazo: "" });
  const [entregas, setEntregas] = useState<Entrega[]>([entregaVazia()]);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [hp, setHp] = useState(""); // honeypot anti-spam
  // No celular a ilha começa recolhida; no desktop o CSS mostra sempre.
  const [verAndamento, setVerAndamento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modoData, setModoData] = useState<"slots" | "custom">("slots");
  const preSelRef = useRef(false);
  // Pop-up de conferência antes de enviar (+ o que a IA achou faltando).
  const [confirmando, setConfirmando] = useState(false);
  const [ia, setIa] = useState<{ carregando: boolean; faltas: Falta[]; resumo: string }>({
    carregando: false, faltas: [], resumo: "",
  });

  const { data: cfg, isLoading } = useQuery({
    queryKey: ["intake-config", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("intake_config", { _slug: slug });
      if (error) throw error;
      return data as {
        nome: string; ativo: boolean;
        contatos?: { nome: string; email: string }[];
        andamento?: { nome: string; tipo: string; etapa: string; prazo: string | null }[];
        andamento_total?: number;
      } | null;
    },
  });

  // Disponibilidade ao vivo enquanto o cliente escolhe a data/hora (read-only).
  // Agora manda as entregas (com duração) — o prazo escala pela complexidade.
  const prazoIso = form.prazo ? new Date(form.prazo).toISOString() : null;
  const entregasReais = entregas.filter(entregaPreenchida);
  // Se nada foi preenchido ainda, a conferência olha a primeira ficha em branco
  // — é justamente aí que ela tem mais o que apontar.
  const entregasConferir = entregasReais.length ? entregasReais : [entregas[0]];
  const entregasCalc = entregasConferir.map((e) => ({
    titulo: e.titulo, formato: formatoTexto(e), duracao: e.duracao, briefing: comporBriefing(e),
  }));
  const dispoKey = entregasCalc.map((e) => `${e.duracao}|${e.formato}`).join(",");
  const { data: dispo, isFetching: checando } = useQuery({
    queryKey: ["intake-dispo", slug, dispoKey, prazoIso],
    enabled: !!slug && !!prazoIso,
    retry: false,                 // falhou? cai no aviso neutro, não gira pra sempre
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("intake_disponibilidade", {
        _slug: slug,
        _entregas: entregasCalc,
        _prazo: prazoIso,
      });
      if (error) throw error;
      return data as any;
    },
  });
  const inviavel = !!prazoIso && dispo && dispo.no_prazo === false;

  /**
   * Adicional de urgência — regra por DIA CORRIDO, não por hora.
   *
   * Contar hora abriria a porta pro cliente fugir da regra trocando 18h por
   * 19h. Por dia, a única saída é jogar pra depois de amanhã — que é dar um
   * dia de verdade, não um truque. E cabe numa frase que ele confere sozinho.
   *
   * Isto aqui é só o AVISO: quem grava a urgência é o banco, no instante do
   * pedido (trigger em demandas), pra não depender do navegador do cliente.
   */
  const urgDias = Number((cfg as any)?.urgencia_dias ?? 0);
  const urgPct = Number((cfg as any)?.urgencia_percentual ?? 0);
  const urgente = useMemo(() => {
    if (!form.prazo || urgDias <= 0) return false;
    const escolhido = new Date(form.prazo); escolhido.setHours(0, 0, 0, 0);
    const limite = new Date(); limite.setHours(0, 0, 0, 0);
    limite.setDate(limite.getDate() + urgDias);
    return escolhido <= limite;
  }, [form.prazo, urgDias]);
  const usarSugerido = () => {
    if (!dispo?.earliest) return;
    setForm((f) => ({ ...f, prazo: toLocalInput(dispo.earliest) }));
  };

  // Horários sugeridos (nudge): 3 slots prontos, o recomendado em destaque.
  const { data: sugestoes } = useQuery({
    queryKey: ["intake-sugestoes", slug, dispoKey],
    enabled: !!slug,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("intake_sugestoes", { _slug: slug, _entregas: entregasCalc });
      if (error) throw error;
      return data as { slots: any[]; sem_editor: boolean } | null;
    },
  });
  const slots: any[] = Array.isArray(sugestoes?.slots) ? sugestoes!.slots : [];
  const escolherSlot = (s: any) => setForm((f) => ({ ...f, prazo: toLocalInput(s.data) }));

  // Pré-seleciona o recomendado uma vez (efeito de default do nudge).
  useEffect(() => {
    if (modoData !== "slots" || form.prazo || preSelRef.current || slots.length === 0) return;
    const rec = slots.find((s) => s.recomendado) || slots[0];
    if (rec?.data) {
      preSelRef.current = true;
      setForm((f) => ({ ...f, prazo: toLocalInput(rec.data) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, modoData]);

  const setEntrega = (i: number, patch: Partial<Entrega>) =>
    setEntregas((arr) => arr.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const addEntrega = () => setEntregas((a) => [...a, entregaVazia()]);
  const removeEntrega = (i: number) => setEntregas((a) => (a.length > 1 ? a.filter((_, idx) => idx !== i) : a));

  const mexerGCs = (i: number, fn: (gcs: GC[]) => GC[]) =>
    setEntregas((arr) => arr.map((e, idx) => (idx === i ? { ...e, gcs: fn(e.gcs || []) } : e)));
  // Marcar "sim" já abre a primeira linha — senão a pessoa clica em sim e não
  // aparece nada pra preencher.
  const responderGC = (i: number, v: "sim" | "nao") =>
    setEntregas((arr) =>
      arr.map((e, idx) =>
        idx === i ? { ...e, tem_gc: v, gcs: v === "sim" ? (e.gcs?.length ? e.gcs : [gcVazio()]) : [] } : e,
      ),
    );

  // "Não" limpa o texto — senão fica um lettering fantasma no briefing.
  const responderLettering = (i: number, v: "sim" | "nao") =>
    setEntrega(i, v === "nao" ? { tem_lettering: v, lettering: "" } : { tem_lettering: v });

  const alternarFormato = (i: number, f: string) =>
    setEntregas((arr) =>
      arr.map((e, idx) =>
        idx === i
          ? { ...e, formatos: e.formatos.includes(f) ? e.formatos.filter((x) => x !== f) : [...e.formatos, f] }
          : e,
      ),
    );

  const campoLivre = (i: number, e: Entrega, c: CampoTexto) => (
    <div key={c.key}>
      <span className={campoLabel}>{c.label}</span>
      {c.area ? (
        <textarea
          className={`${inputSm} min-h-[52px] w-full py-1.5`}
          value={e[c.key]}
          onChange={(ev) => setEntrega(i, { [c.key]: ev.target.value })}
          placeholder={c.ph}
        />
      ) : (
        <input
          className={`${inputSm} w-full`}
          value={e[c.key]}
          onChange={(ev) => setEntrega(i, { [c.key]: ev.target.value })}
          placeholder={c.ph}
        />
      )}
    </div>
  );

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    setArquivos((a) => [...a, ...Array.from(files)]);
  };

  /**
   * Abre a conferência final. A IA lê o briefing junto, mas nunca trava o
   * envio: se a função não responder (não publicada, sem chave, lenta demais),
   * o pop-up abre do mesmo jeito com a checagem local.
   */
  const conferir = async () => {
    if (!form.nome.trim() || !form.email.trim() || !form.projeto.trim()) {
      setErro("Preencha seu nome, e-mail e o nome do projeto.");
      return;
    }
    setErro(null);
    setConfirmando(true);
    // Faltando obrigatório, não tem por que gastar a IA: o pop-up já abre
    // dizendo o que completar.
    if (faltasObrigatorias(entregasConferir).length) {
      setIa({ carregando: false, faltas: [], resumo: "" });
      return;
    }
    setIa({ carregando: true, faltas: [], resumo: "" });
    try {
      const chamada = supabase.functions.invoke("intake-revisao", {
        body: {
          slug,
          projeto: form.projeto.trim(),
          entregas: entregasConferir.map((e, i) => ({
            titulo: rotuloEntrega(e, i), formato: formatoTexto(e), duracao: e.duracao, briefing: comporBriefing(e),
          })),
        },
      });
      const limite = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000));
      const { data, error } = (await Promise.race([chamada, limite])) as any;
      if (error) throw error;
      const faltas: Falta[] = (Array.isArray(data?.faltas) ? data.faltas : [])
        .slice(0, 8)
        .map((f: any) => ({
          entrega: String(f?.entrega ?? "").slice(0, 80),
          campo: String(f?.campo ?? "").slice(0, 40),
          pergunta: String(f?.pergunta ?? "").slice(0, 240),
        }))
        .filter((f: Falta) => f.pergunta);
      setIa({ carregando: false, faltas, resumo: String(data?.resumo ?? "") });
    } catch {
      setIa({ carregando: false, faltas: [], resumo: "" });
    }
  };

  const enviar = useMutation({
    mutationFn: async () => {
      if (hp) return { ok: true }; // bot preencheu o honeypot — ignora silenciosamente
      if (!form.nome.trim() || !form.email.trim() || !form.projeto.trim()) {
        throw new Error("Preencha seu nome, e-mail e o nome do projeto.");
      }
      if (inviavel) {
        throw new Error("Escolha um horário com disponibilidade (use o horário sugerido).");
      }
      // 1) sobe os anexos pro bucket
      const anexos: Anexo[] = [];
      for (const file of arquivos) {
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${slug}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage.from("demandas").upload(path, file);
        if (upErr) throw new Error(`Falha ao subir "${file.name}": ${upErr.message}`);
        const { data: pub } = supabase.storage.from("demandas").getPublicUrl(path);
        anexos.push({ nome: file.name, path, url: pub.publicUrl });
      }
      // 2) envia a demanda + recebe a viabilidade
      const { data, error } = await (supabase as any).rpc("intake_submit", {
        _slug: slug,
        _nome: form.nome.trim(),
        _email: form.email.trim(),
        _projeto: form.projeto.trim(),
        // manda os campos separados + o briefing composto (o downstream lê `briefing`)
        // `formato` texto pro resto do sistema (entregável, faturamento) e
        // `formatos` array pra não perder a informação de múltipla escolha.
        _entregas: entregas
          .filter(entregaPreenchida)
          .map((e) => ({ ...e, formato: formatoTexto(e), briefing: comporBriefing(e) })),
        _prazo: form.prazo ? new Date(form.prazo).toISOString() : null,
        _anexos: anexos,
      });
      if (error) throw error;
      return data;
    },
    onMutate: () => { setEnviando(true); setErro(null); },
    onSuccess: (data) => { setEnviando(false); setConfirmando(false); setResultado(data); },
    onError: (e: any) => {
      setEnviando(false);
      setConfirmando(false); // fecha o pop-up pra pessoa ver o erro no formulário
      setErro(/intake_submit|does not exist|function/i.test(e.message || "")
        ? "O formulário ainda não está disponível. Fale com a Adverse."
        : e.message);
    },
  });

  if (isLoading) {
    return <Center><Loader2 className="h-8 w-8 animate-spin text-[#E53500]" /></Center>;
  }
  if (!cfg) {
    return (
      <Center>
        <div className="text-center">
          <p className="text-lg font-bold text-[#E8E1D0]">Formulário indisponível</p>
          <p className="mt-1 text-sm text-[#9A968C]">O link pode estar incorreto ou desativado. Fale com a Adverse.</p>
        </div>
      </Center>
    );
  }

  if (resultado) {
    return <Sucesso nome={form.nome} resultado={resultado} clienteNome={cfg.nome} />;
  }

  // Quantas peças dependem do cliente — é o número que importa no resumo
  // recolhido do celular. Vêm sempre no topo da lista, então não escapam do teto.
  const aguardandoCliente = (cfg.andamento || []).filter((a) => a.etapa === "com_cliente").length;

  return (
    <div className="min-h-screen bg-[#0f0f10] text-[#E8E1D0]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-2xl px-5 py-10 lg:max-w-5xl">
        <header className="mb-8">
          <LogoAdverse className="h-5 text-[#E8E1D0]" />
          <h1 className="mt-4 text-2xl font-bold">Solicitar demanda</h1>
          <p className="text-sm text-[#9A968C]">{cfg.nome} · conte o que você precisa e a gente já estima o prazo.</p>
        </header>

        {/* Duas colunas no desktop; no celular volta a empilhar.
            Uso col-start/row-start em vez de ordem no DOM: assim a ilha vem
            ANTES do formulário no celular (é lembrete, tem que ser vista
            antes de pedir) e mesmo assim fica à direita no desktop. */}
        <div className="lg:grid lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-8">

        {/* Ilha do que já está rolando — pra não abrir demanda repetida.
            No desktop acompanha a rolagem; no celular fica recolhida pra não
            empurrar o formulário pra fora da tela. */}
        {Array.isArray(cfg.andamento) && cfg.andamento.length > 0 && (
          <aside className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 lg:sticky lg:top-10 lg:col-start-2 lg:row-start-1 lg:mb-0">
            {/* O resumo fica DENTRO do botão: no celular é nele que o dedo
                vai, não no título. Fora dele, "ver todas" não abria nada. */}
            <button
              type="button"
              onClick={() => setVerAndamento((v) => !v)}
              className="w-full text-left lg:cursor-default"
            >
              <span className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9A968C]">
                  Já em andamento com a gente
                </span>
                <ChevronDown
                  className={`ml-auto h-4 w-4 shrink-0 text-[#6b675f] transition-transform lg:hidden ${verAndamento ? "rotate-180" : ""}`}
                />
              </span>
              {/* Recolhido, o resumo já entrega o que importa: quanto tem e
                  quanto depende do cliente. */}
              {!verAndamento && (
                <span className="mt-1 block text-[11px] text-[#6b675f] lg:hidden">
                  {cfg.andamento_total ?? cfg.andamento.length} peças
                  {aguardandoCliente > 0 && ` · ${aguardandoCliente} aguardando você`}
                  {" · ver todas"}
                </span>
              )}
            </button>

            <div
              className={`mt-2.5 space-y-2 lg:block lg:max-h-[70vh] lg:overflow-y-auto ${verAndamento ? "" : "hidden"}`}
            >
              {cfg.andamento.map((a, i) => {
                const et = etapaDe(a.etapa);
                return (
                  <div key={i} className="text-sm">
                    {/* Na coluna estreita o truncate comia o nome inteiro
                        depois do código — 2 linhas resolvem sem virar parede. */}
                    <span className="block break-words leading-snug text-[#E8E1D0] line-clamp-2" title={a.nome}>
                      {a.nome}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${et.classe}`}>
                        {et.label}
                      </span>
                      {a.prazo && <span className="text-[11px] text-[#6b675f]">{fmtDia(a.prazo)}</span>}
                    </div>
                  </div>
                );
              })}
              {/* A lista tem teto no banco; sem isso, some peça sem avisar. */}
              {typeof cfg.andamento_total === "number" && cfg.andamento_total > cfg.andamento.length && (
                <p className="pt-1 text-[11px] text-[#6b675f]">
                  + {cfg.andamento_total - cfg.andamento.length} outras peças
                </p>
              )}
            </div>
          </aside>
        )}

        <div className="space-y-5 lg:col-start-1 lg:row-start-1">
          {/* Contatos pré-definidos: um clique preenche nome + e-mail */}
          {Array.isArray(cfg.contatos) && cfg.contatos.length > 0 && (
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#9A968C]">Quem está pedindo?</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {cfg.contatos.map((ct, i) => {
                  const ativo = form.nome === ct.nome && form.email === ct.email;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, nome: ct.nome, email: ct.email }))}
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${ativo ? "border-[#E53500] bg-[#E53500]/10 text-[#E8E1D0]" : "border-white/12 bg-white/[0.03] text-[#CFC9BC] hover:border-white/30"}`}
                    >
                      {ct.nome}
                    </button>
                  );
                })}
                <span className="self-center text-[11px] text-[#6b675f]">ou preencha abaixo</span>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Seu nome *"><input className={inputCls} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" /></Campo>
            <Campo label="Seu e-mail *"><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="voce@empresa.com" /></Campo>
          </div>
          <Campo label="Nome do projeto *"><input className={inputCls} value={form.projeto} onChange={(e) => setForm({ ...form, projeto: e.target.value })} placeholder="Ex.: Campanha institucional julho" /></Campo>

          {/* Entregas */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#9A968C]">Entregas (cada vídeo separado)</span>
              <button onClick={addEntrega} className="flex items-center gap-1 text-xs text-[#E53500] hover:underline"><Plus className="h-3.5 w-3.5" /> Adicionar vídeo</button>
            </div>
            <div className="space-y-3">
              {entregas.map((e, i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#9A968C]">Vídeo {i + 1}</span>
                    {entregas.length > 1 && (
                      <button onClick={() => removeEntrega(i)} className="text-[#9A968C] hover:text-[#E53500]"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px]">
                    <div>
                      <span className={campoLabel}>Título *</span>
                      <input className={`${inputSm} w-full`} value={e.titulo} onChange={(ev) => setEntrega(i, { titulo: ev.target.value })} placeholder="Nome do vídeo" />
                    </div>
                    <div>
                      <span className={campoLabel}>Duração *</span>
                      <input className={`${inputSm} w-full`} value={e.duracao} onChange={(ev) => setEntrega(i, { duracao: ev.target.value })} placeholder='ex.: 30" / 3min' />
                    </div>
                  </div>
                  {/* Formato virou múltipla escolha: o mesmo vídeo costuma sair
                      em 16x9 pro YouTube e 9x16 pro story, e cada versão é
                      trabalho — precisa aparecer no pedido, não na surpresa. */}
                  <div className="mt-2">
                    <span className={campoLabel}>Formato * (pode marcar mais de um)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {FORMATOS.map((f) => (
                        <button key={f} type="button" onClick={() => alternarFormato(i, f)} className={chipCls(e.formatos.includes(f))}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                    {CAMPOS_TOPO.map((c) => campoLivre(i, e, c))}

                    {/* GC condicional. Antes era um campo de texto junto do
                        lettering: chegava "GC do João" e só na edição a gente
                        descobria que faltava o cargo. Agora ou é "não vai ter",
                        ou é nome + cargo de cada pessoa que aparece. */}
                    <div className="rounded-md border border-white/10 bg-white/[0.02] p-2.5">
                      <span className={campoLabel}>Vai ter GC? (nome e cargo na tela) *</span>
                      <div className="flex gap-2">
                        {(["sim", "nao"] as const).map((v) => (
                          <button key={v} type="button" onClick={() => responderGC(i, v)} className={chipCls(e.tem_gc === v)}>
                            {v === "sim" ? "Sim" : "Não"}
                          </button>
                        ))}
                      </div>
                      {e.tem_gc === "sim" && (
                        <div className="mt-2 space-y-1.5">
                          {(e.gcs || []).map((g, gi) => (
                            <div key={gi} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5">
                              <input
                                className={inputSm}
                                value={g.nome}
                                onChange={(ev) => mexerGCs(i, (gs) => gs.map((x, j) => (j === gi ? { ...x, nome: ev.target.value } : x)))}
                                placeholder="Nome na tela"
                              />
                              <input
                                className={inputSm}
                                value={g.cargo}
                                onChange={(ev) => mexerGCs(i, (gs) => gs.map((x, j) => (j === gi ? { ...x, cargo: ev.target.value } : x)))}
                                placeholder="Cargo / função"
                              />
                              <button
                                type="button"
                                aria-label="Remover GC"
                                onClick={() => mexerGCs(i, (gs) => gs.filter((_, j) => j !== gi))}
                                className="px-1 text-[#9A968C] hover:text-[#E53500]"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => mexerGCs(i, (gs) => [...gs, gcVazio()])}
                            className="flex items-center gap-1 text-xs text-[#E53500] hover:underline"
                          >
                            <Plus className="h-3 w-3" /> Adicionar GC
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Lettering na mesma forma do GC: pergunta obrigatória, e o
                        campo de texto só abre no "sim". Assim ninguém precisa
                        escrever "não tem" pra conseguir enviar. */}
                    <div className="rounded-md border border-white/10 bg-white/[0.02] p-2.5">
                      <span className={campoLabel}>Vai ter lettering? (texto na tela) *</span>
                      <div className="flex gap-2">
                        {(["sim", "nao"] as const).map((v) => (
                          <button key={v} type="button" onClick={() => responderLettering(i, v)} className={chipCls(e.tem_lettering === v)}>
                            {v === "sim" ? "Sim" : "Não"}
                          </button>
                        ))}
                      </div>
                      {e.tem_lettering === "sim" && (
                        <textarea
                          className={`${inputSm} mt-2 min-h-[52px] w-full py-1.5`}
                          value={e.lettering}
                          onChange={(ev) => setEntrega(i, { lettering: ev.target.value })}
                          placeholder="Escreva os textos que entram na tela (frases, legendas, créditos)"
                        />
                      )}
                    </div>

                    {CAMPOS_FIM.map((c) => campoLivre(i, e, c))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prazo — horários sugeridos (recomendado em destaque) */}
          <Campo label="Quando você precisa da entrega?">
            {modoData === "slots" && slots.length > 0 ? (
              <>
                <div className="grid gap-2 sm:grid-cols-3">
                  {slots.map((s) => {
                    const sel = form.prazo === toLocalInput(s.data);
                    return (
                      <button
                        key={s.nivel}
                        type="button"
                        onClick={() => escolherSlot(s)}
                        className={`relative rounded-lg border p-3 text-left transition ${
                          sel
                            ? "border-[#E53500] bg-[#E53500]/10"
                            : s.recomendado
                            ? "border-[#E53500]/40 bg-[#E53500]/[0.05] hover:border-[#E53500]/70"
                            : "border-white/12 bg-white/[0.03] hover:border-white/30"
                        }`}
                      >
                        {s.recomendado && (
                          <span className="absolute -top-2 left-3 rounded-full bg-[#E53500] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                            Recomendado
                          </span>
                        )}
                        {sel && <CheckCircle2 className="absolute right-2 top-2 h-4 w-4 text-[#E53500]" />}
                        <p className="text-[10px] uppercase tracking-wider text-[#9A968C]">{s.label}</p>
                        <p className="mt-0.5 text-sm font-semibold capitalize text-[#E8E1D0]">{fmtSlot(s.data)}</p>
                        <p className="mt-0.5 text-[11px] leading-tight text-[#9A968C]">{s.hint}</p>
                      </button>
                    );
                  })}
                </div>
                {urgente && (
                  <div className="mt-3 rounded-md border border-[#E53500]/50 bg-[#E53500]/10 px-3 py-2.5 text-xs text-[#ffb4a0]">
                    <strong className="text-white">Entrega em regime de urgência · +{urgPct.toFixed(0)}%</strong>
                    <p className="mt-1 leading-relaxed">
                      Entregas pedidas para hoje ou amanhã entram na frente da fila e têm adicional
                      de {urgPct.toFixed(0)}% sobre as horas deste projeto. Escolhendo uma data a
                      partir de depois de amanhã, o adicional não se aplica.
                    </p>
                  </div>
                )}
                <p className="mt-2 text-[11px] text-[#6b675f]">
                  Mais tempo = mais capricho e espaço pra alteração. Nosso time confirma.
                  {/* Sem editor fixo, a fila usada é a do time inteiro rateada — boa o
                      bastante pra não prometer o impossível, mas não é a fila de uma
                      pessoa. Dizer isso é melhor que uma data com cara de precisa. */}
                  {sugestoes?.sem_editor ? " Este cliente ainda não tem editor fixo, então a data é estimada pela fila geral." : ""}
                </p>
                <button
                  type="button"
                  onClick={() => setModoData("custom")}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] py-2.5 text-sm font-medium text-[#CFC9BC] transition hover:border-[#E53500]/50 hover:text-[#E8E1D0]"
                >
                  <CalendarClock className="h-4 w-4" /> Preciso de outra data
                </button>
              </>
            ) : (
              <>
                {/* Data + horário comercial (nada de "prazo às 3h"). O form.prazo
                    fica "YYYY-MM-DDTHH:MM" — o resto do fluxo (disponibilidade,
                    envio) continua igual. */}
                <div className="flex gap-2">
                  <input
                    type="date"
                    className={`${inputCls} flex-1`}
                    value={form.prazo.slice(0, 10)}
                    onChange={(e) => {
                      const hora = form.prazo.slice(11) || "12:00";
                      setForm({ ...form, prazo: e.target.value ? `${e.target.value}T${hora}` : "" });
                    }}
                  />
                  <select
                    className={`${inputCls} w-32`}
                    value={form.prazo.slice(11) || ""}
                    disabled={!form.prazo.slice(0, 10)}
                    onChange={(e) => setForm({ ...form, prazo: `${form.prazo.slice(0, 10)}T${e.target.value}` })}
                  >
                    <option value="">Horário</option>
                    {HORARIOS_COMERCIAIS.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                {slots.length > 0 && (
                  <button type="button" onClick={() => setModoData("slots")} className="mt-1 text-[11px] text-[#E53500] underline hover:opacity-80">
                    Ver horários sugeridos
                  </button>
                )}
                {!prazoIso ? (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-[#9A968C]"><CalendarClock className="h-3 w-3" /> A gente checa na hora se temos disponibilidade pra esse prazo.</p>
                ) : checando ? (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-[#9A968C]"><Loader2 className="h-3 w-3 animate-spin" /> Checando disponibilidade…</p>
                ) : dispo && dispo.no_prazo ? (
                  <p className="mt-1 flex items-center gap-1.5 rounded-md border border-[#10b981]/30 bg-[#10b981]/5 px-2.5 py-1.5 text-xs text-[#8fe7c4]">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Temos disponibilidade pra esse prazo. <span className="text-[#6b675f]">(nosso time confirma)</span>
                  </p>
                ) : inviavel ? (
                  <div className="mt-1 rounded-md border border-[#f59e0b]/40 bg-[#f59e0b]/5 px-2.5 py-2 text-xs">
                    <p className="flex items-center gap-1.5 text-[#f5c37a]"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Nesse horário não conseguimos entregar com qualidade.</p>
                    {dispo?.earliest && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-[#9A968C]">Data mais próxima: <strong className="capitalize text-[#E8E1D0]">{fmtEarliest(dispo.earliest)}</strong></span>
                        <button onClick={usarSugerido} className="rounded border border-[#E53500]/50 px-2 py-0.5 text-[11px] font-medium text-[#E53500] hover:bg-[#E53500]/10">Usar esse horário</button>
                      </div>
                    )}
                  </div>
                ) : null}
                {dispo?.calibrado && !checando && (
                  <p className="mt-1 text-[10px] text-[#6b675f]">Prazo já ajustado ao histórico dos seus projetos com a gente.</p>
                )}
              </>
            )}
          </Campo>

          {/* Anexos */}
          <Campo label="Anexos (roteiro, referências, material bruto…)">
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-white/20 bg-white/[0.03] px-3 py-2.5 text-sm text-[#9A968C] hover:border-[#E53500]/50">
              <Paperclip className="h-4 w-4" /> Escolher arquivos
              <input type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </label>
            {arquivos.length > 0 && (
              <div className="mt-2 space-y-1">
                {arquivos.map((f, i) => (
                  <div key={i} className="flex items-center justify-between rounded bg-white/[0.04] px-2 py-1 text-xs">
                    <span className="truncate text-[#CFC9BC]">{f.name}</span>
                    <button onClick={() => setArquivos((a) => a.filter((_, idx) => idx !== i))} className="text-[#9A968C] hover:text-[#E53500]"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </Campo>

          {/* honeypot escondido */}
          <input value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

          {erro && <p className="rounded-md border border-[#E53500]/40 bg-[#E53500]/10 px-3 py-2 text-sm text-[#ffb4a1]">{erro}</p>}

          <button
            onClick={conferir}
            disabled={enviando || inviavel}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#E53500] text-sm font-semibold text-white transition hover:bg-[#E53500]/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {inviavel ? "Ajuste o prazo pra enviar" : "Enviar demanda"}
          </button>
          <p className="text-center text-[11px] text-[#6b675f]">
            {inviavel
              ? "Esse prazo está sem disponibilidade — escolha o horário sugerido acima pra enviar."
              : "Ao enviar, você recebe uma estimativa de prazo. Nosso time confirma com você em seguida."}
          </p>
        </div>

        </div>

        <RodapeConfidencial tema="escuro" />
      </div>

      {confirmando && (
        <ModalConferencia
          carregando={ia.carregando}
          faltas={juntarFaltas(faltasObrigatorias(entregasConferir), ia.faltas)}
          resumo={ia.resumo}
          enviando={enviando}
          onVoltar={() => setConfirmando(false)}
          onEnviar={() => enviar.mutate()}
        />
      )}
    </div>
  );
}

/**
 * Pop-up de conferência: a última chance de completar o briefing antes que a
 * falta vire alteração — e alteração fora do combinado vira custo.
 *
 * Dois pesos. O que é obrigatório (título, formato, duração, GC, lettering)
 * SEGURA o envio — sem isso o entregável não existe direito. O resto é
 * sugestão da IA: mostra, avisa do custo, mas deixa enviar.
 */
function ModalConferencia({
  carregando, faltas, resumo, enviando, onVoltar, onEnviar,
}: {
  carregando: boolean;
  faltas: Falta[];
  resumo: string;
  enviando: boolean;
  onVoltar: () => void;
  onEnviar: () => void;
}) {
  const obrigatorias = faltas.filter((f) => f.obrigatorio);
  const sugestoes = faltas.filter((f) => !f.obrigatorio);
  const travado = obrigatorias.length > 0;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/12 bg-[#141416] p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${faltas.length ? "bg-[#f59e0b]/15" : "bg-[#10b981]/15"}`}>
            {faltas.length ? <AlertTriangle className="h-4 w-4 text-[#f59e0b]" /> : <CheckCircle2 className="h-4 w-4 text-[#10b981]" />}
          </div>
          <div>
            <h2 className="text-base font-bold text-[#E8E1D0]">
              {travado ? "Falta preencher pra enviar" : "Antes de enviar: está tudo aí?"}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[#9A968C]">
              O que faltar agora costuma voltar depois como alteração — e alteração fora do que
              foi briefado pode entrar como custo extra.
            </p>
          </div>
        </div>

        {travado && (
          <div className="mt-4 rounded-lg border border-[#E53500]/35 bg-[#E53500]/[0.07] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#ff9a7d]">
              Obrigatório · {obrigatorias.length === 1 ? "1 item" : `${obrigatorias.length} itens`}
            </p>
            <ul className="mt-2 space-y-2">
              {obrigatorias.map((f, i) => (
                <li key={i} className="text-xs leading-snug">
                  <span className="text-[#ff9a7d]">{f.entrega} · {f.campo}</span>
                  <span className="mt-0.5 block text-[#CFC9BC]">{f.pergunta}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!travado && (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            {carregando ? (
              <p className="flex items-center gap-2 text-xs text-[#9A968C]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo seu briefing…
              </p>
            ) : sugestoes.length ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9A968C]">
                  {sugestoes.length === 1 ? "1 ponto pra conferir" : `${sugestoes.length} pontos pra conferir`}
                </p>
                <ul className="mt-2 space-y-2">
                  {sugestoes.map((f, i) => (
                    <li key={i} className="text-xs leading-snug">
                      <span className="text-[#f5c37a]">{f.entrega}{f.campo ? ` · ${f.campo}` : ""}</span>
                      <span className="mt-0.5 block text-[#CFC9BC]">{f.pergunta}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-xs text-[#8fe7c4]">Não achamos nada faltando. Pode mandar.</p>
            )}
            {!carregando && resumo && <p className="mt-3 border-t border-white/10 pt-2 text-[11px] leading-snug text-[#6b675f]">{resumo}</p>}
          </div>
        )}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onVoltar}
            disabled={enviando}
            className={`h-10 flex-1 rounded-md text-sm font-medium transition disabled:opacity-40 ${
              travado
                ? "bg-[#E53500] font-semibold text-white hover:bg-[#E53500]/90"
                : "border border-white/15 bg-white/[0.03] text-[#CFC9BC] hover:border-white/30"
            }`}
          >
            Voltar e completar
          </button>
          {!travado && (
            <button
              type="button"
              onClick={onEnviar}
              disabled={enviando || carregando}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-[#E53500] text-sm font-semibold text-white transition hover:bg-[#E53500]/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {sugestoes.length ? "Enviar assim mesmo" : "Enviar demanda"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Sucesso({ nome, resultado, clienteNome }: { nome: string; resultado: any; clienteNome: string }) {
  const earliest = resultado?.earliest ? new Date(resultado.earliest) : null;
  const noPrazo = resultado?.no_prazo;
  const earliestFmt = earliest
    ? earliest.toLocaleString("pt-BR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <Center>
      <div className="max-w-md text-center" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#10b981]/15">
          <CheckCircle2 className="h-8 w-8 text-[#10b981]" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-[#E8E1D0]">Demanda enviada!</h1>
        <p className="mt-1 text-sm text-[#9A968C]">Obrigado{nome ? `, ${nome.split(" ")[0]}` : ""}. Recebemos sua solicitação pra {clienteNome}.</p>

        {earliestFmt && (
          <div className={`mt-5 rounded-xl border p-4 text-left ${noPrazo ? "border-[#10b981]/30 bg-[#10b981]/5" : "border-[#f59e0b]/30 bg-[#f59e0b]/5"}`}>
            <p className="text-[11px] uppercase tracking-wider text-[#9A968C]">Estimativa de entrega</p>
            <p className="mt-1 text-base font-semibold capitalize text-[#E8E1D0]">{earliestFmt}</p>
            <p className="mt-1 text-xs text-[#9A968C]">
              {noPrazo ? "Dá pra encaixar no prazo que você pediu. " : "No prazo que você pediu fica apertado — essa é a data mais próxima que conseguimos. "}
              <strong className="text-[#CFC9BC]">Nosso time confirma com você em seguida.</strong>
            </p>
          </div>
        )}
        <p className="mt-5 text-xs text-[#6b675f]">Pode fechar esta página.</p>
      </div>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-[#0f0f10] px-6">{children}</div>;
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-[#9A968C]">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
const inputCls = "h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm text-[#E8E1D0] placeholder:text-[#6b675f] focus:border-[#E53500]/50 focus:outline-none";
const inputSm = "h-9 rounded-md border border-white/15 bg-white/5 px-2.5 text-sm text-[#E8E1D0] placeholder:text-[#6b675f] focus:border-[#E53500]/50 focus:outline-none";
const campoLabel = "mb-0.5 block text-[10px] uppercase tracking-wider text-[#6b675f]";
/** Botão-pílula de escolha (formato, sim/não). Ligado = laranja da marca. */
const chipCls = (ativo: boolean) =>
  `rounded-full border px-3 py-1 text-xs transition ${
    ativo
      ? "border-[#E53500] bg-[#E53500]/10 text-[#E8E1D0]"
      : "border-white/12 bg-white/[0.03] text-[#9A968C] hover:border-white/30"
  }`;
