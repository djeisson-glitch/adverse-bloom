import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Check, Pencil, ArrowRight, Send, CheckCircle2, Sparkles } from "lucide-react";
import { EntregasField } from "@/components/mergulho/EntregasField";
import { CAMPOS_CLIENTE, campoRespondido, type MergulhoCampo } from "@/lib/mergulho";

/**
 * Briefing público — uma pergunta por vez (as próximas só aparecem depois).
 * Respostas preenchidas viram resumo editável. Salva sozinho e dá pra voltar
 * dias depois de onde parou. No fim, botão de Enviar.
 */
export default function BriefingPublico() {
  const { token } = useParams<{ token: string }>();
  const [dados, setDados] = useState<Record<string, any> | null>(null);
  const [passo, setPasso] = useState(0);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [enviadoView, setEnviadoView] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [iaChecado, setIaChecado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: cfg, isLoading, isError } = useQuery({
    queryKey: ["mergulho-publico", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("mergulho_publico", { _token: token });
      if (error) throw error;
      return data as { projeto: string; cliente_nome: string; enviado_em: string | null; mergulho: Record<string, any> } | null;
    },
  });

  useEffect(() => {
    if (cfg && dados === null) {
      const d = cfg.mergulho || {};
      setDados(d);
      setEnviadoView(!!cfg.enviado_em);
      // Já tem perguntas da IA salvas? então não precisa checar de novo.
      if (Array.isArray(d.ia_extras) && d.ia_extras.length > 0) setIaChecado(true);
      const primeiroVazio = CAMPOS_CLIENTE.findIndex((c) => !campoRespondido(d, c));
      setPasso(primeiroVazio === -1 ? CAMPOS_CLIENTE.length - 1 : primeiroVazio);
    }
  }, [cfg, dados]);

  const salvar = async (d: Record<string, any>) => {
    setStatus("saving");
    const { error } = await (supabase as any).rpc("mergulho_salvar", { _token: token, _dados: d });
    setStatus(error ? "idle" : "saved");
  };
  const setCampo = (key: string, val: any) => {
    setDados((prev) => {
      const novo = { ...(prev || {}), [key]: val };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => salvar(novo), 800);
      return novo;
    });
  };

  // Resposta a uma pergunta que a IA sugeriu (fica dentro de dados.ia_extras).
  const setExtra = (i: number, val: string) => {
    setDados((prev) => {
      const extras = Array.isArray(prev?.ia_extras) ? [...prev!.ia_extras] : [];
      extras[i] = { ...(extras[i] || {}), resposta: val };
      const novo = { ...(prev || {}), ia_extras: extras };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => salvar(novo), 800);
      return novo;
    });
  };

  const enviarDeVerdade = async (d: Record<string, any>) => {
    setEnviando(true);
    const { error } = await (supabase as any).rpc("mergulho_enviar", { _token: token, _dados: d });
    setEnviando(false);
    if (!error) setEnviadoView(true);
  };

  // Ao enviar pela 1ª vez, a IA (automática) sugere perguntas de complemento
  // com base no que foi preenchido. Se sugerir algo, mostramos antes de enviar.
  const enviar = async () => {
    const d = dados || {};
    if (iaChecado) return enviarDeVerdade(d);
    setEnviando(true);
    try {
      if (timer.current) clearTimeout(timer.current);
      await salvar(d); // a IA lê do banco pelo token
      const { data, error } = await (supabase as any).functions.invoke("mergulho-ia", {
        body: { token, acao: "followups" },
      });
      const perguntas: string[] = !error && Array.isArray(data?.perguntas) ? data.perguntas : [];
      if (perguntas.length > 0) {
        const extras = perguntas.map((p) => ({ pergunta: p, resposta: "" }));
        const novo = { ...d, ia_extras: extras };
        setDados(novo);
        setIaChecado(true);
        setEnviando(false);
        await salvar(novo);
        return; // mostra as perguntas; o próximo clique envia
      }
      // Sem sugestões (ou IA indisponível): envia direto.
      setIaChecado(true);
      await enviarDeVerdade(d);
    } catch {
      setIaChecado(true);
      await enviarDeVerdade(d);
    }
  };

  if (isLoading || (cfg && dados === null)) {
    return <Center><Loader2 className="h-8 w-8 animate-spin text-primary" /></Center>;
  }
  if (isError || !cfg) {
    return (
      <Center>
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">Formulário indisponível</p>
          <p className="mt-1 text-sm text-muted-foreground">O link pode estar incorreto ou desativado. Fale com a Adverse.</p>
        </div>
      </Center>
    );
  }

  const d = dados || {};
  const total = CAMPOS_CLIENTE.length;
  const respondidas = CAMPOS_CLIENTE.filter((c) => campoRespondido(d, c)).length;

  if (enviadoView) {
    return (
      <Center>
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-foreground">Briefing enviado!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Obrigado{cfg.cliente_nome ? `, ${cfg.cliente_nome}` : ""}. Nosso time já vai mergulhar no seu projeto e volta com você.
          </p>
          <button
            onClick={() => setEnviadoView(false)}
            className="mt-6 rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
          >
            Preciso ajustar algo
          </button>
        </div>
      </Center>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <header className="mb-6">
          <span className="text-lg font-extrabold tracking-tight">adverse.rec <span className="text-primary">//</span></span>
          <h1 className="mt-4 text-2xl font-bold">Briefing do projeto</h1>
          <p className="text-sm text-muted-foreground">
            {cfg.cliente_nome ? `${cfg.cliente_nome} · ` : ""}{cfg.projeto || "novo projeto"} — pode responder com calma.
          </p>
          {/* progresso */}
          <div className="mt-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(respondidas / total) * 100}%` }} />
            </div>
            <span className="text-[11px] text-muted-foreground">{respondidas}/{total}</span>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {status === "saving" ? <><Loader2 className="h-3 w-3 animate-spin" /> salvando…</> : status === "saved" ? <><Check className="h-3 w-3 text-success" /> salvo — pode voltar depois de onde parou</> : "Salva sozinho enquanto você escreve. Pode fechar e voltar outro dia."}
          </p>
        </header>

        <div className="space-y-3">
          {CAMPOS_CLIENTE.slice(0, passo + 1).map((campo, i) => {
            const ativo = i === passo || editIdx === i;
            if (!ativo) {
              return <ResumoCard key={campo.key} campo={campo} dados={d} onEdit={() => setEditIdx(i)} />;
            }
            return (
              <PerguntaCard key={campo.key} campo={campo} numero={i + 1} total={total} destaque={i === passo && editIdx === null}>
                <CampoInput campo={campo} value={d[campo.key]} onChange={(v) => setCampo(campo.key, v)} />
                {editIdx === i && (
                  <button onClick={() => setEditIdx(null)} className="mt-3 rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/70">
                    Pronto
                  </button>
                )}
              </PerguntaCard>
            );
          })}

          {/* Perguntas de complemento sugeridas pela IA (automático, sem botão) */}
          {iaChecado && Array.isArray(d.ia_extras) && d.ia_extras.length > 0 && (
            <div className="mt-2 rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" /> Só mais isso pra ficar redondo
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Umas perguntas rápidas pra gente entender melhor — responda o que quiser, ou pule e envie assim mesmo.
              </p>
              <div className="mt-3 space-y-3">
                {d.ia_extras.map((ex: any, i: number) => (
                  <div key={i}>
                    <p className="text-sm font-medium text-foreground">{ex?.pergunta}</p>
                    <textarea
                      value={ex?.resposta || ""}
                      onChange={(e) => setExtra(i, e.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                      placeholder="Escreva aqui… (opcional)"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {editIdx === null && (
            <div className="pt-1">
              {passo < total - 1 ? (
                <button
                  onClick={() => setPasso((p) => Math.min(p + 1, total - 1))}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  Próxima pergunta <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <>
                  <button
                    onClick={enviar}
                    disabled={enviando}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Enviar briefing
                  </button>
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">
                    Pode enviar mesmo sem preencher tudo — e ainda editar e reenviar depois.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CampoInput({ campo, value, onChange }: { campo: MergulhoCampo; value: any; onChange: (v: any) => void }) {
  if (campo.tipo === "entregas") {
    return <EntregasField value={Array.isArray(value) ? value : []} onChange={onChange} />;
  }
  return (
    <textarea
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      autoFocus
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
      placeholder="Escreva aqui…"
    />
  );
}

function PerguntaCard({ campo, numero, total, destaque, children }: { campo: MergulhoCampo; numero: number; total: number; destaque?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-4 ${destaque ? "border-primary/40 bg-primary/[0.03]" : "border-border/60 bg-muted/10"}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pergunta {numero} de {total}</p>
      <h2 className="mt-0.5 text-base font-semibold text-foreground">{campo.label}</h2>
      {campo.hint && <p className="mb-3 mt-1 text-xs text-muted-foreground">{campo.hint}</p>}
      {children}
    </div>
  );
}

function ResumoCard({ campo, dados, onEdit }: { campo: MergulhoCampo; dados: Record<string, any>; onEdit: () => void }) {
  const preenchido = campoRespondido(dados, campo);
  const resumo = campo.tipo === "entregas"
    ? `${(Array.isArray(dados[campo.key]) ? dados[campo.key].length : 0)} entrega(s)`
    : (dados[campo.key] || "").toString();
  return (
    <button onClick={onEdit} className="flex w-full items-start justify-between gap-3 rounded-lg border border-border/50 bg-muted/10 px-4 py-2.5 text-left hover:border-border">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{campo.label}</p>
        <p className={`truncate text-xs ${preenchido ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
          {preenchido ? resumo : "— (você pode pular)"}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-primary"><Pencil className="h-3 w-3" /> editar</span>
    </button>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-background px-6">{children}</div>;
}
