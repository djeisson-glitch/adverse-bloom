import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Trash2, Paperclip, X, CheckCircle2, CalendarClock } from "lucide-react";

/**
 * Formulário público de demandas do cliente (sem login).
 * Cada cliente tem seu link /solicitar/:slug. Ao enviar, o sistema calcula
 * quando conseguimos entregar (lê a fila do editor daquele cliente, no servidor)
 * e mostra a estimativa — com a ressalva de que o time confirma.
 */

type Entrega = { titulo: string; formato: string; duracao: string; briefing: string };
type Anexo = { nome: string; path: string; url: string };

const FORMATOS = ["16x9", "9x16", "1x1", "4x5", "Outro"];
const entregaVazia = (): Entrega => ({ titulo: "", formato: "16x9", duracao: "", briefing: "" });

export default function SolicitarDemanda() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState({ nome: "", email: "", projeto: "", prazo: "" });
  const [entregas, setEntregas] = useState<Entrega[]>([entregaVazia()]);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [hp, setHp] = useState(""); // honeypot anti-spam
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  const { data: cfg, isLoading } = useQuery({
    queryKey: ["intake-config", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("intake_config", { _slug: slug });
      if (error) throw error;
      return data as { nome: string; ativo: boolean } | null;
    },
  });

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
        _entregas: entregas.filter((e) => e.titulo.trim() || e.briefing.trim()),
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

        <div className="space-y-5">
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
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_110px_110px]">
                    <input className={inputSm} value={e.titulo} onChange={(ev) => setEntrega(i, { titulo: ev.target.value })} placeholder="Título / nome do vídeo" />
                    <select className={inputSm} value={e.formato} onChange={(ev) => setEntrega(i, { formato: ev.target.value })}>
                      {FORMATOS.map((f) => <option key={f} value={f} className="bg-[#17171a]">{f}</option>)}
                    </select>
                    <input className={inputSm} value={e.duracao} onChange={(ev) => setEntrega(i, { duracao: ev.target.value })} placeholder='Duração (ex.: 30")' />
                  </div>
                  <textarea className={`${inputSm} mt-2 min-h-[64px] w-full`} value={e.briefing} onChange={(ev) => setEntrega(i, { briefing: ev.target.value })} placeholder="Briefing: objetivo, referências, mensagem-chave, o que não pode faltar…" />
                </div>
              ))}
            </div>
          </div>

          {/* Prazo */}
          <Campo label="Prazo desejado (data e hora)">
            <input type="datetime-local" className={inputCls} value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} />
            <p className="mt-1 flex items-center gap-1 text-[11px] text-[#9A968C]"><CalendarClock className="h-3 w-3" /> A gente estima na hora se dá pra entregar nesse prazo.</p>
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
            disabled={enviando}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#E53500] text-sm font-semibold text-white transition hover:bg-[#E53500]/90 disabled:opacity-60"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enviar demanda
          </button>
          <p className="text-center text-[11px] text-[#6b675f]">Ao enviar, você recebe uma estimativa de prazo. Nosso time confirma com você em seguida.</p>
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
