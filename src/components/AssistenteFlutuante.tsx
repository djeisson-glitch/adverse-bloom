import { useState, useRef, useEffect } from "react";
import { X, Send, Bot, Loader2, Sparkles, MessagesSquare, ChevronLeft } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import ReactMarkdown from "react-markdown";

/**
 * Painel flutuante em todas as telas, com duas abas:
 *  • Assistente (IA) — ciente das tarefas da pessoa, ajuda a navegar.
 *  • Conversas — as threads ativas dos projetos (comments), pra falar com o
 *    time interno sem sair da tela.
 */
type Msg = { role: "user" | "assistant"; content: string };
type Thread = { entity_type: string; entity_id: string; titulo: string; projeto: string | null; ultimo_body: string | null; ultimo_autor: string | null; ultimo_em: string; n_msgs: number };

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistente-equipe`;
const SUGESTOES = ["O que eu tenho pra hoje?", "O que vence essa semana?", "Onde eu aprovo um vídeo?"];

const quando = (iso: string) => {
  const d = new Date(iso), diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export function AssistenteFlutuante() {
  const { user } = useAuth();
  const [aberto, setAberto] = useState(false);            // bolha compacta da IA
  const [conversas, setConversas] = useState(false);      // drawer lateral das conversas
  const [thread, setThread] = useState<Thread | null>(null);

  // perfis (pra @menções e nomes) — carrega quando algo abre
  const { data: profiles = [] } = useQuery({
    queryKey: ["flut-profiles"],
    enabled: aberto || conversas,
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("id, full_name");
      return (data || []) as { id: string; full_name: string | null }[];
    },
  });

  return (
    <>
      {/* Botões fixos: Conversas (primário, mais acessado) embaixo; IA acima */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
        <button
          onClick={() => setAberto((v) => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-lg transition hover:border-primary/50"
          title="Assistente (IA)"
          aria-label="Abrir assistente de IA"
        >
          {aberto ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
        </button>
        <button
          onClick={() => setConversas(true)}
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-lg shadow-primary/30 transition hover:scale-105"
          aria-label="Abrir conversas"
        >
          <MessagesSquare className="h-5 w-5" />
          <span className="text-sm font-semibold">Conversas</span>
        </button>
      </div>

      {/* Bolha compacta: só o assistente (IA) */}
      {aberto && (
        <div className="fixed bottom-[9rem] right-5 z-40 flex h-[500px] w-[min(390px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Bot className="h-4 w-4 text-primary" /> Assistente</p>
          </div>
          <ChatIA user={user} />
        </div>
      )}

      {/* Conversas: barra lateral (altura cheia, mais larga) */}
      <Sheet open={conversas} onOpenChange={(o) => { setConversas(o); if (!o) setThread(null); }}>
        <SheetContent side="right" className="flex w-[min(540px,94vw)] flex-col gap-0 p-0 sm:max-w-none">
          {thread ? (
            <ThreadView thread={thread} profiles={profiles} onVoltar={() => setThread(null)} />
          ) : (
            <>
              <div className="border-b border-border px-4 py-3.5">
                <p className="flex items-center gap-2 text-base font-semibold text-foreground"><MessagesSquare className="h-4 w-4 text-primary" /> Conversas</p>
                <p className="text-xs text-muted-foreground">as threads ativas dos seus projetos</p>
              </div>
              <ConversasLista onAbrir={setThread} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ---------------------------------------------------------- Aba IA */
function ChatIA({ user }: { user: any }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [carregouHist, setCarregouHist] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (carregouHist || !user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("assistente_equipe_msgs").select("role, content")
        .eq("user_id", user.id).order("created_at", { ascending: true }).limit(50);
      if (data) setMsgs(data as Msg[]);
      setCarregouHist(true);
    })();
  }, [carregouHist, user]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [msgs]);

  const salvar = async (role: "user" | "assistant", content: string) => {
    if (!user) return;
    await (supabase as any).from("assistente_equipe_msgs").insert({ user_id: user.id, role, content });
  };

  const enviar = async (texto: string) => {
    const t = texto.trim();
    if (!t || carregando) return;
    const novas = [...msgs, { role: "user" as const, content: t }];
    setMsgs(novas); setInput(""); setCarregando(true); salvar("user", t);
    let resposta = "";
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string, Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ messages: novas.map((m) => ({ role: m.role, content: m.content })) }),
      });
      if (!resp.ok || !resp.body) { const e = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` })); throw new Error(e.error || `HTTP ${resp.status}`); }
      const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = "";
      setMsgs((p) => [...p, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue; const js = line.slice(6).trim(); if (js === "[DONE]" || !js) continue;
          try { const p = JSON.parse(js); if (p.type === "content_block_delta" && p.delta?.text) { resposta += p.delta.text; setMsgs((prev) => { const c = [...prev]; c[c.length - 1] = { role: "assistant", content: resposta }; return c; }); } } catch { /* parcial */ }
        }
      }
      if (resposta) salvar("assistant", resposta);
    } catch (e: any) {
      setMsgs((p) => [...p, { role: "assistant", content: `Ops, não consegui responder agora (${e.message}).` }]);
    } finally { setCarregando(false); }
  };

  return (
    <>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {msgs.length === 0 && (
          <div className="pt-4 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-primary/70" />
            <p className="mt-2 text-sm text-muted-foreground">Oi! Posso te ajudar a achar as coisas e lembrar dos prazos.</p>
            <div className="mt-3 flex flex-col gap-1.5">
              {SUGESTOES.map((s) => (
                <button key={s} onClick={() => enviar(s)} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-foreground hover:border-primary/40">{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-foreground"}`}>
              {m.role === "assistant"
                ? <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_a]:text-primary"><ReactMarkdown>{m.content || "…"}</ReactMarkdown></div>
                : m.content}
            </div>
          </div>
        ))}
        {carregando && msgs[msgs.length - 1]?.role === "user" && (
          <div className="flex justify-start"><div className="rounded-2xl bg-muted/50 px-3 py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div></div>
        )}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); enviar(input); }} className="flex items-center gap-2 border-t border-border p-2.5">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pergunte algo…" className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
        <button type="submit" disabled={carregando || !input.trim()} className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"><Send className="h-4 w-4" /></button>
      </form>
    </>
  );
}

/* -------------------------------------------------- Aba Conversas: lista */
function ConversasLista({ onAbrir }: { onAbrir: (t: Thread) => void }) {
  const { data: threads = [], isLoading } = useQuery({
    queryKey: ["conversas-recentes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("conversas_recentes", { _limite: 20 });
      if (error) throw error;
      return (data || []) as Thread[];
    },
    refetchInterval: 30000,
  });

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2">
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : threads.length === 0 ? (
        <p className="px-3 py-10 text-center text-sm text-muted-foreground">Nenhuma conversa ativa nos seus projetos ainda. Comente num entregável e ela aparece aqui.</p>
      ) : (
        <div className="space-y-1">
          {threads.map((t) => (
            <button key={`${t.entity_type}:${t.entity_id}`} onClick={() => onAbrir(t)} className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-muted/40">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-foreground">{t.titulo || "Conversa"}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{quando(t.ultimo_em)}</span>
              </div>
              {t.projeto && <span className="truncate text-[10px] text-muted-foreground/70">{t.projeto}</span>}
              {t.ultimo_body && (
                <span className="mt-0.5 truncate text-xs text-muted-foreground">
                  {t.ultimo_autor ? `${t.ultimo_autor.split(" ")[0]}: ` : ""}{t.ultimo_body}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------- Aba Conversas: thread */
function ThreadView({ thread, profiles, onVoltar }: { thread: Thread; profiles: { id: string; full_name: string | null }[]; onVoltar: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const qk = ["conv-comments", thread.entity_type, thread.entity_id];

  const { data: comments = [] } = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("comments").select("*")
        .eq("entity_type", thread.entity_type).eq("entity_id", thread.entity_id).order("created_at");
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 15000,
  });

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [comments]);

  const enviar = async () => {
    const txt = body.trim();
    if (!txt || enviando) return;
    setEnviando(true);
    const mentions = profiles.filter((p) => {
      const nome = (p.full_name || "").split(" ")[0].toLowerCase();
      return nome && txt.toLowerCase().includes(`@${nome}`);
    }).map((p) => p.id);
    const { error } = await (supabase as any).from("comments").insert({
      entity_type: thread.entity_type, entity_id: thread.entity_id, user_id: user?.id, body: txt, mentions,
    });
    setEnviando(false);
    if (!error) { setBody(""); qc.invalidateQueries({ queryKey: qk }); qc.invalidateQueries({ queryKey: ["conversas-recentes"] }); }
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-2 py-2">
        <button onClick={onVoltar} className="text-muted-foreground hover:text-foreground"><ChevronLeft className="h-5 w-5" /></button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{thread.titulo}</p>
          {thread.projeto && <p className="truncate text-[10px] text-muted-foreground">{thread.projeto}</p>}
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {comments.length === 0 ? (
          <p className="pt-6 text-center text-xs text-muted-foreground">Sem mensagens ainda.</p>
        ) : comments.map((c) => {
          const meu = c.user_id === user?.id;
          return (
            <div key={c.id} className={`flex flex-col ${meu ? "items-end" : "items-start"}`}>
              <span className="px-1 text-[10px] text-muted-foreground">{(profiles.find((p) => p.id === c.user_id)?.full_name || "?").split(" ")[0]} · {quando(c.created_at)}</span>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-sm ${meu ? "bg-primary text-primary-foreground" : "bg-muted/50 text-foreground"}`}>{c.body}</div>
            </div>
          );
        })}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); enviar(); }} className="flex items-center gap-2 border-t border-border p-2.5">
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Responder o time… (@nome menciona)" className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
        <button type="submit" disabled={enviando || !body.trim()} className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40">{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
      </form>
    </>
  );
}
