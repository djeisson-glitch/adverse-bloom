import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Trash2, Paperclip, X, CheckCircle2, CalendarClock, AlertTriangle } from "lucide-react";

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
type Entrega = {
  titulo: string; formato: string; duracao: string;
  objetivo: string; mensagem: string; referencias: string; gc: string; nao_pode_faltar: string;
};
type Anexo = { nome: string; path: string; url: string };

const FORMATOS = ["16x9", "9x16", "1x1", "4x5", "Outro"];
const entregaVazia = (): Entrega => ({
  titulo: "", formato: "16x9", duracao: "",
  objetivo: "", mensagem: "", referencias: "", gc: "", nao_pode_faltar: "",
});

// Campos do briefing separado, na ordem em que aparecem.
const CAMPOS_BRIEFING: { key: keyof Entrega; label: string; ph: string; area?: boolean }[] = [
  { key: "objetivo", label: "Objetivo do vídeo", ph: "O que ele precisa provocar / pra que serve", area: true },
  { key: "mensagem", label: "Mensagem-chave", ph: "A ideia que não pode se perder" },
  { key: "referencias", label: "Referências", ph: "Links, campanhas, algo parecido que curtiu" },
  { key: "gc", label: "GC / Letterings", ph: "Textos na tela, legendas, créditos" },
  { key: "nao_pode_faltar", label: "O que não pode faltar", ph: "Logo, produto, pessoa, frase obrigatória…", area: true },
];

// Junta os campos num texto só — o downstream (entregável, exibição) lê `briefing`.
function comporBriefing(e: Entrega): string {
  return CAMPOS_BRIEFING
    .map(({ key, label }) => { const v = (e[key] || "").toString().trim(); return v ? `${label}: ${v}` : ""; })
    .filter(Boolean)
    .join("\n");
}
function entregaPreenchida(e: Entrega): boolean {
  return !!(e.titulo.trim() || CAMPOS_BRIEFING.some(({ key }) => (e[key] || "").toString().trim()));
}

function fmtEarliest(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
/** Só o dia (pro resumo de andamento). Aceita date ('YYYY-MM-DD') ou timestamptz. */
function fmtDia(s: string) {
  const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
/** Status técnico do projeto → rótulo que o cliente entende. */
function labelEtapa(etapa: string): string {
  const e = (etapa || "").toLowerCase();
  if (e === "na fila") return "na fila";
  if (e.includes("briefing")) return "briefing";
  if (e.includes("pré") || e.includes("pre")) return "pré-produção";
  if (e.includes("produ")) return "em produção";
  if (e.includes("revis")) return "em revisão";
  if (e.includes("entreg")) return "entregue";
  return etapa || "em andamento";
}

export default function SolicitarDemanda() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState({ nome: "", email: "", projeto: "", prazo: "" });
  const [entregas, setEntregas] = useState<Entrega[]>([entregaVazia()]);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [hp, setHp] = useState(""); // honeypot anti-spam
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modoData, setModoData] = useState<"slots" | "custom">("slots");
  const preSelRef = useRef(false);

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
      } | null;
    },
  });

  // Disponibilidade ao vivo enquanto o cliente escolhe a data/hora (read-only).
  // Agora manda as entregas (com duração) — o prazo escala pela complexidade.
  const prazoIso = form.prazo ? new Date(form.prazo).toISOString() : null;
  const entregasReais = entregas.filter(entregaPreenchida);
  const entregasCalc = (entregasReais.length ? entregasReais : [entregas[0]]).map((e) => ({
    titulo: e.titulo, formato: e.formato, duracao: e.duracao, briefing: comporBriefing(e),
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

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    setArquivos((a) => [...a, ...Array.from(files)]);
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
        _entregas: entregas.filter(entregaPreenchida).map((e) => ({ ...e, briefing: comporBriefing(e) })),
        _prazo: form.prazo ? new Date(form.prazo).toISOString() : null,
        _anexos: anexos,
      });
      if (error) throw error;
      return data;
    },
    onMutate: () => { setEnviando(true); setErro(null); },
    onSuccess: (data) => { setEnviando(false); setResultado(data); },
    onError: (e: any) => {
      setEnviando(false);
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

  return (
    <div className="min-h-screen bg-[#0f0f10] text-[#E8E1D0]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-2xl px-5 py-10">
        <header className="mb-8">
          <span className="text-lg font-extrabold tracking-tight">adverse.rec <span className="text-[#E53500]">//</span></span>
          <h1 className="mt-4 text-2xl font-bold">Solicitar demanda</h1>
          <p className="text-sm text-[#9A968C]">{cfg.nome} · conte o que você precisa e a gente já estima o prazo.</p>
        </header>

        {/* Resumo do que já está rolando — pra não abrir demanda repetida */}
        {Array.isArray(cfg.andamento) && cfg.andamento.length > 0 && (
          <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9A968C]">Já em andamento com a gente</p>
            <div className="mt-2.5 space-y-1.5">
              {cfg.andamento.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate text-[#E8E1D0]">{a.nome}</span>
                  <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#9A968C]">{labelEtapa(a.etapa)}</span>
                  {a.prazo && <span className="hidden shrink-0 text-[11px] text-[#6b675f] sm:inline">{fmtDia(a.prazo)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-5">
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
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_120px_130px]">
                    <div>
                      <span className={campoLabel}>Título</span>
                      <input className={`${inputSm} w-full`} value={e.titulo} onChange={(ev) => setEntrega(i, { titulo: ev.target.value })} placeholder="Nome do vídeo" />
                    </div>
                    <div>
                      <span className={campoLabel}>Formato</span>
                      <select className={`${inputSm} w-full`} value={e.formato} onChange={(ev) => setEntrega(i, { formato: ev.target.value })}>
                        {FORMATOS.map((f) => <option key={f} value={f} className="bg-[#17171a]">{f}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className={campoLabel}>Duração</span>
                      <input className={`${inputSm} w-full`} value={e.duracao} onChange={(ev) => setEntrega(i, { duracao: ev.target.value })} placeholder='ex.: 30" / 3min' />
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                    {CAMPOS_BRIEFING.map(({ key, label, ph, area }) => (
                      <div key={key}>
                        <span className={campoLabel}>{label}</span>
                        {area ? (
                          <textarea className={`${inputSm} min-h-[52px] w-full py-1.5`} value={e[key] as string} onChange={(ev) => setEntrega(i, { [key]: ev.target.value })} placeholder={ph} />
                        ) : (
                          <input className={`${inputSm} w-full`} value={e[key] as string} onChange={(ev) => setEntrega(i, { [key]: ev.target.value })} placeholder={ph} />
                        )}
                      </div>
                    ))}
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
                <p className="mt-2 text-[11px] text-[#6b675f]">Mais tempo = mais capricho e espaço pra alteração. Nosso time confirma.</p>
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
                <input type="datetime-local" className={inputCls} value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} />
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
            onClick={() => enviar.mutate()}
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
