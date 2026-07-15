import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ReactMarkdown from "react-markdown";

/**
 * Chat flutuante disponível em todas as telas. Ciente das tarefas DA PESSOA
 * (a função assistente-equipe monta o contexto, sem dinheiro). Histórico
 * próprio em assistente_equipe_msgs.
 */
type Msg = { role: "user" | "assistant"; content: string };

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistente-equipe`;
const SUGESTOES = ["O que eu tenho pra hoje?", "O que vence essa semana?", "Onde eu aprovo um vídeo?"];

export function AssistenteFlutuante() {
  const { user } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [carregouHist, setCarregouHist] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Carrega a última conversa quando abre pela 1ª vez.
  useEffect(() => {
    if (!aberto || carregouHist || !user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("assistente_equipe_msgs")
        .select("role, content")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(50);
      if (data) setMsgs(data as Msg[]);
      setCarregouHist(true);
    })();
  }, [aberto, carregouHist, user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, aberto]);

  const salvar = async (role: "user" | "assistant", content: string) => {
    if (!user) return;
    await (supabase as any).from("assistente_equipe_msgs").insert({ user_id: user.id, role, content });
  };

  const enviar = async (texto: string) => {
    const t = texto.trim();
    if (!t || carregando) return;
    const novas = [...msgs, { role: "user" as const, content: t }];
    setMsgs(novas);
    setInput("");
    setCarregando(true);
    salvar("user", t);

    let resposta = "";
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ messages: novas.map((m) => ({ role: m.role, content: m.content })) }),
      });
      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      setMsgs((p) => [...p, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const js = line.slice(6).trim();
          if (js === "[DONE]" || !js) continue;
          try {
            const p = JSON.parse(js);
            if (p.type === "content_block_delta" && p.delta?.text) {
              resposta += p.delta.text;
              setMsgs((prev) => {
                const c = [...prev];
                c[c.length - 1] = { role: "assistant", content: resposta };
                return c;
              });
            }
          } catch { /* json parcial */ }
        }
      }
      if (resposta) salvar("assistant", resposta);
    } catch (e: any) {
      setMsgs((p) => [...p, { role: "assistant", content: `Ops, não consegui responder agora (${e.message}). Tenta de novo?` }]);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <>
      {/* Bolha */}
      <button
        onClick={() => setAberto((v) => !v)}
        className="fixed bottom-5 right-5 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-primary p-3.5 text-primary-foreground shadow-lg shadow-primary/30 transition hover:scale-105"
        title="Assistente"
        aria-label="Abrir assistente"
      >
        {aberto ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {/* Painel */}
      {aberto && (
        <div className="fixed bottom-20 right-5 z-40 flex h-[520px] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary"><Bot className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Assistente</p>
              <p className="text-[11px] text-muted-foreground">sabe das suas tarefas e do sistema</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {msgs.length === 0 && (
              <div className="pt-4 text-center">
                <Sparkles className="mx-auto h-6 w-6 text-primary/70" />
                <p className="mt-2 text-sm text-muted-foreground">Oi! Posso te ajudar a achar as coisas e lembrar dos prazos.</p>
                <div className="mt-3 flex flex-col gap-1.5">
                  {SUGESTOES.map((s) => (
                    <button key={s} onClick={() => enviar(s)} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-foreground hover:border-primary/40">
                      {s}
                    </button>
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

          <form
            onSubmit={(e) => { e.preventDefault(); enviar(input); }}
            className="flex items-center gap-2 border-t border-border p-2.5"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte algo…"
              className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <button type="submit" disabled={carregando || !input.trim()} className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
